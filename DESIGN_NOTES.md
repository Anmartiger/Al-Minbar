# DESIGN_NOTES.md

The visual contract for Al-Minabr (المنبر). Every screen is checked against this file.
Per `Claude.md` §6, `assets/reference/ui-reference.png` outranks the written descriptions
in the spec wherever the two disagree.

---

## 1. Reference image analysis — ⛔ BLOCKED, FILE NOT SUPPLIED

`assets/reference/ui-reference.png` **does not exist.** The directory was created by this
pass and is empty. A search of the entire working tree found no mockup, screenshot, or
design comp of any kind — the only PNGs present are icons belonging to the bundled
Remotion agent skills.

`Claude.md` is explicit about what to do here:

> **Appendix** — "If either folder is empty when the build starts, stop and ask for the
> files rather than substituting Google Fonts or inventing a layout."
>
> **§12.1** — "Read the reference image first. Write `DESIGN_NOTES.md` before any component."
>
> **§12.8** — "Do not silently substitute, and do not paper over it with a fake."

So this section stays empty rather than being filled in from the §6 prose or from general
"Apple-like" priors. Writing a plausible-sounding analysis of an image nobody has seen would
produce exactly the fake the spec forbids, and it would be *worse* than nothing: every screen
in the app is supposed to be checked against this section, so an invented contract silently
misdirects all seven phases.

**To unblock:** drop the mockup at `assets/reference/ui-reference.png`. It will then be
analysed here under these headings, which are the ones the build actually consumes:

| Heading | What gets extracted | Consumed by |
|---|---|---|
| Layout structure | sidebar vs. tab bar, column count, content max-width, toolbar height | §6.7, §7.1 |
| Spacing rhythm | which steps of the 4px scale actually appear, and where | §6.2 |
| Corner radii | measured radii per surface class, mapped onto xs/sm/md/lg/xl | §6.2 |
| Colour temperature | measured warmth of bg/surface, accent hue, how far dark sits from black | §6.3 |
| Typographic hierarchy | real size/weight ratios between hero, section head and body | §6.2 |
| Iconography weight | stroke width, corner join, optical size, filled vs. outline | lucide 1.5px rule |
| Arabic vs. Latin placement | which strings are Arabic, which Latin, and their relative sizes | §5, §9 |

Until then, no component work starts. **Phase 0 has not begun.**

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
