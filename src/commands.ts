/**
 * Slash command handlers.
 */

import type { CommandContext, Context } from "grammy";
import { resetSession } from "./session.ts";
import { executeWithMia } from "./executor.ts";
import { sendLongMessage } from "./utils.ts";
import { withChatLock } from "./lock.ts";

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  resetSession(ctx.chat.id);
  await ctx.reply("Hey! I'm Mia. Fresh conversation started. What's on your mind?");
}

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(
    "Available commands:\n" +
    "/start — Start a fresh session\n" +
    "/end — End this session and start fresh\n" +
    "/research <topic> — Research mode\n" +
    "/help — Show this message\n\n" +
    "Send text or voice messages to chat with me."
  );
}

export async function handleEnd(ctx: CommandContext<Context>): Promise<void> {
  resetSession(ctx.chat.id);
  await ctx.reply("Session ended — the transcript stays in Claude Code's history. Starting fresh.");
}

export async function handleResearch(ctx: CommandContext<Context>): Promise<void> {
  const chatId = ctx.chat.id;
  const topic = ctx.match?.trim();
  if (!topic) {
    await ctx.reply("Usage: /research <topic>");
    return;
  }

  await ctx.api.sendChatAction(chatId, "typing");
  try {
    const response = await withChatLock(chatId, () => executeWithMia(chatId, topic));
    await sendLongMessage(ctx, response);
  } catch (err) {
    await ctx.reply(`Research failed: ${(err as Error).message}`);
  }
}
