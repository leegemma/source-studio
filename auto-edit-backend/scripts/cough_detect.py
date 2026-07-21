"""Non-speech vocal-burst detection (coughs, throat-clearing, sneezes) via
PANNs (https://github.com/qiuqiangkong/panns_inference, `panns-inference`
pip package, Cnn14 sound-event-detection checkpoint).

WhisperX never transcribes these as words, and ffmpeg's dB-threshold
`silencedetect` can't catch them either -- they're loud enough to look like
"speech" to a volume gate. This module flags them as candidates the same way
filler_detect.py flags filler words: NOT auto-cut, just surfaced for a human
to strike out in the text-edit UI if they want to.

Two independently useful pieces:

- merge_event_frames(): pure, model-free, self-testable without a model
  download -- turns a frame-level probability curve into merged event spans.
- detect_cough_events(): the actual PANNs model call, kept separate so the
  self-test never needs network access.

merge_cough_events() (used by web/app.py) is also here, not in web/app.py,
because it's pure and independently testable -- see its docstring for the
merge algorithm.

Self-test:
    ./venv/bin/python scripts/cough_detect.py
Manual smoke test against a real file (downloads the ~320 MB PANNs
checkpoint on first use, not part of the automated self-test):
    ./venv/bin/python scripts/cough_detect.py --audio input/my_clip.mp4
"""

import argparse
import os
import urllib.request
from pathlib import Path

from common import extract_mono_wav, log

# AudioSet classes we treat as "cough-like" non-speech vocal bursts. Easy to
# extend -- e.g. add "Burping, eructation" to this tuple if that turns out to
# matter in practice.
TARGET_LABELS = ("Cough", "Sneeze", "Throat clearing")

# PANNs Cnn14_DecisionLevelMax operates on 32 kHz mono audio and emits frames
# at 100 Hz (hop_size=320 samples @ sample_rate=32000 -> 320/32000 = 10ms/frame).
PANNS_SAMPLE_RATE = 32000
PANNS_FRAMES_PER_SECOND = 100

PANNS_DATA_DIR = Path.home() / "panns_data"
PANNS_LABELS_URL = "http://storage.googleapis.com/us_audioset/youtube_corpus/v1/csv/class_labels_indices.csv"
PANNS_CHECKPOINT_URL = "https://zenodo.org/record/3987831/files/Cnn14_DecisionLevelMax_mAP%3D0.385.pth?download=1"
PANNS_CHECKPOINT_MIN_BYTES = 3 * 10**8  # panns_inference's own "is this a complete download" check


def _ensure_panns_assets():
    """panns_inference downloads its label CSV (at import time!) and its ~320MB
    checkpoint (on first SoundEventDetection()) via a bare `os.system('wget ...')`
    call that silently no-ops if `wget` isn't installed -- common on a stock
    macOS machine, which only ships `curl`. Pre-fetch both with urllib (stdlib,
    no external binary dependency) so panns_inference finds them already in
    place and skips its own wget call entirely.
    """
    PANNS_DATA_DIR.mkdir(parents=True, exist_ok=True)

    labels_path = PANNS_DATA_DIR / "class_labels_indices.csv"
    if not labels_path.is_file():
        log(f"downloading AudioSet label list to {labels_path}...")
        urllib.request.urlretrieve(PANNS_LABELS_URL, labels_path)

    checkpoint_path = PANNS_DATA_DIR / "Cnn14_DecisionLevelMax.pth"
    if not checkpoint_path.is_file() or os.path.getsize(checkpoint_path) < PANNS_CHECKPOINT_MIN_BYTES:
        log(f"downloading PANNs Cnn14 sound-event-detection checkpoint (~320MB, one-time) "
            f"to {checkpoint_path} -- this can take a while...")
        urllib.request.urlretrieve(PANNS_CHECKPOINT_URL, checkpoint_path)
        log("PANNs checkpoint download complete")


