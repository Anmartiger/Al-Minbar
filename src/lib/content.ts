import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

/* One connection to the bundled content database, shared by the Quran reader and
   the athkar screens (Claude.md §3, §8.8). The file is built by
   scripts/build-content-db.py and installed into the XDG data dir on first run. */

export type DatabaseInfo = { path: string; available: boolean; schemaVersion: number };

let handle: Database | null = null;
let info: DatabaseInfo | null = null;

export async function contentDatabase(): Promise<DatabaseInfo> {
  if (!isTauri()) return { path: '', available: false, schemaVersion: 0 };
  if (!info) info = await invoke<DatabaseInfo>('quran_database');
  return info;
}

/** Tables the user writes to. Created on demand rather than by the build script,
 *  so a database rebuilt from new source text keeps bookmarks and progress. */
const USER_SCHEMA = `
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
  note TEXT, created_at INTEGER NOT NULL, UNIQUE (surah, ayah));
CREATE TABLE IF NOT EXISTS reading_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
  page INTEGER NOT NULL, mode TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS athkar_progress (
  category_id INTEGER NOT NULL,
  -- Morning and evening share a chapter (DESIGN_NOTES.md §10.2), so the sitting
  -- is part of the key rather than the chapter being split.
  session TEXT NOT NULL,
  day TEXT NOT NULL,
  dhikr_row_id INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (category_id, session, day, dhikr_row_id));
`;

async function connection(): Promise<Database | null> {
  if (handle) return handle;
  const meta = await contentDatabase();
  if (!meta.available) return null;
  handle = await Database.load(`sqlite:${meta.path}`);
  await handle.execute(USER_SCHEMA);
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
