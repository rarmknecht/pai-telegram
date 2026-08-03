/**
 * Source-level guard on the per-chat lock wiring.
 *
 * withChatLock is what stops two messages in one chat from racing the same
 * Claude Code session, but its correctness lives in *where it is called*, not in
 * any function's return value. Deleting it from the handlers leaves every other
 * test green — the executor still works, the lock module still works, and
 * nothing observes the missing serialization without booting grammY against a
 * real Telegram update stream.
 *
 * So this asserts on the source text instead: every executor entry point in the
 * handler files must be wrapped in withChatLock. It is deliberately literal —
 * if a refactor changes the call shape, read the handlers and confirm the lock
 * still wraps them before relaxing these patterns.
 */

import { test, expect } from "bun:test";

const botSource = await Bun.file(`${import.meta.dir}/bot.ts`).text();
const commandsSource = await Bun.file(`${import.meta.dir}/commands.ts`).text();

/** Counts calls to `name`, ignoring its own `function name(` declaration. */
function callCount(source: string, name: string): number {
  const calls = source.match(new RegExp(`\\b${name}\\s*\\(`, "g"))?.length ?? 0;
  const declarations = source.match(new RegExp(`function\\s+${name}\\s*\\(`, "g"))?.length ?? 0;
  return calls - declarations;
}

/** Counts calls to `name` that sit directly inside `withChatLock(x, () => ...)`. */
function lockedCallCount(source: string, name: string): number {
  const pattern = new RegExp(`withChatLock\\([^)]*,\\s*\\(\\)\\s*=>\\s*${name}\\s*\\(`, "g");
  return source.match(pattern)?.length ?? 0;
}

test("every handleInference call in bot.ts is wrapped by withChatLock", () => {
  const total = callCount(botSource, "handleInference");
  expect(total).toBe(2); // text handler + voice handler
  expect(lockedCallCount(botSource, "handleInference")).toBe(total);
});

test("bot.ts reaches the executor only through the locked handleInference", () => {
  // handleInference is the single executor call site in bot.ts, and the test
  // above proves every call to it is locked. A second, unlocked executeWithMia
  // call added anywhere in the file trips this.
  expect(callCount(botSource, "executeWithMia")).toBe(1);
  expect(botSource).toContain("withChatLock");
});

test("handleResearch's executor call in commands.ts is wrapped by withChatLock", () => {
  const total = callCount(commandsSource, "executeWithMia");
  expect(total).toBe(1);
  expect(lockedCallCount(commandsSource, "executeWithMia")).toBe(total);
});

// The two tests below are source-level for the same reason as the lock guard
// above: handleInference's return value looks identical to every other test
// whether or not the voice directive is attached, because nothing here boots
// grammY or inspects what Claude actually received. Only the source text
// shows which call site builds the voice prompt and which one doesn't.

test("the voice handler passes buildVoicePrompt(transcript) into handleInference", () => {
  expect(botSource).toContain("handleInference(chatId, buildVoicePrompt(transcript), ctx)");
});

test("the text handler passes the message text bare, with no buildVoicePrompt wrapper", () => {
  // If buildVoicePrompt ever leaked into the text handler, the speech
  // directive ("answer in one or two conversational sentences") would
  // contaminate every text chat, not just voice turns.
  expect(botSource).toContain("handleInference(ctx.chat.id, ctx.message.text, ctx)");
  expect(botSource).not.toMatch(/handleInference\(ctx\.chat\.id,\s*buildVoicePrompt/);
});
