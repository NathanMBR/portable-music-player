//! The system's media controls: MPRIS on Linux, Windows' media transport controls. Their buttons
//! and the media keys reach the webview as actions, and the song in the player goes to them from
//! the engine, which knows it first.

use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
};
use tauri::{Runtime, WebviewWindow};
use tauri_plugin_log::log;

use super::engine::NowPlaying;

/// What the system's media controls show as the player's name.
const DISPLAY_NAME: &str = "Portable Music Player";
/// A field of the media controls with nothing in it.
const BLANK: &str = "";
/// The player's name on the session bus, after `org.mpris.MediaPlayer2.`.
#[cfg(target_os = "linux")]
const BUS_NAME: &str = "portable_music_player";

/// What a media key or a button of the system's media controls asks the player to do.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub(super) enum MediaControlAction {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    Stop,
    Seek { seconds: f64 },
}

/// The action of a media control event, for the events the player handles.
fn action_for(event: MediaControlEvent) -> Option<MediaControlAction> {
    match event {
        MediaControlEvent::Play => Some(MediaControlAction::Play),
        MediaControlEvent::Pause => Some(MediaControlAction::Pause),
        MediaControlEvent::Toggle => Some(MediaControlAction::Toggle),
        MediaControlEvent::Next => Some(MediaControlAction::Next),
        MediaControlEvent::Previous => Some(MediaControlAction::Previous),
        MediaControlEvent::Stop => Some(MediaControlAction::Stop),
        MediaControlEvent::SetPosition(MediaPosition(position)) => Some(MediaControlAction::Seek {
            seconds: position.as_secs_f64(),
        }),
        _ => None,
    }
}

/// What the media controls show of `now_playing`. A field left out stays as it was on Windows, so
/// a blank one is sent empty.
fn metadata_of(now_playing: &NowPlaying) -> MediaMetadata<'_> {
    match now_playing {
        NowPlaying::Nothing => MediaMetadata {
            title: Some(BLANK),
            artist: Some(BLANK),
            ..MediaMetadata::default()
        },
        NowPlaying::Song {
            title,
            artist,
            duration,
            ..
        } => MediaMetadata {
            title: Some(title),
            artist: Some(artist.as_deref().unwrap_or(BLANK)),
            duration: *duration,
            ..MediaMetadata::default()
        },
    }
}

fn playback_of(now_playing: &NowPlaying) -> MediaPlayback {
    match now_playing {
        NowPlaying::Nothing => MediaPlayback::Stopped,
        NowPlaying::Song {
            position,
            is_playing,
            ..
        } => {
            let progress = Some(MediaPosition(*position));
            if *is_playing {
                MediaPlayback::Playing { progress }
            } else {
                MediaPlayback::Paused { progress }
            }
        }
    }
}

/// Whether souvlaki's D-Bus service can start. It unwraps its errors on a thread of its own, and a
/// panic aborts the release build: it must never be started on a bus it can't reach, or under a
/// name another process holds.
#[cfg(target_os = "linux")]
mod session_bus {
    use std::{
        os::{
            linux::net::SocketAddrExt,
            unix::net::{SocketAddr, UnixStream},
        },
        path::{Path, PathBuf},
    };

    use super::BUS_NAME;

    /// The session bus's socket in the runtime folder, without an address saying otherwise.
    const SOCKET_NAME: &str = "bus";
    const UNIX_TRANSPORT: &str = "unix:";
    /// A bus's GUID: 128 bits in hex.
    const GUID_LENGTH: usize = 32;

    #[derive(Debug, PartialEq)]
    pub(super) enum BusSocket {
        Path(PathBuf),
        Abstract(String),
    }

    /// Where zbus connects to the session bus, from `DBUS_SESSION_BUS_ADDRESS`, else
    /// `XDG_RUNTIME_DIR`. `None` for any address zbus could fail to parse.
    pub(super) fn socket_of(address: Option<&str>, runtime_dir: Option<&str>) -> Option<BusSocket> {
        let Some(address) = address else {
            return runtime_dir.map(|dir| BusSocket::Path(Path::new(dir).join(SOCKET_NAME)));
        };
        // zbus reads one address, and decodes escapes on its own: neither is worth the risk.
        let options = address.strip_prefix(UNIX_TRANSPORT)?;
        if options.contains([';', '%']) {
            return None;
        }
        let mut socket = None;
        for option in options.split(',') {
            let (key, value) = option.split_once('=')?;
            match key {
                _ if value.is_empty() => return None,
                "path" if socket.is_none() => socket = Some(BusSocket::Path(value.into())),
                "abstract" if socket.is_none() => socket = Some(BusSocket::Abstract(value.into())),
                "guid" if is_guid(value) => {}
                _ => return None,
            }
        }
        socket
    }

