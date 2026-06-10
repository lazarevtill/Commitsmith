// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  budgetFileDiff,
  buildContext,
  cleanMessage,
  formatStatusTable,
  globToRegExp,
  isIgnored,
  matchesAnyGlob,
  splitHunks,
  stripReasoning,
  truncateLinesToTokens,
} from "../diff";
import type { FileChange } from "../types";

function file(partial: Partial<FileChange> & { path: string }): FileChange {
  return {
    status: "M",
    additions: 1,
    deletions: 0,
    binary: false,
    diffBody: "",
    ...partial,
  };
}

describe("globToRegExp / matchesAnyGlob", () => {
  it("matches * within a segment but not across slashes", () => {
    expect(globToRegExp("*.lock").test("yarn.lock")).toBe(true);
    expect(globToRegExp("*.lock").test("a/yarn.lock")).toBe(false);
  });

  it("matches ** across slashes", () => {
    expect(globToRegExp("dist/**").test("dist/a/b.js")).toBe(true);
  });

  it("matches by basename or full path", () => {
    expect(matchesAnyGlob("a/b/package-lock.json", ["package-lock.json"])).toBe(true);
    expect(matchesAnyGlob("src/app.min.js", ["*.min.*"])).toBe(true);
    expect(matchesAnyGlob("src/app.ts", ["*.min.*"])).toBe(false);
  });
});

describe("isIgnored", () => {
  it("flags lockfiles and dist", () => {
    expect(isIgnored(file({ path: "package-lock.json" }), ["package-lock.json"])).toBe(true);
    expect(isIgnored(file({ path: "dist/extension.js" }), ["dist/**"])).toBe(true);
    expect(isIgnored(file({ path: "src/index.ts" }), ["dist/**", "*.lock"])).toBe(false);
  });
});

describe("formatStatusTable", () => {
  it("lists counts, renames, binary, and omitted files", () => {
    const table = formatStatusTable(
      [
        file({ path: "src/a.ts", status: "M", additions: 12, deletions: 3 }),
        file({ path: "new.ts", oldPath: "old.ts", status: "R", additions: 0, deletions: 0 }),
        file({ path: "logo.png", status: "A", binary: true, additions: -1, deletions: -1 }),
        file({ path: "package-lock.json", status: "M", additions: 200, deletions: 50 }),
      ],
      ["package-lock.json"],
    );
    expect(table).toContain("src/a.ts\t+12 -3");
    expect(table).toContain("old.ts -> new.ts");
    expect(table).toContain("logo.png\t(binary, diff omitted)");
    expect(table).toContain("package-lock.json\t+200 -50, diff omitted");
  });
});

describe("splitHunks", () => {
  it("separates header from hunks", () => {
    const body = [
      "diff --git a/f b/f",
      "--- a/f",
      "+++ b/f",
      "@@ -1,2 +1,3 @@",
      " a",
      "+b",
      "@@ -10,1 +11,2 @@",
      " x",
      "+y",
    ].join("\n");
    const { header, hunks } = splitHunks(body);
    expect(header).toContain("diff --git");
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toContain("@@ -1,2 +1,3 @@");
    expect(hunks[1]).toContain("@@ -10,1 +11,2 @@");
  });

  it("returns the whole body as header when there are no hunks", () => {
    const { header, hunks } = splitHunks("diff --git a/f b/f\nrename from f\nrename to g");
    expect(hunks).toHaveLength(0);
    expect(header).toContain("rename to g");
  });
});

