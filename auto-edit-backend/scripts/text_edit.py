"""Text-based editing: cut audio/video and regenerate an .srt from a
transcript the user has edited by marking individual words to keep or drop.

The web UI shows the WhisperX word list as clickable tokens; whatever the
user leaves un-struck is "kept". This module turns that keep/drop list back
into a cut media file plus a matching subtitle file:

- The runs of dropped words are merged into (start, end) spans and handed to
  rough_cut.compute_keep_segments() exactly as if they were silence
  intervals -- that's all a "thing to cut out" is, whether ffmpeg's
  silencedetect found it or a person clicked it.
- rough_cut.cut_video()/cut_audio() then cut those segments out, and
  build_cutlist() records the orig->cut timeline mapping.
- captions.build_remapper() remaps the kept words' timestamps onto the new
  cut timeline (same mechanism captions.py uses after a silence-based rough
  cut), and subtitles.build_srt() writes them out as an .srt.

Usage (library only -- "keep" flags come from a person editing text in the
browser, not a CLI flag):
    from text_edit import run_text_edit
    media_path, srt_path = run_text_edit(input_path, transcript_path, keep_flags)
"""

import json
from pathlib import Path

from captions import build_remapper, flatten_words, group_into_chunks
from common import (
    OUTPUT_DIR, SUBTITLES_DIR, TEMP_DIR, ffprobe_duration, has_video_stream, log, stem_for,
)
from rough_cut import build_cutlist, compute_keep_segments, cut_audio, cut_video
from subtitles import build_srt

# Small buffer expanded into a dropped word's span so alignment jitter at
# word boundaries doesn't clip the tail/onset of a word the user chose to
# keep. Much smaller than rough_cut's silence padding (0.15s default) since
# word-to-word gaps are tight, not a real pause.
DEFAULT_PADDING_S = 0.06
# Never drop a deliberately-kept run for being "too short" -- unlike
# rough_cut's silence min_keep (which filters out spurious noise blips), a
# single short kept word here was an explicit choice.
DEFAULT_MIN_KEEP_S = 0.0


def merge_removed_intervals(words, keep_flags):
    """Merge consecutive dropped words into (start, end) spans -- the same
    shape rough_cut.compute_keep_segments() expects for silence intervals."""
    intervals = []
    cur_start = None
    cur_end = None
    for w, keep in zip(words, keep_flags):
        if keep:
            if cur_start is not None:
                intervals.append((cur_start, cur_end))
                cur_start = cur_end = None
        else:
            if cur_start is None:
                cur_start = w["start"]
            cur_end = w["end"]
    if cur_start is not None:
        intervals.append((cur_start, cur_end))
    return intervals


def run_text_edit(input_path, transcript_path, keep_flags, padding=DEFAULT_PADDING_S,
                   min_keep=DEFAULT_MIN_KEEP_S, max_words=12, max_chars=42, max_gap=0.7,
                   out_dir=None, srt_dir=None):
    """Cut input_path down to the kept words and write a matching .srt.

    keep_flags must be the same length and order as flatten_words(transcript)
    (i.e. the word list the browser was shown): True keeps that word's
    audio, False cuts it out. Returns (media_out_path, srt_out_path).
    """
    stem = stem_for(input_path)
    out_dir = Path(out_dir) if out_dir else OUTPUT_DIR
    srt_dir = Path(srt_dir) if srt_dir else SUBTITLES_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    srt_dir.mkdir(parents=True, exist_ok=True)

    with open(transcript_path, encoding="utf-8") as f:
        transcript = json.load(f)

    words = flatten_words(transcript)
    if len(words) != len(keep_flags):
        raise ValueError(f"keep_flags length ({len(keep_flags)}) != transcript word count ({len(words)})")

    duration = ffprobe_duration(input_path)
    removed = merge_removed_intervals(words, keep_flags)
    keep_segments = compute_keep_segments(duration, removed, padding, min_keep)
    kept_word_count = sum(1 for k in keep_flags if k)
    log(f"{kept_word_count}/{len(keep_flags)} word(s) kept -> {len(keep_segments)} segment(s)")

    is_video = has_video_stream(input_path)
    default_ext = Path(input_path).suffix if not is_video else ".mp4"
    media_out = out_dir / f"{stem}_edited{default_ext}"

    if is_video:
        cut_video(input_path, keep_segments, media_out)
    else:
        cut_audio(input_path, keep_segments, media_out)

    cutlist = build_cutlist(keep_segments)
    cutlist_path = TEMP_DIR / f"{stem}_edit_cutlist.json"
    with open(cutlist_path, "w", encoding="utf-8") as f:
        json.dump(cutlist, f, ensure_ascii=False, indent=2)

    remap = build_remapper(cutlist, duration)
    remapped = []
    for w, keep in zip(words, keep_flags):
        if not keep:
            continue
        cs, ce = remap(w["start"]), remap(w["end"])
        if cs is None or ce is None or ce <= cs:
            continue
        remapped.append({"word": w["word"].strip(), "start": cs, "end": ce})

    chunks = group_into_chunks(remapped, max_words, max_chars, max_gap)
    log(f"grouped {len(remapped)} kept word(s) into {len(chunks)} subtitle cue(s)")

    srt_out = srt_dir / f"{stem}_edited.srt"
    srt_out.write_text(build_srt(chunks), encoding="utf-8")

    log(f"wrote {media_out}")
    log(f"wrote {srt_out}")
    return media_out, srt_out
