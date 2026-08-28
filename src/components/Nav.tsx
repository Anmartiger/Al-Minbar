import { BookOpen, CalendarDays, Compass, Hand, Sunrise } from 'lucide-react';
import { Material, Tooltip } from './ui';
import './Nav.css';

/** The five modules §1 names. A rail rather than a bar: the window is wide, the
 *  destinations are few and fixed, and it keeps the vertical space for content. */
export const DESTINATIONS = [
  { hash: '', label: 'Prayer times', icon: Sunrise },
  { hash: '#/quran', label: 'Quran', icon: BookOpen },
  { hash: '#/athkar', label: 'Athkar', icon: Hand },
  { hash: '#/qibla', label: 'Qibla', icon: Compass },
  { hash: '#/calendar', label: 'Calendar', icon: CalendarDays },
] as const;

export default function Nav({ current }: { current: string }) {
  return (
    <Material level="thin" as="nav" className="nav" aria-label="Sections">
      {DESTINATIONS.map(d => {
        const active = (location.hash || '') === d.hash;
        const Icon = d.icon;
        return (
          <Tooltip key={d.label} text={d.label}>
            <a
              className="nav-item"
              href={d.hash || '#'}
              aria-current={active ? 'page' : undefined}
              aria-label={d.label}
              onClick={e => {
                // An empty hash needs clearing explicitly; href="#" would leave it.
                if (!d.hash) { e.preventDefault(); history.pushState('', '', location.pathname); window.dispatchEvent(new Event('hashchange')); }
              }}
            >
              <Icon size={19} strokeWidth={1.5} />
            </a>
          </Tooltip>
        );
      })}
      <span className="nav-spacer" />
      <span className="nav-mark" aria-hidden>{current}</span>
    </Material>
  );
}
