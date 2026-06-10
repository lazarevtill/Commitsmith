// SPDX-License-Identifier: Apache-2.0
// Generates the marketplace icon (icon.png) with no third-party dependencies.
// A four-point "forge spark" on the brand background. Run: node scripts/generate-icon.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZE = 256;
const RADIUS = 40; // rounded-corner radius
const center = (SIZE - 1) / 2;

// Brand palette.
const bg = [30, 30, 46]; // #1e1e2e
const sparkInner = [255, 233, 170]; // warm highlight
const sparkOuter = [245, 158, 66]; // forge gold (#f59e42)

/** Distance from the nearest edge for rounded-corner alpha. */
function insideRounded(x, y) {
  const dx = Math.max(RADIUS - x, x - (SIZE - 1 - RADIUS), 0);
  const dy = Math.max(RADIUS - y, y - (SIZE - 1 - RADIUS), 0);
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

/** A 0..1 intensity for the four-point spark (two crossed thin diamonds). */
function sparkIntensity(x, y) {
  const dx = Math.abs(x - center);
  const dy = Math.abs(y - center);
  const vertical = dx / 22 + dy / 116; // tall thin spike
  const horizontal = dx / 116 + dy / 22; // wide thin spike
  const v = Math.min(vertical, horizontal);
  if (v > 1) return 0;
  return 1 - v; // brightest at the center, fading to the tips
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // PNG filter: none
  for (let x = 0; x < SIZE; x++) {
    const alpha = insideRounded(x, y) ? 255 : 0;
    const s = sparkIntensity(x, y);
    let r = bg[0];
    let g = bg[1];
    let b = bg[2];
    if (s > 0) {
      // Blend outer->inner spark colour over the background by intensity.
      const sr = lerp(sparkOuter[0], sparkInner[0], s);
      const sg = lerp(sparkOuter[1], sparkInner[1], s);
      const sb = lerp(sparkOuter[2], sparkInner[2], s);
      const t = Math.min(1, s * 1.4);
      r = lerp(bg[0], sr, t);
      g = lerp(bg[1], sg, t);
      b = lerp(bg[2], sb, t);
    }
    raw[p++] = r;
    raw[p++] = g;
    raw[p++] = b;
    raw[p++] = alpha;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// CRC-32 (PNG spec).
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "icon.png");
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes, ${SIZE}x${SIZE})`);
