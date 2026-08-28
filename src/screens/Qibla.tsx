import { useEffect, useState } from 'react';
import { Compass, MapPin } from 'lucide-react';
import { Skeleton } from '../components/ui';
import { toDigits } from '../lib/prayer-math';
import { backendAvailable, defaultLocation, qibla as fetchQibla, type Location, type Qibla as QiblaData } from '../lib/prayer';
import './Qibla.css';

const CARDINALS = [
  { at: 0, label: 'N' }, { at: 45, label: 'NE' }, { at: 90, label: 'E' },
  { at: 135, label: 'SE' }, { at: 180, label: 'S' }, { at: 225, label: 'SW' },
  { at: 270, label: 'W' }, { at: 315, label: 'NW' },
];

/**
 * §7.4.
 *
 * The honesty requirement is the design here: "a laptop has no magnetometer, so
 * the app cannot know which way the user is facing. Show the bearing *from true
 * north* and a one-line instruction on how to align using a phone compass or the
 * sun. Do not fake a live needle."
 *
 * So the dial is fixed with north at the top and the Kaaba marker at the computed
 * bearing. Nothing rotates, because nothing here knows the device's heading.
 */
export default function Qibla({ arabicIndic }: { arabicIndic: boolean }) {
  const [location, setLocation] = useState<Location | null>(null);
  const [data, setData] = useState<QiblaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendAvailable()) {
      setError('The qibla bearing is computed in the Rust core, which is only present in the app itself.');
      return;
    }
    defaultLocation()
      .then(async loc => {
        setLocation(loc);
        setData(await fetchQibla(loc.latitude, loc.longitude));
      })
      .catch(e => setError(String(e)));
  }, []);

  if (error) return <div className="qibla"><p className="qibla-note">{error}</p></div>;
  if (!data || !location) {
    return <div className="qibla"><Skeleton width={260} height={260} radius="var(--radius-full)" /></div>;
  }

  const size = 300;
  const r = size / 2 - 26;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const at = (deg: number, radius: number) => ({
    x: size / 2 + radius * Math.cos(rad(deg)),
    y: size / 2 + radius * Math.sin(rad(deg)),
  });
  const kaaba = at(data.bearing, r);

  return (
    <div className="qibla">
      <header className="qibla-head">
        <div className="home-eyebrow">Qibla</div>
        <h1 className="qibla-title" lang="ar" dir="rtl">القبلة</h1>
        <p className="qibla-place">
          <MapPin size={14} strokeWidth={1.5} />
          {location.city}{location.country ? `, ${location.country}` : ''}
        </p>
      </header>

      <div className="qibla-dial frame frame-flush">
        <svg viewBox={`0 0 ${size} ${size}`} role="img"
          aria-label={`Kaaba bearing ${data.bearing.toFixed(1)} degrees from true north`}>
          <circle cx={size / 2} cy={size / 2} r={r} className="dial-ring" />
          <circle cx={size / 2} cy={size / 2} r={r - 16} className="dial-ring-inner" />

          {Array.from({ length: 72 }, (_, i) => i * 5).map(deg => {
            const major = deg % 45 === 0;
            const a = at(deg, r);
            const b = at(deg, r - (major ? 12 : 6));
            return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              className={major ? 'dial-tick-major' : 'dial-tick'} />;
          })}

          {CARDINALS.map(c => {
            const p = at(c.at, r - 26);
            return (
              <text key={c.label} x={p.x} y={p.y} className={`dial-label${c.at === 0 ? ' dial-north' : ''}`}
                textAnchor="middle" dominantBaseline="middle">{c.label}</text>
            );
          })}

          {/* The bearing line and the Kaaba marker. Fixed, not a needle. */}
          <line x1={size / 2} y1={size / 2} x2={kaaba.x} y2={kaaba.y} className="dial-bearing" />
          <g transform={`translate(${kaaba.x} ${kaaba.y})`}>
            <rect x={-11} y={-11} width={22} height={22} rx={2} className="dial-kaaba" />
            <rect x={-11} y={-3} width={22} height={3} className="dial-kaaba-band" />
          </g>
          <circle cx={size / 2} cy={size / 2} r={3} className="dial-centre" />
        </svg>
      </div>

      <div className="qibla-readout">
        <div className="qibla-stat">
          <span className="qibla-stat-value">
            {toDigits(data.bearing.toFixed(1), arabicIndic)}°
          </span>
          <span className="qibla-stat-label">from true north</span>
        </div>
        <div className="qibla-stat">
          <span className="qibla-stat-value">
            {toDigits(Math.round(data.distanceKm).toLocaleString('en-US'), arabicIndic)}
          </span>
          <span className="qibla-stat-label">km to Makkah</span>
        </div>
      </div>

      {/* §7.4: "Be honest about the limitation". */}
      <div className="qibla-honesty frame">
        <p>
          <Compass size={15} strokeWidth={1.5} />
          <strong>This dial does not know which way you are facing.</strong>
        </p>
        <p>
          A laptop has no magnetometer, so the app can only tell you the bearing, not
          your heading. Point a phone compass at {data.bearing.toFixed(0)}°, or at solar
          noon face your shadow and turn {data.bearing.toFixed(0)}° clockwise from
          straight ahead.
        </p>
        <p className="qibla-fine">
          The bearing is from <strong>true</strong> north. A magnetic compass points to
          magnetic north, which differs from it by several degrees in most places — the
          app does not show that offset, because computing it offline needs a
          geomagnetic model it does not carry, and a guessed figure is worse than none.
        </p>
      </div>
    </div>
  );
}
