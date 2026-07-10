import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { executeApi } from "../../../helpers/api-response";

export const runtime = "nodejs";

const GENERATED_DIR = path.join(process.cwd(), "public/generated");

const GenerateImageRequest = z.object({
  prompt: z.string().min(1),
  size: z.enum(["1024x1024", "1024x1792", "1792x1024"]).default("1024x1024"),
});

export const POST = executeApi(GenerateImageRequest, async (req, body) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY가 설정되지 않았어요. 프로젝트 루트에 .env.local 파일을 만들고 OPENAI_API_KEY=\"sk-...\" 를 넣은 뒤 dev 서버를 재시작하세요.",
    );
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: body.prompt,
      size: body.size,
      n: 1,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI 이미지 생성 실패 (${response.status}): ${errBody}`);
  }

  const json = (await response.json()) as {
    data: { b64_json: string; revised_prompt?: string }[];
  };
  const image = json.data[0];

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const fileName = `image-${Date.now()}.png`;
  fs.writeFileSync(path.join(GENERATED_DIR, fileName), image.b64_json, "base64");

  return {
    url: `/generated/${fileName}`,
    revisedPrompt: image.revised_prompt ?? body.prompt,
  };
});
