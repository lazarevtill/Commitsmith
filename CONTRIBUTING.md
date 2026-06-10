# Contributing to Commitsmith

Thanks for your interest in improving Commitsmith! This document covers how to get set
up, the quality bar, and how to propose changes.

## Getting started

```bash
git clone https://github.com/lazarevtill/Commitsmith.git
cd Commitsmith
npm install
```

Press `F5` in VS Code to launch the Extension Development Host with the extension loaded.

## Project layout

| Path | What it is |
|---|---|
| `src/extension.ts` | Activation, command registration, the VS Code glue |
| `src/git.ts` | Reads and parses `git diff` (pure, runner-injectable) |
| `src/git-api.ts` | Thin wrapper over the built-in `vscode.git` API |
| `src/diff.ts` | Token-budgeted, noise-filtered diff context (pure) |
| `src/prompt.ts` | System prompt and message builders |
| `src/provider.ts` | HTTP calls to OpenAI-compatible / Ollama endpoints |
| `src/pipeline.ts` | Orchestrates single-call vs two-pass generation |
| `src/config.ts` | Reads settings + SecretStorage into a `GenerationConfig` |
| `src/endpoint.ts` | Pure endpoint helpers (`isLocalUrl`, `needsApiKey`) |
| `src/tokens.ts` | Token counting (tiktoken with a safe fallback) |
| `src/test/**` | Unit tests (vitest) |
| `scripts/` | Build helpers, icon generator, live integration check |

The core logic is written as **pure functions** with no `vscode` dependency, so it is
unit-tested directly. Keep new logic testable the same way: put `vscode`-dependent code
in `extension.ts` / `git-api.ts`, and everything else in pure modules.

## Quality bar

Every change must pass all of the following before it is merged:

```bash
npm run lint         # ESLint, type-checked + strict — zero warnings
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run build        # esbuild bundle must succeed
```

- **Add tests** for new behaviour. Bug fixes should come with a regression test.
- **No new lint suppressions** without a one-line justification comment.
- Match the surrounding code style: small pure functions, doc comments on exports.

The optional `npm run integration` check exercises real endpoints; see the README for
the environment variables it reads. It is **not** required for unit-level changes.

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/).
(You can dogfood the extension to write them.)

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE).
