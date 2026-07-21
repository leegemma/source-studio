"""Voice sound-quality enhancement: denoise -> rumble highpass -> loudness normalize.

Pipeline order matters:
1. Denoise FIRST (DeepFilterNet) -- so the loudness measurement/target in step 3
   sees the CLEANED signal, not noise-inflated levels.
2. Light ffmpeg highpass (~80Hz default) -- cuts sub-audible handling noise / AC
   hum below typical voice fundamentals without touching the voice itself.
3. ffmpeg loudnorm (EBU R128) LAST -- measures and normalizes the final,
   already-cleaned signal. Single-pass (no two-pass measure+apply dance) --
   standard/sufficient quality for this use case and keeps the code simple.

Denoising uses the `deepfilternet` pip package (PyTorch-based, so it reuses
whisperx's already-installed torch -- same "no separate framework" reasoning
as silero-vad/panns-inference elsewhere in this pipeline). Its model-download
path (df.utils.download_file(), called from enhance.maybe_download_model())
uses the `requests` library, NOT a bare `os.system('wget ...')` shell-out --
unlike panns_inference (see cough_detect.py's _ensure_panns_assets() docstring
for that story), so no urllib pre-fetch workaround is needed here; it just
works on a curl-only machine. Verified empirically (real inference run against
a real file, not just import-time inspection) -- see this module's CLI.

DeepFilterNet operates at its own fixed sample rate (48kHz for the default
DeepFilterNet3 model, read from `df_state.sr()` rather than hardcoded).
extract_mono_wav() (common.py) is used to get a guaranteed-decodable mono WAV
at that rate first -- same "always let ffmpeg do the format conversion"
pattern vad_detect.py / cough_detect.py use before feeding a model.

Usage:
    python scripts/enhance_audio.py voice.mp3
    python scripts/enhance_audio.py voice.mp3 --no-denoise --target-lufs -18 --highpass 100
    python scripts/enhance_audio.py voice.mp3 -o output/voice_clean.wav
"""

import argparse
from pathlib import Path

from common import FFMPEG_BIN, OUTPUT_DIR, TEMP_DIR, extract_mono_wav, log, resolve_input, run, stem_for


def _denoise(audio_path, stem: str) -> Path:
    """Run DeepFilterNet denoising, returns the path to a denoised mono WAV in TEMP_DIR."""
    from df.enhance import enhance, init_df, load_audio, save_audio

    log("loading DeepFilterNet model (downloads to ~/Library/Caches/DeepFilterNet on first use)...")
    model, df_state, _ = init_df()
    sr = df_state.sr()

    mono_wav = extract_mono_wav(audio_path, sr, suffix="dfn")
    audio, _ = load_audio(str(mono_wav), sr=sr)

    log("denoising...")
    enhanced = enhance(model, df_state, audio)

    denoised_path = TEMP_DIR / f"{stem}_denoised.wav"
    save_audio(str(denoised_path), enhanced, sr=sr)
    return denoised_path


def enhance_voice(audio_path, out_path=None, denoise=True,
                   target_lufs=-16.0, highpass_hz=80.0) -> Path:
    """Denoise (DeepFilterNet) -> high-pass rumble cut -> loudness normalize
    (ffmpeg loudnorm, EBU R128). Returns the output path (WAV by default --
    out_path's suffix drives the actual encoding, same pattern as
    rough_cut.py's cut_audio: codec inferred from extension).
    """
    audio_path = Path(audio_path)
    stem = stem_for(audio_path)
    out_path = Path(out_path) if out_path else (OUTPUT_DIR / f"{stem}_enhanced.wav")

    source = _denoise(audio_path, stem) if denoise else audio_path

    log(f"applying highpass={highpass_hz}Hz + loudnorm (I={target_lufs} LUFS, TP=-1.5, LRA=11)...")
    run([
        FFMPEG_BIN, "-y", "-i", str(source),
        # aformat=fltp FIRST -- forces the whole filter chain (including
        # highpass) to run in floating point. Without it, ffmpeg keeps
        # processing in the source's own s16 fixed-point format up until
        # loudnorm (the first filter that mandates float) converts it, and
        # the highpass biquad's transient overshoot genuinely clips at s16
        # precision -- verified empirically (88 "Channel 0 clipping" events
        # on a real file with this omitted, 0 with it). That clipping is
        # baked into the samples permanently; loudnorm normalizing loudness
        # afterward cannot undo already-clipped distortion.
        # -ar 48000 pins the OUTPUT sample rate explicitly: ffmpeg's
        # single-pass loudnorm (dynamic mode, true-peak limiting) silently
        # upsamples its output to 192kHz for the true-peak calculation and
        # otherwise leaves it there -- also verified empirically (a 48kHz
        # mono input came out as 192kHz mono, 4x the expected file size,
        # with no -ar override). 48000 matches the rate DeepFilterNet's
        # default model already normalizes to, so denoise=True/False outputs
        # stay consistent.
        "-af", f"aformat=sample_fmts=fltp,highpass=f={highpass_hz},loudnorm=I={target_lufs}:TP=-1.5:LRA=11",
        "-ar", "48000",
        str(out_path),
    ])

    log(f"wrote {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Denoise, remove rumble, and loudness-normalize a voice recording.")
    parser.add_argument("audio", help="Filename in input/, or a path to an audio file")
    parser.add_argument("--denoise", action=argparse.BooleanOptionalAction, default=True,
                         help="Run DeepFilterNet denoising before the ffmpeg filters (default: on)")
    parser.add_argument("--target-lufs", type=float, default=-16.0,
                         help="loudnorm integrated-loudness target in LUFS (default: -16.0)")
    parser.add_argument("--highpass", type=float, default=80.0,
                         help="Highpass cutoff in Hz for rumble removal (default: 80.0)")
    parser.add_argument("-o", "--output", default=None,
                         help="Output audio path (default: output/<stem>_enhanced.wav)")
    args = parser.parse_args()

    audio_path = resolve_input(args.audio)
    enhance_voice(
        audio_path,
        out_path=args.output,
        denoise=args.denoise,
        target_lufs=args.target_lufs,
        highpass_hz=args.highpass,
    )


if __name__ == "__main__":
    main()
