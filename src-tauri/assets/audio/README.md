# Adhan audio

## What is here

| File | What | Source |
|---|---|---|
| `chime.wav` | §4.4's "short 'beep' alternative" — a 2.6 s struck-bell figure | Synthesised by `scripts/generate-chime.mjs` |

## What is missing, and why

§4.4 asks for more than this:

> "Bundle 3–4 muezzin recordings as compressed audio (Makkah, Madinah, Al-Aqsa, and a
> short 'beep' alternative), plus a separate short Fajr adhan. Keep total under 15 MB."

**The muezzin recordings and the Fajr adhan are not present and were not generated.**
§12.3 is unambiguous:

> "Never invent Quranic text, hadith, athkar wording, or a reference. Every character of
> religious content comes from the bundled, sourced dataset. [...] This is the most
> important rule in this file."

A synthesised adhan would be exactly that — invented religious content — so the call to
prayer is not something that can be produced here. The chime can, because a notification
tone is not religious content.

## What works without them

The whole §8.6 playback path is built and testable against the chime: volume, per-prayer
sound choice, silent-for-Fajr, test-play, immediate stop from the tray, the mini window
and the notification action, and quiet failure when another application holds the audio
device.

§4.4 also says "Let the user point at their own audio file too", and that is implemented:
any sound id that is not a bundled one is treated as a filesystem path. So a user can
supply their own adhan today.

## To add the recordings

Drop compressed files in this directory and register their ids in `bundled_ids()` and
`bundled_bytes()` in `src-tauri/src/audio.rs`. Keep the total under 15 MB per §4.4, and
record the source and licence of each file in the table above — §4.2 requires bundled
material to carry its attribution into the in-app "About the data" screen.

Recordings need to be properly licensed for redistribution; the same problem that removed
two of the original fonts (DESIGN_NOTES.md §2.5) applies here.
