/* Pure prayer-time helpers, kept free of any Tauri import so they can be checked
   with `npm run check:logic` without a backend. See scripts/check-prayer-logic.mjs. */

export type PrayerId = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export type PrayerTime = {
  name: PrayerId;
  /** Unix seconds. */
  epoch: number;
  /** Local wall clock "HH:MM", already in the location's timezone. */
  clock: string;
  date: string;
  is_prayer: boolean;
};

export type HijriDate = { year: number; month: number; day: number };

export type DayTimes = {
  date: string;
  hijri: HijriDate;
  hijri_month_ar: string;
  hijri_month_en: string;
  times: PrayerTime[];
};

/* ------------------------------ digits (§5.3) ----------------------------- */

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** §5.3: "give the user a toggle between Arabic-Indic (٠١٢٣) and Western (0123)
 *  digits for verse numbers and clock times". */
export function toDigits(text: string | number, arabicIndic: boolean): string {
  const s = String(text);
  return arabicIndic ? s.replace(/[0-9]/g, d => ARABIC_INDIC[Number(d)]) : s;
}

/* --------------------------- countdown helpers ---------------------------- */

export type Segment = {
  /** The prayer being counted down to. */
  next: PrayerTime;
  /** The one before it, which the progress ring measures from. */
  previous: PrayerTime | null;
};

/** Flattens the three-day window into one ordered list. */
export function flatten(days: DayTimes[]): PrayerTime[] {
  return days.flatMap(d => d.times).sort((a, b) => a.epoch - b.epoch);
}

/**
 * The next prayer after `nowEpoch`, and the one before it.
 *
 * Sunrise is skipped as a countdown target - it is not a prayer, and counting down
 * to it would be misleading - but it still bounds the interval the ring measures,
 * because the Fajr window genuinely ends at sunrise.
 */
export function segmentAt(all: PrayerTime[], nowEpoch: number): Segment | null {
  const next = all.find(t => t.epoch > nowEpoch && t.is_prayer);
  if (!next) return null;
  const idx = all.indexOf(next);
  let previous: PrayerTime | null = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (all[i].epoch <= nowEpoch) { previous = all[i]; break; }
  }
  return { next, previous };
}

/** Elapsed fraction of the interval between previous and next, clamped to 0..1. */
export function progressOf(segment: Segment, nowEpoch: number): number {
  if (!segment.previous) return 0;
  const span = segment.next.epoch - segment.previous.epoch;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (nowEpoch - segment.previous.epoch) / span));
}

/** "2:14:08" — §7.1's live countdown, ticking every second. */
export function formatCountdown(seconds: number, arabicIndic: boolean): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return toDigits(`${h}:${pad(m)}:${pad(sec)}`, arabicIndic);
}

/** The prayer whose window is currently open, for the accent-tinted row (§7.1). */
export function currentPrayer(all: PrayerTime[], nowEpoch: number): PrayerTime | null {
  let current: PrayerTime | null = null;
  for (const t of all) {
    if (t.epoch <= nowEpoch && t.is_prayer) current = t;
    else if (t.epoch > nowEpoch) break;
  }
  return current;
}
