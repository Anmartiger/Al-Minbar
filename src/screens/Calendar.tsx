import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { IconButton, Skeleton, Tooltip } from '../components/ui';
import { toDigits } from '../lib/prayer-math';
import { backendAvailable } from '../lib/prayer';
import './Calendar.css';

type CalendarDay = {
  hijriDay: number;
  gregorian: string;
  weekday: number;
  isToday: boolean;
  occasionLabelsEn: string[];
  occasionLabelsAr: string[];
};

type CalendarMonth = {
  year: number;
  month: number;
  nameAr: string;
  nameEn: string;
  days: CalendarDay[];
  leadingBlanks: number;
};

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const ADJUST_KEY = 'al-minabr.hijri-adjustment';

export default function Calendar({ arabicIndic }: { arabicIndic: boolean }) {
  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const [at, setAt] = useState<{ year: number; month: number } | null>(null);
  const [adjust, setAdjust] = useState(() => {
    const raw = Number(localStorage.getItem(ADJUST_KEY));
    return Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
  });

  const load = useCallback(async (year?: number, m?: number) => {
    if (!backendAvailable()) return;
    const data = await invoke<CalendarMonth>('hijri_month', {
      year: year ?? null, month: m ?? null, adjustment: adjust,
    });
    setMonth(data);
    setAt({ year: data.year, month: data.month });
  }, [adjust]);

  useEffect(() => { void load(at?.year, at?.month); }, [adjust]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { localStorage.setItem(ADJUST_KEY, String(adjust)); }, [adjust]);

  const step = (by: number) => {
    if (!at) return;
    let m = at.month + by;
    let y = at.year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    void load(y, m);
  };

  if (!backendAvailable()) {
    return <div className="calendar"><p className="cal-note">
      The Hijri calendar is computed in the Rust core, which is only present in the app itself.
    </p></div>;
  }
  if (!month) return <div className="calendar"><Skeleton height={280} /></div>;

  const weekdays = arabicIndic ? WEEKDAYS_AR : WEEKDAYS_EN;

  return (
    <div className="calendar">
      <header className="cal-head">
        <IconButton label="Previous month" onClick={() => step(-1)}>
          <ChevronRight size={17} strokeWidth={1.5} />
        </IconButton>
        <div className="cal-title">
          <div className="cal-month" lang="ar" dir="rtl">{month.nameAr}</div>
          <div className="cal-sub">
            {month.nameEn} · {toDigits(month.year, arabicIndic)} AH
          </div>
        </div>
        <IconButton label="Next month" onClick={() => step(1)}>
          <ChevronLeft size={17} strokeWidth={1.5} />
        </IconButton>
      </header>

      <div className="cal-grid frame">
        {weekdays.map(d => <div className="cal-weekday" key={d}>{d}</div>)}
        {Array.from({ length: month.leadingBlanks }, (_, i) => (
          <div className="cal-cell cal-blank" key={`b${i}`} />
        ))}
        {month.days.map(d => {
          const labels = arabicIndic ? d.occasionLabelsAr : d.occasionLabelsEn;
          const cell = (
            <div className={`cal-cell${d.isToday ? ' cal-today' : ''}${labels.length ? ' cal-marked' : ''}`}
              key={d.hijriDay}>
              <span className="cal-hijri">{toDigits(d.hijriDay, arabicIndic)}</span>
              <span className="cal-greg">{toDigits(Number(d.gregorian.slice(8)), arabicIndic)}</span>
              {labels.length > 0 && <span className="cal-dot" aria-hidden />}
            </div>
          );
          return labels.length
            ? <Tooltip key={d.hijriDay} text={labels.join(' · ')}>{cell}</Tooltip>
            : cell;
        })}
      </div>

      <ul className="cal-legend">
        {month.days.filter(d => d.occasionLabelsEn.length).map(d => (
          <li key={d.hijriDay}>
            <span className="cal-legend-day">{toDigits(d.hijriDay, arabicIndic)}</span>
            <span>{(arabicIndic ? d.occasionLabelsAr : d.occasionLabelsEn).join(' · ')}</span>
          </li>
        ))}
      </ul>

      {/* §7.5: "A ±1 day Hijri adjustment setting, because local moon-sighting
          differs from the tabular calendar and every serious app has this." */}
      <div className="cal-adjust frame">
        <div>
          <div className="home-eyebrow">Hijri adjustment</div>
          <p className="cal-note">
            This is the tabular calendar. Local moon sighting can differ from it by a
            day, so shift it to match your masjid.
          </p>
        </div>
        <div className="cal-adjust-controls">
          <IconButton label="One day earlier" disabled={adjust <= -1}
            onClick={() => setAdjust(a => Math.max(-1, a - 1))}>
            <Minus size={15} strokeWidth={1.5} />
          </IconButton>
          <span className="cal-adjust-value">
            {adjust > 0 ? '+' : ''}{toDigits(adjust, arabicIndic)}
          </span>
          <IconButton label="One day later" disabled={adjust >= 1}
            onClick={() => setAdjust(a => Math.min(1, a + 1))}>
            <Plus size={15} strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
