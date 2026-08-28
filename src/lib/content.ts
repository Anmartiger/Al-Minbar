import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

/* One connection covering both files (Claude.md §3, §8.8).

   The shipped content and the user's own data are separate files, because a
   single file meant a stale copy could never be refreshed — which is exactly how
   the athkar screens ended up empty after the tables were added in a later phase.
   `content.db` is replaced whenever the bundle changes; `al-minabr.db` keeps its
   §8.8 name and holds only bookmarks, reading position and athkar progress.

   The content file is opened and the user file attached to it as `user`, so
   content queries stay unqualified and only the handful of user ones carry a
   prefix. */

export type DatabaseInfo = {
  path: string; userPath: string; available: boolean; version: string; refreshed: boolean;
};

let handle: Database | null = null;
let info: DatabaseInfo | null = null;

export async function contentDatabase(): Promise<DatabaseInfo> {
  if (!isTauri()) {
    return { path: '', userPath: '', available: false, version: '', refreshed: false };
  }
  if (!info) info = await invoke<DatabaseInfo>('quran_database');
  return info;
}

/** Tables the user writes to. Created on demand rather than by the build script,
 *  so replacing the shipped content never touches them. */
const USER_SCHEMA = `
CREATE TABLE IF NOT EXISTS user.bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
  note TEXT, created_at INTEGER NOT NULL, UNIQUE (surah, ayah));
CREATE TABLE IF NOT EXISTS user.reading_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
  page INTEGER NOT NULL, mode TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user.athkar_progress (
  category_id INTEGER NOT NULL,
  -- Morning and evening share a chapter (DESIGN_NOTES.md §10.2), so the sitting
  -- is part of the key rather than the chapter being split.
  session TEXT NOT NULL,
  day TEXT NOT NULL,
  dhikr_row_id INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (category_id, session, day, dhikr_row_id));
`;

/** Content tables an earlier build wrote into the user file, before the two were
 *  split. They are a stale copy of shipped data, so dropping them is safe and
 *  reclaims about 9 MB. User tables are never touched. */
const STALE_CONTENT_TABLES = [
  'verses_fts', 'verses', 'surahs', 'translation_verses', 'translations',
  'tafsir_verses', 'tafsirs', 'mushaf_lines', 'attributions', 'meta',
];

async function connection(): Promise<Database | null> {
  if (handle) return handle;
  const meta = await contentDatabase();
  if (!meta.available) return null;

  handle = await Database.load(`sqlite:${meta.path}`);
  await handle.execute(`ATTACH DATABASE '${meta.userPath.replace(/'/g, "''")}' AS user`);
  await handle.execute(USER_SCHEMA);

  // Migrating from the single-file layout: the user file may still carry a copy
  // of the shipped tables. Checked on every launch rather than only on the one
  // that refreshes, because the refresh and the cleanup are not guaranteed to
  // happen in the same run — VACUUM is skipped unless something was actually
  // dropped, since it rewrites the whole file.
  const stale = await handle.select<Array<{ name: string }>>(
    `SELECT name FROM user.sqlite_master
      WHERE type = 'table' AND name IN (${STALE_CONTENT_TABLES.map(t => `'${t}'`).join(',')})`);
  if (stale.length) {
    for (const { name } of stale) {
      await handle.execute(`DROP TABLE IF EXISTS user.${name}`).catch(() => {});
    }
    // FTS5 leaves shadow tables behind that the list above does not name.
    for (const shadow of ['verses_fts_config', 'verses_fts_content', 'verses_fts_data',
                          'verses_fts_docsize', 'verses_fts_idx']) {
      await handle.execute(`DROP TABLE IF EXISTS user.${shadow}`).catch(() => {});
    }
    await handle.execute('VACUUM user').catch(() => {});
  }
  return handle;
}

export async function queryContent<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const conn = await connection();
  if (!conn) return [];
  return conn.select<T[]>(sql, params);
}

export async function execContent(sql: string, params: unknown[] = []): Promise<void> {
  const conn = await connection();
  await conn?.execute(sql, params);
}
