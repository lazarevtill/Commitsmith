// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { isLocalUrl, needsApiKey } from "../endpoint";

describe("isLocalUrl", () => {
  it("recognizes localhost and private-network hosts", () => {
    expect(isLocalUrl("http://localhost:11434")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isLocalUrl("http://192.168.1.10:11434")).toBe(true);
    expect(isLocalUrl("http://10.0.0.5:11434")).toBe(true);
    expect(isLocalUrl("http://172.16.0.9:11434")).toBe(true);
  });

  it("treats public hosts as non-local", () => {
    expect(isLocalUrl("https://api.openai.com/v1")).toBe(false);
    expect(isLocalUrl("https://llm.example.com/api")).toBe(false);
  });
});

describe("needsApiKey", () => {
  it("never requires a key for Ollama, regardless of host", () => {
    expect(needsApiKey("ollama", "http://localhost:11434")).toBe(false);
    expect(needsApiKey("ollama", "http://192.168.1.10:11434")).toBe(false);
    expect(needsApiKey("ollama", "https://ollama.example.com")).toBe(false);
  });

  it("does not require a key for a local OpenAI-compatible endpoint", () => {
    expect(needsApiKey("openai", "http://localhost:1234/v1")).toBe(false);
    expect(needsApiKey("openai", "http://192.168.1.10:11434/v1")).toBe(false);
  });

  it("requires a key only for a remote OpenAI-compatible endpoint", () => {
    expect(needsApiKey("openai", "https://api.openai.com/v1")).toBe(true);
    expect(needsApiKey("openai", "https://llm.example.com/api")).toBe(true);
  });
});
