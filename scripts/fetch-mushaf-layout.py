"""Fetch the KFGQPC (Madani) 604-page line layout.

Claude.md §4.2 asks for this from QUL, but QUL puts its downloads behind a sign-in.
quran.com's API v4 exposes the same King Fahd Complex layout as a `line_number` on
every word, without an account, so that is the source used here.

Only the *first word of each line* is kept: everything else is reconstructable by
walking the words of the page in order and breaking where a line starts. That turns
~77,000 words into ~9,000 rows. Gaps in the line numbering are where the printed
mushaf puts a surah header band or the basmalah.

One-time; the output is committed so the app never contacts anything at runtime.
"""
import json, sys, time, urllib.request, urllib.error

UA = {"User-Agent": "al-minabr-build/0.1 (offline Quran app; one-time layout import)"}
OUT = "data/quran/mushaf-layout-kfgqpc.json"

def fetch(page, attempt=1):
    url = (f"https://api.quran.com/api/v4/verses/by_page/{page}"
           "?words=true&word_fields=line_number,position&per_page=300")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45) as r:
            return json.load(r)
    except (urllib.error.URLError, TimeoutError) as e:
        if attempt >= 4:
            raise
        time.sleep(2 * attempt)
        return fetch(page, attempt + 1)

pages = {}
for n in range(1, 605):
    data = fetch(n)
    first_of_line = {}
    for v in data["verses"]:
        surah, ayah = (int(x) for x in v["verse_key"].split(":"))
        for w in v.get("words", []):
            ln = w["line_number"]
            pos = w.get("position") or 1
            key = (surah, ayah, pos)
            if ln not in first_of_line or key < first_of_line[ln]:
                first_of_line[ln] = key
    pages[str(n)] = [[ln, *first_of_line[ln]] for ln in sorted(first_of_line)]
    if n % 50 == 0 or n == 604:
        print(f"  {n}/604", flush=True)
    time.sleep(0.15)

json.dump({
    "source": "https://api.quran.com/api/v4 (word.line_number)",
    "layout": "KFGQPC / King Fahd Complex Madani, 604 pages",
    "note": "Each entry is [line_number, surah, ayah, word_position] for the first "
            "word on that line. Gaps in line numbers are surah header bands.",
    "pages": pages,
}, open(OUT, "w"), separators=(",", ":"))
print("wrote", OUT)
