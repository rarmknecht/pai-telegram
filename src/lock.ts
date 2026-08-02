/**
 * Per-chat serialization.
 *
 * grammY handles updates concurrently, so two messages in one chat could
 * otherwise race the same Claude Code session — two first turns, or two
 * resumes against one transcript. Turns queue per chat; chats stay parallel.
 */

const chains = new Map<number, Promise<unknown>>();

export function withChatLock<T>(chatId: number, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(chatId) ?? Promise.resolve();
  // Run fn whether the previous turn resolved or rejected — one failure must
  // not wedge the chat forever.
  const next = prior.then(fn, fn);
  // The stored link swallows rejections so it never surfaces as an unhandled
  // rejection; the caller still receives the real promise.
  chains.set(chatId, next.catch(() => {}));
  return next;
}
