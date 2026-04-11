# pai-telegram

A personal Telegram bot that puts a capable AI assistant — **Mia** — in your pocket. Send text or voice messages; get intelligent, tool-enabled responses back as text or spoken audio.

Built with [Bun](https://bun.com), [grammY](https://grammy.dev), [Claude Code](https://claude.ai/code), [ElevenLabs](https://elevenlabs.io), and [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

---

## Features

| Capability | How it works |
|---|---|
| **Text chat** | Messages are sent to Claude Code CLI with conversation history for context |
| **Voice messages** | Transcribed locally via Whisper, processed by Claude, replied with spoken TTS audio |
| **Tool-enabled AI** | Claude runs with Bash tool access — it can execute scripts, make HTTP requests, and do real work |
| **Slash commands** | `/start`, `/end`, `/help`, `/research <topic>` |
| **Session memory** | `/end` appends a session summary to your PAI memory file |
| **Owner-only access** | Hard auth guard — all updates from other users are silently dropped |
| **Fast startup** | Fails immediately with a clear error if any required env var is missing |

---

## Architecture

```
Telegram ──► bot.ts (grammY)
                │
                ├─► commands.ts     slash command handlers
                ├─► executor.ts     spawns `claude --print` with Bash tool
                ├─► transcribe.ts   downloads voice OGG → runs Whisper
                ├─► tts.ts          ElevenLabs text-to-speech → MP3
                ├─► session.ts      in-memory per-chat conversation history
                ├─► memory.ts       appends session summaries to PAI memory
                └─► config.ts       validates all env vars at startup

scripts/
  transcribe.py   Python script — runs faster-whisper, prints transcript to stdout
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **[Bun](https://bun.com) ≥ 1.1** | JavaScript runtime — replaces Node.js |
| **[Claude Code CLI](https://claude.ai/code)** | `claude` must be on your `PATH` and authenticated |
| **Python 3.10+** | For the Whisper transcription virtual environment |
| **Telegram bot token** | Create one via [@BotFather](https://t.me/BotFather) |
| **Your Telegram user ID** | Obtain via [@userinfobot](https://t.me/userinfobot) |
| **[ElevenLabs](https://elevenlabs.io) account** | Free tier works; needed for voice replies |

---

## Setup

### 1 — Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2 — Clone and install dependencies

```bash
git clone https://github.com/YOUR_USERNAME/pai-telegram.git
cd pai-telegram
bun install
```

### 3 — Create the Whisper virtual environment

```bash
python3 -m venv whisper-env
whisper-env/bin/pip install faster-whisper
```

The `tiny` Whisper model (~75 MB) downloads automatically on first use.

### 4 — Create your Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the **bot token** you receive

### 5 — Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set each variable:

```env
# Required
BOT_TOKEN=123456789:ABCdef...          # From BotFather
OWNER_ID=987654321                     # Your Telegram numeric user ID
ELEVENLABS_API_KEY=sk_...              # From elevenlabs.io → Profile → API Keys
INFERENCE_PATH=/absolute/path/to/Inference.ts   # PAI Inference tool (see note below)
WHISPER_VENV=/absolute/path/to/pai-telegram/whisper-env

# Optional — override defaults
MIA_VOICE_ID=lcMyyd2HUfFzxdCaC4Ta     # ElevenLabs voice ID (default: Mia's voice)
WHISPER_PYTHON=python3                 # Python binary inside the venv (default: python3)
PAI_MEMORY_FILE=/path/to/memory.md    # Session memory output file
```

> **INFERENCE_PATH** — This project uses Claude Code's `Inference.ts` tool for AI calls. If you are not running PAI, you can remove or stub this variable and modify `src/executor.ts` to call the Claude API directly.

### 6 — Run the bot

```bash
bun src/bot.ts
```

You should see:

```
Mia Telegram bot starting...
Bot running as @your_bot_name | Owner ID: 987654321
```

---

## Commands

| Command | Description |
|---|---|
| `/start` | Reset conversation — clears in-memory history and starts fresh |
| `/end` | Save the current session to memory, then reset |
| `/research <topic>` | Research mode — Mia uses web access via curl to investigate a topic |
| `/help` | Show available commands |

---

## Voice Messages

1. Record and send a voice message in Telegram
2. The bot downloads the OGG file, transcribes it locally with Whisper
3. It echoes the transcript back as `_Heard: "..."_`
4. Claude processes the transcript and generates a reply
5. ElevenLabs converts the reply to MP3 audio
6. The bot sends the audio back as a voice message

No audio data leaves your machine except to ElevenLabs for synthesis.

---

## Project Structure

```
pai-telegram/
├── src/
│   ├── bot.ts          Entry point — wires grammY, auth guard, message handlers
│   ├── commands.ts     /start, /end, /help, /research handlers
│   ├── config.ts       Env var validation and centralized config object
│   ├── executor.ts     Spawns claude CLI with Bash tool for agentic responses
│   ├── inference.ts    Lightweight text-only inference (no tools)
│   ├── memory.ts       Writes session summaries to PAI memory file
│   ├── session.ts      In-memory per-chat conversation history
│   ├── transcribe.ts   Manages temp files and calls the Python Whisper script
│   ├── tts.ts          ElevenLabs TTS — returns path to MP3, caller cleans up
│   └── utils.ts        Shared utilities (safeUnlink, etc.)
├── scripts/
│   └── transcribe.py   Runs faster-whisper, prints transcript to stdout
├── whisper-env/        Python venv (git-ignored) — created in Setup step 3
├── .env.example        Template for environment variables
├── .env                Your local config (git-ignored)
├── index.ts            Bun entry shim
├── package.json
└── tsconfig.json
```

---

## Security Notes

- **Single-owner design** — The bot rejects all Telegram updates from any user ID other than `OWNER_ID`. There is no multi-user support.
- **No secrets in code** — All credentials are loaded from environment variables; the config module throws at startup if any required variable is missing.
- **Local transcription** — Voice audio is transcribed on your machine with Whisper. Only the synthesized text reply is sent to ElevenLabs.
- **Temp file cleanup** — OGG and MP3 temp files in `/tmp` are deleted after each voice exchange regardless of success or failure.

---

## Troubleshooting

**Bot doesn't respond to my messages**
- Verify `OWNER_ID` matches your actual Telegram numeric user ID (not a username).
- Check the terminal for `[auth] Rejected update from user ...` log lines.

**Voice transcription fails**
- Confirm the venv exists: `ls whisper-env/bin/python3`
- Test the script directly: `whisper-env/bin/python3 scripts/transcribe.py /path/to/audio.ogg`
- Check `WHISPER_VENV` in `.env` is the absolute path to the venv directory.

**TTS replies are silent / ElevenLabs error**
- Confirm `ELEVENLABS_API_KEY` is set and valid.
- Check your ElevenLabs account has available characters.

**`claude` command not found**
- Install Claude Code and ensure it is on your `PATH`: `which claude`
- Run `claude` once manually to complete authentication before starting the bot.

---

## License

MIT
