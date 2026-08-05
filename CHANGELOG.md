# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-08-05

### Added
- **llama.cpp** as a third API provider option alongside openai and ollama
- Optional API key authentication for llama.cpp (via `llama-server --api-key`)
- Unit tests for llama.cpp endpoint configuration and auth behavior
- Integration test for llama.cpp single-pass flow
- README section with llama.cpp setup instructions

### Fixed
- Removed fragile `cleanMessage` fence-line filter that could strip legitimate content from commit messages
- Added proper error type handling for `execFileSync` failures in `git.ts`
- Fixed dummy apiKey leaking as `Authorization: Bearer` header for local llama.cpp calls
- Fixed `buildRequest` to correctly omit Authorization for local backends

### Changed
- Updated settings descriptions (`baseUrl`, `model`, `ollamaNumCtx`) to mention llama.cpp defaults
- Bumped version to 0.1.2
- Improved README Commands section to include llama.cpp in provider dropdown reference

## [0.1.1] - 2026-07-28

### Added
- Initial release
- Support for OpenAI-compatible and Ollama API providers
- Conventional Commits message generation from git diff
- Token-budgeted diff context with proportional allocation
- Two-pass fallback for large diffs (summarize-then-synthesize)
- Reasoning-model aware handling (qwen3, gemma-thinking, deepseek-r1, gpt-oss)
- Noise filtering for lockfiles, generated files, and binaries
