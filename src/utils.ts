import { unlink } from "node:fs/promises";

export async function safeUnlink(path: string): Promise<void> {
  await unlink(path).catch(() => {});
}
