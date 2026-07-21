"""Local web UI for the auto-editing pipeline: upload a video, get a final mp4 back.

Wraps scripts/pipeline.py's process_one() — same logic as the CLI, just driven from
a browser instead of argv. Jobs run one at a time on a single background worker
thread (WhisperX is heavy; this is a personal-use tool, not a multi-tenant service).

Usage:
    ./venv/bin/python web/app.py
    # then open http://localhost:5050 (or the LAN URL printed on startup)
"""

import contextlib
import json
import queue
import socket
import sys
import threading
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

from flask import Flask, jsonify, request, send_file, send_from_directory
from werkzeug.utils import secure_filename

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import cough_detect  # noqa: E402
import enhance_audio  # noqa: E402
import filler_detect  # noqa: E402
import pipeline  # noqa: E402
import rough_cut as roughcut_mod  # noqa: E402
import text_edit as text_edit_mod  # noqa: E402
import transcribe as transcribe_mod  # noqa: E402
from captions import flatten_words_with_segments  # noqa: E402
from common import (  # noqa: E402
    CLEANUP_MAX_AGE_HOURS, INPUT_DIR, MUSIC_DIR, OUTPUT_DIR, TEMP_DIR,
    cleanup_stale_files, original_stem, stem_for,
)

MUSIC_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
AUDIO_EXTS = MUSIC_EXTS
MEDIA_EXTS = pipeline.VIDEO_EXTS | AUDIO_EXTS  # video or audio, for the text-edit tab
MAX_CONTENT_LENGTH = 4 * 1024 * 1024 * 1024  # 4 GB, generous for phone-shot video

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

jobs = {}
jobs_lock = threading.Lock()
job_queue = queue.Queue()


class JobLogStream:
    """Captures print() output line-by-line into a job's message list while it runs."""

    def __init__(self, job_id):
        self.job_id = job_id
        self.buffer = ""

    def write(self, s):
        self.buffer += s
        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            if line.strip():
                with jobs_lock:
                    jobs[self.job_id]["messages"].append(line)
        return len(s)

    def flush(self):
        pass


def worker_loop():
    while True:
        job_id = job_queue.get()
        try:
            run_job(job_id)
        except Exception:
            job_queue.task_done()
            raise
        job_queue.task_done()


def set_progress(job_id, fraction):
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id]["progress"] = max(0.0, min(1.0, fraction))


