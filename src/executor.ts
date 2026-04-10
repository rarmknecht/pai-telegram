/**
 * Tool-enabled execution for Mia.
 * Unlike inference.ts (text-only), this spawns claude with Bash tool enabled
 * so Mia can run scripts, make HTTP requests, and do real work.
 */

const MIA_EXECUTOR_SYSTEM_PROMPT = `You are Mia, a highly capable Personal AI assistant running on the user's Linux machine. You have access to the Bash tool and can run shell commands, Python scripts, curl requests, and anything else needed to complete tasks. When asked to do something that requires computation or web access, do it — don't just describe how. Complete tasks fully. Report results clearly and concisely. Available tools: curl, python3, bun, standard Linux utilities.`;

export async function executeWithMia(
  userText: string,
  conversationContext: string,
  timeoutMs = 300000 // 5 minutes for complex tasks
): Promise<string> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDECODE;

  const systemPrompt = conversationContext
    ? `${MIA_EXECUTOR_SYSTEM_PROMPT}\n\nConversation so far:\n${conversationContext}`
    : MIA_EXECUTOR_SYSTEM_PROMPT;

  const proc = Bun.spawn(
    [
      "claude",
      "--print",
      "--model", "sonnet",
      "--output-format", "text",
      "--system-prompt", systemPrompt,
    ],
    {
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  proc.stdin!.write(new TextEncoder().encode(userText));
  proc.stdin!.end();

  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  if (exitCode !== 0) {
    const err = await Bun.readableStreamToText(proc.stderr as ReadableStream);
    throw new Error(`Execution failed (exit ${exitCode}): ${err.slice(0, 400)}`);
  }

  return (await Bun.readableStreamToText(proc.stdout as ReadableStream)).trim();
}
