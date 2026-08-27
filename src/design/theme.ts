export type ThemeChoice = 'light' | 'dark' | 'system';
export type Accent = 'green-teal' | 'indigo' | 'plum' | 'clay' | 'gold' | 'slate';

export const ACCENTS: Accent[] = ['green-teal', 'indigo', 'plum', 'clay', 'gold', 'slate'];

// ponytail: localStorage until Phase 6 moves every setting into tauri-plugin-store
// (§3) so they land in the XDG config dir. Theme only, and it round-trips a restart.
const KEY = 'al-minabr.appearance';

type Appearance = { theme: ThemeChoice; accent: Accent };
const DEFAULTS: Appearance = { theme: 'system', accent: 'green-teal' };

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
        ? parsed.theme : DEFAULTS.theme,
      accent: ACCENTS.includes(parsed.accent as Accent) ? (parsed.accent as Accent) : DEFAULTS.accent,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveAppearance(a: Appearance) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode, non-fatal */ }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (darkQuery().matches ? 'dark' : 'light') : choice;
}

export function applyAppearance({ theme, accent }: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(theme);
  root.dataset.accent = accent;
}

/** Re-resolves on OS theme change while the choice is "system". */
export function watchSystemTheme(onChange: () => void): () => void {
  const q = darkQuery();
  q.addEventListener('change', onChange);
  return () => q.removeEventListener('change', onChange);
}
