use std::{
    collections::HashSet,
    ffi::OsStr,
    fs, io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize, Serializer};
use tauri_plugin_log::log;

use crate::{atomic_write::write_atomically, library, portable};

pub(crate) const PLAYLISTS_FOLDER_NAME: &str = "Playlists";
const PLAYLIST_EXTENSION: &str = ".json";
/// Between the time a playlist was created and its title, in its file name.
const TITLE_SEPARATOR: char = '-';
const HIDDEN_PREFIX: char = '.';

/// What a playlist file holds, exactly: a file with any other field is ignored.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PlaylistFile {
    title: String,
    description: String,
    /// Whether every song was in the Songs folder when it was last looked for: on creation, on each
    /// save, and when the playlist is checked before it plays.
    all_songs_found: bool,
    /// The songs' file names in the Songs folder, in the playlist's order.
    songs: Vec<String>,
}

/// What the webview gives to create or save a playlist: Rust works out `allSongsFound` itself.
/// Mirrors `PlaylistContents` in src/features/playlists/types.ts.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaylistContents {
    title: String,
    description: String,
    songs: Vec<String>,
}

/// A playlist and the name of its file. Mirrors `SavedPlaylist` in src/features/playlists/types.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPlaylist {
    file_name: String,
    title: String,
    description: String,
    all_songs_found: bool,
    songs: Vec<String>,
}

/// A playlist as `check_playlist` left it, and those of its songs that are missing, in its order.
/// Mirrors `PlaylistCheck` in src/features/playlists/types.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistCheck {
    playlist: SavedPlaylist,
    missing_songs: Vec<String>,
}

/// Why a playlist's contents can't be kept.
#[derive(Debug, PartialEq, thiserror::Error)]
pub enum ContentsProblem {
    #[error("its title is blank")]
    BlankTitle,
    #[error("\"{0}\" isn't the file name of a song")]
    NotASong(String),
    #[error("it lists \"{0}\" twice")]
    RepeatedSong(String),
}

#[derive(Debug, thiserror::Error)]
pub enum PlaylistError {
    #[error("Couldn't find the folder the player is running from: {0}")]
    RootDir(io::Error),
    #[error("Couldn't create the Playlists folder at {}: {source}", .path.display())]
    CreateFolder { path: PathBuf, source: io::Error },
    #[error("Couldn't read the Playlists folder at {}: {source}", .path.display())]
    ReadFolder { path: PathBuf, source: io::Error },
    #[error("{file_name} isn't the file name of a playlist")]
    NotAPlaylist { file_name: String },
    #[error("The playlist can't be saved: {0}")]
    InvalidContents(ContentsProblem),
    #[error("A playlist named {file_name} already exists")]
    Taken { file_name: String },
    #[error("Couldn't find the playlist {file_name}: it may have been moved, renamed or deleted")]
    Missing { file_name: String },
    #[error("Couldn't read the playlist {file_name}: {source}")]
    Read {
        file_name: String,
        source: io::Error,
    },
    #[error("The playlist {file_name} isn't valid: {reason}")]
    Invalid { file_name: String, reason: String },
    #[error("Couldn't save the playlist {file_name}: {source}")]
    Write {
        file_name: String,
        source: io::Error,
    },
    #[error("Couldn't delete the playlist {file_name}: {source}")]
    Delete {
        file_name: String,
        source: io::Error,
    },
}

impl Serialize for PlaylistError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub async fn list_playlists() -> Result<Vec<SavedPlaylist>, PlaylistError> {
    list_playlists_in(&root()?)
}

#[tauri::command]
pub async fn create_playlist(
    file_name: String,
    playlist: PlaylistContents,
) -> Result<SavedPlaylist, PlaylistError> {
    create_playlist_in(&root()?, &file_name, playlist)
}

#[tauri::command]
pub async fn save_playlist(
    file_name: String,
    playlist: PlaylistContents,
) -> Result<SavedPlaylist, PlaylistError> {
    save_playlist_in(&root()?, &file_name, playlist)
}

#[tauri::command]
pub async fn check_playlist(file_name: String) -> Result<PlaylistCheck, PlaylistError> {
    check_playlist_in(&root()?, &file_name)
}

#[tauri::command]
pub async fn delete_playlist(file_name: String) -> Result<(), PlaylistError> {
    delete_playlist_in(&root()?, &file_name)
}

fn root() -> Result<PathBuf, PlaylistError> {
    portable::root_dir().map_err(PlaylistError::RootDir)
}

