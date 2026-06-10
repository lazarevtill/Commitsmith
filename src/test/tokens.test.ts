// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { countTokens } from "../tokens";

describe("countTokens", () => {
  it("returns 0 for empty input", () => {
    expect(countTokens("")).toBe(0);
  });

  it("returns a positive count for non-empty text", () => {
    expect(countTokens("hello world")).toBeGreaterThan(0);
  });

  it("grows with text length", () => {
    const small = countTokens("a b c");
    const big = countTokens("a b c d e f g h i j k l m n o p");
    expect(big).toBeGreaterThan(small);
  });
});
