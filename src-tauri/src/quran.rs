//! Bundled content database plumbing (Claude.md §4.2, §4.3, §8.8).
//!
//! **The shipped content and the user's own data live in separate files**, and
//! that separation is the whole point of this module.
//!
//! §8.8 names a single `~/.local/share/al-minabr/al-minabr.db`, and the first
//! implementation copied the bundled database there once and never again. Adding
//! the athkar tables in a later phase therefore changed nothing for anyone who had
//! already run the app: the installed copy still held only the Quran, and the
//! athkar screens came up empty with no error anywhere. That was not a one-off —
//! it would have recurred on every future correction to the shipped text.
//!
//! So `content.db` holds everything the app ships and is replaced wholesale
//! whenever the bundled stamp differs, while `al-minabr.db` keeps its §8.8 name and
//! holds only what the user made: bookmarks, reading position, athkar progress.
//! The frontend opens the content file and attaches the user file to it.

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// §8.8's path, now holding user data only.
pub const USER_DB: &str = "al-minabr.db";
/// The shipped content, replaced whenever the bundle changes.
pub const CONTENT_DB: &str = "content.db";
const STAMP_FILE: &str = "content.version";

const RESOURCE_DB: &str = "resources/quran.db";
const RESOURCE_STAMP: &str = "resources/content.version";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    /// Absolute path to the shipped content, for the frontend to open.
    pub path: String,
    /// Absolute path to the user's own data, attached to the above.
    pub user_path: String,
    /// False when the bundled resource is missing — the reader then explains
    /// itself instead of failing with a SQL error.
    pub available: bool,
    /// Stamp of the installed content, for diagnostics.
    pub version: String,
    /// True when this launch replaced a stale copy, so the frontend can drop the
    /// content tables an older build left inside the user file.
    pub refreshed: bool,
}

pub fn data_dir() -> PathBuf {
    crate::settings::data_dir()
}

pub fn content_path() -> PathBuf {
    data_dir().join(CONTENT_DB)
}

pub fn user_path() -> PathBuf {
    data_dir().join(USER_DB)
}

fn read_stamp(path: &std::path::Path) -> Option<String> {
    std::fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

/// Installs the bundled content, replacing an out-of-date copy.
pub fn ensure(app: &AppHandle) -> Result<DatabaseInfo, String> {
    let target = content_path();
    let installed_stamp_path = data_dir().join(STAMP_FILE);
    let info = |available, version, refreshed| DatabaseInfo {
        path: target.to_string_lossy().to_string(),
        user_path: user_path().to_string_lossy().to_string(),
        available,
        version,
        refreshed,
    };

    let resolve = |rel: &str| {
        app.path()
            .resolve(rel, tauri::path::BaseDirectory::Resource)
            .map_err(|e| format!("could not resolve {rel}: {e}"))
    };

    let source = resolve(RESOURCE_DB)?;
    if !source.is_file() {
        // Not fatal: prayer times, qibla, the calendar and the panel do not need
        // it, and the screens that do explain the absence rather than failing.
        return Ok(info(target.is_file(), String::new(), false));
    }

    let bundled_stamp = resolve(RESOURCE_STAMP).ok().and_then(|p| read_stamp(&p));
    let installed_stamp = read_stamp(&installed_stamp_path);

    // Replace when the file is missing, or when the bundle carries different
    // content. A bundle with no stamp is treated as "unknown", and only installed
    // if nothing is there — so a missing stamp can never clobber a good copy.
    let needs_install = !target.is_file()
        || match (&bundled_stamp, &installed_stamp) {
            (Some(b), Some(i)) => b != i,
            (Some(_), None) => true,
            _ => false,
        };

    if !needs_install {
        return Ok(info(true, installed_stamp.unwrap_or_default(), false));
    }

    std::fs::create_dir_all(data_dir())
        .map_err(|e| format!("could not create {}: {e}", data_dir().display()))?;
    // Copy to a temporary name and rename, so an interrupted install cannot leave
    // a half-written database that the next launch would treat as complete.
    let tmp = target.with_extension("db.partial");
    std::fs::copy(&source, &tmp).map_err(|e| format!("could not copy the database: {e}"))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("could not install the database: {e}"))?;

    let stamp = bundled_stamp.unwrap_or_default();
    if !stamp.is_empty() {
        // Written only after the database is in place: if the copy fails, the old
        // stamp stays and the next launch tries again.
        let _ = std::fs::write(&installed_stamp_path, format!("{stamp}\n"));
    }
    Ok(info(true, stamp, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_user_database_keeps_the_name_8_8_specifies() {
        let p = user_path();
        assert!(p.ends_with("al-minabr.db"), "path was {}", p.display());
        assert!(p.parent().is_some_and(|d| d.ends_with("al-minabr")));
    }

    #[test]
    fn content_sits_beside_it_in_the_same_directory() {
        assert_eq!(content_path().parent(), user_path().parent());
        assert!(content_path().ends_with("content.db"));
        // They must be different files: the whole point is that one can be
        // replaced without touching the other.
        assert_ne!(content_path(), user_path());
    }
}
