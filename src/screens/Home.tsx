import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, BookOpen, ChevronLeft, Compass, MapPin, Sunrise, Sunset, X } from 'lucide-react';
import {
  Badge, Card, EmptyState, IconButton, List, ListRow, ProgressRing,
  SearchField, Sheet, Skeleton,
} from '../components/ui';
import { getStatus, type StatusView } from '../lib/status';
import { listSurahs, readingState, type ReadingState, type Surah } from '../lib/quran';
import {
  DEFAULT_SETTINGS, PRAYER_LABELS, backendAvailable, currentPrayer, defaultLocation,
  flatten, formatCountdown, prayerWindow, progressOf, qibla as fetchQibla, searchCities,
  segmentAt, toDigits,
  type DayTimes, type Location, type PrayerId, type PrayerTime, type Qibla,
} from '../lib/prayer';
import './Home.css';

/** §7.1's dawn → day → dusk → night wash. Kept at low alpha so it can never
 *  undercut the contrast the §6.3 tokens guarantee. */
function skyFor(nowEpoch: number, sunrise?: PrayerTime, sunset?: PrayerTime) {
  if (!sunrise || !sunset) return { top: 'transparent', strength: '0%' };
  const hourBefore = sunrise.epoch - 3600;
  const hourAfter = sunset.epoch + 3600;
  if (nowEpoch < hourBefore) return { top: '#3B4A7A', strength: '9%' };   // night
  if (nowEpoch < sunrise.epoch + 1800) return { top: '#E8A06A', strength: '10%' }; // dawn
  if (nowEpoch < sunset.epoch - 3600) return { top: '#69A7D8', strength: '7%' };   // day
  if (nowEpoch < hourAfter) return { top: '#D97A5A', strength: '10%' };   // dusk
  return { top: '#3B4A7A', strength: '9%' };                             // night
}

type Props = { arabicIndic: boolean; onOpenQibla?: () => void; onOpenQuran?: () => void };

