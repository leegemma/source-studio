import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

export const TapCursor: React.FC<{
  startFrame: number;
  tapFrame: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}> = ({ startFrame, tapFrame, from, to }) => {
  const frame = useCurrentFrame();

  const progress = interpolate(frame, [startFrame, tapFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const x = interpolate(progress, [0, 1], [from.x, to.x]);
  const y = interpolate(progress, [0, 1], [from.y, to.y]);

  const press = interpolate(
    frame,
    [tapFrame - 2, tapFrame, tapFrame + 8],
    [1, 0.8, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const opacity = interpolate(
    frame,
    [startFrame, startFrame + 6, tapFrame + 14, tapFrame + 20],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  if (opacity <= 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-18%, -10%) scale(${press})`,
        opacity,
      }}
    >
      <svg
        width="72"
        height="72"
        viewBox="0 0 24 24"
        fill="none"
        style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.35))" }}
      >
        <path
          d="M4 2L4 18.5L8.5 14.5L11 21L13.5 20L11 13.5L17 13.5L4 2Z"
          fill="#FFFFFF"
          stroke="#4A2E2E"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
