/**
 * Per-chat session manager.
 * Holds conversation history for context window management.
 */

export interface Message {
  role: "user" | "assistant";
  content: string;
}

const sessions = new Map<number, Message[]>();

export function getHistory(chatId: number): Message[] {
  let history = sessions.get(chatId);
  if (!history) {
    history = [];
    sessions.set(chatId, history);
  }
  return history;
}

export function addMessage(chatId: number, role: Message["role"], content: string): void {
  const history = getHistory(chatId);
  history.push({ role, content });
  // Keep last 40 messages (20 turns) to stay within context limits
  if (history.length > 40) {
    history.splice(0, history.length - 40);
  }
}

export function clearHistory(chatId: number): void {
  sessions.set(chatId, []);
}

export function getAllSessions(): Map<number, Message[]> {
  return sessions;
}
