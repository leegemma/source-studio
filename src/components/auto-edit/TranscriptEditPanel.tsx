"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AutoEditApiError,
  TranscriptSegment,
  TranscriptWord,
  createTextEditJob,
  createTranscribeJob,
  jobDownloadFileUrl,
  jobPreviewUrl,
} from "../../helpers/auto-edit-api";
import { useAutoEditJob } from "../../helpers/use-auto-edit-job";
import { Button } from "../Button";
import { ErrorComp } from "../Error";
import { Dropzone } from "./Dropzone";
import { JobProgressBlock } from "./JobProgressBlock";
import { SegmentedToggle } from "./SegmentedToggle";
import { SliderRow } from "./SliderRow";
import { ToggleRow } from "./ToggleRow";
import { TranscriptTimeline } from "./TranscriptTimeline";

type Phase = "upload" | "transcribing" | "editor" | "generating" | "done";
type PreCutMode = "auto" | "manual";
type PreCutMethod = "ffmpeg" | "vad";

const DEFAULTS = {
  useSilenceCut: true,
  mode: "auto" as PreCutMode,
  method: "ffmpeg" as PreCutMethod,
  silenceThreshold: -30,
  minSilence: 0.5,
  padding: 0.15,
  model: "medium",
  language: "ko",
};