def merge_event_frames(frame_times, frame_probs, threshold=0.5, min_duration=0.15, merge_gap=0.3):
    """Turn a frame-level probability curve into merged event spans.

    frame_times: list of frame center timestamps (seconds), non-decreasing.
    frame_probs: same-length list of probabilities (already the max/sum over
    the target label set for that frame).

    Frames scoring >= threshold are kept; consecutive kept frames within
    merge_gap seconds of each other (by frame_times, not frame count -- so
    this is robust to irregular frame spacing) are merged into one span.
    Spans shorter than min_duration (end - start) are dropped.

    Returns sorted (start, end) tuples.
    """
    above = [i for i in range(len(frame_times)) if frame_probs[i] >= threshold]
    if not above:
        return []

    spans = []
    span_start = above[0]
    prev = above[0]
    for i in above[1:]:
        if frame_times[i] - frame_times[prev] > merge_gap:
            spans.append((frame_times[span_start], frame_times[prev]))
            span_start = i
        prev = i
    spans.append((frame_times[span_start], frame_times[prev]))

    spans = [(s, e) for s, e in spans if (e - s) >= min_duration]
    spans.sort()
    return spans


def detect_cough_events(audio_path, min_confidence=0.5, min_duration=0.15, merge_gap=0.3):
    """Detect cough/sneeze/throat-clearing events in an audio or video file.

    Runs PANNs (Cnn14 sound-event-detection checkpoint, downloaded on first
    use -- see _ensure_panns_assets()) to get per-frame probabilities for
    TARGET_LABELS, takes the per-frame MAX across those classes, and calls
    merge_event_frames() on the result.

    Returns [{"start": float, "end": float, "label": str}, ...] sorted by
    start, where label is whichever TARGET_LABELS class had the highest peak
    probability within that merged span.
    """
    _ensure_panns_assets()

    import librosa
    import numpy as np
    from panns_inference import SoundEventDetection, labels as panns_labels

    log("loading PANNs Cnn14 sound-event-detection model...")
    sed = SoundEventDetection(checkpoint_path=None, device="cpu")

    wav_path = extract_mono_wav(audio_path, PANNS_SAMPLE_RATE, suffix="panns32k")
    audio, _ = librosa.load(str(wav_path), sr=PANNS_SAMPLE_RATE, mono=True)
    audio_batch = audio[None, :]  # (batch_size=1, samples)

    framewise_output = sed.inference(audio_batch)  # (1, time_steps, classes_num)
    frame_probs_per_class = framewise_output[0]  # (time_steps, classes_num)

    label_indices = [panns_labels.index(lbl) for lbl in TARGET_LABELS]
    target_probs = frame_probs_per_class[:, label_indices]  # (time_steps, len(TARGET_LABELS))
    max_probs = target_probs.max(axis=1)

    n_frames = frame_probs_per_class.shape[0]
    frame_times = [(i + 0.5) / PANNS_FRAMES_PER_SECOND for i in range(n_frames)]

    spans = merge_event_frames(
        frame_times, max_probs.tolist(),
        threshold=min_confidence, min_duration=min_duration, merge_gap=merge_gap,
    )

    events = []
    for start, end in spans:
        idxs = [i for i, t in enumerate(frame_times) if start <= t <= end]
        peak_per_label = target_probs[idxs].max(axis=0)
        label = TARGET_LABELS[int(np.argmax(peak_per_label))]
        events.append({"start": start, "end": end, "label": label})

    events.sort(key=lambda e: e["start"])
    return events


