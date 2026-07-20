"use client";

import { useEffect, useRef, useState } from "react";
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
  const [ringing, setRinging] = useState(false);

  const ringTimeoutRef = useRef<number | null>(null);
  // reset()마다 증가시켜서, 리셋 이전에 예약된 알람 해제 타이머가
  // 리셋 이후 상태를 잘못 건드리지 못하게 막는 안전장치.
  const generationRef = useRef(0);

  // 1초마다 카운트다운만 담당 — 부수효과(사운드/phase전환/세션카운트) 없음.
  // (setState 콜백은 React 개발 모드에서 두 번 호출될 수 있어서, 콜백 안에
  // 다른 setState를 부르면 phase가 두 번 뒤집혀 원상태로 되돌아가면서
  // secondsLeft가 0에 멈추고 매 틱마다 세션이 잘못 증가하는 버그가 있었음.)
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // secondsLeft가 0에 도달했을 때만 처리하는 별도 effect — 부수효과는 여기서만.
  // 알람이 흔들리는 모습을 실제로 보여준 다음에 phase를 전환한다 —
  // 흔들림과 동시에 휴식이 시작되면 사실상 안 보이는 것과 같아서,
  // 전환 자체를 알람 애니메이션이 끝날 때까지 지연시킴.
  useEffect(() => {
    if (!running || secondsLeft > 0) return;

    playBeep();
    setRinging(true);
    const myGeneration = generationRef.current;
    if (ringTimeoutRef.current) window.clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = window.setTimeout(() => {
      if (generationRef.current !== myGeneration) return;
      setRinging(false);
      if (phase === "work") {
        // 집중 종료 → 휴식으로 자동 전환, 계속 진행
        setCompletedSessions((c) => c + 1);
        setPhase("break");
      } else {
        // 휴식 종료 → 다음 집중으로 자동 시작하지 않고 정지 (다시 시작 누를 때까지 대기)
        setRunning(false);
        setPhase("work");
      }
    }, 1100);
    // phase는 여기서 직접 읽고 다음 값을 계산하므로 의도적으로 최신 phase만 사용.
  }, [secondsLeft, running]);

  // phase 전환 시에만 리셋 — workMinutes/breakMinutes 자체 변경은 아래 별도 effect에서 처리
  useEffect(() => {
    setSecondsLeft((phase === "work" ? workMinutes : breakMinutes) * 60);
  }, [phase]);

  useEffect(() => {
    if (running) return; // 실행 중에는 설정 변경이 카운트다운을 건드리지 않음
    setSecondsLeft((phase === "work" ? workMinutes : breakMinutes) * 60);
  }, [workMinutes, breakMinutes]);

  const reset = () => {
    generationRef.current += 1;
    if (ringTimeoutRef.current) {
      window.clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    setRinging(false);
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
          className={`relative flex items-center justify-center rounded-full ${ringing ? "animate-alarm-shake" : ""}`}
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
              {ringing ? "⏰ 알람" : PHASE_LABEL[phase]}
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
