/**
 * Per-chat Claude Code session map.
 * The bot holds only a session UUID — Claude Code owns the transcript, so
 * there is no conversation history here to truncate or replay.
 */

export interface Session {
  /** Session UUID passed to claude via --session-id, then --resume */
  id: string;
  /** True once a spawn for this session has exited successfully */
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
 * Marks the session as created. Called only after a successful spawn so a
 * failed first message does not strand the chat resuming a session that
 * Claude Code never wrote.
 */
export function markStarted(chatId: number): void {
  getSession(chatId).started = true;
}

export function resetSession(chatId: number): Session {
  const session: Session = { id: crypto.randomUUID(), started: false };
  sessions.set(chatId, session);
  return session;
}
