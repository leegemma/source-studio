"use client";

import React, { useCallback, useState } from "react";
import {
  AutoEditApiError,
  createAudioTrimJob,
  jobDownloadUrl,
  jobPreviewUrl,
} from "../../helpers/auto-edit-api";
import { useAutoEditJob } from "../../helpers/use-auto-edit-job";
import { Button } from "../Button";
import { ErrorComp } from "../Error";
import { Dropzone } from "./Dropzone";
import { JobProgressBlock } from "./JobProgressBlock";
import { ResultPreview } from "./ResultPreview";
import { SegmentedToggle } from "./SegmentedToggle";
import { SliderRow } from "./SliderRow";

type Mode = "auto" | "manual";
type Method = "ffmpeg" | "vad";

const DEFAULTS = { silenceThreshold: -30, minSilence: 0.5, padding: 0.15 };

export const SilenceRemovalPanel: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [method, setMethod] = useState<Method>("ffmpeg");
  const [silenceThreshold, setSilenceThreshold] = useState(DEFAULTS.silenceThreshold);
  const [minSilence, setMinSilence] = useState(DEFAULTS.minSilence);
  const [padding, setPadding] = useState(DEFAULTS.padding);

  // re-run without re-upload: tracks the exact File object last submitted so
  // 설정 수정하기 -> 다시 실행 with the same file (unchanged selection) sends
  // reuse_job_id instead of re-uploading, mirroring the old app's feature.
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [lastSubmittedFile, setLastSubmittedFile] = useState<File | null>(null);
  const [viewingSettings, setViewingSettings] = useState(true);

  const { state, startPolling, setSubmitting, setError, reset } = useAutoEditJob();

  const submit = useCallback(async () => {
    if (!file && !lastJobId) return;
    setSubmitting();
    setViewingSettings(false);
    const canReuse = !!(lastJobId && file && file === lastSubmittedFile);
    try {
      const { job_id } = await createAudioTrimJob({
        file: canReuse ? undefined : (file ?? undefined),
        reuseJobId: canReuse ? lastJobId : undefined,
        silenceThreshold: mode === "auto" ? DEFAULTS.silenceThreshold : silenceThreshold,
        minSilence: mode === "auto" ? DEFAULTS.minSilence : minSilence,
        padding: mode === "auto" ? DEFAULTS.padding : padding,
        silenceMethod: method,
      });
      setLastJobId(job_id);
      setLastSubmittedFile(file);
      startPolling(job_id);
    } catch (err) {
      // reuse target vanished server-side (e.g. cleaned up after 24h) --
      // transparently fall back to a full re-upload once before surfacing an error
      if (canReuse && file) {
        try {
          const { job_id } = await createAudioTrimJob({
            file,
            silenceThreshold: mode === "auto" ? DEFAULTS.silenceThreshold : silenceThreshold,
            minSilence: mode === "auto" ? DEFAULTS.minSilence : minSilence,
            padding: mode === "auto" ? DEFAULTS.padding : padding,
            silenceMethod: method,
          });
          setLastJobId(job_id);
          setLastSubmittedFile(file);
          startPolling(job_id);
          return;
        } catch (retryErr) {
          setError(retryErr instanceof AutoEditApiError ? retryErr.message : "요청에 실패했습니다.");
          return;
        }
      }
      setError(err instanceof AutoEditApiError ? err.message : "요청에 실패했습니다.");
    }
  }, [file, lastJobId, lastSubmittedFile, mode, silenceThreshold, minSilence, padding, method, setSubmitting, startPolling, setError]);

  const backToSettings = useCallback(() => {
    setViewingSettings(true);
    reset();
  }, [reset]);

  const startOver = useCallback(() => {
    setFile(null);
    setLastJobId(null);
    setLastSubmittedFile(null);
    setMode("auto");
    setMethod("ffmpeg");
    setSilenceThreshold(DEFAULTS.silenceThreshold);
    setMinSilence(DEFAULTS.minSilence);
    setPadding(DEFAULTS.padding);
    setViewingSettings(true);
    reset();
  }, [reset]);

  return (
    <div className="flex h-full w-full items-center justify-center gap-10 p-8">
      {/* left: status / result */}
      <div className="flex flex-1 items-center justify-center h-full">
        {!viewingSettings && state.status === "done" ? (
          <div className="w-full max-w-[420px]">
            <ResultPreview
              mediaKind="audio"
              previewUrl={jobPreviewUrl(state.jobId)}
              downloads={[{ label: "완성본 다운로드", url: jobDownloadUrl(state.jobId) }]}
              onEditSettings={backToSettings}
              onReset={startOver}
              resetLabel="새 음성 처리하기"
            />
          </div>
        ) : !viewingSettings && (state.status === "queued" || state.status === "running") ? (
          <div className="w-full max-w-[420px]">
            <JobProgressBlock job={state.job} idleLabel="처리 중..." />
          </div>
        ) : !viewingSettings && state.status === "error" ? (
          <div className="w-full max-w-[420px] flex flex-col gap-3">
            <ErrorComp message={state.message} />
            <Button secondary onClick={backToSettings}>
              설정으로 돌아가기
            </Button>
          </div>
        ) : (
          <div className="flex h-[300px] w-[420px] items-center justify-center rounded-geist border border-white/25 text-subtitle text-sm text-center px-6">
            음성 파일을 업로드하고 무음 제거를 시작하면
            <br />
            여기에 진행 상황과 결과가 표시됩니다.
          </div>
        )}
      </div>

      {/* right: settings */}
      <div className="flex w-80 shrink-0 flex-col gap-4">
        <span className="text-xs uppercase tracking-wide text-subtitle">음성 무음 제거</span>

        <Dropzone
          accept="audio/*"
          file={file}
          onFileChange={setFile}
          placeholder="음성 파일을 드래그하거나 클릭해서 선택하세요"
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-subtitle">설정</span>
          <SegmentedToggle
            options={[
              { value: "auto", label: "자동" },
              { value: "manual", label: "수동" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-subtitle">감지 방식</span>
          <SegmentedToggle
            options={[
              { value: "ffmpeg", label: "기본" },
              { value: "vad", label: "AI 정밀 (Silero VAD)" },
            ]}
            value={method}
            onChange={setMethod}
          />
        </div>

        {mode === "manual" ? (
          <div className="flex flex-col mt-1">
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
          </div>
        ) : null}

        <Button
          primary
          disabled={!file && !lastJobId}
          loading={state.status === "queued" || state.status === "running"}
          onClick={submit}
        >
          무음 제거
        </Button>
      </div>
    </div>
  );
};
