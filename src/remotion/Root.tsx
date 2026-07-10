import { Composition } from "remotion";
import { templates } from "../../types/templates";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {templates.map((template) => (
        <Composition
          key={template.id}
          id={template.id}
          component={template.component}
          durationInFrames={template.durationInFrames}
          fps={template.fps}
          width={template.width}
          height={template.height}
          schema={template.schema}
          defaultProps={template.defaultProps}
        />
      ))}
    </>
  );
};
