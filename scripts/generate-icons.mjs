// The app mark: a minbar - a staircase of three treads on a base, the pulpit the
// app is named after. Drawn as maths and rasterised here so it stays reproducible
// and editable; run `node scripts/generate-icons.mjs` after changing it.
// No image dependency - stdlib zlib only.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const ACCENT = [0x0f, 0x6f, 0x62]; // --accent-green-teal, light shade
const MARK = [0xff, 0xff, 0xff];

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
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Normalised shape, y downward. Rounded-square field with a minbar cut into it.
const inRoundRect = (x, y, r) => {
  const dx = Math.max(r - x, 0, x - (1 - r));
  const dy = Math.max(r - y, 0, y - (1 - r));
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 && dx * dx + dy * dy <= r * r;
};
const TREADS = [[0.22, 0.66], [0.40, 0.52], [0.58, 0.38]]; // [xStart, topY]
const inMinbar = (x, y) => {
  if (x >= 0.16 && x <= 0.84 && y >= 0.78 && y <= 0.845) return true; // base
  for (const [x0, top] of TREADS) if (1 - x >= x0 && 1 - x <= 0.80 && y >= top && y <= 0.78) return true;
  return false;
};

const SS = 4; // supersample for antialiasing
function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let field = 0, mark = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
      if (inRoundRect(u, v, 0.22)) { field++; if (inMinbar(u, v)) mark++; }
    }
    const n = SS * SS, i = (y * size + x) * 4;
    if (!field) continue;
    const a = field / n, m = mark / field;
    for (let c = 0; c < 3; c++) buf[i + c] = Math.round(ACCENT[c] * (1 - m) + MARK[c] * m);
    buf[i + 3] = Math.round(a * 255);
  }
  return buf;
}

mkdirSync('src-tauri/icons', { recursive: true });
for (const [name, size] of [['32x32', 32], ['128x128', 128], ['128x128@2x', 256], ['icon', 512]]) {
  writeFileSync(`src-tauri/icons/${name}.png`, png(size, render(size)));
  console.log(`icons/${name}.png  ${size}x${size}`);
}