def run_job(job_id):
    with jobs_lock:
        job = jobs[job_id]
        job["status"] = "running"
    try:
        with contextlib.redirect_stdout(JobLogStream(job_id)):
            if job["kind"] == "audio_trim":
                set_progress(job_id, 0.15)  # single opaque call -> no finer-grained checkpoints
                suffix = Path(job["input_path"]).suffix
                # original_stem() recovers the true source filename even if input_path
                # was itself a previously-downloaded, re-uploaded output (strips any
                # job-id prefix / prior stage suffix) -- job_id[:6] keeps repeated runs
                # against the same source from colliding while staying short/readable.
                clean_name = f"{original_stem(job['input_path'])}_silence_{job_id[:6]}{suffix}"
                final_path, _ = roughcut_mod.run_rough_cut(
                    job["input_path"],
                    threshold=job["args"]["silence_threshold"],
                    min_silence=job["args"]["min_silence"],
                    padding=job["args"]["padding"],
                    out_path=OUTPUT_DIR / clean_name,
                    method=job["args"]["method"],
                )
                set_progress(job_id, 1.0)
                with jobs_lock:
                    job["status"] = "done"
                    job["download_name"] = Path(final_path).name

            elif job["kind"] == "enhance":
                set_progress(job_id, 0.15)  # single opaque call -> no finer-grained checkpoints
                suffix = Path(job["input_path"]).suffix
                # Same clean-naming scheme as audio_trim above -- original_stem()
                # strips any accumulated job-id prefix / prior stage suffix so
                # repeated passes (e.g. enhance an already-enhanced file) still
                # resolve back to the same true source name.
                clean_name = f"{original_stem(job['input_path'])}_enhanced_{job_id[:6]}{suffix}"
                final_path = enhance_audio.enhance_voice(
                    job["input_path"],
                    out_path=OUTPUT_DIR / clean_name,
                    denoise=job["args"]["denoise"],
                    target_lufs=job["args"]["target_lufs"],
                    highpass_hz=job["args"]["highpass_hz"],
                )
                set_progress(job_id, 1.0)
                with jobs_lock:
                    job["status"] = "done"
                    job["download_name"] = Path(final_path).name

            elif job["kind"] == "transcribe":
                args = job["args"]
                input_path = job["input_path"]
                silence_cut_applied = False
                if args.get("use_silence_cut"):
                    # Silence-cut FIRST, then transcribe the cut media so the
                    # transcript timestamps already match the media the text-edit
                    # step will cut from -- no remapping needed anywhere.
                    set_progress(job_id, 0.05)
                    cut_path, _ = roughcut_mod.run_rough_cut(
                        input_path,
                        threshold=args["silence_threshold"],
                        min_silence=args["min_silence"],
                        padding=args["padding"],
                        method=args["method"],
                        # out_path=None -> run_rough_cut writes temp/<stem>_cut.<ext>
                        # with its own suffix convention (.mp4 for video, source ext
                        # for audio-only) and keeps the file around for text-edit.
                    )
                    silence_cut_applied = True
                    input_path = cut_path
                    with jobs_lock:
                        job["input_path"] = cut_path
                    set_progress(job_id, 0.3)
                else:
                    set_progress(job_id, 0.1)
                transcript_path = transcribe_mod.run_transcribe(
                    input_path,
                    model_name=args["model"],
                    language=args["language"],
                    device="cpu",
                    compute_type="int8",
                    batch_size=8,
                )
                set_progress(job_id, 0.95)
                with open(transcript_path, encoding="utf-8") as f:
                    transcript = json.load(f)
                raw_words, segments = flatten_words_with_segments(transcript)
                words = [
                    {"word": w["word"].strip(), "start": w["start"], "end": w["end"]}
                    for w in raw_words
                ]
                filler_flags = filler_detect.detect_fillers(
                    words, language=job["args"]["language"],
                )

                if args.get("use_cough_detect"):
                    # Cough/throat-clearing detection, run on input_path (the
                    # possibly silence-cut media from the pre-step above) so
                    # cough timestamps line up with whatever the editor/
                    # waveform will actually play. Real model inference like
                    # transcription, not instant -- give it its own progress
                    # checkpoint rather than jumping straight to 1.0.
                    set_progress(job_id, 0.97)
                    cough_events = cough_detect.detect_cough_events(input_path)
                    words, segments = cough_detect.merge_cough_events(words, segments, cough_events)
                    # filler_detect already ran on the ORIGINAL (pre-merge)
                    # words above; pad False at every synthetic cough index
                    # rather than rerun it on the merged list -- simpler and
                    # equally correct, since "[기침]" wouldn't match any
                    # filler token anyway. Walking merged words in order and
                    # advancing through the original flags only on non-event
                    # entries preserves each original word's flag exactly.
                    padded_filler_flags = []
                    orig_i = 0
                    for w in words:
                        if w.get("is_event"):
                            padded_filler_flags.append(False)
                        else:
                            padded_filler_flags.append(filler_flags[orig_i])
                            orig_i += 1
                    filler_flags = padded_filler_flags
                    cough_flags = [bool(w.get("is_event")) for w in words]
                else:
                    cough_flags = [False] * len(words)

                set_progress(job_id, 1.0)
                with jobs_lock:
                    job["status"] = "done"
                    job["transcript_path"] = transcript_path
                    job["words"] = words
                    job["filler_flags"] = filler_flags
                    job["segments"] = segments
                    job["cough_flags"] = cough_flags
                    job["silence_cut_applied"] = silence_cut_applied

            elif job["kind"] == "text_edit":
                set_progress(job_id, 0.2)  # single opaque call -> ffmpeg cut + srt write, no finer checkpoints
                media_path, srt_path = text_edit_mod.run_text_edit(
                    job["input_path"], job["transcript_path"], job["keep_flags"],
                )
                # run_text_edit() names its own outputs from stem_for(input_path), which
                # chains job-id prefixes/stage suffixes when input_path is itself a
                # previously-downloaded, re-uploaded (or silence-precut) file -- rename to
                # a clean, source-matchable name instead of touching that internal naming.
                clean_base = f"{original_stem(job['input_path'])}_edited_{job_id[:6]}"
                clean_media = Path(media_path).with_name(clean_base + Path(media_path).suffix)
                clean_srt = Path(srt_path).with_name(clean_base + ".srt")
                Path(media_path).rename(clean_media)
                Path(srt_path).rename(clean_srt)
                set_progress(job_id, 1.0)
                with jobs_lock:
                    job["status"] = "done"
                    job["download_files"] = {"media": clean_media, "srt": clean_srt}

            else:
                final_path = pipeline.process_one(
                    job["input_path"], job["args"],
                    on_progress=lambda frac: set_progress(job_id, frac),
                )
                # Same rationale as text_edit above -- rename pipeline.process_one()'s
                # own {stem}_final.mp4 to a clean, source-matchable name.
                clean_name = f"{original_stem(job['input_path'])}_final_{job_id[:6]}{Path(final_path).suffix}"
                clean_path = Path(final_path).with_name(clean_name)
                Path(final_path).rename(clean_path)
                with jobs_lock:
                    job["status"] = "done"
                    job["download_name"] = clean_path.name
    except Exception as e:
        with jobs_lock:
            job["status"] = "error"
            job["error"] = str(e)


