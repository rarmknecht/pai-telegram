import { unlink } from "node:fs/promises";
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
