//! The panel widget (Claude.md §8.2).
//!
//! > "The always-visible surface. [...] **A text label beside the icon: the next
//! > prayer and its countdown** (`المغرب 1:42` / `Maghrib 1:42`), updating every
//! > minute - the entire point of a panel widget is that the answer is visible
//! > without clicking anything."

use tauri::image::Image;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent, TrayIconId};
use tauri::AppHandle;

use crate::prayer::PrayerName;
use crate::scheduler::Status;
use crate::settings::{AppSettings, TrayLabelFormat};

pub const TRAY_ID: &str = "al-minabr-tray";

/* ------------------------------- label ---------------------------------- */

const ARABIC_INDIC: [char; 10] = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/// §5.3: "Respect the user's Arabic-Indic digit preference (§8.2) here too."
fn digits(text: &str, arabic_indic: bool) -> String {
    if !arabic_indic {
        return text.to_string();
    }
    text.chars()
        .map(|c| c.to_digit(10).map(|d| ARABIC_INDIC[d as usize]).unwrap_or(c))
        .collect()
}

pub fn arabic_name(p: PrayerName) -> &'static str {
    match p {
        PrayerName::Fajr => "الفجر",
        PrayerName::Sunrise => "الشروق",
        PrayerName::Dhuhr => "الظهر",
        PrayerName::Asr => "العصر",
        PrayerName::Maghrib => "المغرب",
        PrayerName::Isha => "العشاء",
    }
}

pub fn latin_name(p: PrayerName) -> &'static str {
    match p {
        PrayerName::Fajr => "Fajr",
        PrayerName::Sunrise => "Sunrise",
        PrayerName::Dhuhr => "Dhuhr",
        PrayerName::Asr => "Asr",
        PrayerName::Maghrib => "Maghrib",
        PrayerName::Isha => "Isha",
    }
}

pub fn display_name(p: PrayerName, arabic: bool) -> &'static str {
    if arabic { arabic_name(p) } else { latin_name(p) }
}

fn name_from_id(id: &str) -> Option<PrayerName> {
    PrayerName::ALL.into_iter().find(|p| p.id() == id)
}

/// `1:42` - hours and minutes only. The panel updates every minute (§8.2), so
/// seconds would be a lie the moment they were drawn.
fn countdown_hm(seconds: i64) -> String {
    let s = seconds.max(0);
    format!("{}:{:02}", s / 3600, (s % 3600) / 60)
}

/// §8.2: "Label format configurable: name+countdown · name+clock time · countdown
/// only · icon only."
pub fn label_for(status: &Status, settings: &AppSettings) -> String {
    let Some(next) = &status.next else { return String::new() };
    let arabic = settings.language.starts_with("ar");
    let name = name_from_id(next.name).map(|p| display_name(p, arabic)).unwrap_or("");
    let indic = settings.arabic_indic_digits;

    match settings.tray_label_format {
        TrayLabelFormat::IconOnly => String::new(),
        TrayLabelFormat::CountdownOnly => digits(&countdown_hm(status.seconds_remaining), indic),
        TrayLabelFormat::NameAndTime => {
            format!("{name} {}", digits(&next.clock, indic))
        }
        TrayLabelFormat::NameAndCountdown => {
            format!("{name} {}", digits(&countdown_hm(status.seconds_remaining), indic))
        }
    }
}

/// §8.2: "Tooltip: today's full timetable."
pub fn tooltip_for(status: &Status, settings: &AppSettings) -> String {
    let arabic = settings.language.starts_with("ar");
    let indic = settings.arabic_indic_digits;
    let mut lines = Vec::new();

    if let Some(today) = &status.today {
        lines.push(format!(
            "{} {} {}",
            digits(&today.hijri.day.to_string(), indic),
            if arabic { today.hijri_month_ar } else { today.hijri_month_en },
            digits(&today.hijri.year.to_string(), indic),
        ));
        for t in &today.times {
            let name = name_from_id(t.name).map(|p| display_name(p, arabic)).unwrap_or(t.name);
            lines.push(format!("{name}  {}", digits(&t.clock, indic)));
        }
    }
    if let Some((p, _)) = status.missed {
        // §8.7's quiet line: reported, never rung.
        lines.push(format!("{} passed", display_name(p, arabic)));
    }
    lines.join("\n")
}

/* -------------------------------- icon ---------------------------------- */

/// Tray state, which §8.2 wants visible at a glance.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum IconState {
    Normal,
    /// "A visible state change in the final 10 minutes before a prayer."
    Imminent,
    /// "a distinct state while the adhan is playing."
    Playing,
}

