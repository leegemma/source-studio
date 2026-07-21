"""Silero VAD -- precision silence detection, an opt-in alternative to
rough_cut.py's default ffmpeg `silencedetect` (a crude dB-threshold gate that
can't tell a loud cough or a keyboard clack from actual speech).

Silero VAD (https://github.com/snakers4/silero-vad, `silero-vad` pip package)
runs a small neural network over the audio and outputs a per-frame speech
probability, which is far more robust to background noise than a volume
threshold. The model ships bundled inside the pip package (`silero_vad/data/`)
-- no network access or first-run download, unlike WhisperX's model fetch.

Returns the SAME (start, end) tuple-list shape rough_cut.detect_silences()
does, so it's a drop-in alternative silence source: everything downstream
(compute_keep_segments, cut_video/cut_audio, build_cutlist) is already
generic over "a list of (start, end) intervals to remove" and needs no
changes to consume either source.

Usage (library):
    from vad_detect import detect_silences_vad
    silences = detect_silences_vad(video_path, threshold=0.5, min_silence_s=0.5)

CLI: python scripts/rough_cut.py my_video.mp4 --method vad
"""

from common import extract_mono_wav, ffprobe_duration, log

# Silero VAD's bundled model is trained/validated at 16 kHz mono.
VAD_SAMPLE_RATE = 16000


def detect_speech_segments(audio_path, threshold=0.5) -> list:
    """Speech spans in seconds via Silero VAD.

    threshold is Silero's own speech-probability threshold (0-1, default
    0.5) -- frames scoring above it are considered speech.
    """
    from silero_vad import get_speech_timestamps, load_silero_vad, read_audio

    log("loading Silero VAD model (bundled with the package, no download)...")
    model = load_silero_vad()

    wav_path = extract_mono_wav(audio_path, VAD_SAMPLE_RATE, suffix="vad16k")
    wav = read_audio(str(wav_path), sampling_rate=VAD_SAMPLE_RATE)

    timestamps = get_speech_timestamps(
        wav, model,
        threshold=threshold,
        sampling_rate=VAD_SAMPLE_RATE,
        return_seconds=True,
    )
    return [(float(t["start"]), float(t["end"])) for t in timestamps]


def detect_silences_vad(audio_path, threshold=0.5, min_silence_s=0.5) -> list:
    """Complement of detect_speech_segments() against the file's total
    duration, filtered to gaps >= min_silence_s. Returns the SAME (start,
    end) tuple-list shape as rough_cut.detect_silences() -- a drop-in
    alternative silence source, not a replacement API.
    """
    duration = ffprobe_duration(audio_path)
    speech = detect_speech_segments(audio_path, threshold=threshold)

    silences = []
    cursor = 0.0
    for s, e in speech:
        if s > cursor:
            silences.append((cursor, s))
        cursor = max(cursor, e)
    if duration > cursor:
        silences.append((cursor, duration))

    return [(s, e) for s, e in silences if (e - s) >= min_silence_s]
