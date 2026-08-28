//! Persisted settings (Claude.md §8.8).
//!
//! Paths come from the `directories` crate, never a hard-coded `~/.config`:
//!
//! ```text
//! ~/.config/al-minabr/settings.json    settings
//! ~/.local/share/al-minabr/            database (Phase 4)
//! ~/.cache/al-minabr/audio/            downloaded recitations (Phase 4)
//! ```
//!
//! The struct is deliberately plain serde rather than going through
//! `tauri-plugin-store`'s async API on every read: §8.1 budgets hidden startup at
//! under 400 ms to armed timers, and the scheduler needs these values before any
//! plugin machinery is up.

use crate::prayer::{Location, PrayerName, Settings as PrayerSettings};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Matches the identifier in tauri.conf.json. §1: the product name lives once, but
/// the XDG directory name is an identifier, not a display name.
const QUALIFIER: &str = "com";
const ORGANISATION: &str = "alminabr";
const APPLICATION: &str = "al-minabr";

pub fn project_dirs() -> Option<ProjectDirs> {
    ProjectDirs::from(QUALIFIER, ORGANISATION, APPLICATION)
}

pub fn config_dir() -> PathBuf {
    project_dirs()
        .map(|d| d.config_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from(".config/al-minabr"))
}

pub fn data_dir() -> PathBuf {
    project_dirs()
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from(".local/share/al-minabr"))
}

pub fn cache_dir() -> PathBuf {
    project_dirs()
        .map(|d| d.cache_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from(".cache/al-minabr"))
}

pub fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

/// §8.2: "Label format configurable: name+countdown · name+clock time · countdown
/// only · icon only."
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(rename_all = "snake_case")]
pub enum TrayLabelFormat {
    #[default]
    NameAndCountdown,
    NameAndTime,
    CountdownOnly,
    IconOnly,
}

