// ElevenLabs Text-to-Speech wrapper.
// Backend-only (uses secret key) — never import from client components.

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// "George" — warm, mid-range narration voice (ElevenLabs pre-made).
// Override with ELEVENLABS_VOICE_ID env var to use a different/cloned voice.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export interface GenerateSpeechOptions {
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

/**
 * Converts script text to speech via ElevenLabs TTS.
 * Returns an MP3 audio Buffer (44.1kHz, 128kbps).
 */
export async function generateSpeech(
  text: string,
  options: GenerateSpeechOptions = {}
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const voiceId =
    options.voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  const res = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: options.modelId || "eleven_multilingual_v2",
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
        },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${detail}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