    fn is_guid(value: &str) -> bool {
        value.len() == GUID_LENGTH && value.chars().all(|character| character.is_ascii_hexdigit())
    }

    pub(super) fn accepts_connections(socket: &BusSocket) -> bool {
        match socket {
            BusSocket::Path(path) => UnixStream::connect(path).is_ok(),
            BusSocket::Abstract(name) => SocketAddr::from_abstract_name(name.as_bytes())
                .and_then(|address| UnixStream::connect_addr(&address))
                .is_ok(),
        }
    }

    /// A name of the player on the bus no other process holds, as MPRIS allows: two copies of
    /// the app can run at once.
    pub(super) fn instance_name(process_id: u32) -> String {
        format!("{BUS_NAME}.instance{process_id}")
    }
}

/// The system's media controls, or none when they couldn't connect: the app goes on without
/// media keys then.
pub(super) struct SystemMediaControls(Mutex<Option<MediaControls>>);

impl SystemMediaControls {
    /// Connects to the system's media controls, which send their actions to `on_action`.
    pub(super) fn connect<R: Runtime>(
        window: &WebviewWindow<R>,
        on_action: impl Fn(MediaControlAction) + Send + 'static,
    ) -> Self {
        let controls = attach(window, on_action)
            .inspect_err(|reason| {
                log::warn!("Couldn't connect to the system's media controls: {reason}");
            })
            .ok();
        Self(Mutex::new(controls))
    }

    pub(super) fn show(&self, now_playing: &NowPlaying) {
        let mut controls = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(controls) = controls.as_mut() else {
            return;
        };
        let shown = controls
            .set_metadata(metadata_of(now_playing))
            .and_then(|()| controls.set_playback(playback_of(now_playing)));
        if let Err(error) = shown {
            log::warn!("Couldn't update the system's media controls: {error}");
        }
    }
}

