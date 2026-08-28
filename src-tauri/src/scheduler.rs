//! Prayer scheduling and clock correctness (Claude.md §8.7).
//!
//! > "Recompute and re-arm at local midnight, on timezone change, and on **resume
//! > from suspend**. A timer that slept through Maghrib is the worst bug this app
//! > can have. Never trust a long `setTimeout`/`sleep` across a suspend. Re-derive
//! > from the wall clock on every tick and check for a missed prayer window on wake.
//! > If the machine was asleep through a prayer, do **not** fire a late adhan on
//! > wake - show a quiet 'Maghrib passed at 19:42' line in the mini window instead."
//!
//! The design follows from that last paragraph. There is no long sleep anywhere:
//! the loop wakes on a short fixed interval and re-derives everything from the wall
//! clock, so suspend, a clock step, a timezone change and a day boundary are all the
//! same event - the next tick simply sees different numbers. A prayer fires only
//! inside a short grace window after its time, which is what makes "slept through
//! it" and "it just happened" distinguishable without tracking suspend at all.
//!
//! The `login1` subscription in §8.7 is still worth having, but as an optimisation:
//! it collapses the up-to-one-tick delay on wake to nothing.

use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};

use crate::prayer::{self, DayTimes, PrayerName, PrayerTime};
use crate::settings::AppSettings;

/// How often the loop re-derives from the wall clock. Short enough that the tray
/// countdown stays honest to the minute and a prayer fires within seconds of its
/// time; long enough to be invisible in the §8.1 idle budget.
pub const TICK: std::time::Duration = std::time::Duration::from_secs(15);

/// A prayer fires only if we notice it within this window. Past that we assume the
/// machine was asleep or the process was not running, and §8.7 says not to fire a
/// late adhan - the prayer is reported as passed instead.
pub const FIRE_GRACE_SECONDS: i64 = 120;

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// Fire the adhan and a notification for this prayer.
    Prayer { name: PrayerName, epoch: i64 },
    /// §8.5's optional pre-prayer reminder. No adhan, notification only.
    Reminder { name: PrayerName, epoch: i64, minutes_before: u16 },
    /// §8.7: seen on wake. Never rings; surfaces as "Maghrib passed at 19:42".
    MissedWhileAsleep { name: PrayerName, epoch: i64 },
}

/// What the tray label and mini window render (§8.2, §8.3).
#[derive(Debug, Clone, PartialEq)]
pub struct Status {
    pub next: Option<PrayerTime>,
    pub previous: Option<PrayerTime>,
    pub seconds_remaining: i64,
    /// §8.2: "A visible state change in the final 10 minutes before a prayer."
    pub imminent: bool,
    pub today: Option<DayTimes>,
    /// §8.7's quiet line, cleared once the next prayer arrives.
    pub missed: Option<(PrayerName, i64)>,
}

/// Everything the loop needs to remember between ticks. Deliberately small: all
/// timing is re-derived, so this only records what has already been acted on.
#[derive(Default)]
pub struct SchedulerState {
    /// Epoch of the last prayer whose adhan/notification was dispatched.
    last_fired: Option<i64>,
    /// Epoch of the last reminder dispatched.
    last_reminder: Option<i64>,
    /// Wall-clock reading at the previous tick, used to notice a jump.
    last_tick: Option<i64>,
    /// UTC offset in seconds at the previous tick, to notice a timezone change.
    last_offset: Option<i32>,
    /// Cached day window and the local date it was computed for.
    cached: Option<(String, Vec<DayTimes>)>,
    pub missed: Option<(PrayerName, i64)>,
}

pub type SharedState = Arc<Mutex<SchedulerState>>;

fn name_from_id(id: &str) -> Option<PrayerName> {
    PrayerName::ALL.into_iter().find(|p| p.id() == id)
}

