import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

export * from './prayer-math';
import type { PrayerId, DayTimes } from './prayer-math';
export type { PrayerId, PrayerTime, DayTimes, HijriDate } from './prayer-math';

/* Mirrors src-tauri/src/prayer/mod.rs. */

export type Location = {
  latitude: number;
  longitude: number;
  timezone: string;
  city: string;
  country: string;
};

export type MethodId =
  | 'MuslimWorldLeague' | 'Egyptian' | 'UmmAlQura' | 'Karachi' | 'Isna' | 'Tehran'
  | 'Jafari' | 'Kuwait' | 'Qatar' | 'Singapore' | 'Turkey' | 'MoonsightingCommittee'
  | 'Dubai';

export type Settings = {
  method: { kind: MethodId } | { kind: 'Custom'; fajr_angle: number; isha_angle: number };
  madhab: 'shafi' | 'hanafi';
  high_latitude_rule: 'middle_of_the_night' | 'seventh_of_the_night' | 'twilight_angle';
  offsets: Record<PrayerId, number>;
  hijri_adjustment: number;
};

export const DEFAULT_SETTINGS: Settings = {
  method: { kind: 'MuslimWorldLeague' },
  madhab: 'shafi',
  high_latitude_rule: 'middle_of_the_night',
  offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  hijri_adjustment: 0,
};

/** §7.1 lists the five prayers plus sunrise, with Latin transliteration beneath. */
export const PRAYER_LABELS: Record<PrayerId, { ar: string; latin: string }> = {
  fajr: { ar: 'الفجر', latin: 'Fajr' },
  sunrise: { ar: 'الشروق', latin: 'Sunrise' },
  dhuhr: { ar: 'الظهر', latin: 'Dhuhr' },
  asr: { ar: 'العصر', latin: 'Asr' },
  maghrib: { ar: 'المغرب', latin: 'Maghrib' },
  isha: { ar: 'العشاء', latin: 'Isha' },
};

export type Qibla = { bearing: number; distanceKm: number };

export const defaultLocation = () => invoke<Location>('default_location');
export const prayerWindow = (location: Location, settings: Settings) =>
  invoke<DayTimes[]>('prayer_window', { location, settings });
export const searchCities = (query: string, limit = 20) =>
  invoke<Array<Location & { name: string; name_ar: string }>>('search_cities', { query, limit });
export const qibla = (latitude: number, longitude: number) =>
  invoke<Qibla>('qibla', { latitude, longitude });

export const backendAvailable = isTauri;

