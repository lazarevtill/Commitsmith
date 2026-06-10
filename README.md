# Commitsmith

**Forge [Conventional Commits](https://www.conventionalcommits.org/) messages from
your git diff with one click** — using **any OpenAI-compatible API** or a **fully
local Ollama model**. No telemetry, no server, no code indexing.

Works in **VS Code** and **Cursor**.

---

## Features

- ✨ **One click** in the Source Control title bar generates a message from your diff.
- 🔒 **Local-first.** Point it at Ollama and nothing leaves your machine. No API key required.
- 🧠 **Grounded & truthful.** The prompt is hardened against hallucination and treats the
  diff as *data, not instructions* (prompt-injection resistant).
- 🪙 **Token-budgeted.** Diffs are measured in tokens (tiktoken), with more budget given
  to larger files and whole hunks kept intact. Oversized diffs auto-fall back to a
  two-pass *summarize-then-synthesize* strategy.
- 🤔 **Reasoning-model aware.** Handles "thinking" models (qwen3, gemma-thinking,
  deepseek-r1, gpt-oss, …): disables chain-of-thought where possible, retries when a
  model spends its whole budget reasoning, and strips any stray `<think>`/harmony output.
- 🧹 **Noise filtering.** Lockfiles, generated files, maps and binaries are dropped from
  the prompt (still listed in the change summary).

## How it works

Click the ✨ button in the **Source Control** title bar. Commitsmith:

1. Reads your diff (staged first, falling back to unstaged).
2. Builds grounded context — a change-summary table (files, status, +/- counts) placed
   *before and after* the code, so grounding survives any backend truncation.
3. Budgets the diff in tokens, allocating more to larger files and keeping whole hunks.
4. Sends one request to your configured model and writes the result into the commit
   message box for you to review and commit.

It is a **pure, stateless client** — no server, no vector DB, no code indexing. (That
decision is backed by research; see `docs/superpowers/specs/`.)

## Install

From a packaged `.vsix`:

```bash
code --install-extension commitsmith-0.1.0.vsix      # VS Code
cursor --install-extension commitsmith-0.1.0.vsix    # Cursor
```

Then reload the window.

## Setup

Run **Commitsmith: Select API Provider** from the Command Palette (or the Source Control
`⋯` menu) to choose between Ollama and an OpenAI-compatible endpoint — or set it in
Settings directly.

### Ollama (local, private — no API key)

```jsonc
// settings.json
"commitsmith.api": "ollama",
"commitsmith.baseUrl": "http://localhost:11434",
"commitsmith.model": "qwen2.5-coder:3b"   // or any model you've pulled
```

Commitsmith calls Ollama's `/api/chat` with `num_ctx` (default 8192) so large diffs are
**not** silently truncated — a common failure of the OpenAI-compat `/v1` path on Ollama.

### OpenAI-compatible (OpenAI, OpenRouter, LM Studio, Open WebUI, …)

```jsonc
"commitsmith.api": "openai",
"commitsmith.baseUrl": "https://api.openai.com/v1",
"commitsmith.model": "gpt-4o-mini"
```

Run **Commitsmith: Set API Key** to store your key securely in VS Code SecretStorage.
For Open WebUI the base URL is `https://your-host/api`. Local OpenAI-compatible servers
(LM Studio, etc.) need no key.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `commitsmith.api` | `openai` | `openai` (`/chat/completions`) or `ollama` (`/api/chat` + `num_ctx`) |
| `commitsmith.baseUrl` | `https://api.openai.com/v1` | Endpoint base URL |
| `commitsmith.model` | `gpt-4o-mini` | Model name |
| `commitsmith.temperature` | `0.15` | Sampling temperature |
| `commitsmith.maxDiffTokens` | `3500` | Token budget for the diff context |
| `commitsmith.largeDiffThreshold` | `7000` | Tokens above which two-pass runs |
| `commitsmith.maxTokens` | `200` | Output token cap |
| `commitsmith.ollamaNumCtx` | `8192` | Context window for Ollama |
| `commitsmith.requestTimeoutMs` | `90000` | Request timeout (absorbs Ollama cold start) |
| `commitsmith.systemPrompt` | *(built-in)* | Override the Conventional Commits prompt |
| `commitsmith.ignoreGlobs` | lockfiles, `dist/**`, … | Files dropped from the diff body |

## Commands

- **Commitsmith: Generate Commit Message** — also the ✨ Source Control button.
- **Commitsmith: Select API Provider** — pick Ollama or OpenAI-compatible (dropdown).
- **Commitsmith: Set API Key** / **Clear API Key**.

## Development

```bash
npm install
npm run lint         # ESLint (type-checked, strict)
npm run typecheck    # tsc --noEmit
npm test             # unit tests (vitest)
npm run build        # bundle with esbuild → dist/extension.js
npm run package      # produce a .vsix
```

Press `F5` in VS Code to launch the Extension Development Host.

### Live integration check (optional)

`npm run integration` drives the real pipeline against live endpoints. Everything is
env-driven, and each test is **skipped** (not failed) when its endpoint is unset or
unreachable:

```bash
# Ollama
OLLAMA_HOST=http://localhost:11434 OLLAMA_MODEL=llama3.2 npm run integration

# OpenAI-compatible (test runs only when OPENAI_KEY is set)
OPENAI_BASE=https://api.openai.com/v1 OPENAI_MODEL=gpt-4o-mini OPENAI_KEY=sk-... npm run integration

# Reasoning models (opt-in)
REASONING=1 REASONING_MODELS=qwen3:latest,gpt-oss:20b npm run integration
```

On Windows PowerShell, set the variables with `$env:NAME = "value"` before the command.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE) © 2026 Anatoly Lazarev. See [NOTICE](NOTICE).
