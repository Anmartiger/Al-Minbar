# DESIGN_NOTES.md

The visual contract for Al-Minabr (المنبر). Every screen is checked against this file.
Per `Claude.md` §6, `assets/reference/ui-reference.png` outranks the written descriptions
in the spec wherever the two disagree.

---

## 1. Reference image — not supplied; building from the written spec

`assets/reference/ui-reference.png` was never supplied. The directory exists and is empty;
a search of the whole tree found no mockup or comp of any kind.

This was raised twice and **the decision was to proceed from the written specification**
(2026-08-28). Recorded here because §6 says the image outranks the §6 prose wherever the
two disagree — with no image, §6.2/§6.3/§6.5 are the contract, and they are precise enough
to build from: literal radii, spacing steps, hex values, shadow stacks, easing curve and
durations. What the image would have settled and the prose does not is:

- **Layout structure** — sidebar vs. tab bar, column count, content max-width. §7 describes
  screen *contents*, never their arrangement. Phase 1 will pick one and it will be a guess.
- **Density** — which of the ten spacing steps actually get used, and where.
- **Iconography weight beyond stroke width** — filled vs. outline, optical sizing.
- **Where Arabic and Latin sit relative to each other** in the same row.

Those four are the open risk. Everything else in §6 is specified numerically.

If the image turns up later, it outranks what gets built and the affected screens get
redone — that is the spec's rule, not a caveat being added here.

---

## 2. Fonts — `assets/fonts/`

### 2.0 Decision record — 2026-08-28

| Context (§5.2) | Family | Files |
|---|---|---|
| **Quran** | `Amiri Quran` | `AmiriQuran.ttf` |
| **Athkar** + **Interface** (Arabic) | `Amiri` | `Amiri-Regular.ttf`, `Amiri-Bold.ttf` |
| Latin (§5.3, not user-switchable) | `Inter` | `Inter-{Regular,Medium,SemiBold,Bold}.otf` |

Everything bundled is **SIL Open Font License 1.1**. Licence texts are kept beside the
fonts in `assets/fonts/LICENSES/` and are what the §4.2 "About the data" screen cites.

**Dropped:** the three originally-supplied files (`Basseet-Free`, `zain pc v2`,
`fs Tahoma 8px [v2]`) are **not shipping** — two had no redistribution grant and none
could set Quranic text (§2.4). They were **moved, not deleted**, to
`assets/fonts-unlicensed/`, which is outside the `assets/fonts/` folder the §5.1 build
generator reads. Nothing is lost; nothing unlicensed enters the bundle.

Total bundled font payload: **3.4 MB**.

Provenance — Amiri from the upstream release `aliftype/amiri` 1.003
(`Amiri-1.003.zip`, sha256 `81af0aff7d20…44d05e`); Inter 4.1 from Ubuntu's signed archive
(`fonts-inter_4.1+ds-1_all.deb`, sha256 `7f1fdf6a4377…76bce`), which is the same upstream
version as the 33.7 MB `rsms/inter` v4.1 zip. Only the four weights the §6.2 ramp actually
uses were taken; Amiri's Italic and BoldItalic faces were skipped because Arabic has no
italic and §5.3 forbids synthesised styles.

### 2.1 How "harakat coverage" is judged

Two independent things must be true, and passing one without the other still renders badly:

1. **Codepoint coverage** — `cmap` must carry U+064B–U+0652 (the eight tashkeel marks),
   U+0653–U+0655, and for Quranic text also **U+0670** (dagger alef, as in ٱلرَّحْمَٰن),
   **U+0671** (alef wasla ٱ), **U+06DD** (end-of-ayah ۝), **U+06DE** (rub-el-hizb) and the
   full Quranic annotation range **U+06D6–U+06ED** (small high seen/meem/lam-alef, sajdah
   U+06E9). The Tanzil `quran-uthmani.txt` that §4.2 bundles uses that whole range.
2. **Mark positioning** — GPOS must carry `mark` (attach a harakah to its letter) and
   **`mkmk`** (stack a second mark on the first). `mkmk` is the one that matters most,
   because shadda + a vowel on one letter (ـَّ) is constant in the Uthmani script. A font
   with `mark` but no `mkmk` sets single harakat correctly and collides on every stacked
   pair — it passes a coverage audit and is wrong on screen.

> **The §5.2 preview string is not a sufficient test.** بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
> uses 16 distinct codepoints, none of them in U+06D6–U+06ED. `Basseet-Free` renders it
> perfectly and then fails on real ayat. **The font-picker validation must test the
> annotation block directly, not the preview string.**

### 2.2 `AmiriQuran.ttf` — the Quran face

