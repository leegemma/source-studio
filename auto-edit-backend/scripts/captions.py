"""Step 3: burn captions onto the (rough-cut) video from the WhisperX transcript.

If the video was rough-cut, word timestamps (which are relative to the
ORIGINAL video) are remapped onto the cut timeline using the cutlist that
rough_cut.py produced. Words that fell inside a removed silence gap are
dropped; words are grouped into short caption chunks and burned in via
ffmpeg's libass "ass" filter.

Usage:
    python scripts/captions.py my_video.mp4
    python scripts/captions.py my_video.mp4 --max-words 5 --font "Apple SD Gothic Neo"
"""

import argparse
import json

from common import (
    FFMPEG_BIN, TEMP_DIR, TRANSCRIPTS_DIR, ffprobe_json, log, resolve_input,
    run, stem_for,
)

TAIL_PAD_S = 0.20          # how long a caption lingers after its last word ends
MIN_GAP_BETWEEN_CHUNKS_S = 0.05


def load_cutlist(stem):
    path = TEMP_DIR / f"{stem}_cutlist.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_remapper(cutlist, fallback_duration):
    if cutlist is None:
        return lambda t: t  # identity: no rough cut happened
    segments = cutlist["segments"]

    def remap(t):
        for seg in segments:
            if seg["orig_start"] <= t <= seg["orig_end"]:
                return seg["cut_start"] + (t - seg["orig_start"])
        # word fell inside a removed silence gap (alignment jitter) — snap to the
        # nearest segment edge if it's close, otherwise drop the word.
        best = None
        best_dist = None
        for seg in segments:
            for orig_edge, cut_edge in ((seg["orig_start"], seg["cut_start"]), (seg["orig_end"], seg["cut_end"])):
                dist = abs(t - orig_edge)
                if best_dist is None or dist < best_dist:
                    best_dist, best = dist, cut_edge
        if best is not None and best_dist <= 0.3:
            return best
        return None

    return remap


def flatten_words_with_segments(transcript):
    """Flatten segment words into one list, plus per-segment index ranges.

    Returns (words, segments). words is exactly what flatten_words()
    returns (words missing a start/end timestamp are skipped). segments is
    [{"start", "end", "word_start", "word_end"}, ...] in transcript order,
    where words[word_start:word_end] (word_end exclusive) are that
    segment's surviving words. start/end are the segment's own transcript
    timestamps, NOT clamped to its surviving words' span. Segments with
    zero surviving words are dropped, so every entry covers at least one
    word and the index ranges concatenate back to the full words list.
    """
    words = []
    segments = []
    for seg in transcript["segments"]:
        word_start = len(words)
        for w in seg["words"]:
            if w["start"] is None or w["end"] is None:
                continue
            words.append(w)
        if len(words) > word_start:
            segments.append({
                "start": seg["start"],
                "end": seg["end"],
                "word_start": word_start,
                "word_end": len(words),
            })
    return words, segments


def flatten_words(transcript):
    words, _ = flatten_words_with_segments(transcript)
    return words


def remap_words(words, remap):
    out = []
    for w in words:
        cs = remap(w["start"])
        ce = remap(w["end"])
        if cs is None or ce is None or ce <= cs:
            continue
        out.append({"word": w["word"].strip(), "start": cs, "end": ce})
    return out


def group_into_chunks(words, max_words=6, max_chars=20, max_gap_s=0.7):
    chunks = []
    current = []

    def flush():
        if current:
            text = " ".join(w["word"] for w in current).strip()
            chunks.append({
                "text": text,
                "start": current[0]["start"],
                "end": current[-1]["end"],
            })

    def current_len():
        # Length of " ".join(current) — i.e. word lengths plus the spaces between them.
        if not current:
            return 0
        return sum(len(c["word"]) for c in current) + (len(current) - 1)

    prev_end = None
    for w in words:
        hypothetical_len = current_len() + (1 if current else 0) + len(w["word"])
        gap_too_big = prev_end is not None and (w["start"] - prev_end) > max_gap_s
        if current and (len(current) >= max_words or hypothetical_len > max_chars or gap_too_big):
            flush()
            current = []
        current.append(w)
        prev_end = w["end"]
    flush()

    # Cap each chunk's end time so it doesn't overlap the next chunk's start.
    for i, chunk in enumerate(chunks):
        end_with_pad = chunk["end"] + TAIL_PAD_S
        if i + 1 < len(chunks):
            end_with_pad = min(end_with_pad, chunks[i + 1]["start"] - MIN_GAP_BETWEEN_CHUNKS_S)
        chunk["end"] = max(end_with_pad, chunk["start"] + 0.05)

    return chunks


def format_ass_time(t: float) -> str:
    t = max(t, 0.0)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def escape_ass_text(text: str) -> str:
    return text.replace("{", "").replace("}", "").replace("\n", " ")


