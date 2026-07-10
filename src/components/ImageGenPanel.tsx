"use client";

import { useCallback, useState } from "react";
import { Button } from "./Button";
import { ErrorComp } from "./Error";

type State =
  | { status: "init" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; url: string; revisedPrompt: string };

const SIZES = [
  { value: "1024x1024", label: "정사각형" },
  { value: "1024x1792", label: "세로" },
  { value: "1792x1024", label: "가로" },
] as const;

export const ImageGenPanel: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<(typeof SIZES)[number]["value"]>("1024x1024");
  const [state, setState] = useState<State>({ status: "init" });

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, size }),
      });
      const json = await res.json();
      if (json.type === "error") {
        throw new Error(json.message);
      }
      setState({ status: "done", url: json.data.url, revisedPrompt: json.data.revisedPrompt });
    } catch (err) {
      setState({ status: "error", error: (err as Error).message });
    }
  }, [prompt, size]);

  return (
    <div className="flex h-full w-full items-center justify-center gap-10 p-8">
      {/* preview */}
      <div className="flex flex-1 items-center justify-center h-full">
        {state.status === "done" ? (
          <img
            src={state.url}
            alt={state.revisedPrompt}
            className="max-h-full max-w-full rounded-geist border border-white/25"
          />
        ) : (
          <div className="flex h-[400px] w-[400px] items-center justify-center rounded-geist border border-white/25 text-subtitle text-sm">
            {state.status === "loading" ? "생성 중..." : "생성된 이미지가 여기 표시됩니다"}
          </div>
        )}
      </div>

      {/* controls */}
      <div className="flex w-80 shrink-0 flex-col gap-3">
        <span className="text-xs uppercase tracking-wide text-subtitle">이미지 생성 (OpenAI)</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          placeholder="원하는 이미지를 설명해주세요"
          rows={5}
          className="rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color focus:border-focused-border-color outline-none resize-none"
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-subtitle">비율</span>
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSize(s.value)}
                className={`px-2.5 py-1.5 rounded-geist text-sm border transition-colors duration-150 ease-in-out ${
                  size === s.value
                    ? "bg-unfocused-border-color text-foreground border-unfocused-border-color"
                    : "text-subtitle border-unfocused-border-color hover:bg-unfocused-border-color/50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <Button primary disabled={state.status === "loading"} loading={state.status === "loading"} onClick={generate}>
          이미지 생성
        </Button>
        {state.status === "error" ? <ErrorComp message={state.error}></ErrorComp> : null}
        {state.status === "done" ? (
          <a href={state.url} download className="text-sm text-subtitle underline">
            다운로드
          </a>
        ) : null}
      </div>
    </div>
  );
};
