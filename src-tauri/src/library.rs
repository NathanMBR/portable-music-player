use std::{
    ffi::OsStr,
    fs, io,
    path::{Path, PathBuf},
};

use serde::{Serialize, Serializer};
use tauri::{State, ipc::Response};

use crate::{portable, song_server::LazySongServer};

const SONGS_FOLDER_NAME: &str = "Songs";
const MP3_EXTENSION: &str = "mp3";
/// Linux's webview (WebKitGTK 2.48+) skips ahead in songs over 2 MiB played from memory, through a
/// blob URL, so there songs stream from the song server. Windows' webview (WebView2) plays them from
/// memory fine, and its planned Local Network Access checks would ask before reaching a local server.
const STREAMS_SONGS: bool = cfg!(target_os = "linux");

/// Where the webview plays a song from. Mirrors `SongSource` in src/features/library/types.ts.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SongSource {
    /// The song's URL on the song server, which streams it from the drive.
    Stream { url: String },
    /// The whole file, which the webview fetches with `read_song` and plays from memory.
    Memory,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// Relative to the root folder with `/` separators, so it stays valid when the drive is
    /// mounted elsewhere or opened on the other OS.
    path: String,
    title: String,
}

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("Couldn't find the folder the player is running from: {0}")]
    RootDir(io::Error),
    #[error("Couldn't create the Songs folder at {}: {source}", .path.display())]
    CreateFolder { path: PathBuf, source: io::Error },
    #[error("Couldn't read the Songs folder at {}: {source}", .path.display())]
    ReadFolder { path: PathBuf, source: io::Error },
    #[error("Couldn't open the Songs folder: {0}")]
    OpenFolder(tauri_plugin_opener::Error),
    #[error("{path} isn't a song of the Songs folder")]
    NotASong { path: String },
    #[error("Couldn't find {path}: it may have been moved, renamed or deleted")]
    SongMissing { path: String },
    #[error("Couldn't read {path}: {source}")]
    ReadSong { path: String, source: io::Error },
    #[error("Couldn't start streaming songs to the player: {0}")]
    StartSongServer(io::Error),
}

impl Serialize for LibraryError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub async fn load_music_library() -> Result<Vec<Track>, LibraryError> {
    let songs_dir = ensure_songs_dir()?;
    find_tracks(&songs_dir)
}

#[tauri::command]
pub async fn open_songs_folder() -> Result<(), LibraryError> {
    let songs_dir = ensure_songs_dir()?;
    tauri_plugin_opener::open_path(&songs_dir, None::<&str>).map_err(LibraryError::OpenFolder)
}

/// Where the webview plays a song from on this OS, once its file is found.
#[tauri::command]
pub async fn song_source(
    song_server: State<'_, LazySongServer>,
    path: String,
) -> Result<SongSource, LibraryError> {
    let root = portable::root_dir().map_err(LibraryError::RootDir)?;
    song_source_in(&root, &song_server, &path, STREAMS_SONGS)
}

/// The whole file of a song, sent as raw bytes rather than JSON, for the webviews that play songs
/// from memory (`SongSource::Memory`). Neither webview can play media from a custom URI scheme
/// like Tauri's asset protocol: WebKitGTK refuses it.
#[tauri::command]
pub async fn read_song(path: String) -> Result<Response, LibraryError> {
    let root = portable::root_dir().map_err(LibraryError::RootDir)?;
    read_song_in(&root, &path).map(Response::new)
}

/// Checks that `track_path` is a song of `root`'s Songs folder, then says where it plays from:
/// its URL on the song server when songs `stream`, started with the first one, or memory.
fn song_source_in(
    root: &Path,
    song_server: &LazySongServer,
    track_path: &str,
    streams: bool,
) -> Result<SongSource, LibraryError> {
    find_song_in(root, track_path)?;
    if !streams {
        return Ok(SongSource::Memory);
    }
    let song_server = song_server
        .get_or_start(root)
        .map_err(LibraryError::StartSongServer)?;
    Ok(SongSource::Stream {
        url: song_server.url_of(track_path),
    })
}

fn ensure_songs_dir() -> Result<PathBuf, LibraryError> {
    ensure_songs_dir_in(&portable::root_dir().map_err(LibraryError::RootDir)?)
}

