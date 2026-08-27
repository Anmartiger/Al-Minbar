## 1. What we are building
 
A single desktop application for Linux that a Muslim user keeps open (or in the tray)
all day. It does four things, and it does them beautifully:
 
| Module | Purpose |
|---|---|
| **Prayer times (Athan)** | Accurate daily prayer times, a live countdown to the next prayer, adhan audio playback, and native desktop notifications. |
| **Quran reader** | The full Uthmani text, mushaf-page and continuous-reading modes, verse-by-verse recitation audio, translation and tafsir panels. |
| **Athkar** | Morning, evening, post-prayer, sleep and general adhkar with tap counters and progress. |
| **Qibla & Hijri calendar** | Qibla bearing from the user's coordinates, and a Hijri/Gregorian calendar with Islamic dates marked. |
 
**Name:** **Al-Minabr** (المنبر). Identifiers derived from it, used consistently:
package/binary `al-minabr`, app id `com.alminabr.app`, desktop entry
`al-minabr.desktop`, `StartupWMClass=al-minabr`, XDG dirs `al-minabr` (§8.7). The name
lives once, in `src-tauri/tauri.conf.json`; every other surface reads it from there.
Do not hard-code the product name in a component.
 
**This app is background-first.** It is not a window that happens to have a tray icon —
it is a resident service with a panel presence, and the window is one of its surfaces.
§8 is therefore as load-bearing as the design section; build it as specified, not as an
afterthought bolted on at the end.
 
**Non-negotiables**, in priority order:
 
1. **It must be beautiful.** This is not a utility with a UI bolted on. The visual
   quality bar is a first-party Apple app. If a screen looks like a generic Bootstrap
   dashboard, it is wrong and must be redone.
2. **Arabic typography is the centrepiece,** not an afterthought. See §5.
3. **It must work with the network cable unplugged.** See §4.
4. **It must feel native on Ubuntu** — installs from a `.deb`, has a proper desktop
   entry, respects XDG directories, and survives a reboot with its settings intact.
---
 
## 2. Target platform
 
| Target | Notes |
|---|---|
| **Ubuntu 26.04 LTS** ("Resolute Raccoon", GNOME 50) | **Primary target.** Wayland-only — see below. |
| Ubuntu 24.04 LTS (GNOME 46) | Wayland default, X11 session still available. |
| Ubuntu 22.04 LTS (GNOME 42) | Oldest supported; the glibc floor for packaging (§11, Phase 7). |
| Debian 12+ · Linux Mint 21+/22 (Cinnamon) · Pop!\_OS | Debian-derived, GTK/WebKitGTK. |
 
- x86_64 primary; keep the build aarch64-clean (no x86 intrinsics, no hard-coded arch
  paths) but do not spend time testing it.
- **Ubuntu 26.04 ships GNOME 50, which removed the X.org session entirely — the desktop
  runs only on Wayland.** So Wayland is the path that must be *right*, not the path that
  must merely work. Every windowing decision (§6.7) and the mini-window positioning
  (§8.3) is designed for Wayland first, with the X11 branch kept only for Mint/Cinnamon,
  XFCE and the older Ubuntu LTSes. Do not ship anything that quietly depends on being
  able to do an X11-only thing.
- The app must run **natively on Wayland, not through Xwayland.** If you find yourself
  reaching for an X11 API to solve a problem, that is the signal to solve it differently.
- **Verify the tray on 26.04 specifically.** GNOME's AppIndicator support comes from a
  shell extension, and extensions routinely break across a GNOME major version. Ubuntu
  ships it enabled, but confirm it actually works under GNOME 50 rather than assuming —
  and if it does not, the §8.2 no-SNI-host fallback becomes the primary experience there
  and you tell me immediately, because that changes the product.
- Ship for GNOME's default theme but never inherit colours from the system GTK theme —
  the app paints its own palette so it looks identical on Mint's Cinnamon and on GNOME.
---
 
## 3. Stack
 
```
Shell        Tauri v2                       (Rust core + WebKitGTK webview)
Frontend     React 18 + TypeScript + Vite
Styling      Tailwind CSS + a CSS-variable design-token layer (§6)
Motion       Framer Motion (spring physics only — see §6.5)
State        Zustand, one store per module, persisted through the Rust side
Database     SQLite via tauri-plugin-sql (Quran text, bookmarks, reading state)
Settings     tauri-plugin-store → JSON in XDG config dir
Audio        Frontend: HTMLAudioElement for recitation.
             Rust side: rodio for the adhan, so it fires when the window is closed.
Scheduling   Rust: tokio timer task + tauri-plugin-notification
Tray/panel   Tauri core tray-icon feature (TrayIconBuilder → StatusNotifierItem)
Autostart    tauri-plugin-autostart (enabled by default — see §8.1)
Shortcut     tauri-plugin-global-shortcut (toggles the mini window)
D-Bus        zbus, for the SNI-host check and the login1 suspend signal (§8.2, §8.7)
Single inst. tauri-plugin-single-instance (clicking the launcher must focus the
             running window, not open a second one)
Packaging    tauri bundler → .deb + AppImage; Flatpak manifest as a stretch goal
```
 
