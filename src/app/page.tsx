"use client";

import { Player } from "@remotion/player";
import type { NextPage } from "next";
import { useMemo, useState } from "react";
import { RenderControls } from "../components/RenderControls";
import { Spacing } from "../components/Spacing";
import { TemplateForm } from "../components/TemplateForm";
import { getTemplate, templates } from "../../types/templates";

const Home: NextPage = () => {
  const [templateId, setTemplateId] = useState<string>(templates[0].id);
  const template = getTemplate(templateId) ?? templates[0];

  const [propsByTemplate, setPropsByTemplate] = useState<
    Record<string, Record<string, unknown>>
  >(() =>
    Object.fromEntries(templates.map((t) => [t.id, { ...t.defaultProps }])),
  );

  const [durationSecondsByTemplate, setDurationSecondsByTemplate] = useState<
    Record<string, number>
  >(() =>
    Object.fromEntries(
      templates.map((t) => [t.id, t.durationInFrames / t.fps]),
    ),
  );

  const inputProps = propsByTemplate[template.id];
  const durationSeconds = durationSecondsByTemplate[template.id];
  const durationInFrames = Math.max(1, Math.round(durationSeconds * template.fps));

  const onFieldChange = (key: string, value: string | number) => {
    setPropsByTemplate((prev) => ({
      ...prev,
      [template.id]: { ...prev[template.id], [key]: value },
    }));
  };

  const onDurationChange = (seconds: number) => {
    setDurationSecondsByTemplate((prev) => ({ ...prev, [template.id]: seconds }));
  };

  const playerKey = useMemo(() => template.id, [template.id]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* left: template list */}
      <div className="w-56 shrink-0 border-r border-unfocused-border-color p-4 flex flex-col gap-1 overflow-y-auto">
        <span className="text-xs uppercase tracking-wide text-subtitle px-2 mb-1">
          템플릿
        </span>
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplateId(t.id)}
            className={`text-left px-3 py-2 rounded-geist text-sm font-medium transition-colors duration-150 ease-in-out ${
              t.id === template.id
                ? "bg-unfocused-border-color text-foreground"
                : "text-subtitle hover:bg-unfocused-border-color/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* center: preview */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
        <div className="w-full max-w-[360px] overflow-hidden rounded-geist border border-white/25">
          <Player
            key={playerKey}
            component={template.component}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            fps={template.fps}
            compositionHeight={template.height}
            compositionWidth={template.width}
            style={{
              width: "100%",
            }}
            controls
            autoPlay
            loop
            initiallyMuted
          />
        </div>
      </div>

      {/* right: settings */}
      <div className="w-80 shrink-0 border-l border-unfocused-border-color p-5 overflow-y-auto flex flex-col">
        <span className="text-xs uppercase tracking-wide text-subtitle mb-3">
          설정
        </span>
        <div className="text-sm font-medium mb-4">{template.label}</div>

        <div className="flex flex-col gap-1.5 mb-3">
          <span className="text-sm text-subtitle">길이 (초)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={durationSeconds}
            onChange={(e) => onDurationChange(Number(e.currentTarget.value))}
            className="w-20 leading-[1.4] rounded-geist bg-background px-2.5 py-1.5 text-foreground text-sm border border-unfocused-border-color transition-colors duration-150 ease-in-out focus:border-focused-border-color outline-none"
          />
        </div>

        <TemplateForm
          fields={template.fields}
          values={inputProps}
          onFieldChange={onFieldChange}
        />
        <Spacing></Spacing>
        <RenderControls
          templateId={template.id}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
        ></RenderControls>
      </div>
    </div>
  );
};

export default Home;
