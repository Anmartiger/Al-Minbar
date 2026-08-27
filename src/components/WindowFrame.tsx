import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { appWindow, isTauri, winCall } from '../lib/tauri';
import { Minus, Square, Copy, X } from 'lucide-react';
import './WindowFrame.css';

/** Mirrors WindowChrome in src-tauri/src/lib.rs. */
export type WindowChrome = {
  sessionType: 'wayland' | 'x11' | 'unknown';
  transparent: boolean;
  shadowMargin: number;
};

const RESIZE_DIRECTIONS = [
  ['n', 'North'], ['s', 'South'], ['w', 'West'], ['e', 'East'],
  ['nw', 'NorthWest'], ['ne', 'NorthEast'], ['sw', 'SouthWest'], ['se', 'SouthEast'],
] as const;

export function useWindowChrome(): WindowChrome | null {
  const [chrome, setChrome] = useState<WindowChrome | null>(null);
  useEffect(() => {
    // Outside Tauri (plain vite) there is no backend: take the opaque fallback,
    // which is exactly the X11 path.
    const fallback: WindowChrome = { sessionType: 'unknown', transparent: false, shadowMargin: 0 };
    if (!isTauri()) { setChrome(fallback); return; }
    invoke<WindowChrome>('window_chrome').then(setChrome).catch(() => setChrome(fallback));
  }, []);
  return chrome;
}

export function WindowFrame({ chrome, title, children }: {
  chrome: WindowChrome;
  title: string;
  children: ReactNode;
}) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = appWindow();
    if (!win) return;
    let alive = true;
    const sync = () => win.isMaximized().then(m => { if (alive) setMaximized(m); }).catch(() => {});
    sync();
    const un = win.onResized(sync);
    return () => { alive = false; un.then(f => f()).catch(() => {}); };
  }, []);

  // §6.7: rounded corners only where transparency is reliable. On X11 without a
  // compositor transparency produces black corners, so that path stays square.
  const style = {
    '--frame-margin': `${chrome.shadowMargin}px`,
    '--frame-radius': chrome.transparent && !maximized ? 'var(--radius-xl)' : '0px',
    '--frame-shadow': chrome.transparent && !maximized ? 'var(--shadow-window)' : 'none',
  } as React.CSSProperties;

  return (
    <div className="shell" style={style}>
      {/* Maximised windows have no edges to grab. */}
      {!maximized && RESIZE_DIRECTIONS.map(([cls, dir]) => (
        <div
          key={cls}
          className={`resize-handle resize-${cls}`}
          onMouseDown={e => {
            if (e.button !== 0) return;
            e.preventDefault();
            winCall(w => w.startResizeDragging(dir));
          }}
        />
      ))}

      <div className="window">
        <header
          className="titlebar"
          data-tauri-drag-region
          onDoubleClick={() => winCall(w => w.toggleMaximize())}
        >
          <span className="titlebar-title" data-tauri-drag-region>{title}</span>
          <div className="window-controls">
            <button className="window-control" aria-label="Minimize"
              onClick={() => winCall(w => w.minimize())}>
              <Minus size={15} strokeWidth={1.5} />
            </button>
            <button className="window-control" aria-label={maximized ? 'Restore' : 'Maximize'}
              onClick={() => winCall(w => w.toggleMaximize())}>
              {maximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={13} strokeWidth={1.5} />}
            </button>
            <button className="window-control close" aria-label="Close"
              onClick={() => winCall(w => w.close())}>
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>
        </header>
        <main className="window-body">{children}</main>
      </div>
    </div>
  );
}
