import React from "react";
import { Composition, Still } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import {
  FPS,
  HEIGHT,
  InsightVideo,
  InsightVideoProps,
  WIDTH,
} from "./InsightVideo";
import { Ad90 } from "./ad/Ad90";
import { TOTAL_SEC } from "./ad/ad-script";
import { VIDEO } from "./brand/tokens";
import {
  AppIcon,
  LogoHorizontal,
  LogoStacked,
  LogoStackedReversed,
  OgImage,
} from "./brand/LogoStills";

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="Ad90"
      component={Ad90}
      width={VIDEO.width}
      height={VIDEO.height}
      fps={VIDEO.fps}
      durationInFrames={TOTAL_SEC * VIDEO.fps}
    />
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
    {/* Logo stills — rendered to public/brand/*.png via `npx remotion still` */}
    <Still id="LogoHorizontal" component={LogoHorizontal} width={960} height={208} />
    <Still id="LogoStacked" component={LogoStacked} width={640} height={640} />
    <Still
      id="LogoStackedReversed"
      component={LogoStackedReversed}
      width={640}
      height={640}
    />
    <Still id="AppIcon32" component={AppIcon} width={32} height={32} />
    <Still id="AppIcon180" component={AppIcon} width={180} height={180} />
    <Still id="AppIcon192" component={AppIcon} width={192} height={192} />
    <Still id="AppIcon512" component={AppIcon} width={512} height={512} />
    <Still id="OgImage" component={OgImage} width={1200} height={630} />
    </>
  );
};
