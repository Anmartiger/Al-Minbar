<div align="center">
  <img src="src-tauri/icons/128x128.png" width="80" alt="">
</div>


<h1 align="center"># Al-Minabr · المنبر</h1>

**Prayer times, Quran, athkar, qibla and a Hijri calendar for the Linux desktop.**

<br clear="left">

Al-Minabr is background-first. It lives in your panel with a live countdown to the next
prayer, plays the adhan whether or not a window is open, and only builds its interface
when you actually ask for one. Everything works offline — the prayer engine, the full
Uthmani Quran, the athkar and the city database are all bundled. The single exception is
recitation audio, which you download per surah, on purpose.

Arabic and English throughout, switchable at runtime with a complete right-to-left flip.

---

## Features

| | |
|---|---|
| **Prayer times** | Thirteen calculation methods, Asr madhab, high-latitude rules and per-prayer offsets. Live countdown in the panel, desktop notifications, and adhan playback from the Rust core so it sounds with no window open. |
| **Quran** | The full Uthmani text from Tanzil. Mushaf mode renders the real King Fahd Complex 604-page line layout — 8,820 printed lines, not reflowed verses. Search ignores diacritics, so `الرحمن` finds `ٱلرَّحْمَٰن`. Saheeh International translation, Tafsir al-Muyassar, bookmarks and per-surah recitation. |
| **Athkar** | حصن المسلم — 132 chapters, 267 adhkar with their repeat counts, tap counters and daily completion tracking. |
| **Qibla** | Bearing from true north and great-circle distance to Makkah. It does not pretend to know which way you are facing — a laptop has no magnetometer. |
| **Calendar** | Hijri month grid alongside Gregorian dates, marking Ramadan, the last ten nights, both Eids, Arafah, Ashura and the new year, with the ±1 day adjustment every serious app needs. |

---

## Installing

Two packages are published with every release. Pick one.

| | Size | Best for |
|---|---|---|
| **`.deb`** | ~9 MB | Ubuntu, Debian, Mint, Pop!\_OS — **recommended** |
| **AppImage** | ~166 MB | Any distribution, no root, nothing installed system-wide |

Releases are built inside Ubuntu 22.04, so a single package runs on 22.04 through 26.04
and their derivatives.

### Option A — the `.deb` package

**1. Download it** from the [latest release](../../releases/latest), or from a terminal:

```bash
curl -LO https://github.com/Anmartiger/Al-Minbar/releases/latest/download/Al-Minabr_0.1.0_amd64.deb
```

**2. Install it.** Use `apt`, not `dpkg` — it pulls in the three libraries the app needs
instead of leaving you with a broken package:

```bash
sudo apt install ./Al-Minabr_0.1.0_amd64.deb
```

**3. Launch it** from your applications menu, or:

```bash
al-minabr
```

