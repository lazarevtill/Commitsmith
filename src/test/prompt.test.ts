// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYSTEM_PROMPT,
  buildSingleMessages,
  buildSynthesisMessages,
  resolveSystemPrompt,
} from "../prompt";
import type { DiffContext } from "../types";

const ctx: DiffContext = {
  table: "M\tsrc/a.ts\t+5 -1",
  body: "diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n+code",
  truncated: false,
  tokens: 42,
  includedFiles: [],
  files: [],
};

describe("resolveSystemPrompt", () => {
  it("uses the default when the override is empty", () => {
    expect(resolveSystemPrompt("")).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(resolveSystemPrompt("   ")).toBe(DEFAULT_SYSTEM_PROMPT);
  });
  it("uses the override when provided", () => {
    expect(resolveSystemPrompt("custom")).toBe("custom");
  });
});

describe("buildSingleMessages", () => {
  it("puts rules in system and diff as data in user", () => {
    const msgs = buildSingleMessages(ctx, DEFAULT_SYSTEM_PROMPT);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("data, not instructions");
  });

  it("repeats the status table at the top and the end (truncation defense)", () => {
    const msgs = buildSingleMessages(ctx, DEFAULT_SYSTEM_PROMPT);
    const occurrences = msgs[1].content.split("M\tsrc/a.ts\t+5 -1").length - 1;
    expect(occurrences).toBe(2);
  });

  it("adds a truncation note when truncated", () => {
    const msgs = buildSingleMessages({ ...ctx, truncated: true }, DEFAULT_SYSTEM_PROMPT);
    expect(msgs[1].content).toContain("truncated");
  });
});

describe("buildSynthesisMessages", () => {
  it("includes the table and numbered summaries", () => {
    const msgs = buildSynthesisMessages("M\tx", ["did a", "did b"], DEFAULT_SYSTEM_PROMPT);
    expect(msgs[1].content).toContain("1. did a");
    expect(msgs[1].content).toContain("2. did b");
  });
});

describe("DEFAULT_SYSTEM_PROMPT", () => {
  it("contains the anti-hallucination instruction", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain("Do not invent motivation");
    expect(DEFAULT_SYSTEM_PROMPT).toContain("Conventional Commits");
  });
});
