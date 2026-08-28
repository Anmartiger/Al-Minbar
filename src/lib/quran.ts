import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

/* Reader-side access to the bundled Quran database (Claude.md §4.2).
   The database is built by scripts/build-quran-db.py and installed into the XDG
   data dir on first run; §3 puts the queries here, through tauri-plugin-sql. */

export type DatabaseInfo = { path: string; available: boolean; schemaVersion: number };

export type Surah = {
  number: number;
  name_ar: string;
  name_transliterated: string;
  name_en: string;
  revelation_place: 'Meccan' | 'Medinan';
  ayah_count: number;
  start_page: number;
};

export type Verse = {
  surah: number;
  ayah: number;
  text_uthmani: string;
  /** Characters at the head of text_uthmani that are the opening basmalah (§7.2). */
  bismillah_prefix: number;
  page: number;
  juz: number;
  hizb_quarter: number;
  sajda: string | null;
};

export type MushafLine = { line: number; surah: number; ayah: number; word_position: number };
export type SearchHit = Verse & { snippet: string };
export type Bookmark = { id: number; surah: number; ayah: number; note: string | null; created_at: number };
export type ReadingState = { surah: number; ayah: number; page: number; mode: string; updated_at: number };

/* ---------------------------- normalisation ------------------------------ */

/**
 * §5.4, and it must agree character-for-character with `normalise()` in
 * scripts/build-quran-db.py. The database stores the normalised form; this
 * normalises the *query*. If the two ever diverge, search silently returns
 * nothing rather than failing loudly — hence `normalisationMatches()` below.
 */
// Written as escapes, not literal marks. As literals these combining characters
// stack on top of the range dashes and the class becomes genuinely unreadable -
// it looks like it spans into the Arabic-Indic digits at U+0660-0669 when it does
// not. Same set as `TASHKEEL` in scripts/build-quran-db.py:
//   U+064B-0655 tashkeel, maddah, hamza    U+0670 dagger alef
//   U+0640 tatweel                         U+06D6-06ED Quranic annotation marks
const TASHKEEL = /[\u064B-\u0655\u0670\u0640\u06D6-\u06ED]/g;

export function normaliseArabic(text: string): string {
  return text
    .replace(TASHKEEL, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627') // أ إ آ ٱ -> ا
    .replace(/\u0629/g, '\u0647')                      // ة -> ه
    .replace(/\u0649/g, '\u064A')                      // ى -> ي
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** A few known pairs that must collapse to the same string. Used by the logic check. */
export const NORMALISATION_CASES: Array<[string, string]> = [
  ['ٱلرَّحْمَٰن', 'الرحمن'],
  ['الرحمن', 'الرحمن'],
];

/* ------------------------------ connection ------------------------------- */

let handle: Database | null = null;
let info: DatabaseInfo | null = null;

export async function quranDatabase(): Promise<DatabaseInfo> {
  if (!isTauri()) return { path: '', available: false, schemaVersion: 0 };
  if (!info) info = await invoke<DatabaseInfo>('quran_database');
  return info;
}

async function db(): Promise<Database | null> {
  if (handle) return handle;
  const meta = await quranDatabase();
  if (!meta.available) return null;
  handle = await Database.load(`sqlite:${meta.path}`);
  // The user's own tables live alongside the shipped content and are created on
  // demand, so a database rebuilt from new source text keeps bookmarks.
  await handle.execute(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
      note TEXT, created_at INTEGER NOT NULL, UNIQUE (surah, ayah));
    CREATE TABLE IF NOT EXISTS reading_state (
      id INTEGER PRIMARY KEY CHECK (id = 1), surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
      page INTEGER NOT NULL, mode TEXT NOT NULL, updated_at INTEGER NOT NULL);
  `);
  return handle;
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const conn = await db();
  if (!conn) return [];
  return conn.select<T[]>(sql, params);
}

/* -------------------------------- reads ---------------------------------- */

export const listSurahs = () =>
  query<Surah>(
    `SELECT number, name_ar, name_transliterated, name_en, revelation_place,
            ayah_count, start_page
       FROM surahs ORDER BY number`);

const VERSE_COLUMNS =
  'surah, ayah, text_uthmani, bismillah_prefix, page, juz, hizb_quarter, sajda';

export const versesForSurah = (surah: number) =>
  query<Verse>(`SELECT ${VERSE_COLUMNS} FROM verses WHERE surah = $1 ORDER BY ayah`, [surah]);

export const versesForPage = (page: number) =>
  query<Verse>(`SELECT ${VERSE_COLUMNS} FROM verses WHERE page = $1 ORDER BY surah, ayah`, [page]);

export const linesForPage = (page: number) =>
  query<MushafLine>(
    'SELECT line, surah, ayah, word_position FROM mushaf_lines WHERE page = $1 ORDER BY line',
    [page]);

export const translationFor = (surah: number, ayah: number) =>
  query<{ text: string; name: string }>(
    `SELECT tv.text, t.name FROM translation_verses tv
       JOIN translations t ON t.id = tv.translation_id
      WHERE tv.surah = $1 AND tv.ayah = $2`, [surah, ayah]);

export const tafsirFor = (surah: number, ayah: number) =>
  query<{ text: string; name: string }>(
    `SELECT tv.text, t.name FROM tafsir_verses tv
       JOIN tafsirs t ON t.id = tv.tafsir_id
      WHERE tv.surah = $1 AND tv.ayah = $2`, [surah, ayah]);

/** §4.2: "every bundled text keeps its licence and source attribution". */
export const attributions = () =>
  query<{ key: string; title: string; source: string; license: string; notice: string | null }>(
    'SELECT key, title, source, license, notice FROM attributions ORDER BY title');

export const databaseFacts = () =>
  query<{ key: string; value: string }>('SELECT key, value FROM meta ORDER BY key');

/* -------------------------------- search --------------------------------- */

/** `2:255`, `2 255`, `٢:٢٥٥` — §7.2 wants reference-style queries to work. */
const ARABIC_INDIC_DIGITS = /[٠-٩]/g;
const westernise = (s: string) =>
  s.replace(ARABIC_INDIC_DIGITS, d => String(d.charCodeAt(0) - 0x0660));

export function parseReference(raw: string): { surah: number; ayah?: number } | null {
  const m = westernise(raw.trim()).match(/^(\d{1,3})\s*[:\s.-]\s*(\d{1,3})$|^(\d{1,3})$/);
  if (!m) return null;
  const surah = Number(m[1] ?? m[3]);
  const ayah = m[2] ? Number(m[2]) : undefined;
  if (surah < 1 || surah > 114) return null;
  if (ayah !== undefined && ayah < 1) return null;
  return { surah, ayah };
}

/**
 * §5.4: diacritic-insensitive full-text search. FTS5 matches the normalised
 * column; the vocalised text comes back alongside so the caller highlights in the
 * original rather than in the stripped form.
 */
export async function searchVerses(raw: string, limit = 50): Promise<SearchHit[]> {
  const needle = normaliseArabic(raw);
  if (needle.length < 2) return [];
  // Quote the phrase so FTS5 treats it literally rather than as its query syntax.
  const phrase = `"${needle.replace(/"/g, '""')}"`;
  return query<SearchHit>(
    `SELECT v.surah, v.ayah, v.text_uthmani, v.bismillah_prefix, v.page, v.juz,
            v.hizb_quarter, v.sajda,
            snippet(verses_fts, 0, '', '', '…', 12) AS snippet
       FROM verses_fts f
       JOIN verses v ON v.surah = f.surah AND v.ayah = f.ayah
      WHERE verses_fts MATCH $1
      ORDER BY rank
      LIMIT $2`, [phrase, limit]);
}

