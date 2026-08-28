pub mod audio;
pub mod cities;
pub mod prayer;
pub mod quran;
pub mod scheduler;
pub mod settings;
pub mod sni;
pub mod tray;
pub mod windows;

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use scheduler::{Event, SchedulerState, Status};
use settings::AppSettings;
use windows::WindowChrome;

/// §8.1: "The autostart entry launches `al-minabr --hidden`."
const FLAG_HIDDEN: &str = "--hidden";
/// §8.1: "Passing `--toggle` to a running instance toggles the mini window - this
/// makes it bindable to a keyboard shortcut."
const FLAG_TOGGLE: &str = "--toggle";
/// §8.4's desktop Actions land here.
const FLAG_SETTINGS: &str = "--settings";
const FLAG_QURAN: &str = "--quran";

/// Routes a set of launch arguments to the right surface. Shared by first launch
/// and by the single-instance handler, so a desktop Action behaves identically
/// whether or not the app is already running.
fn route_args(app: &AppHandle, args: &[String]) {
    if args.iter().any(|a| a == FLAG_TOGGLE) {
        let _ = windows::toggle_mini(app);
        return;
    }
    if args.iter().any(|a| a == FLAG_HIDDEN) {
        return;
    }
    if windows::show_main(app).is_ok() {
        if args.iter().any(|a| a == FLAG_SETTINGS) {
            let _ = app.emit("open-settings", ());
        } else if args.iter().any(|a| a == FLAG_QURAN) {
            // Phase 4 gives this a route of its own; until then the desktop
            // Action still does the useful half - it opens the app.
            let _ = app.emit("open-quran", ());
        }
    }
    windows::close_mini(app);
}

pub struct AppState {
    pub settings: Mutex<AppSettings>,
    pub player: audio::Player,
    pub scheduler: Mutex<SchedulerState>,
    pub status: Mutex<Option<Status>>,
    pub tray_host: sni::TrayHost,
}

