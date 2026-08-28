//! Offline city search (Claude.md §4.1).
//!
//! "Location input: search a bundled offline city database (a trimmed GeoNames
//! `cities5000` extract - name, country, lat, lon, timezone; keep it under 2 MB and
//! include Arabic city names in the searchable index) **or** type coordinates
//! directly. [...] Do not call a geolocation service."
//!
//! The table is embedded in the binary and parsed on first search, not at startup -
//! a resident process that never opens a window should not be holding 70,000 cities
//! in memory. (Budget: 100 MB RSS hidden, revised from §8.1's 60 - DESIGN_NOTES §8.3.)
//! See `scripts/build-cities.py` for the encoding.

use serde::Serialize;
use std::sync::OnceLock;

const TABLE: &str = include_str!("../data/cities.tsv");

#[derive(Serialize, Clone, Debug)]
pub struct City {
    pub name: String,
    /// Empty when GeoNames has no Arabic name for this city.
    pub name_ar: String,
    pub country: String,
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: String,
}

struct Entry {
    city: City,
    /// Normalised haystack: Latin-folded name plus the normalised Arabic name.
    search_latin: String,
    search_arabic: String,
}

fn from_b36(s: &str) -> Option<i64> {
    let (neg, body) = match s.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, s),
    };
    if body.is_empty() {
        return None;
    }
    let mut n: i64 = 0;
    for c in body.chars() {
        n = n * 36 + c.to_digit(36)? as i64;
    }
    Some(if neg { -n } else { n })
}

/// §5.4's normalisation, applied to city names so "عجلون" matches "عَجْلُون".
/// Strips tashkeel, unifies alef forms, teh marbuta, alef maksura and tatweel.
pub fn normalise_arabic(input: &str) -> String {
    input
        .chars()
        .filter_map(|c| match c {
            // tashkeel and the superscript alef
            '\u{064B}'..='\u{0652}' | '\u{0670}' => None,
            // tatweel
            '\u{0640}' => None,
            // alef forms -> bare alef
            'أ' | 'إ' | 'آ' | 'ٱ' => Some('ا'),
            // teh marbuta -> heh
            'ة' => Some('ه'),
            // alef maksura -> yeh
            'ى' => Some('ي'),
            other => Some(other),
        })
        .collect()
}

/// Fold Latin text for searching: lowercase, and strip the diacritics GeoNames
/// uses liberally, so "ajlun" finds "‘Ajlūn".
pub fn fold_latin(input: &str) -> String {
    input
        .chars()
        .filter_map(|c| {
            let c = c.to_ascii_lowercase();
            Some(match c {
                'à'..='å' | 'ā' | 'ă' | 'ą' => 'a',
                'è'..='ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' => 'e',
                'ì'..='ï' | 'ī' | 'ĭ' | 'į' | 'ı' => 'i',
                'ò'..='ö' | 'ø' | 'ō' | 'ŏ' | 'ő' => 'o',
                'ù'..='ü' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' => 'u',
                'ç' | 'ć' | 'č' => 'c',
                'ñ' | 'ń' | 'ň' => 'n',
                'ş' | 'š' | 'ś' => 's',
                'ğ' | 'ģ' => 'g',
                'ý' | 'ÿ' => 'y',
                'ž' | 'ź' | 'ż' => 'z',
                'ř' => 'r',
                'ť' => 't',
                'ď' => 'd',
                'ł' => 'l',
                // Drop the punctuation GeoNames sprinkles through transliterations.
                '\'' | '’' | '‘' | '`' | '-' | '.' => return None,
                other => other,
            })
        })
        .collect()
}

fn table() -> &'static Vec<Entry> {
    static TABLE_CACHE: OnceLock<Vec<Entry>> = OnceLock::new();
    TABLE_CACHE.get_or_init(|| {
        let mut lines = TABLE.lines();
        let zones: Vec<&str> = match lines.next() {
            Some(header) => header.split('\t').collect(),
            None => return Vec::new(),
        };
        lines
            .filter_map(|line| {
                let mut f = line.split('\t');
                let name = f.next()?;
                let name_ar = f.next()?;
                let country = f.next()?;
                let latitude = from_b36(f.next()?)? as f64 / 10_000.0;
                let longitude = from_b36(f.next()?)? as f64 / 10_000.0;
                let timezone = *zones.get(from_b36(f.next()?)? as usize)?;
                Some(Entry {
                    search_latin: fold_latin(name),
                    search_arabic: normalise_arabic(name_ar),
                    city: City {
                        name: name.to_string(),
                        name_ar: name_ar.to_string(),
                        country: country.to_string(),
                        latitude,
                        longitude,
                        timezone: timezone.to_string(),
                    },
                })
            })
            .collect()
    })
}

