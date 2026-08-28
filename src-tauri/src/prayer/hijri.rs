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

/* ------------------------------- calendar -------------------------------- */

/// §7.5's "key dates highlighted".
///
/// These are positions in the Hijri calendar, not judgements about when the month
/// actually begins — that depends on local sighting, which is what the ±1
/// adjustment exists for. Ramadan's start and the Eids move with it.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Occasion {
    IslamicNewYear,
    Ashura,
    RamadanBegins,
    LastTenNights,
    LaylatAlQadrLikely,
    EidAlFitr,
    DayOfArafah,
    EidAlAdha,
}

impl Occasion {
    pub fn label_en(self) -> &'static str {
        match self {
            Occasion::IslamicNewYear => "Islamic new year",
            Occasion::Ashura => "Ashura",
            Occasion::RamadanBegins => "Ramadan begins",
            Occasion::LastTenNights => "Last ten nights",
            Occasion::LaylatAlQadrLikely => "Laylat al-Qadr (most likely)",
            Occasion::EidAlFitr => "Eid al-Fitr",
            Occasion::DayOfArafah => "Day of Arafah",
            Occasion::EidAlAdha => "Eid al-Adha",
        }
    }

    pub fn label_ar(self) -> &'static str {
        match self {
            Occasion::IslamicNewYear => "رأس السنة الهجرية",
            Occasion::Ashura => "عاشوراء",
            Occasion::RamadanBegins => "بداية رمضان",
            Occasion::LastTenNights => "العشر الأواخر",
            Occasion::LaylatAlQadrLikely => "ليلة القدر",
            Occasion::EidAlFitr => "عيد الفطر",
            Occasion::DayOfArafah => "يوم عرفة",
            Occasion::EidAlAdha => "عيد الأضحى",
        }
    }
}

pub fn occasions_for(month: u32, day: u32) -> Vec<Occasion> {
    let mut out = Vec::new();
    match (month, day) {
        (1, 1) => out.push(Occasion::IslamicNewYear),
        (1, 10) => out.push(Occasion::Ashura),
        (9, 1) => out.push(Occasion::RamadanBegins),
        (10, 1) => out.push(Occasion::EidAlFitr),
        (12, 9) => out.push(Occasion::DayOfArafah),
        (12, 10) => out.push(Occasion::EidAlAdha),
        _ => {}
    }
    if month == 9 && day >= 21 {
        out.push(Occasion::LastTenNights);
        // The odd nights of the last ten; the 27th is the most commonly held.
        if day == 27 {
            out.push(Occasion::LaylatAlQadrLikely);
        }
    }
    out
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDay {
    pub hijri_day: u32,
    pub gregorian: String,
    /// 0 = Sunday, matching the grid's leading column.
    pub weekday: u32,
    pub is_today: bool,
    pub occasions: Vec<Occasion>,
    pub occasion_labels_en: Vec<&'static str>,
    pub occasion_labels_ar: Vec<&'static str>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CalendarMonth {
    pub year: i64,
    pub month: u32,
    pub name_ar: &'static str,
    pub name_en: &'static str,
    pub days: Vec<CalendarDay>,
    /// Weekday of the 1st, so the grid knows how far to indent.
    pub leading_blanks: u32,
}

/// A whole Hijri month, with each day's Gregorian date alongside (§7.5).
pub fn calendar_month(year: i64, month: u32, adjustment: i64, today_jdn: i64) -> CalendarMonth {
    use chrono::Datelike;
    let count = days_in_month(year, month);
    let mut days = Vec::with_capacity(count as usize);
    let mut leading = 0;

    for day in 1..=count {
        // The adjustment shifts which Gregorian date a Hijri day lands on, so it
        // is subtracted here rather than added to the Hijri side.
        let jdn = hijri_to_jdn(HijriDate { year, month, day }) - adjustment;
        let date = jdn_to_gregorian(jdn);
        // JDN 0 was a Monday; +1 makes Sunday the zero column.
        let weekday = ((jdn + 1).rem_euclid(7)) as u32;
        if day == 1 {
            leading = weekday;
        }
        let occasions = occasions_for(month, day);
        days.push(CalendarDay {
            hijri_day: day,
            gregorian: format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day()),
            weekday,
            is_today: jdn == today_jdn,
            occasion_labels_en: occasions.iter().map(|o| o.label_en()).collect(),
            occasion_labels_ar: occasions.iter().map(|o| o.label_ar()).collect(),
            occasions,
        });
    }

    CalendarMonth {
        year,
        month,
        name_ar: MONTH_NAMES_AR[(month - 1) as usize],
        name_en: MONTH_NAMES_EN[(month - 1) as usize],
        days,
        leading_blanks: leading,
    }
}