**Rules about dependencies:**
 
- Ask before adding any dependency not listed above. A 40 MB chart library for one
  progress ring is not acceptable.
- No UI component kit (no MUI, no Chakra, no shadcn scaffolding dumped in wholesale).
  The component library in §6.6 is hand-built, because the whole point is the look.
- Icons: `lucide-react`, restyled to a consistent 1.5px stroke. Nothing else.
---
 
## 4. Offline data — where every byte comes from
 
The app ships with its data. No API is required for anything except optional audio
downloads.
 
### 4.1 Prayer times
 
- Calculate locally with the **`salah`** crate (the Rust port of Batoul Apps' Adhan
  library). If it proves unmaintained against the current Rust edition, port the Adhan
  algorithm directly from the reference implementation rather than reaching for an API.
- Must support all of these calculation methods, selectable in Settings:
  Muslim World League · Egyptian General Authority · Umm al-Qura (Makkah) ·
  University of Islamic Sciences Karachi · ISNA · Institute of Geophysics Tehran ·
  Shia Ithna-Ashari (Ja'fari) · Kuwait · Qatar · Singapore · Turkey (Diyanet) ·
  Moonsighting Committee · **Custom** (user enters Fajr and Isha angles directly).
- Asr madhab toggle: Shafi'i/Maliki/Hanbali (shadow ×1) vs Hanafi (shadow ×2).
- High-latitude rule: Middle of the Night · One Seventh · Angle Based · None.
- Per-prayer manual offset in minutes, −59 to +59, for matching the local masjid.
- **Default location: Ajloun, Jordan (32.3326 N, 35.7517 E, Asia/Amman).** The user can
  change it; this is just what a fresh install shows.
- Location input: search a bundled offline city database (a trimmed GeoNames
  `cities5000` extract — name, country, lat, lon, timezone; keep it under 2 MB and
  include Arabic city names in the searchable index) **or** type coordinates directly.
  Timezone resolution via `chrono-tz`. Do not call a geolocation service.
**Correctness gate:** for Ajloun, Makkah, London and Jakarta, on four dates spread
across the year, the computed times must match Aladhan's published times for the same
method and coordinates to within **one minute**. Write this as a test with the expected
values committed in the fixture file.
 
### 4.2 Quran
 
- **Text:** Uthmani script from the Tanzil project (`quran-uthmani.txt`), converted at
  build time into the bundled SQLite database. Include the simple/imlaei script as a
  second column — it is what diacritic-insensitive search runs against.
- **Metadata:** 114 surahs, 6,236 verses (Hafs/Kufan numbering), 604 mushaf pages,
  30 juz, 60 hizb, 240 hizb-quarters, 556 ruku, 7 manzil, and the 15 sajda markers
  defined in Tanzil's `quran-data.xml`. Verify these counts in a test after the import;
  a wrong import is the single most damaging bug this app can ship. (Schools differ on
  whether 14 or 15 of those are recited prostrations — render all 15 markers and let the
  About/data screen note the difference rather than silently picking a side.)
- **Mushaf page layout:** use the King Fahd Complex (Madani) 604-page line layout data
  published by QUL (qul.tarteel.ai) so page mode breaks lines where the printed mushaf
  breaks them. If that data cannot be sourced, page mode falls back to
  "verses that belong to page N, flowed" — and you tell me, rather than faking the
  line breaks.
- **Translations:** bundle English (Saheeh International) as the default. Structure the
  schema so more translations are rows in a `translations` table, not new code.
- **Tafsir:** bundle at least one Arabic tafsir (Tafsir al-Muyassar — short, ayah-scoped,
  fits the panel). Same schema treatment as translations.
- **Attribution:** every bundled text keeps its licence and source attribution in an
  in-app "About the data" screen. This is required, not optional.
- **Recitation audio is NOT bundled** — it is hundreds of megabytes. Instead:
  - Per-surah or per-juz download from EveryAyah / QUL audio, with a visible download
    manager showing size and progress.
  - Cached under the XDG cache dir; a Settings screen shows total cache size with a
    "clear" action.
  - Reciters: Mishary Alafasy, Abdul Basit (Murattal), Husary, Sudais, Minshawi.
  - If nothing is downloaded and the user has no connection, the play button is
    disabled with a clear explanation — never a silent failure.
### 4.3 Athkar
 
Bundled as JSON, compiled into the database. Categories: أذكار الصباح · أذكار المساء ·
أذكار بعد الصلاة · أذكار النوم · أذكار الاستيقاظ · الرقية الشرعية · أدعية متفرقة ·
التسبيح (free counter). Each dhikr carries: Arabic text, repeat count, optional
reference (Bukhari/Muslim/etc.), and optional short benefit note. Source from a
well-known compilation such as حصن المسلم and credit it.
 
### 4.4 Adhan audio
 
Bundle 3–4 muezzin recordings as compressed audio (Makkah, Madinah, Al-Aqsa, and a
short "beep" alternative), plus a separate short Fajr adhan. Keep total under 15 MB.
Let the user point at their own audio file too.
 
---
 
## 5. Arabic typography — read this section twice
 
This is the part most apps get wrong and it is the part this app is judged on.
 
### 5.1 The provided fonts
 
Font files are in `assets/fonts/`. They are copied into the bundle as Tauri resources
and registered with `@font-face` at startup — **not** loaded from a CDN, and not assumed
to exist on the system.
 
At build time, generate `src/design/fonts.generated.ts` from whatever is actually in
that folder: family name, file path, weight, style. If I add a font file and rebuild,
it must appear in the app without anyone editing code by hand.
 
### 5.2 In-app font switching (required feature)
 
Settings → Typography lets the user choose fonts **independently for three contexts**:
 
| Context | What it styles |
|---|---|
| **Quran** | The mushaf/verse text only |
| **Athkar** | Dhikr body text |
| **Interface** | Arabic UI chrome — labels, buttons, prayer names |
 
For each context the user gets: font family (a dropdown showing each name **rendered in
its own face**), size, line-height, and letter-spacing — with a **live preview pane**
showing real text (بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ for Quran, a real dhikr for athkar)
that updates as the sliders move. Changes apply instantly across the app, with no restart.
 
The family dropdown lists **bundled fonts first**, then **system Arabic fonts**
discovered by shelling out to `fc-list :lang=ar family` from the Rust side and
de-duplicating. If `fontconfig` is missing, degrade to bundled fonts only and say so
in the UI.
 
Reset-to-default per context. Settings persist across restarts.
 
### 5.3 Rendering rules (non-negotiable)
 
- `dir="rtl"` on the document when the interface language is Arabic; per-element `dir`
  for Arabic text inside an English interface. Use CSS logical properties
  (`margin-inline-start`, `padding-inline-end`) everywhere — never `margin-left`.
- **Never apply `letter-spacing` to Arabic text.** It breaks the joins between letters.
  The letter-spacing slider in §5.2 is disabled (greyed, with a tooltip) for any Arabic
  font — it exists for Latin only.
- Quran text needs `line-height` of **2.0–2.4**. Tashkeel sits above and below the
  baseline and gets clipped at tighter values. Test with آية 2:282 (the longest verse).
- Enable ligatures and contextual alternates:
  `font-feature-settings: "liga" 1, "calt" 1, "rlig" 1;`
- Do **not** use `text-transform`, `font-synthesis` faux-bold, or `text-shadow` on
  Arabic. If a weight is needed, use a real weight from the family.
- Numbers: give the user a toggle between Arabic-Indic (٠١٢٣) and Western (0123)
  digits for verse numbers and clock times. Default to Arabic-Indic in Arabic UI,
  Western in English UI.
- Verse-end markers use the Quranic end-of-ayah symbol ۝ (U+06DD) with the number
  composed inside where the font supports it; otherwise render a circular badge.
- Latin text uses Inter (bundled), never a system fallback that shifts on other distros.
### 5.4 Search must be diacritic-insensitive
 
Searching "الرحمن" must find "ٱلرَّحْمَٰن". Normalise on both sides: strip tashkeel
(U+064B–U+0652, U+0670), normalise alef forms (أ إ آ ٱ → ا), teh marbuta (ة → ه),
alef maksura (ى → ي), and tatweel (ـ). Store the normalised column in SQLite and index
it with FTS5. Highlight matches in the original vocalised text, not the normalised form.
 
---
 
## 6. Design system — the Apple-like look
 
**Before writing a single component, read `assets/reference/ui-reference.png` and write
`DESIGN_NOTES.md`.** The reference image outranks the descriptions below wherever they
disagree; this section covers what the image cannot tell you (motion, states, dark mode).
 
### 6.1 The feel, in one paragraph
 
Generous whitespace. Content floating on soft, layered surfaces rather than boxed in
hard-bordered panels. Corners rounded enough to read as friendly, never so much they
look like pills. Depth carried by *blur and shadow*, not by lines. One accent colour used
sparingly — most of the interface is neutral, and colour marks the one thing that
matters on screen. Type that is large and confident at the top of a view and quiet
everywhere else. Motion that feels like something with mass moved, not like a CSS
transition ran.
 
### 6.2 Tokens
 
Every value below is a CSS custom property on `:root`, redefined under
`[data-theme="dark"]`. **No component may hard-code a hex value, a radius, or a duration.**
 
```
Radius     xs 6 · sm 10 · md 14 · lg 20 · xl 28 · full 9999
           Cards use lg. The window itself uses xl. Buttons use md. Chips use full.
 
Spacing    4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72   (a 4px grid, no exceptions)
 
Type       Display 34/700 · Title1 28/700 · Title2 22/600 · Headline 17/600
           Body 15/400 · Callout 14/400 · Caption 12/500 · Micro 11/500
           Latin: Inter, with -0.01em tracking on Display and Title1 only.
 
Shadow     sm  0 1px 2px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.06)
           md  0 4px 12px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)
           lg  0 12px 32px rgba(0,0,0,.10), 0 2px 8px rgba(0,0,0,.05)
           In dark mode shadows shrink and a 1px rgba(255,255,255,.06) top
           highlight replaces them as the depth cue.
 
Border     Hairline only: 1px solid rgba(0,0,0,.06) light / rgba(255,255,255,.08) dark.
           Never a 2px border. Never a mid-grey border.
```
 
### 6.3 Colour
 
Two full themes plus "follow system". Light is warm and paper-like, not clinical white;
dark is a deep neutral charcoal, **not** pure black and not blue-tinted.
 
```
Light   bg #F7F6F3   surface #FFFFFF   surface-2 #FBFAF8   text #1C1B19
        text-2 #6B6862   separator rgba(0,0,0,.07)
Dark    bg #131312   surface #1C1C1B   surface-2 #242423   text #F2F1EE
        text-2 #9C9A94   separator rgba(255,255,255,.08)
```
 
Accent is user-selectable in Settings from a palette of six (default a deep
green-teal — appropriate to the subject and legible on both themes). Every accent
must pass **4.5:1 contrast against both surface colours**; write a check that fails the
build if one does not.
 
Semantic colours for prayer states: *upcoming* (neutral), *current window* (accent),
*passed* (dimmed to text-2), *missed* (never red — this app does not scold the user;
use a quiet outline).
 
### 6.4 Materials
 
The signature Apple move is translucency. Implement a `<Material>` primitive with three
levels — `thin`, `regular`, `thick` — each combining `backdrop-filter: blur()` +
saturation boost + a translucent background colour.
 
Used on: the sidebar, the top toolbar when content scrolls under it, sheets and popovers,
and the tray-adjacent mini window if you build one.
 
**WebKitGTK caveat:** `backdrop-filter` support is inconsistent across WebKitGTK
versions on Ubuntu — likely fine on 26.04, likely not on 22.04. Feature-detect it at startup with `CSS.supports('backdrop-filter',
'blur(1px)')`; when unsupported, fall back to an opaque surface colour at the same
lightness. The layout must be pixel-identical either way — only the translucency
disappears. Test this path deliberately; do not assume it works.
 
### 6.5 Motion
 
- One easing curve for almost everything: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Durations: micro-interactions 150ms · view transitions 300ms · sheets 400ms.
- Anything that a finger would "grab" (sheets, the mushaf page turn, drawers) uses a
  Framer Motion **spring** (`stiffness 260, damping 30`), not a duration.
- Press states scale to `0.97` and lift shadow — that tactile squish is most of the feel.
- **Honour `prefers-reduced-motion`:** all transforms collapse to opacity fades. This is
  a correctness requirement, not a nicety.
- No spinners where a skeleton will do. No bouncing. No confetti. Ever.
### 6.6 Components to build (hand-rolled, in `src/components/ui/`)
 
`Card` · `Material` · `SegmentedControl` · `Switch` (iOS-style track+knob) · `Slider` ·
`ListRow` (with inset separators that stop before the row's inline padding — this
detail is very visible and usually gotten wrong) · `Sheet` (bottom/side, drag-to-dismiss) ·
`Popover` · `Button` (filled / tinted / plain) · `IconButton` · `Badge` · `SearchField` ·
`ProgressRing` · `Skeleton` · `Toast` · `Tooltip` · `EmptyState`.
 
Each ships with its light and dark appearance, hover/active/focus/disabled states, and a
visible keyboard focus ring (`2px accent, 2px offset`). Build these in Phase 1, in a
`/dev/components` gallery route, before any real screen exists.
 
### 6.7 Window chrome
 
- `decorations: false` in the Tauri config, with a custom 44px draggable title bar
  (`data-tauri-drag-region`) carrying the window controls on the **right** (GNOME
  convention) and the view title in the centre.
- Rounded window corners need `transparent: true` plus a transparent-clear body and a
  rounded root container. Wayland always composites, so this is the *reliable* case and
  Ubuntu 26.04 should look right. **On X11 without a running compositor it produces black
  corners.** Detect the session type at startup (`XDG_SESSION_TYPE`) and, where
  transparency is unreliable, fall back to square window corners with the interior cards
  still rounded. Never ship the black-corner artefact.
- Draw your own drop shadow into the transparent margin around the window; frameless
  Wayland windows get no server-side shadow, and without one the app looks pasted onto
  the desktop rather than sitting above it. Leave ~24px of transparent padding for it and
  account for that in the window size.
- Frameless windows lose server-side resize handles: implement resize edges yourself
  (`start_resize_dragging` on the Tauri window) with an 8px hit zone on all sides and
  corners, and correct cursor shapes.
- Minimum window size 900×640. Remember size and position across restarts. Support
  double-click-to-maximise on the title bar and standard keyboard shortcuts.
---
 
## 7. Screens
 
### 7.1 Prayer (home)
 
The screen the app opens to and the one that must be gorgeous.
 
- **Hero:** the next prayer's name in Arabic (large, in the chosen Quran-grade face),
  its time, and a live countdown (`2:14:08`) ticking every second. Behind it, a
  `ProgressRing` showing elapsed proportion of the interval between the previous and
  next prayer.
- **The five prayers plus sunrise** as a vertical list of `ListRow`s: Arabic name,
  Latin transliteration in caption size, time, and a per-prayer notification
  bell toggle. The current window's row is tinted with the accent; passed rows dim.
- **Header:** Hijri date (large, Arabic) with the Gregorian date beneath it, the city
  name with a pin icon that opens the location sheet.
- **Footer strip:** sunrise/sunset times, and the day's Qibla bearing as a small tappable
  chip that jumps to the Qibla screen.
- Background: a very subtle vertical gradient that shifts with the time of day
  (dawn → day → dusk → night), at low enough saturation that text contrast never drops.
  This is the single most effective "premium" touch in the app — get it subtle, and test
  the contrast at every hour.
### 7.2 Quran reader
 
- **Surah browser:** a searchable list — surah number in a decorative frame, Arabic name,
  Latin name, revelation place (مكية/مدنية), verse count. Search is diacritic-insensitive
  (§5.4) and matches surah names, verse text, and `2:255`-style references.
- **Two reading modes**, switchable by `SegmentedControl` in the toolbar:
  - **Mushaf mode** — one 604-layout page at a time, lines justified as printed, page
    number in a decorative frame at the bottom, arrow-key and swipe page turns with a
    spring animation. Surah headers rendered as a framed band; بسم الله الرحمن الرحيم
    centred where it belongs.
  - **Reading mode** — continuous scroll, one verse per block, comfortable measure
    (`max-inline-size: 70ch`), verse number badges, and optional inline translation
    under each verse.
- **Verse interaction:** hover/focus reveals a compact action row — play, bookmark,
  copy (with reference), tafsir, translation. Tafsir and translation open in a right-side
  panel, not a modal, so reading continues.
- **Audio:** a persistent bottom player bar (`Material` thick) with reciter, verse
  reference, scrub, repeat-verse and repeat-range controls, and playback speed. The
  currently-recited verse is highlighted with a soft accent wash and auto-scrolls into
  view — the highlight must move on the verse boundary, never mid-verse.
- **Reading state:** last position saved continuously and restored on launch; a
  "Continue reading" card on the home screen when a position exists. Bookmarks list with
  optional notes.
- Per-reader comfort settings: text size, line height, page width, and a **sepia** paper
  option alongside light and dark.
### 7.3 Athkar
 
- Category cards on a grid — Arabic title, count of adhkar, an icon, and today's
  completion ring for the two time-bound sets.
- Inside a category: one dhikr per card, large Arabic text, the repeat counter as a big
  circular tap target that counts down (33 → 32 → …) with a spring press animation and a
  satisfying completion state. Reference and benefit collapsed behind a small chevron.
- Progress bar across the set; completing all of them earns a quiet, tasteful completion
  state — a soft accent wash and a single line of text. Not confetti.
- Morning/evening sets can be pinned to a notification at user-chosen times.
- A free-form tasbeeh counter with a resettable count and a target.
### 7.4 Qibla
 
- A compass dial with the Kaaba marker at the computed bearing from the user's
  coordinates, the bearing in degrees, and the great-circle distance to Makkah.
- **Be honest about the limitation:** a laptop has no magnetometer, so the app cannot know
  which way the user is facing. Show the bearing *from true north* and a one-line
  instruction on how to align using a phone compass or the sun. Do not fake a live needle.
- Note true-vs-magnetic north and show the local magnetic declination if you can compute
  it offline; otherwise omit it rather than guessing.
### 7.5 Calendar
 
- Hijri month grid with Gregorian dates in the corner of each cell, today marked with
  the accent.
- Key dates highlighted: Ramadan start, the last ten nights, Eid al-Fitr, Day of Arafah,
  Eid al-Adha, Ashura, the Islamic new year.
- A ±1 day Hijri adjustment setting, because local moon-sighting differs from the
  tabular calendar and every serious app has this.
### 7.6 Settings
 
Grouped `ListRow` sections in a scrolling pane: **Location · Prayer times · Notifications
& adhan · Typography (§5.2) · Appearance · Quran · Language · Startup & panel widget
(autostart, start hidden, label format, close-to-tray, global shortcut — §8) · Data &
storage · About**. Each row's control is inline (switch, segmented control, or a
disclosure chevron opening a sub-pane). No settings modal stacking.
 
