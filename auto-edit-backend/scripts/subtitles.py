"""Export standalone subtitle files (.srt / .vtt) from an audio (or video) file's speech.

Unlike captions.py — which burns captions onto a video for the auto-editing pipeline,
remapped onto a rough-cut timeline — this is a standalone utility: point it at any
audio file (mp3/wav/m4a/...) or video, and it transcribes with WhisperX (reusing
transcribe.py) and writes a portable .srt/.vtt subtitle file at the ORIGINAL
timestamps. No video cutting is involved, so no cutlist remap applies.

Usage:
    python scripts/subtitles.py voice.mp3
    python scripts/subtitles.py voice.mp3 --formats srt vtt --max-chars 42
    python scripts/subtitles.py voice.mp3 --transcript transcripts/voice.json
"""

import argparse
import json
from pathlib import Path

from captions import flatten_words, group_into_chunks
from common import SUBTITLES_DIR, TRANSCRIPTS_DIR, log, resolve_input, stem_for
from transcribe import run_transcribe


def format_srt_time(t: float) -> str:
    t = max(t, 0.0)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = round((t - int(t)) * 1000)
    if ms >= 1000:  # rounding can carry into the next second
        ms -= 1000
        s += 1
        if s >= 60:
            s -= 60
            m += 1
            if m >= 60:
                m -= 60
                h += 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_vtt_time(t: float) -> str:
    return format_srt_time(t).replace(",", ".")


def build_srt(chunks) -> str:
    lines = []
    for i, c in enumerate(chunks, start=1):
        lines.append(str(i))
        lines.append(f"{format_srt_time(c['start'])} --> {format_srt_time(c['end'])}")
        lines.append(c["text"])
        lines.append("")
    return "\n".join(lines) + "\n"


def build_vtt(chunks) -> str:
    lines = ["WEBVTT", ""]
    for c in chunks:
        lines.append(f"{format_vtt_time(c['start'])} --> {format_vtt_time(c['end'])}")
        lines.append(c["text"])
        lines.append("")
    return "\n".join(lines) + "\n"


def run_subtitles(input_path, transcript_path=None, max_words=12, max_chars=42, max_gap=0.7,
                   formats=("srt", "vtt"), out_dir=None, **transcribe_kwargs):
    """Transcribe (if needed) and write subtitle file(s). Returns a list of output paths."""
    stem = stem_for(input_path)
    out_dir = Path(out_dir) if out_dir else SUBTITLES_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    if transcript_path is None:
        default_transcript = TRANSCRIPTS_DIR / f"{stem}.json"
        if default_transcript.exists():
            transcript_path = default_transcript
        else:
            log(f"no transcript found at {default_transcript}, transcribing '{input_path}'...")
            transcript_path = run_transcribe(input_path, **transcribe_kwargs)

    with open(transcript_path, encoding="utf-8") as f:
        transcript = json.load(f)

    words = flatten_words(transcript)
    plain_words = [{"word": w["word"].strip(), "start": w["start"], "end": w["end"]} for w in words]
    chunks = group_into_chunks(plain_words, max_words, max_chars, max_gap)
    log(f"grouped {len(plain_words)} words into {len(chunks)} subtitle cue(s)")

    out_paths = []
    if "srt" in formats:
        p = out_dir / f"{stem}.srt"
        p.write_text(build_srt(chunks), encoding="utf-8")
        log(f"wrote {p}")
        out_paths.append(p)
    if "vtt" in formats:
        p = out_dir / f"{stem}.vtt"
        p.write_text(build_vtt(chunks), encoding="utf-8")
        log(f"wrote {p}")
        out_paths.append(p)

    return out_paths


def main():
    parser = argparse.ArgumentParser(description="Export .srt/.vtt subtitles from an audio or video file's speech.")
    parser.add_argument("audio", help="Path to an audio (or video) file, or a filename in input/")
    parser.add_argument("--transcript", default=None,
                         help="Reuse an existing transcript JSON instead of re-transcribing "
                              "(default: transcripts/<stem>.json if present, else transcribe fresh)")
    parser.add_argument("--formats", nargs="+", default=["srt", "vtt"], choices=["srt", "vtt"],
                         help="Subtitle format(s) to write (default: both)")
    parser.add_argument("--max-words", type=int, default=12, help="Max words per subtitle cue (default: 12)")
    parser.add_argument("--max-chars", type=int, default=42,
                         help="Max characters per subtitle cue (default: 42, standard subtitle guideline)")
    parser.add_argument("--max-gap", type=float, default=0.7, help="Seconds of silence that forces a new cue (default: 0.7)")
    parser.add_argument("-o", "--output-dir", default=None, help="Output directory (default: subtitles/)")

    # transcribe options, only used if a transcript needs to be generated
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--language", default="ko")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()

    input_path = resolve_input(args.audio)
    transcript_path = resolve_input(args.transcript) if args.transcript else None

    run_subtitles(
        input_path,
        transcript_path=transcript_path,
        max_words=args.max_words,
        max_chars=args.max_chars,
        max_gap=args.max_gap,
        formats=args.formats,
        out_dir=args.output_dir,
        model_name=args.model,
        language=args.language,
        device=args.device,
        compute_type=args.compute_type,
        batch_size=args.batch_size,
    )


if __name__ == "__main__":
    main()