def merge_cough_events(words, segments, cough_events):
    """Merge synthetic cough-event entries into a transcript's word/segment
    lists, preserving the gap-free-cover invariant the web UI's
    normalizeSegments() enforces: segments[0].word_start == 0, each
    segment's word_start equals the previous segment's word_end, and the
    last segment's word_end == len(merged_words).

    words / segments: captions.flatten_words_with_segments()'s output shape
    for the ORIGINAL transcript. cough_events: detect_cough_events()'s
    output, assumed sorted by start.

    Coughs are merge-sorted into words by start time (ties go to the
    original word, so a cough exactly coincident with a word's start lands
    right after it) to build merged_words, with each cough entry becoming
    {"word": "[기침]", "start", "end", "is_event": True} -- real words never
    carry "is_event".

    A cough never creates a new segment; it always extends an existing
    segment's word_end:
    - Cough inside a segment's time range, or in the gap right after a
      segment (before the next one starts): extends that (earlier) segment.
      Multiple coughs landing in the same gap all extend the same segment.
    - Cough before the very first segment starts: prepended to the first
      segment (its word_start effectively grows to include index 0).
    - Trailing coughs after the very last word: absorbed into the last
      segment (its word_end grows to len(merged_words)) for the same reason.

    This falls out of a single formula once words/coughs are merged: for
    segment i, word_start is 0 if i == 0 else the merged-index position of
    segment i's first original word (which already naturally accounts for
    any coughs preceding it), and word_end is the merged-index position of
    segment i+1's first original word, or len(merged_words) for the last
    segment.

    Returns (merged_words, merged_segments). Zero cough_events is a no-op
    (returns words/segments back, shallow-copied).
    """
    if not cough_events:
        return list(words), [dict(seg) for seg in segments]

    merged_words = []
    orig_to_merged = [None] * len(words)

    wi, ci = 0, 0
    while wi < len(words) or ci < len(cough_events):
        take_cough = ci < len(cough_events) and (
            wi >= len(words) or cough_events[ci]["start"] < words[wi]["start"]
        )
        if take_cough:
            ev = cough_events[ci]
            merged_words.append({"word": "[기침]", "start": ev["start"], "end": ev["end"], "is_event": True})
            ci += 1
        else:
            orig_to_merged[wi] = len(merged_words)
            merged_words.append(words[wi])
            wi += 1

    if not segments:
        # No original words/segments at all (e.g. a clip that's pure cough,
        # no detected speech) -- synthesize one segment spanning everything
        # so the gap-free-cover invariant still holds.
        if not merged_words:
            return merged_words, []
        merged_segments = [{
            "start": merged_words[0]["start"],
            "end": merged_words[-1]["end"],
            "word_start": 0,
            "word_end": len(merged_words),
        }]
        return merged_words, merged_segments

    raw_starts = [orig_to_merged[seg["word_start"]] for seg in segments]

    merged_segments = []
    for i, seg in enumerate(segments):
        word_start = 0 if i == 0 else raw_starts[i]
        word_end = raw_starts[i + 1] if i + 1 < len(segments) else len(merged_words)
        merged_segments.append({
            "start": seg["start"],
            "end": seg["end"],
            "word_start": word_start,
            "word_end": word_end,
        })

    return merged_words, merged_segments


