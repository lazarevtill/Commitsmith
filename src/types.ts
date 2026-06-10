// SPDX-License-Identifier: Apache-2.0

/** A single changed file parsed from `git diff`. */
export interface FileChange {
  /** Current path (new path for renames). */
  path: string;
  /** Original path for renames/copies, if different. */
  oldPath?: string;
  /** Single-letter git status: A added, M modified, D deleted, R renamed, C copied, T type-change. */
  status: string;
  /** Lines added, or -1 for binary files. */
  additions: number;
  /** Lines deleted, or -1 for binary files. */
  deletions: number;
  /** True when git reports the file as binary. */
  binary: boolean;
  /** The unified-diff body for this file (header + hunks), or "" when none/ignored. */
  diffBody: string;
}

/** Which set of changes was used to build the context. */
export type DiffSelection = "staged" | "unstaged" | "none";

/** Structured prompt context built from the changes. */
export interface DiffContext {
  /** Human-readable change summary table (one line per file). */
  table: string;
  /** The (possibly truncated) diff body for non-ignored files. */
  body: string;
  /** True if any file's diff was truncated to fit the budget. */
  truncated: boolean;
  /** Approximate token count of table + body. */
  tokens: number;
  /** Files included in the body (non-ignored, non-binary, with content). */
  includedFiles: FileChange[];
  /** All files in the change set. */
  files: FileChange[];
}

/** Resolved runtime configuration for a generation. */
export interface GenerationConfig {
  api: "openai" | "ollama";
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxDiffTokens: number;
  largeDiffThreshold: number;
  maxTokens: number;
  ollamaNumCtx: number;
  requestTimeoutMs: number;
  systemPrompt: string;
  ignoreGlobs: string[];
}