---
 
## 8. Background operation, panel widget, and system integration
 
This is a resident app. Treat the sections below as feature requirements with the same
weight as the Quran reader — not as plumbing.
 
### 8.1 Background-first startup
 
- **Autostart is ON by default.** Register with `tauri-plugin-autostart` on first run,
  which writes `~/.config/autostart/al-minabr.desktop`. A Settings toggle turns it off,
  and turning it off must actually remove that file — not just flip a flag the app reads
  later.
- **A background start shows no window.** When launched at login (or with `--hidden`),
  the app comes up with its panel presence only. No window, and — critically — **no
  window flash**: do not create a visible window and hide it a tick later. Configure the
  main window with `"visible": false` in `tauri.conf.json` and show it explicitly only on
  a user action.
- The autostart entry launches `al-minabr --hidden`. A manual launch from the app grid
  opens the window normally.
- Add a small startup delay option (default ~10s) before the panel item appears at login,
  so it settles after the shell's own panel has finished loading — this is what stops the
  icon from vanishing on GNOME session start.
- **Startup budget in hidden mode: under 400 ms to armed timers, under 60 MB resident.**
  Do not initialise the webview at all in hidden mode. The prayer engine, scheduler,
  audio and tray all live in Rust; the React app is only constructed when a window is
  first shown. Getting this wrong turns a lightweight resident into a 250 MB idle
  process, and that is the difference between an app people keep enabled and one they
  disable within a week.
