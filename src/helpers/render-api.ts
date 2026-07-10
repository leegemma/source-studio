import { z } from "zod";
import { RenderRequest, RenderResponse } from "../../types/schema";
import { ApiResponse } from "./api-response";

export const renderVideo = async ({
  id,
  inputProps,
}: z.infer<typeof RenderRequest>): Promise<RenderResponse> => {
  const result = await fetch("/api/render", {
    method: "post",
    body: JSON.stringify({ id, inputProps }),
    headers: {
      "content-type": "application/json",
    },
  });
  const json = (await result.json()) as ApiResponse<RenderResponse>;
  if (json.type === "error") {
    throw new Error(json.message);
  }

  return json.data;
};
