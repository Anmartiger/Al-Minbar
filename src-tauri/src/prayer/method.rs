//! Calculation methods from Claude.md §4.1, mapped onto the `salah` crate.
//!
//! `salah` 0.7.6 covers twelve of the thirteen the spec lists. Two notes:
//!
//! * **Ja'fari (Shia Ithna-Ashari) has no variant in the crate.** It is built here
//!   from explicit angles instead - Fajr 16°, Maghrib 4°, Isha 14° - which is the
//!   Leva Institute (Qum) parameter set and the same one Aladhan publishes as its
//!   method 0. The crate exposes `maghrib_angle`, so the Shia Maghrib rule (sun 4°
//!   below the horizon rather than at sunset) is expressible without patching it.
//! * **The spec's "None" high-latitude rule is not reachable.** `salah` always
//!   applies one of its three rules and offers no bypass. See `HighLatitudeRule`.

use salah::{Configuration, Madhab as SalahMadhab, Method as SalahMethod, Parameters};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(tag = "kind")]
pub enum Method {
    MuslimWorldLeague,
    Egyptian,
    UmmAlQura,
    Karachi,
    /// Islamic Society of North America.
    Isna,
    /// Institute of Geophysics, University of Tehran.
    Tehran,
    /// Shia Ithna-Ashari (Ja'fari). Built from angles - see the module note.
    Jafari,
    Kuwait,
    Qatar,
    Singapore,
    /// Diyanet İşleri Başkanlığı.
    Turkey,
    MoonsightingCommittee,
    /// Not required by §4.1, but the crate provides it and the UAE uses it.
    Dubai,
    /// §4.1: "Custom (user enters Fajr and Isha angles directly)".
    Custom { fajr_angle: f64, isha_angle: f64 },
}

impl Method {
    /// Stable identifier used by the frontend and the settings file.
    pub fn id(&self) -> &'static str {
        match self {
            Method::MuslimWorldLeague => "muslim_world_league",
            Method::Egyptian => "egyptian",
            Method::UmmAlQura => "umm_al_qura",
            Method::Karachi => "karachi",
            Method::Isna => "isna",
            Method::Tehran => "tehran",
            Method::Jafari => "jafari",
            Method::Kuwait => "kuwait",
            Method::Qatar => "qatar",
            Method::Singapore => "singapore",
            Method::Turkey => "turkey",
            Method::MoonsightingCommittee => "moonsighting_committee",
            Method::Dubai => "dubai",
            Method::Custom { .. } => "custom",
        }
    }

    fn base(&self) -> Parameters {
        match self {
            Method::MuslimWorldLeague => SalahMethod::MuslimWorldLeague.parameters(),
            Method::Egyptian => SalahMethod::Egyptian.parameters(),
            Method::UmmAlQura => SalahMethod::UmmAlQura.parameters(),
            Method::Karachi => SalahMethod::Karachi.parameters(),
            Method::Isna => SalahMethod::NorthAmerica.parameters(),
            Method::Tehran => SalahMethod::Tehran.parameters(),
            Method::Kuwait => SalahMethod::Kuwait.parameters(),
            Method::Qatar => SalahMethod::Qatar.parameters(),
            Method::Singapore => SalahMethod::Singapore.parameters(),
            Method::Turkey => SalahMethod::Turkey.parameters(),
            Method::MoonsightingCommittee => SalahMethod::MoonsightingCommittee.parameters(),
            Method::Dubai => SalahMethod::Dubai.parameters(),

            // Fajr 16°, Isha 14°, and Maghrib when the sun is 4° below the horizon.
            Method::Jafari => Configuration::new(16.0, 14.0).maghrib_angle(4.0).done(),

            Method::Custom { fajr_angle, isha_angle } => {
                Configuration::new(*fajr_angle, *isha_angle).done()
            }
        }
    }

    pub fn parameters(&self, madhab: Madhab, rule: HighLatitudeRule) -> Parameters {
        let mut params = self.base();
        params.madhab = madhab.into();
        params.high_latitude_rule = rule.into();
        params
    }
}

/// §4.1: "Asr madhab toggle: Shafi'i/Maliki/Hanbali (shadow ×1) vs Hanafi (shadow ×2)".
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(rename_all = "snake_case")]
pub enum Madhab {
    /// Shafi'i, Maliki and Hanbali all use a shadow ratio of 1.
    #[default]
    Shafi,
    Hanafi,
}

impl From<Madhab> for SalahMadhab {
    fn from(m: Madhab) -> Self {
        match m {
            Madhab::Shafi => SalahMadhab::Shafi,
            Madhab::Hanafi => SalahMadhab::Hanafi,
        }
    }
}

/// §4.1 asks for four: Middle of the Night · One Seventh · Angle Based · **None**.
///
/// Only the first three exist here. `salah` applies a night-portion clamp
/// unconditionally and exposes no way to switch it off, so "None" cannot be
/// offered without vendoring or patching the crate. It is omitted rather than
/// silently aliased to one of the others, which would misreport what the app does.
///
/// The practical cost is small: the clamp only binds where the sun does not reach
/// the Fajr/Isha angle, which does not happen below roughly 48° latitude. At
/// Ajloun (32°N) all four settings would produce identical times.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(rename_all = "snake_case")]
pub enum HighLatitudeRule {
    #[default]
    MiddleOfTheNight,
    SeventhOfTheNight,
    /// "Angle Based" in §4.1's wording.
    TwilightAngle,
}

impl From<HighLatitudeRule> for salah::models::high_altitude_rule::HighLatitudeRule {
    fn from(r: HighLatitudeRule) -> Self {
        use salah::models::high_altitude_rule::HighLatitudeRule as S;
        match r {
            HighLatitudeRule::MiddleOfTheNight => S::MiddleOfTheNight,
            HighLatitudeRule::SeventhOfTheNight => S::SeventhOfTheNight,
            HighLatitudeRule::TwilightAngle => S::TwilightAngle,
        }
    }
}
