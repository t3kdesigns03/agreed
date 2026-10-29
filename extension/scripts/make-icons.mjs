// Generates the toolbar/store icons (PNG) with no image dependencies.
// Run once with `node scripts/make-icons.mjs`; the output is committed.
// Design: a dark blue rounded square with a white check mark.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "static", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [29, 59, 158];
const FG = [255, 255, 255];
const SUPERSAMPLE = 4;

function coverage(x, y) {
  // Coordinates are in a 0..1 unit square. Returns [bgAlpha, fgAlpha].
  const r = 0.2;
  const inset = 0.02;
  const cx = Math.min(Math.max(x, inset + r), 1 - inset - r);
  const cy = Math.min(Math.max(y, inset + r), 1 - inset - r);
  const inBg = (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= inset && x <= 1 - inset && y >= inset && y <= 1 - inset;
  if (!inBg) return [0, 0];
  const onCheck = distToSegment(x, y, 0.27, 0.52, 0.43, 0.68) < 0.075 || distToSegment(x, y, 0.43, 0.68, 0.74, 0.34) < 0.075;
  return [1, onCheck ? 1 : 0];
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const [b, f] = coverage((x + (sx + 0.5) / SUPERSAMPLE) / size, (y + (sy + 0.5) / SUPERSAMPLE) / size);
          bg += b;
          fg += f;
        }
      }
      const n = SUPERSAMPLE * SUPERSAMPLE;
      const alpha = bg / n;
      const mix = bg ? fg / bg : 0;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - mix) + FG[c] * mix);
      raw[o + 3] = Math.round(alpha * 255);
    }
  }
  return png(size, size, raw);
}

function png(width, height, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

for (const size of [16, 32, 48, 96, 128, 256, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), render(size));
}
console.log(`Icons written to ${outDir}`);
