"""Build the bundled content database (Claude.md §4.2, §4.3).

Reads the committed source texts in `data/quran/` and produces
`src-tauri/resources/quran.db`. The database is derived, so it is gitignored; the
sources it is built from are committed, which is what makes the build reproducible.

§4.2 is emphatic that a wrong import is "the single most damaging bug this app can
ship", so this script asserts every count the spec names and refuses to write a
database that fails any of them.

  python3 scripts/build-content-db.py
"""
import hashlib
import json
import os
import re
import sqlite3
import sys
import xml.etree.ElementTree as ET

SRC = "data/quran"
OUT = "src-tauri/resources/quran.db"

# §4.2's required counts.
EXPECT = {
    "surahs": 114, "verses": 6236, "pages": 604, "juzs": 30,
    "hizb_quarters": 240, "manzils": 7, "rukus": 556, "sajdas": 15,
}

# ---------------------------------------------------------------- normalisation

TASHKEEL = re.compile(r"[ً-ْٰٓ-ٕـۖ-ۭ]")
ALEF = re.compile(r"[أإآٱ]")     # أ إ آ ٱ

def normalise(text: str) -> str:
    """§5.4: strip tashkeel, unify alef forms, teh marbuta, alef maksura, tatweel.

    Searching "الرحمن" must find "ٱلرَّحْمَٰن", so both sides go through this.
    """
    text = TASHKEEL.sub("", text)
    text = ALEF.sub("ا", text)          # -> ا
    text = text.replace("ة", "ه")  # ة -> ه
    text = text.replace("ى", "ي")  # ى -> ي
    return " ".join(text.split())

def bismillah_prefix_len(text: str, basmalah_bare: str) -> int:
    """How many characters of `text` are the opening basmalah, or 0.

    Tanzil's Uthmani text prefixes the basmalah to verse 1 of every surah except
    At-Tawbah, and §7.2 needs it as a separate centred band rather than inline. The
    stored text is never modified - the Tanzil licence forbids that and §12.3
    forbids touching religious content - so the *length* is recorded instead and
    the renderer splits at display time.

    Matching is on the undiacriticised form because surahs 95 and 97 carry a shadda
    on the ba (بِّسْمِ), assimilated from the end of the preceding surah. That is
    genuine Uthmani orthography, and a byte comparison would silently miss both.
    """
    bare_all = TASHKEEL.sub("", text)
    # Al-Fatiha's verse 1 *is* the basmalah - it is the verse, not a prefix on one.
    if bare_all == basmalah_bare:
        return 0
    # At-Tawbah opens without it.
    if not bare_all.startswith(basmalah_bare):
        return 0
    for i in range(1, len(text) + 1):
        if TASHKEEL.sub("", text[:i]) == basmalah_bare:
            # Take the marks that belong to the basmalah's final letter, and the
            # space separating it from the verse proper, so the remainder starts
            # cleanly at the first real word.
            while i < len(text) and (TASHKEEL.fullmatch(text[i]) or text[i] == " "):
                i += 1
            return i
    return 0

# ---------------------------------------------------------------------- parsing

def read_pipe(path):
    """Tanzil's `sura|ayah|text` format. Comment lines carry the licence block."""
    rows, notice = {}, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("#"):
                notice.append(line.lstrip("# ").rstrip())
                continue
            if not line.strip():
                continue
            surah, ayah, text = line.split("|", 2)
            rows[(int(surah), int(ayah))] = text
    return rows, "\n".join(l for l in notice if l).strip()

