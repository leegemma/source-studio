"use client";

import React, { useEffect, useRef, useState } from "react";

// Translates the old app's canvas-drawn waveform timeline (ruler + teal track +
// peaks + orange playhead + dimmed cut-region overlays). Decodes audio peaks
// client-side via Web Audio (same technique PomodoroPanel.tsx already uses
// window.AudioContext for, just heavier use of the same browser API -- no new
// dependency). Failure to decode (odd container, huge file) falls back to a
// flat placeholder bar; seek/scrub keep working regardless either way.
export const TranscriptTimeline: React.FC<{
  mediaUrl: string;
  filename: string;
  duration: number;
  currentTime: number;
  cutRanges: { start: number; end: number }[]; // time-based struck-word runs, dimmed on the track
  onSeek: (time: number) => void;
}> = ({ mediaUrl, filename, duration, currentTime, cutRanges, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<Float32Array[] | null>(null); // [min,max] pairs per bucket, or null = flat placeholder
  const draggingRef = useRef(false);

  // decode peaks once per mediaUrl
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    (async () => {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const res = await fetch(mediaUrl);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 200 * 1024 * 1024) return; // skip huge decodes, keep flat placeholder
        const ctx = new AC();
        let audioBuf: AudioBuffer;
        try {
          audioBuf = await ctx.decodeAudioData(buf);
        } finally {
          if (ctx.close) ctx.close().catch(() => {});
        }
        if (cancelled) return;
        const ch = audioBuf.getChannelData(0);
        const bucketCount = Math.min(3000, ch.length || 1);
        const per = ch.length / bucketCount;
        const minArr = new Float32Array(bucketCount);
        const maxArr = new Float32Array(bucketCount);
        for (let b = 0; b < bucketCount; b++) {
          let mn = 1;
          let mx = -1;
          const from = Math.floor(b * per);
          const to = Math.min(ch.length, Math.max(from + 1, Math.ceil((b + 1) * per)));
          for (let j = from; j < to; j++) {
            const v = ch[j];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          minArr[b] = mn;
          maxArr[b] = mx;
        }
        if (!cancelled) setPeaks([minArr, maxArr]);
      } catch {
        if (!cancelled) setPeaks(null); // flat placeholder
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaUrl]);

  // (re)draw whenever anything visual changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = 64;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // track background
    ctx.fillStyle = "#2ea88a";
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 6);
    ctx.fill();

    // waveform
    const mid = height / 2;
    if (peaks) {
      const [minArr, maxArr] = peaks;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let x = 0; x < width; x++) {
        const bi = Math.floor((x / width) * minArr.length);
        const mn = minArr[bi] ?? 0;
        const mx = maxArr[bi] ?? 0;
        const y1 = mid - mx * (mid - 4);
        const y2 = mid - mn * (mid - 4);
        ctx.fillRect(x, Math.min(y1, y2), 1, Math.max(1, Math.abs(y2 - y1)));
      }
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, mid - 2, width, 4);
    }

    // cut region overlays
    if (duration > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      for (const c of cutRanges) {
        const x1 = (c.start / duration) * width;
        const x2 = (c.end / duration) * width;
        ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height);
      }
    }

    // filename label
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(filename, 8, 14);
  }, [peaks, cutRanges, duration, filename]);

  const seekFromClientX = (clientX: number) => {
    const container = containerRef.current;
    if (!container || duration <= 0) return;
    const rect = container.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  const playheadRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const rulerMarks = 6;

  return (
    <div className="flex flex-col gap-1">
      {/* ruler */}
      <div className="flex justify-between text-[10px] text-subtitle tabular-nums px-0.5">
        {Array.from({ length: rulerMarks + 1 }, (_, i) => {
          const t = (duration * i) / rulerMarks;
          const m = Math.floor(t / 60);
          const s = Math.floor(t % 60);
          return <span key={i}>{`${m}:${String(s).padStart(2, "0")}`}</span>;
        })}
      </div>

      {/* track + playhead */}
      <div
        ref={containerRef}
        className="relative h-16 cursor-pointer select-none"
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          seekFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) seekFromClientX(e.clientX);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
      >
        <canvas ref={canvasRef} className="block rounded-geist" />
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-orange-400 pointer-events-none"
          style={{ left: `${playheadRatio * 100}%` }}
        >
          <div className="absolute -top-1 -left-[5px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[7px] border-t-orange-400" />
        </div>
      </div>
    </div>
  );
};
