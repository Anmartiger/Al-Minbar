<img src="src-tauri/icons/128x128.png" width="72" align="left" alt="">

# Al-Minabr · المنبر

**Prayer times, the Quran, athkar, qibla and a Hijri calendar for the Linux desktop.**
Built because nothing available fit the criteria.

<br clear="left">

Background-first: it lives in the panel with a live countdown to the next prayer, and
the window is one of its surfaces rather than the whole app. Everything works with the
network cable unplugged — the prayer engine, the full Uthmani Quran, the athkar and the
city database are all bundled, and nothing is fetched at runtime except recitation audio
you choose to download.

![The prayer times screen](docs/shots/home.png)

## What it does

| | |
|---|---|
| **Prayer times** | Thirteen calculation methods, Asr madhab, high-latitude rules, per-prayer offsets. Live countdown in the panel, desktop notifications, and the adhan played from the Rust core so it sounds with no window open. |
| **Quran** | The full Uthmani text from Tanzil. Mushaf mode renders the real King Fahd Complex 604-page line layout — 8,820 printed lines, not flowed verses. Diacritic-insensitive search: `الرحمن` finds `ٱلرَّحْمَٰن`. Saheeh International translation, Tafsir al-Muyassar, bookmarks, and per-surah recitation download. |
| **Athkar** | حصن المسلم — 132 chapters, 267 adhkar with their repeat counts, tap counters and daily completion. |
| **Qibla** | Bearing from true north and great-circle distance. It does not pretend to know which way you are facing; a laptop has no magnetometer. |
| **Calendar** | Hijri month grid with Gregorian dates, Ramadan, the last ten nights, both Eids, Arafah, Ashura and the new year, plus the ±1 day adjustment every serious app has. |

Arabic and English throughout, switchable at runtime with a complete RTL flip.

## Install

Download the `.deb` or `AppImage` from [Releases](../../releases).

```bash
sudo dpkg -i al-minabr_*.deb || sudo apt-get -f install
```

Releases are built inside Ubuntu 22.04, so one package runs on 22.04 through 26.04.
Building on a newer release would produce a binary requiring a glibc that older ones do
not have.

The app starts with the session and shows only a panel item. Launch it from the app grid
for a window; closing that window returns it to the panel rather than quitting.

**On GNOME you need the AppIndicator extension** for the panel item to appear at all:

```bash
sudo apt install gnome-shell-extension-appindicator
```

Ubuntu ships it enabled. Debian GNOME and some Mint setups do not. Without it the app
still runs — notifications and the adhan work, and the window is reachable — and it says
so on first run rather than starting invisibly.

## Building

```bash
sudo apt install libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev libxdo-dev
npm install && npm run tauri dev
```

Node 18+, a stable Rust toolchain, and Python 3 for the data importers.

`npm run build` regenerates the font manifest, enforces the accent-contrast gate, runs
the countdown-logic and locale-parity checks, rebuilds the content database from the
committed sources, then type-checks and builds the frontend. `cargo test` in `src-tauri/`
runs the prayer, scheduler, settings, city-search and calendar suites plus the §4.1
correctness fixture.

Launch flags: `--hidden` starts with the panel item only and no window (what the
autostart entry uses), `--toggle` toggles the mini window on a running instance.

## Layout

| Path | What |
|---|---|
| `src/screens/` | Prayer times, Quran, athkar, qibla, calendar, settings |
| `src/components/ui/` | The hand-built component library — no component kit, by design |
| `src/locales/` | Every UI string; a build gate fails if the two bundles disagree |
| `src-tauri/src/prayer/` | Prayer engine, tabular Hijri calendar, qibla |
| `src-tauri/src/scheduler.rs` | The tick loop: no long sleeps, survives suspend |
| `src-tauri/src/tray.rs` | Panel widget — label, icon states, menu |
| `src-tauri/vendor/salah/` | Vendored for three patches — see its `PATCH.md` |
| `scripts/` | Data importers and the build gates |
| `data/` | Committed source texts the content database is built from |

## Data and licences

Every bundled text keeps its source and licence, shown in the app under
**Settings → About the data**:

- **Quran (Uthmani), search text, metadata, Saheeh International** — [Tanzil](https://tanzil.net), CC BY 3.0, verbatim
- **Tafsir al-Muyassar** — 6,236 ayah-scoped entries
- **Mushaf line layout** — King Fahd Complex, via the quran.com API
- **حصن المسلم** — from [hisnmuslim.com](https://www.hisnmuslim.com), the book's own publisher
- **Cities** — [GeoNames](https://www.geonames.org) `cities5000`, CC BY 4.0
- **Fonts** — Amiri and Amiri Quran (Khaled Hosny), Inter (Rasmus Andersson), both SIL OFL 1.1

Recitation audio is not bundled — it is hundreds of megabytes. Download per surah from
[EveryAyah](https://everyayah.com) inside the app; the cache size and a clear action are
in Settings.

[`DESIGN_NOTES.md`](DESIGN_NOTES.md) records the design decisions and every place the
implementation departs from the specification, with the reason.
