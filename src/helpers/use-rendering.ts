import { useCallback, useMemo, useState } from "react";
import { renderVideo } from "./render-api";

export type State =
  | {
      status: "init";
    }
  | {
      status: "invoking";
    }
  | {
      status: "error";
      error: Error;
    }
  | {
      url: string;
      size: number;
      status: "done";
    };

export const useRendering = (
  id: string,
  inputProps: Record<string, unknown>,
  durationInFrames: number,
) => {
  const [state, setState] = useState<State>({
    status: "init",
  });

  const renderMedia = useCallback(async () => {
    setState({
      status: "invoking",
    });
    try {
      const { url, size } = await renderVideo({ id, inputProps, durationInFrames });
      setState({
        status: "done",
        url,
        size,
      });
    } catch (err) {
      setState({
        status: "error",
        error: err as Error,
      });
    }
  }, [id, inputProps, durationInFrames]);

  const undo = useCallback(() => {
    setState({ status: "init" });
  }, []);

  return useMemo(() => {
    return {
      renderMedia,
      state,
      undo,
    };
  }, [renderMedia, state, undo]);
};
