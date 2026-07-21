"""Step 4: mix a background music track under the video's own audio.

Loops/trims the BGM to the video's duration and ducks it under the speech
track via ffmpeg's sidechaincompress filter (BGM quiets down automatically
while there's speech, recovers in gaps) instead of a single fixed volume.

Usage:
    python scripts/bgm.py my_video.mp4 --bgm music/upbeat.mp3
    python scripts/bgm.py my_video.mp4 --bgm music/upbeat.mp3 --no-duck --bgm-volume -22
"""

import argparse

from common import FFMPEG_BIN, MUSIC_DIR, OUTPUT_DIR, TEMP_DIR, ffprobe_duration, has_audio_stream, log, resolve_input, run, stem_for


def pick_default_bgm():
    candidates = sorted(
        p for p in MUSIC_DIR.iterdir()
        if p.suffix.lower() in (".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg")
    )
    if not candidates:
        raise FileNotFoundError(f"No BGM file given and none found in {MUSIC_DIR}")
    return candidates[0]


def mix(video_path, bgm_path, out_path, bgm_volume_db, duck, duck_threshold, duck_ratio):
    duration = ffprobe_duration(video_path)
    video_has_audio = has_audio_stream(video_path)

    bgm_chain = f"[1:a]aloop=loop=-1:size=2e9,atrim=0:{duration},asetpts=N/SR/TB,volume={bgm_volume_db}dB[bgmv]"

    if not video_has_audio:
        log("video has no audio track; using BGM as the only audio")
        filter_complex = bgm_chain + "[aout]"
    elif duck:
        filter_complex = (
            f"{bgm_chain};"
            f"[bgmv][0:a]sidechaincompress=threshold={duck_threshold}:ratio={duck_ratio}:"
            f"attack=20:release=400:makeup=1[bgmduck];"
            f"[0:a][bgmduck]amix=inputs=2:duration=first:normalize=0[aout]"
        )
    else:
        filter_complex = f"{bgm_chain};[0:a][bgmv]amix=inputs=2:duration=first:normalize=0[aout]"

    cmd = [
        FFMPEG_BIN, "-y",
        "-i", str(video_path),
        "-stream_loop", "-1", "-i", str(bgm_path),
        "-filter_complex", filter_complex,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out_path),
    ]
    run(cmd)


def run_bgm(input_video, source_video=None, bgm=None, bgm_volume=-20.0, duck=True,
            duck_threshold=0.05, duck_ratio=8.0, out_path=None):
    """Resolve defaults and mix BGM into the video. Returns out_path."""
    stem = stem_for(input_video)

    if source_video is None:
        captioned = TEMP_DIR / f"{stem}_captioned.mp4"
        cut = TEMP_DIR / f"{stem}_cut.mp4"
        source_video = captioned if captioned.exists() else (cut if cut.exists() else input_video)

    bgm_path = bgm if bgm else pick_default_bgm()
    out_path = out_path or (OUTPUT_DIR / f"{stem}_final.mp4")

    log(f"mixing BGM '{bgm_path.name}' into '{source_video.name}' (duck={duck})")
    mix(source_video, bgm_path, out_path, bgm_volume, duck, duck_threshold, duck_ratio)
    log(f"wrote {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Mix background music under a video's audio.")
    parser.add_argument("video", help="Filename in input/ or temp/, or a path to a video file "
                                       "(used to derive the output filename)")
    parser.add_argument("--source-video", default=None,
                         help="Video to mix BGM onto (default: temp/<stem>_captioned.mp4, "
                              "falling back to temp/<stem>_cut.mp4, then the input video itself)")
    parser.add_argument("--bgm", default=None, help="BGM file path (default: first file found in music/)")
    parser.add_argument("--bgm-volume", type=float, default=-20.0, help="BGM gain in dB before mixing (default: -20)")
    parser.add_argument("--no-duck", action="store_true", help="Disable sidechain ducking; use a flat BGM volume instead")
    parser.add_argument("--duck-threshold", type=float, default=0.05, help="Sidechain compressor threshold (default: 0.05)")
    parser.add_argument("--duck-ratio", type=float, default=8.0, help="Sidechain compressor ratio (default: 8)")
    parser.add_argument("-o", "--output", default=None, help="Output video path (default: output/<stem>_final.mp4)")
    args = parser.parse_args()

    input_video = resolve_input(args.video)
    source_video = resolve_input(args.source_video) if args.source_video else None
    bgm_path = resolve_input(args.bgm) if args.bgm else None

    run_bgm(
        input_video,
        source_video=source_video,
        bgm=bgm_path,
        bgm_volume=args.bgm_volume,
        duck=not args.no_duck,
        duck_threshold=args.duck_threshold,
        duck_ratio=args.duck_ratio,
        out_path=args.output,
    )


if __name__ == "__main__":
    main()