threading.Thread(target=worker_loop, daemon=True).start()


CLEANUP_INTERVAL_S = 3600  # sweep hourly; files older than CLEANUP_MAX_AGE_HOURS get removed


def in_flight_paths():
    """Resolved absolute paths belonging to any queued/running job, so
    cleanup_stale_files() never removes a file an active job still needs
    even if its mtime happens to be older than the cutoff (e.g. a very slow
    transcription)."""
    paths = set()
    with jobs_lock:
        for job in jobs.values():
            if job["status"] not in ("queued", "running"):
                continue
            for key in ("input_path", "transcript_path"):
                if job.get(key):
                    paths.add(str(Path(job[key]).resolve()))
            for p in (job.get("download_files") or {}).values():
                paths.add(str(Path(p).resolve()))
    return paths


def cleanup_loop():
    # Run once at startup too -- restarting the server is a natural, frequent
    # moment to also catch anything that accumulated since the last sweep.
    while True:
        removed = cleanup_stale_files(protected_paths=in_flight_paths())
        if removed:
            print(f"[cleanup] removed {removed} file(s) older than {CLEANUP_MAX_AGE_HOURS}h", flush=True)
        with jobs_lock:
            cutoff = time.time() - CLEANUP_MAX_AGE_HOURS * 3600
            stale_ids = [
                jid for jid, job in jobs.items()
                if job["status"] in ("done", "error") and job.get("created_at", time.time()) < cutoff
            ]
            for jid in stale_ids:
                del jobs[jid]
        time.sleep(CLEANUP_INTERVAL_S)


threading.Thread(target=cleanup_loop, daemon=True).start()


def str2bool(v: str) -> bool:
    return str(v).lower() in ("1", "true", "on", "yes")


REUSE_NOT_FOUND_MSG = "원본 파일을 찾을 수 없습니다. 파일을 다시 업로드해주세요."


def reusable_input_path(reuse_job_id):
    """input_path of a previous job, for re-running with new options without
    re-uploading. Returns the Path if the job exists and its input file is
    still on disk, else None. Any job kind is a valid source -- the caller
    still validates the extension against its own allowed set."""
    with jobs_lock:
        src_job = jobs.get(reuse_job_id)
        path = src_job.get("input_path") if src_job else None
    if path and Path(path).is_file():
        return Path(path)
    return None