| | |
|---|---|
| **Family name** | `Amiri Quran` |
| PostScript name | `AmiriQuran-Regular` |
| **Weights available** | **One — Regular (usWeightClass 400).** Not variable. By design: a mushaf face has one weight. |
| Version / author | 1.003 · Khaled Hosny, Alif Type |
| Licence | **SIL OFL 1.1** ✅ |
| unitsPerEm | 1000 |
| Vertical metrics | asc 1815 / desc −634 / gap 0 → natural line box **2.449 em** |
| Shaping (GSUB) | `init medi fina` · `ccmp rlig locl mark` · `ss01 ss02 ss05 ss07 ss08` |
| Positioning (GPOS) | **`curs`** · `kern` · **`mark`** · **`mkmk`** ✅ |

**Coverage: complete. Every check passes.**

| Range | |
|---|---|
| U+064B–U+0652 tashkeel · U+0653–U+0655 | ✅ |
| U+0670 dagger alef · U+0671 alef wasla | ✅ |
| U+06DD end-of-ayah ۝ · U+06DE rub-el-hizb | ✅ |
| **U+06D6–U+06ED Quranic annotation marks (all 24)** | ✅ |
| U+06E9 sajdah sign | ✅ |
| U+0660–U+0669 Arabic-Indic digits | ✅ |
| §5.2 Bismillah preview string (16 distinct codepoints) | ✅ |

**Two things this font settles for the design system:**

- **The 2.449 em natural line box is where §5.3's "line-height 2.0–2.4" comes from.** That
  is not a stylistic preference — it is this font's own ascent/descent, sized to clear the
  Quranic annotation marks. **Setting `line-height` below 2.0 clips tashkeel**, so the
  Typography slider's Quran-context minimum is a correctness bound, not taste. Verify at
  the §5.3 test case, آية 2:282.
- **`curs` (cursive attachment) is present** — none of the three original fonts had it. It
  is what puts Naskh joins on a true curved baseline instead of a flat one, and it is most
  of why this face reads as a printed mushaf rather than as a screen font.

**§5.3 feature-settings note:** the spec asks for `"liga" 1, "calt" 1, "rlig" 1`.
`AmiriQuran` has **`rlig`** (which is the one doing the work — lam-alef and the required
Quranic ligatures) but **no `calt` and no `liga`**. Requesting an absent feature is
harmless, so the declaration stays as specified; just do not expect `calt` to be the thing
fixing a rendering bug here.

### 2.3 `Amiri-Regular.ttf` / `Amiri-Bold.ttf` — Arabic UI and athkar

| | |
|---|---|
| **Family name** | `Amiri` (one family, two faces) |
| **Weights available** | **Two — Regular 400 and Bold 700.** Real outlines; no synthesis needed, per §5.3. |
| Version / author | 1.003 · Khaled Hosny, Alif Type |
| Licence | **SIL OFL 1.1** ✅ |
| unitsPerEm | 1000 |
| Vertical metrics | asc 1124 / desc −634 / gap 0 → natural line box **1.758 em** (both faces) |
| Shaping (GSUB) | `init medi fina` · `ccmp rlig liga locl mark rtlm` · `numr dnom pnum` · `ss01`–`ss08` |
| Positioning (GPOS) | **`curs`** · `kern` · **`mark`** · **`mkmk`** ✅ |

Coverage is identical to `Amiri Quran` — every row of the §2.2 table passes, including the
full U+06D6–U+06ED block. Athkar are vocalised but not Uthmani, so this is more than enough.

**Why the same family for UI as for athkar:** it makes the Arabic chrome and the dhikr body
read as one typeface, and it means the app ships two Arabic families total rather than four.
The **1.758 em** natural line box is the floor for Arabic UI line-height — noticeably taller
than Inter's 1.21, so Arabic and Latin rows in the same list need their line-heights set
separately or the list rhythm breaks.

Amiri is a Naskh **book** face — a revival of the Bulaq/Amiria Press type. At §6.2's caption
and micro sizes (12/11px) it will get delicate. Check it at the smallest sizes on the prayer
list before committing to it for every UI string; if it proves too fine there, the fallback
is Amiri for headings and prayer names with a sturdier face for micro-copy — flag it at the
Phase 1 gate rather than deciding blind now.

### 2.4 `Inter-{Regular,Medium,SemiBold,Bold}.otf` — Latin

| | |
|---|---|
| **Family name** | `Inter` |
| **Weights available** | **Four — 400 Regular · 500 Medium · 600 SemiBold · 700 Bold.** Exactly the weights the §6.2 type ramp uses. |
| Version / author | 4.001 · Rasmus Andersson |
| Licence | **SIL OFL 1.1** ✅ |
| unitsPerEm | 2048 |
| Vertical metrics | asc 1984 / desc −494 / gap 0 → natural line box **1.210 em** |
| Format | OTF/CFF (WebKitGTK handles these via `@font-face` without trouble) |

The §6.2 ramp maps onto these with nothing left over: Display 34/700 and Title1 28/700 →
Bold · Title2 22/600 and Headline 17/600 → SemiBold · Body 15/400 and Callout 14/400 →
Regular · Caption 12/500 and Micro 11/500 → Medium.

