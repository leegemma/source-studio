// Translates .seg-control/.seg-btn (자동/수동, 감지 방식, etc.) -- a pill-shaped
// group of mutually-exclusive options, active one lighter-filled.
export const SegmentedToggle = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => {
  return (
    <div className="inline-flex rounded-geist bg-[#26272c] p-[3px] gap-[3px]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-[9px] text-[13px] font-semibold transition-colors duration-150 ease-in-out ${
            opt.value === value
              ? "bg-[#4d4f57] text-white"
              : "text-subtitle hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