@app.route("/")
def index():
    # This process is now a pure API backend -- the UI lives in the sibling
    # Next.js app (source-studio), which proxies /api/auto-edit/* here via
    # next.config.js rewrites(). web/index.html (the old standalone vanilla-JS
    # UI) was intentionally not carried over in the merge; nothing serves a
    # page at "/" anymore, so this is just a liveness/sanity check.
    return jsonify({"service": "auto-edit-backend", "status": "ok"})


@app.route("/api/music")
def list_music():
    files = sorted(p.name for p in MUSIC_DIR.iterdir() if p.suffix.lower() in MUSIC_EXTS)
    return jsonify(files)


@app.route("/api/jobs", methods=["POST"])
def create_job():
    video_file = request.files.get("video")
    reuse_job_id = request.form.get("reuse_job_id")
    job_id = uuid.uuid4().hex[:12]

    if video_file and video_file.filename:
        if Path(video_file.filename).suffix.lower() not in pipeline.VIDEO_EXTS:
            return jsonify({"error": f"지원하지 않는 확장자입니다 ({', '.join(sorted(pipeline.VIDEO_EXTS))} 만 가능)"}), 400
        safe_name = secure_filename(video_file.filename) or "video.mp4"
        video_path = INPUT_DIR / f"{job_id}_{safe_name}"
        video_file.save(video_path)
    elif reuse_job_id:
        # Re-run with new options, reusing a previous job's uploaded file.
        video_path = reusable_input_path(reuse_job_id)
        if video_path is None:
            return jsonify({"error": REUSE_NOT_FOUND_MSG}), 400
        if video_path.suffix.lower() not in pipeline.VIDEO_EXTS:
            return jsonify({"error": f"지원하지 않는 확장자입니다 ({', '.join(sorted(pipeline.VIDEO_EXTS))} 만 가능)"}), 400
    else:
        return jsonify({"error": "영상 파일이 없습니다."}), 400

    use_rough_cut = str2bool(request.form.get("use_rough_cut", "true"))
    use_captions = str2bool(request.form.get("use_captions", "true"))
    use_bgm = str2bool(request.form.get("use_bgm", "true"))
    duck = str2bool(request.form.get("duck", "true"))

    bgm_choice = request.form.get("bgm_choice", "none")
    bgm_path = None
    if use_bgm and bgm_choice == "upload" and request.files.get("bgm_file") and request.files["bgm_file"].filename:
        bgm_file = request.files["bgm_file"]
        bgm_name = secure_filename(bgm_file.filename)
        if Path(bgm_name).suffix.lower() not in MUSIC_EXTS:
            return jsonify({"error": f"지원하지 않는 BGM 확장자입니다 ({', '.join(sorted(MUSIC_EXTS))} 만 가능)"}), 400
        bgm_path = MUSIC_DIR / bgm_name
        bgm_file.save(bgm_path)
    elif use_bgm and bgm_choice not in ("none", "upload", ""):
        candidate = MUSIC_DIR / bgm_choice
        if not candidate.is_file():
            return jsonify({"error": f"BGM 파일을 찾을 수 없습니다: {bgm_choice}"}), 400
        bgm_path = candidate
    # else bgm_choice is "none"/"" -> bgm_path stays None -> bgm.py falls back to the first file in music/

    if use_bgm and bgm_path is None and not any(p.suffix.lower() in MUSIC_EXTS for p in MUSIC_DIR.iterdir()):
        return jsonify({"error": "BGM을 사용하려면 music/ 폴더에 파일을 두거나 직접 업로드하세요."}), 400

    def as_float(name, default):
        try:
            return float(request.form.get(name, default))
        except (TypeError, ValueError):
            return default

    def as_int(name, default):
        try:
            return int(request.form.get(name, default))
        except (TypeError, ValueError):
            return default

    args = SimpleNamespace(
        skip_transcribe=not use_captions,
        skip_rough_cut=not use_rough_cut,
        skip_captions=not use_captions,
        skip_bgm=not use_bgm,
        model=request.form.get("model", "medium"),
        language=request.form.get("language", "ko"),
        device="cpu",
        compute_type="int8",
        batch_size=8,
        silence_threshold=as_float("silence_threshold", -30.0),
        min_silence=as_float("min_silence", 0.5),
        padding=0.15,
        min_keep=0.1,
        method=request.form.get("silence_method", "ffmpeg"),
        max_words=6,
        max_chars=None,
        max_gap=0.7,
        font="Apple SD Gothic Neo",
        fontsize=as_int("fontsize", 64),
        margin_v=120,
        bgm=bgm_path,
        bgm_volume=as_float("bgm_volume", -20.0),
        no_duck=not duck,
        duck_threshold=0.05,
        duck_ratio=8.0,
    )

    with jobs_lock:
        jobs[job_id] = {
            "kind": "video",
            "status": "queued",
            "progress": 0.0,
            "messages": [],
            "download_name": None,
            "error": None,
            "input_path": video_path,
            "args": args,
            "created_at": time.time(),
        }
    job_queue.put(job_id)

    return jsonify({"job_id": job_id})


