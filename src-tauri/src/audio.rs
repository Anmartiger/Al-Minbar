//! Adhan playback (Claude.md §8.6).
//!
//! > "Runs in the **Rust** process (rodio) so it plays with no window open. Volume
//! > setting, per-prayer sound choice, a 'silent for Fajr' option, a test-play
//! > button in Settings, and an immediate stop from the tray menu, the mini window,
//! > and the notification action. If another app holds the audio device, fail
//! > quietly to a notification rather than crashing the scheduler."
//!
//! The output stream is opened lazily and dropped when playback ends, so an idle
//! background process holds no audio device - §8.1 budgets it at under 60 MB and a
//! held ALSA/PipeWire handle is both memory and a needless claim on the device.

use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};

/// §4.4 bundles muezzin recordings; see `assets/audio/README.md` for what is and is
/// not present. The synthesised chime is the "short beep alternative" that section
/// also asks for, and is the only one that can be generated rather than recorded.
const CHIME_WAV: &[u8] = include_bytes!("../assets/audio/chime.wav");

#[derive(Debug)]
pub enum PlaybackError {
    /// §8.6: "If another app holds the audio device, fail quietly to a notification
    /// rather than crashing the scheduler."
    DeviceUnavailable(String),
    SoundMissing(String),
    Decode(String),
}

impl std::fmt::Display for PlaybackError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlaybackError::DeviceUnavailable(e) => write!(f, "audio device unavailable: {e}"),
            PlaybackError::SoundMissing(s) => write!(f, "sound not found: {s}"),
            PlaybackError::Decode(e) => write!(f, "could not decode audio: {e}"),
        }
    }
}

/// Holds the stream only while something is playing.
#[derive(Default)]
struct Playing {
    _stream: Option<OutputStream>,
    sink: Option<Sink>,
}

#[derive(Clone, Default)]
pub struct Player {
    inner: Arc<Mutex<Playing>>,
}

/// Bundled sound ids. Anything not in this list is treated as a filesystem path,
/// which is how §4.4's "let the user point at their own audio file" works.
pub fn bundled_ids() -> &'static [&'static str] {
    &["chime"]
}

fn bundled_bytes(id: &str) -> Option<&'static [u8]> {
    match id {
        "chime" => Some(CHIME_WAV),
        _ => None,
    }
}

impl Player {
    pub fn new() -> Self {
        Self::default()
    }

    /// `sound` is either a bundled id or an absolute path to the user's own file.
    pub fn play(&self, sound: &str, volume: f32) -> Result<(), PlaybackError> {
        let source = load(sound)?;
        let stream = OutputStreamBuilder::open_default_stream()
            .map_err(|e| PlaybackError::DeviceUnavailable(e.to_string()))?;
        let sink = Sink::connect_new(stream.mixer());
        sink.set_volume(volume.clamp(0.0, 1.0));
        sink.append(source);

        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        // Starting a new adhan replaces any previous one rather than layering.
        if let Some(old) = guard.sink.take() {
            old.stop();
        }
        guard.sink = Some(sink);
        guard._stream = Some(stream);
        Ok(())
    }

    /// §8.6: "an immediate stop from the tray menu, the mini window, and the
    /// notification action."
    pub fn stop(&self) {
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(sink) = guard.sink.take() {
            sink.stop();
        }
        guard._stream = None;
    }

    /// §8.2 shows "a distinct state while the adhan is playing".
    pub fn is_playing(&self) -> bool {
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        match guard.sink.as_ref() {
            Some(sink) if !sink.empty() => true,
            Some(_) => {
                // Finished on its own: release the device rather than holding it.
                guard.sink = None;
                guard._stream = None;
                false
            }
            None => false,
        }
    }
}

type BoxedSource = Box<dyn Source<Item = f32> + Send>;

fn load(sound: &str) -> Result<BoxedSource, PlaybackError> {
    if let Some(bytes) = bundled_bytes(sound) {
        let decoder = Decoder::new(Cursor::new(bytes))
            .map_err(|e| PlaybackError::Decode(e.to_string()))?;
        return Ok(Box::new(decoder));
    }
    let path = PathBuf::from(sound);
    if !path.is_file() {
        return Err(PlaybackError::SoundMissing(sound.to_string()));
    }
    let file = std::fs::File::open(&path).map_err(|e| PlaybackError::SoundMissing(e.to_string()))?;
    let decoder = Decoder::new(std::io::BufReader::new(file))
        .map_err(|e| PlaybackError::Decode(e.to_string()))?;
    Ok(Box::new(decoder))
}

/// Whether a sound id or path can actually be played, without playing it. Used by
/// Settings to grey out a missing file rather than failing at Maghrib.
pub fn is_available(sound: &str) -> bool {
    bundled_bytes(sound).is_some() || Path::new(sound).is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bundled_chime_decodes() {
        // A corrupt bundled asset would only surface at the next prayer otherwise.
        assert!(load("chime").is_ok(), "bundled chime failed to decode");
    }

    #[test]
    fn availability_covers_bundled_ids_and_real_files() {
        for id in bundled_ids() {
            assert!(is_available(id), "bundled id {id} reported unavailable");
        }
        assert!(!is_available("no-such-sound"));
        assert!(!is_available("/definitely/not/here.mp3"));
    }

    #[test]
    fn a_missing_user_file_is_an_error_not_a_panic() {
        // §8.6 requires failing quietly; a panic here would take the scheduler down.
        match load("/definitely/not/here.mp3") {
            Err(PlaybackError::SoundMissing(_)) => {}
            Err(other) => panic!("expected SoundMissing, got {other}"),
            Ok(_) => panic!("a missing file must not decode"),
        }
    }

    #[test]
    fn stop_is_safe_when_nothing_is_playing() {
        let p = Player::new();
        p.stop();
        p.stop();
        assert!(!p.is_playing());
    }
}