- **Single instance** (`tauri-plugin-single-instance`): a second launch raises and focuses
  the existing window rather than starting a second copy. Passing `--toggle` to a running
  instance toggles the mini window — this makes it bindable to a keyboard shortcut.
- Optional global shortcut (`tauri-plugin-global-shortcut`), default `Super+Shift+P`,
  unset-able, to toggle the mini window from anywhere.
### 8.2 The panel widget (taskbar item)
 
The always-visible surface. Built on Tauri's core tray (`TrayIconBuilder`), which on
Linux publishes a **StatusNotifierItem** over D-Bus — the same protocol Windows' taskbar
tray occupies conceptually, and what Ubuntu's top panel, Mint's Cinnamon panel, KDE's
system tray and XFCE's panel all consume.
 
It must show:
 
- A monochrome, theme-aware icon that follows the panel's light/dark background.
- **A text label beside the icon: the next prayer and its countdown** (`المغرب 1:42` /
  `Maghrib 1:42`), updating every minute — the entire point of a panel widget is that the
  answer is visible without clicking anything. Label format configurable: name+countdown ·
  name+clock time · countdown only · icon only. Respect the user's Arabic-Indic digit
  preference (§5.3) here too.
- A visible state change in the final 10 minutes before a prayer (accent-tinted icon),
  and a distinct state while the adhan is playing.
