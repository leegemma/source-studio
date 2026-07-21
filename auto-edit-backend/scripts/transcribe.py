"""Step 1: extract word-level timestamps from a video using WhisperX.

Usage:
    python scripts/transcribe.py my_video.mp4
    python scripts/transcribe.py my_video.mp4 --model medium --language ko

Writes transcripts/<stem>.json with segment + word-level timestamps
(relative to the ORIGINAL, uncut input video).
"""

import argparse
import json

from common import TRANSCRIPTS_DIR, ffprobe_duration, log, resolve_input, stem_for


def transcribe(video_path, model_name="large-v3", language="ko", device="cpu",
                compute_type="int8", batch_size=8):
    import whisperx

    log(f"loading audio: {video_path}")
    audio = whisperx.load_audio(str(video_path))

    log(f"loading whisper model '{model_name}' (device={device}, compute_type={compute_type})")
    model = whisperx.load_model(
        model_name, device, compute_type=compute_type,
        language=language if language != "auto" else None,
    )

    log("transcribing...")
    result = model.transcribe(audio, batch_size=batch_size)
    detected_language = result["language"]
    log(f"transcribed language={detected_language}, {len(result['segments'])} segments")

    log("loading alignment model for word-level timestamps...")
    model_a, metadata = whisperx.load_align_model(language_code=detected_language, device=device)

    log("aligning...")
    aligned = whisperx.align(
        result["segments"], model_a, metadata, audio, device,
        return_char_alignments=False,
    )

    segments = []
    for seg in aligned["segments"]:
        words = [
            {
                "word": w["word"],
                "start": w.get("start"),
                "end": w.get("end"),
                "score": w.get("score"),
            }
            for w in seg.get("words", [])
            if "start" in w and "end" in w
        ]
        segments.append({
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"].strip(),
            "words": words,
        })

    return {
        "source": str(video_path),
        "language": detected_language,
        "duration": ffprobe_duration(video_path),
        "segments": segments,
    }


def run_transcribe(video_path, output_path=None, **kwargs):
    """Transcribe and write the JSON to disk. Returns the output path."""
    out_path = output_path or (TRANSCRIPTS_DIR / f"{stem_for(video_path)}.json")
    data = transcribe(video_path, **kwargs)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log(f"wrote {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Transcribe a video with word-level timestamps (WhisperX).")
    parser.add_argument("video", help="Filename in input/, or a path to a video file")
    parser.add_argument("--model", default="large-v3", help="Whisper model size/name (default: large-v3)")
    parser.add_argument("--language", default="ko", help="Language code, or 'auto' to detect (default: ko)")
    parser.add_argument("--device", default="cpu", help="cpu or cuda (default: cpu; macOS has no MPS support in ctranslate2)")
    parser.add_argument("--compute-type", default="int8", help="int8, float16, or float32 (default: int8)")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("-o", "--output", default=None, help="Output JSON path (default: transcripts/<stem>.json)")
    args = parser.parse_args()

    video_path = resolve_input(args.video)
    run_transcribe(
        video_path,
        output_path=args.output,
        model_name=args.model,
        language=args.language,
        device=args.device,
        compute_type=args.compute_type,
        batch_size=args.batch_size,
    )


if __name__ == "__main__":
    main()
