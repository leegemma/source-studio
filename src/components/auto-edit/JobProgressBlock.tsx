import React from "react";
import { JobStatusResponse } from "../../helpers/auto-edit-api";
import { ProgressBar } from "../ProgressBar";

// Translates #progress-block/#log-details/#error-box. Reuses the existing
// ProgressBar component (src/components/ProgressBar.tsx) rather than
// reimplementing a bar -- it already does exactly this (0-1 -> filled width).
export const JobProgressBlock: React.FC<{
  job: JobStatusResponse;
  idleLabel: string;
}> = ({ job, idleLabel }) => {
  const lastMessage = job.messages[job.messages.length - 1];
  const statusText =
    job.status === "queued"
      ? "대기열에서 순서를 기다리는 중... (다른 작업이 먼저 처리될 수 있어요)"
      : (lastMessage ?? idleLabel);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-subtitle font-semibold">
        <span>{statusText}</span>
        <span className="tabular-nums">{Math.round(job.progress * 100)}%</span>
      </div>
      <ProgressBar progress={job.progress} />
      {job.messages.length > 0 ? (
        <details className="mt-1">
          <summary className="text-[11.5px] text-subtitle cursor-pointer font-semibold select-none">
            처리 로그 보기
          </summary>
          <div className="mt-2 max-h-[220px] overflow-y-auto rounded-geist border border-unfocused-border-color bg-background px-3 py-2.5 font-mono text-[10.5px] text-subtitle whitespace-pre-wrap break-all">
            {job.messages.join("\n")}
          </div>
        </details>
      ) : null}
    </div>
  );
};
