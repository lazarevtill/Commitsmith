// SPDX-License-Identifier: Apache-2.0
// Bundles the TypeScript integration entry and runs it against live endpoints.
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve("scripts/.integration.bundle.mjs");

await build({
  entryPoints: ["scripts/_integration.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: out,
  logLevel: "warning",
});

try {
  await import(pathToFileURL(out).href);
} finally {
  try {
    rmSync(out);
  } catch {
    /* ignore */
  }
}