impl AppState {
    fn snapshot(&self) -> AppSettings {
        self.settings.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

/* ------------------------------ commands -------------------------------- */

#[tauri::command]
fn window_chrome() -> WindowChrome {
    windows::detect_chrome()
}

#[tauri::command]
fn prayer_window(
    location: prayer::Location,
    settings: prayer::Settings,
) -> Result<Vec<prayer::DayTimes>, String> {
    let today = prayer::today_in(&location)?;
    prayer::window(today, &location, &settings)
}

#[tauri::command]
fn search_cities(query: String, limit: Option<usize>) -> Vec<cities::City> {
    cities::search(&query, limit.unwrap_or(20).min(100))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Qibla {
    bearing: f64,
    distance_km: f64,
}

#[tauri::command]
fn qibla(latitude: f64, longitude: f64) -> Qibla {
    Qibla {
        bearing: prayer::qibla_bearing(latitude, longitude),
        distance_km: prayer::distance_to_makkah_km(latitude, longitude),
    }
}

/// §4.2's bundled database, installed into the XDG data dir on first run.
#[tauri::command]
fn quran_database(app: AppHandle) -> Result<quran::DatabaseInfo, String> {
    quran::ensure(&app)
}

#[tauri::command]
fn default_location() -> prayer::Location {
    prayer::Location::default()
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> AppSettings {
    state.snapshot()
}

#[tauri::command]
fn set_settings(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    apply_autostart(&app, settings.startup.autostart)?;
    settings.save().map_err(|e| e.to_string())?;
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = settings;
    // Recompute immediately so the panel reflects the change without waiting a tick.
    refresh(&app);
    Ok(())
}

/// What the mini window and home screen render, straight from the scheduler so
/// there is one source of truth for "what happens next".
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatusView {
    pub next: Option<prayer::PrayerTime>,
    pub previous: Option<prayer::PrayerTime>,
    pub seconds_remaining: i64,
    pub imminent: bool,
    pub today: Option<prayer::DayTimes>,
    /// §8.7's quiet line: (prayer id, epoch).
    pub missed: Option<(String, i64)>,
    pub adhan_playing: bool,
    /// §8.2's first-run card fires off this.
    pub tray_available: bool,
}

#[tauri::command]
fn status(state: tauri::State<'_, AppState>) -> Option<StatusView> {
    let s = state.status.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
    Some(StatusView {
        next: s.next,
        previous: s.previous,
        seconds_remaining: s.seconds_remaining,
        imminent: s.imminent,
        today: s.today,
        missed: s.missed.map(|(p, e)| (p.id().to_string(), e)),
        adhan_playing: state.player.is_playing(),
        tray_available: state.tray_host.usable(),
    })
}

/// §8.6: "a test-play button in Settings".
#[tauri::command]
fn play_adhan(state: tauri::State<'_, AppState>, sound: Option<String>) -> Result<(), String> {
    let s = state.snapshot();
    let sound = sound.unwrap_or(s.adhan.sound);
    state.player.play(&sound, s.adhan.volume).map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_adhan(state: tauri::State<'_, AppState>) {
    state.player.stop();
}

#[tauri::command]
fn open_main_window(app: AppHandle) -> Result<(), String> {
    windows::show_main(&app).map_err(|e| e.to_string())?;
    windows::close_mini(&app);
    Ok(())
}

#[tauri::command]
fn close_mini_window(app: AppHandle) {
    windows::close_mini(&app);
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

/* ------------------------------- runtime -------------------------------- */

/// §8.1: "A Settings toggle turns it off, and turning it off must actually remove
/// that file - not just flip a flag the app reads later."
fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let currently = manager.is_enabled().unwrap_or(false);
    if enabled && !currently {
        manager.enable().map_err(|e| e.to_string())?;
    } else if !enabled && currently {
        manager.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("al-minabr: notification failed: {e}");
    }
}

/// Applies one scheduler tick: dispatches events, updates the panel, tells any
/// open window.
fn apply(app: &AppHandle, status: Status, events: Vec<Event>) {
    let state = app.state::<AppState>();
    let settings = state.snapshot();
    let now = chrono::Utc::now().timestamp();
    let arabic = settings.language.starts_with("ar");

    for event in events {
        match event {
            Event::Prayer { name, .. } => {
                if scheduler::should_notify(&settings, name, now) {
                    notify(
                        app,
                        tray::display_name(name, arabic),
                        &format!("It is time for {}.", tray::latin_name(name)),
                    );
                }
                if scheduler::should_sound(&settings, name, now) {
                    let sound = scheduler::sound_for(&settings, name);
                    // §8.6: "If another app holds the audio device, fail quietly to
                    // a notification rather than crashing the scheduler."
                    if let Err(e) = state.player.play(&sound, settings.adhan.volume) {
                        eprintln!("al-minabr: adhan playback failed: {e}");
                        notify(app, tray::display_name(name, arabic), &format!("Adhan could not play: {e}"));
                    }
                }
            }
            Event::Reminder { name, minutes_before, .. } => {
                if scheduler::should_notify(&settings, name, now) {
                    notify(
                        app,
                        tray::display_name(name, arabic),
                        &format!("{} in {minutes_before} minutes.", tray::latin_name(name)),
                    );
                }
            }
            // §8.7: reported, never rung.
            Event::MissedWhileAsleep { .. } => {}
        }
    }

    update_tray(app, &status, &settings);
    *state.status.lock().unwrap_or_else(|e| e.into_inner()) = Some(status);
    let _ = app.emit("status-changed", ());
}

fn update_tray(app: &AppHandle, status: &Status, settings: &AppSettings) {
    let state = app.state::<AppState>();
    let Some(tray) = app.tray_by_id(tray::TRAY_ID) else { return };
    let playing = state.player.is_playing();

    let icon_state = if playing {
        tray::IconState::Playing
    } else if status.imminent {
        tray::IconState::Imminent
    } else {
        tray::IconState::Normal
    };
    let _ = tray.set_icon(Some(tray::icon(icon_state, 22)));

    let label = tray::label_for(status, settings);
    let _ = tray.set_title(if label.is_empty() { None } else { Some(label) });
    let _ = tray.set_tooltip(Some(tray::tooltip_for(status, settings)));

    if let Ok(menu) = tray::build_menu(app, status, settings, playing) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Recomputes now rather than waiting for the next tick.
fn refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let settings = state.snapshot();
    let mut sched = state.scheduler.lock().unwrap_or_else(|e| e.into_inner());
    match sched.tick(&settings, chrono::Utc::now()) {
        Ok((status, events)) => {
            drop(sched);
            apply(app, status, events);
        }
        Err(e) => eprintln!("al-minabr: recompute failed: {e}"),
    }
}

fn handle_menu(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    match id {
        "open" => {
            let _ = windows::show_main(app);
            windows::close_mini(app);
        }
        "settings" => {
            if windows::show_main(app).is_ok() {
                let _ = app.emit("open-settings", ());
            }
            windows::close_mini(app);
        }
        "stop_adhan" => {
            state.player.stop();
            refresh(app);
        }
        "quit" => app.exit(0),
        // §8.2's mute options.
        "mute_today" | "mute_1h" | "mute_3h" | "mute_tomorrow" => {
            let mut settings = state.snapshot();
            let now = chrono::Utc::now();
            settings.mute.until_epoch = match id {
                "mute_1h" => Some((now + chrono::Duration::hours(1)).timestamp()),
                "mute_3h" => Some((now + chrono::Duration::hours(3)).timestamp()),
                "mute_tomorrow" | "mute_today" => {
                    if id == "mute_today" && settings.mute.until_epoch.is_some() {
                        None // the item doubles as "unmute"
                    } else {
                        prayer::next_local_midnight(&settings.location, now).ok()
                    }
                }
                _ => None,
            };
            let _ = settings.save();
            *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = settings;
            refresh(app);
        }
        _ => {}
    }
}

fn spawn_scheduler(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(scheduler::TICK);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            refresh(&app);
        }
    });
}

/// §8.7: "subscribe to `PrepareForSleep` on `org.freedesktop.login1` over D-Bus".
///
/// The tick loop already survives suspend on its own by re-deriving from the wall
/// clock, so this is not what makes the app correct - it just collapses the
/// up-to-one-tick delay on wake to nothing.
fn spawn_suspend_watch(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let conn = match zbus::Connection::system().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("al-minabr: no system bus for suspend signals ({e}); relying on the tick loop");
                return;
            }
        };
        let proxy = match zbus::Proxy::new(
            &conn,
            "org.freedesktop.login1",
            "/org/freedesktop/login1",
            "org.freedesktop.login1.Manager",
        )
        .await
        {
            Ok(p) => p,
            Err(e) => {
                eprintln!("al-minabr: could not reach login1 ({e}); relying on the tick loop");
                return;
            }
        };
        let mut signals = match proxy.receive_signal("PrepareForSleep").await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("al-minabr: could not subscribe to PrepareForSleep ({e})");
                return;
            }
        };
        use futures_util::StreamExt;
        while let Some(msg) = signals.next().await {
            // The signal carries `true` going to sleep and `false` on wake.
            if let Ok(going_to_sleep) = msg.body().deserialize::<bool>() {
                if !going_to_sleep {
                    refresh(&app);
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let start_hidden = args.iter().any(|a| a == FLAG_HIDDEN);

    let loaded = AppSettings::load();
    let tray_delay = loaded.startup.tray_delay_seconds;
    let shortcut = loaded.startup.global_shortcut.clone();

    let state = AppState {
        settings: Mutex::new(loaded),
        player: audio::Player::new(),
        scheduler: Mutex::new(SchedulerState::default()),
        status: Mutex::new(None),
        // §8.2: detect whether anything will actually display a tray item.
        tray_host: sni::detect(),
    };

    let mut builder = tauri::Builder::default()
        // §8.1: "a second launch raises and focuses the existing window rather than
        // starting a second copy."
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            route_args(app, &argv);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        // §3: "Database SQLite via tauri-plugin-sql".
        .plugin(tauri_plugin_sql::Builder::default().build())
        // §8.1 names the file exactly: "writes ~/.config/autostart/al-minabr.desktop",
        // and §10 checks for that path by name when autostart is switched off. The
        // plugin defaults to the product name ("Al-Minabr.desktop"), so the app id
        // is passed explicitly - §1 wants every derived identifier to be al-minabr.
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("al-minabr")
                .args([FLAG_HIDDEN])
                .build(),
        );

    if shortcut.is_some() {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            window_chrome,
            prayer_window,
            search_cities,
            qibla,
            default_location,
            quran_database,
            get_settings,
            set_settings,
            status,
            play_adhan,
            stop_adhan,
            open_main_window,
            close_mini_window,
            quit
        ])
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let settings = state.snapshot();
                // §8.4: "Closing the window does not quit the app - it returns to
                // background operation, with a one-time toast the first time it
                // happens so nobody thinks it crashed."
                if window.label() == windows::MAIN && !settings.startup.close_to_quit {
                    api.prevent_close();
                    let _ = window.hide();
                    if !settings.seen_close_to_tray_notice {
                        let mut updated = settings;
                        updated.seen_close_to_tray_notice = true;
                        let _ = updated.save();
                        *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = updated;
                        notify(app, "Al-Minabr", "Still running in the panel. Quit from the tray menu or Ctrl+Q.");
                    }
                }
            }
            // §8.3: the mini window "dismisses on blur".
            if window.label() == windows::MINI {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.close();
                }
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();

            // §8.1: "Autostart is ON by default. Register with
            // tauri-plugin-autostart on first run."
            let want_autostart = handle.state::<AppState>().snapshot().startup.autostart;
            if let Err(e) = apply_autostart(&handle, want_autostart) {
                eprintln!("al-minabr: could not apply autostart: {e}");
            }

            if let Some(accel) = shortcut.clone() {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let h = handle.clone();
                if let Err(e) = handle.global_shortcut().on_shortcut(accel.as_str(), move |_, _, _| {
                    let _ = windows::toggle_mini(&h);
                }) {
                    eprintln!("al-minabr: could not register the global shortcut: {e}");
                }
            }

            // The scheduler and audio are up before any window exists, which is
            // what §8.1's "under 400 ms to armed timers" is about.
            refresh_or_report(&handle);
            spawn_scheduler(handle.clone());
            spawn_suspend_watch(handle.clone());

            // §8.1: "Add a small startup delay option (default ~10s) before the
            // panel item appears at login, so it settles after the shell's own
            // panel has finished loading."
            let tray_handle = handle.clone();
            let delay = if start_hidden { tray_delay } else { 0 };
            tauri::async_runtime::spawn(async move {
                if delay > 0 {
                    tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
                }
                let state = tray_handle.state::<AppState>();
                let settings = state.snapshot();
                let status = state
                    .status
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone()
                    .unwrap_or(Status {
                        next: None, previous: None, seconds_remaining: 0,
                        imminent: false, today: None, missed: None,
                    });
                match tray::build_menu(&tray_handle, &status, &settings, false) {
                    Ok(menu) => {
                        if let Err(e) = tray::create(&tray_handle, menu) {
                            eprintln!("al-minabr: could not create the tray item: {e}");
                        } else {
                            update_tray(&tray_handle, &status, &settings);
                        }
                    }
                    Err(e) => eprintln!("al-minabr: could not build the tray menu: {e}"),
                }
            });

            // §8.1: "A background start shows no window. [...] Do not initialise the
            // webview at all in hidden mode."
            if !start_hidden {
                route_args(&handle, &args);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Al-Minabr")
        .run(|_app, event| {
            // Without this the process exits when the last window closes, which
            // would defeat §8.4's close-to-background entirely.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

fn refresh_or_report(app: &AppHandle) {
    let state = app.state::<AppState>();
    let settings = state.snapshot();
    let mut sched = state.scheduler.lock().unwrap_or_else(|e| e.into_inner());
    match sched.tick(&settings, chrono::Utc::now()) {
        Ok((status, _)) => {
            // The first tick never fires an adhan: at startup every earlier prayer
            // is outside the grace window anyway, and events are dropped here so a
            // launch can never ring for something that already happened.
            drop(sched);
            let s = app.state::<AppState>();
            update_tray(app, &status, &settings);
            *s.status.lock().unwrap_or_else(|e| e.into_inner()) = Some(status);
        }
        Err(e) => eprintln!("al-minabr: initial computation failed: {e}"),
    }
}

pub fn state_for_tests() -> Arc<Mutex<SchedulerState>> {
    Arc::new(Mutex::new(SchedulerState::default()))
}
