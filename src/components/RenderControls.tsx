import { useRendering } from "../helpers/use-rendering";
import { AlignEnd } from "./AlignEnd";
import { Button } from "./Button";
import { InputContainer } from "./Container";
import { DownloadButton } from "./DownloadButton";
import { ErrorComp } from "./Error";
import { Spacing } from "./Spacing";

export const RenderControls: React.FC<{
  templateId: string;
  inputProps: Record<string, unknown>;
  durationInFrames: number;
}> = ({ templateId, inputProps, durationInFrames }) => {
  const { renderMedia, state, undo } = useRendering(templateId, inputProps, durationInFrames);

  return (
    <InputContainer>
      {state.status === "init" ||
      state.status === "invoking" ||
      state.status === "error" ? (
        <>
          <Button
            primary
            disabled={state.status === "invoking"}
            loading={state.status === "invoking"}
            onClick={renderMedia}
          >
            Render video
          </Button>
          {state.status === "error" ? (
            <ErrorComp message={state.error.message}></ErrorComp>
          ) : null}
        </>
      ) : null}
      {state.status === "done" ? (
        <>
          <Spacing></Spacing>
          <AlignEnd>
            <DownloadButton undo={undo} state={state}></DownloadButton>
          </AlignEnd>
        </>
      ) : null}
    </InputContainer>
  );
};
