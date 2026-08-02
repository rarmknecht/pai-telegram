/**
 * Per-chat Claude Code session map.
 * The bot holds only a session UUID — Claude Code owns the transcript, so
 * there is no conversation history here to truncate or replay.
 */

export interface Session {
  /** Session UUID passed to claude via --session-id, then --resume */
  id: string;
  /**
   * True once claude has written this session's file — so on a successful
   * spawn, and also on a spawn that ran but failed (timeout, empty output),
   * since the UUID is consumed either way and only --resume can reach it again.
   */
  started: boolean;
}

const sessions = new Map<number, Session>();

export function getSession(chatId: number): Session {
  let session = sessions.get(chatId);
  if (!session) {
    session = { id: crypto.randomUUID(), started: false };
    sessions.set(chatId, session);
  }
  return session;
}

/**
 * Marks the session Claude Code actually wrote as created, so later turns
 * resume it instead of re-consuming its UUID.
 *
 * Takes the Session object rather than a chatId on purpose. A `/start` landing
 * mid-turn replaces the chat's session; re-reading the map here would mark that
 * brand-new, never-spawned UUID as started and waste the next turn on a resume
 * of a transcript that does not exist. Mutating the object the run actually
 * used leaves the fresh session correctly unstarted.
 */
export function markStarted(session: Session): void {
  session.started = true;
}

export function resetSession(chatId: number): Session {
  const session: Session = { id: crypto.randomUUID(), started: false };
  sessions.set(chatId, session);
  return session;
}

/**
 * Resets only if the chat is still on `expected` — a concurrent `/start` has
 * already given the chat a clean session, and clobbering it would throw away
 * an unused UUID and reset the user's brand-new conversation.
 *
 * Returns the chat's current session either way, so a caller can spawn against
 * whatever session is now live.
 */
export function resetSessionIfCurrent(chatId: number, expected: Session): Session {
  const current = sessions.get(chatId);
  if (current && current !== expected) return current;
  return resetSession(chatId);
}