fn attach<R: Runtime>(
    window: &WebviewWindow<R>,
    on_action: impl Fn(MediaControlAction) + Send + 'static,
) -> Result<MediaControls, String> {
    let mut controls = new_controls(window)?;
    controls
        .attach(move |event| {
            if let Some(action) = action_for(event) {
                on_action(action);
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(controls)
}

#[cfg(target_os = "linux")]
fn new_controls<R: Runtime>(_window: &WebviewWindow<R>) -> Result<MediaControls, String> {
    let address = std::env::var("DBUS_SESSION_BUS_ADDRESS").ok();
    let runtime_dir = std::env::var("XDG_RUNTIME_DIR").ok();
    let socket = session_bus::socket_of(address.as_deref(), runtime_dir.as_deref())
        .ok_or("no session bus it can check was found")?;
    if !session_bus::accepts_connections(&socket) {
        return Err("the session bus doesn't answer".to_owned());
    }
    let bus_name = session_bus::instance_name(std::process::id());
    MediaControls::new(PlatformConfig {
        display_name: DISPLAY_NAME,
        dbus_name: &bus_name,
        hwnd: None,
    })
    .map_err(|error| error.to_string())
}

/// Windows ties the controls to the app's window.
#[cfg(windows)]
fn new_controls<R: Runtime>(window: &WebviewWindow<R>) -> Result<MediaControls, String> {
    let window_handle = window.hwnd().map_err(|error| error.to_string())?;
    MediaControls::new(PlatformConfig {
        display_name: DISPLAY_NAME,
        dbus_name: BLANK,
        hwnd: Some(window_handle.0),
    })
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;
    use souvlaki::SeekDirection;

    use super::*;

    #[test]
    fn maps_media_keys_to_actions() {
        let actions = [
            (MediaControlEvent::Play, json!({ "action": "play" })),
            (MediaControlEvent::Pause, json!({ "action": "pause" })),
            (MediaControlEvent::Toggle, json!({ "action": "toggle" })),
            (MediaControlEvent::Next, json!({ "action": "next" })),
            (MediaControlEvent::Previous, json!({ "action": "previous" })),
            (MediaControlEvent::Stop, json!({ "action": "stop" })),
            (
                MediaControlEvent::SetPosition(MediaPosition(Duration::from_millis(83_500))),
                json!({ "action": "seek", "seconds": 83.5 }),
            ),
        ];

        for (event, action) in actions {
            let mapped = action_for(event).unwrap();
            assert_eq!(serde_json::to_value(mapped).unwrap(), action);
        }
    }

    #[test]
    fn ignores_the_controls_the_player_doesnt_have() {
        let unhandled = [
            MediaControlEvent::Seek(SeekDirection::Forward),
            MediaControlEvent::SeekBy(SeekDirection::Backward, Duration::from_secs(5)),
            MediaControlEvent::SetVolume(0.5),
            MediaControlEvent::SetShuffle(true),
            MediaControlEvent::OpenUri("file:///".to_owned()),
            MediaControlEvent::Raise,
            MediaControlEvent::Quit,
        ];

        for event in unhandled {
            assert_eq!(action_for(event), None);
        }
    }

    #[test]
    fn shows_the_song_in_the_player() {
        let playing = NowPlaying::Song {
            title: "Where the Wild Things Are".to_owned(),
            artist: Some("Metallica".to_owned()),
            duration: Some(Duration::from_secs(338)),
            position: Duration::from_secs(12),
            is_playing: true,
        };

        assert_eq!(
            metadata_of(&playing),
            MediaMetadata {
                title: Some("Where the Wild Things Are"),
                artist: Some("Metallica"),
                duration: Some(Duration::from_secs(338)),
                ..MediaMetadata::default()
            }
        );
        assert_eq!(
            playback_of(&playing),
            MediaPlayback::Playing {
                progress: Some(MediaPosition(Duration::from_secs(12)))
            }
        );
    }

    #[test]
    fn shows_a_paused_song_without_an_artist() {
        let paused = NowPlaying::Song {
            title: "The Frayed Ends of Sanity".to_owned(),
            artist: None,
            duration: None,
            position: Duration::ZERO,
            is_playing: false,
        };

        // Windows keeps the fields it isn't given: the last song's artist would stay on screen.
        assert_eq!(metadata_of(&paused).artist, Some(""));
        assert_eq!(
            playback_of(&paused),
            MediaPlayback::Paused {
                progress: Some(MediaPosition(Duration::ZERO))
            }
        );
    }

    #[test]
    fn shows_nothing_once_the_player_stops() {
        assert_eq!(
            metadata_of(&NowPlaying::Nothing),
            MediaMetadata {
                title: Some(""),
                artist: Some(""),
                ..MediaMetadata::default()
            }
        );
        assert_eq!(playback_of(&NowPlaying::Nothing), MediaPlayback::Stopped);
    }

    #[cfg(target_os = "linux")]
    mod session_bus {
        use std::os::{
            linux::net::SocketAddrExt,
            unix::net::{SocketAddr, UnixListener},
        };

        use super::super::session_bus::*;

        const GUID: &str = "0123456789abcdef0123456789abcdef";

        #[test]
        fn finds_the_session_bus_from_its_address() {
            assert_eq!(
                socket_of(Some("unix:path=/run/user/1000/bus"), None),
                Some(BusSocket::Path("/run/user/1000/bus".into()))
            );
            assert_eq!(
                socket_of(
                    Some(&format!("unix:abstract=/tmp/dbus-x,guid={GUID}")),
                    None
                ),
                Some(BusSocket::Abstract("/tmp/dbus-x".to_owned()))
            );
        }

        #[test]
        fn falls_back_to_the_runtime_folder() {
            assert_eq!(
                socket_of(None, Some("/run/user/1000/")),
                Some(BusSocket::Path("/run/user/1000/bus".into()))
            );
            assert_eq!(socket_of(None, None), None);
        }

        #[test]
        fn gives_up_on_addresses_zbus_could_fail_on() {
            let addresses = [
                String::new(),
                "tcp:host=localhost,port=4000".to_owned(),
                "unix:path=/a;unix:path=/b".to_owned(),
                "unix:path=/run/user/1000/my%20bus".to_owned(),
                "unix:path=".to_owned(),
                "unix:path=/a,abstract=/b".to_owned(),
                "unix:path=/a,guid=nothex".to_owned(),
                "unix:dir=/tmp".to_owned(),
            ];

            for address in addresses {
                assert_eq!(socket_of(Some(&address), None), None, "{address}");
            }
        }

        #[test]
        fn checks_that_the_bus_accepts_connections() {
            let folder = tempfile::tempdir().unwrap();
            let path = folder.path().join("bus");
            assert!(!accepts_connections(&BusSocket::Path(path.clone())));

            let _listener = UnixListener::bind(&path).unwrap();
            assert!(accepts_connections(&BusSocket::Path(path)));
        }

        #[test]
        fn checks_an_abstract_bus_too() {
            let name = format!("portable-music-player-test-{}", std::process::id());
            let socket = BusSocket::Abstract(name.clone());
            assert!(!accepts_connections(&socket));

            let address = SocketAddr::from_abstract_name(name.as_bytes()).unwrap();
            let _listener = UnixListener::bind_addr(&address).unwrap();
            assert!(accepts_connections(&socket));
        }

        #[test]
        fn names_each_instance_on_the_bus() {
            assert_eq!(instance_name(4242), "portable_music_player.instance4242");
        }
    }
}
