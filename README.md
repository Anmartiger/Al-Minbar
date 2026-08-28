# Al-Minabr · المنبر

Prayer times, the Quran, athkar, qibla and a Hijri calendar for the Linux desktop —
built because nothing available fit the criteria.

Background-first: it lives in the panel with a live countdown to the next prayer, and the
window is one of its surfaces rather than the whole app. Everything works with the network
cable unplugged.

> **Status: Phase 3 of 7 — background service, panel widget and adhan.** Prayer times,
> the panel countdown, the mini window, notifications and scheduling all work. The Quran
> reader, athkar, qibla screen and calendar are still to come. See [`Claude.md`](Claude.md)
> §11 for the phase plan and [`DESIGN_NOTES.md`](DESIGN_NOTES.md) for the decisions taken
> so far.

## Requirements

Ubuntu 22.04+ / Debian 12+ / Mint 21+, Wayland or X11. To build:

```bash
sudo apt install libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev libxdo-dev
```

Plus Node 18+ and a stable Rust toolchain.

## Running

```bash
npm install && npm run tauri dev
```

`npm run build` regenerates the font manifest, enforces the accent-contrast gate, runs the
countdown-logic check, then type-checks and builds the frontend. `cargo test` in
`src-tauri/` runs the prayer, scheduler, settings and city-search suites plus the §4.1
correctness fixture.

Launch flags: `--hidden` starts with the panel item only and no window (what the autostart
entry uses), `--toggle` toggles the mini window on an already-running instance.

## Layout

| Path | What |
|---|---|
| `src/design/` | Design tokens (§6.2/§6.3), theme resolution, generated font manifest |
| `src/components/` | Hand-built UI — no component kit, by design (§3) |
| `src-tauri/src/prayer/` | Prayer-time engine, tabular Hijri calendar, qibla |
| `src-tauri/src/scheduler.rs` | The tick loop: no long sleeps, survives suspend (§8.7) |
| `src-tauri/src/tray.rs` | Panel widget — label, icon states, menu (§8.2) |
| `src-tauri/src/audio.rs` | Adhan playback in Rust, so it works with no window (§8.6) |
| `src-tauri/vendor/salah/` | Vendored for three patches — see its `PATCH.md` |
| `scripts/generate-fonts.mjs` | Reads `assets/fonts/`, emits `@font-face` + a typed manifest |
| `scripts/check-contrast.mjs` | Fails the build if any accent drops below 4.5:1 (§6.3) |
| `scripts/generate-icons.mjs` | Draws the minbar app mark; no image dependency |
| `assets/fonts/` | Amiri Quran, Amiri, Inter — all SIL OFL 1.1 |

Add a font file to `assets/fonts/` and it appears in the app on the next build; nothing is
hard-coded (§5.1).

## Licences

Application code: see repository. Bundled fonts are SIL Open Font License 1.1, with the
licence texts in `assets/fonts/LICENSES/`. Quran text, athkar and tafsir carry their own
attribution in the in-app "About the data" screen (§4.2) once Phase 4 lands.
