# pai-telegram

A personal Telegram bot that puts a capable AI assistant — **Mia** — in your pocket. Send text or voice messages; get intelligent, tool-enabled responses back as text or spoken audio.

Built with [Bun](https://bun.com), [grammY](https://grammy.dev), [Claude Code](https://claude.ai/code), [ElevenLabs](https://elevenlabs.io), and [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

---

## Features

| Capability | How it works |
|---|---|
| **Text chat** | Each chat runs a persistent Claude Code session — context lives in Claude Code's transcript, not in the prompt |
| **Voice messages** | Transcribed locally via Whisper, processed by Claude, replied with spoken TTS audio |
| **Tool-enabled AI** | Claude runs with its full tool set and no permission prompts — it can run shell commands, read and write files, and make HTTP requests on this machine |
| **Slash commands** | `/start`, `/end`, `/help`, `/research <topic>` |
| **Persistent sessions** | `--session-id` on the first message, `--resume` after, so history survives across messages and stays cached |
| **Owner-only access** | Hard auth guard — all updates from other users are silently dropped |
| **Fast startup** | Fails immediately with a clear error if any required env var is missing |

---

## Architecture

```
Telegram ──► bot.ts (grammY)
                │
                ├─► commands.ts     slash command handlers
                ├─► executor.ts     spawns `claude --print` with the full tool set
                ├─► transcribe.ts   downloads voice OGG → runs Whisper
                ├─► tts.ts          ElevenLabs text-to-speech → MP3
                ├─► session.ts      per-chat Claude Code session UUIDs
                ├─► lock.ts         serializes turns within a chat
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
git clone https://github.com/rarmknecht/pai-telegram.git
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
# BOT_TOKEN — from BotFather
BOT_TOKEN=123456789:ABCdef...
# OWNER_ID — your Telegram numeric user ID
OWNER_ID=987654321
# ELEVENLABS_API_KEY — from elevenlabs.io → Profile → API Keys
ELEVENLABS_API_KEY=sk_...
WHISPER_VENV=/absolute/path/to/pai-telegram/whisper-env

# Optional — override defaults
# MIA_VOICE_ID — ElevenLabs voice ID (default: Mia's voice)
MIA_VOICE_ID=lcMyyd2HUfFzxdCaC4Ta
# WHISPER_PYTHON — Python binary inside the venv (default: python3)
WHISPER_PYTHON=python3
# SESSION_CWD — working dir for sessions (default: $HOME)
SESSION_CWD=/absolute/path/to/projects
```

> Keep every comment on its own line. Bun strips a trailing `# ...` after a
> value, but systemd's `EnvironmentFile=` does not — under the systemd unit the
> comment becomes part of the value and startup fails.

### 6 — Personalize Mia's prompt

`src/prompts.ts` holds `MIA_SYSTEM_PROMPT` — the constant system prompt every
session starts from. It is written for this repo's original owner and refers to
him by name, so edit it before first run:

```ts
export const MIA_SYSTEM_PROMPT = `You are Mia, a highly capable personal AI
assistant running on Randy's Linux machine.
...
```

Change the assistant's name, the owner's name, and anything else you want her to
know about your setup. Two things to keep in mind while editing:

- **Keep it a plain constant.** No interpolation, no per-message variation. This
  string is the cached prefix of every turn, so anything that changes between
  messages silently costs you prompt caching. `src/executor.test.ts` has a test
  that pins this.
- **Write it in plain prose.** Replies are sent to Telegram without `parse_mode`,
  so markdown is not rendered — a prompt that encourages bullets and code fences
  produces literal asterisks and backticks on screen. The shipped prompt says so
  explicitly; keep that part.

The prompt is fixed when a session is created, so changes reach an existing chat
only after `/start`.

### 7 — Run the bot

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
| `/start` | Start a fresh session — the next message begins new context |
| `/end` | End the current session and start fresh; the transcript stays in Claude Code's history |
| `/research <topic>` | Research mode — Mia loads WebSearch through ToolSearch to investigate a topic |
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
│   ├── bot.ts             Entry point — wires grammY, auth guard, message handlers
│   ├── commands.ts        /start, /end, /help, /research handlers
│   ├── config.ts          Env var validation and centralized config object
│   ├── executor.ts        Spawns the claude CLI with its full tool set
│   ├── lock.ts            Per-chat serialization so turns cannot race
│   ├── prompts.ts         System prompt and the per-medium user-turn prompt builders
│   ├── session.ts         Per-chat Claude Code session UUIDs
│   ├── transcribe.ts      Manages temp files and calls the Python Whisper script
│   ├── tts.ts             ElevenLabs TTS — returns path to MP3, caller cleans up
│   ├── utils.ts           Shared utilities (safeUnlink, etc.)
│   ├── executor.test.ts   Session lifecycle and the prompt-caching invariant
│   ├── lock.test.ts       Per-chat serialization
│   ├── prompts.test.ts    System prompt and prompt builder texts
│   ├── session.test.ts    Session map semantics
│   ├── utils.test.ts      SESSION_CWD resolution and validation
│   └── wiring.test.ts     Source-level guard that handlers keep the chat lock
├── scripts/
│   └── transcribe.py      Runs faster-whisper, prints transcript to stdout
├── whisper-env/           Python venv (git-ignored) — created in Setup step 3
├── .env.example           Template for environment variables
├── .env                   Your local config (git-ignored)
├── index.ts               Unused `bun init` stub (`console.log("Hello via Bun!")`) —
│                          the real entry point is `src/bot.ts`
├── package.json
└── tsconfig.json
```

Run the test suite with:

```bash
bun test
```

No test dependencies are needed — `bun test` is built in. `wiring.test.ts` is
deliberately a source-text assertion: it guards that the executor call sites in
`bot.ts` and `commands.ts` stay wrapped in `withChatLock`, which nothing else
can catch without booting the bot against real Telegram traffic.

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

<sub><a name="tool-access"></a>**On tool access.** Sessions run with Claude Code's
full tool set and no permission prompts — that is the point of the project, not an
oversight. A remote bridge to Claude Code that could not run commands would not be
worth building. Authorization is the `OWNER_ID` check in `bot.ts`, which drops every
update from any other Telegram user ID; single-owner gating on Telegram user ID is a
standard, well-established control. Treat your bot token like any other credential
that grants shell access.</sub>

---

## License

MIT