@app.route("/api/audio-jobs", methods=["POST"])
def create_audio_job():
    """Audio-only silence removal: upload an audio file, get the trimmed audio back
    (no captions/BGM — those need a video track to render onto)."""
    audio_file = request.files.get("audio")
    reuse_job_id = request.form.get("reuse_job_id")
    job_id = uuid.uuid4().hex[:12]

    if audio_file and audio_file.filename:
        if Path(audio_file.filename).suffix.lower() not in AUDIO_EXTS:
            return jsonify({"error": f"지원하지 않는 확장자입니다 ({', '.join(sorted(AUDIO_EXTS))} 만 가능)"}), 400
        safe_name = secure_filename(audio_file.filename) or "audio.mp3"
        audio_path = INPUT_DIR / f"{job_id}_{safe_name}"
        audio_file.save(audio_path)
    elif reuse_job_id:
        # Re-run with new options, reusing a previous job's uploaded file.
        audio_path = reusable_input_path(reuse_job_id)
        if audio_path is None:
            return jsonify({"error": REUSE_NOT_FOUND_MSG}), 400
        if audio_path.suffix.lower() not in AUDIO_EXTS:
            return jsonify({"error": f"지원하지 않는 확장자입니다 ({', '.join(sorted(AUDIO_EXTS))} 만 가능)"}), 400
    else:
        return jsonify({"error": "음성 파일이 없습니다."}), 400

    def as_float(name, default):
        try:
            return float(request.form.get(name, default))
        except (TypeError, ValueError):
            return default

    with jobs_lock:
        jobs[job_id] = {
            "kind": "audio_trim",
            "status": "queued",
            "progress": 0.0,
            "messages": [],
            "download_name": None,
            "error": None,
            "input_path": audio_path,
            "args": {
                "silence_threshold": as_float("silence_threshold", -30.0),
                "min_silence": as_float("min_silence", 0.5),
                # Kept-segment padding in seconds, clamped to a sane range so a
                # typo'd form value can't produce a nonsense cut.
                "padding": max(0.0, min(2.0, as_float("padding", 0.15))),
                "method": request.form.get("silence_method", "ffmpeg"),
            },
            "created_at": time.time(),
        }
    job_queue.put(job_id)

    return jsonify({"job_id": job_id})