- Tooltip: today's full timetable.
**Left-click** opens the mini window (§8.3). **Right-click** opens the menu:
Open Al-Minabr · *[next prayer, disabled label]* · Stop adhan (only while playing) ·
Mute notifications for today · Mute until *[sub-menu: 1h / 3h / until tomorrow]* ·
Today's timetable → *[sub-menu of the six times]* · Settings · Quit.
 
**Environment caveats you must handle, not discover late:**
 
- Vanilla GNOME Shell **has no tray**. Ubuntu ships `gnome-shell-extension-appindicator`
  enabled by default so it works there out of the box, but Debian GNOME and some Mint
  setups do not. Detect at startup whether a StatusNotifierItem host is registered on the
  session bus (`org.kde.StatusNotifierWatcher`). If none is, show a **one-time,
  dismissible** first-run card explaining the situation and naming the fix
  (`sudo apt install gnome-shell-extension-appindicator`, then log out and in) — and keep
  the app fully functional without it: notifications and adhan still fire, and the window
  becomes the only surface. Never silently start invisible with no way back to the UI.
- **Text labels beside tray icons are not universally supported.** They work through
  AppIndicator/SNI on Ubuntu, Cinnamon, KDE and XFCE. Where the host ignores the label,
  fall back to an icon that renders the countdown into the image itself (draw the text
  into the tray icon bitmap at panel resolution) — that path works everywhere. Decide
  which mode is active at runtime; do not ask the user to configure it.