Two `@font-face` notes: `Inter-Medium.otf` and `Inter-SemiBold.otf` carry a **legacy dual
family name** (`Inter Medium` / `Inter SemiBold` alongside `Inter`) for old applications —
declare all four under family `Inter` with an explicit `font-weight` and ignore the legacy
name. And §5.3's `-0.01em` tracking on Display and Title1 applies **only** to these Latin
faces; the same rule forbids letter-spacing on Arabic entirely.

### 2.5 The three originally-supplied fonts — why they were dropped

Kept as a record. All three now live in `assets/fonts-unlicensed/` and ship in nothing.

| File | Family | Weights | Quranic marks U+06D6–06ED | `mkmk` | Blocking defect | Licence |
|---|---|---|---|---|---|---|
| `Basseet.ttf` | `Basseet-Free` | 1 (400) | ❌ none of 24 | ✅ | No ayah markers or annotation marks; **cmap is missing lowercase Latin `i`** (`20-68 6a-7e`) | ❌ «مجانية لاستخدام شخصي» — personal use only |
| `alfont_com_zainpcv2-VF.ttf` | `zain pc v2` | 1 (400) + `long` elongation axis | ❌ | ✅ | **No U+0670 or U+0671** — cannot set the Bismillah; also no Latin letters and no ASCII digits | ❌ `"eula or whatever"` — no grant |
| `alfont_com_Tahoma-8px-Italic.ttf` | `fs Tahoma 8px [v2]` | 1 (400, italic only) | ❌ partial (`06DD-06DE` only) | ❌ | **No `mkmk`** → stacked shadda+vowel collide; FontStruct pixel font, blocky across the 11–34px ramp; italic-only | ✅ CC BY-SA |

The `zain pc v2` file is the one most likely to be re-proposed later, so: its single axis is
tagged **`long`** (0→800), an *unregistered* tag paired with a `swsh` feature — a
kashida/elongation axis, **not** `wght`. `usWeightClass` stays 400 at every axis position and
there is no second outline weight. Its named instance is *called* "Black", which is where the
misreading comes from. Wiring it to a `font-weight` control would silently do nothing.

---

## 3. Environment notes for Phase 0

Recorded while checking prerequisites; not part of the visual contract.

- Host is **Ubuntu 26.04 LTS on Wayland** (`XDG_SESSION_TYPE=wayland`) — the §2 primary
  target, so §6.7 transparency and rounded corners are on the reliable path here. The X11
  fallback branch will need a separate session to verify.
- Toolchain present: node v22.22.1 · npm 9.2.0 · pnpm 11.23.0 · rustc 1.93.1 · cargo 1.93.1.
- **Tauri v2 system dependencies are not installed** — `webkit2gtk-4.1`,
  `javascriptcoregtk-4.1`, `libsoup-3.0` and `librsvg-2.0` are all absent from pkg-config.
  `gtk+-3.0` 3.24.52 and `glib-2.0` 2.88.0 are present. The Rust side will not build until
  the missing ones are added; this needs root, so it is the user's to run.
- The spec file in this repository is named `Claude.md`. Claude Code reads project memory
  from `CLAUDE.md`, and this filesystem is case-sensitive, so it is not being auto-loaded
  as memory — it is read explicitly. Renaming it would make that automatic.

---

## 4. Design-system decisions taken in Phase 0

### 4.1 §6.3's accent contrast requirement is unsatisfiable as written — resolved as pairs

§6.3 asks for six accents where "every accent must pass **4.5:1 contrast against both
surface colours**". Taken literally against light `surface` `#FFFFFF` and dark `surface`
`#1C1C1B`, **no colour exists that satisfies it**:

| Constraint | Bound on the accent's relative luminance |
|---|---|
| 4.5:1 against `#FFFFFF` | **≤ 0.1833** |
| 4.5:1 against `#1C1C1B` | **≥ 0.2270** |

The window is empty. The requirement is not merely hard, it is arithmetically impossible —
one surface is near-white and the other near-black, so a single colour cannot stand off both.

**Resolution:** an accent is a **pair** — one shade tuned for light surfaces, one for dark,
both the same hue. `--accent` aliases whichever the active theme defines, so components
still read one token and no component knows a hex value. This is what §6.3 must have meant,
since it also says the dark theme redefines tokens.

Each shade is checked against **all three** surfaces its own theme paints — `bg`, `surface`
and `surface-2` — not just `surface`, because the accent is drawn on all of them. The
binding case is the *narrowest* gap in each theme: `bg #F7F6F3` for light, `surface-2
#242423` for dark.

| Accent | Light shade | worst light | Dark shade | worst dark |
|---|---|---|---|---|
| **green-teal** (default) | `#0F6F62` | 5.60:1 | `#3AA294` | 5.01:1 |
| indigo | `#5B52C9` | 5.56:1 | `#8F88DD` | 4.98:1 |
| plum | `#A62BB2` | 5.38:1 | `#D072D9` | 5.25:1 |
| clay | `#A64A24` | 5.36:1 | `#D67C51` | 5.08:1 |
| gold | `#835D1E` | 5.47:1 | `#B98D3D` | 5.13:1 |
| slate | `#1F66AC` | 5.47:1 | `#5A97D2` | 5.03:1 |