impl SchedulerState {
    /// Window for the local day containing `now`, recomputed when the local date or
    /// the UTC offset changes. §8.7's "recompute at local midnight, on timezone
    /// change" falls out of this rather than needing a timer of its own.
    fn window(&mut self, settings: &AppSettings, now: DateTime<Utc>) -> Result<&Vec<DayTimes>, String> {
        // Derived from the instant this tick is reasoning about, never from
        // Utc::now(). Mixing the two would let the cached window be for a
        // different day than the events computed against it - which is precisely
        // the "timer slept through Maghrib" failure §8.7 is about.
        let today = prayer::local_date_at(&settings.location, now)?;
        let key = today.format("%Y-%m-%d").to_string();
        let offset = local_offset_seconds(&settings.location, now)?;

        let stale = match (&self.cached, self.last_offset) {
            (Some((cached_key, _)), Some(cached_offset)) => {
                *cached_key != key || cached_offset != offset
            }
            _ => true,
        };
        if stale {
            self.cached = Some((key, prayer::window(today, &settings.location, &settings.prayer)?));
            self.last_offset = Some(offset);
        }
        Ok(&self.cached.as_ref().expect("just populated").1)
    }

    /// Re-derives from the wall clock and returns whatever must happen now.
    ///
    /// Pure with respect to the clock: `now` is passed in rather than read, which is
    /// what makes suspend, midnight and a timezone change testable without waiting
    /// for any of them.
    pub fn tick(&mut self, settings: &AppSettings, now: DateTime<Utc>) -> Result<(Status, Vec<Event>), String> {
        let now_epoch = now.timestamp();
        let jumped = self
            .last_tick
            .is_some_and(|prev| now_epoch - prev > TICK.as_secs() as i64 * 4);
        self.last_tick = Some(now_epoch);

        let days = self.window(settings, now)?.clone();
        let mut all: Vec<PrayerTime> = days.iter().flat_map(|d| d.times.iter().cloned()).collect();
        all.sort_by_key(|t| t.epoch);

        let mut events = Vec::new();

        // Anything whose time has passed but which was never dispatched.
        for t in all.iter().filter(|t| t.is_prayer) {
            if t.epoch > now_epoch {
                break;
            }
            if self.last_fired.is_some_and(|f| f >= t.epoch) {
                continue;
            }
            let age = now_epoch - t.epoch;
            let name = match name_from_id(t.name) {
                Some(n) => n,
                None => continue,
            };
            if age <= FIRE_GRACE_SECONDS && !jumped {
                events.push(Event::Prayer { name, epoch: t.epoch });
                // Firing normally means the process is live and the user has just
                // been told, so any stale "you missed this" line is done.
                self.missed = None;
            } else {
                // §8.7: slept through it. Record it, never ring it.
                events.push(Event::MissedWhileAsleep { name, epoch: t.epoch });
                self.missed = Some((name, t.epoch));
            }
            self.last_fired = Some(t.epoch);
        }

        let next = all.iter().find(|t| t.epoch > now_epoch && t.is_prayer).cloned();
        let previous = all.iter().rev().find(|t| t.epoch <= now_epoch).cloned();

        // §8.5's pre-prayer reminder, on the same re-derived basis.
        if settings.notifications.enabled && settings.notifications.reminder_minutes > 0 {
            if let Some(n) = &next {
                let lead = settings.notifications.reminder_minutes as i64 * 60;
                let at = n.epoch - lead;
                let due = now_epoch >= at && now_epoch - at <= FIRE_GRACE_SECONDS;
                if due && !jumped && self.last_reminder != Some(at) {
                    if let Some(name) = name_from_id(n.name) {
                        events.push(Event::Reminder {
                            name,
                            epoch: n.epoch,
                            minutes_before: settings.notifications.reminder_minutes,
                        });
                    }
                    self.last_reminder = Some(at);
                }
            }
        }

        let seconds_remaining = next.as_ref().map(|n| n.epoch - now_epoch).unwrap_or(0);
        let status = Status {
            imminent: next.is_some() && (0..=600).contains(&seconds_remaining),
            next,
            previous,
            seconds_remaining,
            today: days.get(1).cloned(),
            missed: self.missed,
        };
        Ok((status, events))
    }
}

fn local_offset_seconds(loc: &prayer::Location, now: DateTime<Utc>) -> Result<i32, String> {
    use chrono::Offset;
    let tz: chrono_tz::Tz = loc
        .timezone
        .parse()
        .map_err(|_| format!("unknown timezone: {}", loc.timezone))?;
    Ok(now.with_timezone(&tz).offset().fix().local_minus_utc())
}

