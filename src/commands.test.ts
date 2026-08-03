/**
 * Tests for slash command helpers, notably the research-mode prompt builder.
 */

import { test, expect } from "bun:test";

process.env.BOT_TOKEN = "test-token";
process.env.OWNER_ID = "1";
process.env.ELEVENLABS_API_KEY = "test-key";
process.env.WHISPER_VENV = "/tmp";
process.env.SESSION_CWD = "/tmp";

const { buildResearchPrompt } = await import("./commands.ts");

test("carries the research directive in the user turn", () => {
  const prompt = buildResearchPrompt("quantum error correction");
  expect(prompt).toContain("Research mode");
  expect(prompt).toContain("quantum error correction");
});

test("never labels the directive as prior conversation", () => {
  // The old bug: the directive arrived as "Conversation so far: You are Mia
  // in research mode…", an instruction disguised as dialogue.
  expect(buildResearchPrompt("anything")).not.toContain("Conversation so far");
});

test("puts the topic last so it reads as the request", () => {
  const prompt = buildResearchPrompt("tokamaks");
  expect(prompt.trimEnd().endsWith("tokamaks")).toBe(true);
});
