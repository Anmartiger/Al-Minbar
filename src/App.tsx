import { useEffect, useMemo, useState } from 'react';
import { getName } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { WindowFrame, useWindowChrome } from './components/WindowFrame';
import Nav from './components/Nav';
import { isTauri } from './lib/tauri';
import {
  applyAppearance, loadAppearance, saveAppearance, watchSystemTheme,
  type Accent, type ThemeChoice,
} from './design/theme';
import { applyTypography, loadTypography } from './design/typography';
import {
  LanguageContext, applyLanguage, defaultLanguage, translate, type Language,
} from './lib/i18n';
import Home from './screens/Home';
import Quran from './screens/Quran';
import Athkar from './screens/Athkar';
import Qibla from './screens/Qibla';
import Calendar from './screens/Calendar';
import Settings from './screens/Settings';
import Gallery from './dev/Gallery';
import Mini from './screens/Mini';

/** §11 Phase 1 asks for a /dev/components gallery route. No router in the stack
 *  (§3), and one dev route does not justify adding one — the hash form also works
 *  in a packaged build where a deep path would not resolve. */
const ROUTES = {
  gallery: '#/dev/components',
  mini: '#/mini',
  quran: '#/quran',
  athkar: '#/athkar',
  qibla: '#/qibla',
  calendar: '#/calendar',
  settings: '#/settings',
} as const;

type Route = keyof typeof ROUTES | 'home';

function currentRoute(): Route {
  if (location.pathname === '/dev/components') return 'gallery';
  const keys = Object.keys(ROUTES) as Array<keyof typeof ROUTES>;
  return keys.find(k => ROUTES[k] === location.hash) ?? 'home';
}

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
        location.hash = currentRoute() === 'gallery' ? '' : ROUTES.gallery;
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

const LANG_KEY = 'al-minabr.language';
const DIGITS_KEY = 'al-minabr.arabic-indic';

export default function App() {
  const chrome = useWindowChrome();
  const route = useHashRoute();
  const [{ theme, accent }, setAppearance] = useState(loadAppearance);
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem(LANG_KEY) as Language) || defaultLanguage());
  // §5.3: "Default to Arabic-Indic in Arabic UI, Western in English UI."
  const [arabicIndic, setArabicIndic] = useState(() => {
    const stored = localStorage.getItem(DIGITS_KEY);
    return stored === null ? defaultLanguage() === 'ar' : stored === 'true';
  });
  // §1: the product name lives once, in tauri.conf.json — never hard-coded here.
  const [name, setName] = useState('');

  useEffect(() => {
    if (!isTauri()) return;
    getName().then(n => { setName(n); document.title = n; }).catch(() => {});
    // The tray's Settings item and the desktop Action both route through here.
    const un = listen('open-settings', () => { location.hash = ROUTES.settings; });
    return () => { un.then(f => f()).catch(() => {}); };
  }, []);

  useEffect(() => {
    applyAppearance({ theme, accent });
    saveAppearance({ theme, accent });
    if (theme !== 'system') return;
    return watchSystemTheme(() => applyAppearance({ theme, accent }));
  }, [theme, accent]);

  /* §9: the flip is applied to the document, with no restart. */
  useEffect(() => {
    applyLanguage(language);
    localStorage.setItem(LANG_KEY, language);
  }, [language]);

  useEffect(() => { localStorage.setItem(DIGITS_KEY, String(arabicIndic)); }, [arabicIndic]);

  /* §5.2: typography applies instantly, so it is restored before first paint. */
  useEffect(() => { applyTypography(loadTypography()); }, []);

  const i18n = useMemo(() => ({
    lang: language,
    t: (k: string, v?: Record<string, string | number>) => translate(language, k, v),
  }), [language]);

  // §8.3: the mini window is frameless with its own chrome, so it never wears the
  // main window's title bar or resize edges.
  if (route === 'mini') {
    return (
      <LanguageContext.Provider value={i18n}>
        <Mini arabicIndic={arabicIndic} />
      </LanguageContext.Provider>
    );
  }

  if (!chrome) return null;

  return (
    <LanguageContext.Provider value={i18n}>
      <WindowFrame chrome={chrome} title={name}>
        <div className="app-shell">
          {route !== 'gallery' && <Nav current={route} />}
          <div className="app-view">
            {route === 'gallery' ? <Gallery />
              : route === 'quran' ? <Quran arabicIndic={arabicIndic} />
              : route === 'athkar' ? <Athkar arabicIndic={arabicIndic} />
              : route === 'qibla' ? <Qibla arabicIndic={arabicIndic} />
              : route === 'calendar' ? <Calendar arabicIndic={arabicIndic} />
              : route === 'settings' ? (
                <Settings
                  theme={theme} accent={accent} language={language} arabicIndic={arabicIndic}
                  onTheme={(t: ThemeChoice) => setAppearance(a => ({ ...a, theme: t }))}
                  onAccent={(a: Accent) => setAppearance(s => ({ ...s, accent: a }))}
                  onLanguage={setLanguage}
                  onArabicIndic={setArabicIndic}
                />
              )
              : <Home arabicIndic={arabicIndic}
                  onOpenQuran={() => { location.hash = ROUTES.quran; }}
                  onOpenQibla={() => { location.hash = ROUTES.qibla; }} />}
          </div>
        </div>
      </WindowFrame>
    </LanguageContext.Provider>
  );
}
