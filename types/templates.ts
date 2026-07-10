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
  type: "text" | "number" | "color";
};

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
      { key: "captionText", label: "안내 문구", type: "text" },
      { key: "buttonText", label: "버튼 문구", type: "text" },
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
      { key: "bgColor", label: "배경색", type: "color" },
      { key: "numberColor", label: "숫자 색상", type: "color" },
      { key: "labelColor", label: "라벨 색상", type: "color" },
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
      { key: "discColor", label: "원판 색상", type: "color" },
      { key: "wedgeColor", label: "웨지 색상", type: "color" },
      { key: "tickColor", label: "눈금 색상", type: "color" },
      { key: "numberColor", label: "숫자 색상", type: "color" },
    ],
  },
];

export const getTemplate = (id: string): Template | undefined =>
  templates.find((template) => template.id === id);