@app.route("/api/enhance-jobs", methods=["POST"])
def create_enhance_job():
    """사운드 개선 tab: upload a voice audio file, get back a denoised,
    rumble-filtered, loudness-normalized version (audio-only, same scope as
    the 음성 무음 제거 tab above -- no captions/BGM)."""
    audio_file = request.files.get("audio")
    reuse_job_id = request.form.get("reuse_job_id")
    job_id = uuid.uuid4().hex[:12]

    if audio_file and audio_file.filename:
        if Path(audio_file.filename).suffix.lower() not in AUDIO_EXTS:
            return jsonify({"error": f"지원하지 않는 확장자입니다 ({', '.join(sorted(AUDIO_EXTS))} 만 가능)"}), 400
        safe_name = secure_filename(audio_file.filename) or "audio.mp3"
        audio_path = INPUT_DIR / f"{job_id}_{safe_name}"
        audio_file.save(audio_path)
    elif reuse_job_id:
        # Re-run with new options, reusing a previous job's uploaded file.
        audio_path = reusable_input_path(reuse_job_id)
        if audio_path is None:
            return jsonify({"error": REUSE_NOT_FOUND_MSG}), 400
        if audio_path.suffix.lower() not in AUDIO_EXTS:
            return jsonify({"error": f"지원하지 않는 확장자입니다 ({', '.join(sorted(AUDIO_EXTS))} 만 가능)"}), 400
    else:
        return jsonify({"error": "음성 파일이 없습니다."}), 400

    def as_float(name, default):
        try:
            return float(request.form.get(name, default))
        except (TypeError, ValueError):
            return default

    with jobs_lock:
        jobs[job_id] = {
            "kind": "enhance",
            "status": "queued",
            "progress": 0.0,
            "messages": [],
            "download_name": None,
            "error": None,
            "input_path": audio_path,
            "args": {
                "denoise": str2bool(request.form.get("denoise", "true")),
                "target_lufs": max(-30.0, min(-6.0, as_float("target_lufs", -16.0))),
                "highpass_hz": max(20.0, min(200.0, as_float("highpass_hz", 80.0))),
            },
            "created_at": time.time(),
        }
    job_queue.put(job_id)

    return jsonify({"job_id": job_id})


@app.route("/api/transcribe-jobs", methods=["POST"])
def create_transcribe_job():
    """텍스트 편집 tab, step 1: transcribe only (no cut/captions/bgm), so the
    browser can show an editable word list."""
    media_file = request.files.get("media")
    if not media_file or not media_file.filename:
        return jsonify({"error": "파일이 없습니다."}), 400
    if Path(media_file.filename).suffix.lower() not in MEDIA_EXTS:
        return jsonify({"error": f"지원하지 않는 확장자입니다 ({', '.join(sorted(MEDIA_EXTS))} 만 가능)"}), 400

    job_id = uuid.uuid4().hex[:12]
    safe_name = secure_filename(media_file.filename) or "media"
    media_path = INPUT_DIR / f"{job_id}_{safe_name}"
    media_file.save(media_path)

    def as_float(name, default):
        try:
            return float(request.form.get(name, default))
        except (TypeError, ValueError):
            return default

    with jobs_lock:
        jobs[job_id] = {
            "kind": "transcribe",
            "status": "queued",
            "progress": 0.0,
            "messages": [],
            "download_name": None,
            "error": None,
            "input_path": media_path,
            "args": {
                "model": request.form.get("model", "medium"),
                "language": request.form.get("language", "ko"),
                # Optionally silence-cut the media before transcribing so the
                # editor works on (and text-edit cuts from) the trimmed media.
                # Default false keeps the original transcribe-then-edit behavior.
                "use_silence_cut": str2bool(request.form.get("use_silence_cut", "false")),
                "silence_threshold": as_float("silence_threshold", -30.0),
                "min_silence": as_float("min_silence", 0.5),
                "padding": max(0.0, min(2.0, as_float("padding", 0.15))),
                "method": request.form.get("silence_method", "ffmpeg"),
                # Additive flagging feature (never destructive -- coughs are
                # surfaced as candidates, never auto-cut), so on by default.
                # Flip this default to "false" if PANNs inference turns out
                # too slow/noisy in practice.
                "use_cough_detect": str2bool(request.form.get("use_cough_detect", "true")),
            },
            "created_at": time.time(),
        }
    job_queue.put(job_id)

    return jsonify({"job_id": job_id})


