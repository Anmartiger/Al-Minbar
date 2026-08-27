import { useEffect, useState } from 'react';
import { getName } from '@tauri-apps/api/app';
import { isTauri } from './lib/tauri';
import { WindowFrame, useWindowChrome } from './components/WindowFrame';
import {
  ACCENTS, applyAppearance, loadAppearance, resolveTheme, saveAppearance,
  watchSystemTheme, type Accent, type ThemeChoice,
} from './design/theme';
import { BUNDLED_FAMILIES } from './design/fonts.generated';
import Gallery from './dev/Gallery';
import './App.css';

const THEMES: ThemeChoice[] = ['light', 'dark', 'system'];

/** §11 Phase 1 asks for a /dev/components gallery route. No router in the stack
 *  (§3), and one dev route does not justify adding one - the hash form also works
 *  in a packaged build where deep paths would not resolve. */
const GALLERY_HASH = '#/dev/components';
const isGalleryRoute = () =>
  location.pathname === '/dev/components' || location.hash === GALLERY_HASH;

function useHashRoute(): boolean {
  const [gallery, setGallery] = useState(isGalleryRoute);
  useEffect(() => {
    const sync = () => setGallery(isGalleryRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  return gallery;
}

export default function App() {
  const chrome = useWindowChrome();
  const gallery = useHashRoute();
  const [{ theme, accent }, setAppearance] = useState(loadAppearance);
  // §1: the product name lives once, in tauri.conf.json - never hard-coded here.
  const [name, setName] = useState('');

  useEffect(() => {
    // §1: the name lives in tauri.conf.json. Outside Tauri there is no backend to
    // ask, so the header is empty rather than hard-coding a second copy of it.
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

  if (gallery) {
    return <WindowFrame chrome={chrome} title={name}><Gallery /></WindowFrame>;
  }

  return (
    <WindowFrame chrome={chrome} title={name}>
      <div className="phase0" dir="ltr">
        <h1>{name}</h1>
        <p className="sub">
          Phase 1 — design system.{' '}
          <a href={GALLERY_HASH} className="gallery-link">Open the component gallery →</a>
        </p>

        <section className="panel">
          <h2>Appearance</h2>
          <div className="row">
            <span className="k">Theme</span>
            <div className="segmented">
              {THEMES.map(t => (
                <button key={t} aria-pressed={theme === t}
                  onClick={() => setAppearance(a => ({ ...a, theme: t }))}>{t}</button>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="k">Accent</span>
            <div className="swatches">
              {ACCENTS.map(a => (
                <button key={a} className="swatch" aria-label={a} aria-pressed={accent === a}
                  style={{ background: `var(--accent-${a})` }}
                  onClick={() => setAppearance(s => ({ ...s, accent: a as Accent }))} />
              ))}
            </div>
          </div>
          <div className="row">
            <span className="k">Resolved</span>
            <span className="v">{resolveTheme(theme)}</span>
          </div>
        </section>

        <section className="panel">
          <h2>Window chrome (§6.7)</h2>
          <div className="row"><span className="k">Session type</span><span className="v">{chrome.sessionType}</span></div>
          <div className="row"><span className="k">Transparent</span><span className="v">{String(chrome.transparent)}</span></div>
          <div className="row"><span className="k">Corners</span><span className="v">{chrome.transparent ? 'rounded (radius xl)' : 'square — transparency unreliable'}</span></div>
          <div className="row"><span className="k">Shadow margin</span><span className="v">{chrome.shadowMargin}px</span></div>
        </section>

        <section className="panel">
          <h2>Type ramp (§6.2) — Inter</h2>
          <div className="ramp">
            <div className="d">Display 34/700</div>
            <div className="t1">Title1 28/700</div>
            <div className="t2">Title2 22/600</div>
            <div className="hl">Headline 17/600</div>
            <div className="bd">Body 15/400</div>
            <div className="cp">Caption 12/500 · tabular 0123456789</div>
          </div>
        </section>

        <section className="panel">
          <h2>Bundled fonts (§5.1) — read from assets/fonts/ at build time</h2>
          {BUNDLED_FAMILIES.map(f => (
            <div className="row" key={f.name}>
              <span className="k">{f.name}</span>
              <span className="v">{f.weights.join(' · ')}{f.arabic ? '  · Arabic' : ''}</span>
            </div>
          ))}
          <p className="quran specimen-quran" lang="ar" dir="rtl">
            بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
          </p>
          <p className="arabic specimen-ar" lang="ar" dir="rtl">
            الفجر · الشروق · الظهر · العصر · المغرب · العشاء
          </p>
          <p className="note">
            Quran line above is Amiri Quran at line-height {'{'}--lh-quran{'}'} = 2.2. Below 2.0 the
            tashkeel clips (DESIGN_NOTES.md §2.2). Prayer names are Amiri.
          </p>
        </section>
      </div>
    </WindowFrame>
  );
}
