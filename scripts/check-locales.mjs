// §9 puts every UI string in src/locales/{ar,en}.json. A key present in one and
// missing from the other shows up as a raw key on screen, and a placeholder that
// differs between them silently drops a value — neither fails loudly at runtime,
// so it fails here instead. Runs as part of `npm run build`.

import { readFileSync } from 'node:fs';

const load = l => JSON.parse(readFileSync(`src/locales/${l}.json`, 'utf8'));
const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') flat(v, `${p}${k}.`, out);
    else out[`${p}${k}`] = String(v);
  }
  return out;
};
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

const en = flat(load('en'));
const ar = flat(load('ar'));
const problems = [];

for (const k of Object.keys(en)) if (!(k in ar)) problems.push(`missing from ar: ${k}`);
for (const k of Object.keys(ar)) if (!(k in en)) problems.push(`missing from en: ${k}`);
for (const k of Object.keys(en)) {
  if (!(k in ar)) continue;
  if (placeholders(en[k]) !== placeholders(ar[k])) {
    problems.push(`placeholders differ at ${k}: en {${placeholders(en[k])}} vs ar {${placeholders(ar[k])}}`);
  }
  if (!en[k].trim() || !ar[k].trim()) problems.push(`empty string at ${k}`);
}

if (problems.length) {
  console.error(`locale check: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`locale check: ${Object.keys(en).length} keys, ar and en agree`);
