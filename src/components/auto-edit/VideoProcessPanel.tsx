"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AutoEditApiError,
  createVideoJob,
  jobDownloadUrl,
  jobPreviewUrl,
  listMusic,
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

const selectClass =
  "w-full rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none";

const DEFAULTS = {
  useRoughCut: true,
  useCaptions: true,
  useBgm: false,
  duck: true,
  silenceThreshold: -30,
  minSilence: 0.5,
  silenceMethod: "ffmpeg" as const,
  model: "medium",
  language: "ko",
  fontsize: 64,
  bgmChoice: "none",
  bgmVolume: -20,
};

export const VideoProcessPanel: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [useRoughCut, setUseRoughCut] = useState(DEFAULTS.useRoughCut);
  const [useCaptions, setUseCaptions] = useState(DEFAULTS.useCaptions);
  const [useBgm, setUseBgm] = useState(DEFAULTS.useBgm);
  const [duck, setDuck] = useState(DEFAULTS.duck);

  const [silenceThreshold, setSilenceThreshold] = useState(DEFAULTS.silenceThreshold);
  const [minSilence, setMinSilence] = useState(DEFAULTS.minSilence);
  const [silenceMethod, setSilenceMethod] = useState<"ffmpeg" | "vad">(DEFAULTS.silenceMethod);

  const [model, setModel] = useState(DEFAULTS.model);
  const [language, setLanguage] = useState(DEFAULTS.language);
  const [fontsize, setFontsize] = useState(DEFAULTS.fontsize);

  const [musicList, setMusicList] = useState<string[]>([]);
  const [bgmChoice, setBgmChoice] = useState(DEFAULTS.bgmChoice);
  const [bgmFile, setBgmFile] = useState<File | null>(null);
  const [bgmVolume, setBgmVolume] = useState(DEFAULTS.bgmVolume);

  useEffect(() => {
    listMusic().then(setMusicList);
  }, []);

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
      useRoughCut,
      useCaptions,
      useBgm,
      duck,
      bgmChoice: useBgm && bgmChoice === "upload" && !bgmFile ? "none" : bgmChoice,
      bgmFile: useBgm && bgmChoice === "upload" ? (bgmFile ?? undefined) : undefined,
      model,
      language,
      silenceThreshold,
      minSilence,
      silenceMethod,
      fontsize,
      bgmVolume,
    };
    try {
      const { job_id } = await createVideoJob({
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
          const { job_id } = await createVideoJob({ file, ...params });
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
  }, [
    file, lastJobId, lastSubmittedFile, useRoughCut, useCaptions, useBgm, duck,
    bgmChoice, bgmFile, model, language, silenceThreshold, minSilence, silenceMethod,
    fontsize, bgmVolume, setSubmitting, startPolling, setError,
  ]);

  const backToSettings = useCallback(() => {
    setViewingSettings(true);
    reset();
  }, [reset]);

  const startOver = useCallback(() => {
    setFile(null);
    setLastJobId(null);
    setLastSubmittedFile(null);
    setUseRoughCut(DEFAULTS.useRoughCut);
    setUseCaptions(DEFAULTS.useCaptions);
    setUseBgm(DEFAULTS.useBgm);
    setDuck(DEFAULTS.duck);
    setSilenceThreshold(DEFAULTS.silenceThreshold);
    setMinSilence(DEFAULTS.minSilence);
    setSilenceMethod(DEFAULTS.silenceMethod);
    setModel(DEFAULTS.model);
    setLanguage(DEFAULTS.language);
    setFontsize(DEFAULTS.fontsize);
    setBgmChoice(DEFAULTS.bgmChoice);
    setBgmFile(null);
    setBgmVolume(DEFAULTS.bgmVolume);
    setViewingSettings(true);
    reset();
  }, [reset]);

  return (
    <div className="flex h-full w-full items-center justify-center gap-10 p-8 overflow-y-auto">
      {/* left: status / result */}
      <div className="flex flex-1 items-center justify-center h-full">
        {!viewingSettings && state.status === "done" ? (
          <div className="w-full max-w-[420px]">
            <ResultPreview
              mediaKind="video"
              previewUrl={jobPreviewUrl(state.jobId)}
              downloads={[{ label: "완성본 다운로드", url: jobDownloadUrl(state.jobId) }]}
              onEditSettings={backToSettings}
              onReset={startOver}
              resetLabel="새 영상 처리하기"
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
            영상을 업로드하고 처리를 시작하면
            <br />
            여기에 진행 상황과 결과가 표시됩니다.
          </div>
        )}
      </div>

      {/* right: settings */}
      <div className="flex w-80 shrink-0 flex-col gap-4 max-h-full overflow-y-auto py-2">
        <span className="text-xs uppercase tracking-wide text-subtitle">영상 처리</span>

        <Dropzone
          accept="video/*"
          file={file}
          onFileChange={setFile}
          placeholder="영상을 드래그하거나 클릭해서 선택하세요"
        />

        {/* 무음 구간 자동 제거 */}
        <div className="flex flex-col gap-2 pt-2 border-t border-unfocused-border-color">
          <ToggleRow label="무음 구간 자동 제거" checked={useRoughCut} onChange={setUseRoughCut} />
          {useRoughCut ? (
            <>
              <SegmentedToggle
                options={[
                  { value: "ffmpeg", label: "기본" },
                  { value: "vad", label: "AI 정밀 (Silero VAD)" },
                ]}
                value={silenceMethod}
                onChange={setSilenceMethod}
              />
              {silenceMethod === "ffmpeg" ? (
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
            </>
          ) : null}
        </div>

        {/* 자막 자동 생성 */}
        <div className="flex flex-col gap-2 pt-2 border-t border-unfocused-border-color">
          <ToggleRow label="자막 자동 생성 (음성 인식)" checked={useCaptions} onChange={setUseCaptions} />
          {useCaptions ? (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-subtitle">인식 정확도</span>
                <select className={selectClass} value={model} onChange={(e) => setModel(e.currentTarget.value)}>
                  <option value="small">빠름 (small)</option>
                  <option value="medium">보통 (medium)</option>
                  <option value="large-v3">정확함 (large-v3, 느림)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-subtitle">언어</span>
                <select className={selectClass} value={language} onChange={(e) => setLanguage(e.currentTarget.value)}>
                  <option value="ko">한국어</option>
                  <option value="en">영어</option>
                  <option value="auto">자동 감지</option>
                </select>
              </div>
              <SliderRow
                label="자막 크기"
                value={fontsize}
                min={20}
                max={120}
                step={2}
                onChange={setFontsize}
                format={(v) => `${Math.round(v)}px`}
              />
            </>
          ) : null}
        </div>

        {/* 배경음악 추가 */}
        <div className="flex flex-col gap-2 pt-2 border-t border-unfocused-border-color">
          <ToggleRow label="배경음악(BGM) 추가" checked={useBgm} onChange={setUseBgm} />
          {useBgm ? (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-subtitle">BGM 선택</span>
                <select
                  className={selectClass}
                  value={bgmChoice}
                  onChange={(e) => setBgmChoice(e.currentTarget.value)}
                >
                  <option value="none">기본값 (music/ 폴더 첫 파일)</option>
                  {musicList.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="upload">직접 업로드...</option>
                </select>
              </div>
              {bgmChoice === "upload" ? (
                <Dropzone
                  accept="audio/*"
                  file={bgmFile}
                  onFileChange={setBgmFile}
                  placeholder="BGM 파일을 드래그하거나 클릭해서 선택"
                />
              ) : null}
              <SliderRow
                label="BGM 볼륨"
                value={bgmVolume}
                min={-40}
                max={0}
                step={1}
                onChange={setBgmVolume}
                format={(v) => `${v.toFixed(0)} dB`}
              />
              <ToggleRow label="덕킹 (말할 때 자동 감소)" checked={duck} onChange={setDuck} />
            </>
          ) : null}
        </div>

        <Button
          primary
          disabled={!file && !lastJobId}
          loading={state.status === "queued" || state.status === "running"}
          onClick={submit}
        >
          영상 처리 시작
        </Button>
      </div>
    </div>
  );
};
