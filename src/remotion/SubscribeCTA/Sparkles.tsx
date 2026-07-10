import React from "react";
import { interpolate, random, useCurrentFrame } from "remotion";

const PARTICLE_COUNT = 14;
const BURST_DURATION = 40;

export const Sparkles: React.FC<{
  originX: number;
  originY: number;
  startFrame: number;
}> = ({ originX, originY, startFrame }) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startFrame;

  if (relativeFrame < 0 || relativeFrame > BURST_DURATION) {
    return null;
  }

  return (
    <>
      {new Array(PARTICLE_COUNT).fill(0).map((_, i) => {
        const angle = random(`sparkle-angle-${i}`) * Math.PI * 2;
        const maxDistance = 90 + random(`sparkle-dist-${i}`) * 70;
        const distance = interpolate(relativeFrame, [0, 30], [0, maxDistance], {
          extrapolateRight: "clamp",
        });
        const opacity = interpolate(
          relativeFrame,
          [0, 6, 26, BURST_DURATION],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const scale = interpolate(relativeFrame, [0, 8, BURST_DURATION], [0.2, 1, 0.4], {
          extrapolateRight: "clamp",
        });
        const size = 8 + random(`sparkle-size-${i}`) * 10;
        const color = random(`sparkle-hue-${i}`) > 0.5 ? "#FFB4B4" : "#FFDEB4";

        const x = originX + Math.cos(angle) * distance;
        const y = originY + Math.sin(angle) * distance;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              opacity,
              transform: `scale(${scale})`,
              boxShadow: `0 0 ${size}px ${color}`,
            }}
          />
        );
      })}
    </>
  );
};
