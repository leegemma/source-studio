# auto-editing

Local video auto-editing pipeline: transcribe → cut silence → burn captions → mix BGM.
Usable from the CLI, or from a browser via the bundled [web UI](#web-ui). Also includes a
standalone [subtitle exporter](#usage) (`.srt`/`.vtt`) for when you just want a transcript, not a
burned-in video.

```
video-editor/
├── input/          # drop source videos here
├── output/         # final results land here (<stem>_final.mp4, or <stem>_cut.<ext> for audio-only trims)
├── temp/           # intermediate files (*_cut.mp4, *_captions.ass, *_captioned.mp4, *_cutlist.json)
├── music/          # BGM tracks
├── transcripts/    # WhisperX output (<stem>.json)
├── subtitles/      # exported .srt / .vtt subtitle files
├── scripts/
│   ├── common.py        # shared paths + ffmpeg/ffprobe helpers
│   ├── transcribe.py    # 1. word-level timestamps (WhisperX)
│   ├── rough_cut.py     # 2. remove silence, write a cutlist
│   ├── captions.py      # 3. remap timestamps onto the cut video, burn captions
│   ├── bgm.py            # 4. mix BGM under the speech track (sidechain ducking)
│   ├── pipeline.py      # runs all four steps
│   ├── subtitles.py     # standalone: audio/video -> .srt/.vtt subtitle file
│   └── text_edit.py     # standalone: transcript word deletions -> cut media + .srt
└── web/
    ├── app.py           # Flask server: upload -> pipeline.process_one() -> download
    └── index.html       # single-file browser UI (upload form + progress + download)
```

## Setup (one-time, macOS)

```bash
brew install python@3.11 ffmpeg-full   # ffmpeg-full has libass/freetype (captions.py needs it);
                                        # plain `ffmpeg` from homebrew-core does NOT and is left untouched
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/pip install --no-deps deepfilternet==0.5.6   # see note below -- must come after, with --no-deps
```

`ffmpeg-full` is keg-only so it won't fight with an existing `ffmpeg` install. `scripts/common.py`
auto-detects it at `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`; override with the `FFMPEG_BIN` /
`FFPROBE_BIN` env vars if your setup differs.

`deepfilternet` (used by `scripts/enhance_audio.py`) can't be a plain line in `requirements.txt`:
its metadata pins `numpy<2.0`, which conflicts with whisperx's `numpy>=2.1.0` and makes a combined
`pip install -r requirements.txt` fail outright (`ResolutionImpossible`). `requirements.txt`
installs deepfilternet's *actual* dependencies instead (`deepfilterlib`, `loguru`, `appdirs` —
`deepfilterlib`, the real compiled binding, only requires `numpy>=1.22` with no upper bound), then
the second command above installs `deepfilternet` itself with `--no-deps` so pip never re-resolves
the stale `<2.0` ceiling. This has been verified empirically (real inference run, byte-identical
output with numpy 2.x vs 1.26) — the pin is overly conservative, not a real incompatibility.

WhisperX runs on CPU here (`ctranslate2` has no Apple GPU/MPS backend) — expect roughly
real-time-ish speed on Apple Silicon with `--compute-type int8`, slower with float32.

## Usage

Drop a video in `input/`, then either run the whole pipeline:

```bash
./venv/bin/python scripts/pipeline.py my_video.mp4
# or, with no argument, process every video in input/:
./venv/bin/python scripts/pipeline.py
```

...or run steps individually (each writes into `transcripts/` / `temp/` / `output/` and picks up
the previous step's output automatically by filename stem):

```bash
./venv/bin/python scripts/transcribe.py my_video.mp4
./venv/bin/python scripts/rough_cut.py my_video.mp4
./venv/bin/python scripts/captions.py my_video.mp4
./venv/bin/python scripts/bgm.py my_video.mp4 --bgm music/upbeat.mp3
```

Run any script with `-h` for its full flag list (silence threshold, caption chunk size/font,
BGM volume/ducking, etc).

To export a plain subtitle file from an audio (or video) file's speech — no video cutting or
caption burn-in, just a portable `.srt`/`.vtt` — use `subtitles.py` on its own:

```bash
./venv/bin/python scripts/subtitles.py voice.mp3
# reuse an existing transcript instead of re-transcribing:
./venv/bin/python scripts/subtitles.py voice.mp3 --transcript transcripts/voice.json
# only one format, custom line length:
./venv/bin/python scripts/subtitles.py voice.mp3 --formats srt --max-chars 32
```

To edit spoken content by editing text instead of scrubbing a timeline — transcribe, delete the
words you don't want, and get back matching audio/video plus a re-timed `.srt` — use
`text_edit.py`. It has no meaningful CLI entry point on its own (the "which words to keep" list
comes from a person clicking through a transcript in the browser, not a flag), so drive it via the
**텍스트 편집** tab in the [web UI](#web-ui), or call `run_text_edit()` directly if scripting it:

```python
import sys; sys.path.insert(0, "scripts")
from transcribe import run_transcribe
from text_edit import run_text_edit
from captions import flatten_words
import json

transcript_path = run_transcribe("voice.mp3")
words = flatten_words(json.load(open(transcript_path, encoding="utf-8")))
keep = [True] * len(words)
keep[10:15] = [False] * 5   # drop words 10-14
media_out, srt_out = run_text_edit("voice.mp3", transcript_path, keep)
```

## Web UI

For a no-terminal workflow (and so other devices on the same Wi-Fi can use it too):

```bash
./venv/bin/python web/app.py
```

This prints two URLs:

```
 * Local:   http://localhost:5050
 * Network: http://<your-lan-ip>:5050   (same Wi-Fi devices)
```

Open either in a browser. It has three tabs:

- **영상 처리** — upload a video, toggle 무음 제거 / 자막 / BGM and their sub-options, hit
  **영상 처리 시작**. Polls for progress until a **완성본 다운로드** button appears with the final mp4.
- **음성 무음 제거** — upload an audio file (mp3/wav/m4a/aac/flac/ogg), set the silence
  threshold/duration, hit **무음 제거 시작**. No captions or BGM here (those need a video track to
  render onto) — just the same audio back with silence cut out.
- **텍스트 편집** — upload a video or audio file, hit **대본 추출 시작** to transcribe it, then click
  any word in the resulting transcript to strike it out. Clicked (struck-through) words are cut
  from the audio; everything else is kept as-is, including natural pauses between kept words. Hit
  **수정본 생성** to cut the media and write a re-timed `.srt` around what's left, then download
  both. **전체 복원** clears all strikeouts back to the original transcript.

macOS will prompt to allow incoming network connections the first time you run it — allow it, or
only `localhost` will work (other devices on the network won't be able to reach it).

Notes on the web app:

- The video tab is `web/app.py` calling `scripts/pipeline.py`'s `process_one()` directly — same
  logic as the CLI, just driven by a browser form instead of argv. The audio tab calls
  `rough_cut.py`'s `run_rough_cut()` directly (which auto-detects audio-only input via
  `has_video_stream()` and trims/concatenates just the audio track, skipping the video filter
  graph — see below). Neither path has a separate implementation to keep in sync with the CLI.
- Jobs run **one at a time** on a single background worker thread (queued if you submit more than
  one, from either tab) — WhisperX is CPU-heavy, and this is meant for personal/small-group use,
  not concurrent multi-user load.
- Uploaded files are saved to `input/<job-id>_<filename>` so concurrent jobs never collide; a BGM
  file uploaded through "직접 업로드" is saved into `music/` and stays there for next time.
- This is Flask's development server (`werkzeug`), not a production WSGI server — fine for local/
  LAN use, not for exposing to the open internet.

## How the pieces fit together

- **transcribe.py** runs WhisperX (transcribe + forced alignment) on the *original* video and
  writes `transcripts/<stem>.json`: segments with word-level `start`/`end` timestamps.
- **rough_cut.py** detects silence directly on the original audio (`ffmpeg silencedetect`,
  independent of the transcript) and cuts those gaps out via `filter_complex trim/atrim + concat`.
  It also writes `temp/<stem>_cutlist.json`, mapping each kept `[orig_start, orig_end]` range to
  its new `[cut_start, cut_end]` position — this is what lets later steps make sense of a video
  whose timeline no longer matches the transcript's. Also works on audio-only files (mp3/wav/...):
  `has_video_stream()` checks for a real video stream (ignoring mp3/m4a embedded cover art, which
  ffprobe reports as a video stream too) and routes to an audio-only trim/concat when there isn't
  one, so `rough_cut.py my_voice.mp3` "just works" and produces a `.mp3` back, not a `.mp4`.
- **captions.py** loads the transcript (original timeline) and the cutlist, remaps every word's
  timestamp onto the cut timeline (dropping words whose audio was cut as silence), groups the
  survivors into short caption chunks (by word count / char count / pause length), builds an
  `.ass` subtitle file, and burns it in via ffmpeg's `ass` filter (libass).
- **bgm.py** loops/trims a track from `music/` to the video's duration and mixes it under the
  existing audio. By default it ducks the BGM with `sidechaincompress` keyed off the speech track
  so music dips automatically while someone's talking; `--no-duck` falls back to a flat
  `--bgm-volume` instead.
- **pipeline.py** chains all four, passing each step's output to the next. Any step can be skipped
  with `--skip-transcribe` / `--skip-rough-cut` / `--skip-captions` / `--skip-bgm` (skipping
  rough_cut also disables the cutlist remap in captions.py — it treats timestamps as identity).
- **subtitles.py** is a separate utility for when you just want a subtitle file, not a burned-in
  video: point it at any audio or video file and it transcribes (reusing `transcribe.py`'s
  `run_transcribe`, or an existing `transcripts/<stem>.json` if present) and writes `.srt`/`.vtt`
  at the transcript's original timestamps — no cutlist involved, since nothing is being cut.
  Chunking reuses `captions.py`'s `group_into_chunks`, just with subtitle-appropriate defaults
  (`max_words=12`, `max_chars=42` — the standard subtitle line-length guideline — instead of the
  short chunks tuned for vertical-video caption burn-in).
- **text_edit.py** turns a person's word-level edits to a transcript into cut media: the runs of
  words marked "drop" are merged into `(start, end)` spans and fed to `rough_cut.py`'s
  `compute_keep_segments()` / `cut_video()` / `cut_audio()` exactly as if they were detected
  silence — a deleted phrase and a silent gap are both just "a span to cut out" to that code. The
  resulting cutlist is remapped through `captions.py`'s `build_remapper()` the same way a
  silence-based rough cut is, and the kept words are re-chunked into an `.srt` via `subtitles.py`'s
  `build_srt()`. No burned-in captions here — output is the cut media plus a standalone `.srt`,
  same shape as `subtitles.py`'s output.

## Notes

- Automatic "bad take" detection (re-recorded lines, filler words, etc.) is not implemented —
  `text_edit.py` covers the manual side (a person marks what to drop in the transcript), but
  nothing auto-flags candidates yet. The cutlist mechanism is generic, so a future detector could
  produce the same kind of keep/remove ranges and reuse `cut_video()` / the remap logic as-is.
- Captions default to **Apple SD Gothic Neo** (bundled with macOS, guaranteed present) rather than
  a webfont, since libass resolves fonts via local fontconfig, not a CDN.
- `venv/` is local and machine-specific — don't commit it.
