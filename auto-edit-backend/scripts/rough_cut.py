"""Step 2: remove silence from a video, or an audio-only file ("rough cut").

Detects silence directly on the ORIGINAL audio track (independent of the
transcript, so it works even if transcribe.py was skipped) and cuts those
gaps out. Also writes a cutlist JSON mapping original-timeline ranges to the
new cut timeline, so captions.py can remap word timestamps after the cut.

Works on audio-only input too (mp3/wav/m4a/...) — detected via has_video_stream(),
in which case only the audio track is trimmed/concatenated (no video filter graph).

Usage:
    python scripts/rough_cut.py my_video.mp4
    python scripts/rough_cut.py my_video.mp4 --threshold -30 --min-silence 0.5
    python scripts/rough_cut.py my_voice.mp3
    python scripts/rough_cut.py my_voice.mp3 --method vad --min-silence 0.5

--method selects the silence source: "ffmpeg" (default, today's dB-threshold
`silencedetect`, byte-identical when unspecified) or "vad" (Silero VAD via
vad_detect.py -- see that module for why it's more robust). Everything
downstream of silence detection (compute_keep_segments, cut_video/cut_audio,
build_cutlist) is generic over "a list of (start, end) intervals to remove"
and doesn't care which method produced them.
"""

import argparse
import json
import re
from pathlib import Path

import vad_detect
from common import (
    TEMP_DIR, ffprobe_duration, has_audio_stream, has_video_stream, log, resolve_input,
    run, stem_for, FFMPEG_BIN,
)

SILENCE_START_RE = re.compile(r"silence_start:\s*(-?[\d.]+)")
SILENCE_END_RE = re.compile(r"silence_end:\s*(-?[\d.]+)")


def detect_silences(video_path, threshold_db: float, min_silence_s: float) -> list:
    """Returns a list of (start, end) silence intervals in seconds."""
    cmd = [
        FFMPEG_BIN, "-i", str(video_path),
        "-af", f"silencedetect=noise={threshold_db}dB:d={min_silence_s}",
        "-f", "null", "-",
    ]
    # ffmpeg writes filter logs to stderr and exits 0 even with -f null; run() would
    # raise on nonzero, but stderr content itself is not an error here.
    import subprocess
    result = subprocess.run(cmd, capture_output=True, text=True)

    silences = []
    pending_start = None
    for line in result.stderr.splitlines():
        m = SILENCE_START_RE.search(line)
        if m:
            pending_start = float(m.group(1))
            continue
        m = SILENCE_END_RE.search(line)
        if m and pending_start is not None:
            silences.append((pending_start, float(m.group(1))))
            pending_start = None
    return silences


def compute_keep_segments(duration: float, silences: list, padding_s: float, min_keep_s: float) -> list:
    """Complement of the silence intervals, padded so word onsets/offsets aren't clipped."""
    if not silences:
        return [(0.0, duration)]

    # Shrink each silence interval by `padding_s` on both ends so we keep a little
    # buffer of quiet around speech instead of cutting flush against it.
    gaps = []
    for s, e in silences:
        gs = min(s + padding_s, e)
        ge = max(e - padding_s, gs)
        if ge > gs:
            gaps.append((gs, ge))

    keep = []
    cursor = 0.0
    for gs, ge in gaps:
        if gs > cursor:
            keep.append((cursor, gs))
        cursor = max(cursor, ge)
    if cursor < duration:
        keep.append((cursor, duration))

    return [(s, e) for s, e in keep if (e - s) >= min_keep_s]


def cut_video(video_path, keep_segments: list, out_path):
    if len(keep_segments) == 1 and keep_segments[0] == (0.0, ffprobe_duration(video_path)):
        log("no silence detected above threshold; copying source through unchanged")
        run([FFMPEG_BIN, "-y", "-i", str(video_path), "-c", "copy", str(out_path)])
        return

    filter_parts = []
    concat_inputs = []
    for i, (s, e) in enumerate(keep_segments):
        filter_parts.append(f"[0:v]trim=start={s}:end={e},setpts=PTS-STARTPTS[v{i}]")
        filter_parts.append(f"[0:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[a{i}]")
        concat_inputs.append(f"[v{i}][a{i}]")
    n = len(keep_segments)
    filter_complex = ";".join(filter_parts) + ";" + "".join(concat_inputs) + f"concat=n={n}:v=1:a=1[outv][outa]"

    cmd = [
        FFMPEG_BIN, "-y", "-i", str(video_path),
        "-filter_complex", filter_complex,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        str(out_path),
    ]
    run(cmd)


def cut_audio(audio_path, keep_segments: list, out_path):
    if len(keep_segments) == 1 and keep_segments[0] == (0.0, ffprobe_duration(audio_path)):
        log("no silence detected above threshold; copying source through unchanged")
        run([FFMPEG_BIN, "-y", "-i", str(audio_path), "-c", "copy", str(out_path)])
        return

    filter_parts = []
    concat_inputs = []
    for i, (s, e) in enumerate(keep_segments):
        filter_parts.append(f"[0:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[a{i}]")
        concat_inputs.append(f"[a{i}]")
    n = len(keep_segments)
    filter_complex = ";".join(filter_parts) + ";" + "".join(concat_inputs) + f"concat=n={n}:v=0:a=1[outa]"

    cmd = [
        FFMPEG_BIN, "-y", "-i", str(audio_path),
        "-filter_complex", filter_complex,
        "-map", "[outa]",
        str(out_path),  # codec inferred from out_path's extension (mp3->libmp3lame, wav->pcm, m4a->aac, ...)
    ]
    run(cmd)


