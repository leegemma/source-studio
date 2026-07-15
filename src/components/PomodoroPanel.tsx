"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";

type Phase = "work" | "break";

const PHASE_COLOR: Record<Phase, string> = {
  work: "#ef4444",
  break: "#22c55e",
};
const PHASE_LABEL: Record<Phase, string> = {
  work: "집중",
  break: "휴식",
};

function playBeep() {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // AudioContext unavailable — silently skip the beep
  }
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const PomodoroPanel: React.FC = () => {
  const [workMinutes, setWorkMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [phase, setPhase] = useState<Phase>("work");
  const [secondsLeft, setSecondsLeft] = useState(workMinutes * 60);
  const [running, setRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        playBeep();
        setPhase((prevPhase) => {
          if (prevPhase === "work") setCompletedSessions((c) => c + 1);
          return prevPhase === "work" ? "break" : "work";
        });
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // phase 전환 시에만 리셋 — workMinutes/breakMinutes 자체 변경은 아래 별도 effect에서 처리
  useEffect(() => {
    setSecondsLeft((phase === "work" ? workMinutes : breakMinutes) * 60);
  }, [phase]);

  useEffect(() => {
    if (running) return; // 실행 중에는 설정 변경이 카운트다운을 건드리지 않음
    setSecondsLeft((phase === "work" ? workMinutes : breakMinutes) * 60);
  }, [workMinutes, breakMinutes]);

  const reset = () => {
    setRunning(false);
    setPhase("work");
    setCompletedSessions(0);
    setSecondsLeft(workMinutes * 60);
  };

  const totalSeconds = (phase === "work" ? workMinutes : breakMinutes) * 60;
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0;
  const color = PHASE_COLOR[phase];

  return (
    <div className="flex h-full w-full items-center justify-center gap-10 p-8">
      {/* timer ring */}
      <div className="flex flex-1 items-center justify-center h-full">
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: 320,
            height: 320,
            background: `conic-gradient(${color} ${progress * 360}deg, rgba(255,255,255,0.1) ${progress * 360}deg)`,
          }}
        >
          <div
            className="absolute rounded-full bg-background flex flex-col items-center justify-center"
            style={{ width: 280, height: 280 }}
          >
            <div className="text-sm uppercase tracking-wide text-subtitle mb-2">
              {PHASE_LABEL[phase]}
            </div>
            <div className="text-6xl font-bold tabular-nums" style={{ color }}>
              {formatTime(secondsLeft)}
            </div>
            <div className="text-sm text-subtitle mt-3">완료한 집중 세션: {completedSessions}</div>
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="flex w-80 shrink-0 flex-col gap-4">
        <span className="text-xs uppercase tracking-wide text-subtitle">뽀모도로 타이머</span>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-subtitle">집중 시간 (분)</span>
          <input
            type="number"
            min={1}
            value={workMinutes}
            onChange={(e) => setWorkMinutes(Math.max(1, Number(e.currentTarget.value)))}
            className="w-24 leading-[1.4] rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-subtitle">휴식 시간 (분)</span>
          <input
            type="number"
            min={1}
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(Math.max(1, Number(e.currentTarget.value)))}
            className="w-24 leading-[1.4] rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none"
          />
        </div>

        <Button primary onClick={() => setRunning((r) => !r)}>
          {running ? "일시정지" : "시작"}
        </Button>
        <Button secondary onClick={reset}>
          초기화
        </Button>
      </div>
    </div>
  );
};
