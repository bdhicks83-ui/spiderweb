import React from "react";
import { Composition } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import {
  FPS,
  HEIGHT,
  InsightVideo,
  InsightVideoProps,
  WIDTH,
} from "./InsightVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="InsightVideo"
      component={InsightVideo}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={30 * FPS}
      defaultProps={
        {
          audioUrl: "",
          scriptText: "This is a placeholder script. Replace via input props.",
          audioDurationSeconds: 30,
        } as InsightVideoProps
      }
      calculateMetadata={async ({ props }) => {
        // Measure the real audio so video length always matches narration,
        // plus a 1s tail so the ending doesn't clip.
        const seconds = props.audioUrl
          ? await getAudioDurationInSeconds(props.audioUrl)
          : props.audioDurationSeconds;
        return {
          durationInFrames: Math.ceil((seconds + 1) * FPS),
          props: { ...props, audioDurationSeconds: seconds },
        };
      }}
    />
  );
};