/// Lists the playlists of `root`'s Playlists folder, by file name, which starts with the time each one
/// was created. Files that aren't playlists are skipped, and listing never rewrites a file: only
/// creating, saving and checking a playlist look for its songs.
fn list_playlists_in(root: &Path) -> Result<Vec<SavedPlaylist>, PlaylistError> {
    let playlists_dir = ensure_playlists_dir_in(root)?;
    let read_error = |source: io::Error| PlaylistError::ReadFolder {
        path: playlists_dir.clone(),
        source,
    };
    let mut names = Vec::new();
    for entry in fs::read_dir(&playlists_dir).map_err(read_error)? {
        names.push(entry.map_err(read_error)?.file_name());
    }
    names.sort();
    Ok(names
        .iter()
        .filter_map(|name| listed_playlist(&playlists_dir, name))
        .collect())
}

fn create_playlist_in(
    root: &Path,
    file_name: &str,
    contents: PlaylistContents,
) -> Result<SavedPlaylist, PlaylistError> {
    let path = playlist_path_in(root, file_name)?;
    let (file, missing_count) = playlist_file_from(root, contents)?;
    ensure_playlists_dir_in(root)?;
    if path.exists() {
        return Err(PlaylistError::Taken {
            file_name: file_name.to_owned(),
        });
    }
    write_playlist(&path, file_name, &file)?;
    log_song_search(&file.title, None, missing_count);
    Ok(saved_playlist(file_name, file))
}

/// Saves new contents over an existing playlist, like a new order of its songs, looking for its
/// songs again.
fn save_playlist_in(
    root: &Path,
    file_name: &str,
    contents: PlaylistContents,
) -> Result<SavedPlaylist, PlaylistError> {
    let path = playlist_path_in(root, file_name)?;
    let (file, missing_count) = playlist_file_from(root, contents)?;
    if !path.is_file() {
        return Err(PlaylistError::Missing {
            file_name: file_name.to_owned(),
        });
    }
    let was_found = read_playlist_file(&path, file_name)
        .ok()
        .map(|old_file| old_file.all_songs_found);
    write_playlist(&path, file_name, &file)?;
    log_song_search(&file.title, was_found, missing_count);
    Ok(saved_playlist(file_name, file))
}

/// Looks for a playlist's songs, before it plays or when asked to, and rewrites its file only when
/// `allSongsFound` changes.
fn check_playlist_in(root: &Path, file_name: &str) -> Result<PlaylistCheck, PlaylistError> {
    let path = playlist_path_in(root, file_name)?;
    let mut file = read_playlist_file(&path, file_name)?;
    let missing_songs = library::missing_songs_in(root, &file.songs);
    let was_found = file.all_songs_found;
    file.all_songs_found = missing_songs.is_empty();
    if file.all_songs_found != was_found {
        write_playlist(&path, file_name, &file)?;
    }
    log_song_search(&file.title, Some(was_found), missing_songs.len());
    Ok(PlaylistCheck {
        playlist: saved_playlist(file_name, file),
        missing_songs,
    })
}

fn delete_playlist_in(root: &Path, file_name: &str) -> Result<(), PlaylistError> {
    let path = playlist_path_in(root, file_name)?;
    fs::remove_file(path).map_err(|source| match source.kind() {
        io::ErrorKind::NotFound => PlaylistError::Missing {
            file_name: file_name.to_owned(),
        },
        _ => PlaylistError::Delete {
            file_name: file_name.to_owned(),
            source,
        },
    })
}

/// Returns the Playlists folder inside `root`, creating it first if it's missing, like the Songs
/// folder.
fn ensure_playlists_dir_in(root: &Path) -> Result<PathBuf, PlaylistError> {
    let playlists_dir = root.join(PLAYLISTS_FOLDER_NAME);
    fs::create_dir_all(&playlists_dir).map_err(|source| PlaylistError::CreateFolder {
        path: playlists_dir.clone(),
        source,
    })?;
    Ok(playlists_dir)
}

/// The file of a playlist in `root`'s Playlists folder. Anything but a playlist's file name is
/// refused, so the webview can't reach other files through it.
fn playlist_path_in(root: &Path, file_name: &str) -> Result<PathBuf, PlaylistError> {
    if !is_playlist_file_name(file_name) {
        return Err(PlaylistError::NotAPlaylist {
            file_name: file_name.to_owned(),
        });
    }
    Ok(root.join(PLAYLISTS_FOLDER_NAME).join(file_name))
}

/// `<milliseconds since 1970>-<title of A-Z, a-z, 0-9 and _>.json`, as the webview names a new
/// playlist from its title.
fn is_playlist_file_name(name: &str) -> bool {
    let Some((timestamp, title)) = name
        .strip_suffix(PLAYLIST_EXTENSION)
        .and_then(|stem| stem.split_once(TITLE_SEPARATOR))
    else {
        return false;
    };
    let is_timestamp = !timestamp.is_empty() && timestamp.bytes().all(|byte| byte.is_ascii_digit());
    let is_normalized_title = !title.is_empty()
        && title
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_');
    is_timestamp && is_normalized_title
}

