/**
 * Tests for the prompt texts: the constant system prompt and the two
 * per-medium user-turn builders.
 */

import { test, expect } from "bun:test";
import { MIA_SYSTEM_PROMPT, buildResearchPrompt, buildVoicePrompt } from "./prompts.ts";

test("the system prompt states the plain-text constraint", () => {
  expect(MIA_SYSTEM_PROMPT).toContain("PLAIN TEXT");
  expect(MIA_SYSTEM_PROMPT).toContain("ToolSearch");
});

test("the system prompt names the broader tool set, not just Bash", () => {
  // Understating the tool set (e.g. "you have access to the Bash tool") was
  // one of the three defects this branch fixed. Agent and Read are good
  // anchors because a regression to the old, narrower wording would drop them.
  expect(MIA_SYSTEM_PROMPT).toContain("Agent");
  expect(MIA_SYSTEM_PROMPT).toContain("Read");
});

test("the system prompt is itself written in plain prose", () => {
  // A prompt that demands plain prose while being written in bullets
  // undercuts itself. The check is structural — line-leading markers and
  // fences — because the prose legitimately contains the characters it
  // names while explaining what not to emit.
  for (const line of MIA_SYSTEM_PROMPT.split("\n")) {
    expect(line.trimStart()).not.toMatch(/^(#|[-*>]\s)/);
  }
  expect(MIA_SYSTEM_PROMPT).not.toContain("```");
});

test("carries the research directive in the user turn", () => {
  const prompt = buildResearchPrompt("quantum error correction");
  expect(prompt).toContain("Research mode");
  expect(prompt).toContain("quantum error correction");
});

test("the research directive does not steer to curl", () => {
  expect(buildResearchPrompt("anything")).not.toContain("curl");
});

test("puts the research topic last so it reads as the request", () => {
  const prompt = buildResearchPrompt("tokamaks");
  expect(prompt.trimEnd().endsWith("tokamaks")).toBe(true);
});

test("carries the voice directive in the user turn", () => {
  const prompt = buildVoicePrompt("what is the weather");
  expect(prompt).toContain("spoken aloud");
  expect(prompt).toContain("what is the weather");
});

test("puts the transcript last so it reads as the request", () => {
  const prompt = buildVoicePrompt("remind me to call mum");
  expect(prompt.trimEnd().endsWith("remind me to call mum")).toBe(true);
});

test("neither builder labels its directive as prior conversation", () => {
  // The old bug: a directive arrived as "Conversation so far: You are Mia
  // in research mode…", an instruction disguised as dialogue.
  expect(buildResearchPrompt("anything")).not.toContain("Conversation so far");
  expect(buildVoicePrompt("anything")).not.toContain("Conversation so far");
});
