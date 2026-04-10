/**
 * Mia inference wrapper.
 * Imports PAI Inference.ts and calls it with Mia's system prompt + conversation history.
 */

import type { Message } from "./session.ts";

const INFERENCE_PATH = process.env.INFERENCE_PATH!;

const MIA_SYSTEM_PROMPT = `You are Mia, a highly capable Personal AI assistant. You are direct, warm, enthusiastic, and sharp. You speak naturally and concisely — no corporate filler, no hedging. You remember the context of the current conversation. When asked to research, you gather information and synthesize it clearly. When asked to help with tasks, you focus on the simplest, most effective approach. Keep responses conversational and appropriately brief for a messaging context.`;

let _inference: ((opts: unknown) => Promise<{ success: boolean; output: string; error?: string }>) | null = null;

async function getInference() {
  if (!_inference) {
    const mod = await import(INFERENCE_PATH);
    _inference = mod.inference;
  }
  return _inference;
}

export async function askMia(
  userText: string,
  history: Message[],
  systemOverride?: string
): Promise<string> {
  const inference = await getInference();

  let contextBlock = "";
  if (history.length > 0) {
    contextBlock = history
      .map((m) => `${m.role === "user" ? "User" : "Mia"}: ${m.content}`)
      .join("\n");
    contextBlock += "\n\n";
  }

  const result = await inference({
    systemPrompt: systemOverride ?? MIA_SYSTEM_PROMPT,
    userPrompt: contextBlock + `User: ${userText}\nMia:`,
    level: "smart",
    timeout: 180000, // 3 minutes — Telegram messages can request complex long-form output
  });

  if (!result.success) {
    throw new Error(result.error || "Inference failed");
  }

  return result.output.trim();
}
