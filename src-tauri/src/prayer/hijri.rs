//! Tabular (civil) Islamic calendar.
//!
//! §7.5 calls the app's calendar "the tabular calendar" and asks for a ±1 day
//! adjustment "because local moon-sighting differs from the tabular calendar",
//! so a tabular arithmetic calendar is what the spec expects - not a computed
//! lunar-visibility model. This is the standard 30-year cycle with 11 leap years,
//! which is what almost every civil Hijri date is derived from.
//!
//! A tabular date can differ from a locally sighted one by a day or two. That is
//! inherent, not a defect, and is exactly why the ±1 adjustment exists.

use serde::{Deserialize, Serialize};

/// Leap years within each 30-year cycle.
const LEAP_YEARS: [u32; 11] = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];

/// Julian day number of 1 Muharram 1 AH in the civil (Kuwaiti) reckoning.
const HIJRI_EPOCH_JDN: i64 = 1_948_440;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
pub struct HijriDate {
    pub year: i64,
    /// 1-12.
    pub month: u32,
    /// 1-30.
    pub day: u32,
}

/// Gregorian calendar date to Julian day number. Valid for the proleptic
/// Gregorian calendar, which is all this app ever needs.
pub fn gregorian_to_jdn(year: i32, month: u32, day: u32) -> i64 {
    let (y, m) = (year as i64, month as i64);
    let a = (14 - m) / 12;
    let y2 = y + 4800 - a;
    let m2 = m + 12 * a - 3;
    day as i64 + (153 * m2 + 2) / 5 + 365 * y2 + y2 / 4 - y2 / 100 + y2 / 400 - 32045
}

fn is_leap(hijri_year: i64) -> bool {
    let pos = hijri_year.rem_euclid(30) as u32;
    LEAP_YEARS.contains(&pos)
}

/// Days in a Hijri month: odd months 30, even months 29, with Dhu al-Hijjah
/// gaining a day in a leap year.
pub fn days_in_month(year: i64, month: u32) -> u32 {
    if month % 2 == 1 {
        30
    } else if month == 12 && is_leap(year) {
        30
    } else {
        29
    }
}

/// Days from the Hijri epoch to 1 Muharram of `year`.
fn days_before_year(year: i64) -> i64 {
    let y = year - 1;
    let cycles = y.div_euclid(30);
    let rem = y.rem_euclid(30);
    let leaps_in_rem = LEAP_YEARS.iter().filter(|&&l| (l as i64) <= rem).count() as i64;
    cycles * 10631 + rem * 354 + leaps_in_rem
}

pub fn hijri_to_jdn(date: HijriDate) -> i64 {
    let mut days = days_before_year(date.year);
    for m in 1..date.month {
        days += days_in_month(date.year, m) as i64;
    }
    HIJRI_EPOCH_JDN + days + date.day as i64 - 1
}

pub fn jdn_to_hijri(jdn: i64) -> HijriDate {
    let elapsed = jdn - HIJRI_EPOCH_JDN;
    // Start from an estimate, then walk - the cycle is short enough that this
    // settles in one or two steps and is far easier to read than a closed form.
    let mut year = elapsed.div_euclid(10631) * 30 + 1;
    while days_before_year(year + 1) <= elapsed {
        year += 1;
    }
    while days_before_year(year) > elapsed {
        year -= 1;
    }
    let mut remaining = elapsed - days_before_year(year);
    let mut month = 1u32;
    while month < 12 && remaining >= days_in_month(year, month) as i64 {
        remaining -= days_in_month(year, month) as i64;
        month += 1;
    }
    HijriDate { year, month, day: (remaining + 1) as u32 }
}

/// §7.5: "A ±1 day Hijri adjustment setting, because local moon-sighting differs
/// from the tabular calendar and every serious app has this."
pub fn from_gregorian(year: i32, month: u32, day: u32, adjustment: i64) -> HijriDate {
    jdn_to_hijri(gregorian_to_jdn(year, month, day) + adjustment)
}

pub const MONTH_NAMES_AR: [&str; 12] = [
    "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
    "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

pub const MONTH_NAMES_EN: [&str; 12] = [
    "Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani", "Jumada al-Ula",
    "Jumada al-Akhirah", "Rajab", "Sha'ban", "Ramadan", "Shawwal",
    "Dhu al-Qi'dah", "Dhu al-Hijjah",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jdn_matches_known_gregorian_dates() {
        // Reference values for the Julian day number of a Gregorian date.
        assert_eq!(gregorian_to_jdn(2000, 1, 1), 2_451_545);
        assert_eq!(gregorian_to_jdn(1970, 1, 1), 2_440_588);
        // 1 Muharram 1 AH is 16 July 622 in the *Julian* calendar, which is
        // 19 July 622 proleptic Gregorian - and this function is Gregorian.
        assert_eq!(gregorian_to_jdn(622, 7, 19), HIJRI_EPOCH_JDN);
    }

    #[test]
    fn hijri_epoch_round_trips() {
        let epoch = HijriDate { year: 1, month: 1, day: 1 };
        assert_eq!(hijri_to_jdn(epoch), HIJRI_EPOCH_JDN);
        assert_eq!(jdn_to_hijri(HIJRI_EPOCH_JDN), epoch);
    }

    #[test]
    fn round_trips_across_fourteen_centuries() {
        // Every day for a few whole years, including a leap year in the cycle.
        for year in [1, 1000, 1443, 1447, 1450] {
            for month in 1..=12u32 {
                for day in 1..=days_in_month(year, month) {
                    let d = HijriDate { year, month, day };
                    assert_eq!(jdn_to_hijri(hijri_to_jdn(d)), d, "round trip failed for {d:?}");
                }
            }
        }
    }

    #[test]
    fn leap_years_have_355_days() {
        assert!(is_leap(1442));
        assert_eq!(days_in_month(1442, 12), 30);
        let total: u32 = (1..=12).map(|m| days_in_month(1442, m)).sum();
        assert_eq!(total, 355);

        assert!(!is_leap(1443));
        assert_eq!(days_in_month(1443, 12), 29);
        let total: u32 = (1..=12).map(|m| days_in_month(1443, m)).sum();
        assert_eq!(total, 354);
    }

    #[test]
    fn adjustment_shifts_by_whole_days() {
        let base = from_gregorian(2026, 8, 28, 0);
        let plus = from_gregorian(2026, 8, 28, 1);
        assert_eq!(hijri_to_jdn(plus) - hijri_to_jdn(base), 1);
        let minus = from_gregorian(2026, 8, 28, -1);
        assert_eq!(hijri_to_jdn(base) - hijri_to_jdn(minus), 1);
    }
}