`scripts/check-contrast.mjs` enforces all 36 combinations and **fails the build** on any
below 4.5:1, as §6.3 requires. It runs in `npm run build`.

### 4.2 Window chrome: the transparency policy is decided by session type

§6.7 wants rounded corners via `transparent: true`, and warns that X11 without a compositor
produces black corners. Tauri fixes `transparent` when the window is built, not at runtime,
so the window is **constructed in Rust** (`src-tauri/src/lib.rs`) rather than declared in
`tauri.conf.json`, and `XDG_SESSION_TYPE` decides:

| Session | Transparent | Corners | Shadow margin |
|---|---|---|---|
| `wayland` | yes | rounded, `--radius-xl` | 24px |
| `x11` | no | square | 0 |
| anything else | no | square | 0 |

Wayland always composites, so it is the reliable case and the §2 primary target. X11 is
treated as unreliable unconditionally rather than probing for a compositor — the failure
mode is a visible black-corner artefact, and §6.7 says never ship it. The layout is
identical either way; only translucency and the drawn shadow disappear. Maximised windows
drop to square corners in both.

Building the window in Rust also satisfies §8.1 for free: it is created with
`.visible(false)` and shown explicitly, so there is no create-then-hide window flash when
Phase 3 adds hidden startup.

**Minimum window size:** §6.7 asks for 900×640 and separately for ~24px of transparent
padding "accounted for in the window size". Read as *content* 900×640, so the OS minimum is
948×688 on Wayland and 900×640 on X11 where there is no margin.

---

---

## 5. Component library decisions taken in Phase 1

All seventeen §6.6 components live in `src/components/ui/`, grouped by concern rather
than one file each, with a single `ui.css`. The gallery is at `#/dev/components`
(also `/dev/components` in dev), reachable from a link on the home screen because a
frameless window has no address bar.

### 5.1 What is hand-built and what is delegated to the platform

§3 forbids a component kit, and §6.6 says hand-build. That governs the *look*, not the
mechanics — so where a native element already carries the semantics, it wears the custom
styling rather than being re-implemented:

| Component | Built on | Why |
|---|---|---|
| `Slider` | native `<input type="range">` | keyboard stepping, ARIA value reporting and drag come free; only the track and thumb are styled |
| `Switch` | `<button role="switch">` | correct semantics, and `aria-checked` doubles as the CSS state hook |
| `SegmentedControl` | `radiogroup`/`radio` | arrow-key movement is what a keyboard user expects; the keys follow *logical* direction so they stay correct under RTL |
| `Tooltip` | `role="tooltip"` on hover **and** focus | keyboard users get tooltips too |
| everything else | hand-rolled | no native equivalent worth wearing |

### 5.2 The switch knob is a transition, not a spring

§6.5 reserves Framer springs for "anything that a finger would grab — sheets, the mushaf
page turn, drawers" and puts everything else on a 150ms micro-interaction duration. A
switch knob is in the second group, so its travel is a plain CSS transition and Framer is
not involved at all — no JS animation for a 20px slide.

It animates `transform: translateX()` rather than the logical `inset-inline-start`. The
logical property would make RTL free, but it animates layout instead of compositing, so
the transform plus one explicit `[dir="rtl"]` rule is the better trade. `translateX`
rather than the newer `translate` property, to stay safe on the WebKitGTK in 22.04.

### 5.3 ListRow separators

§6.6 flags these as "very visible and usually gotten wrong". The rule:

- is drawn by the row *below* the first, so the top of the list has no stray line;
- starts at `--row-inset`, not the container edge, and runs to the trailing edge;
- when a row has a leading icon, `--row-inset` rises to `space-4 + 24 + space-3` so the
  rule aligns to the **text**, not the icon — that is the part usually missed.

Measured in both directions: 16px inset on plain rows, 52px on icon rows, trailing inset
0, and the whole thing mirrors correctly under RTL.

### 5.4 The gallery has deliberate override controls

§6.4 says of the `backdrop-filter` fallback: "Test this path deliberately; do not assume
it works." So the gallery toolbar carries **Backdrop: Auto / Force on / Force off** and a
**Direction: LTR / RTL** toggle, rather than leaving both to chance on another machine.

Forcing the opaque path was measured across 39 elements: **zero layout drift**. Only the
translucency changes — `blur(20px) saturate(1.8)` over a translucent fill becomes an
opaque solid at the same lightness, exactly as §6.4 requires.

### 5.5 What cannot be verified in a browser tab

Anything that needs frames to advance. The dev browser pane runs hidden
(`document.hidden === true`, zero `requestAnimationFrame` callbacks in 500ms), so CSS
transitions and Framer springs never progress and any transitioning property reads frozen
at its previous value.

