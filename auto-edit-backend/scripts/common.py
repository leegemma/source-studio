"""Shared paths, ffmpeg/ffprobe helpers, and small utilities for the pipeline scripts."""

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = ROOT / "input"
OUTPUT_DIR = ROOT / "output"
TEMP_DIR = ROOT / "temp"
MUSIC_DIR = ROOT / "music"
TRANSCRIPTS_DIR = ROOT / "transcripts"
SUBTITLES_DIR = ROOT / "subtitles"

for d in (INPUT_DIR, OUTPUT_DIR, TEMP_DIR, MUSIC_DIR, TRANSCRIPTS_DIR, SUBTITLES_DIR):
    d.mkdir(parents=True, exist_ok=True)


def _find_binary(name: str, env_var: str) -> str:
    override = os.environ.get(env_var)
    if override:
        return override
    # Homebrew's plain `ffmpeg` formula is built without libass/freetype, so
    # drawtext/subtitles/ass filters are missing. ffmpeg-full (keg-only) has them.
    full = Path(f"/opt/homebrew/opt/ffmpeg-full/bin/{name}")
    if full.exists():
        return str(full)
    return name  # fall back to whatever is on PATH


FFMPEG_BIN = _find_binary("ffmpeg", "FFMPEG_BIN")
FFPROBE_BIN = _find_binary("ffprobe", "FFPROBE_BIN")


def log(msg: str) -> None:
    print(f"[{Path(sys.argv[0]).stem}] {msg}", flush=True)


def run(cmd: list, **kwargs) -> subprocess.CompletedProcess:
    """Run a subprocess command, raising a readable error with full stderr on failure."""
    result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(str(c) for c in cmd)}\n"
            f"--- stderr ---\n{result.stderr[-4000:]}"
        )
    return result


