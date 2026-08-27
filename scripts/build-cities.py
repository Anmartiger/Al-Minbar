"""Trim GeoNames cities5000 into the offline city database (Claude.md §4.1: under
2 MB, with Arabic city names in the searchable index).

Every one of the ~70k cities is kept - a population floor would be the easy way to
hit the budget, but it would fail exactly the user in a small town who most needs
to find it. Size comes out of the encoding instead:

  * timezones are listed once in a header and referenced by index - repeating
    "America/Argentina/Buenos_Aires" 70,000 times is otherwise most of the file
  * coordinates are fixed-point to 4 decimals (~11 m) in base 36
  * population is dropped; rows are pre-sorted by it, so row order is the rank
  * an Arabic name is kept where GeoNames has one and it is plausibly useful:
    any city in an Arabic-script country, or anywhere with population >= 100k.
    A hamlet in Norway having an Arabic transliteration is not worth the bytes.
"""
import os, sys

SRC  = sys.argv[1] if len(sys.argv) > 1 else "cities5000.txt"
OUT  = sys.argv[2] if len(sys.argv) > 2 else "src-tauri/data/cities.tsv"

ARABIC_SCRIPT_CC = {
    "JO","SA","AE","EG","IQ","SY","LB","PS","KW","QA","BH","OM","YE","MA","DZ",
    "TN","LY","SD","MR","SO","DJ","KM","TD","ER","IR","PK","AF",
}

def b36(n):
    if n == 0: return "0"
    sign, n, out = ("-" if n < 0 else ""), abs(n), ""
    while n:
        n, r = divmod(n, 36)
        out = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + out
    return sign + out

def arabic_name(alternates):
    for alt in alternates.split(","):
        alt = alt.strip()
        if not alt: continue
        letters = [c for c in alt if c.isalpha()]
        if letters and sum(0x0600 <= ord(c) <= 0x06FF for c in letters) / len(letters) > 0.8:
            return alt
    return ""

tz_index, tz_list, rows = {}, [], []
with open(SRC, encoding="utf-8") as f:
    for line in f:
        c = line.rstrip("\n").split("\t")
        if len(c) < 18 or not c[17]:
            continue
        pop, cc, tz = int(c[14] or 0), c[8], c[17]
        if tz not in tz_index:
            tz_index[tz] = len(tz_list); tz_list.append(tz)
        ar = arabic_name(c[3]) if (cc in ARABIC_SCRIPT_CC or pop >= 100_000) else ""
        rows.append((pop, (c[1], ar, cc,
                           b36(round(float(c[4]) * 10000)),
                           b36(round(float(c[5]) * 10000)),
                           b36(tz_index[tz]))))

rows.sort(key=lambda r: -r[0])
with open(OUT, "w", encoding="utf-8") as f:
    f.write("\t".join(tz_list) + "\n")
    for _, r in rows:
        f.write("\t".join(r) + "\n")

size = os.path.getsize(OUT)
arabic = sum(1 for _, r in rows if r[1])
print(f"cities={len(rows)}  timezones={len(tz_list)}  arabic_names={arabic}  "
      f"size={size/1024/1024:.2f} MB  budget={'OK' if size < 2*1024*1024 else 'OVER'}")
