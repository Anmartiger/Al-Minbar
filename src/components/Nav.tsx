import { BookOpen, CalendarDays, Compass, Hand, Settings as SettingsIcon, Sunrise } from 'lucide-react';
import { Material, Tooltip } from './ui';
import { useT } from '../lib/i18n';
import './Nav.css';

/** The five modules §1 names. A rail rather than a bar: the window is wide, the
 *  destinations are few and fixed, and it keeps the vertical space for content. */
export const DESTINATIONS = [
  { hash: '', key: 'nav.prayer', icon: Sunrise },
  { hash: '#/quran', key: 'nav.quran', icon: BookOpen },
  { hash: '#/athkar', key: 'nav.athkar', icon: Hand },
  { hash: '#/qibla', key: 'nav.qibla', icon: Compass },
  { hash: '#/calendar', key: 'nav.calendar', icon: CalendarDays },
  { hash: '#/settings', key: 'nav.settings', icon: SettingsIcon },
] as const;

export default function Nav({ current }: { current: string }) {
  const { t } = useT();
  return (
    <Material level="thin" as="nav" className="nav" aria-label={t('nav.sections')}>
      {DESTINATIONS.map(d => {
        const active = (location.hash || '') === d.hash;
        const Icon = d.icon;
        const label = t(d.key);
        return (
          <Tooltip key={d.key} text={label}>
            <a
              className="nav-item"
              href={d.hash || '#'}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
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