/// §8.5: "an optional configurable pre-prayer reminder (5/10/15/20 min)".
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
pub struct Notifications {
    pub enabled: bool,
    /// Minutes before the prayer, or 0 for none.
    pub reminder_minutes: u16,
    /// §8.5: "Per-prayer on/off."
    pub per_prayer: PerPrayerFlags,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
pub struct PerPrayerFlags {
    pub fajr: bool,
    pub dhuhr: bool,
    pub asr: bool,
    pub maghrib: bool,
    pub isha: bool,
}

impl Default for PerPrayerFlags {
    fn default() -> Self {
        // Sunrise is not a prayer and never notifies.
        PerPrayerFlags { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }
    }
}

impl PerPrayerFlags {
    pub fn get(&self, p: PrayerName) -> bool {
        match p {
            PrayerName::Fajr => self.fajr,
            PrayerName::Dhuhr => self.dhuhr,
            PrayerName::Asr => self.asr,
            PrayerName::Maghrib => self.maghrib,
            PrayerName::Isha => self.isha,
            PrayerName::Sunrise => false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Adhan {
    pub enabled: bool,
    /// 0.0 - 1.0.
    pub volume: f32,
    /// §8.6: "a 'silent for Fajr' option".
    pub silent_for_fajr: bool,
    /// Bundled sound id, or an absolute path to the user's own file.
    /// §4.4: "Let the user point at their own audio file too."
    pub sound: String,
    /// §4.4 ships a separate short Fajr adhan.
    pub fajr_sound: String,
}

impl Default for Adhan {
    fn default() -> Self {
        Adhan {
            enabled: true,
            volume: 0.8,
            silent_for_fajr: false,
            sound: "chime".into(),
            fajr_sound: "chime".into(),
        }
    }
}

/// §8.1 startup behaviour.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Startup {
    /// §8.1: "Autostart is ON by default."
    pub autostart: bool,
    /// §8.1: "A small startup delay option (default ~10s) before the panel item
    /// appears at login, so it settles after the shell's own panel has finished
    /// loading - this is what stops the icon from vanishing on GNOME session start."
    pub tray_delay_seconds: u64,
    /// §8.4: "Closing the window does not quit the app" - unless the user flips this.
    pub close_to_quit: bool,
    /// §8.1 optional global shortcut, unset-able.
    pub global_shortcut: Option<String>,
}

impl Default for Startup {
    fn default() -> Self {
        Startup {
            autostart: true,
            tray_delay_seconds: 10,
            close_to_quit: false,
            global_shortcut: Some("Super+Shift+P".into()),
        }
    }
}

/// §8.2: "Mute notifications for today · Mute until [1h / 3h / until tomorrow]".
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
pub struct Mute {
    /// Unix seconds until which notifications and adhan are suppressed.
    pub until_epoch: Option<i64>,
}

impl Mute {
    pub fn active_at(&self, now: i64) -> bool {
        self.until_epoch.is_some_and(|u| now < u)
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(default)]
pub struct AppSettings {
    pub location: Location,
    pub prayer: PrayerSettings,
    pub notifications: Notifications,
    pub adhan: Adhan,
    pub startup: Startup,
    pub mute: Mute,
    pub tray_label_format: TrayLabelFormat,
    /// §5.3 digit preference, shared with the tray label per §8.2.
    pub arabic_indic_digits: bool,
    /// §9: "ar" or "en".
    pub language: String,
    /// §8.4's one-time "still running in the panel" toast.
    pub seen_close_to_tray_notice: bool,
    /// §8.2's one-time no-SNI-host card.
    pub seen_no_tray_notice: bool,
}

impl AppSettings {
    pub fn load() -> Self {
        let path = settings_path();
        match std::fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|e| {
                // A corrupt settings file must never stop the app from telling
                // someone when to pray. Fall back to defaults and keep going.
                eprintln!("al-minabr: settings at {} unreadable ({e}); using defaults", path.display());
                AppSettings::fresh()
            }),
            Err(_) => AppSettings::fresh(),
        }
    }

    /// Defaults for a fresh install: §9 says Arabic when the system locale starts
    /// with "ar", and §5.3 ties the digit default to the interface language.
    pub fn fresh() -> Self {
        let locale = std::env::var("LC_ALL")
            .or_else(|_| std::env::var("LC_MESSAGES"))
            .or_else(|_| std::env::var("LANG"))
            .unwrap_or_default();
        let arabic = locale.starts_with("ar");
        AppSettings {
            language: if arabic { "ar".into() } else { "en".into() },
            arabic_indic_digits: arabic,
            notifications: Notifications { enabled: true, reminder_minutes: 0, ..Default::default() },
            ..Default::default()
        }
    }

    pub fn save(&self) -> std::io::Result<()> {
        let dir = config_dir();
        std::fs::create_dir_all(&dir)?;
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        // Write-then-rename, so an interrupted save cannot leave a truncated file
        // that the next launch would have to discard.
        let tmp = settings_path().with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(tmp, settings_path())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xdg_paths_are_derived_not_hard_coded() {
        // §8.8: "Via the `directories` crate - never hard-code ~/.config".
        let config = config_dir();
        assert!(config.ends_with("al-minabr"), "config dir was {}", config.display());
        assert!(data_dir().ends_with("al-minabr"));
        assert!(cache_dir().ends_with("al-minabr"));
        assert!(settings_path().ends_with("settings.json"));
    }

    #[test]
    fn defaults_match_the_spec() {
        let s = AppSettings::default();
        // §8.1: "Autostart is ON by default."
        assert!(s.startup.autostart);
        // §8.4: closing returns to the panel unless the user opts out.
        assert!(!s.startup.close_to_quit);
        // §8.1: "a small startup delay option (default ~10s)".
        assert_eq!(s.startup.tray_delay_seconds, 10);
        assert_eq!(s.startup.global_shortcut.as_deref(), Some("Super+Shift+P"));
        // §4.1 default location.
        assert_eq!(s.location.city, "Ajloun");
        assert_eq!(s.location.timezone, "Asia/Amman");
    }

    #[test]
    fn sunrise_never_notifies() {
        let f = PerPrayerFlags::default();
        assert!(!f.get(PrayerName::Sunrise));
        assert!(f.get(PrayerName::Fajr));
    }

    #[test]
    fn mute_expires() {
        let m = Mute { until_epoch: Some(1_000) };
        assert!(m.active_at(999));
        assert!(!m.active_at(1_000), "mute is exclusive at its own deadline");
        assert!(!m.active_at(1_001));
        assert!(!Mute::default().active_at(0), "no mute set means never muted");
    }

    #[test]
    fn settings_round_trip_through_json() {
        let mut s = AppSettings::fresh();
        s.adhan.volume = 0.35;
        s.tray_label_format = TrayLabelFormat::CountdownOnly;
        s.mute.until_epoch = Some(42);
        let json = serde_json::to_string(&s).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn unknown_and_missing_fields_do_not_break_loading() {
        // Forward compatibility: a settings file written by a later version, and
        // one written by an earlier version, must both still load.
        let sparse = r#"{"adhan":{"enabled":false,"volume":0.5,"silent_for_fajr":true,
                          "sound":"x","fajr_sound":"y"},"future_field":123}"#;
        let s: AppSettings = serde_json::from_str(sparse).expect("sparse settings should load");
        assert!(!s.adhan.enabled);
        assert!(s.startup.autostart, "missing sections fall back to defaults");
    }
}
