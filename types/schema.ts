import { z } from "zod";

export const RenderRequest = z.object({
  id: z.string(),
  inputProps: z.record(z.string(), z.unknown()),
});

export type RenderResponse = {
  url: string;
  size: number;
};
