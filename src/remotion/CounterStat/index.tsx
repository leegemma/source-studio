import { loadFont } from "@remotion/google-fonts/Baloo2";
import { zColor } from "@remotion/zod-types";
import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { COUNT_END_FRAME } from "./constants";

const { fontFamily } = loadFont("normal", {
  weights: ["800"],
  subsets: ["latin"],
});

export const counterStatSchema = z.object({
  target: z.number(),
  label: z.string(),
  bgColor: zColor(),
  numberColor: zColor(),
  labelColor: zColor(),
});

export const defaultCounterStatProps: z.infer<typeof counterStatSchema> = {
  target: 795,
  label: "million people",
  bgColor: "#2E4C18", // Fern Green
  numberColor: "#FFEBD2", // Creamy Peach
  labelColor: "#FC6F2F", // Tangy Orange
};

export const CounterStat: React.FC<z.infer<typeof counterStatSchema>> = ({
  target,
  label,
  bgColor,
  numberColor,
  labelColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rawCount = interpolate(frame, [0, COUNT_END_FRAME], [0, target], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const count = Math.round(rawCount);

  const pop = spring({
    frame: frame - COUNT_END_FRAME,
    fps,
    config: { damping: 8, mass: 0.4, stiffness: 150 },
  });
  const scale = frame >= COUNT_END_FRAME ? pop : 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 220,
            lineHeight: 1,
            color: numberColor,
          }}
        >
          {count}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 68,
            lineHeight: 1,
            color: labelColor,
            marginTop: 24,
          }}
        >
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default CounterStat;