/// Whether the adhan should sound for this prayer, given mute and §8.6's options.
pub fn should_sound(settings: &AppSettings, name: PrayerName, now_epoch: i64) -> bool {
    if !settings.adhan.enabled || settings.mute.active_at(now_epoch) {
        return false;
    }
    if name == PrayerName::Fajr && settings.adhan.silent_for_fajr {
        return false;
    }
    name.is_prayer()
}

pub fn should_notify(settings: &AppSettings, name: PrayerName, now_epoch: i64) -> bool {
    settings.notifications.enabled
        && !settings.mute.active_at(now_epoch)
        && settings.notifications.per_prayer.get(name)
}

/// §8.6: "a separate short Fajr adhan".
pub fn sound_for(settings: &AppSettings, name: PrayerName) -> String {
    if name == PrayerName::Fajr {
        settings.adhan.fajr_sound.clone()
    } else {
        settings.adhan.sound.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn settings() -> AppSettings {
        AppSettings::default()
    }

    /// Epoch of a prayer on a given local date, straight from the engine.
    fn prayer_epoch(s: &AppSettings, date: &str, id: &str) -> i64 {
        let d = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap();
        let day = prayer::times_for(d, &s.location, &s.prayer).unwrap();
        day.times.iter().find(|t| t.name == id).unwrap().epoch
    }

    fn at(epoch: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(epoch, 0).unwrap()
    }

    #[test]
    fn fires_a_prayer_seen_within_the_grace_window() {
        let s = settings();
        let maghrib = prayer_epoch(&s, "2026-08-28", "maghrib");
        let mut state = SchedulerState::default();
        // A tick shortly before, then one just after.
        state.tick(&s, at(maghrib - 30)).unwrap();
        let (_, events) = state.tick(&s, at(maghrib + 5)).unwrap();
        assert!(
            events.contains(&Event::Prayer { name: PrayerName::Maghrib, epoch: maghrib }),
            "expected Maghrib to fire, got {events:?}"
        );
    }

    #[test]
    fn does_not_fire_twice_for_the_same_prayer() {
        let s = settings();
        let maghrib = prayer_epoch(&s, "2026-08-28", "maghrib");
        let mut state = SchedulerState::default();
        state.tick(&s, at(maghrib - 30)).unwrap();
        state.tick(&s, at(maghrib + 5)).unwrap();
        let (_, again) = state.tick(&s, at(maghrib + 20)).unwrap();
        assert!(
            !again.iter().any(|e| matches!(e, Event::Prayer { .. })),
            "a prayer must dispatch once, got {again:?}"
        );
    }

    #[test]
    fn a_prayer_slept_through_is_reported_not_rung() {
        // §8.7: "If the machine was asleep through a prayer, do not fire a late
        // adhan on wake - show a quiet 'Maghrib passed at 19:42' line instead."
        let s = settings();
        let maghrib = prayer_epoch(&s, "2026-08-28", "maghrib");
        let mut state = SchedulerState::default();
        state.tick(&s, at(maghrib - 3600)).unwrap();   // awake, an hour before
        let (status, events) = state.tick(&s, at(maghrib + 3600)).unwrap(); // woke an hour after

        assert!(
            !events.iter().any(|e| matches!(e, Event::Prayer { .. })),
            "no late adhan may fire, got {events:?}"
        );
        assert!(
            events.contains(&Event::MissedWhileAsleep { name: PrayerName::Maghrib, epoch: maghrib }),
            "the missed prayer must be reported, got {events:?}"
        );
        assert_eq!(status.missed, Some((PrayerName::Maghrib, maghrib)));
    }

    #[test]
    fn a_prayer_just_past_the_grace_window_does_not_ring() {
        let s = settings();
        let asr = prayer_epoch(&s, "2026-08-28", "asr");
        let mut state = SchedulerState::default();
        state.tick(&s, at(asr - 30)).unwrap();
        let (_, events) = state.tick(&s, at(asr + FIRE_GRACE_SECONDS + 1)).unwrap();
        assert!(
            events.iter().any(|e| matches!(e, Event::MissedWhileAsleep { .. })),
            "past the grace window it is missed, not fired: {events:?}"
        );
    }

    #[test]
    fn the_missed_line_clears_once_a_prayer_fires_normally() {
        let s = settings();
        let dhuhr = prayer_epoch(&s, "2026-08-28", "dhuhr");
        let asr = prayer_epoch(&s, "2026-08-28", "asr");
        let mut state = SchedulerState::default();

        state.tick(&s, at(dhuhr - 3600)).unwrap();
        let (slept, _) = state.tick(&s, at(dhuhr + 3600)).unwrap();
        assert_eq!(slept.missed, Some((PrayerName::Dhuhr, dhuhr)), "Dhuhr was slept through");

        // Awake again and ticking normally: Asr fires, so the stale line goes.
        state.tick(&s, at(asr - 30)).unwrap();
        let (live, events) = state.tick(&s, at(asr + 5)).unwrap();
        assert!(
            events.contains(&Event::Prayer { name: PrayerName::Asr, epoch: asr }),
            "Asr should fire normally, got {events:?}"
        );
        assert!(live.missed.is_none(), "a normal fire clears the missed line");
    }

    #[test]
    fn the_missed_line_reports_the_most_recent_one() {
        let s = settings();
        let dhuhr = prayer_epoch(&s, "2026-08-28", "dhuhr");
        let maghrib = prayer_epoch(&s, "2026-08-28", "maghrib");
        let mut state = SchedulerState::default();
        state.tick(&s, at(dhuhr - 3600)).unwrap();
        state.tick(&s, at(dhuhr + 3600)).unwrap();
        // A long sleep across several prayers reports the latest, not the first.
        let (status, _) = state.tick(&s, at(maghrib + 3600)).unwrap();
        assert_eq!(status.missed, Some((PrayerName::Maghrib, maghrib)));
    }

    #[test]
    fn status_counts_down_to_the_next_prayer_and_flags_the_last_ten_minutes() {
        let s = settings();
        let asr = prayer_epoch(&s, "2026-08-28", "asr");
        let mut state = SchedulerState::default();

        let (far, _) = state.tick(&s, at(asr - 3600)).unwrap();
        assert_eq!(far.seconds_remaining, 3600);
        assert!(!far.imminent, "an hour out is not imminent");

        let (near, _) = state.tick(&s, at(asr - 300)).unwrap();
        assert_eq!(near.next.as_ref().unwrap().name, "asr");
        assert!(near.imminent, "§8.2 wants a state change in the final 10 minutes");
    }

    #[test]
    fn the_window_recomputes_when_the_local_date_rolls_over() {
        // §8.7's "recompute at local midnight" without a midnight timer.
        let s = settings();
        let mut state = SchedulerState::default();
        let day1 = prayer_epoch(&s, "2026-08-28", "dhuhr");
        let day2 = prayer_epoch(&s, "2026-08-30", "dhuhr");
        state.tick(&s, at(day1)).unwrap();
        let first = state.cached.as_ref().unwrap().0.clone();
        state.tick(&s, at(day2)).unwrap();
        let second = state.cached.as_ref().unwrap().0.clone();
        assert_ne!(first, second, "the cached day must follow the local date");
    }

    #[test]
    fn silent_for_fajr_and_mute_suppress_the_adhan() {
        let mut s = settings();
        assert!(should_sound(&s, PrayerName::Fajr, 0));

        s.adhan.silent_for_fajr = true;
        assert!(!should_sound(&s, PrayerName::Fajr, 0), "§8.6 silent-for-Fajr");
        assert!(should_sound(&s, PrayerName::Maghrib, 0), "only Fajr is silenced");

        s.adhan.silent_for_fajr = false;
        s.mute.until_epoch = Some(500);
        assert!(!should_sound(&s, PrayerName::Maghrib, 100), "muted");
        assert!(should_sound(&s, PrayerName::Maghrib, 600), "mute expired");
    }

    #[test]
    fn fajr_uses_its_own_sound() {
        // §4.4 ships "a separate short Fajr adhan".
        let mut s = settings();
        s.adhan.sound = "makkah".into();
        s.adhan.fajr_sound = "fajr-short".into();
        assert_eq!(sound_for(&s, PrayerName::Fajr), "fajr-short");
        assert_eq!(sound_for(&s, PrayerName::Isha), "makkah");
    }

    #[test]
    fn sunrise_never_rings_or_notifies() {
        let s = settings();
        assert!(!should_sound(&s, PrayerName::Sunrise, 0));
        assert!(!should_notify(&s, PrayerName::Sunrise, 0));
    }
}
