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
  // The onRejected half of .then(fn, fn) is unreachable today: the link stored
  // below is .catch-wrapped, so `prior` always resolves. It stays as a guard so
  // the invariant survives a future change to what gets stored — a failed turn
  // must never wedge the chat, and this keeps fn running either way.
  const next = prior.then(fn, fn);
  // Store a rejection-swallowing copy so a failed turn never surfaces as an
  // unhandled rejection; the caller still receives the real promise.
  chains.set(chatId, next.catch(() => {}));
  return next;
}
