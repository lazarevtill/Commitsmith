# Changelog

All notable changes to **Commitsmith** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-06-11

### Changed

- First release published through the automated GitHub Actions pipeline, which
  publishes to Open VSX and the VS Code Marketplace on every version bump to
  `main`. No functional changes to the extension itself.

## [0.1.0] — 2026-06-10

### Added

- One-click commit message generation from the Source Control title bar (✨).
- Support for any **OpenAI-compatible** API and **Ollama** (local, no API key).
- **Commitsmith: Select API Provider** — a dropdown to switch providers, available from
  the Command Palette and the Source Control `⋯` menu. Selecting Ollama waives the API
  key requirement.
- Token-budgeted diff context (tiktoken) with per-file proportional allocation and
  whole-hunk truncation; automatic two-pass *summarize-then-synthesize* for large diffs.
- Grounded, prompt-injection-resistant Conventional Commits system prompt.
- Reasoning/"thinking" model handling: `think: false` for Ollama, an empty-content retry
  with token headroom (for models like gpt-oss that ignore the toggle), and stripping of
  inline `<think>`/`<thinking>` blocks and gpt-oss "harmony" channels.
- Secure API key storage via VS Code SecretStorage.
- Configurable noise filtering (`commitsmith.ignoreGlobs`).
- Unit test suite (vitest) and an env-driven live integration check.

[0.1.1]: https://github.com/lazarevtill/Commitsmith/releases/tag/v0.1.1
[0.1.0]: https://github.com/lazarevtill/Commitsmith/releases/tag/v0.1.0
