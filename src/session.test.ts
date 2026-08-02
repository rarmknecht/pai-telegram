/**
 * Tests for the per-chat Claude Code session map.
 */

import { test, expect } from "bun:test";
import { getSession, markStarted, resetSession } from "./session.ts";

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
  markStarted(1004);
  expect(getSession(1004).started).toBe(true);
});

test("resetSession mints a new id and clears started", () => {
  const before = getSession(1005);
  markStarted(1005);
  const after = resetSession(1005);
  expect(after.id).not.toBe(before.id);
  expect(after.started).toBe(false);
  expect(getSession(1005).id).toBe(after.id);
});