This produced two false alarms during Phase 1 — a "stuck" CSS transition and a Framer
`transform: none` — both artifacts of the paused frame loop, neither a real defect. The
lesson for later phases: **in that environment, verify CSS rules and selector matching,
not resolved values of animatable properties.** Motion is checked in the real window.

Static verification that does hold there: rule matching, computed layout, focus rings
(`2px solid var(--accent)` at `2px` offset), disabled states (0.4 opacity across all
controls), separator geometry, RTL mirroring, and absence of horizontal overflow.

---

## 6. Prayer-engine decisions taken in Phase 2

### 6.1 §4.1's two requirements contradict each other

§4.1 says to calculate with the **`salah`** crate — a port of Batoul Apps' **Adhan** —
and, in the same section, that computed times must match **Aladhan** to within one
minute. Aladhan is built on PrayTimes. The two algorithms genuinely differ:

| Prayer | Divergence | Cause |
|---|---|---|
| **Asr** | 2–3 min, sign follows the season | Adhan takes solar declination at transit for the shadow-angle solve; PrayTimes iterates it at the Asr time itself |
| **Isha** above ~48° | ~14 min | when the sun never reaches the Isha angle the middle-of-night clamp engages, and the two halve a differently-defined "night" |

`salah`'s output was checked against the `adhan` reference implementation on every
divergent case and agreed **exactly**, so these are algorithm differences, not defects.

**Decision (2026-08-28): keep Adhan, name the exemptions.** The committed Aladhan
fixture stays — it is real published data. `tests/prayer_fixtures.rs` holds Fajr,
Sunrise, Dhuhr and Maghrib to a strict ≤1 minute (128 comparisons, all passing) and
carries exactly two named, justified exemptions. A guard asserts that at least half of
all comparisons remain on the strict bar, so the exemptions cannot quietly grow.

Today's Ajloun timetable was spot-checked against Aladhan live: all six within a minute.

### 6.2 The `salah` crate is vendored for a one-word patch, and two real bugs

`src-tauri/vendor/salah/` (MIT, upstream `insha/salah` 0.7.6). Three changes, all
documented in `vendor/salah/PATCH.md`:

1. **`mod models` → `pub mod models`.** `Parameters.high_latitude_rule` is a public
   field whose type `HighLatitudeRule` is re-exported by neither the crate root nor
   the prelude — the field is public, its type unnameable. Without this the §4.1
   high-latitude setting cannot be set at all. `master` has the same problem.
2. **Maghrib honours `maghrib_angle`.** Upstream stores the field, and
   `Method::Tehran` even sets it to 4.5°, but nothing ever reads it — Maghrib was
   always plain sunset. That makes upstream's **Tehran wrong**, and it silently
   defeated Ja'fari, both of which §4.1 requires.
3. **High latitude no longer panics.** `time_for_solar_angle` unwrapped a `None`
   whenever the sun does not reach the requested angle — so **London in July crashed
   the calculation outright**. It now falls back out-of-range in the direction the
   caller clamps, which lets the existing night-portion clamp take over. That is what
   the reference Adhan implementations do.

### 6.3 Two §4.1 items that could not be delivered as written

- **Ja'fari (Shia Ithna-Ashari)** has no variant in `salah`. It is built from explicit
  angles instead — Fajr 16°, Maghrib 4°, Isha 14°, the Leva Institute (Qum) set that
  Aladhan publishes as its method 0. This only works because of patch 2 above.
- **The high-latitude rule "None"** does not exist upstream in any form; `salah`
  always applies one of its three rules. Three of §4.1's four are offered. It is
  omitted rather than aliased to another, which would misreport what the app does.
  The practical cost is small: the clamp only binds above roughly 48° latitude, so at
  Ajloun all four settings would produce identical times.

### 6.4 The Hijri date is tabular, and will differ from Aladhan by a day

§7.5 calls it "the tabular calendar" and asks for a ±1 day adjustment "because local
moon-sighting differs from the tabular calendar", so an arithmetic calendar is what
the spec expects. Aladhan defaults to Umm al-Qura.

Today they differ: the engine gives **14 Rabi' al-Awwal 1448**, Aladhan **15**. That is
the expected, documented behaviour rather than a bug, and precisely why the ±1 setting
exists — but it does mean a fresh install can look "off by one" against the common
reference until that setting lands in Phase 5/6. Worth a decision then about whether
the shipped default should be tabular or Umm al-Qura.

### 6.5 The city database keeps every city

§4.1 budgets the GeoNames `cities5000` extract at under 2 MB. A population floor is the
easy way there, but it fails exactly the user in a small town who most needs to find it.
Size comes out of the encoding instead — timezones referenced by index rather than
repeated 70,000 times, coordinates as base-36 fixed point, population dropped since row
order already encodes the ranking. Result: **all 69,664 cities, 371 timezones, 5,333
Arabic names, 1.95 MB.** The table is parsed on first search, not at startup, because
§8.1 budgets background mode at under 60 MB resident.