/// The minbar mark, drawn as RGBA rather than shipped as a file per state, so it
/// can be tinted at runtime.
///
/// §8.2 asks for "a monochrome, theme-aware icon that follows the panel's light/dark
/// background". SNI has no way to ask the host what colour its panel is, so the
/// normal state is drawn in a mid grey that reads acceptably on both, and the two
/// attention states use colour, where legibility on either background is the point.
pub fn icon(state: IconState, size: u32) -> Image<'static> {
    let (r, g, b) = match state {
        IconState::Normal => (0x9Au8, 0x9Au8, 0x9Au8),
        IconState::Imminent => (0x3A, 0xA2, 0x94), // --accent-green-teal, dark shade
        IconState::Playing => (0xD6, 0x7C, 0x51),  // --accent-clay, dark shade
    };
    let n = size as f64;
    let mut rgba = vec![0u8; (size * size * 4) as usize];

    // Same geometry as the app mark: three treads ascending right-to-left on a base.
    let treads = [(0.22, 0.66), (0.40, 0.52), (0.58, 0.38)];
    let ss = 3; // supersample
    for y in 0..size {
        for x in 0..size {
            let mut hits = 0;
            for sy in 0..ss {
                for sx in 0..ss {
                    let u = (x as f64 + (sx as f64 + 0.5) / ss as f64) / n;
                    let v = (y as f64 + (sy as f64 + 0.5) / ss as f64) / n;
                    let mirrored = 1.0 - u;
                    let on_base = (0.16..=0.84).contains(&u) && (0.78..=0.86).contains(&v);
                    let on_tread = treads.iter().any(|&(x0, top)| {
                        (x0..=0.80).contains(&mirrored) && (top..=0.78).contains(&v)
                    });
                    if on_base || on_tread {
                        hits += 1;
                    }
                }
            }
            if hits > 0 {
                let i = ((y * size + x) * 4) as usize;
                rgba[i] = r;
                rgba[i + 1] = g;
                rgba[i + 2] = b;
                rgba[i + 3] = (255 * hits / (ss * ss)) as u8;
            }
        }
    }
    Image::new_owned(rgba, size, size)
}

/* -------------------------------- menu ---------------------------------- */

/// §8.2's right-click menu, rebuilt on each status change because two of its items
/// are conditional: the next-prayer label, and "Stop adhan" only while playing.
pub fn build_menu(
    app: &AppHandle,
    status: &Status,
    settings: &AppSettings,
    adhan_playing: bool,
) -> tauri::Result<Menu<tauri::Wry>> {
    let arabic = settings.language.starts_with("ar");
    let indic = settings.arabic_indic_digits;
    let mut menu = MenuBuilder::new(app);

    menu = menu.item(&MenuItemBuilder::with_id("open", "Open Al-Minabr").build(app)?);

    // A disabled row, so the answer is in the menu as well as the label.
    if let Some(next) = &status.next {
        let name = name_from_id(next.name).map(|p| display_name(p, arabic)).unwrap_or("");
        let text = format!("{name} — {}", digits(&next.clock, indic));
        menu = menu.item(&MenuItemBuilder::with_id("next", text).enabled(false).build(app)?);
    }
    if let Some((p, epoch)) = status.missed {
        // §8.7: "show a quiet 'Maghrib passed at 19:42' line".
        let clock = status
            .today
            .as_ref()
            .and_then(|d| d.times.iter().find(|t| t.epoch == epoch))
            .map(|t| t.clock.clone())
            .unwrap_or_default();
        let text = format!("{} passed at {}", display_name(p, arabic), digits(&clock, indic));
        menu = menu.item(&MenuItemBuilder::with_id("missed", text).enabled(false).build(app)?);
    }

    menu = menu.separator();

    if adhan_playing {
        menu = menu.item(&MenuItemBuilder::with_id("stop_adhan", "Stop adhan").build(app)?);
    }

    let muted = settings.mute.until_epoch.is_some();
    menu = menu.item(
        &MenuItemBuilder::with_id(
            "mute_today",
            if muted { "Unmute notifications" } else { "Mute notifications for today" },
        )
        .build(app)?,
    );
    menu = menu.item(
        &SubmenuBuilder::new(app, "Mute until")
            .item(&MenuItemBuilder::with_id("mute_1h", "1 hour from now").build(app)?)
            .item(&MenuItemBuilder::with_id("mute_3h", "3 hours from now").build(app)?)
            .item(&MenuItemBuilder::with_id("mute_tomorrow", "Tomorrow").build(app)?)
            .build()?,
    );

    // §8.2: "Today's timetable → [sub-menu of the six times]".
    if let Some(today) = &status.today {
        let mut sub = SubmenuBuilder::new(app, "Today's timetable");
        for t in &today.times {
            let name = name_from_id(t.name).map(|p| display_name(p, arabic)).unwrap_or(t.name);
            sub = sub.item(
                &MenuItemBuilder::with_id(format!("t_{}", t.name), format!("{name}  {}", digits(&t.clock, indic)))
                    .enabled(false)
                    .build(app)?,
            );
        }
        menu = menu.item(&sub.build()?);
    }

    menu = menu.separator();
    menu = menu.item(&MenuItemBuilder::with_id("settings", "Settings").build(app)?);
    menu = menu.item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?);
    menu.build()
}

