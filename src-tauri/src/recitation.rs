//! Recitation audio cache (Claude.md §4.2).
//!
//! > "Recitation audio is NOT bundled - it is hundreds of megabytes. Instead:
//! > per-surah or per-juz download from EveryAyah / QUL audio, with a visible
//! > download manager showing size and progress. Cached under the XDG cache dir; a
//! > Settings screen shows total cache size with a 'clear' action."
//!
//! The bytes are fetched by the frontend and handed here to be written, rather
//! than pulled by an HTTP client in Rust: §3 lists no HTTP crate and §12.5 says to
//! ask before adding one, and the webview already has `fetch` with streaming
//! progress - which is exactly what the download manager needs to display.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// §4.2's reciters, with their EveryAyah directory names.
pub const RECITERS: &[(&str, &str, &str)] = &[
    ("alafasy", "Mishary Alafasy", "Alafasy_128kbps"),
    ("abdulbasit", "Abdul Basit (Murattal)", "Abdul_Basit_Murattal_192kbps"),
    ("husary", "Husary", "Husary_128kbps"),
    ("sudais", "Sudais", "Abdurrahmaan_As-Sudais_192kbps"),
    ("minshawi", "Minshawi", "Minshawy_Murattal_128kbps"),
];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Reciter {
    pub id: String,
    pub name: String,
    /// Path segment on everyayah.com, so the frontend builds the URL.
    pub directory: String,
}

pub fn reciters() -> Vec<Reciter> {
    RECITERS
        .iter()
        .map(|(id, name, dir)| Reciter {
            id: (*id).to_string(),
            name: (*name).to_string(),
            directory: (*dir).to_string(),
        })
        .collect()
}

fn known(reciter: &str) -> bool {
    RECITERS.iter().any(|(id, _, _)| *id == reciter)
}

fn audio_root() -> PathBuf {
    crate::settings::cache_dir().join("audio")
}

/// `~/.cache/al-minabr/audio/<reciter>/<sss><aaa>.mp3`
///
/// The reciter id is checked against the known list rather than interpolated, so a
/// value arriving from the frontend can never walk out of the cache directory.
pub fn ayah_path(reciter: &str, surah: u16, ayah: u16) -> Result<PathBuf, String> {
    if !known(reciter) {
        return Err(format!("unknown reciter: {reciter}"));
    }
    if !(1..=114).contains(&surah) || ayah == 0 || ayah > 286 {
        return Err(format!("out of range: {surah}:{ayah}"));
    }
    Ok(audio_root().join(reciter).join(format!("{surah:03}{ayah:03}.mp3")))
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub bytes: u64,
    pub files: u64,
}

fn walk(dir: &std::path::Path, stats: &mut CacheStats) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        match entry.file_type() {
            Ok(t) if t.is_dir() => walk(&entry.path(), stats),
            Ok(t) if t.is_file() => {
                if let Ok(m) = entry.metadata() {
                    stats.bytes += m.len();
                    stats.files += 1;
                }
            }
            _ => {}
        }
    }
}

/// §4.2: "a Settings screen shows total cache size with a 'clear' action."
pub fn cache_stats() -> CacheStats {
    let mut stats = CacheStats::default();
    walk(&audio_root(), &mut stats);
    stats
}

pub fn clear_cache() -> Result<(), String> {
    let root = audio_root();
    if !root.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&root).map_err(|e| format!("could not clear the audio cache: {e}"))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SurahAudio {
    pub reciter: String,
    pub surah: u16,
    /// How many of the surah's ayahs are on disk.
    pub cached: u16,
    pub total: u16,
    pub bytes: u64,
}

impl SurahAudio {
    pub fn complete(&self) -> bool {
        self.total > 0 && self.cached == self.total
    }
}

pub fn surah_status(reciter: &str, surah: u16, ayah_count: u16) -> Result<SurahAudio, String> {
    if !known(reciter) {
        return Err(format!("unknown reciter: {reciter}"));
    }
    let mut cached = 0;
    let mut bytes = 0;
    for ayah in 1..=ayah_count {
        let path = ayah_path(reciter, surah, ayah)?;
        if let Ok(meta) = std::fs::metadata(&path) {
            if meta.len() > 0 {
                cached += 1;
                bytes += meta.len();
            }
        }
    }
    Ok(SurahAudio { reciter: reciter.to_string(), surah, cached, total: ayah_count, bytes })
}

#[derive(Deserialize)]
pub struct StoreRequest {
    pub reciter: String,
    pub surah: u16,
    pub ayah: u16,
    pub bytes: Vec<u8>,
}

/// Writes one downloaded ayah. Written to a temporary name and renamed, so an
/// interrupted download cannot leave a truncated file that later looks cached.
pub fn store(req: StoreRequest) -> Result<(), String> {
    if req.bytes.is_empty() {
        return Err("refusing to store an empty file".into());
    }
    let path = ayah_path(&req.reciter, req.surah, req.ayah)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    }
    let tmp = path.with_extension("part");
    std::fs::write(&tmp, &req.bytes).map_err(|e| format!("could not write the audio: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("could not finish the download: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_five_reciters_from_4_2_are_present() {
        let ids: Vec<_> = reciters().into_iter().map(|r| r.id).collect();
        for expected in ["alafasy", "abdulbasit", "husary", "sudais", "minshawi"] {
            assert!(ids.contains(&expected.to_string()), "§4.2 requires {expected}");
        }
    }

    #[test]
    fn paths_land_under_the_xdg_cache_dir() {
        let p = ayah_path("alafasy", 1, 1).unwrap();
        assert!(p.ends_with("001001.mp3"), "got {}", p.display());
        assert!(p.to_string_lossy().contains("al-minabr"));
        assert!(p.to_string_lossy().contains("audio"));
    }

    #[test]
    fn a_reciter_id_can_never_escape_the_cache_directory() {
        // The id arrives from the frontend, so it is checked against the known
        // list rather than interpolated into a path.
        for evil in ["../../etc", "..", "alafasy/../../..", "/etc/passwd", ""] {
            assert!(ayah_path(evil, 1, 1).is_err(), "{evil:?} was accepted");
        }
    }

    #[test]
    fn out_of_range_references_are_rejected() {
        assert!(ayah_path("alafasy", 0, 1).is_err());
        assert!(ayah_path("alafasy", 115, 1).is_err());
        assert!(ayah_path("alafasy", 1, 0).is_err());
        assert!(ayah_path("alafasy", 2, 287).is_err(), "the longest surah has 286 ayahs");
        assert!(ayah_path("alafasy", 2, 286).is_ok());
    }

    #[test]
    fn storing_an_empty_body_is_refused() {
        // A failed fetch that yielded nothing must not create a file that later
        // counts as cached.
        let err = store(StoreRequest {
            reciter: "alafasy".into(), surah: 1, ayah: 1, bytes: vec![],
        });
        assert!(err.is_err());
    }

    #[test]
    fn completeness_needs_every_ayah() {
        let mut s = SurahAudio {
            reciter: "alafasy".into(), surah: 1, cached: 6, total: 7, bytes: 0,
        };
        assert!(!s.complete(), "a partial download is not playable end to end");
        s.cached = 7;
        assert!(s.complete());
        s.total = 0;
        assert!(!s.complete(), "zero of zero is not complete");
    }
}