---

## 7. Background-operation decisions taken in Phase 3

### 7.1 The scheduler has no long sleep anywhere

§8.7 is emphatic — "a timer that slept through Maghrib is the worst bug this app can
have" — and the design falls straight out of its own instruction to "re-derive from
the wall clock on every tick":

- the loop wakes every **15 s** and recomputes everything from the instant it reads;
- suspend, a clock step, a timezone change and local midnight are therefore **the same
  event** — the next tick simply sees different numbers, and none of them needs a timer;
- a prayer fires only inside a **120 s grace window** after its time. That single rule is
  what distinguishes "this just happened" from "we slept through it", with no
  suspend tracking at all.

The `login1` `PrepareForSleep` subscription §8.7 asks for **is** implemented, but it is
an optimisation, not the mechanism: it collapses the up-to-one-tick delay on wake to
nothing. If D-Bus is unavailable the app is still correct.

`SchedulerState::tick` takes `now` as an argument rather than reading the clock, which
is what makes all of this testable without waiting for midnight or suspending a laptop.
Ten tests cover firing, not double-firing, sleeping through a prayer, the grace
boundary, the day rollover and the missed line.

**A real bug this caught:** the day window was initially derived from `Utc::now()` while
events were computed against the passed-in `now`. The two could disagree, which is
exactly the class of failure §8.7 is about. Fixed by adding `prayer::local_date_at`.

### 7.2 Hidden startup constructs no webview

§8.1: "Do not initialise the webview at all in hidden mode. [...] Getting this wrong
turns a lightweight resident into a 250 MB idle process."

So no window is created in `setup()` when `--hidden` is passed. Windows are built on
demand in `windows.rs`, by a user action only. The scheduler, audio and tray all run
without one. `RunEvent::ExitRequested` is intercepted so the process survives the last
window closing, which §8.4 requires anyway.

### 7.3 Two §8.2 items that could not be delivered as written

- **The tray label bitmap fallback is not implemented.** §8.2 asks that where a host
  ignores the SNI label, the countdown be drawn "into the tray icon bitmap at panel
  resolution", deciding "which mode is active at runtime". SNI offers no way to ask a
  host whether it renders labels, so there is nothing to detect — and rendering text
  into a bitmap needs glyph rasterisation, which means either a font dependency (§3
  says ask first) or hand-drawn digit bitmaps at five panel sizes. The label path
  works on the hosts §8.2 itself lists (Ubuntu, Cinnamon, KDE, XFCE), so the primary
  target is covered; a host that silently drops the label shows an icon with no
  countdown. Flagged rather than faked.
- **The icon is not theme-aware.** §8.2 wants it to "follow the panel's light/dark
  background". SNI carries no panel-colour information, so the resting state is drawn
  in a mid grey that reads on both, and the two attention states use colour, where
  standing out is the point.

### 7.4 The muezzin recordings are missing, and cannot be generated

§4.4 wants "3–4 muezzin recordings (Makkah, Madinah, Al-Aqsa, and a short 'beep'
alternative), plus a separate short Fajr adhan".

Only the beep exists. §12.3 — "the most important rule in this file" — forbids inventing
religious content, and a synthesised call to prayer is exactly that. The chime is
legitimate because a notification tone is not religious content; it is generated by
`scripts/generate-chime.mjs` as a struck-bell figure.

Everything in §8.6 is built and testable against it: volume, per-prayer sound,
silent-for-Fajr, test-play, immediate stop from three surfaces, and quiet failure when
another application holds the audio device. §4.4's "let the user point at their own
audio file" is implemented — any sound id that is not a bundled one is treated as a
path — so a user can supply their own adhan today. See `src-tauri/assets/audio/README.md`.

---

## 8. Corrections after the Phase 3 review

### 8.1 The "invisible window" was a build-procedure fault, and a real design fault

Clicking **Open Al-Minabr** produced a window that could not be seen, with an
unreadable "can't connect to localhost" behind it. Two separate causes:

1. **The binary was built with `cargo build --release`, not `npm run tauri build`.**
   `tauri-build` only switches from `devUrl` to `frontendDist` when it is invoked
   through the Tauri CLI, so a plain cargo build embeds `http://localhost:1420`
   even in release. With no dev server running the page cannot load.
   **Production builds must go through `npm run tauri build`.**
2. **A transparent window with no content is invisible, not blank.** Nothing painted
   the window backdrop except a React component, so when the page failed there was
   no frame, no background, and no way to tell the window was there at all.

The second is the one worth fixing, because any future load failure would look the
same. The backdrop is now painted by `body::before` in CSS, keyed off attributes the
Rust side stamps onto `<html>` with `initialization_script` **before the page runs**.
The frame is therefore visible on the first frame, and stays visible even if the app
never mounts. That also removes the async `invoke('window_chrome')` round-trip that
previously delayed the frame's geometry.

