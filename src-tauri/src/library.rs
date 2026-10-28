use std::{
    fs, io,
    path::{Path, PathBuf},
};

use serde::{Serialize, Serializer};

use crate::portable;

const SONGS_FOLDER_NAME: &str = "Songs";
const MP3_EXTENSION: &str = "mp3";

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
            "song.mp3",
            "SONG.MP3",
            "Song.Mp3",
            "Artist - Song (Live).mp3",
        ] {
            assert!(has_mp3_name(Path::new(name)), "{name} should be an mp3");
        }
    }

    #[test]
    fn rejects_hidden_and_non_mp3_names() {
        for name in ["._song.mp3", ".song.mp3", "song.wav", "song.mp3.txt", "mp3"] {
            assert!(
                !has_mp3_name(Path::new(name)),
                "{name} should not be an mp3"
            );
        }
    }

    #[test]
    fn rejects_folders_named_like_mp3_files() {
        let test_dir = tempfile::tempdir().unwrap();
        let folder = test_dir.path().join("folder.mp3");
        let file = test_dir.path().join("song.mp3");
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
        let song = root.path().join(SONGS_FOLDER_NAME).join("song.mp3");
        fs::create_dir(root.path().join(SONGS_FOLDER_NAME)).unwrap();
        fs::write(&song, b"").unwrap();

        ensure_songs_dir_in(root.path()).unwrap();

        assert!(song.is_file());
    }

    #[test]
    fn lists_only_the_mp3_files_of_the_songs_folder() {
        let songs_dir = tempfile::tempdir().unwrap();
        for file_name in ["b.mp3", "A.MP3", "notes.txt", "song.wav", "._b.mp3"] {
            fs::write(songs_dir.path().join(file_name), b"").unwrap();
        }
        fs::create_dir(songs_dir.path().join("folder.mp3")).unwrap();

        let mut titles: Vec<String> = find_tracks(songs_dir.path())
            .unwrap()
            .into_iter()
            .map(|track| track.title)
            .collect();
        // The folder is read in no particular order; the frontend sorts the tracks.
        titles.sort();

        assert_eq!(titles, ["A", "b"]);
    }

    #[test]
    fn names_tracks_after_their_file_with_a_path_valid_on_any_os() {
        let track = track_from(&Path::new("/media/usb/Songs").join("Artist - Song.mp3"));

        assert_eq!(track.title, "Artist - Song");
        assert_eq!(track.path, "Songs/Artist - Song.mp3");
    }

    #[test]
    fn serializes_tracks_like_the_frontend_track_type() {
        // Mirrors `Track` in src/features/library/types.ts.
        let track = Track {
            path: "Songs/Song.mp3".into(),
            title: "Song".into(),
        };

        assert_eq!(
            serde_json::to_value(&track).unwrap(),
            serde_json::json!({ "path": "Songs/Song.mp3", "title": "Song" })
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
}
