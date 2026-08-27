# Al-Minabr · المنبر

Prayer times, the Quran, athkar, qibla and a Hijri calendar for the Linux desktop —
built because nothing available fit the criteria.

Background-first: it lives in the panel with a live countdown to the next prayer, and the
window is one of its surfaces rather than the whole app. Everything works with the network
cable unplugged.

> **Status: Phase 0 of 7 — foundation.** Design tokens, theming, window chrome and font
> loading. No prayer engine yet. See [`Claude.md`](Claude.md) §11 for the phase plan and
> [`DESIGN_NOTES.md`](DESIGN_NOTES.md) for the visual contract.

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

`npm run build` regenerates the font manifest, enforces the accent-contrast gate, then
type-checks and builds the frontend.

## Layout

| Path | What |
|---|---|
| `src/design/` | Design tokens (§6.2/§6.3), theme resolution, generated font manifest |
| `src/components/` | Hand-built UI — no component kit, by design (§3) |
| `src-tauri/` | Rust core: window construction, session detection |
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
