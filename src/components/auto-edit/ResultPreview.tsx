import React from "react";
import { Button } from "../Button";
import { Spacing } from "../Spacing";

// Translates .result-preview/#download-area/설정 수정하기/새로 시작하기. Takes a
// LIST of downloads (not a single URL) from the start: video/audio_trim/
// enhance jobs have exactly one (download_name), but text_edit jobs return
// two separate named files (cut media + re-timed .srt, via download_files) --
// designing for the multi-file case up front avoids widening this later in
// Phase 4.
export const ResultPreview: React.FC<{
  mediaKind: "video" | "audio";
  previewUrl: string;
  downloads: { label: string; url: string }[];
  onEditSettings: () => void;
  onReset: () => void;
  resetLabel: string;
}> = ({ mediaKind, previewUrl, downloads, onEditSettings, onReset, resetLabel }) => {
  return (
    <div className="flex flex-col gap-3">
      {mediaKind === "video" ? (
        <video
          key={previewUrl}
          src={previewUrl}
          controls
          playsInline
          className="w-full max-h-[360px] rounded-geist border border-white/25 bg-black"
        />
      ) : (
        <audio key={previewUrl} src={previewUrl} controls className="w-full" />
      )}

      <div className="flex flex-col gap-2">
        {downloads.map((d) => (
          <a key={d.url} href={d.url}>
            <Button>⬇ {d.label}</Button>
          </a>
        ))}
      </div>

      <div className="flex gap-2">
        <Button secondary onClick={onEditSettings}>
          설정 수정하기
        </Button>
        <Spacing />
        <Button secondary onClick={onReset}>
          {resetLabel}
        </Button>
      </div>
    </div>
  );
};