def read_metadata():
    root = ET.parse(f"{SRC}/quran-data.xml").getroot()
    def rows(tag):
        return list(root.find(tag))
    surahs = [{
        "number": int(s.get("index")),
        "ayah_count": int(s.get("ayas")),
        "start_page": int(s.get("start_page") or 0),
        "name_ar": s.get("name"),
        "name_transliterated": s.get("tname"),
        "name_en": s.get("ename"),
        "revelation_place": s.get("type"),   # Meccan / Medinan
        "revelation_order": int(s.get("order")),
        "ruku_count": int(s.get("rukus")),
    } for s in rows("suras")]

    def marks(tag):
        return [(int(x.get("index")), int(x.get("sura")), int(x.get("aya"))) for x in rows(tag)]

    sajdas = [{
        "index": int(x.get("index")), "surah": int(x.get("sura")), "ayah": int(x.get("aya")),
        # §4.2: "Schools differ on whether 14 or 15 of those are recited
        # prostrations - render all 15 markers and let the About/data screen note
        # the difference rather than silently picking a side."
        "obligation": x.get("type"),
    } for x in rows("sajdas")]

    return {
        "surahs": surahs,
        "pages": marks("pages"),
        "juzs": marks("juzs"),
        "hizb_quarters": marks("hizbs"),
        "manzils": marks("manzils"),
        "rukus": marks("rukus"),
        "sajdas": sajdas,
    }

def assign(marks, verses_in_order):
    """Map each verse to the mark (page/juz/ruku/...) whose range contains it."""
    starts = sorted(((s, a), i) for i, s, a in marks)
    out, cursor = {}, 0
    for key in verses_in_order:
        while cursor + 1 < len(starts) and starts[cursor + 1][0] <= key:
            cursor += 1
        out[key] = starts[cursor][1]
    return out

# ------------------------------------------------------------------------ build

