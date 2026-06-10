// SPDX-License-Identifier: Apache-2.0
import { getEncoding, type Tiktoken } from "js-tiktoken";

let encoder: Tiktoken | null = null;
let encoderTried = false;

function getEncoder(): Tiktoken | null {
  if (!encoderTried) {
    encoderTried = true;
    try {
      // cl100k_base is a good general-purpose tokenizer; for non-OpenAI models
      // this is an approximation, but far closer to reality than counting bytes.
      encoder = getEncoding("cl100k_base");
    } catch {
      encoder = null;
    }
  }
  return encoder;
}

/**
 * Count tokens in a string. Uses tiktoken when available, otherwise falls back
 * to a character-based heuristic (~4 chars/token) so token accounting never
 * throws and tests stay deterministic.
 */
export function countTokens(text: string): number {
  if (!text) {
    return 0;
  }
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      // fall through to heuristic
    }
  }
  return Math.ceil(text.length / 4);
}