/* -------------------------------- build --------------------------------- */

/// Creates the tray item. §8.1 delays this by `tray_delay_seconds` at login "so it
/// settles after the shell's own panel has finished loading - this is what stops
/// the icon from vanishing on GNOME session start"; the caller owns that wait.
pub fn create(app: &AppHandle, menu: Menu<tauri::Wry>) -> tauri::Result<()> {
    TrayIconBuilder::with_id(TrayIconId::new(TRAY_ID))
        .icon(icon(IconState::Normal, 22))
        .icon_as_template(false)
        .menu(&menu)
        // Left-click opens the mini window; the menu is right-click only (§8.2).
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = crate::windows::toggle_mini(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prayer::PrayerTime;

    fn status(seconds: i64, clock: &str) -> Status {
        Status {
            next: Some(PrayerTime {
                name: "maghrib",
                epoch: 1_000_000,
                clock: clock.to_string(),
                date: "2026-08-28".into(),
                is_prayer: true,
            }),
            previous: None,
            seconds_remaining: seconds,
            imminent: seconds <= 600,
            today: None,
            missed: None,
        }
    }

    #[test]
    fn the_label_is_the_spec_example() {
        // §8.2 gives `Maghrib 1:42` / `المغرب 1:42` verbatim.
        let mut s = AppSettings::default();
        s.language = "en".into();
        s.arabic_indic_digits = false;
        assert_eq!(label_for(&status(6120, "19:07"), &s), "Maghrib 1:42");

        s.language = "ar".into();
        assert_eq!(label_for(&status(6120, "19:07"), &s), "المغرب 1:42");
    }

    #[test]
    fn arabic_indic_digits_reach_the_panel() {
        // §8.2: "Respect the user's Arabic-Indic digit preference here too."
        let mut s = AppSettings::default();
        s.language = "ar".into();
        s.arabic_indic_digits = true;
        assert_eq!(label_for(&status(6120, "19:07"), &s), "المغرب ١:٤٢");
    }

    #[test]
    fn every_label_format_is_distinct() {
        let mut s = AppSettings::default();
        s.language = "en".into();
        s.arabic_indic_digits = false;
        let st = status(6120, "19:07");

        s.tray_label_format = TrayLabelFormat::NameAndCountdown;
        assert_eq!(label_for(&st, &s), "Maghrib 1:42");
        s.tray_label_format = TrayLabelFormat::NameAndTime;
        assert_eq!(label_for(&st, &s), "Maghrib 19:07");
        s.tray_label_format = TrayLabelFormat::CountdownOnly;
        assert_eq!(label_for(&st, &s), "1:42");
        s.tray_label_format = TrayLabelFormat::IconOnly;
        assert_eq!(label_for(&st, &s), "");
    }

    #[test]
    fn countdown_pads_minutes_and_never_goes_negative() {
        assert_eq!(countdown_hm(6120), "1:42");
        assert_eq!(countdown_hm(300), "0:05", "minutes are zero-padded");
        assert_eq!(countdown_hm(0), "0:00");
        assert_eq!(countdown_hm(-30), "0:00", "a passed prayer never shows a negative");
        assert_eq!(countdown_hm(36_000), "10:00");
    }

    #[test]
    fn the_label_is_empty_when_there_is_no_next_prayer() {
        let s = AppSettings::default();
        let empty = Status {
            next: None, previous: None, seconds_remaining: 0,
            imminent: false, today: None, missed: None,
        };
        assert_eq!(label_for(&empty, &s), "");
    }

    #[test]
    fn the_icon_renders_at_every_panel_size() {
        // §8.2: "Supply the tray icon at 16/22/24/32/48 px."
        for size in [16u32, 22, 24, 32, 48] {
            for state in [IconState::Normal, IconState::Imminent, IconState::Playing] {
                let img = icon(state, size);
                assert_eq!(img.width(), size);
                assert_eq!(img.height(), size);
                assert!(
                    img.rgba().iter().skip(3).step_by(4).any(|&a| a > 0),
                    "icon at {size}px in {state:?} came out empty"
                );
            }
        }
    }

    #[test]
    fn the_three_icon_states_are_visually_distinct() {
        let normal = icon(IconState::Normal, 22);
        let imminent = icon(IconState::Imminent, 22);
        let playing = icon(IconState::Playing, 22);
        assert_ne!(normal.rgba(), imminent.rgba());
        assert_ne!(imminent.rgba(), playing.rgba());
        assert_ne!(normal.rgba(), playing.rgba());
    }
}