/// Rows are pre-sorted most-populous-first, so scanning in order and stopping at
/// `limit` gives the useful answer without a scoring pass: "London" finds the one
/// in England before the one in Ohio.
pub fn search(query: &str, limit: usize) -> Vec<City> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }
    let q_latin = fold_latin(q);
    let q_arabic = normalise_arabic(q);
    let has_latin = !q_latin.is_empty();
    let has_arabic = !q_arabic.is_empty();

    let matches = |e: &Entry, prefix_only: bool| {
        let hit = |hay: &str, needle: &str| {
            !needle.is_empty()
                && !hay.is_empty()
                && if prefix_only { hay.starts_with(needle) } else { hay.contains(needle) }
        };
        (has_latin && hit(&e.search_latin, &q_latin))
            || (has_arabic && hit(&e.search_arabic, &q_arabic))
    };

    // Prefix hits first - typing "lond" should not surface "New London" above
    // "London" - then fall back to substring matches to fill the list.
    let mut out: Vec<City> = table()
        .iter()
        .filter(|e| matches(e, true))
        .take(limit)
        .map(|e| e.city.clone())
        .collect();
    if out.len() < limit {
        for e in table().iter().filter(|e| matches(e, false)) {
            if out.len() >= limit {
                break;
            }
            if !out.iter().any(|c| {
                c.name == e.city.name && c.country == e.city.country
                    && (c.latitude - e.city.latitude).abs() < 1e-6
            }) {
                out.push(e.city.clone());
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_parses_and_is_substantial() {
        let t = table();
        assert!(t.len() > 60_000, "expected the full cities5000 set, got {}", t.len());
        assert!(t.iter().any(|e| !e.city.name_ar.is_empty()), "no Arabic names in the index");
    }

    #[test]
    fn base36_round_trips_including_negatives() {
        assert_eq!(from_b36("0"), Some(0));
        assert_eq!(from_b36("z"), Some(35));
        assert_eq!(from_b36("10"), Some(36));
        assert_eq!(from_b36("-10"), Some(-36));
        assert_eq!(from_b36(""), None);
        assert_eq!(from_b36("!"), None);
    }

    #[test]
    fn finds_the_default_location() {
        // §4.1's default is Ajloun, so it had better be findable.
        let hits = search("ajlun", 10);
        let ajloun = hits.iter().find(|c| c.country == "JO").expect("Ajloun not found");
        assert!((ajloun.latitude - 32.333).abs() < 0.01, "lat was {}", ajloun.latitude);
        assert!((ajloun.longitude - 35.753).abs() < 0.01, "lon was {}", ajloun.longitude);
        assert_eq!(ajloun.timezone, "Asia/Amman");
    }

    #[test]
    fn latin_search_ignores_diacritics_and_punctuation() {
        // The stored name is "‘Ajlūn"; none of these spellings should miss it.
        for q in ["ajlun", "Ajlūn", "‘Ajlun", "AJLUN"] {
            assert!(
                search(q, 20).iter().any(|c| c.country == "JO" && c.timezone == "Asia/Amman"),
                "query {q:?} failed to find Ajloun"
            );
        }
    }

    #[test]
    fn arabic_search_is_diacritic_insensitive() {
        // §5.4: searching the bare form must find the vocalised one and vice versa.
        let plain = search("مكة", 20);
        assert!(plain.iter().any(|c| c.country == "SA"), "مكة not found");
        let vocalised = search("مَكَّة", 20);
        assert!(vocalised.iter().any(|c| c.country == "SA"), "مَكَّة not found");
        // Teh marbuta folds to heh, so this spelling must match too.
        assert!(search("مكه", 20).iter().any(|c| c.country == "SA"), "مكه not found");
    }

    #[test]
    fn prefix_matches_rank_before_substring_matches() {
        let hits = search("london", 5);
        assert!(!hits.is_empty());
        assert!(
            hits[0].country == "GB",
            "expected London, GB first; got {} ({})",
            hits[0].name,
            hits[0].country
        );
    }

    #[test]
    fn empty_query_returns_nothing() {
        assert!(search("", 10).is_empty());
        assert!(search("   ", 10).is_empty());
    }

    #[test]
    fn limit_is_honoured() {
        assert!(search("a", 7).len() <= 7);
    }

    #[test]
    fn every_timezone_in_the_table_is_resolvable() {
        // A bad timezone string would only surface at prayer-time calculation,
        // which is far too late.
        use std::collections::HashSet;
        let mut seen = HashSet::new();
        for e in table() {
            if seen.insert(e.city.timezone.clone()) {
                assert!(
                    e.city.timezone.parse::<chrono_tz::Tz>().is_ok(),
                    "unresolvable timezone {:?} for {}",
                    e.city.timezone,
                    e.city.name
                );
            }
        }
        assert!(seen.len() > 300, "expected a few hundred zones, got {}", seen.len());
    }
}
