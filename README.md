# llm-cli-proxy

**Use your Claude Max, Gemini Advanced, or ChatGPT Plus subscription from any OpenAI-compatible client.**

Wraps the official Claude, Gemini, and Codex CLIs and exposes a local **OpenAI-compatible HTTP API**. Point any tool that supports `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` at it and your subscription handles the billing — no API keys needed.

```bash
npx llm-cli-proxy --provider claude --port 3456
```

## How It Works

- **Claude & Gemini** — spawns the official CLI binary per request using `--resume` for conversation continuity. The CLI handles all auth, headers, and fingerprinting.
- **Codex** — calls `chatgpt.com/backend-api/codex/responses` directly using the OAuth token stored by the Codex CLI in `~/.codex/auth.json`. No subprocess. System prompt stays in the `instructions` field (never duplicated into conversation history).

All three expose `/v1/chat/completions`, `/v1/models`, and `/health` in OpenAI format.

## Prerequisites

Node.js 20+ and at least one CLI installed and authenticated:

| Provider | Install | Authenticate |
|----------|---------|-------------|
| Claude | `npm install -g @anthropic-ai/claude-code` | `claude` — OAuth login |
| Gemini | `npm install -g @google/gemini-cli` | `gemini` — OAuth login |
| Codex | `npm install -g @openai/codex` | `codex` — ChatGPT login |

## Usage

```bash
# Install globally
npm install -g llm-cli-proxy

# Run one instance per provider
llm-cli-proxy --provider claude --port 3456
llm-cli-proxy --provider gemini --port 3457
llm-cli-proxy --provider codex  --port 3458
```

Or run without installing:

```bash
npx llm-cli-proxy --provider claude
```

### Options

```
llm-cli-proxy --provider <claude|gemini|codex> [options]

  --provider, -p  <name>   Provider to proxy: claude, gemini, or codex (required)
  --port          <port>   HTTP port (default: 3456/claude, 3457/gemini, 3458/codex)
  --workspace, -w <dir>    Working directory passed to the CLI (default: cwd)
  --model, -m     <model>  Model override (default: provider default)
  --version, -V            Show version
  --help, -h               Show help
```

## Integration

Set the base URL environment variable to point any LLM client at the proxy:

```bash
# Anthropic SDK / LiteLLM / any ANTHROPIC_BASE_URL-aware tool
export ANTHROPIC_BASE_URL=http://localhost:3456/v1
export ANTHROPIC_API_KEY=sk-placeholder  # required by some SDKs but not used

# Google Gemini SDK
export GOOGLE_GEMINI_BASE_URL=http://localhost:3457/v1

# OpenAI SDK / any OPENAI_BASE_URL-aware tool
export OPENAI_BASE_URL=http://localhost:3458/v1
export OPENAI_API_KEY=sk-placeholder
```

## API

### POST /v1/chat/completions

```bash
# Non-streaming
curl http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}]}'

# Streaming
curl http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

### GET /v1/models

Returns available models for the running provider.

### GET /health

```json
{
  "status": "ok",
  "provider": "Claude Code",
  "session_active": true,
  "model": "claude-sonnet-4-6",
  "workspace": "/your/project"
}
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ llm-cli-proxy                                        │
│                                                      │
│  POST /v1/chat/completions                           │
│         │                                            │
│  ┌──────▼──────────────────────────────────────┐    │
│  │ ISession (common interface)                  │    │
│  └──────┬─────────────────────┬────────────────┘    │
│         │                     │                      │
│  ┌──────▼──────┐    ┌─────────▼─────────────────┐   │
│  │SessionManager│    │  CodexDirectSession        │   │
│  │(claude,gemini│    │  (codex)                   │   │
│  │CLI subprocess│    │  fetch() → chatgpt.com     │   │
│  │+ --resume)   │    │  ~/.codex/auth.json OAuth  │   │
│  └─────────────┘    └───────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Models

| Provider | Default | Available |
|----------|---------|-----------|
| Claude | `claude-sonnet-4-6` | `claude-sonnet-4-6`, `claude-opus-4-6` |
| Gemini | `gemini-3.1-flash` | `gemini-3.1-flash`, `gemini-3.1-pro`, `gemini-2.5-flash`, `gemini-2.5-pro` |
| Codex | `gpt-5.4` | `gpt-5.4`, `gpt-5.4-pro` |

## Notes

**Codex token doubling bug** — `codex exec resume --last` re-injects the ~18K system prompt on every resume turn (18K→36K→54K tokens for 5-word messages). This proxy bypasses `exec resume` entirely by calling the API directly, keeping the system prompt in the `instructions` field where it belongs. See [openai/codex#16213](https://github.com/openai/codex/issues/16213).

## ⚠️ Risk Warning

This tool uses official CLI binaries and OAuth tokens as stored by those CLIs, but programmatic use may violate provider Terms of Service. Use at your own risk. Not affiliated with or endorsed by Anthropic, Google, or OpenAI. Always prefer official API keys for production use.

## License

MIT
