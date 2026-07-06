// End-to-end pipeline test: ElevenLabs TTS → Remotion render → out/test-video.mp4
// Run from repo root AFTER `npm install`:  npm run render:test
// Reads ELEVENLABS_API_KEY (and optional ELEVENLABS_VOICE_ID) from .env.local

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "fs/promises";
import path from "path";

// ── Test script: "Incentives Create the Standards" ──
const SCRIPT_TEXT = `Most leaders think culture comes from what they say matters. It doesn't. It comes from what the system rewards. Watch it happen: promotions follow predictability, so leaders optimize for certainty. Clean execution gets praised and bold bets don't, so people quietly stop making them. Nobody announced the standard. It was incentivized into existence. So when a behavior frustrates you, don't audit the person. Audit the environment. What you're seeing is a mirror, not a defect.`;

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // "George"

async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // .env.local optional if vars already exported
  }
}

async function generateAudio() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing — add it to .env.local");
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  console.log("1/3 Generating narration via ElevenLabs...");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text: SCRIPT_TEXT,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs failed (${res.status}): ${await res.text()}`);

  const mp3 = Buffer.from(await res.arrayBuffer());
  await fs.mkdir("out", { recursive: true });
  await fs.writeFile("out/test-audio.mp3", mp3);
  console.log(`    Audio saved: out/test-audio.mp3 (${(mp3.length / 1024).toFixed(0)} KB)`);
  return `data:audio/mpeg;base64,${mp3.toString("base64")}`;
}

async function main() {
  await loadEnvLocal();
  const audioUrl = await generateAudio();

  console.log("2/3 Bundling Remotion project...");
  const bundleLocation = await bundle({
    entryPoint: path.join(process.cwd(), "src/remotion/index.ts"),
  });

  const inputProps = { audioUrl, scriptText: SCRIPT_TEXT, audioDurationSeconds: 0 };
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "InsightVideo",
    inputProps,
  });
  console.log(`    Composition: ${composition.durationInFrames} frames @ ${composition.fps}fps (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);

  console.log("3/3 Rendering video (first run downloads headless Chrome)...");
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: "out/test-video.mp4",
    inputProps,
    onProgress: ({ progress }) =>
      process.stdout.write(`\r    ${(progress * 100).toFixed(0)}%`),
  });

  console.log("\nDone → out/test-video.mp4");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
