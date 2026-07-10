import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { RenderRequest } from "../../../../types/schema";
import { executeApi } from "../../../helpers/api-response";
import { webpackOverride } from "../../../remotion/webpack-override.mjs";

export const runtime = "nodejs";

const ENTRY_POINT = path.join(process.cwd(), "src/remotion/index.ts");
const RENDERS_DIR = path.join(process.cwd(), "public/renders");

let bundlePromise: Promise<string> | null = null;

// Bundled once per dev-server process; restart `npm run dev` after editing
// a composition to pick up the change in rendered output.
const getServeUrl = () => {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY_POINT,
      webpackOverride,
    });
  }
  return bundlePromise;
};

export const POST = executeApi(RenderRequest, async (req, body) => {
  const serveUrl = await getServeUrl();

  const composition = await selectComposition({
    serveUrl,
    id: body.id,
    inputProps: body.inputProps,
  });

  fs.mkdirSync(RENDERS_DIR, { recursive: true });
  const fileName = `${body.id}-${Date.now()}.mp4`;
  const outputLocation = path.join(RENDERS_DIR, fileName);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps: body.inputProps,
  });

  const { size } = fs.statSync(outputLocation);

  return {
    url: `/renders/${fileName}`,
    size,
  };
});
