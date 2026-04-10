import { safeUnlink } from "./utils.ts";

const WHISPER_VENV = process.env.WHISPER_VENV!;
const TRANSCRIBE_SCRIPT = new URL("../scripts/transcribe.py", import.meta.url).pathname;

export async function transcribeVoice(fileBuffer: Uint8Array, messageId: number): Promise<string> {
  const tmpPath = `/tmp/tg-voice-${messageId}.ogg`;
  await Bun.write(tmpPath, fileBuffer);
  try {
    return await runWhisper(tmpPath);
  } finally {
    await safeUnlink(tmpPath);
  }
}

async function runWhisper(audioPath: string): Promise<string> {
  const pythonBin = `${WHISPER_VENV}/bin/python3.14`;
  const proc = Bun.spawn([pythonBin, TRANSCRIBE_SCRIPT, audioPath], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => proc.kill(), 60000);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  if (exitCode !== 0) {
    const errText = await Bun.readableStreamToText(proc.stderr as ReadableStream);
    throw new Error(`Whisper exited ${exitCode}: ${errText.slice(0, 200)}`);
  }
  return (await Bun.readableStreamToText(proc.stdout as ReadableStream)).trim();
}