/// Returns the Songs folder inside `root`, creating it first if it's missing.
fn ensure_songs_dir_in(root: &Path) -> Result<PathBuf, LibraryError> {
    let songs_dir = root.join(SONGS_FOLDER_NAME);
    fs::create_dir_all(&songs_dir).map_err(|source| LibraryError::CreateFolder {
        path: songs_dir.clone(),
        source,
    })?;
    Ok(songs_dir)
}

/// The file of the song a `Track::path` points to, inside `root`'s Songs folder: the reverse of
/// `track_from`. Anything but a song's plain file name is refused, so the webview can't read other
/// files through it.
pub(crate) fn find_song_in(root: &Path, track_path: &str) -> Result<PathBuf, LibraryError> {
    let not_a_song = || LibraryError::NotASong {
        path: track_path.to_owned(),
    };
    let file_name = track_path
        .strip_prefix(SONGS_FOLDER_NAME)
        .and_then(|rest| rest.strip_prefix('/'))
        .filter(|name| is_plain_file_name(name))
        .ok_or_else(not_a_song)?;
    let song = root.join(SONGS_FOLDER_NAME).join(file_name);
    if !has_mp3_name(&song) {
        return Err(not_a_song());
    }
    if !song.is_file() {
        return Err(LibraryError::SongMissing {
            path: track_path.to_owned(),
        });
    }
    Ok(song)
}

fn read_song_in(root: &Path, track_path: &str) -> Result<Vec<u8>, LibraryError> {
    let song = find_song_in(root, track_path)?;
    fs::read(song).map_err(|source| LibraryError::ReadSong {
        path: track_path.to_owned(),
        source,
    })
}

/// `\` is checked on every OS: it's a separator on Windows, where it could climb out of the folder.
fn is_plain_file_name(name: &str) -> bool {
    !name.contains(['/', '\\']) && Path::new(name).file_name() == Some(OsStr::new(name))
}

fn find_tracks(songs_dir: &Path) -> Result<Vec<Track>, LibraryError> {
    let read_error = |source: io::Error| LibraryError::ReadFolder {
        path: songs_dir.to_path_buf(),
        source,
    };
    let mut tracks = Vec::new();
    for entry in fs::read_dir(songs_dir).map_err(read_error)? {
        let path = entry.map_err(read_error)?.path();
        if is_mp3(&path) {
            tracks.push(track_from(&path));
        }
    }
    Ok(tracks)
}

fn track_from(file: &Path) -> Track {
    let file_name = file.file_name().unwrap_or_default().to_string_lossy();
    let title = file.file_stem().unwrap_or_default().to_string_lossy();
    Track {
        path: format!("{SONGS_FOLDER_NAME}/{file_name}"),
        title: title.into_owned(),
    }
}

fn is_mp3(path: &Path) -> bool {
    path.is_file() && has_mp3_name(path)
}

