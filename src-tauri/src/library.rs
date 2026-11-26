use std::{
    collections::HashSet,
    ffi::OsStr,
    fs::{self, File},
    io::{self, BufReader, Read, Seek},
    path::{Path, PathBuf},
};

use lofty::{
    config::ParseOptions,
    error::FileParseError,
    file::{FileType, TaggedFileExt},
    picture::{Picture, PictureType},
    probe::Probe,
    tag::{ItemKey, Tag},
};
use serde::{Serialize, Serializer};
use tauri::ipc::Response;

use crate::{crash_log, ogg_flac_tags, portable};

pub(crate) const SONGS_FOLDER_NAME: &str = "Songs";
/// The extensions of the files the scan lists as songs, compared without regard to case. They only
/// say a file is a song: its format comes from its content.
const SONG_EXTENSIONS: [&str; 9] = [
    "mp3", "m4a", "aac", "opus", "ogg", "oga", "flac", "wav", "wave",
];
/// The tags a song's artist comes from, best first: its lead performer, then its album artist (ID3's
/// "band/orchestra").
const ARTIST_KEYS: [ItemKey; 2] = [ItemKey::TrackArtist, ItemKey::AlbumArtist];
/// Between the artists of a song whose tag names several, like ID3v2.4's multi-value frames.
const ARTIST_SEPARATOR: &str = ", ";

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

/// A song's embedded cover, sent as raw bytes rather than JSON, or as no bytes at all when it has
/// none. The scan leaves pictures out (`tags_only`), so the webview asks for each cover on its own,
/// once the song's row is on screen.
#[tauri::command]
pub async fn read_cover(path: String) -> Result<Response, LibraryError> {
    let root = portable::root_dir().map_err(LibraryError::RootDir)?;
    let cover = read_cover_in(&root, &path)?;
    Ok(Response::new(cover.unwrap_or_default()))
}

fn ensure_songs_dir() -> Result<PathBuf, LibraryError> {
    ensure_songs_dir_in(&portable::root_dir().map_err(LibraryError::RootDir)?)
}

/// Returns the Songs folder inside `root`, creating it first if it's missing.
pub(crate) fn ensure_songs_dir_in(root: &Path) -> Result<PathBuf, LibraryError> {
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
        .filter(|name| is_song_file_name(name))
        .ok_or_else(not_a_song)?;
    let song = root.join(SONGS_FOLDER_NAME).join(file_name);
    if !song.is_file() {
        return Err(LibraryError::SongMissing {
            path: track_path.to_owned(),
        });
    }
    Ok(song)
}

/// The cover of the song a `Track::path` points to. Only a song that can't be found or opened is
/// an error: one without pictures, or whose tags can't be read, simply has no cover.
fn read_cover_in(root: &Path, track_path: &str) -> Result<Option<Vec<u8>>, LibraryError> {
    let song = find_song_in(root, track_path)?;
    let file = File::open(&song).map_err(|source| LibraryError::ReadSong {
        path: track_path.to_owned(),
        source,
    })?;
    let _reading = crash_log::reading_song(&song);
    Ok(read_song_cover(file, &song))
}

fn read_song_cover(file: File, song: &Path) -> Option<Vec<u8>> {
    // Bad tags never fail a cover, like they never fail the scan: the row shows the placeholder.
    with_tags_of(file, song, Pictures::Read, |tags| {
        cover_among(tags).map(|cover| cover.data().to_vec())
    })
    .ok()
    .flatten()
}

/// Whether a song's tags are read with their pictures.
#[derive(Clone, Copy, PartialEq)]
enum Pictures {
    Skipped,
    Read,
}

