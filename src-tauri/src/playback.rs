//! Playback: songs play from Rust instead of the webview, so one song can follow another without a
//! gap. Each song in the player is read and decoded on a thread of its own (`song_feeder`), and the
//! audio thread only copies its samples to the output (`song_chain`). The webview says what should
//! play through the commands here, and hears what does through the events.

mod controller;
mod engine;
mod media_controls;
mod output;
mod song_bytes;
mod song_chain;
mod song_feeder;

use std::{
    io,
    sync::{Arc, mpsc},
    time::Duration,
};

use serde::{Serialize, Serializer};
use tauri::{App, AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_log::log;
use thiserror::Error;

use crate::{library::LibraryError, main_window, portable};
use controller::ControllerInputs;
use engine::{Engine, NowPlaying, PlaybackEvents, SongRequest};
use media_controls::{MediaControlAction, SystemMediaControls};
use output::CpalOpener;
use song_chain::{SongChain, SongId};

/// The queued song took over, without a gap.
const SONG_STARTED_EVENT: &str = "playback:song-started";
/// The song ended with nothing after it.
const SONG_ENDED_EVENT: &str = "playback:song-ended";
const PROGRESS_EVENT: &str = "playback:progress";
/// The sound output went away and no other could open: the player paused.
const OUTPUT_LOST_EVENT: &str = "playback:output-lost";
/// A media key or a button of the system's media controls.
const MEDIA_CONTROL_EVENT: &str = "playback:media-control";

/// The player's engine, as the app manages it.
pub struct Playback(Arc<Engine>);

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongDetails {
    /// `None` when the song doesn't say.
    duration_seconds: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SongStarted {
    id: SongId,
    duration_seconds: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct SongEnded {
    id: SongId,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct Progress {
    id: SongId,
    seconds: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
struct OutputLost {
    reason: String,
}

fn seconds_of(duration: Option<Duration>) -> Option<f64> {
    duration.map(|duration| duration.as_secs_f64())
}

/// A position from the webview, in seconds: never before the start.
fn duration_of(seconds: f64) -> Duration {
    Duration::try_from_secs_f64(seconds.max(0.0)).unwrap_or_default()
}

/// The engine's events, as Tauri events for the webview and as the system's media controls.
struct AppEvents<R: Runtime> {
    app: AppHandle<R>,
    media_controls: SystemMediaControls,
}

impl<R: Runtime> AppEvents<R> {
    fn emit(&self, event: &str, payload: impl Serialize + Clone) {
        if let Err(error) = self.app.emit(event, payload) {
            log::warn!("Couldn't tell the webview about {event}: {error}");
        }
    }
}

impl<R: Runtime> PlaybackEvents for AppEvents<R> {
    fn song_started(&self, id: SongId, duration: Option<Duration>) {
        let duration_seconds = seconds_of(duration);
        self.emit(
            SONG_STARTED_EVENT,
            SongStarted {
                id,
                duration_seconds,
            },
        );
    }

    fn song_ended(&self, id: SongId) {
        self.emit(SONG_ENDED_EVENT, SongEnded { id });
    }

    fn progress(&self, id: SongId, position: Duration) {
        let seconds = position.as_secs_f64();
        self.emit(PROGRESS_EVENT, Progress { id, seconds });
    }

    fn output_lost(&self, reason: &str) {
        let reason = reason.to_owned();
        self.emit(OUTPUT_LOST_EVENT, OutputLost { reason });
    }

    fn now_playing(&self, now_playing: &NowPlaying) {
        self.media_controls.show(now_playing);
    }
}

fn emit_media_control<R: Runtime>(app: &AppHandle<R>, action: MediaControlAction) {
    if let Err(error) = app.emit(MEDIA_CONTROL_EVENT, action) {
        log::warn!("Couldn't tell the webview about a media key: {error}");
    }
}

/// Starts the engine and the thread that drives it, and connects the system's media controls. The
/// sound output only opens once a song plays.
pub fn start(app: &App) -> tauri::Result<()> {
    let window = app
        .get_webview_window(main_window::LABEL)
        .ok_or(tauri::Error::WindowNotFound)?;
    let handle = app.handle().clone();
    let media_controls =
        SystemMediaControls::connect(&window, move |action| emit_media_control(&handle, action));
    let events = AppEvents {
        app: app.handle().clone(),
        media_controls,
    };
    let (chain_events, chain_event_receiver) = SongChain::event_channel();
    let (stream_failures, stream_failure_receiver) = mpsc::channel();
    let engine = Arc::new(Engine::new(
        Box::new(CpalOpener::default()),
        Arc::new(events),
        chain_events,
        stream_failures,
    ));
    let inputs = ControllerInputs {
        chain_events: chain_event_receiver,
        stream_failures: stream_failure_receiver,
    };
    controller::start(Arc::clone(&engine), inputs)?;
    app.manage(Playback(engine));
    Ok(())
}

#[derive(Debug, Error)]
pub enum PlaybackError {
    #[error(transparent)]
    Library(#[from] LibraryError),
    #[error("Couldn't decode {path}: the file may be damaged")]
    Decode { path: String },
    #[error("Couldn't start decoding {path}: {source}")]
    StartDecoding { path: String, source: io::Error },
    #[error("No sound output was found on this computer")]
    NoOutput,
    #[error("Couldn't open the sound output: {0}")]
    OpenOutput(String),
}

impl Serialize for PlaybackError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Plays `song` from `from_seconds`, or holds it there paused: the song in the player until
/// another plays, which forgets the song queued after it.
#[tauri::command]
pub async fn play_song(
    playback: State<'_, Playback>,
    song: SongRequest,
    from_seconds: f64,
    is_playing: bool,
) -> Result<SongDetails, PlaybackError> {
    let root = portable::root_dir().map_err(LibraryError::RootDir)?;
    let duration = playback
        .0
        .play(&root, song, duration_of(from_seconds), is_playing)?;
    Ok(SongDetails {
        duration_seconds: seconds_of(duration),
    })
}

/// The song to play right after song `after_id`, without a gap, or none. Ignored once another
/// song is in the player.
#[tauri::command]
pub async fn queue_next_song(
    playback: State<'_, Playback>,
    after_id: SongId,
    song: Option<SongRequest>,
) -> Result<(), PlaybackError> {
    let root = portable::root_dir().map_err(LibraryError::RootDir)?;
    playback.0.queue_next(&root, after_id, song)
}

#[tauri::command]
pub async fn set_playing(
    playback: State<'_, Playback>,
    is_playing: bool,
) -> Result<(), PlaybackError> {
    playback.0.set_playing(is_playing)
}

#[tauri::command]
pub async fn seek_song(playback: State<'_, Playback>, seconds: f64) -> Result<(), PlaybackError> {
    playback.0.seek(duration_of(seconds));
    Ok(())
}

/// Sets the volume, from 0 to 1.
#[tauri::command]
pub async fn set_volume(playback: State<'_, Playback>, volume: f32) -> Result<(), PlaybackError> {
    playback.0.set_volume(volume);
    Ok(())
}

/// Empties the player and closes the sound output.
#[tauri::command]
pub async fn stop_playback(playback: State<'_, Playback>) -> Result<(), PlaybackError> {
    playback.0.stop();
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn reads_a_song_request_from_the_webview() {
        let request: SongRequest = serde_json::from_value(json!({
            "id": 3,
            "path": "Songs/Soldier Side.mp3",
            "title": "Soldier Side",
            "artist": "System of a Down"
        }))
        .unwrap();

        assert_eq!(
            request,
            SongRequest {
                id: 3,
                path: "Songs/Soldier Side.mp3".to_owned(),
                title: "Soldier Side".to_owned(),
                artist: Some("System of a Down".to_owned()),
            }
        );
    }

    #[test]
    fn sends_the_song_details() {
        let details = SongDetails {
            duration_seconds: Some(47.5),
        };
        let unknown = SongDetails {
            duration_seconds: None,
        };

        assert_eq!(
            serde_json::to_value(details).unwrap(),
            json!({ "durationSeconds": 47.5 })
        );
        assert_eq!(
            serde_json::to_value(unknown).unwrap(),
            json!({ "durationSeconds": null })
        );
    }

    #[test]
    fn sends_its_events() {
        let started = SongStarted {
            id: 4,
            duration_seconds: Some(214.25),
        };
        let progress = Progress {
            id: 4,
            seconds: 1.5,
        };
        let lost = OutputLost {
            reason: PlaybackError::NoOutput.to_string(),
        };

        assert_eq!(
            serde_json::to_value(started).unwrap(),
            json!({ "id": 4, "durationSeconds": 214.25 })
        );
        assert_eq!(
            serde_json::to_value(SongEnded { id: 4 }).unwrap(),
            json!({ "id": 4 })
        );
        assert_eq!(
            serde_json::to_value(progress).unwrap(),
            json!({ "id": 4, "seconds": 1.5 })
        );
        assert_eq!(
            serde_json::to_value(lost).unwrap(),
            json!({ "reason": "No sound output was found on this computer" })
        );
    }

    #[test]
    fn sends_its_errors_as_their_message() {
        assert_eq!(
            serde_json::to_value(PlaybackError::Decode {
                path: "Songs/Soldier Side.mp3".to_owned()
            })
            .unwrap(),
            json!("Couldn't decode Songs/Soldier Side.mp3: the file may be damaged")
        );
        assert_eq!(
            serde_json::to_value(PlaybackError::OpenOutput(
                "The requested device is no longer available".to_owned()
            ))
            .unwrap(),
            json!("Couldn't open the sound output: The requested device is no longer available")
        );
    }

    #[test]
    fn reads_positions_from_the_webview() {
        assert_eq!(duration_of(83.5), Duration::from_millis(83_500));
        assert_eq!(duration_of(-2.0), Duration::ZERO);
        assert_eq!(duration_of(f64::NAN), Duration::ZERO);
    }
}
