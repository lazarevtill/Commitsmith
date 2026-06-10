// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import type { DiffSelection, FileChange } from "./types";

/** Runs a git subcommand and returns stdout. Injectable for testing. */
export type GitRunner = (args: string[]) => string;

function makeRunner(cwd: string): GitRunner {
  return (args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
}

/** Git may C-quote paths with special characters; unwrap the simple case. */
function unquotePath(p: string): string {
  if (p.startsWith('"') && p.endsWith('"')) {
    try {
      // git C-quoting matches JSON string escaping closely enough for the
      // common cases; the result is always a string.
      return JSON.parse(p) as string;
    } catch {
      return p.slice(1, -1);
    }
  }
  return p;
}

/** Resolve a numstat path, expanding rename forms `a => b` and `dir/{a => b}/f`. */
export function expandNumstatPath(raw: string): { oldPath?: string; path: string } {
  const p = raw.trim();
  if (p.includes(" => ")) {
    const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(p);
    if (brace) {
      const [, pre, from, to, post] = brace;
      const oldPath = unquotePath((pre + from + post).replace(/\/\//g, "/"));
      const path = unquotePath((pre + to + post).replace(/\/\//g, "/"));
      return { oldPath, path };
    }
    const [from, to] = p.split(" => ");
    return { oldPath: unquotePath(from), path: unquotePath(to) };
  }
  return { path: unquotePath(p) };
}

/** Parse `git diff --numstat` into per-path addition/deletion counts. */
export function parseNumstat(
  output: string,
): Map<string, { additions: number; deletions: number; binary: boolean }> {
  const map = new Map<string, { additions: number; deletions: number; binary: boolean }>();
  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.split("\t");
    if (parts.length < 3) {
      continue;
    }
    const [addStr, delStr, ...rest] = parts;
    const { path } = expandNumstatPath(rest.join("\t"));
    const binary = addStr === "-" || delStr === "-";
    map.set(path, {
      additions: binary ? -1 : parseInt(addStr, 10) || 0,
      deletions: binary ? -1 : parseInt(delStr, 10) || 0,
      binary,
    });
  }
  return map;
}

/** Parse `git diff --name-status` into status + path(s) per file. */
export function parseNameStatus(
  output: string,
): { status: string; path: string; oldPath?: string }[] {
  const files: { status: string; path: string; oldPath?: string }[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.split("\t");
    const code = parts[0];
    const status = code[0];
    if ((status === "R" || status === "C") && parts.length >= 3) {
      files.push({ status, oldPath: unquotePath(parts[1]), path: unquotePath(parts[2]) });
    } else if (parts.length >= 2) {
      files.push({ status, path: unquotePath(parts[1]) });
    }
  }
  return files;
}

/** Split a full `git diff` into per-file bodies keyed by new path. */
export function splitFullDiff(diff: string): Map<string, { body: string; binary: boolean }> {
  const map = new Map<string, { body: string; binary: boolean }>();
  if (!diff.trim()) {
    return map;
  }
  const chunks = diff.split(/^(?=diff --git )/m);
  for (const chunk of chunks) {
    if (!chunk.startsWith("diff --git")) {
      continue;
    }
    let path: string | undefined;
    const plus = /^\+\+\+ b\/(.*)$/m.exec(chunk);
    if (plus && plus[1] !== "/dev/null") {
      path = unquotePath(plus[1]);
    }
    if (!path) {
      const minus = /^--- a\/(.*)$/m.exec(chunk);
      if (minus && minus[1] !== "/dev/null") {
        path = unquotePath(minus[1]);
      }
    }
    if (!path) {
      const head = /^diff --git a\/(.*) b\/(.*)$/m.exec(chunk);
      if (head) {
        path = unquotePath(head[2]);
      }
    }
    if (!path) {
      continue;
    }
    const binary = /^Binary files /m.test(chunk) || chunk.includes('GIT binary patch');
    map.set(path, { body: chunk.replace(/\n+$/, ""), binary });
  }
  return map;
}

/** Combine name-status, numstat, and the full diff into FileChange records. */
export function combineChanges(
  nameStatus: string,
  numstat: string,
  fullDiff: string,
): FileChange[] {
  const status = parseNameStatus(nameStatus);
  const counts = parseNumstat(numstat);
  const bodies = splitFullDiff(fullDiff);

  return status.map((s) => {
    const c = counts.get(s.path) ?? counts.get(s.oldPath ?? "");
    const b = bodies.get(s.path) ?? bodies.get(s.oldPath ?? "");
    const binary = (c?.binary ?? false) || (b?.binary ?? false);
    return {
      path: s.path,
      oldPath: s.oldPath,
      status: s.status,
      additions: binary ? -1 : (c?.additions ?? 0),
      deletions: binary ? -1 : (c?.deletions ?? 0),
      binary,
      diffBody: binary ? "" : (b?.body ?? ""),
    };
  });
}

/** Collect the change set for a repo: staged first, falling back to unstaged. */
export function collectChanges(
  cwd: string,
  runner?: GitRunner,
): { files: FileChange[]; selection: DiffSelection } {
  const run = runner ?? makeRunner(cwd);
  const stagedNumstat = run(["diff", "--cached", "--numstat"]).trim();
  if (stagedNumstat.length > 0) {
    const files = combineChanges(
      run(["diff", "--cached", "--name-status"]),
      stagedNumstat,
      run(["diff", "--cached"]),
    );
    return { files, selection: "staged" };
  }
  const unstagedNumstat = run(["diff", "--numstat"]).trim();
  if (unstagedNumstat.length > 0) {
    const files = combineChanges(
      run(["diff", "--name-status"]),
      unstagedNumstat,
      run(["diff"]),
    );
    return { files, selection: "unstaged" };
  }
  return { files: [], selection: "none" };
}
