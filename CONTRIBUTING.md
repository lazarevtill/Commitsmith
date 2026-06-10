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

## Releasing

Releases are automated by `.github/workflows/release.yml`. Every push and PR to
`main` runs lint + typecheck + tests + build. A release happens **only when the
`version` in `package.json` changes** on `main`:

1. Bump `version` in `package.json` (e.g. `0.1.0` → `0.1.1`).
2. Add a matching entry to `CHANGELOG.md`.
3. Commit and push/merge to `main`.

CI then packages the VSIX, publishes it to **Open VSX** and the **VS Code
Marketplace**, tags `v<version>`, and creates a GitHub Release with the `.vsix`
attached. Commits that don't change the version just run the checks.

### Required repository secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret | What it is |
|---|---|
| `OVSX_PAT` | Open VSX access token (open-vsx.org → Settings → Access Tokens) |
| `VSCE_PAT` | Azure DevOps PAT with **Marketplace → Manage** scope, "All accessible organizations" |

`GITHUB_TOKEN` is provided automatically for the release/tag step.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE).
