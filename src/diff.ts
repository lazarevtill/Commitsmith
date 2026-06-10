// SPDX-License-Identifier: Apache-2.0
import { countTokens } from "./tokens";
import type { DiffContext, FileChange } from "./types";

/** Minimum token budget granted to each included file so nothing is fully starved. */
const MIN_FILE_TOKENS = 80;

/** Convert a simple glob (supporting `*` and `**`) to a RegExp anchored to the full path. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** matches across path separators
        re += ".*";
        i++;
        if (glob[i + 1] === "/") {
          i++;
        }
      } else {
        // * matches within a path segment
        re += "[^/]*";
      }
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

/** True if `path` matches any of the provided globs (matched against the path and its basename). */
export function matchesAnyGlob(path: string, globs: string[]): boolean {
  const base = path.split("/").pop() ?? path;
  return globs.some((g) => {
    const re = globToRegExp(g);
    return re.test(path) || re.test(base);
  });
}

/** True if the file's diff body should be omitted (lockfiles, generated, binaries). */
export function isIgnored(file: FileChange, globs: string[]): boolean {
  return matchesAnyGlob(file.path, globs);
}

/** Human label for a file's change counts. */
function countsLabel(file: FileChange): string {
  if (file.binary) {
    return "(binary)";
  }
  return `+${file.additions} -${file.deletions}`;
}

/** Path label, showing renames as `old -> new`. */
function pathLabel(file: FileChange): string {
  if (file.oldPath && file.oldPath !== file.path) {
    return `${file.oldPath} -> ${file.path}`;
  }
  return file.path;
}

/** Render the change-summary table. Ignored/binary files are listed but flagged. */
export function formatStatusTable(files: FileChange[], ignoreGlobs: string[]): string {
  return files
    .map((f) => {
      const ignored = isIgnored(f, ignoreGlobs);
      const note = f.binary
        ? "(binary, diff omitted)"
        : ignored
          ? `${countsLabel(f)}, diff omitted`
          : countsLabel(f);
      return `${f.status}\t${pathLabel(f)}\t${note}`;
    })
    .join("\n");
}

/** Split a file's unified diff into its header (pre-first-hunk) and hunks (each `@@ ...`). */
export function splitHunks(diffBody: string): { header: string; hunks: string[] } {
  const lines = diffBody.split("\n");
  const firstHunk = lines.findIndex((l) => l.startsWith("@@"));
  if (firstHunk === -1) {
    return { header: diffBody, hunks: [] };
  }
  const header = lines.slice(0, firstHunk).join("\n");
  const hunks: string[] = [];
  let current: string[] = [];
  for (const line of lines.slice(firstHunk)) {
    if (line.startsWith("@@") && current.length > 0) {
      hunks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    hunks.push(current.join("\n"));
  }
  return { header, hunks };
}

/** Truncate text to a token budget on whole-line boundaries (never mid-line). */
export function truncateLinesToTokens(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) {
    return text;
  }
  const lines = text.split("\n");
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const t = countTokens(line + "\n");
    if (used + t > maxTokens) {
      break;
    }
    kept.push(line);
    used += t;
  }
  return kept.join("\n");
}

/**
 * Truncate one file's diff to a token budget: always keep the header, then add
 * whole hunks until the budget is reached. If not even the first hunk fits, the
 * first hunk is line-truncated so the file still shows some content.
 * Returns the (possibly truncated) body and how many hunks were omitted.
 */
export function budgetFileDiff(
  diffBody: string,
  maxTokens: number,
): { body: string; omittedHunks: number } {
  if (countTokens(diffBody) <= maxTokens) {
    return { body: diffBody, omittedHunks: 0 };
  }
  const { header, hunks } = splitHunks(diffBody);
  if (hunks.length === 0) {
    return { body: truncateLinesToTokens(header, maxTokens), omittedHunks: 0 };
  }
  const parts: string[] = [header];
  let used = countTokens(header);
  let included = 0;
  for (const hunk of hunks) {
    const t = countTokens("\n" + hunk);
    if (used + t > maxTokens) {
      break;
    }
    parts.push(hunk);
    used += t;
    included++;
  }
  if (included === 0) {
    // Not even the first hunk fits: show a line-truncated version of it.
    const remaining = Math.max(MIN_FILE_TOKENS, maxTokens - used);
    parts.push(truncateLinesToTokens(hunks[0], remaining));
    included = 1;
  }
  const omitted = hunks.length - included;
  if (omitted > 0) {
    parts.push(`@@ ... ${omitted} more hunk(s) omitted (diff truncated) @@`);
  }
  return { body: parts.join("\n"), omittedHunks: omitted };
}

