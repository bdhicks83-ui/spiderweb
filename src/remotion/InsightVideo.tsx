import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export interface InsightVideoProps {
  audioUrl: string;
  scriptText: string;
  /** Audio duration in seconds — computed by calculateMetadata or the render script. */
  audioDurationSeconds: number;
  [key: string]: unknown;
}

/** Split script into sentences (keeps punctuation). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Allocate frames to each sentence proportional to its character count,
 * so caption timing tracks natural speech pacing across the audio.
 */
export function sentenceTimings(
  sentences: string[],
  totalFrames: number
): { from: number; duration: number }[] {
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
  const timings: { from: number; duration: number }[] = [];
  let cursor = 0;

  sentences.forEach((sentence, i) => {
    const isLast = i === sentences.length - 1;
    const duration = isLast
      ? totalFrames - cursor
      : Math.round((sentence.length / totalChars) * totalFrames);
    timings.push({ from: cursor, duration: Math.max(duration, 1) });
    cursor += duration;
  });

  return timings;
}

const Caption: React.FC<{ text: string; duration: number }> = ({
  text,
  duration,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 12], [24, 0], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [Math.max(duration - 8, 0), duration],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "0 220px",
      }}
    >
      <p
        style={{
          fontFamily:
            "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 64,
          fontWeight: 600,
          lineHeight: 1.35,
          color: "#f5f5f0",
          textAlign: "center",
          opacity: fadeIn * fadeOut,
          transform: `translateY(${rise}px)`,
          margin: 0,
        }}
      >
        {text}
      </p>
    </AbsoluteFill>
  );
};

export const InsightVideo: React.FC<InsightVideoProps> = ({
  audioUrl,
  scriptText,
}) => {
  const { durationInFrames } = useVideoConfig();
  const sentences = splitSentences(scriptText);
  // Reserve a beat of silence at the end (1s) so the last caption doesn't cut hard.
  const speechFrames = Math.max(durationInFrames - FPS, FPS);
  const timings = sentenceTimings(sentences, speechFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0c0c10" }}>
      <Audio src={audioUrl} />
      {sentences.map((sentence, i) => (
        <Sequence
          key={i}
          from={timings[i].from}
          durationInFrames={timings[i].duration + 8}
        >
          <Caption text={sentence} duration={timings[i].duration} />
        </Sequence>
      ))}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 48,
        }}
      >
        <p
          style={{
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            fontSize: 28,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#8a8a93",
            margin: 0,
          }}
        >
          Leadership in Transit
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