def _self_test_merge_event_frames():
    print("--- merge_event_frames ---")
    cases = [
        ("empty input",
         [], [], {},
         []),
        ("all frames below threshold",
         [0.0, 0.1, 0.2, 0.3, 0.4], [0.1, 0.2, 0.1, 0.3, 0.2], {},
         []),
        ("one long contiguous span",
         [0.0, 0.1, 0.2, 0.3, 0.4, 0.5], [0.9, 0.8, 0.95, 0.7, 0.85, 0.9], {},
         [(0.0, 0.5)]),
        ("two spans close enough to merge (gap 0.25 < default 0.3 merge_gap)",
         [0.0, 0.1, 0.2, 0.45, 0.55, 0.65], [0.9, 0.9, 0.9, 0.9, 0.9, 0.9], {},
         [(0.0, 0.65)]),
        ("two spans far enough to stay separate (gap 0.4 > default 0.3 merge_gap)",
         [0.0, 0.1, 0.2, 0.6, 0.7, 0.8], [0.9, 0.9, 0.9, 0.9, 0.9, 0.9], {},
         [(0.0, 0.2), (0.6, 0.8)]),
        ("merge_gap boundary: exactly merge_gap apart merges (inclusive)",
         [0.0, 0.2], [0.9, 0.9], {"merge_gap": 0.2},
         [(0.0, 0.2)]),
        ("merge_gap boundary: just over merge_gap stays separate",
         [0.0, 0.21], [0.9, 0.9], {"merge_gap": 0.2, "min_duration": 0.0},
         [(0.0, 0.0), (0.21, 0.21)]),
        ("short span below min_duration is dropped, real span kept",
         [0.0, 0.05, 1.0, 1.1, 1.2, 1.3], [0.9, 0.9, 0.9, 0.9, 0.9, 0.9], {},
         # first span: 0.0-0.05 (duration 0.05 < default min_duration 0.15) -> dropped
         # second span: 1.0-1.3 (duration 0.3 >= 0.15) -> kept
         [(1.0, 1.3)]),
        ("isolated single-frame blip dropped (zero duration < min_duration)",
         [0.0, 1.0, 2.0], [0.9, 0.1, 0.9], {},
         []),
        ("custom threshold: only frames >= threshold count",
         [0.0, 0.1, 0.2, 0.3], [0.4, 0.6, 0.7, 0.5], {"threshold": 0.6, "min_duration": 0.05},
         [(0.1, 0.2)]),
        ("frame exactly at threshold counts as above (>=)",
         [0.0, 0.1, 0.2], [0.5, 0.5, 0.1], {"threshold": 0.5, "min_duration": 0.05},
         [(0.0, 0.1)]),
        ("custom min_duration keeps a short span",
         [0.0, 0.05], [0.9, 0.9], {"min_duration": 0.04},
         [(0.0, 0.05)]),
    ]

    failed = 0
    for name, frame_times, frame_probs, kwargs, expected in cases:
        got = merge_event_frames(frame_times, frame_probs, **kwargs)
        ok = got == expected
        print(f"{'PASS' if ok else 'FAIL'}: {name}")
        if not ok:
            failed += 1
            print(f"      expected: {expected}")
            print(f"      got:      {got}")

    print(f"{len(cases) - failed}/{len(cases)} case(s) passed")
    return failed