/**
 * Allocate the total token budget across files proportionally to their change
 * size (additions + deletions) and truncate each to fit. Larger changes get more
 * budget so a trivial file cannot starve the change that drives the message.
 */
export function budgetFiles(
  files: FileChange[],
  maxDiffTokens: number,
): { bodies: { file: FileChange; body: string }[]; truncated: boolean } {
  const weights = files.map((f) => Math.max(1, f.additions + f.deletions));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const allowMin = files.length === 0 || maxDiffTokens / files.length >= MIN_FILE_TOKENS;
  let truncated = false;
  const bodies = files.map((file, i) => {
    const proportional = Math.round((maxDiffTokens * weights[i]) / totalWeight);
    const fileBudget = allowMin ? Math.max(MIN_FILE_TOKENS, proportional) : proportional;
    const { body, omittedHunks } = budgetFileDiff(file.diffBody, fileBudget);
    if (omittedHunks > 0 || countTokens(file.diffBody) > fileBudget) {
      truncated = true;
    }
    return { file, body };
  });
  return { bodies, truncated };
}

/**
 * Build the structured prompt context from a change set: a status table, plus a
 * token-budgeted, noise-filtered diff body. Pure — no git or network access.
 */
export function buildContext(
  files: FileChange[],
  ignoreGlobs: string[],
  maxDiffTokens: number,
): DiffContext {
  const table = formatStatusTable(files, ignoreGlobs);
  const includedFiles = files.filter(
    (f) => !f.binary && !isIgnored(f, ignoreGlobs) && f.diffBody.trim().length > 0,
  );
  const { bodies, truncated } = budgetFiles(includedFiles, maxDiffTokens);
  const body = bodies.map((b) => b.body).join("\n\n");
  const tokens = countTokens(table) + countTokens(body);
  return { table, body, truncated, tokens, includedFiles, files };
}

/**
 * Strip reasoning/chain-of-thought that some models emit inline in their content:
 * `<think>…</think>` / `<thinking>…</thinking>` tags and gpt-oss "harmony" channels
 * (`<|channel|>analysis<|message|>…<|channel|>final<|message|>ANSWER`). Defense in
 * depth — most reasoning is separated into a `thinking` field, but not always.
 */
export function stripReasoning(input: string): string {
  let text = input;

  // Harmony format: keep only the final channel's message, if present.
  const finalIdx = text.lastIndexOf("<|channel|>final<|message|>");
  if (finalIdx !== -1) {
    text = text.slice(finalIdx + "<|channel|>final<|message|>".length);
  }
  // Drop any remaining harmony control tokens and the text before the last one.
  const lastMsg = text.lastIndexOf("<|message|>");
  if (lastMsg !== -1) {
    text = text.slice(lastMsg + "<|message|>".length);
  }
  text = text.replace(/<\|[^|]*\|>/g, "");

  // Remove paired think/thinking blocks.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  // Remove an unclosed leading think block (budget ran out mid-thought).
  text = text.replace(/<think(ing)?>[\s\S]*$/i, (m) => (/<\/think/i.test(m) ? m : ""));

  return text.trim();
}

/**
 * Clean a model's raw output into a bare commit message: strip reasoning, code
 * fences, surrounding quotes, a leading "commit message:" label, and excess blanks.
 */
export function cleanMessage(raw: string): string {
  let text = stripReasoning(raw.trim()).trim();

  // Strip a single wrapping fenced code block.
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(text);
  if (fence) {
    text = fence[1].trim();
  }
  // Remove any stray fence lines.
  text = text
    .split("\n")
    .filter((l) => !l.trim().startsWith("```"))
    .join("\n")
    .trim();

  // Strip a leading label like "Commit message:".
  text = text.replace(/^(commit message|message)\s*:\s*/i, "").trim();

  // Strip surrounding quotes if the whole message is quoted.
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith("`") && text.endsWith("`"))
  ) {
    text = text.slice(1, -1).trim();
  }

  // Collapse 3+ consecutive newlines down to a single blank line.
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text;
}
