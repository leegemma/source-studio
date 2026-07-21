"use client";

import React, { useCallback, useState } from "react";
import {
  AutoEditApiError,
  createEnhanceJob,
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
import { ToggleRow } from "./ToggleRow";

type Mode = "auto" | "manual";

const DEFAULTS = { denoise: true, targetLufs: -16, highpassHz: 80 };

export const EnhancePanel: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [denoise, setDenoise] = useState(DEFAULTS.denoise);
  const [targetLufs, setTargetLufs] = useState(DEFAULTS.targetLufs);
  const [highpassHz, setHighpassHz] = useState(DEFAULTS.highpassHz);

  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [lastSubmittedFile, setLastSubmittedFile] = useState<File | null>(null);
  const [viewingSettings, setViewingSettings] = useState(true);

  const { state, startPolling, setSubmitting, setError, reset } = useAutoEditJob();

  const submit = useCallback(async () => {
    if (!file && !lastJobId) return;
    setSubmitting();
    setViewingSettings(false);
    const canReuse = !!(lastJobId && file && file === lastSubmittedFile);
    const params = {
      denoise,
      targetLufs: mode === "auto" ? DEFAULTS.targetLufs : targetLufs,
      highpassHz: mode === "auto" ? DEFAULTS.highpassHz : highpassHz,
    };
    try {
      const { job_id } = await createEnhanceJob({
        file: canReuse ? undefined : (file ?? undefined),
        reuseJobId: canReuse ? lastJobId : undefined,
        ...params,
      });
      setLastJobId(job_id);
      setLastSubmittedFile(file);
      startPolling(job_id);
    } catch (err) {
      if (canReuse && file) {
        try {
          const { job_id } = await createEnhanceJob({ file, ...params });
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
  }, [file, lastJobId, lastSubmittedFile, mode, denoise, targetLufs, highpassHz, setSubmitting, startPolling, setError]);

  const backToSettings = useCallback(() => {
    setViewingSettings(true);
    reset();
  }, [reset]);

  const startOver = useCallback(() => {
    setFile(null);
    setLastJobId(null);
    setLastSubmittedFile(null);
    setMode("auto");
    setDenoise(DEFAULTS.denoise);
    setTargetLufs(DEFAULTS.targetLufs);
    setHighpassHz(DEFAULTS.highpassHz);
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
              resetLabel="새로 개선하기"
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
            음성 파일을 업로드하고 사운드 개선을 시작하면
            <br />
            여기에 진행 상황과 결과가 표시됩니다.
          </div>
        )}
      </div>

      {/* right: settings */}
      <div className="flex w-80 shrink-0 flex-col gap-4">
        <span className="text-xs uppercase tracking-wide text-subtitle">사운드 개선</span>

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

        {mode === "manual" ? (
          <div className="flex flex-col mt-1">
            <SliderRow
              label="목표 음량"
              value={targetLufs}
              min={-30}
              max={-6}
              step={0.5}
              onChange={setTargetLufs}
              format={(v) => `${v.toFixed(1)} LUFS`}
            />
            <p className="text-[10.5px] text-subtitle -mt-2 mb-3.5 leading-[1.45]">
              전체 음량을 이 크기로 통일해요. 숫자가 클수록(-6에 가까울수록) 더 크고 또렷하게,
              <br />
              작을수록(-30에 가까울수록) 더 작고 차분하게 들립니다.
            </p>
            <SliderRow
              label="저음 컷오프"
              value={highpassHz}
              min={20}
              max={200}
              step={5}
              onChange={setHighpassHz}
              format={(v) => `${Math.round(v)} Hz`}
            />
            <p className="text-[10.5px] text-subtitle -mt-2 mb-3.5 leading-[1.45]">
              이 수치보다 낮은 저음(웅웅거림, 마이크 흔들림 소리 등)을 잘라내요.
              <br />
              목소리는 그대로 두고 잡음만 줄이며, 숫자가 클수록 더 많이 제거됩니다.
            </p>
          </div>
        ) : null}

        <ToggleRow label="노이즈 제거" checked={denoise} onChange={setDenoise} />
        <p className="text-[10.5px] text-subtitle -mt-3 leading-[1.45]">
          배경에 깔린 소음(에어컨·팬 소리, 히스 노이즈 등)을 AI로 줄여줘요.
          <br />
          켜두면 더 깨끗해지지만 처리 시간이 조금 더 걸립니다.
        </p>

        <Button
          primary
          disabled={!file && !lastJobId}
          loading={state.status === "queued" || state.status === "running"}
          onClick={submit}
        >
          사운드 개선
        </Button>
      </div>
    </div>
  );
};
