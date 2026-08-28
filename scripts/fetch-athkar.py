"""Fetch Hisn al-Muslim from its own publisher (Claude.md §4.3).

hisnmuslim.com is the book's official site, so the text comes from the publisher
with no transcription layer in between - which is what matters under §12.3.

Committed afterwards so the app never contacts anything at runtime.
"""
import json, sys, time, urllib.request, urllib.error

UA = {"User-Agent": "al-minabr-build/0.1 (offline athkar app; one-time import)"}
INDEX = "https://www.hisnmuslim.com/api/ar/husn_ar.json"
OUT = "data/athkar/hisn-al-muslim.json"

def get(url, attempt=1):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45) as r:
            return json.loads(r.read().decode("utf-8-sig", errors="ignore"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        if attempt >= 4:
            raise
        time.sleep(2 * attempt)
        return get(url, attempt + 1)

categories = list(get(INDEX).values())[0]
print(f"{len(categories)} categories")

out = []
for i, cat in enumerate(categories, 1):
    url = cat["TEXT"].replace("http://", "https://")
    try:
        items = list(get(url).values())[0]
    except Exception as e:
        print(f"  FAILED {cat['ID']} {cat['TITLE']}: {e}", file=sys.stderr)
        continue
    entries = []
    for z in items:
        text = (z.get("ARABIC_TEXT") or "").strip()
        if not text:
            continue
        entries.append({
            "id": z["ID"],
            "text": text,
            "repeat": int(z.get("REPEAT") or 1),
            # §4.3 also wants a reference and a benefit note. The publisher's feed
            # carries neither, and §12.3 forbids inventing them, so they stay null
            # until a sourced second dataset fills them.
            "reference": None,
            "benefit": None,
            "audio": (z.get("AUDIO") or "").replace("http://", "https://") or None,
        })
    out.append({
        "id": cat["ID"],
        "title": cat["TITLE"].strip(),
        "audio": (cat.get("AUDIO_URL") or "").replace("http://", "https://") or None,
        "entries": entries,
    })
    if i % 25 == 0 or i == len(categories):
        print(f"  {i}/{len(categories)}", flush=True)
    time.sleep(0.12)

total = sum(len(c["entries"]) for c in out)
json.dump({
    "source": "https://www.hisnmuslim.com/api/ar/",
    "work": "حصن المسلم من أذكار الكتاب والسنة",
    "author": "سعيد بن علي بن وهف القحطاني",
    "note": "Fetched from the book's official website. The feed carries the Arabic "
            "text and repeat count only; reference and benefit are null because the "
            "publisher does not expose them and §12.3 forbids inventing them.",
    "categories": out,
}, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print(f"\n{len(out)} categories, {total} adhkar -> {OUT}")
