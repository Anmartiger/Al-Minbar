import { createContext, useContext } from 'react';
import en from '../locales/en.json';
import ar from '../locales/ar.json';

/* §9: "Full Arabic and English interface, switchable at runtime with no restart —
   including a complete LTR↔RTL layout flip. Strings live in
   src/locales/{ar,en}.json; no literal UI string in a component." */

export type Language = 'ar' | 'en';
export const LANGUAGES: Language[] = ['ar', 'en'];

const BUNDLES = { en, ar } as const;

/** Dotted path into the locale bundle, e.g. "home.timetable". */
type Bundle = Record<string, Record<string, string>>;

function lookup(lang: Language, key: string): string | undefined {
  const [group, name] = key.split('.');
  return (BUNDLES[lang] as unknown as Bundle)[group]?.[name];
}

/**
 * Translate. Missing keys return the key itself rather than an empty string, so a
 * gap is visible on screen instead of silently blank — and `npm run build` fails
 * on any key that is not in both bundles, so it should never get this far.
 */
export function translate(
  lang: Language, key: string, values?: Record<string, string | number>,
): string {
  const raw = lookup(lang, key) ?? lookup('en', key) ?? key;
  if (!values) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name) =>
    name in values ? String(values[name]) : whole);
}

export type Translator = (key: string, values?: Record<string, string | number>) => string;

export const LanguageContext = createContext<{ lang: Language; t: Translator }>({
  lang: 'en',
  t: (key, values) => translate('en', key, values),
});

export const useT = () => useContext(LanguageContext);

/** §9: "Arabic is the default when the system locale starts with `ar`." */
export function defaultLanguage(): Language {
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return nav.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/**
 * §9's complete layout flip. Applied to the document rather than to a wrapper so
 * that logical properties, form controls and scrollbars all follow — a `dir` on a
 * div leaves the window chrome behind.
 */
export function applyLanguage(lang: Language) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
