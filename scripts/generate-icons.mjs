// The app mark.
//
// A minbar seen head-on: three ascending treads under the pointed arch of a
// mihrab, inside an eight-pointed star — the shape the printed mushaf uses around
// its numerals, and the same rosette the prayer list and ayah markers use. The
// three devices in the app therefore share one geometry rather than each having
// its own.
//
// Treads ascend right-to-left, matching the reading direction.
//
// Drawn as maths and rasterised here so it stays reproducible and editable, with
// no image dependency — stdlib zlib only.
//
//   node scripts/generate-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const INK = [0x0f, 0x6f, 0x62];   // --accent-green-teal, light shade
const FIELD = [0xff, 0xff, 0xff];

/* ------------------------------ PNG writing ----------------------------- */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 0);
  return Buffer.concat([head, data, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------- geometry ------------------------------ */
// Normalised coordinates, y downward, origin top-left.
//
// The mark is one shape, not three: an eight-pointed rosette filled in the accent,
// with the minbar knocked out of it. An arch as well was a device too many — at
// 32 px, where this spends most of its life, it collapsed into a blob.

/** Eight-pointed star: a square unioned with the same square rotated 45°. */
function inStar(x, y, r) {
  const dx = x - 0.5, dy = y - 0.5;
  return Math.max(Math.abs(dx), Math.abs(dy)) <= r * 0.78
      || Math.abs(dx) + Math.abs(dy) <= r * 1.06;
}

// Three treads ascending right-to-left, matching the reading direction, on a base.
const TREADS = [[0.32, 0.615], [0.42, 0.545], [0.52, 0.475]];
const RISER_END = 0.68;
const BASE = { x0: 0.28, x1: 0.72, y0: 0.685, y1: 0.745 };

function inMinbar(x, y) {
  if (x >= BASE.x0 && x <= BASE.x1 && y >= BASE.y0 && y <= BASE.y1) return true;
  const mirrored = 1 - x;
  return TREADS.some(([x0, top]) => mirrored >= x0 && mirrored <= RISER_END
                                 && y >= top && y <= BASE.y0 - 0.012);
}

const SS = 4;   // supersample

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let star = 0, cut = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (!inStar(u, v, 0.5)) continue;
          star++;
          if (inMinbar(u, v)) cut++;
        }
      }
      if (!star) continue;
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const knocked = cut / star;
      for (let c = 0; c < 3; c++) {
        buf[i + c] = Math.round(INK[c] * (1 - knocked) + FIELD[c] * knocked);
      }
      buf[i + 3] = Math.round((star / n) * 255);
    }
  }
  return buf;
}

mkdirSync('src-tauri/icons', { recursive: true });
for (const [name, size] of [['32x32', 32], ['128x128', 128], ['128x128@2x', 256], ['icon', 512]]) {
  writeFileSync(`src-tauri/icons/${name}.png`, png(size, render(size)));
  console.log(`icons/${name}.png  ${size}x${size}`);
}
