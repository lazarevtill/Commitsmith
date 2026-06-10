// SPDX-License-Identifier: Apache-2.0
import type { ChatMessage } from "./prompt";

export interface CallParams {
  api: "openai" | "ollama";
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  ollamaNumCtx: number;
  timeoutMs: number;
}

/** Raised for non-2xx responses, carrying the HTTP status for tailored handling. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The assistant's final content plus any separated reasoning ("thinking"). */
export interface ParsedMessage {
  content: string;
  thinking: string;
}

/** The fields we read from a chat response message, across backends. */
interface ResponseMessage {
  content?: unknown;
  text?: unknown;
  thinking?: unknown; // Ollama reasoning field
  reasoning?: unknown; // some OpenAI-compatible servers
  reasoning_content?: unknown; // vLLM / others
}

/** The subset of OpenAI/Ollama response shapes we care about. */
interface ChatResponse {
  choices?: { message?: ResponseMessage; text?: unknown }[];
  message?: ResponseMessage;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Pull final content and reasoning from either OpenAI or Ollama-native shapes. */
export function extractMessage(json: unknown): ParsedMessage {
  const j = (json ?? {}) as ChatResponse;
  const msg: ResponseMessage = j.choices?.[0]?.message ?? j.message ?? {};
  const content =
    asString(msg.content) || // OpenAI /chat/completions and Ollama /api/chat
    asString(j.choices?.[0]?.text); // legacy completions
  const thinking =
    asString(msg.thinking) || asString(msg.reasoning) || asString(msg.reasoning_content);
  return { content, thinking };
}

/** Backwards-compatible accessor that throws when there is no usable content. */
export function parseModelResponse(json: unknown): string {
  const { content } = extractMessage(json);
  if (content.trim().length === 0) {
    throw new Error("Model returned an empty response.");
  }
  return content;
}

interface RequestPlan {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

interface RequestOverrides {
  /** Override the output token budget (num_predict / max_tokens). */
  numPredict?: number;
}

/** Build the endpoint URL, headers, and body for the configured backend. */
export function buildRequest(params: CallParams, overrides: RequestOverrides = {}): RequestPlan {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }
  const predict = overrides.numPredict ?? params.maxTokens;
  if (params.api === "ollama") {
    return {
      url: `${trimSlash(params.baseUrl)}/api/chat`,
      headers,
      body: {
        model: params.model,
        messages: params.messages,
        stream: false,
        // A commit message never needs chain-of-thought; disable it so reasoning
        // models (qwen3, gemma*-thinking, deepseek-r1, …) emit the answer directly
        // instead of spending the token budget thinking.
        think: false,
        options: {
          temperature: params.temperature,
          num_ctx: params.ollamaNumCtx,
          num_predict: predict,
        },
      },
    };
  }
  return {
    url: `${trimSlash(params.baseUrl)}/chat/completions`,
    headers,
    body: {
      model: params.model,
      messages: params.messages,
      stream: false,
      temperature: params.temperature,
      max_tokens: predict,
    },
  };
}

/** POST a request plan and return the parsed JSON. Throws on HTTP/network/timeout. */
async function postJson(plan: RequestPlan, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let res: Response;
  try {
    res = await fetch(plan.url, {
      method: "POST",
      headers: plan.headers,
      body: JSON.stringify(plan.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. ` +
          `For local models this may be a cold start — try again.`,
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error contacting ${plan.url}: ${detail}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`, res.status);
  }
  const data: unknown = await res.json();
  return data;
}

/**
 * Call the model and return its raw text content. Throws ProviderError on HTTP
 * failure. Handles reasoning models: if the response has no content but does have
 * "thinking" (the model spent the whole budget reasoning, e.g. gpt-oss which
 * ignores `think:false`), it retries once with a generous token budget so the
 * final answer has room to be emitted.
 */
export async function callModel(params: CallParams): Promise<string> {
  const first = extractMessage(await postJson(buildRequest(params), params.timeoutMs));
  let content = first.content;
  const thinking = first.thinking;

  if (content.trim().length === 0 && thinking.trim().length > 0) {
    const headroom = Math.max(2048, params.maxTokens * 8);
    const retry = await postJson(buildRequest(params, { numPredict: headroom }), params.timeoutMs);
    content = extractMessage(retry).content;
  }

  if (content.trim().length === 0) {
    throw new Error(
      "Model returned an empty response. If this is a reasoning model, try a " +
        "non-reasoning model or raise commitsmith.maxTokens.",
    );
  }
  return content;
}
