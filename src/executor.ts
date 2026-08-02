/**
 * Tool-enabled execution against a persistent Claude Code session.
 *
 * Each chat maps to a session UUID: the first turn creates it with
 * --session-id, every later turn resumes it. The system prompt is a constant
 * so the cached prefix stays byte-identical across turns — history lives in
 * Claude Code's transcript, never in the prompt.
 */

import { getSession, markStarted, resetSession, type Session } from "./session.ts";
import { config } from "./config.ts";

const MIA_EXECUTOR_SYSTEM_PROMPT = `You are Mia, a highly capable Personal AI assistant running on the user's Linux machine. You have access to the Bash tool and can run shell commands, Python scripts, curl requests, and anything else needed to complete tasks. When asked to do something that requires computation or web access, do it — don't just describe how. Complete tasks fully. Report results clearly and concisely. Available tools: curl, python3, bun, standard Linux utilities.`;

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes for complex tasks

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
    "--system-prompt", MIA_EXECUTOR_SYSTEM_PROMPT,
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

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  const [stdout, stderr] = await Promise.all([
    Bun.readableStreamToText(proc.stdout as ReadableStream),
    Bun.readableStreamToText(proc.stderr as ReadableStream),
  ]);

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

  // A resume against a session Claude Code no longer knows about would break
  // this chat permanently. Start a fresh session and try once more.
  if (result.exitCode !== 0 && !result.timedOut && session.started) {
    session = resetSession(chatId);
    result = await run(buildClaudeArgs(session), userText, timeoutMs);
  }

  if (result.timedOut) {
    throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s.`);
  }
  if (result.exitCode !== 0) {
    throw new Error(`Execution failed (exit ${result.exitCode}): ${result.stderr.slice(0, 400)}`);
  }
  if (!result.stdout.trim()) {
    throw new Error("No response from Claude — it may be rate-limited or temporarily unavailable.");
  }

  markStarted(chatId);
  return result.stdout.trim();
}
