//! Window construction (Claude.md §6.7, §8.1, §8.3).
//!
//! Nothing here runs at startup in hidden mode. §8.1 is explicit:
//!
//! > "Do not initialise the webview at all in hidden mode. The prayer engine, the
//! > scheduler, audio and tray all live in Rust; the React app is only constructed
//! > when a window is first shown."
//!
//! So every window is built on demand, by a user action.

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MAIN: &str = "main";
pub const MINI: &str = "mini";

/// Content area §6.7 targets.
const MIN_CONTENT_W: f64 = 900.0;
const MIN_CONTENT_H: f64 = 640.0;
/// §6.7: "Leave ~24px of transparent padding for it and account for that in the
/// window size." Only where we can actually be transparent.
const SHADOW_MARGIN: f64 = 32.0;

/// §8.3: "~360×440".
const MINI_W: f64 = 360.0;
const MINI_H: f64 = 440.0;

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct WindowChrome {
    pub session_type: &'static str,
    pub transparent: bool,
    pub shadow_margin: f64,
}

/// §6.7: "Detect the session type at startup (`XDG_SESSION_TYPE`) and, where
/// transparency is unreliable, fall back to square window corners."
///
/// Wayland always composites, so transparency is the reliable case there and is the
/// §2 primary target. X11 may be running without a compositor, which produces black
/// corners - never shipped, so X11 gets square corners and no drawn shadow.
pub fn detect_chrome() -> WindowChrome {
    match std::env::var("XDG_SESSION_TYPE").unwrap_or_default().as_str() {
        "wayland" => WindowChrome { session_type: "wayland", transparent: true, shadow_margin: SHADOW_MARGIN },
        "x11" => WindowChrome { session_type: "x11", transparent: false, shadow_margin: 0.0 },
        _ => WindowChrome { session_type: "unknown", transparent: false, shadow_margin: 0.0 },
    }
}

/// Stamps the session onto <html> before the page runs, so the window background
/// paints on the very first frame.
///
/// This matters more than it looks. A transparent window whose content fails to
/// load renders as *nothing at all* - not a blank window, an invisible one, with
/// no way to tell it is there. Painting the backdrop from CSS that is keyed off an
/// attribute set here means the frame is visible even if the app never mounts.
fn session_script(chrome: WindowChrome) -> String {
    format!(
        "document.documentElement.dataset.session='{}';\
         document.documentElement.dataset.transparent='{}';\
         document.documentElement.style.setProperty('--window-margin','{}px');",
        chrome.session_type, chrome.transparent, chrome.shadow_margin
    )
}

pub fn is_wayland() -> bool {
    detect_chrome().session_type == "wayland"
}

/// Shows the main window, building it the first time. §8.1's single-instance
/// handler and the tray both route through here, so a second launch raises the
/// existing window rather than making another.
pub fn show_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(win) = app.get_webview_window(MAIN) {
        win.show()?;
        win.unminimize()?;
        win.set_focus()?;
        return Ok(win);
    }

    let chrome = detect_chrome();
    let pad = chrome.shadow_margin * 2.0;
    let win = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::default())
        .initialization_script(&session_script(chrome))
        // Written out rather than taken from package_info(), which returns
        // productName - and productName is lowercase so the bundler names the
        // desktop file al-minabr.desktop (§8.1). The title is what shows in the
        // window list.
        .title("Al-Minabr")
        .decorations(false)
        .transparent(chrome.transparent)
        .inner_size(1180.0 + pad, 820.0 + pad)
        .min_inner_size(MIN_CONTENT_W + pad, MIN_CONTENT_H + pad)
        .resizable(true)
        // §8.1: never create a visible window and hide it a tick later - that is
        // the window flash. Built hidden, shown explicitly below.
        .visible(false)
        .build()?;
    win.show()?;
    win.set_focus()?;
    Ok(win)
}

/// §8.3's compact popover. Toggles: a second invocation while it is open closes it,
/// which is what makes the tray click and the global shortcut feel right.
pub fn toggle_mini(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(MINI) {
        if win.is_visible().unwrap_or(false) {
            win.close()?;
            return Ok(());
        }
        win.close()?;
    }
    build_mini(app)?;
    Ok(())
}

pub fn close_mini(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MINI) {
        let _ = win.close();
    }
}

fn build_mini(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let chrome = detect_chrome();
    let mut builder = WebviewWindowBuilder::new(app, MINI, WebviewUrl::App("index.html#/mini".into()))
        .initialization_script(&session_script(chrome))
        .title("Al-Minabr")
        .decorations(false)
        .transparent(chrome.transparent)
        .inner_size(MINI_W, MINI_H)
        .resizable(false)
        // §8.3: "always-on-top, no taskbar entry".
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(true);

    // §8.3, and it is worth quoting because it is the surprising part:
    //
    //   "under Wayland an application cannot place its own window on screen, and
    //    GNOME does not implement wlr-layer-shell, so on Ubuntu 26.04 there is no
    //    way to anchor this popover to the panel icon. Do not burn a day
    //    discovering that. The Wayland behaviour is the design: open centred on the
    //    active output, offset toward the top edge, so it reads as a deliberate
    //    command-palette-style panel rather than a popover that missed its anchor."
    //
    // On X11 we can and do place it near the pointer, clamped to the work area.
    if is_wayland() {
        builder = builder.center();
    } else if let Some(pos) = x11_anchor(app) {
        builder = builder.position(pos.0, pos.1);
    } else {
        builder = builder.center();
    }

    let win = builder.build()?;

    if is_wayland() {
        // Nudge toward the top edge. Centring is all the compositor grants us, so
        // the offset is applied afterwards and is best-effort by design.
        if let Ok(Some(monitor)) = win.current_monitor() {
            let scale = monitor.scale_factor();
            let size = monitor.size().to_logical::<f64>(scale);
            let x = (size.width - MINI_W) / 2.0;
            let y = (size.height * 0.14).max(24.0);
            let _ = win.set_position(tauri::LogicalPosition::new(x, y));
        }
    }

    win.show()?;
    win.set_focus()?;
    Ok(win)
}

/// Pointer position clamped so the whole window stays on the work area. X11 only;
/// Wayland does not expose it and does not honour placement anyway.
fn x11_anchor(app: &AppHandle) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let area = monitor.size().to_logical::<f64>(scale);
    let cursor = app.cursor_position().ok()?.to_logical::<f64>(scale);
    let x = cursor.x.min(area.width - MINI_W - 8.0).max(8.0);
    // Tray icons live at the top on most panels; drop the window just below.
    let y = (cursor.y + 12.0).min(area.height - MINI_H - 8.0).max(8.0);
    Some((x, y))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chrome_follows_the_session_type() {
        // The mapping itself, without needing a session of each kind.
        let c = detect_chrome();
        assert!(matches!(c.session_type, "wayland" | "x11" | "unknown"));
        // §6.7: transparency only where it is reliable, and the shadow margin only
        // exists when we are transparent - otherwise there is nothing to draw into.
        assert_eq!(c.transparent, c.session_type == "wayland");
        assert_eq!(c.shadow_margin > 0.0, c.transparent);
    }

    #[test]
    fn the_mini_window_matches_the_documented_size() {
        // §8.3: "~360×440".
        assert_eq!((MINI_W, MINI_H), (360.0, 440.0));
    }
}