def ffprobe_json(path) -> dict:
    result = run([
        FFPROBE_BIN, "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ])
    return json.loads(result.stdout)


def ffprobe_duration(path) -> float:
    info = ffprobe_json(path)
    return float(info["format"]["duration"])


def has_audio_stream(path) -> bool:
    info = ffprobe_json(path)
    return any(s.get("codec_type") == "audio" for s in info.get("streams", []))


def has_video_stream(path) -> bool:
    """True if there's a real video stream — ignores embedded cover art (mp3/m4a
    "attached_pic" streams report codec_type=video too, but there's nothing to cut)."""
    info = ffprobe_json(path)
    return any(
        s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")
        for s in info.get("streams", [])
    )


def resolve_input(name_or_path: str) -> Path:
    """Accept either a bare filename (looked up in input/) or a full/relative path."""
    p = Path(name_or_path)
    if p.is_file():
        return p
    candidate = INPUT_DIR / name_or_path
    if candidate.is_file():
        return candidate
    raise FileNotFoundError(f"Could not find input file: {name_or_path} (checked {p} and {candidate})")


def stem_for(path) -> str:
    return Path(path).stem


# web/app.py tags every upload as INPUT_DIR/{job_id}_{original_name} (job_id =
# uuid4().hex[:12], always exactly 12 lowercase hex chars). Once a processed
# output gets downloaded and RE-uploaded (e.g. running 무음 제거 on a file
# that's already been through 무음 제거 once), naively deriving new output
# names from stem_for() chains job-id prefixes and stage suffixes onto each
# other indefinitely -- e.g. "c51ba2_03aab1_260717_2054_cut_cut_edited.wav".
_JOB_ID_PREFIX_RE = re.compile(r"^[0-9a-f]{12}_")
# Bare legacy suffixes (no id) plus the new "_label_{6 hex}" suffixes this
# module's own output-naming now produces (see web/app.py) -- both are
# stripped so a file that already went through the new clean-naming scheme
# and gets re-uploaded resolves back to the same true original name too.
# Labels are ASCII on purpose: Flask's secure_filename() (werkzeug) strips
# non-ASCII characters -- including Hangul -- from uploaded filenames, so a
# Korean label would survive exactly one round trip and then silently vanish
# (leaving a stray "__{id}" behind) the moment a downloaded output gets
# re-uploaded, permanently breaking this stripping on the very next pass.
_STAGE_SUFFIX_RE = re.compile(
    r"_(?:cut|final|edited|captioned)$"
    r"|_(?:silence|final|edited|enhanced)_[0-9a-f]{6}$"
)


def original_stem(path) -> str:
    """Best-effort recovery of a file's "true" original name for building
    human-readable, matchable output filenames -- strips any accumulated
    job-id prefixes and pipeline stage suffixes (see the regexes above),
    looping until neither matches so doubly-(or more)-reprocessed files still
    resolve to the same clean base. A no-op for names that never had either
    (e.g. a fresh CLI run), and never returns an empty string (falls back to
    "output" if stripping would otherwise leave nothing)."""
    stem = Path(path).stem
    changed = True
    while changed:
        changed = False
        m = _JOB_ID_PREFIX_RE.match(stem)
        if m:
            stem = stem[m.end():]
            changed = True
        m = _STAGE_SUFFIX_RE.search(stem)
        if m and m.end() == len(stem):
            stem = stem[:m.start()]
            changed = True
    return stem or "output"


def extract_mono_wav(media_path, sample_rate: int, suffix: str = "") -> Path:
    """Extract a mono PCM WAV at sample_rate Hz via ffmpeg into TEMP_DIR.

    Shared by anything that needs a guaranteed-decodable audio file regardless
    of the source container (video or an exotic audio codec) -- e.g.
    vad_detect.py and cough_detect.py feeding Silero VAD / PANNs models that
    expect a specific sample rate. This shells out through FFMPEG_BIN, the
    same "always let ffmpeg do the decode" pattern the rest of the pipeline
    uses (rough_cut.py, captions.py, bgm.py) rather than trusting a Python
    audio library's own, less consistent container/codec support.

    suffix disambiguates callers that want different sample rates for the
    same input stem (e.g. "vad16k" vs "panns32k"); defaults to the sample
    rate itself.
    """
    out_path = TEMP_DIR / f"{stem_for(media_path)}_{suffix or sample_rate}.wav"
    run([
        FFMPEG_BIN, "-y", "-i", str(media_path),
        "-vn", "-ac", "1", "-ar", str(sample_rate),
        str(out_path),
    ])
    return out_path


# web/app.py saves a copy of every upload (INPUT_DIR) and writes intermediate/
# final files into OUTPUT_DIR/TEMP_DIR/TRANSCRIPTS_DIR/SUBTITLES_DIR, all so
# reuse_job_id / 설정 수정하기 / text-edit / preview can find them later --
# but nothing ever removes them, so a long-running server accumulates every
# upload and every processing artifact forever. MUSIC_DIR is deliberately
# excluded: BGM tracks are user-managed and meant to persist ("stays there
# for next time" per the README), not per-job scratch output.
CLEANUP_DIRS = (INPUT_DIR, OUTPUT_DIR, TEMP_DIR, TRANSCRIPTS_DIR, SUBTITLES_DIR)
CLEANUP_MAX_AGE_HOURS = float(os.environ.get("CLEANUP_MAX_AGE_HOURS", 24))


def cleanup_stale_files(max_age_hours=None, protected_paths=frozenset()) -> int:
    """Delete files older than max_age_hours (default CLEANUP_MAX_AGE_HOURS)
    from CLEANUP_DIRS. `protected_paths` (a set of resolved absolute path
    strings) is excluded even if stale -- callers pass the input/output paths
    of any currently queued/running job so an in-flight job's files can never
    be swept out from under it. Never touches directories or .gitkeep.
    Returns the number of files removed.
    """
    cutoff = time.time() - (CLEANUP_MAX_AGE_HOURS if max_age_hours is None else max_age_hours) * 3600
    removed = 0
    for d in CLEANUP_DIRS:
        if not d.is_dir():
            continue
        for f in d.iterdir():
            if not f.is_file() or f.name == ".gitkeep":
                continue
            if str(f.resolve()) in protected_paths:
                continue
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink()
                    removed += 1
            except FileNotFoundError:
                pass  # already removed by a concurrent sweep or the job itself
    return removed