def main():
    uthmani, uthmani_notice = read_pipe(f"{SRC}/quran-uthmani.txt")
    simple, _ = read_pipe(f"{SRC}/quran-simple-clean.txt")
    translation, translation_notice = read_pipe(f"{SRC}/en.sahih.txt")
    meta = read_metadata()

    keys = sorted(uthmani)
    problems = []
    if len(keys) != EXPECT["verses"]:
        problems.append(f"{len(keys)} verses, expected {EXPECT['verses']}")
    if len(meta["surahs"]) != EXPECT["surahs"]:
        problems.append(f"{len(meta['surahs'])} surahs, expected {EXPECT['surahs']}")
    for name in ("pages", "juzs", "hizb_quarters", "manzils", "rukus", "sajdas"):
        if len(meta[name]) != EXPECT[name]:
            problems.append(f"{len(meta[name])} {name}, expected {EXPECT[name]}")
    if set(simple) != set(uthmani):
        problems.append("the simple and uthmani texts do not cover the same verses")
    if set(translation) != set(uthmani):
        problems.append("the translation does not cover the same verses as the text")
    # The per-surah ayah counts in the metadata must agree with the text itself.
    for s in meta["surahs"]:
        actual = sum(1 for (su, _) in keys if su == s["number"])
        if actual != s["ayah_count"]:
            problems.append(f"surah {s['number']}: {actual} verses, metadata says {s['ayah_count']}")
    if problems:
        print("REFUSING to write the database:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)

    page = assign(meta["pages"], keys)
    juz = assign(meta["juzs"], keys)
    hizb = assign(meta["hizb_quarters"], keys)
    manzil = assign(meta["manzils"], keys)
    ruku = assign(meta["rukus"], keys)
    sajda = {(s["surah"], s["ayah"]): s["obligation"] for s in meta["sajdas"]}

    # §4.2: "a checksum over the concatenated text matching the Tanzil source".
    checksum = hashlib.sha256("".join(uthmani[k] for k in keys).encode()).hexdigest()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)
    db = sqlite3.connect(OUT)
    db.executescript("""
        PRAGMA journal_mode = DELETE;
        CREATE TABLE surahs (
            number INTEGER PRIMARY KEY, name_ar TEXT NOT NULL,
            name_transliterated TEXT NOT NULL, name_en TEXT NOT NULL,
            revelation_place TEXT NOT NULL, revelation_order INTEGER NOT NULL,
            ayah_count INTEGER NOT NULL, start_page INTEGER NOT NULL,
            ruku_count INTEGER NOT NULL);
        CREATE TABLE verses (
            surah INTEGER NOT NULL, ayah INTEGER NOT NULL,
            text_uthmani TEXT NOT NULL, text_simple TEXT NOT NULL,
            text_normalised TEXT NOT NULL,
            -- Characters at the head of the text that are the opening basmalah,
            -- so §7.2 can render it as a band without the stored text ever
            -- being altered. 0 for every verse that has none.
            bismillah_prefix INTEGER NOT NULL DEFAULT 0,
            page INTEGER NOT NULL, juz INTEGER NOT NULL, hizb_quarter INTEGER NOT NULL,
            manzil INTEGER NOT NULL, ruku INTEGER NOT NULL,
            sajda TEXT,
            PRIMARY KEY (surah, ayah));
        CREATE INDEX verses_page ON verses(page);
        CREATE INDEX verses_juz ON verses(juz);
        -- §5.4: FTS5 over the normalised column; matches are highlighted in the
        -- original vocalised text, which is why both are stored.
        CREATE VIRTUAL TABLE verses_fts USING fts5(
            text_normalised, surah UNINDEXED, ayah UNINDEXED, tokenize = 'unicode61');
        CREATE TABLE translations (
            id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            language TEXT NOT NULL, translator TEXT NOT NULL,
            license TEXT NOT NULL, source TEXT NOT NULL, notice TEXT);
        CREATE TABLE translation_verses (
            translation_id INTEGER NOT NULL REFERENCES translations(id),
            surah INTEGER NOT NULL, ayah INTEGER NOT NULL, text TEXT NOT NULL,
            PRIMARY KEY (translation_id, surah, ayah));
        CREATE TABLE tafsirs (
            id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            language TEXT NOT NULL, author TEXT NOT NULL,
            license TEXT NOT NULL, source TEXT NOT NULL, notice TEXT);
        CREATE TABLE tafsir_verses (
            tafsir_id INTEGER NOT NULL REFERENCES tafsirs(id),
            surah INTEGER NOT NULL, ayah INTEGER NOT NULL, text TEXT NOT NULL,
            PRIMARY KEY (tafsir_id, surah, ayah));
        -- First word of each printed line; gaps are surah header bands.
        CREATE TABLE mushaf_lines (
            page INTEGER NOT NULL, line INTEGER NOT NULL,
            surah INTEGER NOT NULL, ayah INTEGER NOT NULL, word_position INTEGER NOT NULL,
            PRIMARY KEY (page, line));
        -- §4.2: "every bundled text keeps its licence and source attribution in an
        -- in-app About the data screen. This is required, not optional."
        CREATE TABLE attributions (
            key TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL,
            license TEXT NOT NULL, notice TEXT);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

        -- §4.3 athkar. The source is the publisher's own feed, which carries text
        -- and repeat count; reference and benefit are nullable because it does not
        -- expose them and §12.3 forbids inventing them.
        CREATE TABLE athkar_categories (
            id INTEGER PRIMARY KEY, title TEXT NOT NULL, position INTEGER NOT NULL,
            entry_count INTEGER NOT NULL, audio TEXT);
        CREATE TABLE athkar (
            -- Surrogate key: a dhikr can legitimately appear in more than one
            -- chapter (جزاك الله خيرا is in both 86 and 87), so the publisher's id
            -- is not unique and is kept as plain data.
            row_id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL REFERENCES athkar_categories(id),
            position INTEGER NOT NULL, text TEXT NOT NULL, repeat INTEGER NOT NULL,
            reference TEXT, benefit TEXT, audio TEXT);
        CREATE INDEX athkar_by_category ON athkar(category_id, position);
    """)

    db.executemany(
        "INSERT INTO surahs VALUES (:number,:name_ar,:name_transliterated,:name_en,"
        ":revelation_place,:revelation_order,:ayah_count,:start_page,:ruku_count)",
        meta["surahs"])

    basmalah_bare = TASHKEEL.sub("", uthmani[(1, 1)])
    verse_rows = [(s, a, uthmani[(s, a)], simple[(s, a)], normalise(simple[(s, a)]),
                   bismillah_prefix_len(uthmani[(s, a)], basmalah_bare) if a == 1 else 0,
                   page[(s, a)], juz[(s, a)], hizb[(s, a)], manzil[(s, a)], ruku[(s, a)],
                   sajda.get((s, a))) for (s, a) in keys]
    db.executemany("INSERT INTO verses VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", verse_rows)
    db.executemany("INSERT INTO verses_fts (text_normalised, surah, ayah) VALUES (?,?,?)",
                   [(r[4], r[0], r[1]) for r in verse_rows])

    # §4.2 calls a wrong import the most damaging bug this app can ship, so the
    # basmalah split is checked here rather than trusted.
    with_prefix = sum(1 for r in verse_rows if r[5] > 0)
    if with_prefix != 112:
        print(f"REFUSING: {with_prefix} surahs have a basmalah prefix, expected 112 "
              f"(all but Al-Fatiha, where it is verse 1, and At-Tawbah, which has none)",
              file=sys.stderr)
        sys.exit(1)
    # The remainder must be real text, never a stray diacritic left behind.
    for s_, a_, text_, *_rest in verse_rows:
        n = _rest[2]
        if n and not TASHKEEL.sub("", text_[n:]).strip():
            print(f"REFUSING: {s_}:{a_} would be empty after removing the basmalah",
                  file=sys.stderr)
            sys.exit(1)

    db.execute("INSERT INTO translations VALUES (1,'en.sahih','Saheeh International',"
               "'en','Saheeh International','Tanzil / see notice',"
               "'https://tanzil.net',?)", (translation_notice,))
    db.executemany("INSERT INTO translation_verses VALUES (1,?,?,?)",
                   [(s, a, translation[(s, a)]) for (s, a) in keys])

    tafsir = json.load(open(f"{SRC}/tafsir-muyassar.json", encoding="utf-8"))
    db.execute("INSERT INTO tafsirs VALUES (1,'ar.muyassar','التفسير الميسر','ar',"
               "'مجمع الملك فهد لطباعة المصحف الشريف','See the About the data screen',"
               "'https://github.com/spa5k/tafsir_api',NULL)")
    db.executemany("INSERT INTO tafsir_verses VALUES (1,?,?,?)",
                   [(t["surah"], t["ayah"], t["text"]) for t in tafsir])

    layout_path = f"{SRC}/mushaf-layout-kfgqpc.json"
    layout_rows = 0
    if os.path.exists(layout_path):
        layout = json.load(open(layout_path))
        rows = [(int(p), ln, su, ay, pos)
                for p, lines in layout["pages"].items() for ln, su, ay, pos in lines]

        # The layout indexes words the way quran.com does, which counts each
        # verse's end-of-ayah marker as a final word. So a verse of n words has
        # positions 1..n+1, and a line starting at n+1 begins with that marker -
        # what happens in the printed mushaf when the marker wraps to the next
        # line. The renderer therefore walks [w1..wn, MARKER] per verse.
        #
        # Asserted rather than assumed: an overshoot of anything but exactly 1
        # would mean the two tokenisations have genuinely diverged, and every
        # line break on the page would land in the wrong place.
        token_count = {k: len(v.split()) for k, v in uthmani.items()}
        overshoot = set()
        for _p, _ln, su, ay, pos in rows:
            n = token_count.get((su, ay))
            if n is None:
                print(f"REFUSING: layout references {su}:{ay}, which is not in the text",
                      file=sys.stderr)
                sys.exit(1)
            if pos > n:
                overshoot.add(pos - n)
        if overshoot - {1}:
            print(f"REFUSING: mushaf layout word positions overshoot by {sorted(overshoot)}; "
                  f"only the end-of-ayah marker (+1) is expected", file=sys.stderr)
            sys.exit(1)

        db.executemany("INSERT INTO mushaf_lines VALUES (?,?,?,?,?)", rows)
        layout_rows = len(rows)

    # ---- §4.3 athkar -------------------------------------------------------
    athkar_path = f"{SRC.replace('quran', 'athkar')}/hisn-al-muslim.json"
    athkar_total = 0
    if os.path.exists(athkar_path):
        book = json.load(open(athkar_path, encoding="utf-8"))
        cat_rows, entry_rows = [], []
        for position, cat in enumerate(book["categories"], 1):
            cat_rows.append((cat["id"], cat["title"], position, len(cat["entries"]), cat.get("audio")))
            for i, e in enumerate(cat["entries"], 1):
                entry_rows.append((e["id"], cat["id"], i, e["text"], max(1, e["repeat"]),
                                   e.get("reference"), e.get("benefit"), e.get("audio")))
        # e["id"] is the publisher's, and repeats across chapters - see the schema.
        # A dhikr with no text, or a category with none, would render as a blank
        # card - §12.4 forbids that reaching a commit.
        if any(not r[3].strip() for r in entry_rows):
            print("REFUSING: an athkar entry has no text", file=sys.stderr)
            sys.exit(1)
        if any(c[3] == 0 for c in cat_rows):
            print("REFUSING: an athkar category has no entries", file=sys.stderr)
            sys.exit(1)
        db.executemany("INSERT INTO athkar_categories VALUES (?,?,?,?,?)", cat_rows)
        db.executemany(
            "INSERT INTO athkar (source_id, category_id, position, text, repeat, "
            "reference, benefit, audio) VALUES (?,?,?,?,?,?,?,?)", entry_rows)
        athkar_total = len(entry_rows)

    db.executemany("INSERT INTO attributions VALUES (?,?,?,?,?)", [
        ("quran-uthmani", "Tanzil Quran Text (Uthmani)", "https://tanzil.net",
         "Creative Commons Attribution 3.0", uthmani_notice),
        ("translation-en-sahih", "Saheeh International (English)", "https://tanzil.net",
         "See notice", translation_notice),
        ("tafsir-muyassar", "التفسير الميسر — Tafsir al-Muyassar",
         "https://github.com/spa5k/tafsir_api", "See the About the data screen", None),
        ("mushaf-layout", "KFGQPC (Madani) 604-page line layout",
         "https://api.quran.com/api/v4", "See the About the data screen",
         "Line positions of the King Fahd Complex printed mushaf."),
        ("cities", "GeoNames cities5000", "https://www.geonames.org",
         "Creative Commons Attribution 4.0", None),
        ("athkar", "حصن المسلم — Hisn al-Muslim, سعيد بن علي بن وهف القحطاني",
         "https://www.hisnmuslim.com", "See the About the data screen",
         "Taken from the book's own website. The publisher's feed carries the text "
         "and repeat count only, so hadith references and benefit notes are absent "
         "rather than sourced elsewhere."),
    ])
    db.executemany("INSERT INTO meta VALUES (?,?)", [
        ("uthmani_sha256", checksum),
        ("verse_count", str(len(keys))),
        ("surah_count", str(len(meta["surahs"]))),
        ("page_count", str(len(meta["pages"]))),
        ("sajda_count", str(len(meta["sajdas"]))),
        ("mushaf_lines", str(layout_rows)),
        ("bismillah_prefixed_surahs", str(with_prefix)),
        ("athkar_count", str(athkar_total)),
    ])
    db.commit()
    db.execute("VACUUM")
    db.close()

    # A stamp the app compares against the installed copy, so a rebuilt database
    # actually replaces a stale one. Derived from the content itself rather than a
    # timestamp, so an identical rebuild does not force a needless reinstall.
    stamp = hashlib.sha256(
        f"{checksum}|{len(keys)}|{layout_rows}|{athkar_total}|{len(meta['surahs'])}".encode()
    ).hexdigest()[:16]
    with open(os.path.join(os.path.dirname(OUT), "content.version"), "w") as f:
        f.write(stamp + "\n")

    size = os.path.getsize(OUT) / 1024 / 1024
    print(f"{OUT}  {size:.1f} MB")
    print(f"  verses {len(keys)}  surahs {len(meta['surahs'])}  pages {len(meta['pages'])}  "
          f"sajdas {len(meta['sajdas'])}")
    print(f"  mushaf line rows: {layout_rows}" if layout_rows else
          "  mushaf line layout: ABSENT - page mode falls back to flowed verses (§4.2)")
    print(f"  athkar: {athkar_total} adhkar" if athkar_total else
          "  athkar: ABSENT - run scripts/fetch-athkar.py")
    print(f"  uthmani sha256: {checksum}")
    print(f"  content stamp : {stamp}")

if __name__ == "__main__":
    main()
