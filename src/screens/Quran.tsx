import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Copy, Play, ScrollText, X,
} from 'lucide-react';
import {
  Badge, EmptyState, IconButton, List, ListRow, SearchField, SegmentedControl, Skeleton, Tooltip,
} from '../components/ui';
import { toDigits } from '../lib/prayer-math';
import {
  linesForPage, listBookmarks, listSurahs, normaliseArabic, parseReference,
  quranDatabase, readingState, saveReadingState, searchVerses, tafsirFor, toggleBookmark,
  translationFor, versesForPage, versesForSurah,
  type MushafLine, type SearchHit, type Surah, type Verse,
} from '../lib/quran';
import Player, { type PlayerTarget } from '../components/Player';
import './Quran.css';

type Mode = 'mushaf' | 'reading';
type Panel = { kind: 'tafsir' | 'translation'; surah: number; ayah: number } | null;

/** §7.2: "surah number in a decorative frame" — the eight-pointed star the printed
 *  mushaf uses around numerals. */
function SurahFrame({ n, arabicIndic }: { n: number; arabicIndic: boolean }) {
  return (
    <span className="surah-frame">
      <svg viewBox="0 0 40 40" aria-hidden>
        <path
          d="M20 1.5 25.4 7 33 7 33 14.6 38.5 20 33 25.4 33 33 25.4 33 20 38.5 14.6 33 7 33 7 25.4 1.5 20 7 14.6 7 7 14.6 7Z"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span>{toDigits(n, arabicIndic)}</span>
    </span>
  );
}

/** §5.3's end-of-ayah symbol with the number laid inside it. */
function AyahMarker({ n, arabicIndic }: { n: number; arabicIndic: boolean }) {
  return (
    <span className="ayah-marker" aria-label={`Verse ${n}`}>
      <span className="ayah-marker-glyph" aria-hidden>{'۝'}</span>
      <span className="ayah-marker-number" aria-hidden>{toDigits(n, arabicIndic)}</span>
    </span>
  );
}

/** The verse text with its opening basmalah removed, since §7.2 renders that
 *  separately as a centred line. The stored text is never modified (§12.3). */
const verseBody = (v: Verse) =>
  v.bismillah_prefix > 0 ? v.text_uthmani.slice(v.bismillah_prefix) : v.text_uthmani;

const basmalahOf = (v: Verse) =>
  v.bismillah_prefix > 0 ? v.text_uthmani.slice(0, v.bismillah_prefix).trim() : null;