def default_max_chars(width, fontsize, margin_l=40, margin_r=40):
    """Estimate how many (worst-case full-width) glyphs fit on one line at this
    font size, so chunking rarely needs libass's WrapStyle-0 fallback to kick in."""
    usable = width - margin_l - margin_r
    approx_glyph_width = fontsize * 1.05  # CJK glyphs are roughly square at their em size
    return max(6, int(usable / approx_glyph_width))


def build_ass(chunks, width, height, font, fontsize, margin_v):
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{fontsize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for c in chunks:
        lines.append(
            f"Dialogue: 0,{format_ass_time(c['start'])},{format_ass_time(c['end'])},"
            f"Default,,0,0,0,,{escape_ass_text(c['text'])}"
        )
    return header + "\n".join(lines) + "\n"


def escape_filter_path(path) -> str:
    s = str(path)
    s = s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    return s


def run_captions(input_video, transcript_path=None, source_video=None,
                  max_words=6, max_chars=None, max_gap=0.7,
                  font="Apple SD Gothic Neo", fontsize=64, margin_v=120, out_path=None):
    """Remap transcript timestamps, group into chunks, burn captions. Returns out_path.

    max_chars=None auto-sizes the per-line character budget from the video width and
    fontsize (WrapStyle 0 in the .ass is still a safety net if a chunk overflows anyway).
    """
    stem = stem_for(input_video)

    transcript_path = transcript_path or (TRANSCRIPTS_DIR / f"{stem}.json")
    with open(transcript_path, encoding="utf-8") as f:
        transcript = json.load(f)

    if source_video is None:
        cut_video_path = TEMP_DIR / f"{stem}_cut.mp4"
        source_video = cut_video_path if cut_video_path.exists() else input_video

    probe = ffprobe_json(source_video)
    vstream = next(s for s in probe["streams"] if s["codec_type"] == "video")
    width, height = int(vstream["width"]), int(vstream["height"])

    if max_chars is None:
        max_chars = default_max_chars(width, fontsize)
        log(f"auto max_chars={max_chars} for width={width}, fontsize={fontsize}")

    cutlist = load_cutlist(stem)
    remap = build_remapper(cutlist, transcript["duration"])

    words = flatten_words(transcript)
    remapped = remap_words(words, remap)
    log(f"{len(words)} words in transcript, {len(remapped)} survive after remap to cut timeline")

    chunks = group_into_chunks(remapped, max_words, max_chars, max_gap)
    log(f"grouped into {len(chunks)} caption chunk(s)")

    ass_content = build_ass(chunks, width, height, font, fontsize, margin_v)
    ass_path = TEMP_DIR / f"{stem}_captions.ass"
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(ass_content)
    log(f"wrote {ass_path}")

    out_path = out_path or (TEMP_DIR / f"{stem}_captioned.mp4")
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(source_video),
        "-vf", f"ass={escape_filter_path(ass_path)}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy",
        str(out_path),
    ]
    run(cmd)
    log(f"wrote {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Burn word-grouped captions onto a video.")
    parser.add_argument("video", help="Filename in input/, or a path to a video file "
                                       "(used to derive the transcript/cutlist stem)")
    parser.add_argument("--transcript", default=None, help="Transcript JSON path (default: transcripts/<stem>.json)")
    parser.add_argument("--source-video", default=None,
                         help="Video to actually burn captions onto (default: temp/<stem>_cut.mp4 if it "
                              "exists from rough_cut.py, else the input video itself)")
    parser.add_argument("--max-words", type=int, default=6, help="Max words per caption chunk (default: 6)")
    parser.add_argument("--max-chars", type=int, default=None,
                         help="Max characters per caption chunk (default: auto-computed from video width/fontsize)")
    parser.add_argument("--max-gap", type=float, default=0.7, help="Seconds of silence that forces a new chunk (default: 0.7)")
    parser.add_argument("--font", default="Apple SD Gothic Neo", help="Font family for captions")
    parser.add_argument("--fontsize", type=int, default=64)
    parser.add_argument("--margin-v", type=int, default=120, help="Bottom margin in pixels at PlayRes scale")
    parser.add_argument("-o", "--output", default=None, help="Output video path (default: temp/<stem>_captioned.mp4)")
    args = parser.parse_args()

    input_video = resolve_input(args.video)
    source_video = resolve_input(args.source_video) if args.source_video else None

    run_captions(
        input_video,
        transcript_path=args.transcript,
        source_video=source_video,
        max_words=args.max_words,
        max_chars=args.max_chars,
        max_gap=args.max_gap,
        font=args.font,
        fontsize=args.fontsize,
        margin_v=args.margin_v,
        out_path=args.output,
    )


if __name__ == "__main__":
    main()