/// Reads the tags of `song` from `file` and hands them to `read`: through lofty, in the format the
/// song's content says, except an Ogg FLAC's, which lofty doesn't read (`ogg_flac_tags`).
fn with_tags_of<T>(
    mut file: File,
    song: &Path,
    pictures: Pictures,
    read: impl FnOnce(&[Tag]) -> T,
) -> Result<T, FileParseError> {
    if ogg_flac_tags::is_ogg_flac(&mut file)? {
        let tag = ogg_flac_tags::read_ogg_flac_tag(file, pictures == Pictures::Read);
        return Ok(read(tag.as_slice()));
    }
    let options = match pictures {
        Pictures::Skipped => tags_only(),
        Pictures::Read => tags_with_pictures(),
    };
    let tagged_file = probe_of(BufReader::new(file), song)?
        .options(options)
        .read()?;
    Ok(read(tagged_file.tags()))
}

/// Covers are read one song at a time, as their rows come on screen, so they're read with the
/// tags' pictures, but still without decoding the audio's properties.
fn tags_with_pictures() -> ParseOptions {
    ParseOptions::new()
        .read_properties(false)
        .read_cover_art(true)
}

/// A song's front cover, else its first picture. An MP3's tags come ID3v2 first.
fn cover_among(tags: &[Tag]) -> Option<&Picture> {
    let pictures = || tags.iter().flat_map(Tag::pictures);
    pictures()
        .find(|picture| picture.pic_type() == PictureType::CoverFront)
        .or_else(|| pictures().next())
}

