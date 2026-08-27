//! Prints today's timetable for a location. Used to spot-check the engine against
//! a published source without launching the window; Phase 3's scheduler will want
//! the same view.
//!
//!   cargo run --example today -- [lat] [lon] [timezone]

use al_minabr_lib::prayer::{Location, Settings, times_for, today_in};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let loc = if args.len() >= 3 {
        Location {
            latitude: args[0].parse().expect("latitude"),
            longitude: args[1].parse().expect("longitude"),
            timezone: args[2].clone(),
            city: args.get(3).cloned().unwrap_or_default(),
            country: String::new(),
        }
    } else {
        Location::default()
    };
    let settings = Settings::default();
    let date = today_in(&loc).expect("timezone");
    let day = times_for(date, &loc, &settings).expect("calculation");

    println!("{} ({}, {})  {}", loc.city, loc.latitude, loc.longitude, loc.timezone);
    println!("{}  =  {} {} {}", day.date, day.hijri.day, day.hijri_month_en, day.hijri.year);
    for t in &day.times {
        println!("  {:8} {}", t.name, t.clock);
    }
}
