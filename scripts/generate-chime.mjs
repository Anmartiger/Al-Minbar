// §4.4 asks for "a short 'beep' alternative" alongside the muezzin recordings.
// A notification tone is not religious content, so unlike the adhan itself it can
// be synthesised rather than recorded. Written as maths and rendered to a WAV with
// stdlib only - no audio dependency, and the sound stays editable.
//
//   node scripts/generate-chime.mjs

import { writeFileSync } from 'node:fs';

const RATE = 44100;
const DURATION = 2.6;
const frames = Math.floor(RATE * DURATION);

// A rising three-note figure, each note a struck bell: a few inharmonic partials
// under an exponential decay. Frequencies are a simple major triad.
const NOTES = [
  { start: 0.00, freq: 587.33, gain: 0.60 }, // D5
  { start: 0.26, freq: 739.99, gain: 0.55 }, // F#5
  { start: 0.52, freq: 880.00, gain: 0.70 }, // A5
];
const PARTIALS = [
  { ratio: 1.0,  gain: 1.00, decay: 2.4 },
  { ratio: 2.0,  gain: 0.38, decay: 3.2 },
  { ratio: 3.01, gain: 0.16, decay: 4.6 },
  { ratio: 4.97, gain: 0.07, decay: 6.0 },
];

const samples = new Float64Array(frames);
for (const note of NOTES) {
  const offset = Math.floor(note.start * RATE);
  for (let i = offset; i < frames; i++) {
    const t = (i - offset) / RATE;
    let v = 0;
    for (const p of PARTIALS) {
      v += p.gain * Math.exp(-p.decay * t) * Math.sin(2 * Math.PI * note.freq * p.ratio * t);
    }
    // Short attack, so the onset is soft rather than a click.
    samples[i] += note.gain * v * Math.min(1, t / 0.006);
  }
}

// Normalise, then fade the tail to zero so the file cannot end on a discontinuity.
let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
const fade = Math.floor(0.08 * RATE);
const pcm = Buffer.alloc(frames * 2);
for (let i = 0; i < frames; i++) {
  let v = (samples[i] / peak) * 0.89;
  if (i > frames - fade) v *= (frames - i) / fade;
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);          // PCM chunk size
header.writeUInt16LE(1, 20);           // format: PCM
header.writeUInt16LE(1, 22);           // channels: mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);    // byte rate
header.writeUInt16LE(2, 32);           // block align
header.writeUInt16LE(16, 34);          // bits per sample
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const out = 'src-tauri/assets/audio/chime.wav';
writeFileSync(out, Buffer.concat([header, pcm]));
console.log(`${out}  ${(header.length + pcm.length) / 1024 | 0} KB  ${DURATION}s mono ${RATE}Hz`);
