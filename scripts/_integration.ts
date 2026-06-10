// SPDX-License-Identifier: Apache-2.0
// End-to-end integration check: drives the real pipeline against live endpoints.
// Bundled and executed by scripts/integration.mjs.
//
// Nothing here is hard-coded to any private host or key — everything comes from
// the environment, and each test is skipped (not failed) when its endpoint is not
// configured or reachable, so `npm run integration` is safe to run on any clone.
//
//   Ollama:  OLLAMA_HOST (default http://localhost:11434), OLLAMA_MODEL
//   OpenAI:  OPENAI_BASE, OPENAI_MODEL, OPENAI_KEY  (test skipped if OPENAI_KEY unset)
//   Reasoning-model tests run only when REASONING=1, with REASONING_MODELS=a,b
import { generateMessage } from "../src/pipeline";
import type { FileChange, GenerationConfig } from "../src/types";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:latest";
const OPENAI_BASE = process.env.OPENAI_BASE ?? "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_KEY = process.env.OPENAI_KEY ?? "";
const RUN_REASONING = process.env.REASONING === "1";
const REASONING_MODELS = (process.env.REASONING_MODELS ?? "qwen3:latest,gpt-oss:20b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

function baseConfig(): GenerationConfig {
  return {
    api: "openai",
    baseUrl: "",
    model: "",
    apiKey: "",
    temperature: 0.15,
    maxDiffTokens: 3500,
    largeDiffThreshold: 7000,
    maxTokens: 200,
    ollamaNumCtx: 8192,
    requestTimeoutMs: 120000,
    systemPrompt: "",
    ignoreGlobs: ["*.lock", "package-lock.json", "dist/**"],
  };
}

const ollamaConfig: GenerationConfig = {
  ...baseConfig(),
  api: "ollama",
  baseUrl: OLLAMA_HOST,
  model: OLLAMA_MODEL,
  apiKey: "ollama",
};

const openaiConfig: GenerationConfig = {
  ...baseConfig(),
  api: "openai",
  baseUrl: OPENAI_BASE,
  model: OPENAI_MODEL,
  apiKey: OPENAI_KEY,
};

// A realistic small change: add a retry helper to an HTTP client.
const smallChange: FileChange[] = [
  {
    path: "src/http/client.ts",
    status: "M",
    additions: 14,
    deletions: 2,
    binary: false,
    diffBody: [
      "diff --git a/src/http/client.ts b/src/http/client.ts",
      "--- a/src/http/client.ts",
      "+++ b/src/http/client.ts",
      "@@ -10,8 +10,20 @@ export class HttpClient {",
      "   async get(url: string): Promise<Response> {",
      "-    return fetch(url);",
      "+    return this.withRetry(() => fetch(url));",
      "+  }",
      "+",
      "+  private async withRetry(fn: () => Promise<Response>, attempts = 3): Promise<Response> {",
      "+    let lastErr: unknown;",
      "+    for (let i = 0; i < attempts; i++) {",
      "+      try {",
      "+        return await fn();",
      "+      } catch (err) {",
      "+        lastErr = err;",
      "+        await new Promise((r) => setTimeout(r, 200 * 2 ** i));",
      "+      }",
      "+    }",
      "+    throw lastErr;",
      "   }",
      " }",
    ].join("\n"),
  },
  {
    path: "package-lock.json",
    status: "M",
    additions: 120,
    deletions: 8,
    binary: false,
    diffBody: "diff --git a/package-lock.json b/package-lock.json\n@@ -1 +1 @@\n+noise",
  },
];

function looksLikeCommit(msg: string): boolean {
  const subject = msg.split("\n")[0];
  return subject.length > 0 && subject.length < 120;
}

type Status = "pass" | "fail" | "skip";

interface Outcome {
  name: string;
  status: Status;
  detail: string;
}

/** Best-effort reachability probe so a missing endpoint skips rather than fails. */
async function reachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 3000);
  try {
    await fetch(url, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function run(name: string, fn: () => Promise<string>): Promise<Outcome> {
  const start = Date.now();
  try {
    const msg = await fn();
    const ms = Date.now() - start;
    const ok = looksLikeCommit(msg);
    console.log(`\n=== ${name} (${ms}ms) ===`);
    console.log(msg);
    console.log(`--- ${ok ? "PASS" : "FAIL (does not look like a commit message)"} ---`);
    return { name, status: ok ? "pass" : "fail", detail: msg.split("\n")[0] };
  } catch (err: any) {
    console.log(`\n=== ${name} ===`);
    console.log(`ERROR: ${err?.message ?? err}`);
    return { name, status: "fail", detail: err?.message ?? String(err) };
  }
}

function skip(name: string, reason: string): Outcome {
  console.log(`\n=== ${name} ===`);
  console.log(`SKIP: ${reason}`);
  return { name, status: "skip", detail: reason };
}

async function main(): Promise<void> {
  const outcomes: Outcome[] = [];
  const ollamaUp = await reachable(`${OLLAMA_HOST}/api/tags`);

  // --- Ollama single-pass ---
  if (!ollamaUp) {
    outcomes.push(skip(`Ollama single-pass`, `Ollama not reachable at ${OLLAMA_HOST}`));
  } else {
    outcomes.push(
      await run(`Ollama single-pass (${OLLAMA_MODEL} @ ${OLLAMA_HOST})`, async () => {
        const r = await generateMessage(smallChange, ollamaConfig);
        if (r.strategy !== "single") throw new Error(`expected single, got ${r.strategy}`);
        return r.message;
      }),
    );
  }

  // --- OpenAI-compatible single-pass ---
  if (!OPENAI_KEY) {
    outcomes.push(skip(`OpenAI-compatible single-pass`, `OPENAI_KEY not set`));
  } else {
    outcomes.push(
      await run(`OpenAI-compatible single-pass (${OPENAI_MODEL} @ ${OPENAI_BASE})`, async () => {
        const r = await generateMessage(smallChange, openaiConfig);
        if (r.strategy !== "single") throw new Error(`expected single, got ${r.strategy}`);
        return r.message;
      }),
    );
  }

  // --- Reasoning/"thinking" models must not leak chain-of-thought (opt-in) ---
  if (!RUN_REASONING) {
    outcomes.push(skip(`Reasoning models`, `set REASONING=1 to run (models: ${REASONING_MODELS.join(", ")})`));
  } else if (!ollamaUp) {
    outcomes.push(skip(`Reasoning models`, `Ollama not reachable at ${OLLAMA_HOST}`));
  } else {
    for (const model of REASONING_MODELS) {
      outcomes.push(
        await run(`Ollama reasoning model — no CoT leak (${model})`, async () => {
          const r = await generateMessage(smallChange, { ...ollamaConfig, model });
          if (/<think|<\|channel\|>/i.test(r.message)) throw new Error("reasoning leaked into message");
          return r.message;
        }),
      );
    }
  }

  // --- Ollama two-pass (large diff) ---
  if (!ollamaUp) {
    outcomes.push(skip(`Ollama two-pass (large diff)`, `Ollama not reachable at ${OLLAMA_HOST}`));
  } else {
    outcomes.push(
      await run(`Ollama two-pass (large diff)`, async () => {
        const bigBody = (n: string) =>
          `diff --git a/${n} b/${n}\n--- a/${n}\n+++ b/${n}\n` +
          Array.from(
            { length: 220 },
            (_, i) => `@@ -${i},2 +${i},3 @@\n function f${i}() {\n+  // refactored implementation block ${i}\n   return ${i};\n }`,
          ).join("\n");
        const bigChange: FileChange[] = [
          { path: "src/a.ts", status: "M", additions: 300, deletions: 40, binary: false, diffBody: bigBody("src/a.ts") },
          { path: "src/b.ts", status: "M", additions: 280, deletions: 30, binary: false, diffBody: bigBody("src/b.ts") },
        ];
        const r = await generateMessage(bigChange, { ...ollamaConfig, largeDiffThreshold: 500 });
        if (r.strategy !== "two-pass") throw new Error(`expected two-pass, got ${r.strategy}`);
        return r.message;
      }),
    );
  }

  const passed = outcomes.filter((o) => o.status === "pass").length;
  const failed = outcomes.filter((o) => o.status === "fail").length;
  const skipped = outcomes.filter((o) => o.status === "skip").length;
  console.log(`\n================ SUMMARY ================`);
  for (const o of outcomes) {
    console.log(`${o.status.toUpperCase().padEnd(4)} ${o.name}`);
  }
  console.log(`${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