That is the whole installation. Continue to [First run](#first-run) below.

### Option B — the AppImage

**1. Download and make it executable:**

```bash
curl -LO https://github.com/Anmartiger/Al-Minbar/releases/latest/download/Al-Minabr_0.1.0_amd64.AppImage
chmod +x Al-Minabr_0.1.0_amd64.AppImage
```

**2. Install FUSE 2 if you are on Ubuntu 24.04 or newer.** Those releases ship FUSE 3
only, and every AppImage needs FUSE 2 to mount itself:

```bash
sudo apt install libfuse2
```

If you would rather not install it, run the AppImage without FUSE instead:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./Al-Minabr_0.1.0_amd64.AppImage
```

**3. Run it:**

```bash
./Al-Minabr_0.1.0_amd64.AppImage
```

The AppImage is self-contained — it carries its own WebKitGTK and GStreamer, which is
why it is so much larger than the `.deb`.

### First run

**1. Check the panel icon appeared.** Al-Minabr shows a countdown to the next prayer
there, and that is where it lives when no window is open.

**On GNOME, the icon needs an extension.** GNOME dropped tray support years ago, so:

```bash
sudo apt install gnome-shell-extension-appindicator
```

Then log out and back in. Ubuntu ships this enabled already; plain Debian GNOME and some
Mint setups do not. Without it the app still runs — notifications and the adhan work
normally, and the window opens from the applications menu — and it tells you so on first
run rather than starting invisibly.

**2. Set your city.** Open **Settings → Location** and search for it. The city database
is bundled, so this works with no connection.

**3. Pick a calculation method** in **Settings → Prayer times** if your local mosque
follows a specific one. The default is Muslim World League.

**4. Autostart is already on.** Al-Minabr will start with your session from now on,
hidden, showing only the panel item. Turn it off in **Settings → Startup & panel widget**, where you can also change the panel
label and the global shortcut (`Super+Shift+P` by default).

Closing the window returns the app to the panel — it does not quit. To quit, use the
panel menu, press `Ctrl+Q`, or turn on **Settings → Startup & panel widget → Closing the window quits the app**.

### Updating

Download the newer package and install it the same way. `apt` replaces the old version
in place, and your settings, bookmarks and athkar progress are untouched.

### Uninstalling

```bash
sudo apt remove al-minabr
```

That leaves your data behind. To remove it as well:

```bash
rm -rf ~/.local/share/al-minabr ~/.config/al-minabr ~/.cache/al-minabr
rm -f ~/.config/autostart/al-minabr.desktop
```

The cache directory is where downloaded recitations live, so it can be the largest of
the three. **Settings → Data & storage** shows its size and clears it from inside the app.

---

## Building from source

**1. Install the build dependencies:**

```bash
sudo apt install build-essential curl wget file libssl-dev libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev patchelf python3
```

**2. Install Rust** if you do not have it:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

You also need Node 18 or newer. Python 3 is used by the data importers.

**3. Install the npm dependencies and run it:**

```bash
npm install
npm run tauri dev
```

**4. Build a release package:**

```bash
npm run tauri build -- --bundles deb,appimage
```

The results land in `src-tauri/target/release/bundle/`.

> **Your local package will only run on your own distribution.** glibc symbols point
> forward, not backward: a binary linked on Ubuntu 26.04 requires `GLIBC_2.39`, which
> 22.04 does not have, so the package installs there and then refuses to start. Use the
> GitHub Actions workflow below to produce packages that run everywhere.

### What the build checks

`npm run build` is not just a bundler. It regenerates the font manifest from the files
in `assets/fonts/`, fails on any accent colour below 4.5:1 contrast in any theme, runs
the countdown-logic and locale-parity checks, and rebuilds the content database from the
committed sources — refusing to write it if the verse, surah, page or sajda counts are
wrong.

`cargo test` in `src-tauri/` runs 74 tests across the prayer engine, scheduler, settings,
city search and Hijri calendar, including a fixture that checks prayer times against
Aladhan for four cities on four dates.

### Launch flags

| Flag | Effect |
|---|---|
| `--hidden` | Start with the panel item only, no window. This is what the autostart entry uses. |
| `--toggle` | Toggle the mini window on a running instance. |
| `--quran` | Open the Quran reader. |
| `--settings` | Open Settings. |

---

## Releasing with GitHub Actions

Two workflows live in `.github/workflows/`:

| Workflow | Runs on | Does |
|---|---|---|
| `check.yml` | Every push and pull request | Build gates, type check, 74 Rust tests, clippy |
| `release.yml` | Tags matching `v*`, or manually | Builds the `.deb` and AppImage inside Ubuntu 22.04 and publishes a release |

### Publishing a release

**1. Allow Actions to create releases.** In your repository, go to **Settings → Actions →
General → Workflow permissions** and select **Read and write permissions**. The release
job cannot upload assets without it. You only do this once.

**2. Set the version.** It comes from `src-tauri/tauri.conf.json`, and it should match the
tag you are about to push:

```bash
git commit -am "release: 0.1.0"
```

**3. Tag and push:**

```bash
git tag v0.1.0
git push origin main --tags
```

**4. Watch it build** in the **Actions** tab. The job takes roughly 15–25 minutes, most
of it compiling Rust on the first run — later runs reuse the cargo cache and are much
faster.

**5. Collect the release.** When the job finishes, a draft-free release appears under
**Releases** with both packages attached and generated release notes. The install
commands at the top of this README point at `releases/latest`, so they start working
immediately.

### Testing without publishing

To check the build without cutting a release, open the **Actions** tab, choose
**Release**, and click **Run workflow**. It builds and verifies both packages and uploads
them as workflow artifacts, but publishes nothing.

### What the release job verifies

It does more than compile, because a package that builds is not necessarily a package
that installs:

- **The glibc floor.** After linking, it reads the highest `GLIBC_*` symbol the binary
  requires and fails if anything exceeds `GLIBC_2.35`, which is what Ubuntu 22.04 ships.
  This is what catches a build that has escaped the container.
- **The content database**, by reading back the verse, surah, page and sajda counts.
- **The `.deb` itself**, by installing it inside the container and confirming the binary
  is executable and that `StartupWMClass` and the desktop `Actions` survived packaging.

If you are adapting the workflow, one detail is easy to miss: `patchelf` must be
installed. The AppImage's GStreamer plugin needs it, and without it the bundler reports
only `failed to run linuxdeploy` — it discards the plugin's actual error unless you pass
`-v`.

---

## Project layout

| Path | Contents |
|---|---|
| `src/screens/` | Prayer times, Quran, athkar, qibla, calendar, settings |
| `src/components/ui/` | The hand-built component library — no component kit, by design |
| `src/locales/` | Every UI string; a build gate fails if the two bundles disagree |
| `src-tauri/src/prayer/` | Prayer engine, tabular Hijri calendar, qibla |
| `src-tauri/src/scheduler.rs` | The tick loop — no long sleeps, survives suspend |
| `src-tauri/src/tray.rs` | Panel widget: label, icon states, menu |
| `src-tauri/vendor/salah/` | Vendored for three patches — see its `PATCH.md` |
| `scripts/` | Data importers and build gates |
| `data/` | Committed source texts the content database is built from |

---

## Data and licences

Every bundled text keeps its source and licence, listed in the app under
**Settings → About**:

| Content | Source | Licence |
|---|---|---|
| Quran (Uthmani), search text, metadata, Saheeh International | [Tanzil](https://tanzil.net) | CC BY 3.0, verbatim |
| Tafsir al-Muyassar | 6,236 ayah-scoped entries | — |
| Mushaf line layout | King Fahd Complex, via the quran.com API | — |
| حصن المسلم | [hisnmuslim.com](https://www.hisnmuslim.com), the book's own publisher | — |
| Cities | [GeoNames](https://www.geonames.org) `cities5000` | CC BY 4.0 |
| Fonts | Amiri and Amiri Quran (Khaled Hosny), Inter (Rasmus Andersson) | SIL OFL 1.1 |

Recitation audio is not bundled — it runs to hundreds of megabytes. Download it per
surah from [EveryAyah](https://everyayah.com) inside the app.

[`DESIGN_NOTES.md`](DESIGN_NOTES.md) records the design decisions behind the app, and
every place the implementation departs from its specification, with the reason.
