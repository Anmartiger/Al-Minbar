import { invoke, convertFileSrc } from '@tauri-apps/api/core';

/* Recitation download and playback (Claude.md §4.2, §7.2).

   The audio is fetched here rather than in Rust: §3 lists no HTTP crate, §12.5
   says to ask before adding one, and `fetch` already streams, which is what the
   download manager needs to show real progress. Bytes are handed to Rust to write
   into the XDG cache. */

export type Reciter = { id: string; name: string; directory: string };
export type SurahAudio = {
  reciter: string; surah: number; cached: number; total: number; bytes: number;
};
export type CacheStats = { bytes: number; files: number };

export const listReciters = () => invoke<Reciter[]>('reciters');
export const surahAudio = (reciter: string, surah: number, ayahCount: number) =>
  invoke<SurahAudio>('recitation_status', { reciter, surah, ayahCount });
export const cacheStats = () => invoke<CacheStats>('audio_cache_stats');
export const clearCache = () => invoke<void>('clear_audio_cache');

/** Playable URL for a cached ayah, or null when it is not downloaded. */
export async function ayahSource(reciter: string, surah: number, ayah: number) {
  try {
    return convertFileSrc(await invoke<string>('recitation_path', { reciter, surah, ayah }));
  } catch {
    return null;
  }
}

const pad3 = (n: number) => String(n).padStart(3, '0');

export const everyAyahUrl = (dir: string, surah: number, ayah: number) =>
  `https://everyayah.com/data/${dir}/${pad3(surah)}${pad3(ayah)}.mp3`;

export type DownloadProgress = {
  done: number; total: number; bytes: number; failed: number;
};

/**
 * Downloads a whole surah, one ayah at a time, reporting after each.
 *
 * Sequential on purpose: this is someone else's free bandwidth, and §4.2 wants a
 * progress display, which a burst of parallel requests would make meaningless.
 * Already-cached ayahs are skipped, so an interrupted download resumes.
 */
export async function downloadSurah(
  reciter: Reciter,
  surah: number,
  ayahCount: number,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadProgress> {
  const progress: DownloadProgress = { done: 0, total: ayahCount, bytes: 0, failed: 0 };

  for (let ayah = 1; ayah <= ayahCount; ayah++) {
    if (signal?.aborted) break;

    if (await ayahSource(reciter.id, surah, ayah)) {
      progress.done++;
      onProgress({ ...progress });
      continue;
    }

    try {
      const res = await fetch(everyAyahUrl(reciter.directory, surah, ayah), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!buf.length) throw new Error('empty response');
      await invoke('store_recitation', {
        reciter: reciter.id, surah, ayah, bytes: Array.from(buf),
      });
      progress.bytes += buf.length;
      progress.done++;
    } catch (e) {
      if (signal?.aborted) break;
      progress.failed++;
      // Keep going: one missing ayah should not abandon a 286-verse surah, and
      // the caller reports the failure count rather than pretending it worked.
    }
    onProgress({ ...progress });
  }
  return progress;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** §4.2: "If nothing is downloaded and the user has no connection, the play button
 *  is disabled with a clear explanation - never a silent failure." */
export function playbackBlockedReason(
  audio: SurahAudio | null,
  online: boolean,
): string | null {
  if (audio?.cached) return null;
  if (!online) {
    return 'No recitation is downloaded for this surah, and there is no connection to fetch it.';
  }
  return 'No recitation is downloaded for this surah yet. Download it to listen offline.';
}