export const searchSurahs = async (raw: string): Promise<Surah[]> => {
  const needle = normaliseArabic(raw).toLowerCase();
  if (!needle) return [];
  const all = await listSurahs();
  return all.filter(s =>
    normaliseArabic(s.name_ar).includes(needle) ||
    s.name_transliterated.toLowerCase().includes(needle) ||
    s.name_en.toLowerCase().includes(needle));
};

/* --------------------------- bookmarks & state --------------------------- */

export const listBookmarks = () =>
  query<Bookmark>('SELECT id, surah, ayah, note, created_at FROM bookmarks ORDER BY surah, ayah');

export async function toggleBookmark(surah: number, ayah: number): Promise<boolean> {
  const conn = await db();
  if (!conn) return false;
  const existing = await conn.select<Bookmark[]>(
    'SELECT id FROM bookmarks WHERE surah = $1 AND ayah = $2', [surah, ayah]);
  if (existing.length) {
    await conn.execute('DELETE FROM bookmarks WHERE surah = $1 AND ayah = $2', [surah, ayah]);
    return false;
  }
  await conn.execute(
    'INSERT INTO bookmarks (surah, ayah, note, created_at) VALUES ($1, $2, NULL, $3)',
    [surah, ayah, Math.floor(Date.now() / 1000)]);
  return true;
}

export async function setBookmarkNote(surah: number, ayah: number, note: string) {
  const conn = await db();
  await conn?.execute('UPDATE bookmarks SET note = $1 WHERE surah = $2 AND ayah = $3',
    [note.trim() || null, surah, ayah]);
}

/** §7.2: "last position saved continuously and restored on launch". */
export async function saveReadingState(s: Omit<ReadingState, 'updated_at'>) {
  const conn = await db();
  await conn?.execute(
    `INSERT INTO reading_state (id, surah, ayah, page, mode, updated_at)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET
       surah = excluded.surah, ayah = excluded.ayah, page = excluded.page,
       mode = excluded.mode, updated_at = excluded.updated_at`,
    [s.surah, s.ayah, s.page, s.mode, Math.floor(Date.now() / 1000)]);
}

export const readingState = async (): Promise<ReadingState | null> =>
  (await query<ReadingState>('SELECT surah, ayah, page, mode, updated_at FROM reading_state WHERE id = 1'))[0] ?? null;
