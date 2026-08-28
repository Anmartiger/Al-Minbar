import { useEffect, useState } from 'react';
import { getName } from '@tauri-apps/api/app';
import { WindowFrame, useWindowChrome } from './components/WindowFrame';
import Nav from './components/Nav';
import { isTauri } from './lib/tauri';
import {
  applyAppearance, loadAppearance, saveAppearance, watchSystemTheme,
} from './design/theme';
import Home from './screens/Home';
import Gallery from './dev/Gallery';
import Mini from './screens/Mini';
import Quran from './screens/Quran';
import Athkar from './screens/Athkar';
import Qibla from './screens/Qibla';
import Calendar from './screens/Calendar';

/** §11 Phase 1 asks for a /dev/components gallery route. No router in the stack
 *  (§3), and one dev route does not justify adding one - the hash form also works
 *  in a packaged build where a deep path would not resolve. */
const GALLERY_HASH = '#/dev/components';
const MINI_HASH = '#/mini';
const QURAN_HASH = '#/quran';
const ATHKAR_HASH = '#/athkar';
const QIBLA_HASH = '#/qibla';
const CALENDAR_HASH = '#/calendar';
const isGalleryRoute = () =>
  location.pathname === '/dev/components' || location.hash === GALLERY_HASH;
/** §8.3's mini window is a second window on the same bundle, told apart by route. */
const isMiniRoute = () => location.hash === MINI_HASH;
const isQuranRoute = () => location.hash === QURAN_HASH;
const isAthkarRoute = () => location.hash === ATHKAR_HASH;
const isQiblaRoute = () => location.hash === QIBLA_HASH;
const isCalendarRoute = () => location.hash === CALENDAR_HASH;

type Route = 'home' | 'gallery' | 'quran' | 'athkar' | 'qibla' | 'calendar';
const currentRoute = (): Route =>
  isGalleryRoute() ? 'gallery' : isQuranRoute() ? 'quran'
    : isAthkarRoute() ? 'athkar' : isQiblaRoute() ? 'qibla'
    : isCalendarRoute() ? 'calendar' : 'home';

function useHashRoute(): Route {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const sync = () => setRoute(currentRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    // A frameless window has no address bar, so the gallery needs a way in that
    // does not put a developer link on a product screen.
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        location.hash = isGalleryRoute() ? '' : GALLERY_HASH;
        sync();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return route;
}

export default function App() {
  const chrome = useWindowChrome();
  const route = useHashRoute();
  const [{ theme, accent }] = useState(loadAppearance);
  // §1: the product name lives once, in tauri.conf.json - never hard-coded here.
  const [name, setName] = useState('');

  useEffect(() => {
    if (!isTauri()) return;
    getName().then(n => { setName(n); document.title = n; }).catch(() => {});
  }, []);

  useEffect(() => {
    applyAppearance({ theme, accent });
    saveAppearance({ theme, accent });
    if (theme !== 'system') return;
    return watchSystemTheme(() => applyAppearance({ theme, accent }));
  }, [theme, accent]);

  // §8.3: the mini window is frameless with its own chrome, so it never wears
  // the main window's title bar or resize edges.
  if (isMiniRoute()) {
    return <Mini arabicIndic={document.documentElement.lang.startsWith('ar')} />;
  }

  if (!chrome) return null;

  // §5.3: "Default to Arabic-Indic in Arabic UI, Western in English UI." The
  // user-facing toggle is a Settings row and arrives with §7.6 in Phase 6.
  const arabicIndic = document.documentElement.lang.startsWith('ar');

  return (
    <WindowFrame chrome={chrome} title={name}>
      <div className="app-shell">
        {route !== 'gallery' && <Nav current={route} />}
        <div className="app-view">
          {route === 'gallery' ? <Gallery />
            : route === 'quran' ? <Quran arabicIndic={arabicIndic} />
            : route === 'athkar' ? <Athkar arabicIndic={arabicIndic} />
            : route === 'qibla' ? <Qibla arabicIndic={arabicIndic} />
            : route === 'calendar' ? <Calendar arabicIndic={arabicIndic} />
            : <Home arabicIndic={arabicIndic}
                onOpenQuran={() => { location.hash = QURAN_HASH; }}
                onOpenQibla={() => { location.hash = QIBLA_HASH; }} />}
        </div>
      </div>
    </WindowFrame>
  );
}
