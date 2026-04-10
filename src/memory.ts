/**
 * PAI memory writer.
 * Appends a session summary to the PAI memory index when a conversation ends.
 */

import { appendFile } from "fs/promises";
import type { Message } from "./session.ts";

const MEMORY_FILE = `${process.env.HOME}/.claude/projects/-home-randy--claude/memory/telegram-sessions.md`;

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

  await appendFile(MEMORY_FILE, entry, "utf-8");
}