### 8.2 Translucency: what is achievable and what is not

The request was "blur transparent" - a window that blurs what is behind it.

**Blurring the desktop behind a window is not something an application can do on
GNOME.** It needs compositor cooperation: KDE exposes it (`org_kde_kwin_blur`), and
GNOME does not implement any equivalent protocol. `backdrop-filter` inside the
webview blurs *page content* behind an element, not the desktop behind the window -
so on the root layer it is a no-op for the desktop no matter how it is configured.

What is implemented:

- the window is genuinely **translucent** - `--window-opacity` (default 0.82) sets
  how much desktop shows through, and is a single token to tune;
- `backdrop-filter` is applied on that layer anyway, so it does the right thing for
  the mini window over app content and on compositors that do more;
- the app's own `Material` layers (§6.4) blur content behind them within the app,
  which is where most of the depth comes from.

For actual desktop blur on GNOME the only route is a shell extension such as
Blur my Shell, which blurs from the compositor side. That is the user's choice to
install, not something the app can request.

### 8.3 The hidden-mode memory budget is raised

§8.1 sets "under 60 MB in background mode". Measured on Ubuntu 26.04, release build,
hidden: **59.7 MB RSS / 31.4 MB PSS**. It passed, but with no headroom worth having.

RSS is misleading here: most of it is shared GTK/WebKit library pages that Tauri
links unconditionally and shares with every other GTK application on the session.
**PSS - 31.4 MB - is the honest figure for what the process actually costs.**