def build_cutlist(keep_segments: list) -> dict:
    entries = []
    cut_cursor = 0.0
    for orig_start, orig_end in keep_segments:
        seg_len = orig_end - orig_start
        entries.append({
            "orig_start": orig_start,
            "orig_end": orig_end,
            "cut_start": cut_cursor,
            "cut_end": cut_cursor + seg_len,
        })
        cut_cursor += seg_len
    return {"segments": entries, "cut_duration": cut_cursor}


def run_rough_cut(video_path, threshold=-30.0, min_silence=0.5, padding=0.15, min_keep=0.1,
                   out_path=None, cutlist_path=None, method="ffmpeg"):
    """Detect silence, cut it out, and write the cutlist. Returns (out_path, cutlist_path).

    Works on video OR audio-only input — audio-only files (no real video stream) get
    their audio track trimmed/concatenated directly, skipping the video filter graph.

    method="ffmpeg" (default) uses detect_silences() below, today's exact
    behavior. method="vad" uses vad_detect.detect_silences_vad() (Silero VAD)
    instead. `threshold` is ONLY meaningful for method="ffmpeg" (it's a dB
    level); it is never forwarded to the vad path, which always uses Silero's
    own default speech-probability threshold (0.5) -- reusing a dB number
    like -30 as a 0-1 probability would make every frame register as
    "speech" (any real probability is > a negative number), so silence
    detection would silently find nothing.
    """
    stem = stem_for(video_path)
    is_video = has_video_stream(video_path)
    default_ext = Path(video_path).suffix if not is_video else ".mp4"
    out_path = out_path or (TEMP_DIR / f"{stem}_cut{default_ext}")
    cutlist_path = cutlist_path or (TEMP_DIR / f"{stem}_cutlist.json")

    duration = ffprobe_duration(video_path)

    if not has_audio_stream(video_path):
        log("no audio stream found; skipping silence detection, copying source through")
        keep_segments = [(0.0, duration)]
        run([FFMPEG_BIN, "-y", "-i", str(video_path), "-c", "copy", str(out_path)])
    else:
        if method == "vad":
            log(f"detecting silence (method=vad, min={min_silence}s)...")
            silences = vad_detect.detect_silences_vad(video_path, min_silence_s=min_silence)
        else:
            log(f"detecting silence (method=ffmpeg, threshold={threshold}dB, min={min_silence}s)...")
            silences = detect_silences(video_path, threshold, min_silence)
        log(f"found {len(silences)} silence interval(s)")

        keep_segments = compute_keep_segments(duration, silences, padding, min_keep)
        log(f"keeping {len(keep_segments)} segment(s), total kept duration "
            f"{sum(e - s for s, e in keep_segments):.2f}s of {duration:.2f}s")

        if is_video:
            cut_video(video_path, keep_segments, out_path)
        else:
            cut_audio(video_path, keep_segments, out_path)

    cutlist = build_cutlist(keep_segments)
    with open(cutlist_path, "w", encoding="utf-8") as f:
        json.dump(cutlist, f, ensure_ascii=False, indent=2)

    log(f"wrote {out_path}")
    log(f"wrote {cutlist_path}")
    return out_path, cutlist_path


def main():
    parser = argparse.ArgumentParser(description="Remove silence from a video (rough cut).")
    parser.add_argument("video", help="Filename in input/, or a path to a video file")
    parser.add_argument("--threshold", type=float, default=-30.0,
                         help="Silence threshold in dB (default: -30). Only used by "
                              "--method ffmpeg -- --method vad always uses Silero's own "
                              "default speech-probability threshold and ignores this flag.")
    parser.add_argument("--min-silence", type=float, default=0.5, help="Minimum silence duration to cut, seconds (default: 0.5)")
    parser.add_argument("--padding", type=float, default=0.15, help="Seconds of buffer kept around speech (default: 0.15)")
    parser.add_argument("--min-keep", type=float, default=0.1, help="Drop kept segments shorter than this, seconds (default: 0.1)")
    parser.add_argument("--method", choices=["ffmpeg", "vad"], default="ffmpeg",
                         help="Silence detection source: ffmpeg's silencedetect (default) or Silero VAD (vad)")
    parser.add_argument("-o", "--output", default=None, help="Output video path (default: temp/<stem>_cut.mp4)")
    parser.add_argument("--cutlist-output", default=None, help="Output cutlist JSON path (default: temp/<stem>_cutlist.json)")
    args = parser.parse_args()

    video_path = resolve_input(args.video)
    run_rough_cut(
        video_path,
        threshold=args.threshold,
        min_silence=args.min_silence,
        padding=args.padding,
        min_keep=args.min_keep,
        out_path=args.output,
        cutlist_path=args.cutlist_output,
        method=args.method,
    )


if __name__ == "__main__":
    main()
