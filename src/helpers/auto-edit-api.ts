// Typed client for auto-edit-backend's Flask REST API. Every browser call goes
// through the same-origin /api/auto-edit/* rewrite in next.config.js (proxied
// server-side to the actual Flask process) rather than a hardcoded backend
// origin -- see the comment on that rewrite for why (LAN access correctness).
//
// One typed function per job-creation endpoint rather than a single generic
// `submitJob(kind, formData)`: the four creation endpoints accept meaningfully
// different field sets, and a shared stringly-typed FormData builder would
// silently let a field-name typo drift between panels with no compile error.

const BASE = "/api/auto-edit";

export class AutoEditApiError extends Error {}

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok) throw new AutoEditApiError(json.error ?? "요청에 실패했습니다.");
  return json as T;
}

export type JobKind = "video" | "audio_trim" | "enhance" | "transcribe" | "text_edit";

// ---- shared job status shape (GET /api/jobs/<id>) ----

export type JobStatus = "queued" | "running" | "done" | "error";

export type TranscriptWord = {
  word: string;
  start: number;
  end: number;
  is_event?: boolean; // synthetic cough/throat-clear placeholder, e.g. "[기침]"
};

export type TranscriptSegment = {
  start: number;
  end: number;
  word_start: number;
  word_end: number;
};

export type JobStatusResponse = {
  status: JobStatus;
  progress: number;
  messages: string[];
  download_name: string | null;
  error: string | null;
  // present only for done "transcribe" jobs
  words?: TranscriptWord[];
  filler_flags?: boolean[];
  cough_flags?: boolean[];
  segments?: TranscriptSegment[];
  silence_cut_applied?: boolean;
  // present only for done "text_edit" jobs -- sorted file_key names, e.g. ["media","srt"]
  download_files?: string[];
};

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${BASE}/jobs/${jobId}`);
  const json = await res.json();
  if (!res.ok) throw new AutoEditApiError(json.error ?? "상태 조회에 실패했습니다.");
  return json as JobStatusResponse;
}

// download/preview are plain URLs (used as <a href>/<video src>/<audio src>
// directly) rather than fetch wrappers -- the browser's native download/media
// handling already does the right thing with a URL, and re-fetching+blobbing
// here would lose the server's Range-request support for seeking.
export function jobDownloadUrl(jobId: string): string {
  return `${BASE}/jobs/${jobId}/download`;
}
export function jobDownloadFileUrl(jobId: string, fileKey: string): string {
  return `${BASE}/jobs/${jobId}/download/${fileKey}`;
}
export function jobPreviewUrl(jobId: string): string {
  return `${BASE}/jobs/${jobId}/preview`;
}

export async function listMusic(): Promise<string[]> {
  const res = await fetch(`${BASE}/music`);
  if (!res.ok) return [];
  return (await res.json()) as string[];
}

// ---- 영상 처리 (POST /api/jobs) ----

export type CreateVideoJobParams = {
  file?: File;
  reuseJobId?: string;
  useRoughCut: boolean;
  useCaptions: boolean;
  useBgm: boolean;
  duck: boolean;
  bgmChoice: string; // "none" | "upload" | a filename from listMusic()
  bgmFile?: File;
  model: string; // "small" | "medium" | "large-v3"
  language: string; // "ko" | "en" | "auto"
  silenceThreshold: number;
  minSilence: number;
  silenceMethod: "ffmpeg" | "vad";
  fontsize: number;
  bgmVolume: number;
};

export async function createVideoJob(p: CreateVideoJobParams): Promise<{ job_id: string }> {
  const fd = new FormData();
  if (p.file) fd.set("video", p.file);
  else if (p.reuseJobId) fd.set("reuse_job_id", p.reuseJobId);
  fd.set("use_rough_cut", String(p.useRoughCut));
  fd.set("use_captions", String(p.useCaptions));
  fd.set("use_bgm", String(p.useBgm));
  fd.set("duck", String(p.duck));
  fd.set("bgm_choice", p.bgmChoice);
  if (p.bgmFile) fd.set("bgm_file", p.bgmFile);
  fd.set("model", p.model);
  fd.set("language", p.language);
  fd.set("silence_threshold", String(p.silenceThreshold));
  fd.set("min_silence", String(p.minSilence));
  fd.set("silence_method", p.silenceMethod);
  fd.set("fontsize", String(p.fontsize));
  fd.set("bgm_volume", String(p.bgmVolume));
  return postForm("/jobs", fd);
}

// ---- 음성 무음 제거 (POST /api/audio-jobs) ----

export type CreateAudioTrimJobParams = {
  file?: File;
  reuseJobId?: string;
  silenceThreshold: number;
  minSilence: number;
  padding: number;
  silenceMethod: "ffmpeg" | "vad";
};

export async function createAudioTrimJob(
  p: CreateAudioTrimJobParams,
): Promise<{ job_id: string }> {
  const fd = new FormData();
  if (p.file) fd.set("audio", p.file);
  else if (p.reuseJobId) fd.set("reuse_job_id", p.reuseJobId);
  fd.set("silence_threshold", String(p.silenceThreshold));
  fd.set("min_silence", String(p.minSilence));
  fd.set("padding", String(p.padding));
  fd.set("silence_method", p.silenceMethod);
  return postForm("/audio-jobs", fd);
}

// ---- 사운드 개선 (POST /api/enhance-jobs) ----

export type CreateEnhanceJobParams = {
  file?: File;
  reuseJobId?: string;
  denoise: boolean;
  targetLufs: number;
  highpassHz: number;
};

export async function createEnhanceJob(
  p: CreateEnhanceJobParams,
): Promise<{ job_id: string }> {
  const fd = new FormData();
  if (p.file) fd.set("audio", p.file);
  else if (p.reuseJobId) fd.set("reuse_job_id", p.reuseJobId);
  fd.set("denoise", String(p.denoise));
  fd.set("target_lufs", String(p.targetLufs));
  fd.set("highpass_hz", String(p.highpassHz));
  return postForm("/enhance-jobs", fd);
}

// ---- 텍스트 편집: step 1, transcribe (POST /api/transcribe-jobs) ----

export type CreateTranscribeJobParams = {
  file: File;
  model: string;
  language: string;
  useSilenceCut: boolean;
  silenceThreshold: number;
  minSilence: number;
  padding: number;
  silenceMethod: "ffmpeg" | "vad";
};

export async function createTranscribeJob(
  p: CreateTranscribeJobParams,
): Promise<{ job_id: string }> {
  const fd = new FormData();
  fd.set("media", p.file);
  fd.set("model", p.model);
  fd.set("language", p.language);
  fd.set("use_silence_cut", String(p.useSilenceCut));
  fd.set("silence_threshold", String(p.silenceThreshold));
  fd.set("min_silence", String(p.minSilence));
  fd.set("padding", String(p.padding));
  fd.set("silence_method", p.silenceMethod);
  return postForm("/transcribe-jobs", fd);
}

// ---- 텍스트 편집: step 2, cut + re-time subtitles (POST /api/text-edit-jobs) ----

export async function createTextEditJob(
  transcribeJobId: string,
  keep: boolean[],
): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/text-edit-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id: transcribeJobId, keep }),
  });
  const json = await res.json();
  if (!res.ok) throw new AutoEditApiError(json.error ?? "요청에 실패했습니다.");
  return json;
}
