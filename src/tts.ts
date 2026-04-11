import { safeUnlink } from "./utils.ts";
import { config } from "./config.ts";

const TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${config.miaVoiceId}`;

export async function generateTTS(text: string, messageId: number): Promise<string> {
  const response = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": config.elevenLabsApiKey,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.35,
        similarity_boost: 0.8,
        style: 0.9,
        speed: 1.1,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs TTS failed ${response.status}: ${err.slice(0, 200)}`);
  }

  const tmpPath = `/tmp/tg-tts-${messageId}.mp3`;
  await Bun.write(tmpPath, await response.arrayBuffer());
  return tmpPath;
}

export { safeUnlink as cleanupTTS };
