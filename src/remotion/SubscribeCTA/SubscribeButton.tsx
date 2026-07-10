import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const BellIcon: React.FC<{ rotate: number }> = ({ rotate }) => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    style={{ transform: `rotate(${rotate}deg)`, transformOrigin: "50% 0%" }}
  >
    <path
      d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronDownIcon: React.FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24">
    <path
      d="m6 9 6 6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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

  const isSubscribed = frame >= tapFrame;

  // Bell wiggles a few times right after the tap, decaying out.
  const shakeDuration = 24;
  const shakeProgress = interpolate(frame, [tapFrame, tapFrame + shakeDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bellRotate = isSubscribed
    ? Math.sin((frame - tapFrame) * 1.4) * 18 * (1 - shakeProgress)
    : 0;

  return (
    <div
      style={{
        transform: `scale(${breathe * press})`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: isSubscribed ? "20px 36px" : "28px 68px",
        borderRadius: 999,
        border: isSubscribed ? "2px solid #FFFFFF" : "none",
        background: isSubscribed ? "#18181B" : buttonColor,
        boxShadow: isSubscribed ? "0 14px 34px rgba(0, 0, 0, 0.35)" : `0 14px 34px ${buttonColor}66`,
        fontFamily: "'Noto Sans KR', sans-serif",
        fontWeight: 600,
        fontSize: isSubscribed ? 28 : 34,
        letterSpacing: "0.02em",
        color: isSubscribed ? "#FFFFFF" : buttonTextColor,
        whiteSpace: "nowrap",
      }}
    >
      {isSubscribed && <BellIcon rotate={bellRotate} />}
      {isSubscribed ? "구독중" : buttonText}
      {isSubscribed && <ChevronDownIcon />}
    </div>
  );
};
