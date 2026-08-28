import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download, Loader2, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward, Square, X,
} from 'lucide-react';
import { Badge, IconButton, Material, Tooltip } from './ui';
import {
  ayahSource, downloadSurah, formatBytes, listReciters, playbackBlockedReason,
  surahAudio, type DownloadProgress, type Reciter, type SurahAudio,
} from '../lib/recitation';
import './Player.css';

export type PlayerTarget = { surah: number; ayahCount: number; name: string };

type Repeat = 'off' | 'verse' | 'range';
const SPEEDS = [0.75, 1, 1.25, 1.5];

/**
 * §7.2's persistent bottom player bar.
 *
 * One `<audio>` element is reused across verses rather than one per verse: the
 * highlight must move exactly on the verse boundary, and that is simplest when a
 * single element's `ended` event is the only thing that advances it.
 */
export default function Player({
  target, currentAyah, onAyah, onClose,
}: {
  target: PlayerTarget;
  currentAyah: number | null;
  onAyah: (ayah: number | null) => void;
  onClose: () => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [reciter, setReciter] = useState<Reciter | null>(null);
  const [status, setStatus] = useState<SurahAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>('off');
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [position, setPosition] = useState({ at: 0, of: 0 });
  const [online, setOnline] = useState(navigator.onLine);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    listReciters().then(r => { setReciters(r); setReciter(r[0] ?? null); });
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const refresh = useCallback(async () => {
    if (!reciter) return;
    setStatus(await surahAudio(reciter.id, target.surah, target.ayahCount));
  }, [reciter, target.surah, target.ayahCount]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* Load and play whichever ayah is current. */
  useEffect(() => {
    const el = audio.current;
    if (!el || !reciter || currentAyah == null) return;
    let alive = true;
    ayahSource(reciter.id, target.surah, currentAyah).then(src => {
      if (!alive || !src) { if (alive) setPlaying(false); return; }
      el.src = src;
      el.playbackRate = speed;
      el.play().then(() => alive && setPlaying(true)).catch(() => alive && setPlaying(false));
    });
    return () => { alive = false; };
  }, [currentAyah, reciter, target.surah, speed]);

  /* §7.2: "the highlight must move on the verse boundary, never mid-verse" -
     so advancing happens only here, when the element reports the verse ended. */
  const onEnded = () => {
    if (currentAyah == null) return;
    if (repeat === 'verse') {
      audio.current?.play().catch(() => {});
      return;
    }
    const next = currentAyah + 1;
    if (next > target.ayahCount) {
      if (repeat === 'range') onAyah(1);
      else { onAyah(null); setPlaying(false); }
      return;
    }
    onAyah(next);
  };

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (currentAyah == null) { onAyah(1); return; }
    if (el.paused) { el.play().then(() => setPlaying(true)).catch(() => {}); }
    else { el.pause(); setPlaying(false); }
  };

  const startDownload = async () => {
    if (!reciter) return;
    abort.current = new AbortController();
    setProgress({ done: 0, total: target.ayahCount, bytes: 0, failed: 0 });
    await downloadSurah(reciter, target.surah, target.ayahCount, setProgress, abort.current.signal);
    setProgress(null);
    await refresh();
  };

  const blocked = playbackBlockedReason(status, online);
  const downloading = progress !== null;
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Material level="thick" className="player">
      <audio
        ref={audio}
        onEnded={onEnded}
        onTimeUpdate={e => {
          const el = e.currentTarget;
          setPosition({ at: el.currentTime, of: el.duration || 0 });
        }}
        onError={() => setPlaying(false)}
      />

      <div className="player-main">
        <Tooltip text={blocked ?? (playing ? 'Pause' : 'Play')}>
          <span>
            <IconButton
              label={playing ? 'Pause' : 'Play'}
              disabled={Boolean(blocked) || downloading}
              onClick={toggle}
            >
              {playing ? <Pause size={18} strokeWidth={1.5} /> : <Play size={18} strokeWidth={1.5} />}
            </IconButton>
          </span>
        </Tooltip>

        <IconButton label="Previous verse" disabled={Boolean(blocked) || !currentAyah}
          onClick={() => onAyah(Math.max(1, (currentAyah ?? 1) - 1))}>
          <SkipBack size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label="Next verse" disabled={Boolean(blocked) || !currentAyah}
          onClick={() => onAyah(Math.min(target.ayahCount, (currentAyah ?? 0) + 1))}>
          <SkipForward size={16} strokeWidth={1.5} />
        </IconButton>

        <div className="player-ref">
          <span className="player-surah" lang="ar" dir="rtl">{target.name}</span>
          <span className="player-ayah">
            {currentAyah ? `${target.surah}:${currentAyah}` : `${target.ayahCount} verses`}
          </span>
        </div>

        <input
          className="player-scrub"
          type="range"
          aria-label="Position in the verse"
          min={0}
          max={Math.max(position.of, 0.1)}
          step={0.05}
          value={position.at}
          disabled={Boolean(blocked) || !currentAyah}
          onChange={e => {
            const el = audio.current;
            if (el) el.currentTime = Number(e.target.value);
          }}
        />

        <select className="player-select" aria-label="Reciter"
          value={reciter?.id ?? ''} disabled={downloading}
          onChange={e => setReciter(reciters.find(r => r.id === e.target.value) ?? null)}>
          {reciters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <Tooltip text={repeat === 'off' ? 'Repeat off' : repeat === 'verse' ? 'Repeat this verse' : 'Repeat the surah'}>
          <IconButton
            label="Repeat mode"
            active={repeat !== 'off'}
            onClick={() => setRepeat(r => (r === 'off' ? 'verse' : r === 'verse' ? 'range' : 'off'))}
          >
            {repeat === 'verse' ? <Repeat1 size={16} strokeWidth={1.5} /> : <Repeat size={16} strokeWidth={1.5} />}
          </IconButton>
        </Tooltip>

        <select className="player-select player-speed" aria-label="Playback speed"
          value={speed} onChange={e => {
            const v = Number(e.target.value);
            setSpeed(v);
            if (audio.current) audio.current.playbackRate = v;
          }}>
          {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
        </select>

        {status && !status.cached && !downloading && (
          <Tooltip text={online ? 'Download this surah for offline listening' : 'No connection'}>
            <span>
              <IconButton label="Download this surah" disabled={!online} onClick={startDownload}>
                <Download size={16} strokeWidth={1.5} />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {downloading && (
          <IconButton label="Cancel the download" onClick={() => abort.current?.abort()}>
            <Square size={15} strokeWidth={1.5} />
          </IconButton>
        )}

        <IconButton label="Close the player" onClick={onClose}>
          <X size={16} strokeWidth={1.5} />
        </IconButton>
      </div>

      {/* §4.2: "a visible download manager showing size and progress". */}
      {downloading && progress && (
        <div className="player-download">
          <Loader2 size={14} strokeWidth={1.5} className="spin" />
          <span>Downloading {progress.done} / {progress.total}</span>
          <span className="player-bar"><span style={{ inlineSize: `${pct}%` }} /></span>
          <span className="player-size">{formatBytes(progress.bytes)}</span>
          {progress.failed > 0 && <Badge tone="outline">{progress.failed} failed</Badge>}
        </div>
      )}

      {!downloading && status && status.cached > 0 && status.cached < status.total && (
        <div className="player-download">
          <span>{status.cached} of {status.total} verses cached · {formatBytes(status.bytes)}</span>
        </div>
      )}

      {blocked && !downloading && <div className="player-note">{blocked}</div>}
    </Material>
  );
}
