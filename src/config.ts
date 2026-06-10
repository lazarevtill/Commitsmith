// SPDX-License-Identifier: Apache-2.0
import * as vscode from "vscode";
import type { GenerationConfig } from "./types";
import { isLocalUrl, needsApiKey } from "./endpoint";

/** Key under which the API key is stored in VS Code SecretStorage. */
export const API_KEY_SECRET = "commitsmith.apiKey";

export { isLocalUrl, needsApiKey };

/** Read settings and the stored secret into a resolved GenerationConfig. */
export async function resolveConfig(
  context: vscode.ExtensionContext,
): Promise<GenerationConfig> {
  const cfg = vscode.workspace.getConfiguration("commitsmith");
  const api = cfg.get<"openai" | "ollama">("api", "openai");
  const baseUrl = cfg.get<string>("baseUrl", "https://api.openai.com/v1");

  let apiKey = (await context.secrets.get(API_KEY_SECRET)) ?? "";
  // Local endpoints (Ollama, LM Studio) ignore the key but some stacks require a
  // non-empty one — supply a harmless dummy so a keyless local call is never blocked.
  if (!apiKey && !needsApiKey(api, baseUrl)) {
    apiKey = "ollama";
  }

  return {
    api,
    baseUrl,
    model: cfg.get<string>("model", "gpt-4o-mini"),
    apiKey,
    temperature: cfg.get<number>("temperature", 0.15),
    maxDiffTokens: cfg.get<number>("maxDiffTokens", 3500),
    largeDiffThreshold: cfg.get<number>("largeDiffThreshold", 7000),
    maxTokens: cfg.get<number>("maxTokens", 200),
    ollamaNumCtx: cfg.get<number>("ollamaNumCtx", 8192),
    requestTimeoutMs: cfg.get<number>("requestTimeoutMs", 90000),
    systemPrompt: cfg.get<string>("systemPrompt", ""),
    ignoreGlobs: cfg.get<string[]>("ignoreGlobs", []),
  };
}
