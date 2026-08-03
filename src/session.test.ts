/**
 * Tests for the per-chat Claude Code session map.
 */

import { test, expect } from "bun:test";
import { getSession, markStarted, resetSession, resetSessionIfCurrent } from "./session.ts";

test("mints a session on first access and returns the same one after", () => {
  const first = getSession(1001);
  const second = getSession(1001);
  expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(second.id).toBe(first.id);
  expect(first.started).toBe(false);
});

test("keeps chats isolated from each other", () => {
  expect(getSession(1002).id).not.toBe(getSession(1003).id);
});

test("markStarted flips the flag", () => {
  const session = getSession(1004);
  expect(session.started).toBe(false);
  markStarted(session);
  expect(getSession(1004).started).toBe(true);
});

test("resetSession mints a new id and clears started", () => {
  const before = getSession(1005);
  markStarted(before);
  const after = resetSession(1005);
  expect(after.id).not.toBe(before.id);
  expect(after.started).toBe(false);
  expect(getSession(1005).id).toBe(after.id);
});

test("marking a detached session does not touch the chat's current session", () => {
  // Pins the reason markStarted takes a Session instead of a chatId: a /start
  // landing mid-turn detaches the session the run used, and marking that stale
  // object must leave the fresh, never-spawned session unstarted.
  const detached = getSession(1006);
  const fresh = resetSession(1006);

  markStarted(detached);

  expect(detached.started).toBe(true);
  expect(getSession(1006)).toBe(fresh);
  expect(getSession(1006).started).toBe(false);
});

test("resetSessionIfCurrent resets only while the chat is still on that session", () => {
  const original = getSession(1007);
  const replaced = resetSessionIfCurrent(1007, original);
  expect(replaced.id).not.toBe(original.id);
  expect(getSession(1007)).toBe(replaced);

  // The chat has already moved on, so the stale expectation must no-op and
  // hand back the live session rather than clobbering it.
  const kept = resetSessionIfCurrent(1007, original);
  expect(kept).toBe(replaced);
  expect(getSession(1007)).toBe(replaced);
});
