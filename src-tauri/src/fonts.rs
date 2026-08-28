//! System font discovery for §5.2's typography settings.
//!
//! > "The family dropdown lists **bundled fonts first**, then **system Arabic
//! > fonts** discovered by shelling out to `fc-list :lang=ar family` from the Rust
//! > side and de-duplicating. If `fontconfig` is missing, degrade to bundled fonts
//! > only and say so in the UI."

use serde::Serialize;
use std::process::Command;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SystemFonts {
    /// Family names, sorted and de-duplicated.
    pub families: Vec<String>,
    /// False when fontconfig is absent or unusable, so the UI can say so rather
    /// than silently showing a short list.
    pub fontconfig_available: bool,
}

/// Splits one `fc-list` line into family names.
///
/// fontconfig returns comma-separated aliases per family, and localised names are
/// given as `Arabic Name,English Name`. Every alias is kept: a user who knows a
/// face by its Arabic name should find it by that name.
fn parse_families(output: &str) -> Vec<String> {
    let mut families: Vec<String> = output
        .lines()
        .flat_map(|line| line.split(','))
        .map(|name| name.trim())
        .filter(|name| {
            !name.is_empty()
                // fontconfig occasionally emits style suffixes on their own line.
                && name.len() < 80
                && !name.starts_with(':')
        })
        .map(str::to_string)
        .collect();
    families.sort_by_key(|f| f.to_lowercase());
    families.dedup_by_key(|f| f.to_lowercase());
    families
}

pub fn system_arabic_fonts() -> SystemFonts {
    match Command::new("fc-list").args([":lang=ar", "family"]).output() {
        Ok(out) if out.status.success() => SystemFonts {
            families: parse_families(&String::from_utf8_lossy(&out.stdout)),
            fontconfig_available: true,
        },
        // Either fc-list is missing, or it failed. Both mean the same thing to the
        // user, and §5.2 says to degrade to bundled fonts and say so.
        _ => SystemFonts { families: Vec::new(), fontconfig_available: false },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aliases_are_split_trimmed_and_deduplicated() {
        let raw = "Amiri\nNoto Naskh Arabic,نوتو نسخ عربي\nAmiri\n  Scheherazade New  \n";
        let f = parse_families(raw);
        assert!(f.contains(&"Amiri".to_string()));
        assert!(f.contains(&"Noto Naskh Arabic".to_string()));
        // The Arabic alias is kept: someone may know the face only by that name.
        assert!(f.contains(&"نوتو نسخ عربي".to_string()));
        assert!(f.contains(&"Scheherazade New".to_string()), "leading space not trimmed");
        assert_eq!(f.iter().filter(|x| *x == "Amiri").count(), 1, "duplicate survived");
    }

    #[test]
    fn deduplication_ignores_case() {
        let f = parse_families("Amiri\namiri\nAMIRI\n");
        assert_eq!(f.len(), 1, "got {f:?}");
    }

    #[test]
    fn junk_lines_are_dropped() {
        let f = parse_families("\n  \n:lang=ar\nAmiri\n");
        assert_eq!(f, vec!["Amiri".to_string()]);
    }

    #[test]
    fn a_missing_fontconfig_is_reported_not_hidden() {
        // Can't uninstall fontconfig in a test, so this checks the shape: whatever
        // the host has, the flag and the list must agree.
        let f = system_arabic_fonts();
        if !f.fontconfig_available {
            assert!(f.families.is_empty(), "reported unavailable but returned families");
        }
    }
}
