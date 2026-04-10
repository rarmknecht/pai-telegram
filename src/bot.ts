import { Bot, InputFile, type Context } from "grammy";
import { addMessage, getHistory } from "./session.ts";
import { executeWithMia } from "./executor.ts";
import { transcribeVoice } from "./transcribe.ts";
import { cleanupTTS, generateTTS } from "./tts.ts";
import { handleEnd, handleHelp, handleResearch, handleStart } from "./commands.ts";

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = parseInt(process.env.OWNER_ID ?? "0", 10);

if (!BOT_TOKEN) throw new Error("BOT_TOKEN not set in .env");
if (!OWNER_ID) throw new Error("OWNER_ID not set in .env");

const bot = new Bot(BOT_TOKEN);

// ── Auth guard ────────────────────────────────────────────────────────────────
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== OWNER_ID) return;
  await next();
});

// ── Commands ──────────────────────────────────────────────────────────────────
bot.command("start", handleStart);
bot.command("help", handleHelp);
bot.command("end", handleEnd);
bot.command("research", handleResearch);

// ── Shared execution helper ───────────────────────────────────────────────────
async function handleInference(chatId: number, text: string, ctx: Context): Promise<string> {
  const priorHistory = getHistory(chatId);
  const conversationContext = priorHistory
    .map((m) => `${m.role === "user" ? "User" : "Mia"}: ${m.content}`)
    .join("\n");

  addMessage(chatId, "user", text);
  await ctx.api.sendChatAction(chatId, "typing");

  const reply = await executeWithMia(text, conversationContext);
  addMessage(chatId, "assistant", reply);
  await ctx.reply(reply);
  return reply;
}

// ── Text messages ─────────────────────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  try {
    await handleInference(ctx.chat.id, ctx.message.text, ctx);
  } catch (err) {
    await ctx.reply(`Error: ${(err as Error).message}`);
  }
});

// ── Voice messages ────────────────────────────────────────────────────────────
bot.on("message:voice", async (ctx) => {
  const chatId = ctx.chat.id;
  const msgId = ctx.message.message_id;
  let ttsPath: string | null = null;

  try {
    await ctx.api.sendChatAction(chatId, "typing");

    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const resp = await fetch(fileUrl);
    if (!resp.ok) throw new Error(`Failed to download voice file: ${resp.status}`);
    const buffer = new Uint8Array(await resp.arrayBuffer());

    const transcript = await transcribeVoice(buffer, msgId);
    if (!transcript) {
      await ctx.reply("Couldn't transcribe that — please try again.");
      return;
    }

    await ctx.reply(`_Heard: "${transcript}"_`, { parse_mode: "Markdown" });

    const reply = await handleInference(chatId, transcript, ctx);

    await ctx.api.sendChatAction(chatId, "record_voice");
    ttsPath = await generateTTS(reply, msgId);
    await ctx.replyWithVoice(new InputFile(ttsPath));
  } catch (err) {
    await ctx.reply(`Voice error: ${(err as Error).message}`);
  } finally {
    if (ttsPath) await cleanupTTS(ttsPath);
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error("[bot error]", err.message);
});

console.log("Mia Telegram bot starting...");
bot.start({
  onStart: (info) => {
    console.log(`Bot running as @${info.username} | Owner ID: ${OWNER_ID}`);
  },
});