/// A file of the Playlists folder as a playlist, or `None`, with a warning in the log, when it isn't
/// one. Hidden files, like a save's temporary file or macOS's `._` files, are skipped quietly.
fn listed_playlist(playlists_dir: &Path, name: &OsStr) -> Option<SavedPlaylist> {
    let shown_name = name.to_string_lossy();
    if shown_name.starts_with(HIDDEN_PREFIX) {
        return None;
    }
    let Some(file_name) = name.to_str().filter(|name| is_playlist_file_name(name)) else {
        log::warn!(
            "\"{shown_name}\" in the Playlists folder isn't named like a playlist \
             (<time>-<title>.json). The player skips it."
        );
        return None;
    };
    let path = playlists_dir.join(file_name);
    if !path.is_file() {
        log::warn!("\"{file_name}\" in the Playlists folder isn't a file. The player skips it.");
        return None;
    }
    match read_playlist_file(&path, file_name) {
        Ok(file) => Some(saved_playlist(file_name, file)),
        Err(error) => {
            log::warn!("{error}. The player skips it.");
            None
        }
    }
}

/// A playlist file as written, only when its contents follow the rules the player writes it by.
fn read_playlist_file(path: &Path, file_name: &str) -> Result<PlaylistFile, PlaylistError> {
    let json = fs::read_to_string(path).map_err(|source| match source.kind() {
        io::ErrorKind::NotFound => PlaylistError::Missing {
            file_name: file_name.to_owned(),
        },
        _ => PlaylistError::Read {
            file_name: file_name.to_owned(),
            source,
        },
    })?;
    let invalid = |reason: String| PlaylistError::Invalid {
        file_name: file_name.to_owned(),
        reason,
    };
    let file: PlaylistFile =
        serde_json::from_str(&json).map_err(|error| invalid(error.to_string()))?;
    match problem_with(&file.title, &file.songs) {
        Some(problem) => Err(invalid(problem.to_string())),
        None => Ok(file),
    }
}

/// The file to write for `contents`, with whether all its songs are in the Songs folder now, and
/// how many aren't.
fn playlist_file_from(
    root: &Path,
    contents: PlaylistContents,
) -> Result<(PlaylistFile, usize), PlaylistError> {
    if let Some(problem) = problem_with(&contents.title, &contents.songs) {
        return Err(PlaylistError::InvalidContents(problem));
    }
    let missing_count = library::missing_songs_in(root, &contents.songs).len();
    let file = PlaylistFile {
        title: contents.title,
        description: contents.description,
        all_songs_found: missing_count == 0,
        songs: contents.songs,
    };
    Ok((file, missing_count))
}

/// The same rules hold for the playlists the player lists and the ones it writes, so it never
/// writes a file it would then skip.
fn problem_with(title: &str, songs: &[String]) -> Option<ContentsProblem> {
    if title.trim().is_empty() {
        return Some(ContentsProblem::BlankTitle);
    }
    let mut listed = HashSet::new();
    for song in songs {
        if !library::is_song_file_name(song) {
            return Some(ContentsProblem::NotASong(song.clone()));
        }
        // Lowercase, since the drive's file system may not tell names apart by case, like FAT or
        // NTFS, and each song is a row the webview drags by its name.
        if !listed.insert(song.to_lowercase()) {
            return Some(ContentsProblem::RepeatedSong(song.clone()));
        }
    }
    None
}

/// Pulling the drive mid-save can't leave a half-written playlist (`write_atomically`).
fn write_playlist(path: &Path, file_name: &str, file: &PlaylistFile) -> Result<(), PlaylistError> {
    let write_error = |source: io::Error| PlaylistError::Write {
        file_name: file_name.to_owned(),
        source,
    };
    let contents = serde_json::to_string_pretty(file).map_err(|error| write_error(error.into()))?;
    write_atomically(path, contents).map_err(write_error)
}

fn saved_playlist(file_name: &str, file: PlaylistFile) -> SavedPlaylist {
    SavedPlaylist {
        file_name: file_name.to_owned(),
        title: file.title,
        description: file.description,
        all_songs_found: file.all_songs_found,
        songs: file.songs,
    }
}

fn log_song_search(title: &str, was_found: Option<bool>, missing_count: usize) {
    if let Some(message) = song_search_message(title, was_found, missing_count) {
        log::info!("{message}");
    }
}

/// What the log says when a search for a playlist's songs changes `allSongsFound` in its file, as
/// when the file is new: `was_found` is `None` then.
fn song_search_message(
    title: &str,
    was_found: Option<bool>,
    missing_count: usize,
) -> Option<String> {
    match (was_found, missing_count) {
        (Some(false), 0) => Some(format!("Found every song of playlist \"{title}\"")),
        (Some(false), _) | (_, 0) => None,
        (_, count) => Some(format!(
            "Found {} missing from playlist \"{title}\"",
            song_count(count)
        )),
    }
}

