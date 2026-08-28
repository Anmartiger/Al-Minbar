# Screenshots

§10 asks for every screen captured in light and dark, at 900×640 and 1600×1000.

**These have to be taken by hand.** GNOME refuses programmatic screenshots to
unsandboxed callers — `org.gnome.Shell.Screenshot` returns `AccessDenied`, and the
tools that bypass it (`grim`, `gnome-screenshot`) either are not installed or rely on
`wlr-screencopy`, which GNOME does not implement. So the build cannot produce them.

To capture the set, with the app running:

```bash
# Whole window, GNOME: press Alt+Print, or use the Screenshot tool (Print).
# Then move the file into place, e.g.
mv ~/Pictures/Screenshot*.png docs/shots/home.png
```

Wanted, so the README and the §10 visual gate have something to check against:

| File | Screen | Notes |
|---|---|---|
| `home.png` | Prayer times | The one the README shows |
| `quran-reading.png` | Quran, reading mode | |
| `quran-mushaf.png` | Quran, mushaf mode | Shows the real printed line layout |
| `athkar.png` | An athkar chapter | With counters partly done |
| `qibla.png` | Qibla | |
| `calendar.png` | Hijri calendar | Ramadan is the interesting month |
| `settings-typography.png` | Settings → Typography | Live preview |
| `mini.png` | The panel mini window | |

Each in light and dark if you can, suffixed `-light` / `-dark`.