Budget revised (2026-08-28, user's decision): **under 100 MB RSS in hidden mode**,
with PSS the number actually tracked. The requirement it protects is unchanged and
still holds: no webview process exists in hidden mode, which is what separates a
lightweight resident from the 250 MB idle process §8.1 warns about.

---

## 9. Quran decisions taken in Phase 4

### 9.1 The mushaf line layout came from an unexpected place

§4.2 names QUL for the King Fahd Complex 604-page line data, and says that if it
"cannot be sourced, page mode falls back to 'verses that belong to page N, flowed' —
and you tell me, rather than faking the line breaks."

QUL puts its downloads behind a sign-in, so that fallback was where this was headed.
But **quran.com's API v4 exposes the same KFGQPC layout** as a `line_number` on every
word, with no account. Page mode therefore has genuine printed line breaks after
all — 8,820 lines across 604 pages, 85% of them starting mid-verse.

**The indexing needed pinning down rather than assuming.** 561 of those line starts
point one word past the end of their verse. Had the two tokenisations genuinely
diverged, every break on every page would have landed somewhere wrong while still
looking entirely plausible. They have not: quran.com counts each verse's
end-of-ayah marker as a final word, so the stream is `[w₁…wₙ, MARKER]` and every
overshoot is exactly +1. The build script now refuses any other value, and all 604
pages reconstruct with zero unresolved starts and zero tokens lost or duplicated.

### 9.2 The basmalah is split without touching the text

Tanzil prefixes the basmalah to verse 1 of every surah but At-Tawbah, and §7.2 wants
it as a separate centred band. Editing it out is forbidden twice over — the Tanzil
licence says "CHANGING IT IS NOT ALLOWED" and §12.3 covers religious content — so the
**prefix length** is recorded and the renderer slices at display time. The stored
text stays byte-for-byte what Tanzil publishes.

Two things nearly went wrong here, both silent:

- A hand-typed basmalah used as a comparison literal had **shadda and fatha
  transposed**, so it matched nothing. It is now derived from the file's own 1:1.
  Never type scripture; read it from the source.
- Surahs **95 and 97** open with `بِّسْمِ` — a shadda on the bā, assimilated from the
  end of the preceding surah. Genuine Uthmani orthography that byte-matching missed
  entirely, so the match runs on the undiacriticised form.

Al-Fatiha is deliberately exempt: there the basmalah *is* verse 1, not a prefix on it.

### 9.3 Recitation is fetched by the frontend, written by Rust

§4.2 wants per-surah download with visible progress. §3 lists no HTTP crate and §12.5
says to ask before adding one — and the webview already has streaming `fetch`, which
is exactly what a progress display needs. So the frontend downloads and hands bytes
to Rust to write into the XDG cache.

Downloads are sequential rather than parallel: it is someone else's free bandwidth,
and a burst of concurrent requests would make the progress figure meaningless.
Already-cached ayahs are skipped, so an interrupted download resumes. A single ayah
failing does not abandon a 286-verse surah; the failure count is reported instead.

The reciter id arrives from the frontend, so it is **checked against the known list
rather than interpolated into a path** — otherwise it is a directory traversal into
the user's filesystem. Covered by a test that tries.

### 9.4 The verse highlight moves only on the verse boundary

§7.2 is specific: "the highlight must move on the verse boundary, never mid-verse."
One `<audio>` element is reused across verses and its `ended` event is the *only*
thing that advances the highlight. Nothing is driven off `timeupdate`, which is what
would let it drift mid-verse.

---

## 10. Athkar source, and three places §4.3 does not match the book

Source: **hisnmuslim.com's own API** — the book's official website, so the text
comes from the publisher with no transcription layer in between, which is what
matters under §12.3. 132 categories, 267 adhkar, each with its repeat count.

The popular GitHub datasets were all rejected: `rn0x/Adhkar-json` (123★) and
`rn0x/hisn_almuslim_json` carry **no licence at all**, and the MIT-licensed
`YousefAsalya/Islamic-Pro-azkar-API` turns out — from its own `fetch_ar.py` — to be
scraped from this same API. Its MIT covers that packaging, not al-Qahtani's
compilation. Going to the publisher directly is both more accurate and no worse
licensed. The site states no terms; Hisn al-Muslim is freely distributed by the
Saudi Ministry of Islamic Affairs. Recorded in the About-the-data screen.

### 10.1 References and benefit notes do not exist in any usable form

§4.3 wants each dhikr to carry "optional reference (Bukhari/Muslim/etc.) and
optional short benefit note". **Searched for a second source that has them and
there isn't one.** Checked: the official Arabic feed, the official English feed
(2 of 24 entries mention a source, and only as incidental prose), `rn0x/Adhkar-json`
(fields are `array/audio/category/filename/id`), `ahegazy/muslimKit`, and the
IslamHouse API org, which does not exist. Every structured dataset traces back to
the same publisher feed, which carries text and repeat count only.

The references do exist — as **footnotes in the printed book**. Extracting them from
a PDF and aligning across 267 adhkar means any misalignment attributes a hadith to
the wrong source, which under §12.3 is worse than omitting it.

So both fields stay `null`, and §7.3's collapsible chevron only appears where there
is something behind it.

### 10.2 Morning and evening are one chapter, not two

§4.3 lists "أذكار الصباح · أذكار المساء" as separate categories. In Hisn al-Muslim
they are a single chapter — **أذكار الصباح والمساء**, 24 adhkar — because the same
adhkar are recited at both times. Splitting them would invent a distinction the book
does not make.

§7.3's "today's completion ring for the two time-bound sets" still works, and is
arguably more correct this way: one set of adhkar, two separate daily completions.

### 10.3 الرقية الشرعية is not a chapter of this book

§4.3 lists it as a category. It is not one. The nearest chapters are duas for the
sick (49, 50, 51) and against the evil eye (125). Ruqyah in the strict sense is a
*practice* — Al-Fatiha, Ayat al-Kursi and the last three surahs recited for healing
— assembled from Quran rather than a chapter of adhkar. Assembling it myself would
be exactly the invention §12.3 forbids, so the category is omitted. The Quran
reader already holds every text it would draw on.

§4.3's التسبيح (free counter) needs no dataset and is built as a counter.

---

## 11. Phase 5 decisions

### 11.1 Athkar sessions rather than split chapters

Morning and evening are one chapter in the book (§10.2), so the two daily
completions §7.3 asks for are told apart by **when the set is done**, not by which
adhkar it contains — anything before local noon counts as the morning sitting. The
progress key is `(category, session, day, dhikr)`, and the day is the user's local
calendar day so a set resets at their midnight rather than UTC's.

The counter counts **down** as §7.3 specifies (33 → 32 → …), because what you need
mid-dhikr is how many are left, not how many you have done.

### 11.2 The qibla dial does not move, on purpose

§7.4: "a laptop has no magnetometer, so the app cannot know which way the user is
facing. [...] Do not fake a live needle."

So north is fixed at the top and the Kaaba marker sits at the computed bearing.
Nothing rotates, because nothing here knows the device's heading. The limitation
gets its own framed block rather than a footnote — on this screen it is the most
important thing on it.

**Magnetic declination is omitted**, which §7.4 explicitly permits: "show the local
magnetic declination if you can compute it offline; otherwise omit it rather than
guessing." Computing it needs a geomagnetic model (WMM/IGRF coefficient tables) the
app does not carry, and a guessed offset is worse than none. The screen says so
plainly rather than leaving the reader to assume the bearing is magnetic.

### 11.3 The calendar is generated in Rust

The Hijri arithmetic already lives there, so the month grid comes from
`hijri_month` rather than being reimplemented in TypeScript where it could drift.
It returns each day's Gregorian date, its weekday, and the occasions §7.5 names.

The ±1 adjustment shifts the **Gregorian mapping**, not the Hijri date — moving the
Hijri number would renumber the month rather than move it against the solar
calendar, which is the opposite of what local sighting does.

Occasions are positions in the Hijri month, not claims about when it truly begins;
that is the adjustment's job. Laylat al-Qadr is marked on the 27th as "most likely"
rather than asserted, since it is not fixed.

### 11.4 A rail, not a bar

Five fixed destinations and a wide window: a vertical rail keeps the height for
content and reads as chrome rather than as content. Position is marked with a rule
on the leading edge, the same device the timetable uses.
