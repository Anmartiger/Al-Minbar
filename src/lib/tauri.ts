// Tauri APIs throw synchronously when the app is opened in a plain browser
// (they dereference window.__TAURI_INTERNALS__). The design system is much faster
// to iterate on in a browser than through a Rust rebuild, so every Tauri call goes
// through here and degrades to a no-op instead of taking the app down.

import { getCurrentWindow, type Window } from '@tauri-apps/api/window';

export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

/** The current window, or null when running outside Tauri. */
export function appWindow(): Window | null {
  if (!isTauri()) return null;
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/** Runs a window action, ignoring both "not in Tauri" and a rejected promise. */
export function winCall(fn: (w: Window) => Promise<unknown>): void {
  const w = appWindow();
  if (!w) return;
  try {
    Promise.resolve(fn(w)).catch(() => {});
  } catch {
    /* non-fatal */
  }
}