/// Inverse of `gregorian_to_jdn`.
pub fn jdn_to_gregorian(jdn: i64) -> chrono::NaiveDate {
    let a = jdn + 32044;
    let b = (4 * a + 3) / 146097;
    let c = a - 146097 * b / 4;
    let d = (4 * c + 3) / 1461;
    let e = c - 1461 * d / 4;
    let m = (5 * e + 2) / 153;
    let day = (e - (153 * m + 2) / 5 + 1) as u32;
    let month = (m + 3 - 12 * (m / 10)) as u32;
    let year = (100 * b + d - 4800 + m / 10) as i32;
    chrono::NaiveDate::from_ymd_opt(year, month, day).expect("valid gregorian date")
}

#[cfg(test)]
mod calendar_tests {
    use super::*;
    use chrono::Datelike;

    #[test]
    fn gregorian_round_trips_through_jdn() {
        for (y, m, d) in [(2026, 8, 28), (2000, 1, 1), (1970, 1, 1), (622, 7, 19), (2100, 2, 28)] {
            let jdn = gregorian_to_jdn(y, m, d);
            let back = jdn_to_gregorian(jdn);
            assert_eq!(
                (back.year(), back.month(), back.day()), (y, m, d),
                "round trip failed for {y}-{m}-{d}"
            );
        }
    }

    #[test]
    fn a_month_has_the_right_number_of_days_and_starts_where_it_says() {
        let m = calendar_month(1448, 9, 0, 0);
        assert_eq!(m.days.len() as u32, days_in_month(1448, 9));
        assert_eq!(m.days[0].hijri_day, 1);
        assert_eq!(m.leading_blanks, m.days[0].weekday);
        // Consecutive days advance the weekday by one, wrapping at seven.
        for pair in m.days.windows(2) {
            assert_eq!((pair[0].weekday + 1) % 7, pair[1].weekday);
        }
    }

    #[test]
    fn the_occasions_7_5_names_all_appear() {
        assert!(occasions_for(1, 1).contains(&Occasion::IslamicNewYear));
        assert!(occasions_for(1, 10).contains(&Occasion::Ashura));
        assert!(occasions_for(9, 1).contains(&Occasion::RamadanBegins));
        assert!(occasions_for(9, 21).contains(&Occasion::LastTenNights));
        assert!(occasions_for(9, 27).contains(&Occasion::LaylatAlQadrLikely));
        assert!(occasions_for(10, 1).contains(&Occasion::EidAlFitr));
        assert!(occasions_for(12, 9).contains(&Occasion::DayOfArafah));
        assert!(occasions_for(12, 10).contains(&Occasion::EidAlAdha));
        // An ordinary day is not decorated.
        assert!(occasions_for(3, 14).is_empty());
    }

    #[test]
    fn the_last_ten_nights_span_exactly_ten_days() {
        let marked: Vec<u32> = (1..=30)
            .filter(|d| occasions_for(9, *d).contains(&Occasion::LastTenNights))
            .collect();
        assert_eq!(marked.len(), 10, "got {marked:?}");
        assert_eq!(marked[0], 21);
    }

    #[test]
    fn the_adjustment_moves_the_gregorian_mapping_by_a_day() {
        let base = calendar_month(1448, 1, 0, 0);
        let plus = calendar_month(1448, 1, 1, 0);
        assert_ne!(base.days[0].gregorian, plus.days[0].gregorian);
        let a = chrono::NaiveDate::parse_from_str(&base.days[0].gregorian, "%Y-%m-%d").unwrap();
        let b = chrono::NaiveDate::parse_from_str(&plus.days[0].gregorian, "%Y-%m-%d").unwrap();
        assert_eq!((a - b).num_days(), 1);
    }
}
