// §6.3: "Every accent must pass 4.5:1 contrast against both surface colours;
// write a check that fails the build if one does not."
//
// A single accent cannot satisfy this: passing 4.5:1 on #FFFFFF caps luminance at
// 0.1833, passing it on #1C1C1B demands at least 0.2270. The window is empty. So each
// accent is a PAIR - a light-theme shade and a dark-theme shade of one hue - and each
// shade is checked against every surface its own theme paints behind it.
// See DESIGN_NOTES.md §4.1.

const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = h => { const [r, g, b] = hex(h); return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const MIN = 4.5;
const SURFACES = {
  light: { bg: '#F7F6F3', surface: '#FFFFFF', 'surface-2': '#FBFAF8' },
  dark:  { bg: '#131312', surface: '#1C1C1B', 'surface-2': '#242423' },
};
export const ACCENTS = {
  'green-teal': { light: '#0F6F62', dark: '#3AA294' },
  indigo:       { light: '#5B52C9', dark: '#8F88DD' },
  plum:         { light: '#A62BB2', dark: '#D072D9' },
  clay:         { light: '#A64A24', dark: '#D67C51' },
  gold:         { light: '#835D1E', dark: '#B98D3D' },
  slate:        { light: '#1F66AC', dark: '#5A97D2' },
};

let failed = 0;
for (const [name, pair] of Object.entries(ACCENTS)) {
  for (const [theme, accent] of Object.entries(pair)) {
    for (const [label, bg] of Object.entries(SURFACES[theme])) {
      const r = ratio(accent, bg);
      if (r < MIN) {
        console.error(`FAIL  ${name}/${theme} ${accent} on ${theme}.${label} ${bg} = ${r.toFixed(2)}:1 (need ${MIN})`);
        failed++;
      }
    }
  }
}
if (failed) {
  console.error(`\ncontrast check: ${failed} accent/surface pair(s) below ${MIN}:1`);
  process.exit(1);
}
console.log(`contrast check: all ${Object.keys(ACCENTS).length} accents x 2 themes x 3 surfaces >= ${MIN}:1`);
