/**
 * Tool-enabled execution against a persistent Claude Code session.
 *
 * Each chat maps to a session UUID: the first turn creates it with
 * --session-id, every later turn resumes it. The system prompt is a constant
 * so the cached prefix stays byte-identical across turns — history lives in
 * Claude Code's transcript, never in the prompt.
 */

import { getSession, markStarted, resetSessionIfCurrent, type Session } from "./session.ts";
import { config } from "./config.ts";
import { MIA_SYSTEM_PROMPT } from "./prompts.ts";

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes for complex tasks

// Matches the stderr claude prints when --resume targets a session id it has
// no record of. Only this specific failure justifies minting a fresh session
// and retrying — anything else (rate limit, network) must surface as an
// error with the existing session left intact.
const STALE_SESSION_PATTERN = /No conversation found/i;

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export type Runner = (args: string[], input: string, timeoutMs: number) => Promise<RunResult>;

export function buildClaudeArgs(session: Session): string[] {
  return [
    "claude",
    "--print",
    "--model", "sonnet",
    "--output-format", "text",
    session.started ? "--resume" : "--session-id", session.id,
    "--system-prompt", MIA_SYSTEM_PROMPT,
  ];
}

const spawnClaude: Runner = async (args, input, timeoutMs) => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDECODE;

  const proc = Bun.spawn(args, {
    env,
    cwd: config.sessionCwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin!.write(new TextEncoder().encode(input));
  proc.stdin!.end();

  // Start draining stdout/stderr before awaiting exit. A reply larger than
  // the OS pipe buffer (~64 KB) would otherwise block the child on write
  // while we wait on `exited`, deadlocking until the timeout kills it — this
  // bot's research mode can easily produce output that big.
  const stdoutPromise = Bun.readableStreamToText(proc.stdout as ReadableStream);
  const stderrPromise = Bun.readableStreamToText(proc.stderr as ReadableStream);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  return { stdout: stdout.trim(), stderr, exitCode, timedOut };
};

export async function executeWithMia(
  chatId: number,
  userText: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  run: Runner = spawnClaude
): Promise<string> {
  let session = getSession(chatId);
  let result = await run(buildClaudeArgs(session), userText, timeoutMs);

  if (result.exitCode !== 0 && !result.timedOut) {
    const wasResume = session.started;
    // Claude Code may have written the session file even on a failed first
    // turn; reusing that id later fails with "already in use" forever. Only
    // a resume that fails because the session is genuinely gone is worth
    // retrying — any other resume failure (rate limit, network) must leave
    // the session intact so the next message can resume normally.
    const staleResume = wasResume && STALE_SESSION_PATTERN.test(result.stderr);

    if (staleResume) {
      const firstStderr = result.stderr;
      // Guarded against a `/start` that landed mid-spawn: that already gave the
      // chat a clean unstarted session, so retry against it instead of
      // discarding it for yet another fresh UUID.
      session = resetSessionIfCurrent(chatId, session);
      result = await run(buildClaudeArgs(session), userText, timeoutMs);
      if (result.exitCode !== 0 && !result.timedOut) {
        throw new Error(
          `Execution failed after session reset (exit ${result.exitCode}): ` +
          `${result.stderr.slice(0, 200)} (first attempt: ${firstStderr.slice(0, 200)})`
        );
      }
    } else {
      if (!wasResume) resetSessionIfCurrent(chatId, session);
      throw new Error(`Execution failed (exit ${result.exitCode}): ${result.stderr.slice(0, 400)}`);
    }
  }

  // Past this point the process ran and either produced nothing usable or was
  // killed. On a first turn claude has already written the session file, so the
  // UUID is consumed: mark it started before throwing, or the next message
  // spawns --session-id against a used id and fails with "already in use"
  // forever. A later --resume instead picks up whatever partial transcript
  // exists, at no extra round trip. On a resume this is already true and the
  // call is a no-op.

  // A process that exits right at the timeout boundary can race the kill
  // signal and still report exit 0; only treat it as a timeout if it also
  // failed to exit cleanly.
  if (result.timedOut && result.exitCode !== 0) {
    markStarted(session);
    throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s.`);
  }
  if (result.exitCode !== 0) {
    markStarted(session);
    throw new Error(`Execution failed (exit ${result.exitCode}): ${result.stderr.slice(0, 400)}`);
  }
  if (!result.stdout.trim()) {
    markStarted(session);
    throw new Error("No response from Claude — it may be rate-limited or temporarily unavailable.");
  }

  markStarted(session);
  return result.stdout.trim();
}
