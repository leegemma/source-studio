"use client";

import { Player } from "@remotion/player";
import type { NextPage } from "next";
import { useMemo, useState } from "react";
import { HomeCard, HomePanel } from "../components/HomePanel";
import { ImageGenPanel } from "../components/ImageGenPanel";
import { PomodoroPanel } from "../components/PomodoroPanel";
import { RenderControls } from "../components/RenderControls";
import {
  BarChartIcon,
  BellIcon,
  ClockIcon,
  ImageIcon,
  ListChecksIcon,
  TimerIcon,
} from "../components/SidebarIcons";
import { Spacing } from "../components/Spacing";
import { TemplateForm } from "../components/TemplateForm";
import { getTemplate, templates } from "../../types/templates";

type Mode =
  | { kind: "home" }
  | { kind: "template"; id: string }
  | { kind: "image-gen" }
  | { kind: "pomodoro" };

const TEMPLATE_ICON: Record<string, React.FC> = {
  SubscribeCTA: BellIcon,
  CounterStat: BarChartIcon,
  PieClockTimer: ClockIcon,
  ProgressSteps: ListChecksIcon,
};

const HOME_CARDS: HomeCard[] = [
  ...templates.map((t, i) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    icon: TEMPLATE_ICON[t.id],
    iconBg: ["#8a6d3b", "#3b5fe2", "#2E4C18", "#a855f7"][i % 4],
  })),
  {
    id: "image-gen",
    label: "이미지 생성",
    description: "OpenAI로 프롬프트 기반 이미지를 생성",
    icon: ImageIcon,
    iconBg: "#7c3aed",
  },
  {
    id: "pomodoro",
    label: "뽀모도로 타이머",
    description: "집중/휴식을 반복하는 실시간 카운트다운 타이머",
    icon: TimerIcon,
    iconBg: "#ef4444",
  },
];

const Home: NextPage = () => {
  const [mode, setMode] = useState<Mode>({ kind: "home" });
  const templateId = mode.kind === "template" ? mode.id : templates[0].id;
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

  const onFieldChange = (key: string, value: string | number | string[]) => {
    setPropsByTemplate((prev) => ({
      ...prev,
      [template.id]: { ...prev[template.id], [key]: value },
    }));
  };

  const onDurationChange = (seconds: number) => {
    setDurationSecondsByTemplate((prev) => ({ ...prev, [template.id]: seconds }));
  };

  const playerKey = useMemo(() => template.id, [template.id]);

  const selectFromHome = (id: string) => {
    if (id === "image-gen" || id === "pomodoro") {
      setMode({ kind: id });
    } else {
      setMode({ kind: "template", id });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* left: template list */}
      <div className="w-56 shrink-0 border-r border-unfocused-border-color p-4 flex flex-col gap-1 overflow-y-auto">
        <button
          onClick={() => setMode({ kind: "home" })}
          className="px-2 mb-4 text-lg font-bold text-foreground text-left"
        >
          source-studio
        </button>
        <span className="text-xs uppercase tracking-wide text-subtitle font-semibold px-2 mb-1">
          템플릿
        </span>
        {templates.map((t) => {
          const Icon = TEMPLATE_ICON[t.id];
          const active = mode.kind === "template" && mode.id === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setMode({ kind: "template", id: t.id })}
              className={`flex items-center gap-2.5 text-left px-3 py-2 rounded-geist text-sm font-medium transition-colors duration-150 ease-in-out ${
                active
                  ? "bg-unfocused-border-color text-foreground"
                  : "text-subtitle hover:bg-unfocused-border-color/50 hover:text-foreground"
              }`}
            >
              {Icon ? <Icon /> : null}
              {t.label}
            </button>
          );
        })}

        <span className="text-xs uppercase tracking-wide text-subtitle font-semibold px-2 mb-1 mt-4">
          도구
        </span>
        <button
          onClick={() => setMode({ kind: "image-gen" })}
          className={`flex items-center gap-2.5 text-left px-3 py-2 rounded-geist text-sm font-medium transition-colors duration-150 ease-in-out ${
            mode.kind === "image-gen"
              ? "bg-unfocused-border-color text-foreground"
              : "text-subtitle hover:bg-unfocused-border-color/50 hover:text-foreground"
          }`}
        >
          <ImageIcon />
          이미지 생성
        </button>
        <button
          onClick={() => setMode({ kind: "pomodoro" })}
          className={`flex items-center gap-2.5 text-left px-3 py-2 rounded-geist text-sm font-medium transition-colors duration-150 ease-in-out ${
            mode.kind === "pomodoro"
              ? "bg-unfocused-border-color text-foreground"
              : "text-subtitle hover:bg-unfocused-border-color/50 hover:text-foreground"
          }`}
        >
          <TimerIcon />
          뽀모도로 타이머
        </button>
      </div>

      {mode.kind === "home" ? (
        <HomePanel cards={HOME_CARDS} onSelect={selectFromHome} />
      ) : mode.kind === "image-gen" ? (
        <ImageGenPanel />
      ) : mode.kind === "pomodoro" ? (
        <PomodoroPanel />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};

export default Home;
