"""Run the full pipeline: transcribe -> rough_cut -> captions -> bgm.

Usage:
    python scripts/pipeline.py my_video.mp4
    python scripts/pipeline.py                       # process every file in input/
    python scripts/pipeline.py my_video.mp4 --bgm music/upbeat.mp3
    python scripts/pipeline.py my_video.mp4 --skip-captions --skip-bgm
"""

import argparse

import bgm as bgm_mod
import captions as captions_mod
import rough_cut as roughcut_mod
import transcribe as transcribe_mod
from common import FFMPEG_BIN, INPUT_DIR, log, resolve_input, run, stem_for

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}

# Rough relative cost of each phase, used to turn "which phases are enabled" into a
# 0..1 progress fraction. transcribe (WhisperX) usually dominates wall-clock time.
PHASE_WEIGHTS = {"transcribe": 0.5, "rough_cut": 0.2, "captions": 0.2, "bgm": 0.1}


def process_one(video_path, args, on_progress=None):
    """on_progress(fraction: float), called after each enabled phase completes."""
    stem = stem_for(video_path)
    log(f"===== {stem} =====")

    enabled = {
        "transcribe": not args.skip_transcribe,
        "rough_cut": not args.skip_rough_cut,
        "captions": not args.skip_captions,
        "bgm": not args.skip_bgm,
    }
    total_weight = sum(w for k, w in PHASE_WEIGHTS.items() if enabled[k]) or 1.0
    done_weight = 0.0

    def advance(phase_key):
        nonlocal done_weight
        if enabled[phase_key]:
            done_weight += PHASE_WEIGHTS[phase_key]
        if on_progress:
            on_progress(min(done_weight / total_weight, 1.0))

    if args.skip_transcribe:
        transcript_path = transcribe_mod.TRANSCRIPTS_DIR / f"{stem}.json"
        if not args.skip_captions and not transcript_path.exists():
            # only needed if captions will actually consume it
            raise FileNotFoundError(f"--skip-transcribe given but {transcript_path} doesn't exist")
        log(f"skipping transcribe{'' if transcript_path.exists() else ' (no existing transcript either)'}")
    else:
        transcript_path = transcribe_mod.run_transcribe(
            video_path,
            model_name=args.model,
            language=args.language,
            device=args.device,
            compute_type=args.compute_type,
            batch_size=args.batch_size,
        )
    advance("transcribe")

    if args.skip_rough_cut:
        cut_video_path = video_path
        log("skipping rough cut")
    else:
        cut_video_path, _ = roughcut_mod.run_rough_cut(
            video_path,
            threshold=args.silence_threshold,
            min_silence=args.min_silence,
            padding=args.padding,
            min_keep=args.min_keep,
            method=getattr(args, "method", "ffmpeg"),
        )
    advance("rough_cut")

    if args.skip_captions:
        captioned_path = cut_video_path
        log("skipping captions")
    else:
        captioned_path = captions_mod.run_captions(
            video_path,
            transcript_path=transcript_path,
            source_video=cut_video_path,
            max_words=args.max_words,
            max_chars=args.max_chars,
            max_gap=args.max_gap,
            font=args.font,
            fontsize=args.fontsize,
            margin_v=args.margin_v,
        )
    advance("captions")

    if args.skip_bgm:
        log("skipping bgm")
        final_path = bgm_mod.OUTPUT_DIR / f"{stem}_final.mp4"
        run([FFMPEG_BIN, "-y", "-i", str(captioned_path), "-c", "copy", str(final_path)])
    else:
        final_path = bgm_mod.run_bgm(
            video_path,
            source_video=captioned_path,
            bgm=args.bgm,
            bgm_volume=args.bgm_volume,
            duck=not args.no_duck,
            duck_threshold=args.duck_threshold,
            duck_ratio=args.duck_ratio,
        )
    advance("bgm")

    log(f"done: {final_path}")
    return final_path


def main():
    parser = argparse.ArgumentParser(description="Run the full auto-editing pipeline on one or all input videos.")
    parser.add_argument("video", nargs="?", default=None,
                         help="Filename in input/, or a path to a video file. "
                              "Omit to process every video in input/.")

    parser.add_argument("--skip-transcribe", action="store_true")
    parser.add_argument("--skip-rough-cut", action="store_true")
    parser.add_argument("--skip-captions", action="store_true")
    parser.add_argument("--skip-bgm", action="store_true")

    # transcribe options
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--language", default="ko")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--batch-size", type=int, default=8)

    # rough_cut options
    parser.add_argument("--silence-threshold", type=float, default=-30.0)
    parser.add_argument("--min-silence", type=float, default=0.5)
    parser.add_argument("--padding", type=float, default=0.15)
    parser.add_argument("--min-keep", type=float, default=0.1)
    parser.add_argument("--method", choices=["ffmpeg", "vad"], default="ffmpeg",
                         help="Silence detection source for rough_cut: ffmpeg's silencedetect (default) or Silero VAD (vad)")

    # captions options
    parser.add_argument("--max-words", type=int, default=6)
    parser.add_argument("--max-chars", type=int, default=None,
                         help="Max characters per caption chunk (default: auto-computed from video width/fontsize)")
    parser.add_argument("--max-gap", type=float, default=0.7)
    parser.add_argument("--font", default="Apple SD Gothic Neo")
    parser.add_argument("--fontsize", type=int, default=64)
    parser.add_argument("--margin-v", type=int, default=120)

    # bgm options
    parser.add_argument("--bgm", default=None, help="BGM file path (default: first file found in music/)")
    parser.add_argument("--bgm-volume", type=float, default=-20.0)
    parser.add_argument("--no-duck", action="store_true")
    parser.add_argument("--duck-threshold", type=float, default=0.05)
    parser.add_argument("--duck-ratio", type=float, default=8.0)

    args = parser.parse_args()
    if args.bgm:
        args.bgm = resolve_input(args.bgm)

    if args.video:
        videos = [resolve_input(args.video)]
    else:
        videos = sorted(p for p in INPUT_DIR.iterdir() if p.suffix.lower() in VIDEO_EXTS)
        if not videos:
            raise FileNotFoundError(f"No video given and no video files found in {INPUT_DIR}")
        log(f"no video given; processing {len(videos)} file(s) from {INPUT_DIR}")

    for video_path in videos:
        process_one(video_path, args)


if __name__ == "__main__":
    main()