export default function Quran({ arabicIndic }: { arabicIndic: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [surah, setSurah] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<Mode>('reading');
  const [verses, setVerses] = useState<Verse[]>([]);
  const [lines, setLines] = useState<MushafLine[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [panelText, setPanelText] = useState<{ text: string; name: string } | null>(null);
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [player, setPlayer] = useState<PlayerTarget | null>(null);
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const key = (s: number, a: number) => `${s}:${a}`;

  useEffect(() => {
    quranDatabase().then(async info => {
      setAvailable(info.available);
      if (!info.available) return;
      setSurahs(await listSurahs());
      setMarks(new Set((await listBookmarks()).map(b => key(b.surah, b.ayah))));
      // §7.2: "last position saved continuously and restored on launch".
      const state = await readingState();
      if (state) {
        setMode(state.mode === 'mushaf' ? 'mushaf' : 'reading');
        setSurah(state.surah);
        setPage(state.page);
      }
    });
  }, []);

  /* Load whichever unit the current mode reads by. */
  useEffect(() => {
    if (available !== true) return;
    let alive = true;
    if (mode === 'mushaf') {
      Promise.all([versesForPage(page), linesForPage(page)]).then(([v, l]) => {
        if (!alive) return;
        setVerses(v); setLines(l);
      });
    } else if (surah != null) {
      versesForSurah(surah).then(v => { if (alive) setVerses(v); });
      setLines([]);
    }
    return () => { alive = false; };
  }, [mode, page, surah, available]);

  /* Persist position whenever it moves. */
  useEffect(() => {
    if (available !== true || (surah == null && mode !== 'mushaf')) return;
    const first = verses[0];
    if (!first) return;
    void saveReadingState({
      surah: mode === 'mushaf' ? first.surah : (surah ?? first.surah),
      ayah: first.ayah, page: mode === 'mushaf' ? page : first.page, mode,
    });
  }, [verses, mode, page, surah, available]);

  /* Search: a reference jumps, anything else runs the §5.4 full-text search. */
  useEffect(() => {
    const raw = query.trim();
    if (raw.length < 2) { setHits(null); return; }
    const ref = parseReference(raw);
    if (ref) {
      setHits(null);
      return;
    }
    let alive = true;
    searchVerses(raw).then(r => { if (alive) setHits(r); }).catch(() => {});
    return () => { alive = false; };
  }, [query]);

  useEffect(() => {
    if (!panel) { setPanelText(null); return; }
    const load = panel.kind === 'tafsir' ? tafsirFor : translationFor;
    load(panel.surah, panel.ayah).then(rows => setPanelText(rows[0] ?? null));
  }, [panel]);

  /* §10: "arrow keys turn mushaf pages". */
  useEffect(() => {
    if (mode !== 'mushaf') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      // The mushaf reads right-to-left, so ArrowLeft advances.
      if (e.key === 'ArrowLeft') setPage(p => Math.min(604, p + 1));
      if (e.key === 'ArrowRight') setPage(p => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  /* §7.2: the recited verse "auto-scrolls into view". */
  useEffect(() => {
    if (playingAyah == null || !player) return;
    document.getElementById(`v-${player.surah}-${playingAyah}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [playingAyah, player]);

  const openVerse = useCallback((s: number, a: number) => {
    setQuery(''); setHits(null); setSurah(s); setMode('reading');
    requestAnimationFrame(() => {
      document.getElementById(`v-${s}-${a}`)?.scrollIntoView({ block: 'center' });
    });
  }, []);

  const onBookmark = async (s: number, a: number) => {
    const now = await toggleBookmark(s, a);
    setMarks(prev => {
      const next = new Set(prev);
      if (now) next.add(key(s, a)); else next.delete(key(s, a));
      return next;
    });
  };

  const copyVerse = (v: Verse) => {
    const name = surahs.find(s => s.number === v.surah)?.name_ar ?? '';
    // §7.2: "copy (with reference)".
    void navigator.clipboard?.writeText(
      `${verseBody(v)}\n\n${name} ${v.surah}:${v.ayah}`);
  };

  if (available === null) {
    return <div className="quran"><div className="reading"><Skeleton height={28} width="40%" /></div></div>;
  }

  if (available === false) {
    return (
      <div className="quran">
        <EmptyState
          icon={<ScrollText size={22} strokeWidth={1.5} />}
          title="The Quran database is not installed"
          body="It is built from the bundled sources at package time. Run `npm run quran` and rebuild the app."
        />
      </div>
    );
  }

  const current = surahs.find(s => s.number === (mode === 'mushaf' ? verses[0]?.surah : surah));
  const browsing = surah == null && mode === 'reading' && !hits;

  return (
    <div className="quran">
      <header className="quran-bar">
        {!browsing && (
          <IconButton label="All surahs" onClick={() => { setSurah(null); setMode('reading'); setQuery(''); }}>
            <ArrowLeft size={17} strokeWidth={1.5} />
          </IconButton>
        )}
        {current && (
          <span className="quran-bar-title">
            <span className="quran-bar-name" lang="ar" dir="rtl">{current.name_ar}</span>
            <span className="quran-bar-sub">{current.name_transliterated}</span>
          </span>
        )}
        <span className="spacer" />
        <div style={{ inlineSize: 260 }}>
          <SearchField value={query} onChange={setQuery}
            placeholder="Search — الرحمن, Baqara, or 2:255" />
        </div>
        <SegmentedControl
          options={[
            { value: 'reading' as const, label: 'Reading' },
            { value: 'mushaf' as const, label: 'Mushaf' },
          ]}
          value={mode}
          onChange={m => {
            if (m === 'mushaf' && verses[0]) setPage(verses[0].page);
            setMode(m);
          }}
        />
      </header>

      <div className="quran-body">
        <div className="quran-scroll" ref={scroller}>
          {hits ? (
            <SearchResults hits={hits} query={query} surahs={surahs}
              arabicIndic={arabicIndic} onOpen={openVerse} />
          ) : browsing ? (
            <Browser surahs={surahs} query={query} arabicIndic={arabicIndic}
              onPick={s => { setSurah(s); setMode('reading'); }}
              onJump={(s, a) => openVerse(s, a)} />
          ) : mode === 'mushaf' ? (
            <MushafPage
              page={page} verses={verses} lines={lines} surahs={surahs}
              arabicIndic={arabicIndic} onPage={setPage} />
          ) : (
            <div className="reading">
              {verses.map(v => (
                <VerseBlock
                  key={`${v.surah}-${v.ayah}`} verse={v} arabicIndic={arabicIndic}
                  bookmarked={marks.has(key(v.surah, v.ayah))}
                  playing={player?.surah === v.surah && playingAyah === v.ayah}
                  onBookmark={() => onBookmark(v.surah, v.ayah)}
                  onCopy={() => copyVerse(v)}
                  onPlay={() => {
                    const s0 = surahs.find(x => x.number === v.surah);
                    if (s0) setPlayer({ surah: s0.number, ayahCount: s0.ayah_count, name: s0.name_ar });
                    setPlayingAyah(v.ayah);
                  }}
                  onPanel={kind => setPanel({ kind, surah: v.surah, ayah: v.ayah })}
                />
              ))}
            </div>
          )}
        </div>

        {panel && (
          <aside className="quran-panel">
            <div className="quran-panel-head">
              <h3>{panel.kind === 'tafsir' ? 'Tafsir' : 'Translation'}</h3>
              <IconButton label="Close panel" onClick={() => setPanel(null)}>
                <X size={15} strokeWidth={1.5} />
              </IconButton>
            </div>
            <div className="quran-panel-ref">
              {panelText?.name} · {panel.surah}:{panel.ayah}
            </div>
            {panelText ? (
              <div className={panel.kind === 'tafsir' ? 'panel-arabic' : 'panel-latin'}
                lang={panel.kind === 'tafsir' ? 'ar' : 'en'}
                dir={panel.kind === 'tafsir' ? 'rtl' : 'ltr'}>
                {panelText.text}
              </div>
            ) : (
              <Skeleton height={16} />
            )}
          </aside>
        )}
      </div>

      {player && (
        <Player
          target={player}
          currentAyah={playingAyah}
          onAyah={setPlayingAyah}
          onClose={() => { setPlayer(null); setPlayingAyah(null); }}
        />
      )}
    </div>
  );
}

/* ------------------------------- browser --------------------------------- */

function Browser({ surahs, query, arabicIndic, onPick, onJump }: {
  surahs: Surah[]; query: string; arabicIndic: boolean;
  onPick: (n: number) => void; onJump: (s: number, a: number) => void;
}) {
  const ref = parseReference(query);
  const needle = normaliseArabic(query).toLowerCase();
  const shown = needle
    ? surahs.filter(s =>
        normaliseArabic(s.name_ar).includes(needle) ||
        s.name_transliterated.toLowerCase().includes(needle) ||
        s.name_en.toLowerCase().includes(needle) ||
        String(s.number) === query.trim())
    : surahs;

  return (
    <div className="browser">
      {ref && (
        <List>
          <ListRow
            leading={<SurahFrame n={ref.surah} arabicIndic={arabicIndic} />}
            title={`Go to ${ref.surah}${ref.ayah ? `:${ref.ayah}` : ''}`}
            subtitle={surahs.find(s => s.number === ref.surah)?.name_transliterated}
            onClick={() => onJump(ref.surah, ref.ayah ?? 1)}
          />
        </List>
      )}
      {shown.length === 0 ? (
        <EmptyState title="No surah matches" body="Try an Arabic or Latin name, a number, or a reference like 2:255." />
      ) : (
        <List>
          {shown.map(s => (
            <ListRow
              key={s.number}
              leading={<SurahFrame n={s.number} arabicIndic={arabicIndic} />}
              title={<span className="surah-name" lang="ar" dir="rtl">{s.name_ar}</span>}
              subtitle={
                <span className="surah-meta">
                  {s.name_transliterated}
                  <Badge tone="neutral">
                    {s.revelation_place === 'Meccan' ? 'مكية' : 'مدنية'}
                  </Badge>
                  {toDigits(s.ayah_count, arabicIndic)} آيات
                </span>
              }
              separatorInset="calc(var(--space-4) + 40px + var(--space-3))"
              onClick={() => onPick(s.number)}
            />
          ))}
        </List>
      )}
    </div>
  );
}

/* ----------------------------- reading mode ------------------------------ */

function VerseBlock({ verse, arabicIndic, bookmarked, playing, onBookmark, onCopy, onPlay, onPanel }: {
  verse: Verse; arabicIndic: boolean; bookmarked: boolean; playing: boolean;
  onBookmark: () => void; onCopy: () => void; onPlay: () => void;
  onPanel: (kind: 'tafsir' | 'translation') => void;
}) {
  const basmalah = basmalahOf(verse);
  return (
    <>
      {basmalah && <div className="basmalah" lang="ar" dir="rtl">{basmalah}</div>}
      <div className="verse-block" id={`v-${verse.surah}-${verse.ayah}`} tabIndex={0}
        data-playing={playing}>
        <div className="verse-text" lang="ar" dir="rtl">
          {verseBody(verse)}
          <AyahMarker n={verse.ayah} arabicIndic={arabicIndic} />
          {verse.sajda && (
            <span className="sajda-chip" dir="ltr">
              {'۩'} sajda ({verse.sajda})
            </span>
          )}
        </div>
        <div className="verse-actions">
          <Tooltip text="Play from here">
            <IconButton label="Play from this verse" onClick={onPlay}>
              <Play size={15} strokeWidth={1.5} />
            </IconButton>
          </Tooltip>
          <Tooltip text={bookmarked ? 'Remove bookmark' : 'Bookmark'}>
            <IconButton label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
              active={bookmarked} onClick={onBookmark}>
              {bookmarked ? <BookmarkCheck size={15} strokeWidth={1.5} />
                          : <Bookmark size={15} strokeWidth={1.5} />}
            </IconButton>
          </Tooltip>
          <Tooltip text="Copy with reference">
            <IconButton label="Copy with reference" onClick={onCopy}>
              <Copy size={15} strokeWidth={1.5} />
            </IconButton>
          </Tooltip>
          <Tooltip text="Translation">
            <IconButton label="Translation" onClick={() => onPanel('translation')}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>EN</span>
            </IconButton>
          </Tooltip>
          <Tooltip text="Tafsir">
            <IconButton label="Tafsir" onClick={() => onPanel('tafsir')}>
              <ScrollText size={15} strokeWidth={1.5} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </>
  );
}

/* ----------------------------- mushaf mode ------------------------------- */

/**
 * §7.2: "one 604-layout page at a time, lines justified as printed".
 *
 * The layout records the first word of each printed line. Word indices come from
 * quran.com, which counts each verse's end-of-ayah marker as a final word — so the
 * token stream per verse is [w1..wn, MARKER] and the recorded positions index
 * straight into it. Gaps in the line numbering are where a surah header band and
 * its basmalah sit.
 */
function MushafPage({ page, verses, lines, surahs, arabicIndic, onPage }: {
  page: number; verses: Verse[]; lines: MushafLine[]; surahs: Surah[];
  arabicIndic: boolean; onPage: (p: number) => void;
}) {
  const tokens = useMemo(() => {
    const out: Array<{ surah: number; ayah: number; index: number; text: string; marker: boolean }> = [];
    for (const v of verses) {
      const words = verseBody(v).split(/\s+/).filter(Boolean);
      words.forEach((w, i) => out.push({ surah: v.surah, ayah: v.ayah, index: i + 1, text: w, marker: false }));
      out.push({ surah: v.surah, ayah: v.ayah, index: words.length + 1, text: '', marker: true });
    }
    return out;
  }, [verses]);

  const rendered = useMemo(() => {
    if (!lines.length) return null;
    const startAt = (l: MushafLine) =>
      tokens.findIndex(t => t.surah === l.surah && t.ayah === l.ayah && t.index === l.word_position);
    return lines.map((l, i) => {
      const from = startAt(l);
      const next = lines[i + 1];
      const to = next ? startAt(next) : tokens.length;
      return { line: l.line, slice: from < 0 ? [] : tokens.slice(from, to < 0 ? undefined : to) };
    });
  }, [lines, tokens]);

  // Which surahs begin on this page, so their header band can go in the gap.
  const bandFor = useMemo(() => {
    const map = new Map<number, Surah>();
    for (const v of verses) {
      if (v.ayah === 1) {
        const s = surahs.find(x => x.number === v.surah);
        if (s) map.set(v.surah, s);
      }
    }
    return map;
  }, [verses, surahs]);

  const firstBasmalah = verses.find(v => v.ayah === 1 && v.bismillah_prefix > 0);

  return (
    <div className="mushaf">
      <div className="mushaf-page" lang="ar" dir="rtl">
        {[...bandFor.values()].map(s => (
          <div key={s.number}>
            <div className="surah-band">
              <span>{s.name_ar}</span>
            </div>
            {firstBasmalah && firstBasmalah.surah === s.number && (
              <div className="basmalah">{basmalahOf(firstBasmalah)}</div>
            )}
          </div>
        ))}

        {rendered ? (
          rendered.map((r, i) => (
            <div className="mushaf-line" key={r.line} data-last={i === rendered.length - 1}>
              {r.slice.map(t =>
                t.marker ? (
                  <AyahMarker key={`m-${t.surah}-${t.ayah}`} n={t.ayah} arabicIndic={arabicIndic} />
                ) : (
                  <span className="mushaf-word" key={`${t.surah}-${t.ayah}-${t.index}`}>{t.text}</span>
                ))}
            </div>
          ))
        ) : (
          /* §4.2's documented fallback, if the layout is ever absent. */
          <div className="verse-text">
            {verses.map(v => (
              <span key={`${v.surah}-${v.ayah}`}>
                {verseBody(v)}
                <AyahMarker n={v.ayah} arabicIndic={arabicIndic} />{' '}
              </span>
            ))}
          </div>
        )}
      </div>

      <footer className="mushaf-footer">
        <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronRight size={17} strokeWidth={1.5} />
        </IconButton>
        <SurahFrame n={page} arabicIndic={arabicIndic} />
        <IconButton label="Next page" disabled={page >= 604} onClick={() => onPage(page + 1)}>
          <ChevronLeft size={17} strokeWidth={1.5} />
        </IconButton>
      </footer>
    </div>
  );
}

/* ------------------------------- search ---------------------------------- */

function SearchResults({ hits, query, surahs, arabicIndic, onOpen }: {
  hits: SearchHit[]; query: string; surahs: Surah[]; arabicIndic: boolean;
  onOpen: (s: number, a: number) => void;
}) {
  if (!hits.length) {
    return (
      <EmptyState
        title="Nothing found"
        body={`No verse contains “${query}”. Search ignores harakat, so الرحمن matches ٱلرَّحْمَٰن.`}
      />
    );
  }
  return (
    <div className="hit-list">
      <p className="hit-ref" style={{ marginBlockEnd: 'var(--space-3)' }}>
        {toDigits(hits.length, arabicIndic)} verses
      </p>
      {hits.map(h => {
        const s = surahs.find(x => x.number === h.surah);
        return (
          <div className="hit" key={`${h.surah}-${h.ayah}`} onClick={() => onOpen(h.surah, h.ayah)}>
            <div className="hit-ref">
              {s?.name_transliterated} · {toDigits(h.surah, arabicIndic)}:{toDigits(h.ayah, arabicIndic)}
            </div>
            {/* §5.4: highlighted in the original vocalised text, not the stripped form. */}
            <div className="hit-text" lang="ar" dir="rtl">{verseBody(h)}</div>
          </div>
        );
      })}
    </div>
  );
}

