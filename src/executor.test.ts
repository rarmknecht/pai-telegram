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
  markStarted(getSession(chatId));

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

test("a stale resume where both attempts fail calls the runner exactly twice", async () => {
  const chatId = 2006;
  markStarted(getSession(chatId));

  let calls = 0;
  const attempt = executeWithMia(chatId, "hello", 1000, async () => {
    calls++;
    return fail("No conversation found");
  });

  await expect(attempt).rejects.toThrow();
  expect(calls).toBe(2);
});

test("a non-stale resume failure does not retry and leaves the session id unchanged", async () => {
  const chatId = 2007;
  markStarted(getSession(chatId));
  const staleId = getSession(chatId).id;

  let calls = 0;
  const attempt = executeWithMia(chatId, "hello", 1000, async () => {
    calls++;
    return fail("rate limit exceeded");
  });

  await expect(attempt).rejects.toThrow("exit 1");
  expect(calls).toBe(1);
  expect(getSession(chatId).id).toBe(staleId);
});

test("a first-turn failure resets the session so the next message gets a clean id", async () => {
  const chatId = 2008;
  const before = resetSession(chatId).id;

  const attempt = executeWithMia(chatId, "hello", 1000, async () => fail("boom"));

  await expect(attempt).rejects.toThrow("exit 1");
  expect(getSession(chatId).id).not.toBe(before);
  expect(getSession(chatId).started).toBe(false);
});

test("a first-turn timeout keeps the id and marks it started", async () => {
  // claude ran, so it has already written the session file for this UUID.
  // Leaving started false would spawn --session-id against a consumed id next
  // message and fail with "already in use" forever; resuming instead picks up
  // whatever partial transcript exists.
  const chatId = 2009;
  const before = resetSession(chatId).id;

  const attempt = executeWithMia(chatId, "hello", 300000, async () => ({
    stdout: "",
    stderr: "",
    exitCode: 143,
    timedOut: true,
  }));

  await expect(attempt).rejects.toThrow("Timed out after 300s");
  expect(getSession(chatId).id).toBe(before);
  expect(getSession(chatId).started).toBe(true);
});

test("a first turn that exits 0 with empty stdout keeps the id and marks it started", async () => {
  // Same consumed-UUID hazard as the timeout: exit 0 means claude wrote the
  // session file even though it returned nothing usable.
  const chatId = 2010;
  const before = resetSession(chatId).id;

  const attempt = executeWithMia(chatId, "hello", 1000, async () => ok("   "));

  await expect(attempt).rejects.toThrow("No response from Claude");
  expect(getSession(chatId).id).toBe(before);
  expect(getSession(chatId).started).toBe(true);
});

test("a /start landing mid-spawn leaves the fresh session untouched", async () => {
  const chatId = 2011;
  const usedId = resetSession(chatId).id;

  let freshId = "";
  const reply = await executeWithMia(chatId, "hello", 1000, async () => {
    // Simulates /start arriving while claude is still running: the chat's
    // session is swapped out from under this run.
    freshId = resetSession(chatId).id;
    return ok("done");
  });

  expect(reply).toBe("done");
  expect(freshId).not.toBe(usedId);
  // The run must mark the session it actually used, not whatever the map holds
  // now — otherwise the next message resumes a UUID claude never wrote.
  expect(getSession(chatId).id).toBe(freshId);
  expect(getSession(chatId).started).toBe(false);
});

test("a /start landing mid-spawn is not clobbered by a first-turn failure reset", async () => {
  const chatId = 2012;
  resetSession(chatId);

  let freshId = "";
  const attempt = executeWithMia(chatId, "hello", 1000, async () => {
    freshId = resetSession(chatId).id;
    return fail("boom");
  });

  await expect(attempt).rejects.toThrow("exit 1");
  // The failed run's reset must no-op: the concurrent /start already handed the
  // chat a clean, unused session and minting another would discard it.
  expect(getSession(chatId).id).toBe(freshId);
  expect(getSession(chatId).started).toBe(false);
});
