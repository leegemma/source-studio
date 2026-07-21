import React from "react";

// Translates the old vanilla-JS app's .slider-row/.value-chip pattern: a
// label, a range input, and a live-updating value chip that grows to fit
// long content instead of clipping it (that clipping was a real bug fixed
// in the old app -- see auto-edit-backend's git history / CLAUDE-adjacent
// notes on the fixed-74px chip column -- so the chip here uses min-width
// with auto growth from the start rather than a fixed width).
export const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
}> = ({ label, value, min, max, step, onChange, format }) => {
  return (
    <div className="grid grid-cols-[88px_1fr_auto] items-center gap-3 mb-3.5">
      <label className="text-[12.5px] text-subtitle font-medium">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full accent-white cursor-pointer"
      />
      <span className="min-w-[74px] rounded-geist bg-[#26272c] text-white text-xs font-semibold text-right px-2.5 py-1.5 tabular-nums whitespace-nowrap">
        {format(value)}
      </span>
    </div>
  );
};
