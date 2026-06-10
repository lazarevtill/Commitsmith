// SPDX-License-Identifier: Apache-2.0
import { budgetFileDiff, buildContext, cleanMessage } from "./diff";
import {
  buildFileSummaryMessages,
  buildSingleMessages,
  buildSynthesisMessages,
  resolveSystemPrompt,
  type ChatMessage,
} from "./prompt";
import { callModel, type CallParams } from "./provider";
import { countTokens } from "./tokens";
import type { FileChange, GenerationConfig } from "./types";

export type ModelCaller = (params: CallParams) => Promise<string>;

export interface PipelineResult {
  message: string;
  strategy: "single" | "two-pass";
  truncated: boolean;
}

function callParams(config: GenerationConfig, messages: ChatMessage[]): CallParams {
  return {
    api: config.api,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: config.apiKey,
    messages,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    ollamaNumCtx: config.ollamaNumCtx,
    timeoutMs: config.requestTimeoutMs,
  };
}

/** First non-empty line of a model summary. */
function firstLine(text: string): string {
  return cleanMessage(text).split("\n")[0]?.trim() ?? "";
}

/**
 * Generate a commit message from a change set. Uses a single call for normal
 * diffs and an auto-fallback two-pass (summarize each file, then synthesize) when
 * the post-filter diff exceeds `largeDiffThreshold` tokens.
 */
export async function generateMessage(
  files: FileChange[],
  config: GenerationConfig,
  call: ModelCaller = callModel,
): Promise<PipelineResult> {
  const system = resolveSystemPrompt(config.systemPrompt);
  const ctx = buildContext(files, config.ignoreGlobs, config.maxDiffTokens);

  const fullBodyTokens = ctx.includedFiles.reduce(
    (sum, f) => sum + countTokens(f.diffBody),
    0,
  );
  const useTwoPass =
    ctx.includedFiles.length > 1 && fullBodyTokens > config.largeDiffThreshold;

  if (!useTwoPass) {
    const raw = await call(callParams(config, buildSingleMessages(ctx, system)));
    return { message: cleanMessage(raw), strategy: "single", truncated: ctx.truncated };
  }

  // Two-pass: summarize each included file, then synthesize one message.
  const perFileBudget = Math.max(800, Math.floor(config.maxDiffTokens / 2));
  const summaries = await Promise.all(
    ctx.includedFiles.map(async (file) => {
      const { body } = budgetFileDiff(file.diffBody, perFileBudget);
      const raw = await call(callParams(config, buildFileSummaryMessages(file, body)));
      return firstLine(raw) || `${file.status} ${file.path}`;
    }),
  );

  const raw = await call(
    callParams(config, buildSynthesisMessages(ctx.table, summaries, system)),
  );
  return { message: cleanMessage(raw), strategy: "two-pass", truncated: true };
}
