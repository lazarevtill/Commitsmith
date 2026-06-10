// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { generateMessage } from "../pipeline";
import type { CallParams } from "../provider";
import type { FileChange, GenerationConfig } from "../types";

function cfg(overrides: Partial<GenerationConfig> = {}): GenerationConfig {
  return {
    api: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "sk",
    temperature: 0.15,
    maxDiffTokens: 3500,
    largeDiffThreshold: 7000,
    maxTokens: 200,
    ollamaNumCtx: 8192,
    requestTimeoutMs: 90000,
    systemPrompt: "",
    ignoreGlobs: ["*.lock"],
    ...overrides,
  };
}

function file(partial: Partial<FileChange> & { path: string }): FileChange {
  return {
    status: "M",
    additions: 1,
    deletions: 0,
    binary: false,
    diffBody: `diff --git a/${partial.path} b/${partial.path}\n@@ -1 +1 @@\n+x`,
    ...partial,
  };
}

describe("generateMessage", () => {
  it("uses a single call for a small diff and cleans the result", async () => {
    const call = vi.fn(async (_p: CallParams) => "```\nfeat: add thing\n```");
    const result = await generateMessage([file({ path: "src/a.ts" })], cfg(), call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(result.strategy).toBe("single");
    expect(result.message).toBe("feat: add thing");
  });

  it("falls back to two-pass when the diff exceeds the threshold", async () => {
    const bigBody = (name: string) =>
      "diff --git a/" +
      name +
      " b/" +
      name +
      "\n" +
      Array.from({ length: 400 }, (_, i) => `@@ -${i},1 +${i},2 @@\n+long line of content number ${i} here`).join("\n");
    const files = [
      file({ path: "a.ts", additions: 400, deletions: 0, diffBody: bigBody("a.ts") }),
      file({ path: "b.ts", additions: 400, deletions: 0, diffBody: bigBody("b.ts") }),
    ];
    const call = vi.fn(async (p: CallParams) => {
      const isSynthesis = p.messages.some((m) => m.content.includes("Per-file change summaries"));
      return isSynthesis ? "feat: big multi-file change" : "changed a file";
    });
    const result = await generateMessage(files, cfg({ largeDiffThreshold: 100 }), call);
    expect(result.strategy).toBe("two-pass");
    // one call per file summary + one synthesis
    expect(call).toHaveBeenCalledTimes(3);
    expect(result.message).toBe("feat: big multi-file change");
  });

  it("does not use two-pass for a single large file", async () => {
    const big = file({
      path: "a.ts",
      additions: 999,
      deletions: 0,
      diffBody: Array.from({ length: 500 }, (_, i) => `@@ -${i} +${i} @@\n+x${i}`).join("\n"),
    });
    const call = vi.fn(async () => "refactor: rework module");
    const result = await generateMessage([big], cfg({ largeDiffThreshold: 10 }), call);
    expect(result.strategy).toBe("single");
    expect(call).toHaveBeenCalledTimes(1);
  });
});
