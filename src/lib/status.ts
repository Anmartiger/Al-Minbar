import { invoke } from '@tauri-apps/api/core';
import type { DayTimes, PrayerId, PrayerTime } from './prayer-math';

/** Mirrors StatusView in src-tauri/src/lib.rs. One source of truth for "what
 *  happens next": the Rust scheduler owns it, the windows only render it. */
export type StatusView = {
  next: PrayerTime | null;
  previous: PrayerTime | null;
  secondsRemaining: number;
  imminent: boolean;
  today: DayTimes | null;
  /** §8.7's quiet line: [prayer id, epoch]. Never rings. */
  missed: [PrayerId, number] | null;
  adhanPlaying: boolean;
  /** §8.2: false when no StatusNotifierItem host is registered. */
  trayAvailable: boolean;
};

export const getStatus = () => invoke<StatusView | null>('status');
export const stopAdhan = () => invoke<void>('stop_adhan');
export const openMainWindow = () => invoke<void>('open_main_window');
export const closeMiniWindow = () => invoke<void>('close_mini_window');
export const playAdhan = (sound?: string) => invoke<void>('play_adhan', { sound });
