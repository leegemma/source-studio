import React, { useCallback, useRef, useState } from "react";

// Translates .dropzone/.dropzone-clear: a dashed drop target that also opens
// the native file picker on click, shows the selected filename once a file
// is chosen, and a small "clear selection" button (previously a real, fixed
// bug in the old app -- there was no way to clear a selected file without
// picking a replacement -- so this is present from the start here).
export const Dropzone: React.FC<{
  accept: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  placeholder: string;
}> = ({ accept, file, onFileChange, placeholder }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) onFileChange(dropped);
    },
    [onFileChange],
  );

  return (
    <div
      onClick={openPicker}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`relative rounded-geist border border-dashed p-6 text-center cursor-pointer transition-colors duration-150 ease-in-out ${
        file
          ? "border-solid border-focused-border-color bg-white/[0.03]"
          : dragOver
            ? "border-focused-border-color bg-white/[0.03]"
            : "border-unfocused-border-color hover:border-focused-border-color/60"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileChange(e.currentTarget.files?.[0] ?? null)}
      />
      <div className={`text-[12.5px] ${file ? "text-foreground font-semibold" : "text-subtitle"}`}>
        {file ? file.name : placeholder}
      </div>
      {file ? (
        <button
          type="button"
          aria-label="선택한 파일 지우기"
          onClick={(e) => {
            e.stopPropagation();
            onFileChange(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="absolute top-1.5 right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/55 text-subtitle text-xs hover:bg-black/75 hover:text-foreground transition-colors duration-150 ease-in-out"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
};
