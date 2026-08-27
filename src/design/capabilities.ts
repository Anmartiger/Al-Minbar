// §6.4: "backdrop-filter support is inconsistent across WebKitGTK versions on
// Ubuntu - likely fine on 26.04, likely not on 22.04. Feature-detect it at startup
// with CSS.supports('backdrop-filter', 'blur(1px)'); when unsupported, fall back to
// an opaque surface colour at the same lightness."
//
// Detected once and stamped on <html> so the fallback is pure CSS - no component
// branches on it, and the layout is identical either way.

export function supportsBackdropFilter(): boolean {
  if (typeof CSS === 'undefined' || !CSS.supports) return false;
  return (
    CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
  );
}

export function applyCapabilities(): void {
  document.documentElement.dataset.backdrop = supportsBackdropFilter() ? 'yes' : 'no';
}

/** Forces the opaque path on, for testing the §6.4 fallback deliberately. */
export function setBackdropOverride(enabled: boolean | null): void {
  document.documentElement.dataset.backdrop =
    enabled === null ? (supportsBackdropFilter() ? 'yes' : 'no') : enabled ? 'yes' : 'no';
}
