/**
 * Tests for per-chat serialization in lock.ts.
 */

import { test, expect } from "bun:test";
import { withChatLock } from "./lock.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("serializes work within one chat", async () => {
  const events: string[] = [];

  const first = withChatLock(1, async () => {
    events.push("first:start");
    await sleep(30);
    events.push("first:end");
  });
  const second = withChatLock(1, async () => {
    events.push("second:start");
    await sleep(1);
    events.push("second:end");
  });

  await Promise.all([first, second]);
  expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
});

test("a rejection does not wedge the chain", async () => {
  const failing = withChatLock(2, async () => {
    throw new Error("boom");
  });
  await expect(failing).rejects.toThrow("boom");

  const after = await withChatLock(2, async () => "still working");
  expect(after).toBe("still working");
});

test("different chats run concurrently", async () => {
  const events: string[] = [];

  const slow = withChatLock(3, async () => {
    await sleep(30);
    events.push("slow");
  });
  const quick = withChatLock(4, async () => {
    events.push("quick");
  });

  await Promise.all([slow, quick]);
  expect(events).toEqual(["quick", "slow"]);
});

test("returns the callback's value", async () => {
  expect(await withChatLock(5, async () => 42)).toBe(42);
});