describe("truncateLinesToTokens", () => {
  it("never cuts mid-line", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line number ${i} with some words`).join("\n");
    const out = truncateLinesToTokens(text, 20);
    for (const line of out.split("\n")) {
      expect(text.split("\n")).toContain(line);
    }
  });
});

describe("budgetFileDiff", () => {
  it("keeps the full body when within budget", () => {
    const body = "diff --git a/f b/f\n@@ -1 +1 @@\n+x";
    expect(budgetFileDiff(body, 1000).omittedHunks).toBe(0);
    expect(budgetFileDiff(body, 1000).body).toBe(body);
  });

  it("keeps header + earliest whole hunks and flags omissions", () => {
    const hunk = (n: number) =>
      [`@@ -${n},5 +${n},6 @@`, ...Array.from({ length: 8 }, (_, i) => `+l${n}_${i}`)].join("\n");
    const body = ["diff --git a/f b/f", "--- a/f", "+++ b/f", hunk(1), hunk(20), hunk(40)].join("\n");
    const { body: out, omittedHunks } = budgetFileDiff(body, 40);
    expect(out).toContain("diff --git a/f b/f");
    expect(out).toContain("@@ -1,5");
    expect(omittedHunks).toBeGreaterThan(0);
    expect(out).toContain("omitted");
  });
});

describe("buildContext", () => {
  it("excludes ignored and binary files from the body but lists them in the table", () => {
    const ctx = buildContext(
      [
        file({ path: "src/a.ts", additions: 5, deletions: 1, diffBody: "diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n+code" }),
        file({ path: "package-lock.json", additions: 200, deletions: 9, diffBody: "diff --git\n@@ -1 +1 @@\n+lots" }),
        file({ path: "logo.png", binary: true, additions: -1, deletions: -1, diffBody: "" }),
      ],
      ["package-lock.json"],
      3000,
    );
    expect(ctx.includedFiles).toHaveLength(1);
    expect(ctx.includedFiles[0].path).toBe("src/a.ts");
    expect(ctx.body).toContain("+code");
    expect(ctx.body).not.toContain("+lots");
    expect(ctx.table).toContain("package-lock.json");
    expect(ctx.table).toContain("logo.png");
  });

  it("allocates more budget to the larger change", () => {
    const bigHunks = Array.from({ length: 30 }, (_, i) =>
      [`@@ -${i * 5},4 +${i * 5},5 @@`, `+big change line ${i} aaaaaaaaaaaaaaaaaaaa`].join("\n"),
    ).join("\n");
    const big = file({
      path: "big.ts",
      additions: 300,
      deletions: 10,
      diffBody: "diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n" + bigHunks,
    });
    const small = file({
      path: "small.ts",
      additions: 1,
      deletions: 0,
      diffBody: "diff --git a/small.ts b/small.ts\n@@ -1 +1 @@\n+tiny",
    });
    const ctx = buildContext([small, big], [], 200);
    expect(ctx.truncated).toBe(true);
    // The small file's single line should survive intact.
    expect(ctx.body).toContain("+tiny");
  });
});

describe("cleanMessage", () => {
  it("strips wrapping code fences", () => {
    expect(cleanMessage("```\nfeat: add x\n```")).toBe("feat: add x");
    expect(cleanMessage("```text\nfix: y\n```")).toBe("fix: y");
  });

  it("strips a leading label and surrounding quotes", () => {
    expect(cleanMessage('Commit message: "feat: thing"')).toBe("feat: thing");
    expect(cleanMessage("'fix: bug'")).toBe("fix: bug");
  });

  it("collapses excessive blank lines and trims", () => {
    expect(cleanMessage("feat: a\n\n\n\nbody")).toBe("feat: a\n\nbody");
  });

  it("leaves a clean message untouched", () => {
    expect(cleanMessage("refactor(core): simplify loop")).toBe("refactor(core): simplify loop");
  });

  it("strips <think> reasoning blocks", () => {
    expect(cleanMessage("<think>let me reason about this</think>feat: add retry")).toBe(
      "feat: add retry",
    );
    expect(cleanMessage("<thinking>\nlots\nof\nthought\n</thinking>\nfix: bug")).toBe("fix: bug");
  });

  it("strips an unclosed leading think block", () => {
    expect(cleanMessage("<think>I should consider the diff and")).toBe("");
  });
});

describe("stripReasoning", () => {
  it("keeps only the harmony final channel", () => {
    const raw =
      "<|channel|>analysis<|message|>The user wants a commit<|end|>" +
      "<|start|>assistant<|channel|>final<|message|>feat(http): add retry";
    expect(stripReasoning(raw)).toBe("feat(http): add retry");
  });

  it("removes stray harmony control tokens", () => {
    expect(stripReasoning("<|start|>feat: x<|end|>")).toBe("feat: x");
  });

  it("passes plain text through", () => {
    expect(stripReasoning("feat: plain")).toBe("feat: plain");
  });
});
