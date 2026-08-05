# Commitsmith

**Forge [Conventional Commits](https://www.conventionalcommits.org/) messages from
your git diff with one click** — using **any OpenAI-compatible API**, a **local
Ollama model**, or **llama.cpp**. No telemetry, no server, no code indexing.

Works in **VS Code** and **Cursor**.

[![Release](https://github.com/lazarevtill/Commitsmith/actions/workflows/release.yml/badge.svg)](https://github.com/lazarevtill/Commitsmith/actions/workflows/release.yml)
[![Open VSX](https://img.shields.io/open-vsx/v/lazarevtill/commitsmith?label=Open%20VSX)](https://open-vsx.org/extension/lazarevtill/commitsmith)
[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/lazarevtill.commitsmith?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=lazarevtill.commitsmith)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

---

## Features

- ✨ **One click** in the Source Control title bar generates a message from your diff.
- 🔒 **Local-first.** Point it at Ollama or llama.cpp and nothing leaves your machine. No API key required for local backends.
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
- 🔐 **Secure key storage.** API keys are stored in VS Code SecretStorage (encrypted
  at rest on your machine). Never sent to third parties.
- 📊 **Smart error handling.** Clear, actionable error messages for rate limits, auth
  failures, network issues, and server errors.

## Usage

1. **Stage your changes** in the Source Control view (or leave them unstaged).
2. Click the **✨** button in the Source Control title bar (or run **Commitsmith: Generate Commit Message** from the Command Palette).
3. Review the generated Conventional Commits message in the commit message box.
4. Edit if needed, then commit as usual.

That's it. No configuration required for basic use — the default is OpenAI with
`gpt-4o-mini`.

## How it works

Click the ✨ button in the **Source Control** title bar. Commitsmith:

1. Reads your diff (staged first, falling back to unstaged).
2. Builds grounded context — a change-summary table (files, status, +/- counts) placed
   *before and after* the code, so grounding survives any backend truncation.
3. Budgets the diff in tokens, allocating more to larger files and keeping whole hunks.
4. Sends one request to your configured model and writes the result into the commit
   message box for you to review and commit.

For **large diffs** (above `commitsmith.largeDiffThreshold` tokens, default 7000),
Commitsmith automatically uses a two-pass strategy:
- **Pass 1**: Summarize each changed file into a single line.
- **Pass 2**: Synthesize those summaries into one commit message.

This ensures the generated message captures the overall change even when the diff
is too large for a single request.

It is a **pure, stateless client** — no server, no vector DB, no code indexing. (That
decision is backed by research; see `docs/superpowers/specs/`.)

## Install

From a packaged `.vsix` (replace `0.1.2` with the latest version):

```bash
code --install-extension commitsmith-0.1.2.vsix      # VS Code
cursor --install-extension commitsmith-0.1.2.vsix    # Cursor
```

Or search for **Commitsmith** in the VS Code/Cursor extensions marketplace.

Then reload the window.

## Setup

Run **Commitsmith: Select API Provider** from the Command Palette (or the Source Control
`⋯` menu) to choose between Ollama, llama.cpp, and an OpenAI-compatible endpoint — or set
it in Settings directly.

### Ollama (local, private — no API key)

```jsonc
// settings.json
"commitsmith.api": "ollama",
"commitsmith.baseUrl": "http://localhost:11434",
"commitsmith.model": "qwen2.5-coder:3b"   // or any model you've pulled
```

Commitsmith calls Ollama's `/api/chat` with `num_ctx` (default 8192) so large diffs are
**not** silently truncated — a common failure of the OpenAI-compat `/v1` path on Ollama.

### llama.cpp (local, private — optional API key)

Run `llama-server` (from [llama.cpp](https://github.com/ggerganov/llama.cpp)) with your
model:

```bash
llama-server -m path/to/model.gguf --port 8080
```

```jsonc
// settings.json
"commitsmith.api": "llama.cpp",
"commitsmith.baseUrl": "http://localhost:8080/v1",
"commitsmith.model": "your-model-name"
```

llama.cpp exposes an **OpenAI-compatible** `/v1/chat/completions` endpoint — no API key
required by default. For authenticated setups, run `llama-server` with `--api-key`
and configure it via **Commitsmith: Set API Key**.

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
| `commitsmith.api` | `openai` | `openai` (`/chat/completions`), `ollama` (`/api/chat` + `num_ctx`), or `llama.cpp` (`/v1/chat/completions`) |
| `commitsmith.baseUrl` | `https://api.openai.com/v1` | Endpoint base URL |
| `commitsmith.model` | `gpt-4o-mini` | Model name |
| `commitsmith.temperature` | `0.15` | Sampling temperature |
| `commitsmith.maxDiffTokens` | `3500` | Token budget for the diff context |
| `commitsmith.largeDiffThreshold` | `7000` | Tokens above which two-pass runs |
| `commitsmith.maxTokens` | `200` | Output token cap |
| `commitsmith.ollamaNumCtx` | `8192` | Context window (num_ctx) for Ollama only — prevents Ollama's 2048-token default from silently truncating the prompt |
| `commitsmith.requestTimeoutMs` | `90000` | Request timeout (absorbs Ollama cold start) |
| `commitsmith.systemPrompt` | *(built-in)* | Override the Conventional Commits prompt |
| `commitsmith.ignoreGlobs` | lockfiles, `dist/**`, … | Files dropped from the diff body |

## Commands

- **Commitsmith: Generate Commit Message** — also the ✨ Source Control button.
- **Commitsmith: Select API Provider** — pick Ollama, llama.cpp, or OpenAI-compatible (dropdown).
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

# llama.cpp (test runs only when LLAMACPP_HOST is set)
LLAMACPP_HOST=http://localhost:8080/v1 LLAMACPP_MODEL=default npm run integration

# OpenAI-compatible (test runs only when OPENAI_KEY is set)
OPENAI_BASE=https://api.openai.com/v1 OPENAI_MODEL=gpt-4o-mini OPENAI_KEY=sk-... npm run integration

# Reasoning models (opt-in)
REASONING=1 REASONING_MODELS=qwen3:latest,gpt-oss:20b npm run integration
```

On Windows PowerShell, set the variables with `$env:NAME = "value"` before the command.

## Troubleshooting

### "No API key set for a remote OpenAI-compatible endpoint"
Run **Commitsmith: Set API Key** from the Command Palette, or configure a local
provider (Ollama or llama.cpp) that doesn't require a key.

### "Model returned an empty response"
The model may have spent its entire token budget reasoning. Try:
- Using a non-reasoning model (e.g., `gpt-4o-mini` instead of `gpt-oss`)
- Increasing `commitsmith.maxTokens` (default 200)
- Reducing `commitsmith.maxDiffTokens` to shrink the prompt

### "Rate limit exceeded (HTTP 429)"
Your API provider is throttling requests. Wait a moment and try again, or reduce
request size by lowering `commitsmith.maxDiffTokens`.

### "Could not resolve hostname" or "Connection refused"
Check that `commitsmith.baseUrl` points to a running server. For Ollama, verify it's
started with `ollama serve`. For llama.cpp, run `llama-server -m model.gguf --port 8080`.

### "Server error (HTTP 5xx)"
The remote endpoint is experiencing issues. Check its logs or try again later.

### Two-pass strategy triggered unexpectedly
The diff exceeded `commitsmith.largeDiffThreshold` tokens (default 7000). To avoid
this, lower `commitsmith.maxDiffTokens` or split large changes into smaller commits.

## Limitations

- **Single-commit scope.** Commitsmith generates a message for one commit at a time.
  For multi-commit workflows, run it once per commit.
- **English-first.** The built-in prompt is optimized for English commit messages.
  For other languages, override `commitsmith.systemPrompt` with a multilingual variant.
- **No code understanding.** Commitsmith analyzes the diff, not the codebase. It
doesn't understand semantics beyond what's visible in the diff.
- **Token counting is approximate.** Uses `cl100k_base` (tiktoken) as a general-purpose
  tokenizer. For non-OpenAI models, this is an approximation — far better than byte
counting but not perfect.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

### Development Workflow

```bash
npm install
npm run watch          # Watch mode — rebuilds on save
# Press F5 in VS Code to launch Extension Development Host
```

The extension is bundled with [esbuild](https://esbuild.github.io/) for fast builds.
Tests run with [vitest](https://vitest.dev/) and lint with [ESLint](https://eslint.org/).

### Running Integration Tests

`npm run integration` drives the real pipeline against live endpoints. Each test is
**skipped** (not failed) when its endpoint is unset or unreachable:

```bash
# Ollama
OLLAMA_HOST=http://localhost:11434 OLLAMA_MODEL=llama3.2 npm run integration

# llama.cpp
LLAMACPP_HOST=http://localhost:8080/v1 LLAMACPP_MODEL=default npm run integration

# OpenAI-compatible
OPENAI_BASE=https://api.openai.com/v1 OPENAI_MODEL=gpt-4o-mini OPENAI_KEY=sk-... npm run integration
```

## License

[Apache License 2.0](LICENSE) © 2026 Anatoly Lazarev. See [NOTICE](NOTICE).