export default function Home({ arabicIndic, onOpenQibla, onOpenQuran }: Props) {
  const [location, setLocation] = useState<Location | null>(null);
  const [days, setDays] = useState<DayTimes[] | null>(null);
  const [qiblaInfo, setQiblaInfo] = useState<Qibla | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowEpoch, setNowEpoch] = useState(() => Math.floor(Date.now() / 1000));
  const [muted, setMuted] = useState<Partial<Record<PrayerId, boolean>>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Array<Location & { name: string; name_ar: string }>>([]);
  const [trayMissing, setTrayMissing] = useState(false);
  const [trayNoticeDismissed, setTrayNoticeDismissed] = useState(false);
  const [reading, setReading] = useState<{ state: ReadingState; surah?: Surah } | null>(null);

  /* §7.1: the countdown ticks every second. */
  useEffect(() => {
    const id = window.setInterval(() => setNowEpoch(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async (loc: Location) => {
    try {
      const [w, q] = await Promise.all([
        prayerWindow(loc, DEFAULT_SETTINGS),
        fetchQibla(loc.latitude, loc.longitude),
      ]);
      setDays(w);
      setQiblaInfo(q);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (!backendAvailable()) {
      setError('Prayer times are computed in the Rust core, which is only present in the app itself.');
      return;
    }
    defaultLocation()
      .then(loc => { setLocation(loc); return load(loc); })
      .catch(e => setError(String(e)));
  }, [load]);

  /* Recompute when the local day rolls over - §8.7 wants the same on the Rust
     side for the scheduler; this is the window's share of it. */
  const loadedDate = days?.[1]?.date;
  useEffect(() => {
    if (!location || !loadedDate || !days) return;
    const todayTimes = days[1].times;
    const lastOfDay = todayTimes[todayTimes.length - 1];
    if (nowEpoch > lastOfDay.epoch + 6 * 3600) load(location);
  }, [nowEpoch, location, loadedDate, days, load]);

  /* §8.2: "Detect at startup whether a StatusNotifierItem host is registered on
     the session bus. If none is, show a one-time, dismissible first-run card
     explaining the situation and naming the fix - and keep the app fully
     functional without it. Never silently start invisible with no way back." */
  useEffect(() => {
    if (!backendAvailable()) return;
    getStatus()
      .then((s: StatusView | null) => setTrayMissing(Boolean(s && !s.trayAvailable)))
      .catch(() => {});
  }, []);

  /* §7.2: "a 'Continue reading' card on the home screen when a position exists". */
  useEffect(() => {
    if (!backendAvailable()) return;
    readingState().then(async state => {
      if (!state) return;
      const surah = (await listSurahs()).find(s => s.number === state.surah);
      setReading({ state, surah });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sheetOpen || query.trim().length < 2) { setHits([]); return; }
    let alive = true;
    searchCities(query, 12).then(r => { if (alive) setHits(r); }).catch(() => {});
    return () => { alive = false; };
  }, [query, sheetOpen]);

  const all = useMemo(() => (days ? flatten(days) : []), [days]);
  const segment = useMemo(() => segmentAt(all, nowEpoch), [all, nowEpoch]);
  const current = useMemo(() => currentPrayer(all, nowEpoch), [all, nowEpoch]);
  const today = days?.[1];
  const todayTimes = today?.times ?? [];
  const sunrise = todayTimes.find(t => t.name === 'sunrise');
  const sunset = todayTimes.find(t => t.name === 'maghrib');
  const sky = skyFor(nowEpoch, sunrise, sunset);

  const skyStyle = { '--sky-top': sky.top, '--sky-strength': sky.strength } as React.CSSProperties;

  if (error) {
    return (
      <div className="home">
        <EmptyState
          icon={<Compass size={22} strokeWidth={1.5} />}
          title="Prayer times unavailable"
          body={error}
        />
      </div>
    );
  }

  if (!today || !segment) {
    return (
      <div className="home">
        <div className="home-header"><Skeleton width={220} height={34} /></div>
        <div className="hero"><Skeleton width={180} height={180} radius="var(--radius-full)" /></div>
        <List>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <ListRow key={i} title={<Skeleton width={110} height={20} />}
              trailing={<Skeleton width={54} height={18} />} />
          ))}
        </List>
      </div>
    );
  }

  const remaining = segment.next.epoch - nowEpoch;
  const progress = progressOf(segment, nowEpoch);
  const nextLabel = PRAYER_LABELS[segment.next.name];
  const gregorian = new Date(`${today.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="home" style={skyStyle}>
      <div className="home-sky" aria-hidden />

      {trayMissing && !trayNoticeDismissed && (
        <Card className="tray-notice">
          <div className="tray-notice-head">
            <strong>No panel tray on this desktop</strong>
            <IconButton label="Dismiss" onClick={() => setTrayNoticeDismissed(true)}>
              <X size={15} strokeWidth={1.5} />
            </IconButton>
          </div>
          <p>
            Nothing on this session is showing StatusNotifierItem icons, so the countdown
            cannot appear in the panel. Prayer notifications and the adhan still work, and
            this window stays reachable.
          </p>
          <p>
            On GNOME, install the AppIndicator extension, then log out and back in:
          </p>
          <code>sudo apt install gnome-shell-extension-appindicator</code>
        </Card>
      )}

      <header className="home-header">
        <div>
          <div className="home-hijri" lang="ar" dir="rtl">
            {toDigits(today.hijri.day, arabicIndic)} {today.hijri_month_ar}{' '}
            {toDigits(today.hijri.year, arabicIndic)}
          </div>
          <div className="home-gregorian">{gregorian}</div>
        </div>
        <button className="home-place" onClick={() => setSheetOpen(true)}>
          <MapPin size={15} strokeWidth={1.5} />
          {location?.city}
          {location?.country ? `, ${location.country}` : ''}
        </button>
      </header>

      <section className="hero">
        <div className="hero-ring">
          <ProgressRing
            value={progress}
            size={188}
            thickness={6}
            label={`Elapsed since the previous prayer, ${Math.round(progress * 100)} percent`}
          />
          <div className="hero-ring-inner">
            <span className="hero-name" lang="ar" dir="rtl">{nextLabel.ar}</span>
            <span className="hero-at">{nextLabel.latin}</span>
          </div>
        </div>
        <div className="hero-side">
          <span className="hero-label">Time remaining</span>
          <span className={`hero-countdown${arabicIndic ? ' arabic-indic' : ''}`}
            role="timer" aria-live="off">
            {formatCountdown(remaining, arabicIndic)}
          </span>
          <span className="hero-time">
            {nextLabel.latin} at {toDigits(segment.next.clock, arabicIndic)}
          </span>
        </div>
      </section>

      {reading && onOpenQuran && (
        <button className="continue-card" onClick={onOpenQuran}>
          <span className="continue-icon"><BookOpen size={18} strokeWidth={1.5} /></span>
          <span className="continue-body">
            <span className="continue-label">Continue reading</span>
            <span className="continue-ref">
              <span lang="ar" dir="rtl">{reading.surah?.name_ar}</span>
              {' · '}
              {toDigits(reading.state.surah, arabicIndic)}:{toDigits(reading.state.ayah, arabicIndic)}
            </span>
          </span>
          <ChevronLeft size={17} strokeWidth={1.5} />
        </button>
      )}

      <div className="home-list">
        <List>
          {todayTimes.map(t => {
            const label = PRAYER_LABELS[t.name];
            const isCurrent = current?.name === t.name && current?.epoch === t.epoch;
            const passed = t.epoch <= nowEpoch && !isCurrent;
            return (
              <ListRow
                key={t.name}
                tinted={isCurrent}
                className={passed ? 'prayer-row-passed' : ''}
                title={<span className="prayer-row-name" lang="ar" dir="rtl">{label.ar}</span>}
                subtitle={<span className="prayer-row-latin">{label.latin}</span>}
                trailing={
                  <>
                    <span className="prayer-row-time">{toDigits(t.clock, arabicIndic)}</span>
                    {t.is_prayer ? (
                      <IconButton
                        label={`${muted[t.name] ? 'Enable' : 'Mute'} the ${label.latin} notification`}
                        onClick={() => setMuted(m => ({ ...m, [t.name]: !m[t.name] }))}
                      >
                        {muted[t.name]
                          ? <BellOff size={16} strokeWidth={1.5} />
                          : <Bell size={16} strokeWidth={1.5} />}
                      </IconButton>
                    ) : (
                      <Badge tone="outline">not a prayer</Badge>
                    )}
                  </>
                }
                separatorInset="var(--space-4)"
              />
            );
          })}
        </List>
      </div>

      <footer className="home-footer">
        {sunrise && (
          <span className="home-chip">
            <Sunrise size={14} strokeWidth={1.5} />
            Sunrise {toDigits(sunrise.clock, arabicIndic)}
          </span>
        )}
        {sunset && (
          <span className="home-chip">
            <Sunset size={14} strokeWidth={1.5} />
            Sunset {toDigits(sunset.clock, arabicIndic)}
          </span>
        )}
        {qiblaInfo && (
          <button className="home-chip" data-interactive="true" onClick={onOpenQibla}>
            <Compass size={14} strokeWidth={1.5} />
            Qibla {toDigits(qiblaInfo.bearing.toFixed(1), arabicIndic)}° ·{' '}
            {toDigits(Math.round(qiblaInfo.distanceKm).toLocaleString('en-US'), arabicIndic)} km
          </button>
        )}
      </footer>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} side="bottom" title="Location">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <SearchField value={query} onChange={setQuery}
            placeholder="Search a city — English or العربية" />
          {hits.length > 0 ? (
            <List>
              {hits.map(c => (
                <ListRow
                  key={`${c.name}-${c.latitude}-${c.longitude}`}
                  leading={<MapPin size={17} strokeWidth={1.5} />}
                  title={
                    <span className="city-hit">
                      <span>{c.name}</span>
                      {c.name_ar && <span className="city-hit-ar" lang="ar" dir="rtl">{c.name_ar}</span>}
                    </span>
                  }
                  subtitle={`${c.country} · ${c.timezone}`}
                  onClick={() => {
                    const picked: Location = {
                      latitude: c.latitude, longitude: c.longitude,
                      timezone: c.timezone, city: c.name, country: c.country,
                    };
                    setLocation(picked);
                    void load(picked);
                    setSheetOpen(false);
                    setQuery('');
                  }}
                />
              ))}
            </List>
          ) : query.trim().length >= 2 ? (
            <EmptyState
              title="No city found"
              body="Try another spelling, or a nearby larger town. The database is bundled, so this works with no connection."
            />
          ) : (
            <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-caption)', margin: 0 }}>
              Searches a bundled offline list of about 70,000 cities. Nothing leaves the machine.
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
