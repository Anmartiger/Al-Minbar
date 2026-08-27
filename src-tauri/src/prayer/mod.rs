//! Prayer-time engine (Claude.md §4.1). Everything is computed locally; no API is
//! contacted for any of it.

pub mod hijri;
pub mod method;

use chrono::{Datelike, NaiveDate, TimeZone, Timelike};
use chrono_tz::Tz;
use salah::{Coordinates, Prayer as SalahPrayer, PrayerSchedule};
use serde::{Deserialize, Serialize};

pub use method::{HighLatitudeRule, Madhab, Method};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Location {
    pub latitude: f64,
    pub longitude: f64,
    /// IANA name, e.g. "Asia/Amman".
    pub timezone: String,
    pub city: String,
    pub country: String,
}

impl Default for Location {
    fn default() -> Self {
        Location {
            // §4.1: "Default location: Ajloun, Jordan (32.3326 N, 35.7517 E,
            // Asia/Amman). The user can change it; this is just what a fresh
            // install shows."
            latitude: 32.3326,
            longitude: 35.7517,
            timezone: "Asia/Amman".into(),
            city: "Ajloun".into(),
            country: "JO".into(),
        }
    }
}

/// §4.1: "Per-prayer manual offset in minutes, −59 to +59, for matching the local masjid."
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
pub struct Offsets {
    pub fajr: i16,
    pub sunrise: i16,
    pub dhuhr: i16,
    pub asr: i16,
    pub maghrib: i16,
    pub isha: i16,
}

impl Offsets {
    const LIMIT: i16 = 59;