def _self_test_merge_cough_events():
    print("--- merge_cough_events ---")

    def w(word, start, end):
        return {"word": word, "start": start, "end": end}

    def seg(start, end, word_start, word_end):
        return {"start": start, "end": end, "word_start": word_start, "word_end": word_end}

    def ev(start, end, label="Cough"):
        return {"start": start, "end": end, "label": label}

    def check_cover(merged_words, merged_segments):
        """The exact invariant normalizeSegments() enforces client-side."""
        if not merged_segments:
            return not merged_words
        expected = 0
        for s in merged_segments:
            if s["word_start"] != expected or s["word_end"] <= s["word_start"]:
                return False
            expected = s["word_end"]
        return expected == len(merged_words)

    words = [w("안녕", 0.0, 0.5), w("하세요", 0.5, 1.0), w("반갑", 1.0, 1.5),
             w("습니다", 1.5, 2.0), w("네", 3.0, 3.3), w("맞아요", 3.3, 3.8)]
    segments = [seg(0.0, 2.0, 0, 4), seg(3.0, 3.8, 4, 6)]

    cases = [
        ("zero coughs is a no-op",
         words, segments, [],
         words, segments),

        ("cough inside a segment's time range (between word 반갑 and 습니다)",
         words, segments, [ev(1.2, 1.3)],
         [w("안녕", 0.0, 0.5), w("하세요", 0.5, 1.0), w("반갑", 1.0, 1.5),
          {"word": "[기침]", "start": 1.2, "end": 1.3, "is_event": True},
          w("습니다", 1.5, 2.0), w("네", 3.0, 3.3), w("맞아요", 3.3, 3.8)],
         [seg(0.0, 2.0, 0, 5), seg(3.0, 3.8, 5, 7)]),

        ("cough between two segments (in the silence gap) attaches to the earlier one",
         words, segments, [ev(2.3, 2.5)],
         [w("안녕", 0.0, 0.5), w("하세요", 0.5, 1.0), w("반갑", 1.0, 1.5), w("습니다", 1.5, 2.0),
          {"word": "[기침]", "start": 2.3, "end": 2.5, "is_event": True}, w("네", 3.0, 3.3), w("맞아요", 3.3, 3.8)],
         [seg(0.0, 2.0, 0, 5), seg(3.0, 3.8, 5, 7)]),

        ("cough before the very first segment prepends to it",
         words, segments, [ev(-0.5, -0.2)],
         [{"word": "[기침]", "start": -0.5, "end": -0.2, "is_event": True}, w("안녕", 0.0, 0.5), w("하세요", 0.5, 1.0),
          w("반갑", 1.0, 1.5), w("습니다", 1.5, 2.0), w("네", 3.0, 3.3), w("맞아요", 3.3, 3.8)],
         [seg(0.0, 2.0, 0, 5), seg(3.0, 3.8, 5, 7)]),

        ("multiple coughs in the same gap all attach to the same (earlier) segment",
         words, segments, [ev(2.1, 2.2), ev(2.4, 2.5), ev(2.6, 2.7)],
         [w("안녕", 0.0, 0.5), w("하세요", 0.5, 1.0), w("반갑", 1.0, 1.5), w("습니다", 1.5, 2.0),
          {"word": "[기침]", "start": 2.1, "end": 2.2, "is_event": True},
          {"word": "[기침]", "start": 2.4, "end": 2.5, "is_event": True},
          {"word": "[기침]", "start": 2.6, "end": 2.7, "is_event": True},
          w("네", 3.0, 3.3), w("맞아요", 3.3, 3.8)],
         [seg(0.0, 2.0, 0, 7), seg(3.0, 3.8, 7, 9)]),

        ("cough after the very last word attaches to the last segment",
         words, segments, [ev(4.0, 4.1)],
         [w("안녕", 0.0, 0.5), w("하세요", 0.5, 1.0), w("반갑", 1.0, 1.5), w("습니다", 1.5, 2.0),
          w("네", 3.0, 3.3), w("맞아요", 3.3, 3.8), {"word": "[기침]", "start": 4.0, "end": 4.1, "is_event": True}],
         [seg(0.0, 2.0, 0, 4), seg(3.0, 3.8, 4, 7)]),

        ("no speech at all (pure cough): synthesizes one covering segment",
         [], [], [ev(0.5, 0.8)],
         [{"word": "[기침]", "start": 0.5, "end": 0.8, "is_event": True}],
         [{"start": 0.5, "end": 0.8, "word_start": 0, "word_end": 1}]),
    ]

    failed = 0
    for name, in_words, in_segments, in_events, exp_words, exp_segments in cases:
        got_words, got_segments = merge_cough_events(in_words, in_segments, in_events)
        ok = got_words == exp_words and got_segments == exp_segments and check_cover(got_words, got_segments)
        print(f"{'PASS' if ok else 'FAIL'}: {name}")
        if not ok:
            failed += 1
            print(f"      expected words:    {exp_words}")
            print(f"      got words:         {got_words}")
            print(f"      expected segments: {exp_segments}")
            print(f"      got segments:      {got_segments}")
            print(f"      cover valid:       {check_cover(got_words, got_segments)}")

    print(f"{len(cases) - failed}/{len(cases)} case(s) passed")
    return failed


def _self_test():
    failed = 0
    failed += _self_test_merge_event_frames()
    failed += _self_test_merge_cough_events()
    assert failed == 0, f"{failed} self-test case(s) failed"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Cough/sneeze/throat-clearing detection self-test, or a manual smoke test against a real file.",
    )
    parser.add_argument("--audio", default=None,
                         help="Path to an audio/video file: run the real PANNs-backed detect_cough_events() "
                              "against it instead of the self-test (downloads the model on first use).")
    args = parser.parse_args()

    if args.audio:
        for event in detect_cough_events(args.audio):
            print(event)
    else:
        _self_test()
