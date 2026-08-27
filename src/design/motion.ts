// §6.5 motion constants. Durations and the easing curve live in tokens.css;
// these are the values Framer Motion needs in JS.

/** Anything a finger would "grab" - sheets, the mushaf page turn, drawers. */
export const SPRING = { type: 'spring', stiffness: 260, damping: 30 } as const;

/** One easing curve for almost everything. */
export const EASE = [0.32, 0.72, 0, 1] as const;

export const DURATION = { micro: 0.15, view: 0.3, sheet: 0.4 } as const;

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
