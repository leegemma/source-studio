import { loadFont } from "@remotion/google-fonts/NotoSansKR";
import { zColor } from "@remotion/zod-types";
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { BAR_GAP, BAR_HEIGHT, MAX_STEPS } from "./constants";

const { fontFamily } = loadFont("normal", {
  weights: ["700"],
  subsets: ["korean"],
});

export const progressStepsSchema = z.object({
  stepCount: z.number().min(1).max(MAX_STEPS),
  labels: z.array(z.string()).length(MAX_STEPS),
  barColor: zColor(),
  trackColor: zColor(),
  textColor: zColor(),
});

export const defaultProgressStepsProps: z.infer<typeof progressStepsSchema> = {
  stepCount: 3,
  labels: [
    "재료준비",
    "정리",
    "요리",
    "단계 4",
    "단계 5",
    "단계 6",
    "단계 7",
    "단계 8",
    "단계 9",
    "단계 10",
  ],
  barColor: "#FF4B4B",
  trackColor: "#FFFFFF",
  textColor: "#FFFFFF",
};

export const ProgressSteps: React.FC<z.infer<typeof progressStepsSchema>> = ({
  stepCount,
  labels,
  barColor,
  trackColor,
  textColor,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const slotLength = durationInFrames / stepCount;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 40 }}>
      <div style={{ display: "flex", width: "92%", gap: BAR_GAP }}>
        {Array.from({ length: stepCount }).map((_, index) => {
          const slotStart = index * slotLength;
          const slotEnd = slotStart + slotLength;
          const fillPercent = interpolate(frame, [slotStart, slotEnd], [0, 100], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div key={index} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  fontFamily,
                  fontWeight: 700,
                  fontSize: 32,
                  color: textColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {labels[index]}
              </div>
              <div
                style={{
                  position: "relative",
                  height: BAR_HEIGHT,
                  borderRadius: BAR_HEIGHT / 2,
                  border: `1px solid ${trackColor}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${fillPercent}%`,
                    background: barColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export default ProgressSteps;