- Mint/Cinnamon and XFCE panels resize icons differently. Supply the tray icon at
  16/22/24/32/48 px, and use a symbolic SVG where the host accepts one.
### 8.3 The mini window
 
A compact popover — the thing left-clicking the panel item opens. This is the surface the
user actually sees ten times a day, so it gets the same design care as the home screen.
 
- ~360×440, frameless, rounded (`radius xl`), `Material thick`, always-on-top, no taskbar
  entry, **dismisses on blur** and on `Esc`.
- Contents: next prayer with live countdown and progress ring · the six times as compact
  rows with the current one tinted · Hijri date · a row of icon buttons (open full window ·
  mute today · Quran "continue reading" · settings).
- **Positioning, and being honest about it:** under Wayland an application cannot place
  its own window on screen, and GNOME does not implement `wlr-layer-shell`, so on
  Ubuntu 26.04 there is **no way to anchor this popover to the panel icon.** Do not burn
  a day discovering that. The Wayland behaviour is the design: open centred on the active
  output, offset toward the top edge, so it reads as a deliberate command-palette-style
  panel rather than a popover that missed its anchor. Give it a slightly more substantial
  presence (shadow, entrance from the top) to suit that. On X11 sessions (Mint, XFCE,
  older Ubuntu) anchor it to the tray/cursor position and clamp it to the work area.
  One component, two placements, both intentional-looking.
