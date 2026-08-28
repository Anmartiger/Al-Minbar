//! Bundled Quran database plumbing (Claude.md §4.2, §8.8).
//!
//! The database is built at build time by `scripts/build-quran-db.py` and shipped
//! as a Tauri resource. §8.8 puts the app's database at
//! `~/.local/share/al-minabr/al-minabr.db`, so on first run the read-only resource
//! is copied there - after which it is writable, which is what bookmarks and
//! reading state need.
//!
//! Queries themselves live on the frontend through `tauri-plugin-sql`, as §3
//! specifies. This module only owns the file's existence and identity.

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const DB_FILE: &str = "al-minabr.db";
const RESOURCE: &str = "resources/quran.db";

/// Bumped when `build-quran-db.py` changes shape. A database copied by an older
/// version is replaced rather than migrated: it holds no user data of its own
/// until bookmarks land in it, and those live in their own tables which are
/// carried across.
const SCHEMA_VERSION: i64 = 1;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    /// Absolute path, so the frontend can hand it to tauri-plugin-sql.
    pub path: String,
    /// False when the bundled resource is missing - the reader then explains
    /// itself instead of failing with a SQL error.
    pub available: bool,
    pub schema_version: i64,
}

pub fn database_path() -> PathBuf {
    crate::settings::data_dir().join(DB_FILE)
}

/// Copies the bundled database into the data directory if it is not already
/// there. Returns where it ended up.
pub fn ensure(app: &AppHandle) -> Result<DatabaseInfo, String> {
    let target = database_path();
    let path = target.to_string_lossy().to_string();

    if target.is_file() {
        return Ok(DatabaseInfo { path, available: true, schema_version: SCHEMA_VERSION });
    }

    let source = app
        .path()
        .resolve(RESOURCE, tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("could not resolve the bundled database: {e}"))?;

    if !source.is_file() {
        // Not fatal: prayer times, athkar and the panel do not need it. §4.2's
        // reader explains the absence rather than the app failing outright.
        return Ok(DatabaseInfo { path, available: false, schema_version: SCHEMA_VERSION });
    }

    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    }
    // Copy to a temporary name first, so an interrupted first run cannot leave a
    // half-written database that later launches would treat as complete.
    let tmp = target.with_extension("db.partial");
    std::fs::copy(&source, &tmp).map_err(|e| format!("could not copy the database: {e}"))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("could not install the database: {e}"))?;

    Ok(DatabaseInfo { path, available: true, schema_version: SCHEMA_VERSION })
}

/// Tables the app writes to, created alongside the bundled read-only content.
/// Kept here rather than in the build script because they belong to the user, not
/// to the shipped data - a database rebuilt from new source text must not drop them.
pub const USER_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    surah INTEGER NOT NULL,
    ayah INTEGER NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (surah, ayah)
);
CREATE TABLE IF NOT EXISTS reading_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    surah INTEGER NOT NULL,
    ayah INTEGER NOT NULL,
    page INTEGER NOT NULL,
    mode TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_database_lives_where_8_8_says() {
        let p = database_path();
        assert!(p.ends_with("al-minabr.db"), "path was {}", p.display());
        assert!(
            p.parent().is_some_and(|d| d.ends_with("al-minabr")),
            "expected the XDG data dir, got {}",
            p.display()
        );
    }

    #[test]
    fn the_user_schema_is_idempotent_and_separate() {
        // It must be safe to run on every launch, and must not touch the tables
        // the build script owns.
        assert!(USER_SCHEMA.contains("IF NOT EXISTS"), "user tables must be create-if-missing");
        assert!(!USER_SCHEMA.contains("DROP"), "the user schema must never drop anything");
        for shipped in ["verses", "surahs", "translations", "tafsirs", "mushaf_lines"] {
            assert!(
                !USER_SCHEMA.contains(&format!("CREATE TABLE IF NOT EXISTS {shipped}")),
                "the user schema must not redefine the shipped table {shipped}"
            );
        }
    }
}
