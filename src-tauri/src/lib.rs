pub mod cities;
pub mod prayer;

use serde::Serialize;
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Content area the design targets (§6.7 "Minimum window size 900x640").
const MIN_CONTENT_W: f64 = 900.0;
const MIN_CONTENT_H: f64 = 640.0;
/// §6.7: "Leave ~24px of transparent padding for it and account for that in the
/// window size." Only present where we can actually be transparent.
const SHADOW_MARGIN: f64 = 24.0;

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct WindowChrome {
    /// "wayland", "x11", or "unknown".
    session_type: &'static str,
    /// Whether the window is transparent, and therefore whether the frontend may
    /// round the root container and draw its own shadow.
    transparent: bool,
    /// Transparent padding the drop shadow occupies, in CSS px. 0 when opaque.
    shadow_margin: f64,
}

/// §6.7: "Detect the session type at startup (XDG_SESSION_TYPE) and, where
/// transparency is unreliable, fall back to square window corners."
///
/// Wayland always composites, so transparency is the reliable case there and is the
/// primary target (§2). X11 may be running without a compositor, which produces black
/// corners - we never ship that artefact, so X11 gets square corners and no drawn
/// shadow. The layout is identical either way; only the translucency disappears.
fn detect_chrome() -> WindowChrome {
    let session = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
    match session.as_str() {
        "wayland" => WindowChrome { session_type: "wayland", transparent: true, shadow_margin: SHADOW_MARGIN },
        "x11" => WindowChrome { session_type: "x11", transparent: false, shadow_margin: 0.0 },
        _ => WindowChrome { session_type: "unknown", transparent: false, shadow_margin: 0.0 },
    }
}

#[tauri::command]
fn window_chrome() -> WindowChrome {
    detect_chrome()
}

/// Yesterday, today and tomorrow, in the location's own timezone (§4.1, §7.1).
#[tauri::command]
fn prayer_window(
    location: prayer::Location,
    settings: prayer::Settings,
) -> Result<Vec<prayer::DayTimes>, String> {
    let today = prayer::today_in(&location)?;
    prayer::window(today, &location, &settings)
}

/// §4.1 offline city search. No geolocation service is contacted.
#[tauri::command]
fn search_cities(query: String, limit: Option<usize>) -> Vec<cities::City> {
    cities::search(&query, limit.unwrap_or(20).min(100))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Qibla {
    /// Degrees clockwise from true north.
    bearing: f64,
    distance_km: f64,
}

/// §7.4. Bearing is from *true* north; the app never pretends to know which way
/// the user is facing, because a laptop has no magnetometer.
#[tauri::command]
fn qibla(latitude: f64, longitude: f64) -> Qibla {
    Qibla {
        bearing: prayer::qibla_bearing(latitude, longitude),
        distance_km: prayer::distance_to_makkah_km(latitude, longitude),
    }
}

/// The fresh-install location, so the frontend never hard-codes it (§4.1).
#[tauri::command]
fn default_location() -> prayer::Location {
    prayer::Location::default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let chrome = detect_chrome();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            window_chrome,
            prayer_window,
            search_cities,
            qibla,
            default_location
        ])
        .setup(move |app| {
            // §1: the product name lives once, in tauri.conf.json.
            let title = app.package_info().name.clone();
            let pad = chrome.shadow_margin * 2.0;

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(title)
                // §6.7: custom 44px title bar, so no server-side decorations.
                .decorations(false)
                .transparent(chrome.transparent)
                .inner_size(1180.0 + pad, 820.0 + pad)
                .min_inner_size(MIN_CONTENT_W + pad, MIN_CONTENT_H + pad)
                .resizable(true)
                // §8.1: never create a visible window and hide it a tick later - that
                // is the window flash. Built hidden, shown explicitly below.
                .visible(false)
                .build()?;

            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Al-Minabr");
}