- Opens with a spring scale-and-fade from the anchor edge (§6.5), and honours
  `prefers-reduced-motion`.
### 8.4 Main window behaviour in the taskbar/dock
 
- The `.desktop` file's `StartupWMClass` must match the window's WM class so the window
  groups under the correct dock/taskbar icon instead of appearing as an unnamed second
  entry. Verify this on Ubuntu's dock and on Cinnamon's window list — it is a five-minute
  fix and a very visible bug.
- `.desktop` gets `Actions` entries so a right-click on the dock icon offers
  "Open Quran", "Today's timetable" and "Settings" directly.
- **Closing the window does not quit the app** — it returns to background operation, with
  a one-time toast the first time it happens ("Al-Minabr is still running in the panel")
  so nobody thinks it crashed. Quit is explicit: the tray menu, or `Ctrl+Q`. A Settings
  option flips close-to-quit for people who want it, and that setting is honoured
  exactly.
### 8.5 Notifications
 
`tauri-plugin-notification`, at each prayer time plus an optional configurable
pre-prayer reminder (5/10/15/20 min). Per-prayer on/off. The body carries the prayer name
in the interface language and the time. Where the desktop supports notification actions,
offer "Stop adhan". Notifications must fire whether or not a window exists.
 
### 8.6 Adhan playback
 
Runs in the **Rust** process (rodio) so it plays with no window open. Volume setting,
per-prayer sound choice, a "silent for Fajr" option, a test-play button in Settings, and
an immediate stop from the tray menu, the mini window, and the notification action. If
another app holds the audio device, fail quietly to a notification rather than crashing
the scheduler.
 
### 8.7 Clock correctness
 
- Recompute and re-arm at local midnight, on timezone change, and on **resume from
  suspend** (subscribe to `PrepareForSleep` on `org.freedesktop.login1` over D-Bus). A
  timer that slept through Maghrib is the worst bug this app can have.
- Never trust a long `setTimeout`/`sleep` across a suspend. Re-derive from the wall clock
  on every tick and check for a missed prayer window on wake.
- If the machine was asleep through a prayer, do **not** fire a late adhan on wake —
  show a quiet "Maghrib passed at 19:42" line in the mini window instead.
### 8.8 XDG paths
 
Via the `directories` crate — never hard-code `~/.config`:
 
```
~/.config/al-minabr/settings.json          settings
~/.config/autostart/al-minabr.desktop      autostart entry (managed by the app)
~/.local/share/al-minabr/al-minabr.db      Quran, athkar, bookmarks, reading state
~/.cache/al-minabr/audio/                  downloaded recitations
```
 
---
 
## 9. Internationalisation
 
Full Arabic and English interface, switchable at runtime with **no restart** — including
a complete LTR↔RTL layout flip. Strings live in `src/locales/{ar,en}.json`; no literal
UI string in a component. Arabic is the default when the system locale starts with `ar`.
The Quran text and athkar are always Arabic regardless of interface language.
 
---
 
## 10. Quality gates
 
Do not tell me a phase is done until these hold.
 
**Correctness**
- Prayer-time fixture test passes for 4 cities × 4 dates within one minute (§4.1).
- Quran import test asserts 114 surahs / 6,236 verses / 604 pages / 15 sajda markers,
  and a checksum over the concatenated text matching the Tanzil source.
- Hijri conversion matches a committed fixture of known dates.
- Qibla bearing for a few known cities matches published values within 0.5°.
**Visual**
- Every screen screenshotted in light **and** dark, at 900×640 and 1600×1000, and
  compared against `ui-reference.png`'s language. Put the screenshots in `docs/shots/`.
- No horizontal scrollbar at the minimum window size, in either text direction.
- Arabic renders with no clipped tashkeel at every offered font size.
- Contrast check passes for every accent × theme combination.
**Behaviour**
- Cold start to interactive under 1.5s on a mid-range laptop.
- Idle RAM under 250 MB with the window open; **under 60 MB in background mode**, with
  timers armed in under 400 ms and no webview process alive.
- Log out and back in: the panel item is present with a correct countdown, and no window
  appeared at any point during login.
- Suspend the machine across a prayer time, resume: times are correct, timers re-armed,
  no late adhan fired, and the missed prayer is shown as passed.
- Uncheck autostart in Settings → `~/.config/autostart/al-minabr.desktop` is gone.
- The app behaves correctly on a session with **no** SNI host: the first-run card appears,
  notifications and adhan still work, and the window is reachable.
- Verified on **Ubuntu 26.04 (Wayland, GNOME 50)** and at least one X11 session
  (Mint Cinnamon or 22.04): window chrome, mini-window placement, tray label, and blur
  fallback all correct in each.
