import { BUNDLED_FAMILIES } from './fonts.generated';

/* §5.2: font family, size, line-height and letter-spacing chosen independently
   for three contexts, applied instantly with no restart. */

export type TypographyContext = 'quran' | 'athkar' | 'interface';
export const TYPOGRAPHY_CONTEXTS: TypographyContext[] = ['quran', 'athkar', 'interface'];

export type FaceSettings = {
  family: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
};
export type Typography = Record<TypographyContext, FaceSettings>;

export const DEFAULT_TYPOGRAPHY: Typography = {
  // §5.3: the Quran line-height floor is 2.0 — Amiri Quran's own line box is
  // 2.449em and tashkeel clips below it (DESIGN_NOTES.md §2.2).
  quran: { family: 'Amiri Quran', size: 30, lineHeight: 2.1, letterSpacing: 0 },
  athkar: { family: 'Amiri Quran', size: 24, lineHeight: 2.1, letterSpacing: 0 },
  interface: { family: 'Amiri', size: 22, lineHeight: 1.8, letterSpacing: 0 },
};

const KEY = 'al-minabr.typography';

/** §5.3 disables letter-spacing for any Arabic face: it breaks the joins. */
export function isArabicFamily(family: string): boolean {
  const bundled = BUNDLED_FAMILIES.find(f => f.name === family);
  if (bundled) return bundled.arabic;
  // A system face reached us from `fc-list :lang=ar`, so it covers Arabic by
  // definition. Anything unrecognised is treated as Arabic, because wrongly
  // *allowing* letter-spacing on Arabic is the damaging direction.
  return true;
}

export function loadTypography(): Typography {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_TYPOGRAPHY;
    const parsed = JSON.parse(raw) as Partial<Typography>;
    const merge = (c: TypographyContext): FaceSettings => ({
      ...DEFAULT_TYPOGRAPHY[c], ...(parsed[c] ?? {}),
    });
    return { quran: merge('quran'), athkar: merge('athkar'), interface: merge('interface') };
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

export function saveTypography(t: Typography) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* non-fatal */ }
}

/** §5.2: "Changes apply instantly across the app, with no restart." */
export function applyTypography(t: Typography) {
  const root = document.documentElement.style;
  root.setProperty('--font-quran', `'${t.quran.family}', serif`);
  root.setProperty('--quran-size', `${t.quran.size}px`);
  root.setProperty('--quran-line-height', String(Math.max(2, t.quran.lineHeight)));
  root.setProperty('--font-athkar', `'${t.athkar.family}', serif`);
  root.setProperty('--athkar-size', `${t.athkar.size}px`);
  root.setProperty('--athkar-line-height', String(t.athkar.lineHeight));
  root.setProperty('--font-arabic', `'${t.interface.family}', serif`);
  root.setProperty('--lh-arabic-ui', String(t.interface.lineHeight));
}
