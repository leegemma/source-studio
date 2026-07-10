import { z } from "zod";

export const RenderRequest = z.object({
  id: z.string(),
  inputProps: z.record(z.string(), z.unknown()),
  durationInFrames: z.number().optional(),
});

export type RenderResponse = {
  url: string;
  size: number;
};
