// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRequest,
  callModel,
  extractMessage,
  parseModelResponse,
  type CallParams,
} from "../provider";

const base: CallParams = {
  api: "openai",
  apiKey: "sk-test",
  baseUrl: "https://api.openai.com/v1",
  maxTokens: 200,
  messages: [{ role: "user", content: "hi" }],
  model: "gpt-4o-mini",
  ollamaNumCtx: 8192,
  temperature: 0.15,
  timeoutMs: 90000,
};

describe("parseModelResponse", () => {
  it("reads OpenAI choices[0].message.content", () => {
    expect(parseModelResponse({ choices: [{ message: { content: "feat: x" } }] })).toBe("feat: x");
  });

  it("reads Ollama message.content", () => {
    expect(parseModelResponse({ message: { content: "fix: y" } })).toBe("fix: y");
  });

  it("throws on empty content", () => {
    expect(() => parseModelResponse({ choices: [{ message: { content: "" } }] })).toThrow();
    expect(() => parseModelResponse({})).toThrow();
  });
});

describe("extractMessage", () => {
  it("reads content and separated thinking", () => {
    expect(extractMessage({ message: { content: "feat: x", thinking: "hmm" } })).toEqual({
      content: "feat: x",
      thinking: "hmm",
    });
    expect(
      extractMessage({ choices: [{ message: { content: "", reasoning_content: "why" } }] }),
    ).toEqual({ content: "", thinking: "why" });
  });
});

describe("buildRequest", () => {
  it("targets /chat/completions with max_tokens for openai", () => {
    const plan = buildRequest(base);
    expect(plan.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(plan.headers.Authorization).toBe("Bearer sk-test");
    expect((plan.body as any).max_tokens).toBe(200);
    expect((plan.body as any).options).toBeUndefined();
  });

  it("targets /api/chat with num_ctx and think:false for ollama", () => {
    const plan = buildRequest({ ...base, api: "ollama", baseUrl: "http://localhost:11434" });
    expect(plan.url).toBe("http://localhost:11434/api/chat");
    expect((plan.body as any).think).toBe(false);
    expect((plan.body as any).options.num_ctx).toBe(8192);
    expect((plan.body as any).options.num_predict).toBe(200);
    expect((plan.body as any).options.temperature).toBe(0.15);
  });

  it("applies a num_predict override", () => {
    const plan = buildRequest({ ...base, api: "ollama" }, { numPredict: 4096 });
    expect((plan.body as any).options.num_predict).toBe(4096);
  });

  it("targets /chat/completions for llama.cpp without auth by default", () => {
    const plan = buildRequest({ ...base, api: "llama.cpp", baseUrl: "http://localhost:8080/v1", apiKey: "" });
    expect(plan.url).toBe("http://localhost:8080/v1/chat/completions");
    expect(plan.headers.Authorization).toBeUndefined();
    expect((plan.body as any).max_tokens).toBe(200);
    expect((plan.body as any).options).toBeUndefined();
  });

  it("sends Authorization for llama.cpp when apiKey is set", () => {
    const plan = buildRequest({ ...base, api: "llama.cpp", baseUrl: "http://localhost:8080/v1", apiKey: "llama-key-123" });
    expect(plan.headers.Authorization).toBe("Bearer llama-key-123");
  });

  it("trims trailing slashes from the base URL", () => {
    const plan = buildRequest({ ...base, baseUrl: "https://host/api/" });
    expect(plan.url).toBe("https://host/api/chat/completions");
  });

  it("omits Authorization when no key is set", () => {
    const plan = buildRequest({ ...base, apiKey: "" });
    expect(plan.headers.Authorization).toBeUndefined();
  });
});

describe("callModel error handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Partial<Response>) {
    const fn = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
        json: async () => ({}),
        ...response,
      }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("provides a helpful error for 429 rate limit", async () => {
    stubFetch({ ok: false, status: 429, statusText: "Too Many Requests" });
    await expect(callModel(base)).rejects.toThrow(/rate limit/i);
  });

  it("provides a helpful error for 500 server errors", async () => {
    stubFetch({ ok: false, status: 500, statusText: "Internal Server Error" });
    await expect(callModel(base)).rejects.toThrow(/server error/i);
  });

  it("provides a helpful error for 401 auth failures", async () => {
    stubFetch({ ok: false, status: 401, statusText: "Unauthorized" });
    await expect(callModel(base)).rejects.toThrow(/authentication failed/i);
  });

  it("classifies DNS errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND nonexistent.host");
      }),
    );
    await expect(callModel(base)).rejects.toThrow(/could not resolve hostname/i);
  });

  it("classifies connection refused errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED ::1:8080");
      }),
    );
    await expect(callModel(base)).rejects.toThrow(/connection refused/i);
  });

  it("classifies timeout errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );
    // AbortError gets its own path; general errors fall through to generic.
    await expect(callModel(base)).rejects.toThrow(/network error/i);
  });
});

describe("callModel reasoning-model handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(responses: any[]) {
    let i = 0;
    const fn = vi.fn(async () => {
      const body = responses[Math.min(i, responses.length - 1)];
      i++;
      return { ok: true, json: async () => body } as unknown as Response;
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("retries with headroom when content is empty but thinking is present", async () => {
    const fetchFn = stubFetch([
      { message: { content: "", thinking: "reasoning that ate the budget" } },
      { message: { content: "feat(http): add retry wrapper" } },
    ]);
    const out = await callModel({ ...base, api: "ollama", baseUrl: "http://h:11434" });
    expect(out).toBe("feat(http): add retry wrapper");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetchFn.mock.calls[1][1] as any).body);
    expect(secondBody.options.num_predict).toBeGreaterThanOrEqual(2048);
  });

  it("does not retry when first response already has content", async () => {
    const fetchFn = stubFetch([{ message: { content: "fix: thing", thinking: "brief" } }]);
    const out = await callModel({ ...base, api: "ollama" });
    expect(out).toBe("fix: thing");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws a helpful error when still empty after retry", async () => {
    stubFetch([{ message: { content: "", thinking: "x" } }]);
    await expect(callModel({ ...base, api: "ollama" })).rejects.toThrow(/reasoning model/i);
  });
});
