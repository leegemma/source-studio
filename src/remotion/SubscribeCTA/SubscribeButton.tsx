import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const SubscribeButton: React.FC<{
  tapFrame: number;
  buttonText: string;
  buttonColor: string;
  buttonTextColor: string;
}> = ({ tapFrame, buttonText, buttonColor, buttonTextColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const breathe = 1 + Math.sin((frame / fps) * Math.PI * 1.6) * 0.015;

  const press = interpolate(
    frame,
    [tapFrame - 2, tapFrame, tapFrame + 8],
    [1, 0.94, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        transform: `scale(${breathe * press})`,
        padding: "28px 68px",
        borderRadius: 999,
        background: buttonColor,
        boxShadow: "0 14px 34px rgba(255, 180, 180, 0.4)",
        fontFamily: "'Noto Sans KR', sans-serif",
        fontWeight: 600,
        fontSize: 34,
        letterSpacing: "0.02em",
        color: buttonTextColor,
        whiteSpace: "nowrap",
      }}
    >
      {buttonText}
    </div>
  );
};
