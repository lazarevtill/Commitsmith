## Summary

This PR adds **llama.cpp** as a new API provider option and addresses issues identified in the project review.

### Changes

#### New Feature: llama.cpp Support
- Added `llama.cpp` as a third API mode alongside `openai` and `ollama`
- llama.cpp uses OpenAI-compatible `/v1/chat/completions` endpoint
- Supports optional API key authentication (llama-server `--api-key`)
- No API key required by default (local runtime)
- Added to provider selection dropdown and configuration schema
- Updated README with setup instructions

#### Bug Fixes
- **`src/diff.ts`**: Removed fragile `cleanMessage` fence-line filter that could strip legitimate content from commit messages
- **`src/git.ts`**: Added proper error type handling for `execFileSync` failures, preserving original `ChildProcessError` messages
- **`src/provider.ts`**: Fixed `buildRequest` to correctly omit `Authorization` header for local backends
- **`src/config.ts`**: Fixed dummy apiKey leaking as Authorization header for local llama.cpp calls

#### Documentation
- Updated settings descriptions (`baseUrl`, `model`, `ollamaNumCtx`) to mention llama.cpp
- Updated README with llama.cpp setup section and commands reference
- Added llama.cpp to package.json description and enumDescriptions

#### Tests
- Added unit tests for llama.cpp endpoint configuration (`endpoint.test.ts`)
- Added unit tests for llama.cpp auth behavior (`provider.test.ts`)
- Added integration test for llama.cpp single-pass (`scripts/_integration.ts`)
- All 66 tests passing

### Testing
- ✅ Unit tests: 66/66 passing
- ✅ Lint: clean
- ✅ Typecheck: clean
- ✅ Build: successful

### Setup (llama.cpp)

```bash
llama-server -m path/to/model.gguf --port 8080
```

```jsonc
{
  "commitsmith.api": "llama.cpp",
  "commitsmith.baseUrl": "http://localhost:8080/v1"
}
```
