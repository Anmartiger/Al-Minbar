//! StatusNotifierItem host detection (Claude.md §8.2).
//!
//! > "Vanilla GNOME Shell **has no tray**. Ubuntu ships
//! > `gnome-shell-extension-appindicator` enabled by default so it works there out
//! > of the box, but Debian GNOME and some Mint setups do not. Detect at startup
//! > whether a StatusNotifierItem host is registered on the session bus
//! > (`org.kde.StatusNotifierWatcher`). If none is, show a **one-time, dismissible**
//! > first-run card [...] and keep the app fully functional without it."

use serde::Serialize;

const WATCHER: &str = "org.kde.StatusNotifierWatcher";

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrayHost {
    /// Whether `org.kde.StatusNotifierWatcher` is on the session bus at all.
    pub watcher_present: bool,
    /// Whether it reports an actual host attached. A watcher with no host still
    /// means no icon appears.
    pub host_registered: bool,
}

impl TrayHost {
    pub fn usable(self) -> bool {
        self.watcher_present && self.host_registered
    }
}

/// Blocking probe of the session bus. Called once at startup; a failure to reach
/// the bus is reported as "no host" rather than being an error, because the app has
/// to keep working either way.
pub fn detect() -> TrayHost {
    match probe() {
        Ok(h) => h,
        Err(e) => {
            eprintln!("al-minabr: could not query {WATCHER} ({e}); assuming no tray host");
            TrayHost { watcher_present: false, host_registered: false }
        }
    }
}

fn probe() -> Result<TrayHost, Box<dyn std::error::Error>> {
    let conn = zbus::blocking::Connection::session()?;
    let dbus = zbus::blocking::fdo::DBusProxy::new(&conn)?;
    let names = dbus.list_names()?;
    let watcher_present = names.iter().any(|n| n.as_str() == WATCHER);
    if !watcher_present {
        return Ok(TrayHost { watcher_present: false, host_registered: false });
    }

    // IsStatusNotifierHostRegistered is a plain property on the watcher.
    let props = zbus::blocking::fdo::PropertiesProxy::builder(&conn)
        .destination(WATCHER)?
        .path("/StatusNotifierWatcher")?
        .build()?;
    let host_registered = props
        .get(WATCHER.try_into()?, "IsStatusNotifierHostRegistered")
        .ok()
        .and_then(|v| bool::try_from(v).ok())
        // A watcher that will not answer is still a watcher; assume it works rather
        // than telling the user to install something they already have.
        .unwrap_or(true);

    Ok(TrayHost { watcher_present, host_registered })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usable_requires_both_a_watcher_and_a_host() {
        assert!(TrayHost { watcher_present: true, host_registered: true }.usable());
        assert!(!TrayHost { watcher_present: true, host_registered: false }.usable());
        assert!(!TrayHost { watcher_present: false, host_registered: false }.usable());
    }

    #[test]
    fn detect_never_panics_whatever_the_bus_says() {
        // On a headless CI box there is no session bus at all; this must still
        // return rather than take the process down.
        let _ = detect();
    }
}
