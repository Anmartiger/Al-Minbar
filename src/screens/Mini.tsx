import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { BellOff, Settings, Square, SquareArrowOutUpRight } from 'lucide-react';
import { IconButton, Material, ProgressRing, Tooltip } from '../components/ui';
import {
  closeMiniWindow, getStatus, openMainWindow, stopAdhan, type StatusView,
} from '../lib/status';
import { PRAYER_LABELS, formatCountdown, toDigits, type PrayerId } from '../lib/prayer-math';
import './Mini.css';

/**
 * §8.3's compact popover. It renders the Rust scheduler's status rather than
 * computing anything itself, so the panel label, this window and the home screen
 * can never disagree about what happens next.
 */
export default function Mini({ arabicIndic }: { arabicIndic: boolean }) {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const pull = () => getStatus().then(setStatus).catch(() => {});
    pull();
    const unlisten = listen('status-changed', pull);
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    // §8.3: "dismisses on blur and on Esc". Blur is handled in Rust so it also
    // works when focus goes to another application entirely.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void closeMiniWindow(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('keydown', onKey);
      unlisten.then(f => f()).catch(() => {});
    };
  }, []);

  if (!status) return <Material level="thick" className="mini" />;

  const { next, previous, today, missed } = status;
  const remaining = next ? Math.max(0, next.epoch - now) : 0;
  const span = next && previous ? next.epoch - previous.epoch : 0;
  const progress = span > 0 && previous
    ? Math.min(1, Math.max(0, (now - previous.epoch) / span))
    : 0;
  const nextLabel = next ? PRAYER_LABELS[next.name] : null;

  return (
    <Material level="thick" className="mini">
      {today && (
        <div className="mini-hijri" lang="ar" dir="rtl">
          {toDigits(today.hijri.day, arabicIndic)} {today.hijri_month_ar}{' '}
          {toDigits(today.hijri.year, arabicIndic)}
        </div>
      )}

      {next && nextLabel && (
        <div className="mini-hero">
          <div className="mini-ring">
            <ProgressRing
              value={progress}
              size={122}
              thickness={5}
              label={`Elapsed since the previous prayer, ${Math.round(progress * 100)} percent`}
            />
            <div className="mini-ring-inner">
              <span className="mini-name" lang="ar" dir="rtl">{nextLabel.ar}</span>
            </div>
          </div>
          <span className={`mini-countdown${arabicIndic ? ' arabic-indic' : ''}`} role="timer">
            {formatCountdown(remaining, arabicIndic)}
          </span>
          <span className="mini-at">
            {nextLabel.latin} at {toDigits(next.clock, arabicIndic)}
          </span>
        </div>
      )}

      {missed && (
        <div className="mini-missed">
          {PRAYER_LABELS[missed[0]].latin} passed at{' '}
          {toDigits(
            today?.times.find(t => t.epoch === missed[1])?.clock ?? '',
            arabicIndic,
          )}
        </div>
      )}

      <div className="mini-times">
        {today?.times.map(t => {
          const label = PRAYER_LABELS[t.name as PrayerId];
          const isNext = next?.name === t.name && next?.epoch === t.epoch;
          const passed = t.epoch <= now && !isNext;
          return (
            <div className="mini-row" key={t.name} data-current={isNext} data-passed={passed}>
              <span className="mini-row-name" lang="ar" dir="rtl">{label.ar}</span>
              <span>{toDigits(t.clock, arabicIndic)}</span>
            </div>
          );
        })}
      </div>

      <div className="mini-actions">
        <Tooltip text="Open Al-Minabr">
          <IconButton label="Open Al-Minabr" onClick={() => void openMainWindow()}>
            <SquareArrowOutUpRight size={17} strokeWidth={1.5} />
          </IconButton>
        </Tooltip>
        {status.adhanPlaying ? (
          <Tooltip text="Stop the adhan">
            <IconButton label="Stop the adhan" active onClick={() => void stopAdhan()}>
              <Square size={17} strokeWidth={1.5} />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip text="Muting is in the tray menu">
            <IconButton label="Mute options are in the tray menu" disabled>
              <BellOff size={17} strokeWidth={1.5} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip text="Settings">
          <IconButton label="Settings" onClick={() => void openMainWindow()}>
            <Settings size={17} strokeWidth={1.5} />
          </IconButton>
        </Tooltip>
      </div>
    </Material>
  );
}
