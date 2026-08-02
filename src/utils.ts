import { unlink } from "node:fs/promises";
import { statSync } from "node:fs";
import type { Context } from "grammy";

export async function safeUnlink(path: string): Promise<void> {
  await unlink(path).catch(() => {});
}

const TELEGRAM_MAX_LENGTH = 4096;

/**
 * Sends a message that may exceed Telegram's 4096-character limit by splitting
 * it into chunks. Chunks are split on newlines where possible to avoid
 * breaking mid-sentence.
 */
export async function sendLongMessage(
  ctx: Context,
  text: string,
  options?: Parameters<Context["reply"]>[1]
): Promise<void> {
  if (text.length <= TELEGRAM_MAX_LENGTH) {
    await ctx.reply(text, options);
    return;
  }

  const chunks = splitMessage(text, TELEGRAM_MAX_LENGTH);
  for (const chunk of chunks) {
    await ctx.reply(chunk, options);
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to split on a newline within the limit
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt <= 0) {
      // No newline found — split on a space
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt <= 0) {
      // No space either — hard split at the limit
      splitAt = maxLen;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Resolves the working directory every Claude Code session runs in.
 * Falls back to the home directory when SESSION_CWD is unset, and fails fast
 * at startup rather than at the first message if the path is unusable.
 */
export function resolveSessionCwd(raw: string | undefined, home: string): string {
  const path = raw?.trim() || home;
  if (!path) {
    throw new Error("SESSION_CWD is unset and HOME is empty — cannot resolve a working directory");
  }

  let stat;
  try {
    stat = statSync(path);
  } catch {
    throw new Error(`SESSION_CWD does not exist: ${path}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`SESSION_CWD is not a directory: ${path}`);
  }
  return path;
}
