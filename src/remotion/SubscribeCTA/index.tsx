import React from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { zColor } from "@remotion/zod-types";
import { z } from "zod";
import { Sparkles } from "./Sparkles";
import { SubscribeButton } from "./SubscribeButton";
import { TapCursor } from "./TapCursor";
import { BUTTON_CENTER, CURSOR_START_FRAME, TAP_FRAME, TAP_POINT } from "./constants";

const CAPTION_FONT_FAMILY = "GriunCherry1Spoon";

// Guarded because this module is also imported by the Next.js site (for the
// template registry), which SSRs it once at build time where FontFace/document
// don't exist; only the browser/headless-render environment needs the font.
if (typeof FontFace !== "undefined") {
  const waitForCaptionFont = delayRender(`Loading ${CAPTION_FONT_FAMILY}`);
  const captionFontFace = new FontFace(
    CAPTION_FONT_FAMILY,
    `url('${staticFile("fonts/Griun_Cherry1Spoon-Rg.ttf")}') format('truetype')`,
  );
  captionFontFace
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      continueRender(waitForCaptionFont);
    })
    .catch((err) => cancelRender(err));
}

export const subscribeCtaSchema = z.object({
  captionText: z.string(),
  buttonText: z.string(),
  bgColor: zColor(),
  buttonColor: zColor(),
  captionColor: zColor(),
  buttonTextColor: zColor(),
});

export const defaultSubscribeCtaProps: z.infer<typeof subscribeCtaSchema> = {
  captionText: "다음주에도 꿀피부 레시피를 보고싶다면",
  buttonText: "구독",
  bgColor: "#000000",
  buttonColor: "#E53935",
  captionColor: "#333333",
  buttonTextColor: "#FFFFFF",
};

export const SubscribeCTA: React.FC<z.infer<typeof subscribeCtaSchema>> = ({
  captionText,
  buttonText,
  bgColor,
  buttonColor,
  captionColor,
  buttonTextColor,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn, backgroundColor: bgColor }}>
      {/* Vignette — darkens edges so text/button read over any footage.
          Actual blur of the underlying video must be applied in CapCut on the clip itself;
          this transparent overlay has no access to the footage pixels. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 860,
          left: 0,
          width: "100%",
          textAlign: "center",
          padding: "0 90px",
          fontFamily: CAPTION_FONT_FAMILY,
          fontSize: 46,
          lineHeight: 1.5,
          color: captionColor,
          textShadow: "0 2px 12px rgba(0,0,0,0.25)",
        }}
      >
        {captionText.split("\n").map((line, index) => (
          <React.Fragment key={index}>
            {index > 0 && <br />}
            {line}
          </React.Fragment>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: BUTTON_CENTER.y,
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <SubscribeButton
          tapFrame={TAP_FRAME}
          buttonText={buttonText}
          buttonColor={buttonColor}
          buttonTextColor={buttonTextColor}
        />
      </div>

      <TapCursor
        startFrame={CURSOR_START_FRAME}
        tapFrame={TAP_FRAME}
        from={{ x: width + 80, y: height + 80 }}
        to={TAP_POINT}
      />

      <Sparkles originX={TAP_POINT.x} originY={TAP_POINT.y} startFrame={TAP_FRAME} />
    </AbsoluteFill>
  );
};

export default SubscribeCTA;
