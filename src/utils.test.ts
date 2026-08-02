import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSessionCwd } from "./utils.ts";

const dir = mkdtempSync(join(tmpdir(), "session-cwd-"));

test("falls back to the home directory when SESSION_CWD is unset", () => {
  expect(resolveSessionCwd(undefined, dir)).toBe(dir);
});

test("falls back to the home directory when SESSION_CWD is blank", () => {
  expect(resolveSessionCwd("   ", dir)).toBe(dir);
});

test("uses SESSION_CWD when it names a real directory", () => {
  expect(resolveSessionCwd(dir, "/nonexistent-home")).toBe(dir);
});

test("throws when SESSION_CWD does not exist", () => {
  expect(() => resolveSessionCwd(join(dir, "missing"), dir)).toThrow("does not exist");
});

test("throws when SESSION_CWD is a file rather than a directory", () => {
  const file = join(dir, "not-a-dir.txt");
  writeFileSync(file, "x");
  expect(() => resolveSessionCwd(file, dir)).toThrow("not a directory");
});
