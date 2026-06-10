// SPDX-License-Identifier: Apache-2.0
// Pure endpoint helpers — no vscode/network imports, so they are unit-testable.

/** Heuristic: is this base URL pointing at a local / private-network host? */
export function isLocalUrl(url: string): boolean {
  return /(localhost|127\.0\.0\.1|::1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
    url,
  );
}

/**
 * Whether a request actually needs an API key. Ollama never does — it's a local
 * runtime with no auth. Neither does any local/private-network endpoint (LM Studio,
 * a self-hosted box). Only a remote OpenAI-compatible endpoint requires one.
 */
export function needsApiKey(api: "openai" | "ollama", baseUrl: string): boolean {
  return api === "openai" && !isLocalUrl(baseUrl);
}