// H:MM:SS.d, hours dropped when 0 (MM:SS.d) -- matches the old app's format exactly.
function formatTimecode(t: number): string {
  t = Math.round(Math.max(0, t || 0) * 10) / 10;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t - h * 3600 - m * 60;
  const mm = String(m).padStart(2, "0");
  const ss = (s < 10 ? "0" : "") + s.toFixed(1);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// segments is only trusted when it's an in-order, gap-free cover of words;
// otherwise fall back to one segment spanning everything (same rule the old
// app's normalizeSegments() used).
function normalizeSegments(raw: TranscriptSegment[] | undefined, words: TranscriptWord[]): TranscriptSegment[] {
  const fallback: TranscriptSegment[] = words.length
    ? [{ start: words[0].start || 0, end: words[words.length - 1].end || 0, word_start: 0, word_end: words.length }]
    : [];
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const segs: TranscriptSegment[] = [];
  let expected = 0;
  for (const s of raw) {
    if (!s || !Number.isInteger(s.word_start) || !Number.isInteger(s.word_end)) return fallback;
    if (s.word_start !== expected || s.word_end <= s.word_start) return fallback;
    segs.push(s);
    expected = s.word_end;
  }
  if (expected !== words.length) return fallback;
  return segs;
}

export const TranscriptEditPanel: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("upload");
  const [file, setFile] = useState<File | null>(null);

  // pre-cut settings
  const [useSilenceCut, setUseSilenceCut] = useState(DEFAULTS.useSilenceCut);
  const [mode, setMode] = useState<PreCutMode>(DEFAULTS.mode);
  const [method, setMethod] = useState<PreCutMethod>(DEFAULTS.method);
  const [silenceThreshold, setSilenceThreshold] = useState(DEFAULTS.silenceThreshold);
  const [minSilence, setMinSilence] = useState(DEFAULTS.minSilence);
  const [padding, setPadding] = useState(DEFAULTS.padding);
  const [model, setModel] = useState(DEFAULTS.model);
  const [language, setLanguage] = useState(DEFAULTS.language);

  const transcribeJob = useAutoEditJob();
  const generateJob = useAutoEditJob();

  // editor data, populated once transcribeJob reaches "done"
  const [transcribeJobId, setTranscribeJobId] = useState<string | null>(null);
  const [words, setWords] = useState<TranscriptWord[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [fillerFlags, setFillerFlags] = useState<boolean[]>([]);
  const [coughFlags, setCoughFlags] = useState<boolean[]>([]);
  const [silenceCutApplied, setSilenceCutApplied] = useState(false);
  const [keepFlags, setKeepFlags] = useState<boolean[]>([]);

  // search
  const [query, setQuery] = useState("");
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  // drag-to-select-range delete
  const [selRange, setSelRange] = useState<{ start: number; end: number } | null>(null);
  const wordListRef = useRef<HTMLDivElement>(null);

  // playback
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [skipCuts, setSkipCuts] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaUrl = transcribeJobId ? jobPreviewUrl(transcribeJobId) : null;

  // ---- submit transcribe ----
  const submitTranscribe = useCallback(async () => {
    if (!file) return;
    setErrorMessage(null);
    setPhase("transcribing");
    transcribeJob.setSubmitting();
    try {
      const { job_id } = await createTranscribeJob({
        file,
        model,
        language,
        useSilenceCut,
        silenceThreshold: mode === "auto" ? DEFAULTS.silenceThreshold : silenceThreshold,
        minSilence: mode === "auto" ? DEFAULTS.minSilence : minSilence,
        padding: mode === "auto" ? DEFAULTS.padding : padding,
        silenceMethod: method,
      });
      setTranscribeJobId(job_id);
      transcribeJob.startPolling(job_id);
    } catch (err) {
      setPhase("upload");
      setErrorMessage(err instanceof AutoEditApiError ? err.message : "요청에 실패했습니다.");
    }
  }, [file, model, language, useSilenceCut, mode, method, silenceThreshold, minSilence, padding, transcribeJob]);

  // once transcribe completes, populate editor state
  useEffect(() => {
    if (transcribeJob.state.status !== "done") return;
    const job = transcribeJob.state.job;
    const w = job.words ?? [];
    setWords(w);
    setSegments(normalizeSegments(job.segments, w));
    setFillerFlags(Array.isArray(job.filler_flags) && job.filler_flags.length === w.length ? job.filler_flags : w.map(() => false));
    setCoughFlags(Array.isArray(job.cough_flags) && job.cough_flags.length === w.length ? job.cough_flags : w.map(() => false));
    setSilenceCutApplied(!!job.silence_cut_applied);
    setKeepFlags(w.map(() => true));
    setPhase("editor");
    // Deliberately keyed only on transcribeJob.state.status, not the whole
    // state object -- this effect must run exactly once when the status
    // transitions to "done", not on every state re-render while queued/running.
  }, [transcribeJob.state.status]);

  useEffect(() => {
    if (transcribeJob.state.status === "error") {
      setErrorMessage(transcribeJob.state.message);
      setPhase("upload");
    }
  }, [transcribeJob.state]);

  const coughActive = coughFlags.some(Boolean) && words.some((w) => w.is_event);

  const toggleWord = useCallback((idx: number) => {
    setKeepFlags((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }, []);

  const setAllFiller = useCallback(
    (removed: boolean) => {
      setKeepFlags((prev) => prev.map((v, i) => (fillerFlags[i] ? !removed : v)));
    },
    [fillerFlags],
  );
  const setAllCough = useCallback(
    (removed: boolean) => {
      setKeepFlags((prev) => prev.map((v, i) => (coughFlags[i] ? !removed : v)));
    },
    [coughFlags],
  );
  const restoreAll = useCallback(() => {
    setKeepFlags(words.map(() => true));
  }, [words]);

  // ---- search (kept, non-event words only) ----
  const searchMatches = useMemo(() => {
    if (!query.trim()) return [] as number[];
    const q = query.trim().toLowerCase();
    const out: number[] = [];
    words.forEach((w, i) => {
      if (keepFlags[i] && !w.is_event && w.word.toLowerCase().includes(q)) out.push(i);
    });
    return out;
  }, [query, words, keepFlags]);

  useEffect(() => setActiveMatchIdx(0), [query]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const idx = searchMatches[((activeMatchIdx % searchMatches.length) + searchMatches.length) % searchMatches.length];
    const el = wordListRef.current?.querySelector(`[data-word-index="${idx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeMatchIdx, searchMatches]);

  // ---- drag-to-select range delete ----
  const handleSelectionChange = useCallback(() => {
    const container = wordListRef.current;
    if (!container) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelRange(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setSelRange(null);
      return;
    }
    const spans = container.querySelectorAll("[data-word-index]");
    let start: number | null = null;
    let end: number | null = null;
    spans.forEach((el) => {
      if (range.intersectsNode(el)) {
        const idx = Number((el as HTMLElement).dataset.wordIndex);
        if (start === null || idx < start) start = idx;
        if (end === null || idx > end) end = idx;
      }
    });
    setSelRange(start !== null && end !== null && start !== end ? { start, end } : null);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  const deleteSelection = useCallback(() => {
    if (!selRange) return;
    setKeepFlags((prev) => {
      const next = [...prev];
      for (let i = selRange.start; i <= selRange.end; i++) next[i] = false;
      return next;
    });
    window.getSelection()?.removeAllRanges();
    setSelRange(null);
  }, [selRange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selRange) {
        const active = document.activeElement;
        const inTextInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
        if (!inTextInput) {
          e.preventDefault();
          deleteSelection();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selRange, deleteSelection]);

  // ---- playback: karaoke highlight + skip-cuts ----
  const struckRuns = useMemo(() => {
    const runs: { start: number; end: number }[] = [];
    let curStart: number | null = null;
    let curEnd: number | null = null;
    words.forEach((w, i) => {
      if (!keepFlags[i]) {
        if (curStart === null) curStart = w.start;
        curEnd = w.end;
      } else if (curStart !== null) {
        runs.push({ start: curStart, end: curEnd! });
        curStart = curEnd = null;
      }
    });
    if (curStart !== null) runs.push({ start: curStart, end: curEnd! });
    return runs;
  }, [words, keepFlags]);

  const currentWordIdx = useMemo(() => {
    return words.findIndex((w, i) => keepFlags[i] && w.start <= currentTime && currentTime < w.end);
  }, [words, keepFlags, currentTime]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    setCurrentTime(t);
    if (skipCuts) {
      const run = struckRuns.find((r) => t >= r.start && t < r.end);
      if (run) audio.currentTime = run.end;
    }
  }, [skipCuts, struckRuns]);

  const seekTo = useCallback((t: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = t;
    setCurrentTime(t);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  // ---- generate (수정본 생성) ----
  const generate = useCallback(async () => {
    if (!transcribeJobId) return;
    setPhase("generating");
    generateJob.setSubmitting();
    try {
      const { job_id } = await createTextEditJob(transcribeJobId, keepFlags);
      generateJob.startPolling(job_id);
    } catch (err) {
      setPhase("editor");
      setErrorMessage(err instanceof AutoEditApiError ? err.message : "요청에 실패했습니다.");
    }
  }, [transcribeJobId, keepFlags, generateJob]);

  useEffect(() => {
    if (generateJob.state.status === "done") setPhase("done");
    if (generateJob.state.status === "error") {
      setErrorMessage(generateJob.state.message);
      setPhase("editor");
    }
  }, [generateJob.state]);

  const resetAll = useCallback(() => {
    setPhase("upload");
    setFile(null);
    setUseSilenceCut(DEFAULTS.useSilenceCut);
    setMode(DEFAULTS.mode);
    setMethod(DEFAULTS.method);
    setSilenceThreshold(DEFAULTS.silenceThreshold);
    setMinSilence(DEFAULTS.minSilence);
    setPadding(DEFAULTS.padding);
    setModel(DEFAULTS.model);
    setLanguage(DEFAULTS.language);
    setTranscribeJobId(null);
    setWords([]);
    setSegments([]);
    setFillerFlags([]);
    setCoughFlags([]);
    setSilenceCutApplied(false);
    setKeepFlags([]);
    setQuery("");
    setSelRange(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setErrorMessage(null);
    transcribeJob.reset();
    generateJob.reset();
  }, [transcribeJob, generateJob]);

  const fillerCount = fillerFlags.filter(Boolean).length;
  const coughCount = coughFlags.filter(Boolean).length;
  const keptCount = keepFlags.filter(Boolean).length;

  // ================= render =================

  if (phase === "upload" || phase === "transcribing") {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="w-full max-w-md flex flex-col gap-4">
          <span className="text-xs uppercase tracking-wide text-subtitle">텍스트 편집</span>

          {phase === "transcribing" ? (
            <JobProgressBlock
              job={transcribeJob.state.status === "queued" || transcribeJob.state.status === "running" ? transcribeJob.state.job : { status: "queued", progress: 0, messages: [], download_name: null, error: null }}
              idleLabel="대본 추출 중..."
            />
          ) : (
            <>
              <Dropzone
                accept="video/*,audio/*"
                file={file}
                onFileChange={setFile}
                placeholder="음성 또는 영상 파일을 드래그하거나 클릭해서 선택하세요"
              />

              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-subtitle">인식 정확도</span>
                <select
                  className="w-full rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none"
                  value={model}
                  onChange={(e) => setModel(e.currentTarget.value)}
                >
                  <option value="small">빠름 (small)</option>
                  <option value="medium">보통 (medium)</option>
                  <option value="large-v3">정확함 (large-v3, 느림)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-subtitle">언어</span>
                <select
                  className="w-full rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none"
                  value={language}
                  onChange={(e) => setLanguage(e.currentTarget.value)}
                >
                  <option value="ko">한국어</option>
                  <option value="en">영어</option>
                  <option value="auto">자동 감지</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-unfocused-border-color">
                <ToggleRow label="무음 구간 먼저 제거" checked={useSilenceCut} onChange={setUseSilenceCut} />
                {useSilenceCut ? (
                  <>
                    <SegmentedToggle
                      options={[
                        { value: "auto", label: "자동" },
                        { value: "manual", label: "수동" },
                      ]}
                      value={mode}
                      onChange={setMode}
                    />
                    {mode === "manual" ? (
                      <>
                        <SegmentedToggle
                          options={[
                            { value: "ffmpeg", label: "기본" },
                            { value: "vad", label: "AI 정밀 (Silero VAD)" },
                          ]}
                          value={method}
                          onChange={setMethod}
                        />
                        {method === "ffmpeg" ? (
                          <SliderRow
                            label="볼륨 임계값"
                            value={silenceThreshold}
                            min={-60}
                            max={-5}
                            step={0.5}
                            onChange={setSilenceThreshold}
                            format={(v) => `${v.toFixed(1)} dB`}
                          />
                        ) : null}
                        <SliderRow
                          label="기간"
                          value={minSilence}
                          min={0.1}
                          max={3}
                          step={0.1}
                          onChange={setMinSilence}
                          format={(v) => `${v.toFixed(1)} 초`}
                        />
                        <SliderRow
                          label="딜레이"
                          value={padding}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={setPadding}
                          format={(v) => `${v.toFixed(2)} 초`}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>

              {errorMessage ? <ErrorComp message={errorMessage} /> : null}

              <Button primary disabled={!file} onClick={submitTranscribe}>
                대본 추출 시작
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const fileKeys = generateJob.state.status === "done" ? (generateJob.state.job.download_files ?? []) : [];
    const labels: Record<string, string> = { media: "수정된 음성/영상 다운로드", srt: "자막(.srt) 다운로드" };
    const jobId = generateJob.state.status === "done" ? generateJob.state.jobId : "";
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="w-full max-w-md flex flex-col gap-3">
          <span className="text-xs uppercase tracking-wide text-subtitle">텍스트 편집 완료</span>
          {fileKeys.map((key) => (
            <a key={key} href={jobDownloadFileUrl(jobId, key)}>
              <Button>⬇ {labels[key] ?? key}</Button>
            </a>
          ))}
          <Button secondary onClick={resetAll}>
            새로 시작하기
          </Button>
        </div>
      </div>
    );
  }

  // phase === "editor" | "generating"
  return (
    <div className="flex h-full w-full flex-col gap-3 p-6 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs uppercase tracking-wide text-subtitle">
          대본 편집 — 지울 단어를 클릭하거나 드래그로 선택하세요
        </span>
        <span className="text-xs text-subtitle tabular-nums">
          {keptCount} / {words.length} 단어 유지
        </span>
      </div>

      {phase === "generating" ? (
        <div className="max-w-md">
          <JobProgressBlock
            job={generateJob.state.status === "queued" || generateJob.state.status === "running" ? generateJob.state.job : { status: "queued", progress: 0, messages: [], download_name: null, error: null }}
            idleLabel="수정본 생성 중..."
          />
        </div>
      ) : null}

      {errorMessage ? <ErrorComp message={errorMessage} /> : null}

      {fillerCount > 0 ? (
        <div className="flex items-center justify-between rounded-geist border border-[#3a2f14] bg-[#26210f] px-3 py-2 shrink-0">
          <span className="text-xs font-semibold text-[#fde047]">필러 단어 후보 {fillerCount}개</span>
          <div className="flex gap-2">
            <button onClick={() => setAllFiller(true)} className="text-xs text-subtitle hover:text-foreground underline">
              필러 모두 제거
            </button>
            <button onClick={() => setAllFiller(false)} className="text-xs text-subtitle hover:text-foreground underline">
              필러 모두 복원
            </button>
          </div>
        </div>
      ) : null}

      {coughActive && coughCount > 0 ? (
        <div className="flex items-center justify-between rounded-geist border border-[#3a1f24] bg-[#26141a] px-3 py-2 shrink-0">
          <span className="text-xs font-semibold text-rose-300">기침 후보 {coughCount}개</span>
          <div className="flex gap-2">
            <button onClick={() => setAllCough(true)} className="text-xs text-subtitle hover:text-foreground underline">
              기침 모두 제거
            </button>
            <button onClick={() => setAllCough(false)} className="text-xs text-subtitle hover:text-foreground underline">
              기침 모두 복원
            </button>
          </div>
        </div>
      ) : null}

      {mediaUrl ? (
        <div className="flex flex-col gap-2 shrink-0">
          <audio
            ref={audioRef}
            src={mediaUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="hidden"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
              aria-label="재생/일시정지"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <span className="text-xs text-subtitle tabular-nums">
              {formatTimecode(currentTime)} / {formatTimecode(duration)}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-subtitle cursor-pointer select-none">
              <input type="checkbox" checked={skipCuts} onChange={(e) => setSkipCuts(e.currentTarget.checked)} className="accent-white" />
              삭제 구간 건너뛰기
            </label>
          </div>
          <TranscriptTimeline
            mediaUrl={mediaUrl}
            filename={silenceCutApplied ? "편집 대상 (무음 제거됨)" : "편집 대상"}
            duration={duration}
            currentTime={currentTime}
            cutRanges={struckRuns}
            onSeek={seekTo}
          />
        </div>
      ) : null}

      {/* search */}
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setActiveMatchIdx((i) => i + 1);
          }}
          placeholder="대본에서 검색"
          className="flex-1 rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none"
        />
        {query ? (
          <button onClick={() => setQuery("")} className="text-subtitle hover:text-foreground text-xs px-1" aria-label="검색어 지우기">
            ✕
          </button>
        ) : null}
        <span className="text-xs text-subtitle tabular-nums min-w-[38px] text-center">
          {searchMatches.length > 0 ? `${(activeMatchIdx % searchMatches.length) + 1}/${searchMatches.length}` : "0/0"}
        </span>
        <button
          onClick={() => setActiveMatchIdx((i) => i - 1)}
          disabled={searchMatches.length === 0}
          className="text-subtitle hover:text-foreground disabled:opacity-30 text-xs px-1"
        >
          ▲
        </button>
        <button
          onClick={() => setActiveMatchIdx((i) => i + 1)}
          disabled={searchMatches.length === 0}
          className="text-subtitle hover:text-foreground disabled:opacity-30 text-xs px-1"
        >
          ▼
        </button>
        {selRange ? (
          <Button secondary onClick={deleteSelection}>
            선택 삭제
          </Button>
        ) : null}
      </div>

      {/* transcript */}
      <div ref={wordListRef} className="flex-1 overflow-y-auto rounded-geist border border-unfocused-border-color bg-white/[0.02] p-4">
        {segments.map((seg, segIdx) => (
          <div key={segIdx} className="mb-4">
            <button
              onClick={() => seekTo(seg.start)}
              className="block text-[11px] text-subtitle hover:text-foreground mb-1"
            >
              {formatTimecode(seg.start)} - {formatTimecode(seg.end)}
            </button>
            <p className="text-[15px] leading-[1.8] text-foreground">
              {Array.from({ length: seg.word_end - seg.word_start }, (_, i) => seg.word_start + i).map((idx) => {
                const w = words[idx];
                if (!w) return null;
                const isEvent = !!w.is_event;
                const isFiller = fillerFlags[idx];
                const isStruck = !keepFlags[idx];
                const isMatch = searchMatches.includes(idx);
                const isActiveMatch = searchMatches.length > 0 && searchMatches[((activeMatchIdx % searchMatches.length) + searchMatches.length) % searchMatches.length] === idx;
                const isKaraoke = idx === currentWordIdx;

                const classes = [
                  "cursor-pointer rounded transition-colors duration-100",
                  isEvent ? "px-1.5 py-0.5 mx-0.5 text-[13px] rounded-full border" : "px-0.5",
                ];
                if (isEvent) {
                  classes.push(
                    isStruck
                      ? "bg-rose-500/[0.07] border-rose-800 text-subtitle line-through opacity-60"
                      : "bg-rose-500/[0.12] border-rose-800 text-rose-300",
                  );
                } else if (isStruck) {
                  classes.push("line-through text-subtitle opacity-50");
                  if (isFiller) classes.push("bg-amber-400/[0.07]");
                } else if (isFiller) {
                  classes.push("text-amber-300 underline decoration-dotted decoration-amber-500/70 underline-offset-4");
                }
                if (isKaraoke && !isStruck) classes.push("bg-teal-500/20");
                if (isActiveMatch) classes.push("bg-orange-500/50");
                else if (isMatch) classes.push("bg-amber-400/30");

                return (
                  <span key={idx} data-word-index={idx} onClick={() => toggleWord(idx)} className={classes.join(" ")}>
                    {w.word}{" "}
                  </span>
                );
              })}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 shrink-0">
        <Button secondary onClick={restoreAll}>
          전체 복원
        </Button>
        <Button secondary onClick={resetAll}>
          새로 시작하기
        </Button>
        <div className="flex-1">
          <Button primary disabled={phase === "generating"} loading={phase === "generating"} onClick={generate}>
            수정본 생성 (음성 + 자막)
          </Button>
        </div>
      </div>
    </div>
  );
};
