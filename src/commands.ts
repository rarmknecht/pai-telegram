/**
 * Slash command handlers.
 */

import type { CommandContext, Context } from "grammy";
import { addMessage, clearHistory, getHistory } from "./session.ts";
import { writeSessionMemory } from "./memory.ts";
import { executeWithMia } from "./executor.ts";

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const chatId = ctx.chat.id;
  clearHistory(chatId);
  await ctx.reply(
    "Hey! I'm Mia. Fresh conversation started. What's on your mind?"
  );
}

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(
    "Available commands:\n" +
    "/start — Reset conversation context\n" +
    "/end — Save session to memory and reset\n" +
    "/research <topic> — Research mode\n" +
    "/help — Show this message\n\n" +
    "Send text or voice messages to chat with me."
  );
}

export async function handleEnd(ctx: CommandContext<Context>): Promise<void> {
  const chatId = ctx.chat.id;
  const history = getHistory(chatId);
  await writeSessionMemory(chatId, history);
  clearHistory(chatId);
  await ctx.reply("Session saved to memory. Starting fresh.");
}

export async function handleResearch(ctx: CommandContext<Context>): Promise<void> {
  const chatId = ctx.chat.id;
  const topic = ctx.match?.trim();
  if (!topic) {
    await ctx.reply("Usage: /research <topic>");
    return;
  }

  const researchContext = "You are Mia in research mode. Use web search via curl if needed. Be thorough but direct.";

  await ctx.api.sendChatAction(chatId, "typing");
  try {
    addMessage(chatId, "user", topic);
    const response = await executeWithMia(topic, researchContext);
    addMessage(chatId, "assistant", response);
    await ctx.reply(response);
  } catch (err) {
    await ctx.reply(`Research failed: ${(err as Error).message}`);
  }
}
