import React from "react";
import { CIRCLE_SIZE } from "./constants";

const TICK_THICKNESS = 8;
const TICK_LENGTH = 30;
const TICK_INSET = 14;

const positions: Array<{ side: "top" | "right" | "bottom" | "left" }> = [
  { side: "top" },
  { side: "right" },
  { side: "bottom" },
  { side: "left" },
];

const styleForSide = (
  side: "top" | "right" | "bottom" | "left",
  tickColor: string,
): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: "absolute",
    background: tickColor,
    borderRadius: TICK_THICKNESS / 2,
  };

  if (side === "top" || side === "bottom") {
    return {
      ...base,
      width: TICK_THICKNESS,
      height: TICK_LENGTH,
      left: "50%",
      transform: "translateX(-50%)",
      ...(side === "top" ? { top: TICK_INSET } : { bottom: TICK_INSET }),
    };
  }

  return {
    ...base,
    width: TICK_LENGTH,
    height: TICK_THICKNESS,
    top: "50%",
    transform: "translateY(-50%)",
    ...(side === "left" ? { left: TICK_INSET } : { right: TICK_INSET }),
  };
};

export const TickMarks: React.FC<{ tickColor: string }> = ({ tickColor }) => {
  return (
    <div style={{ position: "absolute", inset: 0, width: CIRCLE_SIZE, height: CIRCLE_SIZE }}>
      {positions.map(({ side }) => (
        <div key={side} style={styleForSide(side, tickColor)} />
      ))}
    </div>
  );
};
