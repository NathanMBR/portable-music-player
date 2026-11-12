use std::{
    ffi::OsStr,
    fs, io,
    path::{Path, PathBuf},
};

use lofty::{
    config::ParseOptions,
    error::FileParseError,
    file::TaggedFileExt,
    probe::Probe,
    tag::{ItemKey, Tag},
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
/// The tags a song's artist comes from, best first: its lead performer, then its album artist (ID3's
/// "band/orchestra").
const ARTIST_KEYS: [ItemKey; 2] = [ItemKey::TrackArtist, ItemKey::AlbumArtist];
/// Between the artists of a song whose tag names several, like ID3v2.4's multi-value frames.
const ARTIST_SEPARATOR: &str = ", ";

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
    /// The title tag, or the file name without its extension when the song has none.
    title: String,
    /// The artist tag, or the album artist when it's missing, with several artists joined by
    /// `ARTIST_SEPARATOR`.
    artist: Option<String>,
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
    // Bad tags never fail the scan: a song whose tags can't be read is listed under its file name.
    let tags = read_song_tags(file).unwrap_or_default();
    Track {
        path: format!("{SONGS_FOLDER_NAME}/{file_name}"),
        title: tags.title.unwrap_or_else(|| title_from_file_name(file)),
        artist: tags.artist,
    }
}