    fn get(&self, p: PrayerName) -> i16 {
        let raw = match p {
            PrayerName::Fajr => self.fajr,
            PrayerName::Sunrise => self.sunrise,
            PrayerName::Dhuhr => self.dhuhr,
            PrayerName::Asr => self.asr,
            PrayerName::Maghrib => self.maghrib,
            PrayerName::Isha => self.isha,
        };
        raw.clamp(-Self::LIMIT, Self::LIMIT)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Settings {
    pub method: MethodSetting,
    pub madhab: Madhab,
    pub high_latitude_rule: HighLatitudeRule,
    pub offsets: Offsets,
    /// §7.5 ±1 day Hijri adjustment.
    pub hijri_adjustment: i64,
}

/// Wrapper so the default is expressible without `Method` needing one.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(transparent)]
pub struct MethodSetting(pub Method);

impl Default for MethodSetting {
    fn default() -> Self {
        MethodSetting(Method::MuslimWorldLeague)
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum PrayerName {
    Fajr,
    Sunrise,
    Dhuhr,
    Asr,
    Maghrib,
    Isha,
}

impl PrayerName {
    pub const ALL: [PrayerName; 6] = [
        PrayerName::Fajr,
        PrayerName::Sunrise,
        PrayerName::Dhuhr,
        PrayerName::Asr,
        PrayerName::Maghrib,
        PrayerName::Isha,
    ];

    pub fn id(self) -> &'static str {
        match self {
            PrayerName::Fajr => "fajr",
            PrayerName::Sunrise => "sunrise",
            PrayerName::Dhuhr => "dhuhr",
            PrayerName::Asr => "asr",
            PrayerName::Maghrib => "maghrib",
            PrayerName::Isha => "isha",
        }
    }

    fn to_salah(self) -> SalahPrayer {
        match self {
            PrayerName::Fajr => SalahPrayer::Fajr,
            PrayerName::Sunrise => SalahPrayer::Sunrise,
            PrayerName::Dhuhr => SalahPrayer::Dhuhr,
            PrayerName::Asr => SalahPrayer::Asr,
            PrayerName::Maghrib => SalahPrayer::Maghrib,
            PrayerName::Isha => SalahPrayer::Isha,
        }
    }

    /// Sunrise is not a prayer; §7.1 lists it alongside the five for reference.
    pub fn is_prayer(self) -> bool {
        self != PrayerName::Sunrise
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct PrayerTime {
    pub name: &'static str,
    /// Unix seconds. The frontend counts down against this and needs no date library.
    pub epoch: i64,
    /// Local wall clock, "HH:MM", already in the location's timezone.
    pub clock: String,
    /// Local calendar date this time belongs to, "YYYY-MM-DD".
    pub date: String,
    pub is_prayer: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct DayTimes {
    pub date: String,
    pub hijri: hijri::HijriDate,
    pub hijri_month_ar: &'static str,
    pub hijri_month_en: &'static str,
    pub times: Vec<PrayerTime>,
}

fn parse_tz(name: &str) -> Result<Tz, String> {
    name.parse::<Tz>().map_err(|_| format!("unknown timezone: {name}"))
}

/// Times for a single local calendar date.
pub fn times_for(date: NaiveDate, loc: &Location, settings: &Settings) -> Result<DayTimes, String> {
    let tz = parse_tz(&loc.timezone)?;
    let params = settings
        .method
        .0
        .parameters(settings.madhab, settings.high_latitude_rule);

    let schedule = PrayerSchedule::new()
        .on(date)
        .for_location(Coordinates::new(loc.latitude, loc.longitude))
        .with_configuration(params)
        .calculate()?;

    let times = PrayerName::ALL
        .iter()
        .map(|&name| {
            let utc = schedule.time(name.to_salah());
            let shifted = utc + chrono::Duration::minutes(settings.offsets.get(name) as i64);
            let local = shifted.with_timezone(&tz);
            PrayerTime {
                name: name.id(),
                epoch: local.timestamp(),
                clock: format!("{:02}:{:02}", local.hour(), local.minute()),
                date: local.format("%Y-%m-%d").to_string(),
                is_prayer: name.is_prayer(),
            }
        })
        .collect();

    let h = hijri::from_gregorian(
        date.year(),
        date.month(),
        date.day(),
        settings.hijri_adjustment,
    );
    Ok(DayTimes {
        date: date.format("%Y-%m-%d").to_string(),
        hijri: h,
        hijri_month_ar: hijri::MONTH_NAMES_AR[(h.month - 1) as usize],
        hijri_month_en: hijri::MONTH_NAMES_EN[(h.month - 1) as usize],
        times,
    })
}

/// Yesterday, today and tomorrow.
///
/// The home screen needs the *previous* prayer as well as the next one to size the
/// §7.1 progress ring, and just after midnight the previous one is yesterday's
/// Isha. Returning a three-day window means the frontend never has to ask again
/// mid-countdown or special-case the day boundary.
pub fn window(today: NaiveDate, loc: &Location, settings: &Settings) -> Result<Vec<DayTimes>, String> {
    let mut out = Vec::with_capacity(3);
    for offset in [-1i64, 0, 1] {
        let date = today + chrono::Duration::days(offset);
        out.push(times_for(date, loc, settings)?);
    }
    Ok(out)
}

/// Today's date in the location's timezone - not the machine's. A user whose
/// laptop clock is in another zone still gets their own local day.
pub fn today_in(loc: &Location) -> Result<NaiveDate, String> {
    let tz = parse_tz(&loc.timezone)?;
    Ok(chrono::Utc::now().with_timezone(&tz).date_naive())
}

/// §7.4: bearing to the Kaaba from true north, in degrees.
pub fn qibla_bearing(latitude: f64, longitude: f64) -> f64 {
    salah::prelude::Qiblah::new(Coordinates::new(latitude, longitude)).value()
}

/// Great-circle distance to the Kaaba in kilometres (§7.4).
pub fn distance_to_makkah_km(latitude: f64, longitude: f64) -> f64 {
    const MAKKAH_LAT: f64 = 21.4225;
    const MAKKAH_LON: f64 = 39.8262;
    const EARTH_RADIUS_KM: f64 = 6371.0088;

    let (p1, p2) = (latitude.to_radians(), MAKKAH_LAT.to_radians());
    let dp = p2 - p1;
    let dl = (MAKKAH_LON - longitude).to_radians();
    let a = (dp / 2.0).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.0).sin().powi(2);
    2.0 * EARTH_RADIUS_KM * a.sqrt().asin()
}

/// Local midnight following `from`, in the location's timezone. Used by the
/// scheduler in Phase 3 to re-arm across the day boundary (§8.7).
pub fn next_local_midnight(loc: &Location, from: chrono::DateTime<chrono::Utc>) -> Result<i64, String> {
    let tz = parse_tz(&loc.timezone)?;
    let local = from.with_timezone(&tz);
    let tomorrow = local.date_naive() + chrono::Duration::days(1);
    let midnight = tz
        .from_local_datetime(&tomorrow.and_hms_opt(0, 0, 0).expect("valid midnight"))
        .earliest()
        .ok_or_else(|| "midnight does not exist in this timezone".to_string())?;
    Ok(midnight.timestamp())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qibla_bearings_match_published_values() {
        // §10: "Qibla bearing for a few known cities matches published values
        // within 0.5°." Cross-checked against an independent great-circle initial
        // bearing computation, not taken from memory.
        let cases = [
            ("Ajloun", 32.3326, 35.7517, 160.62),
            ("London", 51.5074, -0.1278, 118.99),
            ("Jakarta", -6.2088, 106.8456, 295.15),
            ("Washington DC", 38.9072, -77.0369, 56.56),
        ];
        for (name, lat, lon, expected) in cases {
            let got = qibla_bearing(lat, lon);
            let diff = (got - expected).abs();
            assert!(diff < 0.5, "{name}: got {got:.2}°, expected {expected:.2}° (off by {diff:.2}°)");
        }
    }

    #[test]
    fn distance_to_makkah_is_zero_at_the_kaaba() {
        assert!(distance_to_makkah_km(21.4225, 39.8262) < 0.001);
    }

    #[test]
    fn offsets_are_clamped_to_the_documented_range() {
        let o = Offsets { fajr: 200, isha: -200, ..Default::default() };
        assert_eq!(o.get(PrayerName::Fajr), 59);
        assert_eq!(o.get(PrayerName::Isha), -59);
    }

    #[test]
    fn offsets_shift_the_computed_time() {
        let loc = Location::default();
        let date = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let base = times_for(date, &loc, &Settings::default()).unwrap();
        let shifted = times_for(
            date,
            &loc,
            &Settings { offsets: Offsets { fajr: 7, ..Default::default() }, ..Default::default() },
        )
        .unwrap();
        assert_eq!(shifted.times[0].epoch - base.times[0].epoch, 7 * 60);
    }

    #[test]
    fn window_covers_three_consecutive_days() {
        let loc = Location::default();
        let today = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let w = window(today, &loc, &Settings::default()).unwrap();
        assert_eq!(w.len(), 3);
        assert_eq!(w[0].date, "2026-01-14");
        assert_eq!(w[1].date, "2026-01-15");
        assert_eq!(w[2].date, "2026-01-16");
    }

    #[test]
    fn hanafi_asr_is_later_than_shafi() {
        let loc = Location::default();
        let date = NaiveDate::from_ymd_opt(2026, 4, 15).unwrap();
        let shafi = times_for(date, &loc, &Settings::default()).unwrap();
        let hanafi = times_for(
            date,
            &loc,
            &Settings { madhab: Madhab::Hanafi, ..Default::default() },
        )
        .unwrap();
        let asr = |d: &DayTimes| d.times.iter().find(|t| t.name == "asr").unwrap().epoch;
        assert!(asr(&hanafi) > asr(&shafi), "Hanafi Asr (shadow x2) must fall later");
    }

    #[test]
    fn jafari_maghrib_is_after_sunset_maghrib() {
        // Ja'fari places Maghrib when the sun is 4° below the horizon, so it must
        // land later than a method that uses sunset.
        let loc = Location::default();
        let date = NaiveDate::from_ymd_opt(2026, 4, 15).unwrap();
        let mwl = times_for(date, &loc, &Settings::default()).unwrap();
        let jafari = times_for(
            date,
            &loc,
            &Settings { method: MethodSetting(Method::Jafari), ..Default::default() },
        )
        .unwrap();
        let maghrib = |d: &DayTimes| d.times.iter().find(|t| t.name == "maghrib").unwrap().epoch;
        assert!(
            maghrib(&jafari) > maghrib(&mwl),
            "Ja'fari Maghrib should be later than a sunset-based Maghrib"
        );
    }

    #[test]
    fn times_are_reported_in_the_location_timezone() {
        let jakarta = Location {
            latitude: -6.2088,
            longitude: 106.8456,
            timezone: "Asia/Jakarta".into(),
            city: "Jakarta".into(),
            country: "ID".into(),
        };
        let date = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        let d = times_for(date, &jakarta, &Settings::default()).unwrap();
        // Dhuhr is near local noon wherever you are; a timezone slip shows up here.
        let dhuhr = d.times.iter().find(|t| t.name == "dhuhr").unwrap();
        let hour: u32 = dhuhr.clock[..2].parse().unwrap();
        assert!((11..=13).contains(&hour), "Dhuhr at {} is not near local noon", dhuhr.clock);
    }

    #[test]
    fn unknown_timezone_is_an_error_not_a_panic() {
        let loc = Location { timezone: "Mars/Olympus".into(), ..Default::default() };
        let date = NaiveDate::from_ymd_opt(2026, 1, 15).unwrap();
        assert!(times_for(date, &loc, &Settings::default()).is_err());
    }
}