/// Those of `file_names` that a scan of `root`'s Songs folder wouldn't list, in their order: all of
/// them when the folder can't be read, as when it's missing, since the player couldn't play them.
/// It looks at the same listing as the scan (`song_files_in`) and pairs names exactly, case
/// included, the way the webview pairs a playlist's songs with the scanned ones, so both always
/// agree on which songs are there, whatever the drive's file system.
pub(crate) fn missing_songs_in(root: &Path, file_names: &[String]) -> Vec<String> {
    let listed: HashSet<String> = song_files_in(&root.join(SONGS_FOLDER_NAME))
        .unwrap_or_default()
        .iter()
        .filter_map(|song| song.file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .collect();
    file_names
        .iter()
        .filter(|name| !listed.contains(*name))
        .cloned()
        .collect()
}

/// A name the scan would list as a song: a plain file name, not hidden, with a song's extension.
pub(crate) fn is_song_file_name(name: &str) -> bool {
    is_plain_file_name(name) && has_song_name(Path::new(name))
}

/// `\` is checked on every OS: it's a separator on Windows, where it could climb out of the folder.
fn is_plain_file_name(name: &str) -> bool {
    !name.contains(['/', '\\']) && Path::new(name).file_name() == Some(OsStr::new(name))
}

fn find_tracks(songs_dir: &Path) -> Result<Vec<Track>, LibraryError> {
    Ok(song_files_in(songs_dir)?
        .iter()
        .map(|song| track_from(song))
        .collect())
}

/// The songs of `songs_dir`: its files with a song's extension, hidden ones skipped. The scan and the search for a
/// playlist's songs both look at this listing, so they never disagree on which songs are there.
fn song_files_in(songs_dir: &Path) -> Result<Vec<PathBuf>, LibraryError> {
    let read_error = |source: io::Error| LibraryError::ReadFolder {
        path: songs_dir.to_path_buf(),
        source,
    };
    let mut songs = Vec::new();
    for entry in fs::read_dir(songs_dir).map_err(read_error)? {
        let path = entry.map_err(read_error)?.path();
        if is_song(&path) {
            songs.push(path);
        }
    }
    Ok(songs)
}

fn track_from(file: &Path) -> Track {
    let file_name = file.file_name().unwrap_or_default().to_string_lossy();
    // Bad tags never fail the scan: a song whose tags can't be read is listed under its file name.
    let tags = {
        let _reading = crash_log::reading_song(file);
        read_song_tags(file).unwrap_or_default()
    };
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

/// A reader of the tags of `song`, read from `file`, in the format its content says, so a song
/// named after another format still has its tags read: else in its extension's.
fn probe_of<R: Read + Seek>(file: R, song: &Path) -> io::Result<Probe<R>> {
    let probe = Probe::new(file);
    let probe = match FileType::from_path(song) {
        Some(file_type) => probe.set_file_type(file_type),
        None => probe,
    };
    probe.guess_file_type()
}

/// The scan reads every song from a possibly slow flash drive, so it reads only their tags: not the
/// audio's properties, which lofty finds by decoding frames, nor the embedded pictures.
fn tags_only() -> ParseOptions {
    ParseOptions::new()
        .read_properties(false)
        .read_cover_art(false)
}

fn read_song_tags(song: &Path) -> Result<SongTags, FileParseError> {
    with_tags_of(File::open(song)?, song, Pictures::Skipped, song_tags_among)
}

fn song_tags_among(tags: &[Tag]) -> SongTags {
    SongTags {
        title: tag_values(tags, ItemKey::TrackTitle)
            .first()
            .map(|title| (*title).to_owned()),
        artist: ARTIST_KEYS
            .into_iter()
            .map(|key| tag_values(tags, key))
            .find(|artists| !artists.is_empty())
            .map(|artists| artists.join(ARTIST_SEPARATOR)),
    }
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

fn is_song(path: &Path) -> bool {
    path.is_file() && has_song_name(path)
}

/// Hidden names are skipped because macOS writes a `._song.mp3` metadata file next to every song
/// copied onto a FAT/exFAT flash drive.
pub(crate) fn has_song_name(path: &Path) -> bool {
    let is_hidden = path
        .file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with('.'));
    let has_song_extension = path.extension().is_some_and(|extension| {
        SONG_EXTENSIONS
            .iter()
            .any(|song_extension| extension.eq_ignore_ascii_case(song_extension))
    });
    !is_hidden && has_song_extension
}

#[cfg(test)]
mod tests {
    use lofty::{
        config::WriteOptions,
        picture::MimeType,
        tag::{ItemValue, TagExt, TagItem, TagType},
    };

    use std::io::Cursor;

    use super::*;
    use crate::{
        test_media::{
            AAC_M4A_FIXTURE, ADTS_FIXTURE, OggFlacHeaders, OpusSong, Signal, VORBIS_FIXTURE,
            WavEncoding, flac_song, ogg_flac_song, ogg_opus_song, wav_song,
        },
        test_songs::silent_audio,
    };

    /// The bytes of `tag`, as lofty writes it into a file.
    fn bytes_of(tag: &Tag) -> Vec<u8> {
        let mut bytes = Vec::new();
        tag.dump_to(&mut bytes, WriteOptions::default()).unwrap();
        bytes
    }

    /// A `tag_type` tag holding `items`. A key given more than once holds several values.
    fn tag_holding(tag_type: TagType, items: &[(ItemKey, &str)]) -> Tag {
        let mut tag = Tag::new(tag_type);
        for &(key, value) in items {
            tag.push(TagItem::new(key, ItemValue::Text(value.to_owned())));
        }
        tag
    }

    /// The bytes of a `tag_type` tag holding `items`.
    fn tag_bytes(tag_type: TagType, items: &[(ItemKey, &str)]) -> Vec<u8> {
        bytes_of(&tag_holding(tag_type, items))
    }

    /// `song`, of a format lofty writes, with `tag` saved into it.
    fn with_tag(song: Vec<u8>, tag: &Tag) -> Vec<u8> {
        let mut file = Cursor::new(song);
        tag.save_to(&mut file, WriteOptions::default()).unwrap();
        file.into_inner()
    }

    /// A short stereo signal, for songs whose audio no test listens to.
    const SHORT_SIGNAL: Signal = Signal {
        sample_rate: 44_100,
        channels: 2,
        frames: 1000,
    };

    /// An MP3 whose ID3v2 tag, at its start, holds `items`.
    fn song_tagged(items: &[(ItemKey, &str)]) -> Vec<u8> {
        [tag_bytes(TagType::Id3v2, items), silent_audio()].concat()
    }

    /// The bytes of an ID3v2 tag holding `pictures`, in order, each of a type and with its data.
    /// Lofty keeps a picture's data as it is, so any bytes tell pictures apart. ID3v2 keeps one
    /// picture per description, so each one is described by its type.
    fn tag_with_pictures(pictures: &[(PictureType, &[u8])]) -> Vec<u8> {
        let mut tag = Tag::new(TagType::Id3v2);
        for &(picture_type, data) in pictures {
            let picture = Picture::unchecked(data.to_vec())
                .pic_type(picture_type)
                .mime_type(MimeType::Jpeg)
                .description(format!("{picture_type:?}"))
                .build();
            tag.push_picture(picture);
        }
        bytes_of(&tag)
    }

    /// An MP3 whose ID3v2 tag, at its start, holds `pictures`.
    fn song_with_pictures(pictures: &[(PictureType, &[u8])]) -> Vec<u8> {
        [tag_with_pictures(pictures), silent_audio()].concat()
    }

    /// ID3v2 tags that lofty can't read, each broken in its own way.
    fn corrupt_tags() -> [Vec<u8>; 3] {
        // ID3v2 has no version 9, so lofty can't read the file at all.
        let unknown_version = [b"ID3\x09\x00\x00\x00\x00\x00\x20".as_slice(), &[0xAB; 32]].concat();
        // A valid ID3v2.4 header, then 64 bytes that aren't frames.
        let unreadable_frames =
            [b"ID3\x04\x00\x00\x00\x00\x00\x40".as_slice(), &[0xFF; 64]].concat();
        // Every byte of an ID3v2 size is below 0x80 (synchsafe), so this size can't be.
        let impossible_size = [b"ID3\x04\x00\x00\xFF\xFF\xFF\xFF".as_slice(), &[0x41; 64]].concat();
        [unknown_version, unreadable_frames, impossible_size]
    }

    /// The cover `read_cover_in` finds in a song of the Songs folder named `file_name` holding
    /// `bytes`.
    fn cover_of_song(file_name: &str, bytes: &[u8]) -> Option<Vec<u8>> {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();
        fs::write(songs_dir.join(file_name), bytes).unwrap();
        read_cover_in(root.path(), &format!("{SONGS_FOLDER_NAME}/{file_name}")).unwrap()
    }

    /// The track the scan lists for a song file named `file_name` holding `bytes`.
    fn track_of_song(file_name: &str, bytes: &[u8]) -> Track {
        let songs_dir = tempfile::tempdir().unwrap();
        let song = songs_dir.path().join(file_name);
        fs::write(&song, bytes).unwrap();
        track_from(&song)
    }

    #[test]
    fn accepts_song_names_in_any_case() {
        for name in [
            "Lisbon.mp3",
            "LISBON.MP3",
            "Lisbon.Mp3",
            "Running Alone (Live).mp3",
            "Slither.flac",
            "THORN WITHIN.WAV",
            "Unholy Wars.Wave",
            "B.Y.O.B..OGG",
            "Awake from Darkness.oga",
            "LASTING CHILD.M4A",
            "2 X 4.aac",
            "The House Jack Built.OPUS",
        ] {
            assert!(has_song_name(Path::new(name)), "{name} should be a song");
        }
    }

    #[test]
    fn rejects_hidden_and_non_song_names() {
        for name in [
            "._Holy Land.mp3",
            ".Holy Land.mp3",
            "._B.Y.O.B..flac",
            "Holy Land.jpg",
            "Holy Land.mp3.txt",
            "The Four Horsemen.flac.txt",
            "mp3",
            "flac",
        ] {
            assert!(
                !has_song_name(Path::new(name)),
                "{name} should not be a song"
            );
        }
    }

    #[test]
    fn rejects_folders_named_like_song_files() {
        let test_dir = tempfile::tempdir().unwrap();
        let folder = test_dir.path().join("Extreme Dream.mp3");
        let file = test_dir.path().join("Nova Era.mp3");
        fs::create_dir(&folder).unwrap();
        fs::write(&file, b"").unwrap();

        assert!(!is_song(&folder));
        assert!(is_song(&file));
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
    fn lists_only_the_song_files_of_the_songs_folder() {
        let songs_dir = tempfile::tempdir().unwrap();
        for file_name in [
            "Spread Your Fire.mp3",
            "LASTING CHILD.MP3",
            "Through the Never.flac",
            "JET PILOT.WAVE",
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

        assert_eq!(
            titles,
            [
                "JET PILOT",
                "LASTING CHILD",
                "Spread Your Fire",
                "Through the Never",
                "Unfinished Allegro"
            ]
        );
    }

    #[test]
    fn finds_missing_the_songs_the_scan_wouldnt_list() {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = ensure_songs_dir_in(root.path()).unwrap();
        fs::write(songs_dir.join("Nothing Left to Say but Goodbye.mp3"), b"").unwrap();
        fs::write(songs_dir.join("._Unfinished Allegro.mp3"), b"").unwrap();
        fs::create_dir(songs_dir.join("I Love You.mp3")).unwrap();
        let file_names = [
            "Nothing Left to Say but Goodbye.mp3",
            "nothing left to say but goodbye.MP3",
            "Unfinished Allegro.mp3",
            "I Love You.mp3",
            "Z.I.T.O..mp3",
        ]
        .map(str::to_owned);

        assert_eq!(
            missing_songs_in(root.path(), &file_names),
            [
                "nothing left to say but goodbye.MP3",
                "Unfinished Allegro.mp3",
                "I Love You.mp3",
                "Z.I.T.O..mp3"
            ]
        );
    }

    #[test]
    fn finds_every_song_missing_without_a_songs_folder() {
        let root = tempfile::tempdir().unwrap();
        let file_names = ["Silence and Distance.mp3".to_owned()];

        assert_eq!(missing_songs_in(root.path(), &file_names), file_names);
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
        for (title, corrupt_tag) in ["In Excelsis", "Innervision", "Reactor"]
            .into_iter()
            .zip(corrupt_tags())
        {
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
    fn reads_the_tags_of_flac_and_wav_songs() {
        let flac = with_tag(
            flac_song(16, SHORT_SIGNAL),
            &tag_holding(
                TagType::VorbisComments,
                &[
                    (ItemKey::TrackTitle, "Extreme Dream"),
                    (ItemKey::TrackArtist, "Angra"),
                ],
            ),
        );
        let wav = with_tag(
            wav_song(WavEncoding::Pcm16, SHORT_SIGNAL),
            &tag_holding(
                TagType::RiffInfo,
                &[
                    (ItemKey::TrackTitle, "Sprouts of Time"),
                    (ItemKey::TrackArtist, "Angra"),
                ],
            ),
        );

        let flac_track = track_of_song("01 Extreme Dream.flac", &flac);
        let wav_track = track_of_song("02 Sprouts of Time.wav", &wav);

        assert_eq!(flac_track.title, "Extreme Dream");
        assert_eq!(flac_track.artist.as_deref(), Some("Angra"));
        assert_eq!(wav_track.title, "Sprouts of Time");
        assert_eq!(wav_track.artist.as_deref(), Some("Angra"));
    }

    #[test]
    fn reads_the_tags_and_cover_of_m4a_songs() {
        let mut tag = tag_holding(
            TagType::Mp4Ilst,
            &[
                (ItemKey::TrackTitle, "Suite-Pee"),
                (ItemKey::TrackArtist, "System of a Down"),
            ],
        );
        tag.push_picture(
            Picture::unchecked(b"the front cover".to_vec())
                .pic_type(PictureType::CoverFront)
                .mime_type(MimeType::Jpeg)
                .build(),
        );
        let song = with_tag(AAC_M4A_FIXTURE.to_vec(), &tag);

        let track = track_of_song("01 Suite-Pee.m4a", &song);
        let cover = cover_of_song("01 Suite-Pee.m4a", &song);

        assert_eq!(track.title, "Suite-Pee");
        assert_eq!(track.artist.as_deref(), Some("System of a Down"));
        assert_eq!(cover.as_deref(), Some(b"the front cover".as_slice()));
    }

    #[test]
    fn reads_the_tags_of_raw_aac_songs() {
        let song = with_tag(
            ADTS_FIXTURE.to_vec(),
            &tag_holding(
                TagType::Id3v2,
                &[
                    (ItemKey::TrackTitle, "Shadows"),
                    (ItemKey::TrackArtist, "Woodkid"),
                ],
            ),
        );

        let track = track_of_song("02 Shadows.aac", &song);

        assert_eq!(track.title, "Shadows");
        assert_eq!(track.artist.as_deref(), Some("Woodkid"));
    }

    #[test]
    fn reads_the_tags_of_ogg_vorbis_songs() {
        let song = with_tag(
            VORBIS_FIXTURE.to_vec(),
            &tag_holding(
                TagType::VorbisComments,
                &[
                    (ItemKey::TrackTitle, "Ghost Lights"),
                    (ItemKey::TrackArtist, "Woodkid"),
                ],
            ),
        );

        let track = track_of_song("01 Ghost Lights.ogg", &song);

        assert_eq!(track.title, "Ghost Lights");
        assert_eq!(track.artist.as_deref(), Some("Woodkid"));
    }

    #[test]
    fn reads_the_tags_of_opus_songs() {
        let song = ogg_opus_song(&OpusSong {
            amplitudes: &[0.3, 0.2],
            frames: 960,
            output_gain_q8: 0,
            comments: &[("TITLE", "Visions Prelude"), ("ARTIST", "Angra")],
        });

        let track = track_of_song("04 Visions Prelude.opus", &song);

        assert_eq!(track.title, "Visions Prelude");
        assert_eq!(track.artist.as_deref(), Some("Angra"));
    }

    #[test]
    fn reads_the_cover_of_an_opus_song() {
        let song = ogg_opus_song(&OpusSong {
            amplitudes: &[0.3, 0.2],
            frames: 960,
            output_gain_q8: 0,
            comments: &[],
        });
        let mut tag = Tag::new(TagType::VorbisComments);
        tag.push_picture(
            Picture::unchecked(b"the front cover".to_vec())
                .pic_type(PictureType::CoverFront)
                .mime_type(MimeType::Png)
                .build(),
        );
        let song = with_tag(song, &tag);

        let cover = cover_of_song("04 Visions Prelude.opus", &song);

        assert_eq!(cover.as_deref(), Some(b"the front cover".as_slice()));
    }

    #[test]
    fn reads_the_tags_of_ogg_flac_songs() {
        for (file_name, title, artist) in [
            ("02 Crossing.oga", "Crossing", "Angra"),
            ("03 Holier Than Thou.ogg", "Holier Than Thou", "Metallica"),
        ] {
            let headers = OggFlacHeaders {
                comments: &[("TITLE", title), ("ARTIST", artist)],
                ..OggFlacHeaders::default()
            };
            let song = ogg_flac_song(16, SHORT_SIGNAL, &headers);

            let track = track_of_song(file_name, &song);

            assert_eq!(track.title, title);
            assert_eq!(track.artist.as_deref(), Some(artist));
        }
    }

    #[test]
    fn reads_the_tags_of_the_format_a_song_holds_whatever_its_extension() {
        let flac = with_tag(
            flac_song(16, SHORT_SIGNAL),
            &tag_holding(
                TagType::VorbisComments,
                &[
                    (ItemKey::TrackTitle, "Sound of a Gun"),
                    (ItemKey::TrackArtist, "Audioslave"),
                ],
            ),
        );

        let track = track_of_song("03 Sound of a Gun.wav", &flac);

        assert_eq!(track.title, "Sound of a Gun");
        assert_eq!(track.artist.as_deref(), Some("Audioslave"));
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
    fn serializes_a_failed_song_read_as_its_message() {
        let error = LibraryError::ReadSong {
            path: "Songs/Attitude.mp3".into(),
            source: io::Error::new(io::ErrorKind::PermissionDenied, "permission denied"),
        };

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!("Couldn't read Songs/Attitude.mp3: permission denied")
        );
    }

    #[test]
    fn reads_the_front_cover_over_the_other_pictures() {
        let song = song_with_pictures(&[
            (PictureType::Artist, b"the band on stage"),
            (PictureType::CoverFront, b"the front cover"),
            (PictureType::CoverBack, b"the back cover"),
        ]);

        let cover = cover_of_song("Horizons into Battlegrounds.mp3", &song);

        assert_eq!(cover.as_deref(), Some(b"the front cover".as_slice()));
    }

    #[test]
    fn reads_the_first_picture_of_a_song_without_a_front_cover() {
        let song = song_with_pictures(&[
            (PictureType::CoverBack, b"the back cover"),
            (PictureType::Artist, b"the band on stage"),
        ]);

        let cover = cover_of_song("In Your Likeness.mp3", &song);

        assert_eq!(cover.as_deref(), Some(b"the back cover".as_slice()));
    }

    #[test]
    fn gives_no_cover_for_a_song_without_pictures() {
        let song = song_tagged(&[
            (ItemKey::TrackTitle, "Motorbreath"),
            (ItemKey::TrackArtist, "Metallica"),
        ]);

        assert_eq!(cover_of_song("Motorbreath.mp3", &song), None);
    }

    #[test]
    fn gives_no_cover_for_a_song_without_tags() {
        assert_eq!(
            cover_of_song("Violent Pornography.mp3", &silent_audio()),
            None
        );
    }

    #[test]
    fn gives_no_cover_for_a_song_with_corrupt_tags() {
        for corrupt_tag in corrupt_tags() {
            let song = [corrupt_tag, silent_audio()].concat();

            assert_eq!(cover_of_song("Fight Fire with Fire.mp3", &song), None);
        }
    }

    #[test]
    fn reads_the_cover_of_a_flac_song() {
        let mut tag = Tag::new(TagType::VorbisComments);
        tag.push_picture(
            Picture::unchecked(b"the front cover".to_vec())
                .pic_type(PictureType::CoverFront)
                .mime_type(MimeType::Jpeg)
                .build(),
        );
        let song = with_tag(flac_song(16, SHORT_SIGNAL), &tag);

        let cover = cover_of_song("Until We Fall.flac", &song);

        assert_eq!(cover.as_deref(), Some(b"the front cover".as_slice()));
    }

    #[test]
    fn reads_the_cover_of_an_ogg_flac_song() {
        let headers = OggFlacHeaders {
            front_cover: Some(b"the front cover"),
            ..OggFlacHeaders::default()
        };
        let song = ogg_flac_song(16, SHORT_SIGNAL, &headers);

        let cover = cover_of_song("Cyclus Doloris.oga", &song);

        assert_eq!(cover.as_deref(), Some(b"the front cover".as_slice()));
    }

    #[test]
    fn reads_the_cover_without_decoding_the_audio() {
        // A tag with no audio after it: only decoding the audio's properties would fail on it.
        let song = tag_with_pictures(&[(PictureType::CoverFront, b"the front cover")]);

        let cover = cover_of_song("Awake from Darkness.mp3", &song);

        assert_eq!(cover.as_deref(), Some(b"the front cover".as_slice()));
    }

    #[test]
    fn refuses_covers_of_files_outside_the_songs_folder() {
        let root = tempfile::tempdir().unwrap();
        ensure_songs_dir_in(root.path()).unwrap();
        let song = song_with_pictures(&[(PictureType::CoverFront, b"the front cover")]);
        fs::write(root.path().join("Don't Tread on Me.mp3"), song).unwrap();

        for path in ["Don't Tread on Me.mp3", "Songs/../Don't Tread on Me.mp3"] {
            assert!(
                matches!(
                    read_cover_in(root.path(), path),
                    Err(LibraryError::NotASong { .. })
                ),
                "{path} should be refused"
            );
        }
    }

    #[test]
    fn reports_the_cover_of_a_song_that_is_gone() {
        let root = tempfile::tempdir().unwrap();
        ensure_songs_dir_in(root.path()).unwrap();

        assert!(matches!(
            read_cover_in(root.path(), "Songs/Shift.mp3"),
            Err(LibraryError::SongMissing { .. })
        ));
    }
}
