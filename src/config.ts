/**
 * Centralized environment configuration.
 *
 * Validates all required environment variables at startup so the bot fails
 * fast with a clear error rather than crashing at the first API call.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable "${name}" is not set`);
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function parseOwnerId(): number {
  const raw = requireEnv("OWNER_ID");
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`OWNER_ID must be a positive integer, got: "${raw}"`);
  }
  return id;
}

function resolveMemoryFile(): string {
  const home = process.env.HOME ?? "";
  const user = process.env.USER ?? process.env.LOGNAME ?? "user";
  const defaultPath = `${home}/.claude/projects/-home-${user}--claude/memory/telegram-sessions.md`;
  return optionalEnv("PAI_MEMORY_FILE", defaultPath);
}

export const config = {
  /** Telegram bot token */
  botToken: requireEnv("BOT_TOKEN"),

  /** Telegram user ID of the sole authorized owner */
  ownerId: parseOwnerId(),

  /** ElevenLabs API key for TTS */
  elevenLabsApiKey: requireEnv("ELEVENLABS_API_KEY"),

  /** ElevenLabs voice ID for Mia */
  miaVoiceId: optionalEnv("MIA_VOICE_ID", "lcMyyd2HUfFzxdCaC4Ta"),

  /** Path to the Python virtual-env used for Whisper transcription */
  whisperVenv: requireEnv("WHISPER_VENV"),

  /**
   * Python binary name inside the Whisper venv's bin/ directory.
   * Defaults to "python3" — override with WHISPER_PYTHON if your venv
   * uses a versioned binary like "python3.12".
   */
  whisperPython: optionalEnv("WHISPER_PYTHON", "python3"),

  /** Absolute path to PAI's Inference.ts tool */
  inferencePath: requireEnv("INFERENCE_PATH"),

  /**
   * Absolute path to the PAI memory file where sessions are appended.
   * Defaults to ~/.claude/projects/-home-{USER}--claude/memory/telegram-sessions.md
   * Override with PAI_MEMORY_FILE if your setup differs.
   */
  memoryFile: resolveMemoryFile(),
} as const;
