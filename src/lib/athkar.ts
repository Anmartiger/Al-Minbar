import { queryContent, execContent } from './content';

/* §4.3 / §7.3 athkar. Text comes from the publisher's own feed; `reference` and
   `benefit` are null throughout because that feed does not carry them and §12.3
   forbids inventing them (DESIGN_NOTES.md §10.1). */

export type AthkarCategory = {
  id: number;
  title: string;
  position: number;
  entry_count: number;
  audio: string | null;
};

export type Dhikr = {
  row_id: number;
  source_id: number;
  category_id: number;
  position: number;
  text: string;
  repeat: number;
  reference: string | null;
  benefit: string | null;
  audio: string | null;
};

/** The chapters §7.3 pins to a daily completion ring. Morning and evening are one
 *  chapter in the book (DESIGN_NOTES.md §10.2), tracked as two daily sets. */
export const MORNING_EVENING_ID = 27;
export const SLEEP_ID = 28;
export const WAKING_ID = 1;
export const AFTER_PRAYER_ID = 26;

/** §7.3's grid leads with the sets someone actually opens daily. */
export const FEATURED_IDS = [MORNING_EVENING_ID, AFTER_PRAYER_ID, SLEEP_ID, WAKING_ID];

export const listCategories = () =>
  queryContent<AthkarCategory>(
    'SELECT id, title, position, entry_count, audio FROM athkar_categories ORDER BY position');

export const dhikrFor = (categoryId: number) =>
  queryContent<Dhikr>(
    `SELECT row_id, source_id, category_id, position, text, repeat, reference, benefit, audio
       FROM athkar WHERE category_id = $1 ORDER BY position`, [categoryId]);

/* ------------------------------ progress -------------------------------- */

/** Local calendar day, so a set resets at the user's midnight rather than UTC's. */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Morning and evening share a chapter, so they are told apart by *when* the set
 * is being done rather than by which adhkar it contains — which is how the book
 * treats them. Anything before local noon counts as the morning sitting.
 */
export type Session = 'morning' | 'evening' | 'default';

export function sessionFor(categoryId: number, at = new Date()): Session {
  if (categoryId !== MORNING_EVENING_ID) return 'default';
  return at.getHours() < 12 ? 'morning' : 'evening';
}

export type Progress = Record<number, number>;

export async function loadProgress(categoryId: number, session: Session): Promise<Progress> {
  const rows = await queryContent<{ dhikr_row_id: number; count: number }>(
    `SELECT dhikr_row_id, count FROM athkar_progress
      WHERE category_id = $1 AND session = $2 AND day = $3`,
    [categoryId, session, today()]);
  return Object.fromEntries(rows.map(r => [r.dhikr_row_id, r.count]));
}

export async function saveCount(
  categoryId: number, session: Session, dhikrRowId: number, count: number,
) {
  await execContent(
    `INSERT INTO athkar_progress (category_id, session, day, dhikr_row_id, count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(category_id, session, day, dhikr_row_id)
     DO UPDATE SET count = excluded.count`,
    [categoryId, session, today(), dhikrRowId, count]);
}

export async function resetCategory(categoryId: number, session: Session) {
  await execContent(
    'DELETE FROM athkar_progress WHERE category_id = $1 AND session = $2 AND day = $3',
    [categoryId, session, today()]);
}

/** Fraction of a set completed today, for §7.3's category ring. */
export function completionOf(entries: Dhikr[], progress: Progress): number {
  if (!entries.length) return 0;
  const done = entries.filter(e => (progress[e.row_id] ?? 0) >= e.repeat).length;
  return done / entries.length;
}

/* ------------------------------ tasbeeh --------------------------------- */

/** §7.3: "A free-form tasbeeh counter with a resettable count and a target."
 *  Per-device and trivially disposable, so it lives in localStorage rather than
 *  the content database. */
const TASBEEH_KEY = 'al-minabr.tasbeeh';

export type Tasbeeh = { count: number; target: number };
export const DEFAULT_TASBEEH: Tasbeeh = { count: 0, target: 33 };

export function loadTasbeeh(): Tasbeeh {
  try {
    const raw = localStorage.getItem(TASBEEH_KEY);
    if (!raw) return DEFAULT_TASBEEH;
    const p = JSON.parse(raw) as Partial<Tasbeeh>;
    return {
      count: Number.isFinite(p.count) ? Math.max(0, Number(p.count)) : 0,
      target: Number.isFinite(p.target) ? Math.max(1, Number(p.target)) : 33,
    };
  } catch {
    return DEFAULT_TASBEEH;
  }
}

export function saveTasbeeh(t: Tasbeeh) {
  try { localStorage.setItem(TASBEEH_KEY, JSON.stringify(t)); } catch { /* non-fatal */ }
}