- Full keyboard navigation: every action reachable, focus ring always visible, `Esc`
  closes sheets, `⌘/Ctrl+K` opens search, arrow keys turn mushaf pages.
- The app runs correctly with the network interface down — verify by actually disabling
  it, not by assuming.
---
 
## 11. Build phases — stop at every gate
 
**Phase 0 — Foundation.** Tauri v2 + React + TS + Vite scaffold. Design tokens as CSS
variables. Theme switching (light/dark/system). Custom window chrome with the X11/Wayland
fallback from §6.7. Font loading from `assets/fonts/`.
*Gate: an empty, correctly-shaped, correctly-themed window that drags, resizes and
switches theme.*
 
**Phase 1 — Design system.** Every component in §6.6, in a `/dev/components` gallery
route, with all states in both themes.
*Gate: I look at the gallery and agree it matches the reference image's quality.*
 
**Phase 2 — Prayer engine.** Rust prayer-time calculation, all methods, offline city
search, timezone handling, the fixture tests. Home screen wired to real data with the
live countdown.
*Gate: the home screen shows correct times for Ajloun and the tests pass.*
 
**Phase 3 — Background service, panel widget, adhan.** All of §8: hidden startup with no
webview, autostart registration, the panel item with its live countdown label and the
SNI-host fallback, the mini window with its X11/Wayland positioning, the scheduler,
notifications, wake-from-suspend handling, and background audio.
*Gate: reboot the machine, log in, touch nothing — the countdown is in the panel within
seconds, no window appeared, the process is under 60 MB, left-click opens the mini
window, and the adhan plays at the next prayer (fake the clock if you must wait).*
 
**Phase 4 — Quran.** Data import pipeline, SQLite schema, FTS5 normalised search, both
reading modes, bookmarks and reading state. Audio download manager and the player bar.
*Gate: read surah 2 in both modes, search "الرحمن" and find the vocalised matches,
play a downloaded surah with the highlight following.*
 
**Phase 5 — Athkar, Qibla, Calendar.** The three remaining modules.
*Gate: complete a full morning athkar set with the counters.*
 
**Phase 6 — Settings & polish.** All settings panes including Typography (§5.2), i18n
with the runtime RTL flip, empty states, error states, the About/attribution screen,
and the visual pass across every screen.
*Gate: the quality gates in §10 all pass.*
 
**Phase 7 — Packaging.** `.deb` and AppImage via the Tauri bundler, desktop entry with
proper `Categories`, `StartupWMClass` and `Actions`, icon set at all sizes, a GitHub
Actions release workflow, README with screenshots, and install verification on clean VMs.
 
*Build on the oldest supported distro, not the newest.* glibc and WebKitGTK symbols are
forward-compatible, not backward — a `.deb` built on 26.04 will not install on 22.04,
while one built on 22.04 runs everywhere. Build in a 22.04 container in CI. Declare
WebKitGTK dependencies with a version range wide enough to satisfy both 22.04
(webkit2gtk-4.1) and 26.04, and if that proves impossible, ship two `.deb`s and say so
rather than silently dropping the old LTS.
*Gate: `sudo dpkg -i` on a clean **Ubuntu 26.04** VM **and** a clean **22.04** VM — launch
from the app grid, the dock groups the window under the right icon, then reboot each and
confirm it comes back in the panel by itself.*
 
---
 
## 12. Working rules for the agent
 
1. **Read the reference image first.** Write `DESIGN_NOTES.md` before any component.
2. **One phase at a time.** Show me a running app at each gate. Do not scaffold ahead.
3. **Never invent Quranic text, hadith, athkar wording, or a reference.** Every character
   of religious content comes from the bundled, sourced dataset. If a dataset is missing
   a field, leave it empty and tell me — do not fill it from memory. This is the most
   important rule in this file.
4. **No placeholder content in committed work.** No lorem ipsum, no `TODO: real times`,
   no mock arrays that survive past the phase that introduced them.
5. **Ask before adding a dependency.**
6. **Test on Wayland first, X11 second** whenever you touch windowing, transparency, blur
   or the mini window. Ubuntu 26.04 has no X11 session at all, so a Wayland regression is
   a broken app on the primary target, while an X11 regression only affects Mint and the
   older LTSes.
7. **Commit per logical unit** with clear messages. Keep `DESIGN_NOTES.md` and the README
   current as you go.
8. When something in this spec turns out to be wrong or impossible — a crate is dead, a
   dataset is unavailable, WebKitGTK will not do what is asked — **say so and propose an
   alternative.** Do not silently substitute, and do not paper over it with a fake.
---
 
## Appendix — assets you must add before starting
 
```
assets/
  fonts/                    ← the Arabic font files (any number; the build reads the folder)
  reference/
    ui-reference.png        ← the UI mockup/screenshot to match
```
 
If either folder is empty when the build starts, stop and ask for the files rather than
substituting Google Fonts or inventing a layout.
