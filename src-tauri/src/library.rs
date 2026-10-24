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

/// Returns the Songs folder, creating it first if it's missing.
fn ensure_songs_dir() -> Result<PathBuf, LibraryError> {
    let songs_dir = portable::root_dir()
        .map_err(LibraryError::RootDir)?
        .join(SONGS_FOLDER_NAME);
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
        let test_dir = std::env::temp_dir().join(format!("pmp-library-{}", std::process::id()));
        let folder = test_dir.join("folder.mp3");
        let file = test_dir.join("song.mp3");
        fs::create_dir_all(&folder).unwrap();
        fs::write(&file, b"").unwrap();

        let results = (is_mp3(&folder), is_mp3(&file));
        fs::remove_dir_all(&test_dir).unwrap();

        assert_eq!(results, (false, true));
    }
}
