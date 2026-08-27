import { useEffect, useState } from 'react';
import { getName } from '@tauri-apps/api/app';
import { WindowFrame, useWindowChrome } from './components/WindowFrame';
import { isTauri } from './lib/tauri';
import {
  applyAppearance, loadAppearance, saveAppearance, watchSystemTheme,
} from './design/theme';
import Home from './screens/Home';
import Gallery from './dev/Gallery';

/** §11 Phase 1 asks for a /dev/components gallery route. No router in the stack
 *  (§3), and one dev route does not justify adding one - the hash form also works
 *  in a packaged build where a deep path would not resolve. */
const GALLERY_HASH = '#/dev/components';
const isGalleryRoute = () =>
  location.pathname === '/dev/components' || location.hash === GALLERY_HASH;

function useHashRoute(): boolean {
  const [gallery, setGallery] = useState(isGalleryRoute);
  useEffect(() => {
    const sync = () => setGallery(isGalleryRoute());
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
  return gallery;
}

export default function App() {
  const chrome = useWindowChrome();
  const gallery = useHashRoute();
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

  if (!chrome) return null;

  // §5.3: "Default to Arabic-Indic in Arabic UI, Western in English UI." The
  // user-facing toggle is a Settings row and arrives with §7.6 in Phase 6.
  const arabicIndic = document.documentElement.lang.startsWith('ar');

  return (
    <WindowFrame chrome={chrome} title={name}>
      {gallery ? <Gallery /> : <Home arabicIndic={arabicIndic} />}
    </WindowFrame>
  );
}
