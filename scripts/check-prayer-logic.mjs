// One runnable check for the countdown maths in src/lib/prayer-math.ts.
// Bundled with the esbuild that already ships inside Vite - no test framework,
// no new dependency. Run with `npm run check:logic`.

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'al-minabr-'));
const out = join(dir, 'prayer-math.mjs');
await build({
  entryPoints: ['src/lib/prayer-math.ts'],
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
});
const m = await import(out);
rmSync(dir, { recursive: true, force: true });

const t = (name, epoch, clock, is_prayer = true) =>
  ({ name, epoch, clock, date: '2026-01-15', is_prayer });

// A day shaped like a real one: Fajr, sunrise, then the four remaining prayers.
const day = [
  t('fajr', 1000), t('sunrise', 2000, '', false), t('dhuhr', 5000),
  t('asr', 8000), t('maghrib', 11000), t('isha', 13000),
];

// --- segmentAt -------------------------------------------------------------
{
  const s = m.segmentAt(day, 500);
  assert.equal(s.next.name, 'fajr', 'before Fajr, Fajr is next');
  assert.equal(s.previous, null, 'nothing precedes the first entry');
}
{
  const s = m.segmentAt(day, 1500);
  assert.equal(s.next.name, 'dhuhr', 'sunrise is never a countdown target');
  assert.equal(s.previous.name, 'fajr', 'the ring measures from Fajr...');
}
{
  // ...but sunrise still bounds the interval once it has passed, because the
  // Fajr window genuinely ends there.
  const s = m.segmentAt(day, 2500);
  assert.equal(s.next.name, 'dhuhr');
  assert.equal(s.previous.name, 'sunrise', 'sunrise bounds the interval it ends');
}
assert.equal(m.segmentAt(day, 99999), null, 'past the last entry there is no segment');

// --- progressOf ------------------------------------------------------------
{
  const s = m.segmentAt(day, 5000 + 1500); // midway dhuhr -> asr (5000..8000)
  assert.equal(m.progressOf(s, 6500), 0.5, 'halfway through the interval');
  assert.equal(m.progressOf(s, 5000), 0, 'at the start');
  assert.equal(m.progressOf(s, 8000), 1, 'at the end');
  assert.equal(m.progressOf(s, 99999), 1, 'clamped above');
  assert.equal(m.progressOf(s, 0), 0, 'clamped below');
}
assert.equal(m.progressOf({ next: day[0], previous: null }, 0), 0, 'no previous means no progress');

// --- currentPrayer ---------------------------------------------------------
assert.equal(m.currentPrayer(day, 500), null, 'nothing is current before Fajr');
assert.equal(m.currentPrayer(day, 1500).name, 'fajr');
assert.equal(m.currentPrayer(day, 2500).name, 'fajr', 'sunrise does not become current');
assert.equal(m.currentPrayer(day, 13500).name, 'isha');

// --- formatCountdown -------------------------------------------------------
assert.equal(m.formatCountdown(8048, false), '2:14:08', "§7.1's worked example");
assert.equal(m.formatCountdown(0, false), '0:00:00');
assert.equal(m.formatCountdown(-5, false), '0:00:00', 'never counts past zero');
assert.equal(m.formatCountdown(3600, false), '1:00:00');
assert.equal(m.formatCountdown(8048, true), '٢:١٤:٠٨', 'Arabic-Indic digits (§5.3)');

// --- toDigits --------------------------------------------------------------
assert.equal(m.toDigits('19:42', true), '١٩:٤٢');
assert.equal(m.toDigits('19:42', false), '19:42');
assert.equal(m.toDigits(1447, true), '١٤٤٧');
assert.equal(m.toDigits('Fajr 4:38', true), 'Fajr ٤:٣٨', 'only digits are converted');

// --- flatten ---------------------------------------------------------------
{
  // Two days, two times each, deliberately out of order and interleaved.
  const mk = (date, a, b) => ({ date, hijri: {}, times: [t('isha', b), t('fajr', a)] });
  const flat = m.flatten([mk('day2', 300, 400), mk('day1', 100, 200)]);
  assert.deepEqual(flat.map(x => x.epoch), [100, 200, 300, 400],
    'flattens and sorts across the whole window, not per day');
}

console.log('prayer logic: all checks passed');
