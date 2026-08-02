/**
 * Tests for tool-enabled execution against a persistent Claude Code session.
 */

import { test, expect } from "bun:test";
import { getSession, markStarted, resetSession } from "./session.ts";
import type { RunResult } from "./executor.ts";

process.env.BOT_TOKEN = "test-token";
process.env.OWNER_ID = "1";
process.env.ELEVENLABS_API_KEY = "test-key";
process.env.WHISPER_VENV = "/tmp";
process.env.SESSION_CWD = "/tmp";

const { buildClaudeArgs, executeWithMia } = await import("./executor.ts");

const ok = (stdout: string): RunResult => ({ stdout, stderr: "", exitCode: 0, timedOut: false });
const fail = (stderr: string): RunResult => ({ stdout: "", stderr, exitCode: 1, timedOut: false });

function systemPromptOf(args: string[]): string | undefined {
  return args[args.indexOf("--system-prompt") + 1];
}

test("first turn creates the session, later turns resume it", () => {
  const firstTurn = buildClaudeArgs({ id: "abc", started: false });
  const laterTurn = buildClaudeArgs({ id: "abc", started: true });

  expect(firstTurn).toContain("--session-id");
  expect(firstTurn).not.toContain("--resume");
  expect(laterTurn).toContain("--resume");
  expect(laterTurn).not.toContain("--session-id");
  expect(firstTurn[firstTurn.indexOf("--session-id") + 1]).toBe("abc");
  expect(laterTurn[laterTurn.indexOf("--resume") + 1]).toBe("abc");
});

test("the system prompt is byte-identical across turns", () => {
  // This is the caching invariant: a prefix that changes per turn costs full
  // price every message. If this test fails, prompt caching is silently gone.
  const firstTurn = systemPromptOf(buildClaudeArgs({ id: "abc", started: false }));
  const laterTurn = systemPromptOf(buildClaudeArgs({ id: "xyz", started: true }));
  expect(firstTurn).toBe(laterTurn);
  expect(firstTurn).toBeTruthy();
});

test("returns trimmed stdout and marks the session started", async () => {
  const chatId = 2001;
  const reply = await executeWithMia(chatId, "hello", 1000, async () => ok("hi there"));
  expect(reply).toBe("hi there");
  expect(getSession(chatId).started).toBe(true);
});

test("a failed resume mints a fresh session and retries once", async () => {
  const chatId = 2002;
  const staleId = getSession(chatId).id;
  markStarted(chatId);

  const attempts: string[][] = [];
  const reply = await executeWithMia(chatId, "hello", 1000, async (args) => {
    attempts.push(args);
    return attempts.length === 1 ? fail("No conversation found") : ok("recovered");
  });

  expect(reply).toBe("recovered");
  expect(attempts.length).toBe(2);
  expect(attempts[0]).toContain("--resume");
  expect(attempts[1]).toContain("--session-id");
  expect(getSession(chatId).id).not.toBe(staleId);
});

test("a failed first turn does not retry and leaves the session unstarted", async () => {
  const chatId = 2003;
  resetSession(chatId);

  let calls = 0;
  const attempt = executeWithMia(chatId, "hello", 1000, async () => {
    calls++;
    return fail("boom");
  });

  await expect(attempt).rejects.toThrow("exit 1");
  expect(calls).toBe(1);
  expect(getSession(chatId).started).toBe(false);
});

test("a timeout reports the duration rather than a bare exit code", async () => {
  const attempt = executeWithMia(2004, "hello", 300000, async () => ({
    stdout: "",
    stderr: "",
    exitCode: 143,
    timedOut: true,
  }));
  await expect(attempt).rejects.toThrow("Timed out after 300s");
});

test("empty output is reported as no response", async () => {
  const attempt = executeWithMia(2005, "hello", 1000, async () => ok("   "));
  await expect(attempt).rejects.toThrow("No response from Claude");
});