fn song_count(count: usize) -> String {
    match count {
        1 => "1 song".to_owned(),
        _ => format!("{count} songs"),
    }
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use super::*;
    use crate::library::SONGS_FOLDER_NAME;

    /// A player's folder with its Songs folder holding `songs`, and its Playlists folder. The folder
    /// is deleted when the returned `TempDir` drops, so tests keep it alive.
    fn player_with_songs(songs: &[&str]) -> TempDir {
        let root = tempfile::tempdir().unwrap();
        let songs_dir = root.path().join(SONGS_FOLDER_NAME);
        fs::create_dir(&songs_dir).unwrap();
        for song in songs {
            fs::write(songs_dir.join(song), b"").unwrap();
        }
        fs::create_dir(root.path().join(PLAYLISTS_FOLDER_NAME)).unwrap();
        root
    }

    fn playlist_path(root: &TempDir, file_name: &str) -> PathBuf {
        root.path().join(PLAYLISTS_FOLDER_NAME).join(file_name)
    }

    /// Writes a playlist file as the app would, or as a hand edit would with any `json`.
    fn write_playlist_file(root: &TempDir, file_name: &str, json: serde_json::Value) {
        fs::write(playlist_path(root, file_name), json.to_string()).unwrap();
    }

    fn read_playlist_json(root: &TempDir, file_name: &str) -> serde_json::Value {
        serde_json::from_str(&fs::read_to_string(playlist_path(root, file_name)).unwrap()).unwrap()
    }

    fn contents(title: &str, description: &str, songs: &[&str]) -> PlaylistContents {
        PlaylistContents {
            title: title.to_owned(),
            description: description.to_owned(),
            songs: songs.iter().map(|&song| song.to_owned()).collect(),
        }
    }

    fn file_names_of(playlists: &[SavedPlaylist]) -> Vec<&str> {
        playlists
            .iter()
            .map(|playlist| playlist.file_name.as_str())
            .collect()
    }

    #[test]
    fn accepts_a_timestamp_a_dash_and_a_normalized_title() {
        for name in [
            "1763581234567-Road_trip.json",
            "1-playlist.json",
            "42-A1_b2.json",
        ] {
            assert!(is_playlist_file_name(name), "{name} should be accepted");
        }
    }

    #[test]
    fn rejects_any_other_file_name() {
        for name in [
            "Road_trip.json",
            "-Road_trip.json",
            "1763581234567-.json",
            "1763581234567-Road trip.json",
            "1763581234567-Road-trip.json",
            "1763581234567-Viagem_à_noite.json",
            "1763581234567-Road_trip.JSON",
            "1763581234567-Road_trip.json.tmp",
            ".1763581234567-Road_trip.json.tmp",
            "17635x1234567-Road_trip.json",
            "../1763581234567-Road_trip.json",
            "1763581234567-Road_trip",
        ] {
            assert!(!is_playlist_file_name(name), "{name} should be rejected");
        }
    }

    #[test]
    fn creates_the_playlists_folder_when_missing() {
        let root = tempfile::tempdir().unwrap();

        let playlists = list_playlists_in(root.path()).unwrap();

        assert!(playlists.is_empty());
        assert!(root.path().join(PLAYLISTS_FOLDER_NAME).is_dir());
    }

    #[test]
    fn lists_the_playlists_of_the_folder_in_the_order_they_were_created() {
        let root = player_with_songs(&["Ashes.mp3", "Forest.mp3"]);
        write_playlist_file(
            &root,
            "1763581234999-Late.json",
            serde_json::json!({
                "title": "Late", "description": "", "allSongsFound": true, "songs": ["Forest.mp3"]
            }),
        );
        write_playlist_file(
            &root,
            "1763581234567-Early.json",
            serde_json::json!({
                "title": "Early", "description": "Heavy", "allSongsFound": true,
                "songs": ["Ashes.mp3", "Forest.mp3"]
            }),
        );

        let playlists = list_playlists_in(root.path()).unwrap();

        assert_eq!(
            playlists,
            [
                SavedPlaylist {
                    file_name: "1763581234567-Early.json".to_owned(),
                    title: "Early".to_owned(),
                    description: "Heavy".to_owned(),
                    all_songs_found: true,
                    songs: vec!["Ashes.mp3".to_owned(), "Forest.mp3".to_owned()],
                },
                SavedPlaylist {
                    file_name: "1763581234999-Late.json".to_owned(),
                    title: "Late".to_owned(),
                    description: String::new(),
                    all_songs_found: true,
                    songs: vec!["Forest.mp3".to_owned()],
                },
            ]
        );
    }

    #[test]
    fn ignores_files_whose_name_doesnt_fit_the_pattern() {
        let root = player_with_songs(&[]);
        let playlist = serde_json::json!({
            "title": "Kept", "description": "", "allSongsFound": true, "songs": []
        });
        write_playlist_file(&root, "1763581234567-Kept.json", playlist.clone());
        write_playlist_file(&root, "Copied by hand.json", playlist.clone());
        write_playlist_file(&root, "1763581234567-Kept.json.bak", playlist);

        let playlists = list_playlists_in(root.path()).unwrap();

        assert_eq!(file_names_of(&playlists), ["1763581234567-Kept.json"]);
    }

    #[test]
    fn ignores_folders_named_like_a_playlist() {
        let root = player_with_songs(&[]);
        fs::create_dir(playlist_path(&root, "1763581234567-Folder.json")).unwrap();

        assert!(list_playlists_in(root.path()).unwrap().is_empty());
    }

    #[test]
    fn ignores_files_that_arent_json() {
        let root = player_with_songs(&[]);
        fs::write(
            playlist_path(&root, "1763581234567-Broken.json"),
            "{ not json",
        )
        .unwrap();

        assert!(list_playlists_in(root.path()).unwrap().is_empty());
    }

    #[test]
    fn ignores_files_with_a_missing_mistyped_or_unknown_field() {
        let root = player_with_songs(&["Carpe Diem Baby.mp3"]);
        let invalid_playlists = [
            serde_json::json!({ "title": "No songs", "description": "", "allSongsFound": true }),
            serde_json::json!({
                "title": "Songs as text", "description": "", "allSongsFound": true,
                "songs": "Carpe Diem Baby.mp3"
            }),
            serde_json::json!({
                "title": "Found as text", "description": "", "allSongsFound": "yes", "songs": []
            }),
            serde_json::json!({
                "title": "With a cover", "description": "", "allSongsFound": true, "songs": [],
                "cover": "cover.png"
            }),
            serde_json::json!(["Carpe Diem Baby.mp3"]),
        ];
        for (index, playlist) in invalid_playlists.into_iter().enumerate() {
            write_playlist_file(
                &root,
                &format!("176358123456{index}-Invalid.json"),
                playlist,
            );
        }

        assert!(list_playlists_in(root.path()).unwrap().is_empty());
    }

    #[test]
    fn ignores_a_playlist_with_a_blank_title() {
        let root = player_with_songs(&[]);
        write_playlist_file(
            &root,
            "1763581234567-Blank.json",
            serde_json::json!({ "title": "  ", "description": "", "allSongsFound": true, "songs": [] }),
        );

        assert!(list_playlists_in(root.path()).unwrap().is_empty());
    }

    #[test]
    fn ignores_a_playlist_listing_something_other_than_a_song_file_name() {
        let root = player_with_songs(&["Angels and Demons.mp3"]);
        let not_songs = [
            "Songs/Angels and Demons.mp3",
            "../Angels and Demons.mp3",
            "..\\Angels and Demons.mp3",
            "Angels and Demons.jpg",
            "._Angels and Demons.mp3",
            "",
        ];
        for (index, not_a_song) in not_songs.into_iter().enumerate() {
            write_playlist_file(
                &root,
                &format!("176358123456{index}-Odd.json"),
                serde_json::json!({
                    "title": "Odd", "description": "", "allSongsFound": true, "songs": [not_a_song]
                }),
            );
        }

        assert!(list_playlists_in(root.path()).unwrap().is_empty());
    }

    #[test]
    fn ignores_a_playlist_listing_a_song_twice() {
        let root = player_with_songs(&["Where the Wild Things Are.mp3"]);
        write_playlist_file(
            &root,
            "1763581234567-Twice.json",
            serde_json::json!({
                "title": "Twice", "description": "", "allSongsFound": true,
                "songs": ["Where the Wild Things Are.mp3", "where the wild things are.MP3"]
            }),
        );

        assert!(list_playlists_in(root.path()).unwrap().is_empty());
    }

    #[test]
    fn listing_never_rewrites_a_file_even_with_songs_missing() {
        let root = player_with_songs(&[]);
        let file_name = "1763581234567-Old.json";
        let saved = serde_json::json!({
            "title": "Old", "description": "", "allSongsFound": true, "songs": ["Deus Le Volt!.mp3"]
        });
        write_playlist_file(&root, file_name, saved.clone());

        let playlists = list_playlists_in(root.path()).unwrap();

        assert!(playlists[0].all_songs_found);
        assert_eq!(read_playlist_json(&root, file_name), saved);
    }

    #[test]
    fn checking_sets_all_songs_found_to_false_when_songs_are_missing() {
        let root = player_with_songs(&["Stand Away.mp3"]);
        let file_name = "1763581234567-Gone.json";
        write_playlist_file(
            &root,
            file_name,
            serde_json::json!({
                "title": "Gone", "description": "", "allSongsFound": true,
                "songs": ["Stand Away.mp3", "Devil's Dance.mp3", "Spread Your Fire.mp3"]
            }),
        );

        let check = check_playlist_in(root.path(), file_name).unwrap();

        assert_eq!(
            check.missing_songs,
            ["Devil's Dance.mp3", "Spread Your Fire.mp3"]
        );
        assert!(!check.playlist.all_songs_found);
        assert_eq!(read_playlist_json(&root, file_name)["allSongsFound"], false);
    }

    #[test]
    fn checking_sets_all_songs_found_back_to_true_once_every_song_is_there() {
        let root = player_with_songs(&["Distant Thunder.mp3", "The Outlaw Torn.mp3"]);
        let file_name = "1763581234567-Back.json";
        write_playlist_file(
            &root,
            file_name,
            serde_json::json!({
                "title": "Back", "description": "Found again", "allSongsFound": false,
                "songs": ["Distant Thunder.mp3", "The Outlaw Torn.mp3"]
            }),
        );

        let check = check_playlist_in(root.path(), file_name).unwrap();

        assert!(check.missing_songs.is_empty());
        assert!(check.playlist.all_songs_found);
        assert_eq!(
            read_playlist_json(&root, file_name),
            serde_json::json!({
                "title": "Back", "description": "Found again", "allSongsFound": true,
                "songs": ["Distant Thunder.mp3", "The Outlaw Torn.mp3"]
            })
        );
    }

    #[test]
    fn checking_finds_missing_a_song_named_in_another_case_like_the_webview() {
        let root = player_with_songs(&["Shape of Things to Come.mp3"]);
        let file_name = "1763581234567-Cased.json";
        write_playlist_file(
            &root,
            file_name,
            serde_json::json!({
                "title": "Cased", "description": "", "allSongsFound": true,
                "songs": ["shape of things to come.MP3"]
            }),
        );

        let check = check_playlist_in(root.path(), file_name).unwrap();

        assert_eq!(check.missing_songs, ["shape of things to come.MP3"]);
        assert!(!check.playlist.all_songs_found);
    }

    #[test]
    fn checking_leaves_the_file_as_it_is_when_nothing_changed() {
        let root = player_with_songs(&["Moth.mp3"]);
        let file_name = "1763581234567-Same.json";
        let hand_written = "{\"title\":\"Same\",\"description\":\"\",\"allSongsFound\":true,\
            \"songs\":[\"Moth.mp3\"]}";
        fs::write(playlist_path(&root, file_name), hand_written).unwrap();

        check_playlist_in(root.path(), file_name).unwrap();

        assert_eq!(
            fs::read_to_string(playlist_path(&root, file_name)).unwrap(),
            hand_written
        );
    }

    #[test]
    fn checking_a_missing_or_broken_playlist_is_an_error() {
        let root = player_with_songs(&[]);
        fs::write(playlist_path(&root, "1763581234567-Broken.json"), "[]").unwrap();

        assert!(matches!(
            check_playlist_in(root.path(), "1763581234567-Nowhere.json"),
            Err(PlaylistError::Missing { .. })
        ));
        assert!(matches!(
            check_playlist_in(root.path(), "1763581234567-Broken.json"),
            Err(PlaylistError::Invalid { .. })
        ));
        assert!(matches!(
            check_playlist_in(root.path(), "../settings.json"),
            Err(PlaylistError::NotAPlaylist { .. })
        ));
    }

    #[test]
    fn creating_writes_the_playlist_and_finds_its_songs() {
        let root = player_with_songs(&["Wishing Well.mp3", "Jump in the Fire.mp3"]);
        let file_name = "1763581234567-Night_drive.json";

        let created = create_playlist_in(
            root.path(),
            file_name,
            contents(
                "Night drive",
                "For the road",
                &["Jump in the Fire.mp3", "Wishing Well.mp3"],
            ),
        )
        .unwrap();

        assert_eq!(
            created,
            SavedPlaylist {
                file_name: file_name.to_owned(),
                title: "Night drive".to_owned(),
                description: "For the road".to_owned(),
                all_songs_found: true,
                songs: vec![
                    "Jump in the Fire.mp3".to_owned(),
                    "Wishing Well.mp3".to_owned()
                ],
            }
        );
        assert_eq!(
            read_playlist_json(&root, file_name),
            serde_json::json!({
                "title": "Night drive", "description": "For the road", "allSongsFound": true,
                "songs": ["Jump in the Fire.mp3", "Wishing Well.mp3"]
            })
        );
    }

    #[test]
    fn creating_finds_songs_of_every_format() {
        let songs = [
            "Cure.flac",
            "Stand Away.WAVE",
            "X.ogg",
            "Pale Yellow.oga",
            "X.m4a",
            "Bounce.aac",
        ];
        let root = player_with_songs(&songs);
        let file_name = "1763581234567-Lossless.json";

        let created =
            create_playlist_in(root.path(), file_name, contents("Lossless", "", &songs)).unwrap();

        assert!(created.all_songs_found);
        assert_eq!(created.songs, songs);
    }

    #[test]
    fn creating_creates_the_playlists_folder_when_missing() {
        let root = tempfile::tempdir().unwrap();

        create_playlist_in(
            root.path(),
            "1763581234567-Empty.json",
            contents("Empty", "", &[]),
        )
        .unwrap();

        assert!(playlist_path(&root, "1763581234567-Empty.json").is_file());
    }

    #[test]
    fn creating_a_playlist_with_missing_songs_says_so() {
        let root = player_with_songs(&["Master of Puppets.mp3"]);

        let created = create_playlist_in(
            root.path(),
            "1763581234567-Partly.json",
            contents(
                "Partly",
                "",
                &["Master of Puppets.mp3", "The Other Side.mp3"],
            ),
        )
        .unwrap();

        assert!(!created.all_songs_found);
    }

    #[test]
    fn creating_never_overwrites_a_playlist() {
        let root = player_with_songs(&[]);
        let file_name = "1763581234567-First.json";
        create_playlist_in(root.path(), file_name, contents("First", "", &[])).unwrap();

        let second = create_playlist_in(root.path(), file_name, contents("Second", "", &[]));

        assert!(matches!(second, Err(PlaylistError::Taken { .. })));
        assert_eq!(read_playlist_json(&root, file_name)["title"], "First");
    }

    #[test]
    fn creating_refuses_a_name_that_isnt_a_playlists() {
        let root = player_with_songs(&[]);

        let created = create_playlist_in(root.path(), "../settings.json", contents("Odd", "", &[]));

        assert!(matches!(created, Err(PlaylistError::NotAPlaylist { .. })));
        assert!(!root.path().join("settings.json").exists());
    }

    #[test]
    fn creating_refuses_contents_a_listing_would_ignore() {
        let root = player_with_songs(&["Morning Star.mp3"]);
        let refused = [
            (contents(" ", "", &[]), ContentsProblem::BlankTitle),
            (
                contents("Odd", "", &["../Morning Star.mp3"]),
                ContentsProblem::NotASong("../Morning Star.mp3".to_owned()),
            ),
            (
                contents("Twice", "", &["Morning Star.mp3", "Morning Star.mp3"]),
                ContentsProblem::RepeatedSong("Morning Star.mp3".to_owned()),
            ),
        ];

        for (index, (playlist, problem)) in refused.into_iter().enumerate() {
            let file_name = format!("176358123456{index}-Refused.json");
            let created = create_playlist_in(root.path(), &file_name, playlist);

            assert!(
                matches!(created, Err(PlaylistError::InvalidContents(ref found)) if *found == problem),
                "{file_name}: {created:?}"
            );
            assert!(!playlist_path(&root, &file_name).exists());
        }
    }

    #[test]
    fn a_deleted_playlist_can_be_created_again_under_its_old_name() {
        let root = player_with_songs(&["Late Redemption.mp3"]);
        let file_name = "1763581234567-Undone.json";
        let playlist = contents("Undone", "", &["Late Redemption.mp3"]);
        create_playlist_in(root.path(), file_name, playlist.clone()).unwrap();
        delete_playlist_in(root.path(), file_name).unwrap();

        let recreated = create_playlist_in(root.path(), file_name, playlist).unwrap();

        assert_eq!(recreated.songs, ["Late Redemption.mp3"]);
        assert!(playlist_path(&root, file_name).is_file());
    }

    #[test]
    fn saving_rewrites_the_playlist_and_finds_its_songs_again() {
        let root = player_with_songs(&["Wasting My Hate.mp3", "Broken City.mp3"]);
        let file_name = "1763581234567-Reordered.json";
        write_playlist_file(
            &root,
            file_name,
            serde_json::json!({
                "title": "Reordered", "description": "", "allSongsFound": false,
                "songs": ["Spiders.mp3", "Wasting My Hate.mp3", "Broken City.mp3"]
            }),
        );

        let saved = save_playlist_in(
            root.path(),
            file_name,
            contents("Reordered", "", &["Broken City.mp3", "Wasting My Hate.mp3"]),
        )
        .unwrap();

        assert!(saved.all_songs_found);
        assert_eq!(
            read_playlist_json(&root, file_name),
            serde_json::json!({
                "title": "Reordered", "description": "", "allSongsFound": true,
                "songs": ["Broken City.mp3", "Wasting My Hate.mp3"]
            })
        );
    }

    #[test]
    fn saving_refuses_a_playlist_that_isnt_there() {
        let root = player_with_songs(&[]);
        let file_name = "1763581234567-Deleted.json";

        let saved = save_playlist_in(root.path(), file_name, contents("Deleted", "", &[]));

        assert!(matches!(saved, Err(PlaylistError::Missing { .. })));
        assert!(!playlist_path(&root, file_name).exists());
    }

    #[test]
    fn saving_leaves_no_temporary_file_behind() {
        let root = player_with_songs(&[]);
        let file_name = "1763581234567-Tidy.json";
        create_playlist_in(root.path(), file_name, contents("Tidy", "", &[])).unwrap();

        save_playlist_in(root.path(), file_name, contents("Tidy", "Still", &[])).unwrap();

        let file_names: Vec<_> = fs::read_dir(root.path().join(PLAYLISTS_FOLDER_NAME))
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(file_names, [file_name]);
    }

    #[test]
    fn deleting_removes_the_file() {
        let root = player_with_songs(&[]);
        let file_name = "1763581234567-Done.json";
        create_playlist_in(root.path(), file_name, contents("Done", "", &[])).unwrap();

        delete_playlist_in(root.path(), file_name).unwrap();

        assert!(!playlist_path(&root, file_name).exists());
    }

    #[test]
    fn deleting_a_missing_playlist_or_another_file_is_an_error() {
        let root = player_with_songs(&[]);
        fs::write(root.path().join("settings.json"), "{}").unwrap();

        assert!(matches!(
            delete_playlist_in(root.path(), "1763581234567-Nowhere.json"),
            Err(PlaylistError::Missing { .. })
        ));
        assert!(matches!(
            delete_playlist_in(root.path(), "../settings.json"),
            Err(PlaylistError::NotAPlaylist { .. })
        ));
        assert!(root.path().join("settings.json").exists());
    }

    #[test]
    fn serializes_playlists_like_the_frontend_types() {
        let check = PlaylistCheck {
            playlist: SavedPlaylist {
                file_name: "1763581234567-Roads.json".to_owned(),
                title: "Roads".to_owned(),
                description: "Long ones".to_owned(),
                all_songs_found: false,
                songs: vec!["Horizons into Battlegrounds.mp3".to_owned()],
            },
            missing_songs: vec!["Horizons into Battlegrounds.mp3".to_owned()],
        };

        assert_eq!(
            serde_json::to_value(check).unwrap(),
            serde_json::json!({
                "playlist": {
                    "fileName": "1763581234567-Roads.json",
                    "title": "Roads",
                    "description": "Long ones",
                    "allSongsFound": false,
                    "songs": ["Horizons into Battlegrounds.mp3"]
                },
                "missingSongs": ["Horizons into Battlegrounds.mp3"]
            })
        );
    }

    #[test]
    fn reads_the_contents_the_frontend_sends() {
        let sent: PlaylistContents = serde_json::from_value(serde_json::json!({
            "title": "Summer", "description": "", "songs": ["Jewel of the Summertime.mp3"]
        }))
        .unwrap();

        assert_eq!(
            sent,
            contents("Summer", "", &["Jewel of the Summertime.mp3"])
        );
    }

    #[test]
    fn says_how_many_songs_are_missing_when_the_file_said_none_were() {
        assert_eq!(
            song_search_message("Road trip", Some(true), 1).as_deref(),
            Some("Found 1 song missing from playlist \"Road trip\"")
        );
        assert_eq!(
            song_search_message("Road trip", None, 2).as_deref(),
            Some("Found 2 songs missing from playlist \"Road trip\"")
        );
    }

    #[test]
    fn says_when_every_song_is_found_again() {
        assert_eq!(
            song_search_message("Road trip", Some(false), 0).as_deref(),
            Some("Found every song of playlist \"Road trip\"")
        );
    }

    #[test]
    fn says_nothing_when_the_search_changes_nothing() {
        for (was_found, missing_count) in [(Some(false), 3), (Some(true), 0), (None, 0)] {
            assert_eq!(
                song_search_message("Road trip", was_found, missing_count),
                None
            );
        }
    }

    #[test]
    fn serializes_errors_as_their_message() {
        let errors = [
            (
                PlaylistError::Taken {
                    file_name: "1763581234567-Orion.json".to_owned(),
                },
                "A playlist named 1763581234567-Orion.json already exists",
            ),
            (
                PlaylistError::InvalidContents(ContentsProblem::RepeatedSong(
                    "Reactor.mp3".to_owned(),
                )),
                "The playlist can't be saved: it lists \"Reactor.mp3\" twice",
            ),
        ];

        for (error, message) in errors {
            assert_eq!(
                serde_json::to_value(&error).unwrap(),
                serde_json::json!(message)
            );
        }
    }
}
