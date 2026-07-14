import { loadFont } from "@remotion/google-fonts/NotoSansKR";
import { zColor } from "@remotion/zod-types";
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { TickMarks } from "./TickMarks";
import { CIRCLE_SIZE, CLOCK_DURATION_IN_FRAMES, COUNT_END_FRAME } from "./constants";

// Original design ran the count/wedge-fill over the first 2 of its 3s
// default. Keep that same fraction of whatever duration is actually set
// (from the site's per-template duration control) so lengthening the clip
// stretches the animation instead of just adding a longer static hold.
const COUNT_END_FRACTION = COUNT_END_FRAME / CLOCK_DURATION_IN_FRAMES;

const { fontFamily } = loadFont("normal", {
  weights: ["900"],
  subsets: ["korean"],
});

export const pieClockTimerSchema = z.object({
  target: z.number(),
  label: z.string(),
  fontSize: z.number(),
  discColor: zColor(),
  wedgeColor: zColor(),
  tickColor: zColor(),
  numberColor: zColor(),
});

export const defaultPieClockTimerProps: z.infer<typeof pieClockTimerSchema> = {
  target: 36,
  label: "분",
  fontSize: 300,
  discColor: "#FFFFFF",
  wedgeColor: "#E3E3E3",
  tickColor: "#9CA3AF",
  numberColor: "#111111",
};

// label font stays proportional to the number so the two keep reading as
// one unit as fontSize is scaled up/down.
const LABEL_TO_NUMBER_RATIO = 68 / 190;

export const PieClockTimer: React.FC<z.infer<typeof pieClockTimerSchema>> = ({
  target,
  label,
  fontSize,
  discColor,
  wedgeColor,
  tickColor,
  numberColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const countEndFrame = durationInFrames * COUNT_END_FRACTION;

  const count = Math.round(
    interpolate(frame, [0, countEndFrame], [0, target], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  const progressDeg = interpolate(frame, [0, countEndFrame], [0, 360], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bouncy "띵용" pop once the count/wedge-fill finishes, same spring feel
  // as CounterStat's pop.
  const pop = spring({
    frame: frame - countEndFrame,
    fps,
    config: { damping: 8, mass: 0.4, stiffness: 150 },
  });
  const scale = frame >= countEndFrame ? pop : 1;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: CIRCLE_SIZE,
          height: CIRCLE_SIZE,
          transform: `scale(${scale})`,
        }}
      >
        {/* base white disc */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: discColor,
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.15)",
          }}
        />

        {/* pie wedge — empty at 0deg, full circle at 360deg, starts at 12 o'clock */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `conic-gradient(${wedgeColor} 0deg ${progressDeg}deg, transparent ${progressDeg}deg 360deg)`,
          }}
        />

        <TickMarks tickColor={tickColor} />

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontWeight: 900,
              fontSize,
              lineHeight: 1,
              color: numberColor,
            }}
          >
            {count}
          </div>
          <div
            style={{
              fontFamily,
              fontWeight: 900,
              fontSize: fontSize * LABEL_TO_NUMBER_RATIO,
              lineHeight: 1,
              color: numberColor,
              marginLeft: 6,
              marginBottom: -2,
            }}
          >
            {label}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default PieClockTimer;
