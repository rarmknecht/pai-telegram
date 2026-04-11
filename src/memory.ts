/**
 * PAI memory writer.
 * Appends a session summary to the PAI memory index when a conversation ends.
 */

import { appendFile } from "fs/promises";
import type { Message } from "./session.ts";
import { config } from "./config.ts";

export async function writeSessionMemory(
  chatId: number,
  history: Message[]
): Promise<void> {
  if (history.length === 0) return;

  const date = new Date().toISOString().split("T")[0];
  const turns = history.length;
  const preview = history
    .slice(-4)
    .map((m) => `  **${m.role === "user" ? "You" : "Mia"}:** ${m.content.slice(0, 120)}`)
    .join("\n");

  const entry = `\n---\n**Session ${date} (chat ${chatId}, ${turns} messages)**\n${preview}\n`;

  await appendFile(config.memoryFile, entry, "utf-8");
}
