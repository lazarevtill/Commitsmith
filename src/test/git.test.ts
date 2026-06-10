// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  collectChanges,
  combineChanges,
  expandNumstatPath,
  parseNameStatus,
  parseNumstat,
  splitFullDiff,
  type GitRunner,
} from "../git";

describe("expandNumstatPath", () => {
  it("handles plain paths", () => {
    expect(expandNumstatPath("src/a.ts")).toEqual({ path: "src/a.ts" });
  });
  it("handles brace rename form", () => {
    expect(expandNumstatPath("src/{a.ts => b.ts}")).toEqual({
      oldPath: "src/a.ts",
      path: "src/b.ts",
    });
  });
  it("handles full rename form", () => {
    expect(expandNumstatPath("a.ts => b.ts")).toEqual({ oldPath: "a.ts", path: "b.ts" });
  });
});

describe("parseNumstat", () => {
  it("parses counts and binary markers", () => {
    const map = parseNumstat("12\t3\tsrc/a.ts\n-\t-\tlogo.png\n0\t0\tsrc/{x => y}.ts");
    expect(map.get("src/a.ts")).toEqual({ additions: 12, deletions: 3, binary: false });
    expect(map.get("logo.png")).toEqual({ additions: -1, deletions: -1, binary: true });
    expect(map.get("src/y.ts")).toEqual({ additions: 0, deletions: 0, binary: false });
  });
});

describe("parseNameStatus", () => {
  it("parses modifies, adds, deletes and renames", () => {
    const files = parseNameStatus("M\tsrc/a.ts\nA\tsrc/new.ts\nD\tsrc/old.ts\nR100\tfrom.ts\tto.ts");
    expect(files).toContainEqual({ status: "M", path: "src/a.ts" });
    expect(files).toContainEqual({ status: "A", path: "src/new.ts" });
    expect(files).toContainEqual({ status: "D", path: "src/old.ts" });
    expect(files).toContainEqual({ status: "R", oldPath: "from.ts", path: "to.ts" });
  });
});

describe("splitFullDiff", () => {
  it("splits into per-file bodies keyed by new path", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "+a",
      "diff --git a/logo.png b/logo.png",
      "Binary files a/logo.png and b/logo.png differ",
    ].join("\n");
    const map = splitFullDiff(diff);
    expect(map.get("src/a.ts")?.body).toContain("+a");
    expect(map.get("src/a.ts")?.binary).toBe(false);
    expect(map.get("logo.png")?.binary).toBe(true);
  });

  it("keys a deleted file by its a/ path", () => {
    const diff = [
      "diff --git a/gone.ts b/gone.ts",
      "deleted file mode 100644",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-x",
    ].join("\n");
    const map = splitFullDiff(diff);
    expect(map.has("gone.ts")).toBe(true);
  });
});

describe("combineChanges", () => {
  it("merges status, counts and bodies", () => {
    const files = combineChanges(
      "M\tsrc/a.ts\nA\tlogo.png",
      "5\t2\tsrc/a.ts\n-\t-\tlogo.png",
      "diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n+code",
    );
    const a = files.find((f) => f.path === "src/a.ts")!;
    expect(a.additions).toBe(5);
    expect(a.deletions).toBe(2);
    expect(a.diffBody).toContain("+code");
    const png = files.find((f) => f.path === "logo.png")!;
    expect(png.binary).toBe(true);
    expect(png.diffBody).toBe("");
  });
});

describe("collectChanges", () => {
  it("uses staged changes when present", () => {
    const runner: GitRunner = (args) => {
      const key = args.join(" ");
      if (key === "diff --cached --numstat") return "1\t0\tsrc/a.ts";
      if (key === "diff --cached --name-status") return "M\tsrc/a.ts";
      if (key === "diff --cached") return "diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n+x";
      return "";
    };
    const { files, selection } = collectChanges("/repo", runner);
    expect(selection).toBe("staged");
    expect(files).toHaveLength(1);
  });

  it("falls back to unstaged when nothing is staged", () => {
    const runner: GitRunner = (args) => {
      const key = args.join(" ");
      if (key === "diff --cached --numstat") return "";
      if (key === "diff --numstat") return "2\t1\tsrc/b.ts";
      if (key === "diff --name-status") return "M\tsrc/b.ts";
      if (key === "diff") return "diff --git a/src/b.ts b/src/b.ts\n@@ -1 +1 @@\n+y";
      return "";
    };
    const { files, selection } = collectChanges("/repo", runner);
    expect(selection).toBe("unstaged");
    expect(files[0].path).toBe("src/b.ts");
  });

  it("reports none when there is nothing", () => {
    const runner: GitRunner = () => "";
    expect(collectChanges("/repo", runner).selection).toBe("none");
  });
});