/// Hidden names are skipped because macOS writes a `._song.mp3` metadata file next to every song
/// copied onto a FAT/exFAT flash drive.
fn has_mp3_name(path: &Path) -> bool {
    let is_hidden = path
        .file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with('.'));
    let has_mp3_extension = path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(MP3_EXTENSION));
    !is_hidden && has_mp3_extension
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_mp3_names_in_any_case() {
        for name in [
            "Lisbon.mp3",
            "LISBON.MP3",
            "Lisbon.Mp3",
            "Running Alone (Live).mp3",
        ] {
            assert!(has_mp3_name(Path::new(name)), "{name} should be an mp3");
        }
    }

    #[test]
    fn rejects_hidden_and_non_mp3_names() {
        for name in [
            "._Holy Land.mp3",
            ".Holy Land.mp3",
            "Holy Land.wav",
            "Holy Land.mp3.txt",
            "mp3",
        ] {
            assert!(
                !has_mp3_name(Path::new(name)),
                "{name} should not be an mp3"
            );
        }
    }

    #[test]
    fn rejects_folders_named_like_mp3_files() {
        let test_dir = tempfile::tempdir().unwrap();
        let folder = test_dir.path().join("Extreme Dream.mp3");
        let file = test_dir.path().join("Nova Era.mp3");
        fs::create_dir(&folder).unwrap();
        fs::write(&file, b"").unwrap();

        assert!(!is_mp3(&folder));
        assert!(is_mp3(&file));
    }

    #[test]
    fn creates_the_songs_folder_when_missing() {
        let root = tempfile::tempdir().unwrap();

        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();

        assert_eq!(songs_dir, root.path().join(SONGS_FOLDER_NAME));
        assert!(songs_dir.is_dir());
    }

    #[test]
    fn keeps_the_songs_of_an_existing_songs_folder() {
        let root = tempfile::tempdir().unwrap();
        let song = root.path().join(SONGS_FOLDER_NAME).join("Carolina IV.mp3");
        fs::create_dir(root.path().join(SONGS_FOLDER_NAME)).unwrap();
        fs::write(&song, b"").unwrap();

        ensure_songs_dir_in(root.path()).unwrap();

        assert!(song.is_file());
    }

    #[test]
    fn lists_only_the_mp3_files_of_the_songs_folder() {
        let songs_dir = tempfile::tempdir().unwrap();
        for file_name in [
            "Spread Your Fire.mp3",
            "LASTING CHILD.MP3",
            "notes.txt",
            "Unfinished Allegro.wav",
            "._Spread Your Fire.mp3",
        ] {
            fs::write(songs_dir.path().join(file_name), b"").unwrap();
        }
        fs::create_dir(songs_dir.path().join("The Shadow Hunter.mp3")).unwrap();

        let mut titles: Vec<String> = find_tracks(songs_dir.path())
            .unwrap()
            .into_iter()
            .map(|track| track.title)
            .collect();
        // The folder is read in no particular order; the frontend sorts the tracks.
        titles.sort();

        assert_eq!(titles, ["LASTING CHILD", "Spread Your Fire"]);
    }

    #[test]
    fn names_tracks_after_their_file_with_a_path_valid_on_any_os() {
        let track = track_from(&Path::new("/media/usb/Songs").join("The Temple of Hate.mp3"));

        assert_eq!(track.title, "The Temple of Hate");
        assert_eq!(track.path, "Songs/The Temple of Hate.mp3");
    }

    #[test]
    fn serializes_tracks_like_the_frontend_track_type() {
        // Mirrors `Track` in src/features/library/types.ts.
        let track = Track {
            path: "Songs/Nothing To Say.mp3".into(),
            title: "Nothing To Say".into(),
        };

        assert_eq!(
            serde_json::to_value(&track).unwrap(),
            serde_json::json!({ "path": "Songs/Nothing To Say.mp3", "title": "Nothing To Say" })
        );
    }

    #[test]
    fn serializes_errors_as_their_message() {
        let error = LibraryError::ReadFolder {
            path: PathBuf::from("Songs"),
            source: io::Error::new(io::ErrorKind::PermissionDenied, "permission denied"),
        };

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!("Couldn't read the Songs folder at Songs: permission denied")
        );
    }

    #[test]
    fn finds_the_file_of_a_song_in_the_songs_folder() {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();
        fs::write(songs_dir.join("Dead Man On Display.mp3"), b"").unwrap();

        let song = find_song_in(root.path(), "Songs/Dead Man On Display.mp3").unwrap();

        assert_eq!(song, songs_dir.join("Dead Man On Display.mp3"));
    }

    #[test]
    fn refuses_paths_outside_the_songs_folder() {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();
        fs::create_dir(songs_dir.join("Live")).unwrap();
        fs::write(root.path().join("Stand Away.mp3"), b"").unwrap();
        fs::write(songs_dir.join("Live").join("Stand Away.mp3"), b"").unwrap();
        let absolute_path = songs_dir.join("Live").join("Stand Away.mp3");

        for path in [
            "Stand Away.mp3",
            "../Stand Away.mp3",
            "Songs/../Stand Away.mp3",
            "Songs/Live/Stand Away.mp3",
            "Songs\\..\\Stand Away.mp3",
            "Songs/..",
            "Songs/",
            &absolute_path.to_string_lossy(),
        ] {
            assert!(
                matches!(
                    find_song_in(root.path(), path),
                    Err(LibraryError::NotASong { .. })
                ),
                "{path} should be refused"
            );
        }
    }

    #[test]
    fn refuses_files_that_are_not_songs() {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();
        for file_name in ["Here In The Now.txt", "._Here In The Now.mp3"] {
            fs::write(songs_dir.join(file_name), b"").unwrap();

            assert!(
                matches!(
                    find_song_in(root.path(), &format!("Songs/{file_name}")),
                    Err(LibraryError::NotASong { .. })
                ),
                "{file_name} should be refused"
            );
        }
    }

    #[test]
    fn reads_the_bytes_of_a_song() {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();
        fs::write(
            songs_dir.join("Evil Warning.mp3"),
            b"ID3 and the frames of a song",
        )
        .unwrap();

        let bytes = read_song_in(root.path(), "Songs/Evil Warning.mp3").unwrap();

        assert_eq!(bytes, b"ID3 and the frames of a song");
    }

    #[test]
    fn reports_a_song_that_is_gone() {
        let root = tempfile::tempdir().unwrap();
        ensure_songs_dir_in(root.path()).unwrap();

        assert!(matches!(
            find_song_in(root.path(), "Songs/Unholy Wars.mp3"),
            Err(LibraryError::SongMissing { .. })
        ));
    }

    #[test]
    fn serializes_a_missing_song_as_its_message() {
        let error = LibraryError::SongMissing {
            path: "Songs/The Shaman.mp3".into(),
        };

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!(
                "Couldn't find Songs/The Shaman.mp3: it may have been moved, renamed or deleted"
            )
        );
    }

    #[test]
    fn streams_songs_from_the_song_server_where_songs_stream() {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();
        fs::write(songs_dir.join("Holy Land.mp3"), b"").unwrap();
        let song_server = LazySongServer::default();

        let source =
            song_source_in(root.path(), &song_server, "Songs/Holy Land.mp3", true).unwrap();

        let expected_url = song_server
            .get_or_start(root.path())
            .unwrap()
            .url_of("Songs/Holy Land.mp3");
        assert!(matches!(source, SongSource::Stream { url } if url == expected_url));
    }

    #[test]
    fn plays_songs_from_memory_where_songs_dont_stream() {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();
        fs::write(songs_dir.join("Judgement Day.mp3"), b"").unwrap();

        let source = song_source_in(
            root.path(),
            &LazySongServer::default(),
            "Songs/Judgement Day.mp3",
            false,
        )
        .unwrap();

        assert!(matches!(source, SongSource::Memory));
    }

    #[test]
    fn gives_no_source_for_a_song_that_is_gone_or_isnt_a_song() {
        let root = tempfile::tempdir().unwrap();
        ensure_songs_dir_in(root.path()).unwrap();

        for streams in [true, false] {
            assert!(matches!(
                song_source_in(
                    root.path(),
                    &LazySongServer::default(),
                    "Songs/Streets of Tomorrow.mp3",
                    streams
                ),
                Err(LibraryError::SongMissing { .. })
            ));
            assert!(matches!(
                song_source_in(
                    root.path(),
                    &LazySongServer::default(),
                    "../Running Alone.mp3",
                    streams
                ),
                Err(LibraryError::NotASong { .. })
            ));
        }
    }

    #[test]
    fn serializes_song_sources_like_the_frontend_song_source_type() {
        // Mirrors `SongSource` in src/features/library/types.ts.
        let stream = SongSource::Stream {
            url: "http://127.0.0.1:41234/token/536f6e6773".into(),
        };

        assert_eq!(
            serde_json::to_value(&stream).unwrap(),
            serde_json::json!({ "kind": "stream", "url": "http://127.0.0.1:41234/token/536f6e6773" })
        );
        assert_eq!(
            serde_json::to_value(SongSource::Memory).unwrap(),
            serde_json::json!({ "kind": "memory" })
        );
    }

    #[test]
    fn serializes_a_failed_song_server_start_as_its_message() {
        let error = LibraryError::StartSongServer(io::Error::new(
            io::ErrorKind::AddrNotAvailable,
            "address not available",
        ));

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!(
                "Couldn't start streaming songs to the player: address not available"
            )
        );
    }
}