@app.route("/api/text-edit-jobs", methods=["POST"])
def create_text_edit_job():
    """텍스트 편집 tab, step 2: given a completed transcribe job and a
    per-word keep/drop list from the browser, cut the media and write a new
    .srt around what's left."""
    payload = request.get_json(silent=True) or {}
    src_job_id = payload.get("job_id")
    keep = payload.get("keep")

    with jobs_lock:
        src_job = jobs.get(src_job_id)
        if not src_job or src_job["kind"] != "transcribe" or src_job["status"] != "done":
            return jsonify({"error": "먼저 대본 추출을 완료해야 합니다."}), 400
        if not isinstance(keep, list) or len(keep) != len(src_job["words"]):
            return jsonify({"error": "keep 배열 길이가 단어 수와 일치하지 않습니다."}), 400
        input_path = src_job["input_path"]
        transcript_path = src_job["transcript_path"]

    job_id = uuid.uuid4().hex[:12]
    with jobs_lock:
        jobs[job_id] = {
            "kind": "text_edit",
            "status": "queued",
            "progress": 0.0,
            "messages": [],
            "download_name": None,
            "error": None,
            "input_path": input_path,
            "transcript_path": transcript_path,
            "keep_flags": [bool(k) for k in keep],
            "created_at": time.time(),
        }
    job_queue.put(job_id)

    return jsonify({"job_id": job_id})


@app.route("/api/jobs/<job_id>")
def job_status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({"error": "존재하지 않는 작업입니다."}), 404
        resp = {
            "status": job["status"],
            "progress": job.get("progress", 0.0),
            "messages": job["messages"][-200:],
            "download_name": job["download_name"],
            "error": job["error"],
        }
        if job["kind"] == "transcribe" and job["status"] == "done":
            resp["words"] = job["words"]
            resp["filler_flags"] = job["filler_flags"]
            resp["cough_flags"] = job["cough_flags"]
            resp["segments"] = job["segments"]
            resp["silence_cut_applied"] = job["silence_cut_applied"]
        if job["kind"] == "text_edit" and job["status"] == "done":
            resp["download_files"] = sorted(job["download_files"].keys())
        return jsonify(resp)


@app.route("/api/jobs/<job_id>/download")
def job_download(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job or job["status"] != "done":
            return jsonify({"error": "아직 완료되지 않았거나 존재하지 않는 작업입니다."}), 404
        name = job["download_name"]
    return send_from_directory(OUTPUT_DIR, name, as_attachment=True)


@app.route("/api/jobs/<job_id>/download/<file_key>")
def job_download_file(job_id, file_key):
    """Multi-file downloads (e.g. text-edit jobs: edited media + .srt)."""
    with jobs_lock:
        job = jobs.get(job_id)
        if not job or job["status"] != "done" or "download_files" not in job:
            return jsonify({"error": "아직 완료되지 않았거나 존재하지 않는 작업입니다."}), 404
        path = job["download_files"].get(file_key)
        if not path:
            return jsonify({"error": "존재하지 않는 파일입니다."}), 404
    return send_file(path, as_attachment=True, download_name=Path(path).name)


@app.route("/api/jobs/<job_id>/preview")
def job_preview(job_id):
    """Inline playback of a finished job's media (for an in-page <video>/<audio>
    tag or a waveform): served not as an attachment, with conditional=True so
    Range requests work and the player can seek.

    - video / audio_trim jobs: the result file in OUTPUT_DIR (download_name).
    - text_edit jobs: the cut "media" entry from download_files.
    - transcribe jobs: the (possibly silence-cut) input_path the editor works on.
    """
    with jobs_lock:
        job = jobs.get(job_id)
        if not job or job["status"] != "done":
            return jsonify({"error": "아직 완료되지 않았거나 존재하지 않는 작업입니다."}), 404
        media_path = None
        name = None
        if job["kind"] == "transcribe":
            media_path = job.get("input_path")
        elif "download_files" in job:  # text_edit jobs: preview the cut media entry
            media_path = job["download_files"].get("media")
        else:
            name = job["download_name"]
    if media_path:
        return send_file(media_path, as_attachment=False, conditional=True)
    if name:
        return send_from_directory(OUTPUT_DIR, name, as_attachment=False, conditional=True)
    return jsonify({"error": "존재하지 않는 파일입니다."}), 404


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    port = 5050
    print(f" * Local:   http://localhost:{port}")
    print(f" * Network: http://{lan_ip()}:{port}  (same Wi-Fi devices)")
    app.run(host="0.0.0.0", port=port, threaded=True)
