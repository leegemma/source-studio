import type { ComponentType } from "react";
import { ZodTypeAny } from "zod";
import {
  CounterStat,
  counterStatSchema,
  defaultCounterStatProps,
} from "../src/remotion/CounterStat";
import {
  PieClockTimer,
  pieClockTimerSchema,
  defaultPieClockTimerProps,
} from "../src/remotion/PieClockTimer";
import {
  SubscribeCTA,
  subscribeCtaSchema,
  defaultSubscribeCtaProps,
} from "../src/remotion/SubscribeCTA";
import {
  ProgressSteps,
  progressStepsSchema,
  defaultProgressStepsProps,
} from "../src/remotion/ProgressSteps";
import {
  STEPS_DURATION_IN_FRAMES,
  STEPS_FPS,
  STEPS_HEIGHT,
  STEPS_WIDTH,
  MAX_STEPS,
} from "../src/remotion/ProgressSteps/constants";
import {
  CLOCK_DURATION_IN_FRAMES,
  CLOCK_FPS,
  CLOCK_HEIGHT,
  CLOCK_WIDTH,
} from "../src/remotion/PieClockTimer/constants";
import {
  CTA_DURATION_IN_FRAMES,
  CTA_FPS,
  CTA_HEIGHT,
  CTA_WIDTH,
} from "../src/remotion/SubscribeCTA/constants";
import {
  STAT_DURATION_IN_FRAMES,
  STAT_FPS,
  STAT_HEIGHT,
  STAT_WIDTH,
} from "../src/remotion/CounterStat/constants";
export type TemplateField = {
  key: string;
  label: string;
  type: "text" | "number" | "color" | "slider" | "select" | "step-labels";
  // Quick-pick hex swatches shown under a color field, e.g. a brand palette.
  palette?: string[];
  // Range bounds for "slider" fields.
  min?: number;
  max?: number;
  step?: number;
  // Key of a "color" field to render directly under this field (e.g. a text
  // input paired with its own color) instead of in the general color group.
  pairColorKey?: string;
  // Choices for a "select" field.
  options?: number[];
  // For "step-labels": key of the "select"/number field holding how many
  // of this field's string-array entries are actually shown.
  countKey?: string;
};

export const COUNTER_STAT_PALETTE = [
  "#FFEBD2",
  "#E1EF97",
  "#2E4C18",
  "#FC6F2F",
  // original default scheme
  "#3B5FE2",
  "#FFFFFF",
  "#4ADE80",
];

export type Template = {
  id: string;
  label: string;
  // Heterogeneous registry — each template has a differently-shaped props
  // type, so the array element type can't stay generic without fighting
  // React's contravariant component typing. Kept loose here; each
  // component/schema pair is fully typed at its own definition site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  schema: ZodTypeAny;
  defaultProps: Record<string, unknown>;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  fields: TemplateField[];
};

export const templates: Template[] = [
  {
    id: "SubscribeCTA",
    label: "구독 유도",
    component: SubscribeCTA,
    schema: subscribeCtaSchema,
    defaultProps: defaultSubscribeCtaProps,
    width: CTA_WIDTH,
    height: CTA_HEIGHT,
    fps: CTA_FPS,
    durationInFrames: CTA_DURATION_IN_FRAMES,
    fields: [
      { key: "captionText", label: "안내 문구", type: "text", pairColorKey: "captionColor" },
      { key: "buttonText", label: "버튼 문구", type: "text", pairColorKey: "buttonTextColor" },
      { key: "bgColor", label: "배경색", type: "color" },
      { key: "buttonColor", label: "버튼 색상", type: "color" },
      { key: "captionColor", label: "안내 문구 색상", type: "color" },
      { key: "buttonTextColor", label: "버튼 문구 색상", type: "color" },
    ],
  },
  {
    id: "CounterStat",
    label: "카운터 통계 카드",
    component: CounterStat,
    schema: counterStatSchema,
    defaultProps: defaultCounterStatProps,
    width: STAT_WIDTH,
    height: STAT_HEIGHT,
    fps: STAT_FPS,
    durationInFrames: STAT_DURATION_IN_FRAMES,
    fields: [
      { key: "target", label: "목표 숫자", type: "number" },
      { key: "label", label: "라벨", type: "text" },
      { key: "bgColor", label: "배경색", type: "color", palette: COUNTER_STAT_PALETTE },
      {
        key: "numberColor",
        label: "숫자 색상",
        type: "color",
        palette: COUNTER_STAT_PALETTE,
      },
      {
        key: "labelColor",
        label: "라벨 색상",
        type: "color",
        palette: COUNTER_STAT_PALETTE,
      },
    ],
  },
  {
    id: "PieClockTimer",
    label: "파이 시계 타이머",
    component: PieClockTimer,
    schema: pieClockTimerSchema,
    defaultProps: defaultPieClockTimerProps,
    width: CLOCK_WIDTH,
    height: CLOCK_HEIGHT,
    fps: CLOCK_FPS,
    durationInFrames: CLOCK_DURATION_IN_FRAMES,
    fields: [
      { key: "target", label: "목표 숫자", type: "number" },
      { key: "label", label: "라벨", type: "text" },
      { key: "fontSize", label: "텍스트 크기", type: "slider", min: 60, max: 360, step: 20 },
      { key: "discColor", label: "원판 색상", type: "color" },
      { key: "wedgeColor", label: "웨지 색상", type: "color" },
      { key: "tickColor", label: "눈금 색상", type: "color" },
      { key: "numberColor", label: "숫자 색상", type: "color" },
    ],
  },
  {
    id: "ProgressSteps",
    label: "진행도",
    component: ProgressSteps,
    schema: progressStepsSchema,
    defaultProps: defaultProgressStepsProps,
    width: STEPS_WIDTH,
    height: STEPS_HEIGHT,
    fps: STEPS_FPS,
    durationInFrames: STEPS_DURATION_IN_FRAMES,
    fields: [
      {
        key: "stepCount",
        label: "단계 수",
        type: "select",
        options: Array.from({ length: MAX_STEPS }, (_, i) => i + 1),
      },
      { key: "labels", label: "단계별 텍스트", type: "step-labels", countKey: "stepCount" },
      { key: "barColor", label: "진행 바 색상", type: "color" },
      { key: "trackColor", label: "트랙 색상", type: "color" },
      { key: "textColor", label: "텍스트 색상", type: "color" },
    ],
  },
];

export const getTemplate = (id: string): Template | undefined =>
  templates.find((template) => template.id === id);