/// A song's title when its tags give none: its file name without the extension.
fn title_from_file_name(file: &Path) -> String {
    file.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

/// What a song's tags say about it, trimmed, with blank values counted as missing.
#[derive(Default)]
struct SongTags {
    title: Option<String>,
    artist: Option<String>,
}

/// The scan reads every song from a possibly slow flash drive, so it reads only their tags: not the
/// audio's properties, which lofty finds by decoding frames, nor the embedded pictures.
fn tags_only() -> ParseOptions {
    ParseOptions::new()
        .read_properties(false)
        .read_cover_art(false)
}

fn read_song_tags(song: &Path) -> Result<SongTags, FileParseError> {
    let tagged_file = Probe::open(song)?.options(tags_only()).read()?;
    let tags = tagged_file.tags();
    Ok(SongTags {
        title: tag_values(tags, ItemKey::TrackTitle)
            .first()
            .map(|title| (*title).to_owned()),
        artist: ARTIST_KEYS
            .into_iter()
            .map(|key| tag_values(tags, key))
            .find(|artists| !artists.is_empty())
            .map(|artists| artists.join(ARTIST_SEPARATOR)),
    })
}

/// The trimmed, non-blank values of `key` in the first of `tags` that has any. An MP3's tags come
/// ID3v2 first, so its ID3v1 or APE tag only fills in what the ID3v2 tag lacks.
fn tag_values(tags: &[Tag], key: ItemKey) -> Vec<&str> {
    tags.iter()
        .map(|tag| {
            tag.get_strings(key)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
        })
        .find(|values| !values.is_empty())
        .unwrap_or_default()
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
    use lofty::{
        config::WriteOptions,
        tag::{ItemValue, TagExt, TagItem, TagType},
    };

    use super::*;

    /// Two silent MPEG-1 Layer III frames (128 kbit/s, 44.1 kHz): the shortest audio lofty decodes
    /// as MP3, since it checks a frame against the next one.
    fn silent_audio() -> Vec<u8> {
        const FRAME_HEADER: [u8; 4] = [0xFF, 0xFB, 0x90, 0x64];
        const FRAME_LENGTH: usize = 417;
        const FRAME_COUNT: usize = 2;
        let mut frame = vec![0; FRAME_LENGTH];
        frame[..FRAME_HEADER.len()].copy_from_slice(&FRAME_HEADER);
        frame.repeat(FRAME_COUNT)
    }

    /// The bytes of a `tag_type` tag holding `items`, as lofty writes it into a file. A key given
    /// more than once holds several values.
    fn tag_bytes(tag_type: TagType, items: &[(ItemKey, &str)]) -> Vec<u8> {
        let mut tag = Tag::new(tag_type);
        for &(key, value) in items {
            tag.push(TagItem::new(key, ItemValue::Text(value.to_owned())));
        }
        let mut bytes = Vec::new();
        tag.dump_to(&mut bytes, WriteOptions::default()).unwrap();
        bytes
    }

    /// An MP3 whose ID3v2 tag, at its start, holds `items`.
    fn song_tagged(items: &[(ItemKey, &str)]) -> Vec<u8> {
        [tag_bytes(TagType::Id3v2, items), silent_audio()].concat()
    }

    /// The track the scan lists for a song file named `file_name` holding `bytes`.
    fn track_of_song(file_name: &str, bytes: &[u8]) -> Track {
        let songs_dir = tempfile::tempdir().unwrap();
        let song = songs_dir.path().join(file_name);
        fs::write(&song, bytes).unwrap();
        track_from(&song)
    }

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
    fn names_tracks_after_their_title_tag() {
        let track = track_of_song(
            "08 Nothing Else Matters.mp3",
            &song_tagged(&[(ItemKey::TrackTitle, "Nothing Else Matters")]),
        );

        assert_eq!(track.title, "Nothing Else Matters");
        assert_eq!(track.path, "Songs/08 Nothing Else Matters.mp3");
        assert_eq!(track.artist, None);
    }

    #[test]
    fn names_tracks_with_a_blank_title_tag_after_their_file() {
        let track = track_of_song(
            "Paradise.mp3",
            &song_tagged(&[(ItemKey::TrackTitle, "   ")]),
        );

        assert_eq!(track.title, "Paradise");
    }

    #[test]
    fn trims_the_title_and_the_artist() {
        let track = track_of_song(
            "05 Orion.mp3",
            &song_tagged(&[
                (ItemKey::TrackTitle, "  Orion  "),
                (ItemKey::TrackArtist, " Metallica "),
            ]),
        );

        assert_eq!(track.title, "Orion");
        assert_eq!(track.artist.as_deref(), Some("Metallica"));
    }

    #[test]
    fn credits_the_artist_tag_over_the_album_artist() {
        let track = track_of_song(
            "Wasting My Hate.mp3",
            &song_tagged(&[
                (ItemKey::TrackArtist, "Metallica"),
                (ItemKey::AlbumArtist, "Shaman"),
            ]),
        );

        assert_eq!(track.artist.as_deref(), Some("Metallica"));
    }

    #[test]
    fn credits_the_album_artist_when_the_artist_tag_is_missing_or_blank() {
        let without_artist = track_of_song(
            "Arising Thunder.mp3",
            &song_tagged(&[(ItemKey::AlbumArtist, "Angra")]),
        );
        let with_blank_artist = track_of_song(
            "Roulette.mp3",
            &song_tagged(&[
                (ItemKey::TrackArtist, " "),
                (ItemKey::AlbumArtist, "System of a Down"),
            ]),
        );

        assert_eq!(without_artist.artist.as_deref(), Some("Angra"));
        assert_eq!(
            with_blank_artist.artist.as_deref(),
            Some("System of a Down")
        );
    }

    #[test]
    fn joins_the_artists_of_a_song_that_names_several() {
        let track = track_of_song(
            "Faithless Sanctuary.mp3",
            &song_tagged(&[
                (ItemKey::TrackArtist, "Angra"),
                (ItemKey::TrackArtist, "Woodkid"),
            ]),
        );

        assert_eq!(track.artist.as_deref(), Some("Angra, Woodkid"));
    }

    #[test]
    fn names_tracks_without_tags_after_their_file() {
        let track = track_of_song("Devil's Dance.mp3", &silent_audio());

        assert_eq!(track.title, "Devil's Dance");
        assert_eq!(track.artist, None);
    }

    #[test]
    fn names_tracks_with_corrupt_tags_after_their_file() {
        // ID3v2 has no version 9, so lofty can't read the file at all.
        let unknown_version = [b"ID3\x09\x00\x00\x00\x00\x00\x20".as_slice(), &[0xAB; 32]].concat();
        // A valid ID3v2.4 header, then 64 bytes that aren't frames.
        let unreadable_frames =
            [b"ID3\x04\x00\x00\x00\x00\x00\x40".as_slice(), &[0xFF; 64]].concat();
        // Every byte of an ID3v2 size is below 0x80 (synchsafe), so this size can't be.
        let impossible_size = [b"ID3\x04\x00\x00\xFF\xFF\xFF\xFF".as_slice(), &[0x41; 64]].concat();

        for (title, corrupt_tag) in [
            ("In Excelsis", unknown_version),
            ("Innervision", unreadable_frames),
            ("Reactor", impossible_size),
        ] {
            let song = [corrupt_tag, silent_audio()].concat();

            let track = track_of_song(&format!("{title}.mp3"), &song);

            assert_eq!(track.title, title);
            assert_eq!(track.artist, None, "{title} should have no artist");
        }
    }

    #[test]
    fn reads_id3v1_tags() {
        let id3v1_tag = tag_bytes(
            TagType::Id3v1,
            &[
                (ItemKey::TrackTitle, "The Shortest Straw"),
                (ItemKey::TrackArtist, "Metallica"),
            ],
        );
        let song = [silent_audio(), id3v1_tag].concat();

        let track = track_of_song("04 The Shortest Straw.mp3", &song);

        assert_eq!(track.title, "The Shortest Straw");
        assert_eq!(track.artist.as_deref(), Some("Metallica"));
    }

    #[test]
    fn prefers_the_id3v2_tag_and_fills_in_from_id3v1() {
        let id3v2_tag = tag_bytes(
            TagType::Id3v2,
            &[(ItemKey::TrackTitle, "Angels and Demons")],
        );
        let id3v1_tag = tag_bytes(
            TagType::Id3v1,
            &[
                (ItemKey::TrackTitle, "angels and demons"),
                (ItemKey::TrackArtist, "Angra"),
            ],
        );
        let song = [id3v2_tag, silent_audio(), id3v1_tag].concat();

        let track = track_of_song("02 Angels and Demons.mp3", &song);

        assert_eq!(track.title, "Angels and Demons");
        assert_eq!(track.artist.as_deref(), Some("Angra"));
    }

    #[test]
    fn reads_the_tags_without_decoding_the_audio() {
        // A tag with no audio after it: only decoding the audio's properties would fail on it.
        let song = tag_bytes(
            TagType::Id3v2,
            &[
                (ItemKey::TrackTitle, "Make Believe"),
                (ItemKey::TrackArtist, "Angra"),
            ],
        );

        let track = track_of_song("11 Make Believe.mp3", &song);

        assert_eq!(track.title, "Make Believe");
        assert_eq!(track.artist.as_deref(), Some("Angra"));
    }

    #[test]
    fn serializes_tracks_like_the_frontend_track_type() {
        // Mirrors `Track` in src/features/library/types.ts.
        let track = Track {
            path: "Songs/Nothing To Say.mp3".into(),
            title: "Nothing To Say".into(),
            artist: Some("Angra".into()),
        };

        assert_eq!(
            serde_json::to_value(&track).unwrap(),
            serde_json::json!({
                "path": "Songs/Nothing To Say.mp3",
                "title": "Nothing To Say",
                "artist": "Angra"
            })
        );
    }

    #[test]
    fn serializes_a_track_without_an_artist_with_a_null_artist() {
        let track = Track {
            path: "Songs/Leper Messiah.mp3".into(),
            title: "Leper Messiah".into(),
            artist: None,
        };

        assert_eq!(
            serde_json::to_value(&track).unwrap(),
            serde_json::json!({
                "path": "Songs/Leper Messiah.mp3",
                "title": "Leper Messiah",
                "artist": null
            })
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
