import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ChevronDown, Info, RotateCcw, Search } from 'lucide-react';
import { EmptyState, IconButton, ProgressRing, SearchField, Skeleton } from '../components/ui';
import { SPRING } from '../design/motion';
import { toDigits } from '../lib/prayer-math';
import { contentDatabase } from '../lib/content';
import {
  completionOf, dhikrFor, FEATURED_IDS, listCategories, loadProgress,
  loadTasbeeh, resetCategory, saveCount, saveTasbeeh, sessionFor,
  type AthkarCategory, type Dhikr, type Progress, type Session, type Tasbeeh,
} from '../lib/athkar';
import './Athkar.css';

export default function Athkar({ arabicIndic }: { arabicIndic: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<AthkarCategory[]>([]);
  const [open, setOpen] = useState<AthkarCategory | null>(null);
  const [query, setQuery] = useState('');
  const [rings, setRings] = useState<Record<number, number>>({});

  useEffect(() => {
    contentDatabase().then(async info => {
      setAvailable(info.available);
      if (!info.available) return;
      const cats = await listCategories();
      setCategories(cats);
      // §7.3: "today's completion ring for the two time-bound sets".
      const featured = cats.filter(c => FEATURED_IDS.includes(c.id));
      const next: Record<number, number> = {};
      for (const c of featured) {
        const entries = await dhikrFor(c.id);
        next[c.id] = completionOf(entries, await loadProgress(c.id, sessionFor(c.id)));
      }
      setRings(next);
    });
  }, [open]);

  if (available === null) return <div className="athkar"><Skeleton height={26} width="40%" /></div>;
  if (available === false) {
    return (
      <div className="athkar">
        <EmptyState
          title="The athkar are not installed"
          body="They are built from the bundled source at package time. Run `npm run content` and rebuild."
        />
      </div>
    );
  }

  if (open) {
    return <CategoryView category={open} arabicIndic={arabicIndic} onBack={() => setOpen(null)} />;
  }

  const needle = query.trim();
  const shown = needle ? categories.filter(c => c.title.includes(needle)) : categories;
  const featured = shown.filter(c => FEATURED_IDS.includes(c.id));
  const rest = shown.filter(c => !FEATURED_IDS.includes(c.id));

  return (
    <div className="athkar">
      <header className="athkar-head">
        <div>
          <div className="home-eyebrow">Athkar</div>
          <h1 className="athkar-title" lang="ar" dir="rtl">حصن المسلم</h1>
        </div>
        <div style={{ inlineSize: 240 }}>
          <SearchField value={query} onChange={setQuery} placeholder="بحث في الأذكار" />
        </div>
      </header>

      <Tasbeeh arabicIndic={arabicIndic} />

      {featured.length > 0 && (
        <>
          <div className="athkar-section">Daily</div>
          <div className="athkar-grid">
            {featured.map(c => (
              <CategoryCard key={c.id} category={c} ring={rings[c.id] ?? 0}
                arabicIndic={arabicIndic} onOpen={() => setOpen(c)} />
            ))}
          </div>
        </>
      )}

      <div className="athkar-section">
        {needle ? `${toDigits(shown.length, arabicIndic)} matching` : 'All chapters'}
      </div>
      {rest.length === 0 && featured.length === 0 ? (
        <EmptyState icon={<Search size={20} strokeWidth={1.5} />} title="Nothing matches"
          body="Try part of a chapter title in Arabic." />
      ) : (
        <div className="athkar-list">
          {rest.map(c => (
            <button className="athkar-row" key={c.id} onClick={() => setOpen(c)}>
              <span className="athkar-row-title" lang="ar" dir="rtl">{c.title}</span>
              <span className="athkar-row-count">{toDigits(c.entry_count, arabicIndic)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryCard({ category, ring, arabicIndic, onOpen }: {
  category: AthkarCategory; ring: number; arabicIndic: boolean; onOpen: () => void;
}) {
  const session = sessionFor(category.id);
  return (
    <button className="athkar-card frame" onClick={onOpen}>
      <ProgressRing value={ring} size={48} thickness={4}
        label={`${Math.round(ring * 100)} percent complete today`} />
      <span className="athkar-card-body">
        <span className="athkar-card-title" lang="ar" dir="rtl">{category.title}</span>
        <span className="athkar-card-meta">
          {toDigits(category.entry_count, arabicIndic)} adhkar
          {session !== 'default' && ` · this ${session}`}
        </span>
      </span>
    </button>
  );
}

/* --------------------------- a single chapter ---------------------------- */

function CategoryView({ category, arabicIndic, onBack }: {
  category: AthkarCategory; arabicIndic: boolean; onBack: () => void;
}) {
  const [entries, setEntries] = useState<Dhikr[]>([]);
  const [progress, setProgress] = useState<Progress>({});
  const session: Session = sessionFor(category.id);

  useEffect(() => {
    dhikrFor(category.id).then(setEntries);
    loadProgress(category.id, session).then(setProgress);
  }, [category.id, session]);

  const bump = useCallback(async (d: Dhikr) => {
    const current = progress[d.row_id] ?? 0;
    if (current >= d.repeat) return;
    const next = current + 1;
    setProgress(p => ({ ...p, [d.row_id]: next }));
    await saveCount(category.id, session, d.row_id, next);
  }, [progress, category.id, session]);

  const reset = async () => {
    await resetCategory(category.id, session);
    setProgress({});
  };

  const done = useMemo(
    () => entries.filter(e => (progress[e.row_id] ?? 0) >= e.repeat).length,
    [entries, progress]);
  const complete = entries.length > 0 && done === entries.length;

  return (
    <div className="athkar">
      <header className="athkar-head">
        <IconButton label="All chapters" onClick={onBack}>
          <ArrowLeft size={17} strokeWidth={1.5} />
        </IconButton>
        <div style={{ flex: 1, minInlineSize: 0 }}>
          <h1 className="athkar-title" lang="ar" dir="rtl">{category.title}</h1>
          {session !== 'default' && <div className="athkar-session">this {session}</div>}
        </div>
        <IconButton label="Start this set again" onClick={reset}>
          <RotateCcw size={16} strokeWidth={1.5} />
        </IconButton>
      </header>

      {/* §7.3: "Progress bar across the set". */}
      <div className="athkar-progress" role="progressbar"
        aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={done}>
        <span style={{ inlineSize: `${entries.length ? (done / entries.length) * 100 : 0}%` }} />
      </div>
      <div className="athkar-progress-label">
        {toDigits(done, arabicIndic)} / {toDigits(entries.length, arabicIndic)}
      </div>

      {/* §7.3: "a quiet, tasteful completion state — a soft accent wash and a
          single line of text. Not confetti." */}
      {complete && (
        <div className="athkar-complete" lang="ar" dir="rtl">تمّت أذكارك — تقبل الله</div>
      )}

      <div className="athkar-cards">
        {entries.map(d => (
          <DhikrCard key={d.row_id} dhikr={d} count={progress[d.row_id] ?? 0}
            arabicIndic={arabicIndic} onTap={() => bump(d)} />
        ))}
      </div>
    </div>
  );
}

function DhikrCard({ dhikr, count, arabicIndic, onTap }: {
  dhikr: Dhikr; count: number; arabicIndic: boolean; onTap: () => void;
}) {
  const [showNote, setShowNote] = useState(false);
  const reduced = useReducedMotion();
  const done = count >= dhikr.repeat;
  const remaining = Math.max(0, dhikr.repeat - count);
  // §4.3's feed carries neither, so the chevron only exists where there is
  // something behind it (DESIGN_NOTES.md §10.1).
  const hasNote = Boolean(dhikr.reference || dhikr.benefit);

  return (
    <article className={`dhikr frame${done ? ' dhikr-done' : ''}`}>
      <p className="dhikr-text" lang="ar" dir="rtl">{dhikr.text}</p>

      <div className="dhikr-foot">
        {/* §7.3: "the repeat counter as a big circular tap target that counts down
            (33 → 32 → …) with a spring press animation". */}
        <motion.button
          className="dhikr-counter"
          onClick={onTap}
          disabled={done}
          whileTap={reduced ? undefined : { scale: 0.94 }}
          transition={SPRING}
          aria-label={done
            ? `${dhikr.repeat} of ${dhikr.repeat} done`
            : `${remaining} remaining, tap to count`}
        >
          <span className="dhikr-count">{toDigits(done ? dhikr.repeat : remaining, arabicIndic)}</span>
          <span className="dhikr-of">{done ? 'done' : `of ${toDigits(dhikr.repeat, arabicIndic)}`}</span>
        </motion.button>

        {hasNote && (
          <button className="dhikr-note-toggle" onClick={() => setShowNote(v => !v)}
            aria-expanded={showNote}>
            <Info size={14} strokeWidth={1.5} />
            <ChevronDown size={14} strokeWidth={1.5}
              style={{ transform: showNote ? 'rotate(180deg)' : undefined }} />
          </button>
        )}
      </div>

      {hasNote && showNote && (
        <div className="dhikr-note" lang="ar" dir="rtl">
          {dhikr.reference && <div>{dhikr.reference}</div>}
          {dhikr.benefit && <div className="dhikr-benefit">{dhikr.benefit}</div>}
        </div>
      )}
    </article>
  );
}

/* ------------------------------- tasbeeh --------------------------------- */

/** §7.3: "A free-form tasbeeh counter with a resettable count and a target." */
function Tasbeeh({ arabicIndic }: { arabicIndic: boolean }) {
  const [state, setState] = useState<Tasbeeh>(loadTasbeeh);
  const reduced = useReducedMotion();
  useEffect(() => { saveTasbeeh(state); }, [state]);

  const reached = state.count >= state.target;
  return (
    <section className="tasbeeh frame">
      <div className="tasbeeh-body">
        <div className="home-eyebrow">Tasbeeh</div>
        <div className="tasbeeh-count">{toDigits(state.count, arabicIndic)}</div>
        <label className="tasbeeh-target">
          target
          <input type="number" min={1} max={9999} value={state.target}
            onChange={e => setState(s => ({ ...s, target: Math.max(1, Number(e.target.value) || 1) }))} />
        </label>
      </div>
      <div className="tasbeeh-actions">
        <motion.button className="tasbeeh-tap" whileTap={reduced ? undefined : { scale: 0.94 }}
          transition={SPRING} onClick={() => setState(s => ({ ...s, count: s.count + 1 }))}
          aria-label="Count one">
          {reached ? '✓' : '+'}
        </motion.button>
        <IconButton label="Reset the count" onClick={() => setState(s => ({ ...s, count: 0 }))}>
          <RotateCcw size={15} strokeWidth={1.5} />
        </IconButton>
      </div>
    </section>
  );
}
