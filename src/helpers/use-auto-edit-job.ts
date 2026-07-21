import { useCallback, useEffect, useRef, useState } from "react";
import { AutoEditApiError, JobStatusResponse, getJobStatus } from "./auto-edit-api";

// Generalizes source-studio's existing useRendering (init|invoking|error|done)
// to auto-edit-backend's job shape, which needs actual polling: WhisperX/
// DeepFilterNet jobs run for real minutes, unlike Remotion's single-request
// render. State carries the full JobStatusResponse once queued so a panel can
// read progress/messages/done-only fields (words, download_name, ...)
// directly instead of re-deriving them.
export type AutoEditJobState =
  | { status: "idle" }
  | { status: "queued" | "running"; job: JobStatusResponse }
  | { status: "done"; job: JobStatusResponse; jobId: string }
  | { status: "error"; message: string };

const POLL_INTERVAL_MS = 1200;

export function useAutoEditJob() {
  const [state, setState] = useState<AutoEditJobState>({ status: "idle" });
  // guards a stale poll chain (from a job the caller has since abandoned via
  // reset()/starting a new job) from overwriting newer state after the fact
  const pollTokenRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Self-rescheduling setTimeout, not setInterval: an occasional slow fetch
  // (network hiccup, backend busy with another tool's job in the shared
  // queue) must not let two polls run concurrently, which setInterval would
  // allow once a single fetch exceeds POLL_INTERVAL_MS.
  const pollLoop = useCallback(
    async (jobId: string, myToken: number) => {
      try {
        const job = await getJobStatus(jobId);
        if (pollTokenRef.current !== myToken) return; // superseded, drop silently

        if (job.status === "done") {
          setState({ status: "done", job, jobId });
          return; // terminal -- no more scheduling
        }
        if (job.status === "error") {
          setState({ status: "error", message: job.error ?? "알 수 없는 오류가 발생했습니다." });
          return;
        }
        setState({ status: job.status, job });
        timeoutRef.current = window.setTimeout(() => pollLoop(jobId, myToken), POLL_INTERVAL_MS);
      } catch (err) {
        if (pollTokenRef.current !== myToken) return;
        setState({
          status: "error",
          message: err instanceof AutoEditApiError ? err.message : "상태 조회에 실패했습니다.",
        });
      }
    },
    [],
  );

  // Called right after a create-job POST resolves with a job_id -- starts
  // polling immediately (the job is at minimum "queued" server-side already).
  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      const myToken = ++pollTokenRef.current;
      setState({
        status: "queued",
        job: { status: "queued", progress: 0, messages: [], download_name: null, error: null },
      });
      pollLoop(jobId, myToken);
    },
    [pollLoop, stopPolling],
  );

  const setSubmitting = useCallback(() => {
    stopPolling();
    pollTokenRef.current++; // invalidate any in-flight poll from a prior job
    setState({
      status: "queued",
      job: { status: "queued", progress: 0, messages: ["업로드 중..."], download_name: null, error: null },
    });
  }, [stopPolling]);

  const setError = useCallback((message: string) => {
    stopPolling();
    pollTokenRef.current++;
    setState({ status: "error", message });
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    pollTokenRef.current++; // orphan any in-flight poll so it no-ops on arrival
    setState({ status: "idle" });
  }, [stopPolling]);

  return { state, startPolling, setSubmitting, setError, reset };
}
