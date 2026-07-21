import React from "react";

// Translates .toggle-row (노이즈 제거, 자막/BGM 사용 여부, etc.) -- a simple
// labeled boolean checkbox, distinct from SegmentedToggle which picks among
// named options rather than flipping a single on/off flag.
export const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => {
  return (
    <label className="flex items-center justify-between cursor-pointer select-none">
      <span className="text-sm text-subtitle">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="h-4 w-4 accent-white cursor-pointer"
      />
    </label>
  );
};
