use std::{
    collections::HashSet,
    ffi::{OsStr, OsString},
    fs::{self, DirEntry},
    io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{
    library::{self, LibraryError},
    portable,
};

/// A song is copied under a hidden name, which the scan skips, until it's whole: `.<name>.part`.
const PARTIAL_COPY_PREFIX: &str = ".";
const PARTIAL_COPY_EXTENSION: &str = ".part";

/// What to do with a dropped song whose file name is already taken in the Songs folder. Mirrors
/// `ConflictChoice` in src/features/songDrop/types.ts.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConflictChoice {
    /// Leaves the song already there, and the dropped one out.
    Skip,
    /// Puts the dropped song in place of the one already there.
    Replace,
}

/// What a drop holds, before anything is copied. Mirrors `DroppedSongs` in
/// src/features/songDrop/types.ts.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedSongs {
    song_count: usize,
    /// The file names of the dropped songs whose name is taken, by a song of the Songs folder or by
    /// another dropped song before them.
    conflicts: Vec<String>,
    failures: Vec<DropFailure>,
}

/// What copying a drop did. Mirrors `CopyOutcome` in src/features/songDrop/types.ts.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyOutcome {
    copied_count: usize,
    failures: Vec<DropFailure>,
}

/// A dropped file or folder that couldn't be read or copied. Mirrors `DropFailure` in
/// src/features/songDrop/types.ts.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DropFailure {
    /// As the OS gave it, shown to the user.
    path: String,
    reason: String,
}

/// The songs found in a drop, in the order they were found, and what couldn't be read.
#[derive(Debug, Default)]
struct FoundSongs {
    songs: Vec<PathBuf>,
    failures: Vec<DropFailure>,
}

/// Counts the songs in the files and folders dropped on the window, and names those whose file
/// name is taken, without copying anything.
#[tauri::command]
pub async fn check_dropped_songs(paths: Vec<PathBuf>) -> Result<DroppedSongs, LibraryError> {
    let root = portable::root_dir().map_err(LibraryError::RootDir)?;
    check_drop_in(&root, &paths)
}

/// Copies the songs in the files and folders dropped on the window into the Songs folder, flat,
/// doing `on_conflict` with each one whose file name is taken.
#[tauri::command]
pub async fn copy_dropped_songs(
    paths: Vec<PathBuf>,
    on_conflict: ConflictChoice,
) -> Result<CopyOutcome, LibraryError> {
    let root = portable::root_dir().map_err(LibraryError::RootDir)?;
    copy_drop_into(&root, &paths, on_conflict)
}

fn check_drop_in(root: &Path, dropped: &[PathBuf]) -> Result<DroppedSongs, LibraryError> {
    let songs_dir = library::ensure_songs_dir_in(root)?;
    let FoundSongs { songs, failures } = find_dropped_songs(dropped);
    // Lowercase, since the drive's file system may not tell names apart by case, like FAT or NTFS.
    let mut dropped_names = HashSet::new();
    let conflicts = songs
        .iter()
        .filter_map(|song| {
            let name = song.file_name()?;
            let is_taken_by_another_dropped_song =
                !dropped_names.insert(name.to_string_lossy().to_lowercase());
            let is_taken = is_taken_by_another_dropped_song || songs_dir.join(name).exists();
            is_taken.then(|| name.to_string_lossy().into_owned())
        })
        .collect();
    Ok(DroppedSongs {
        song_count: songs.len(),
        conflicts,
        failures,
    })
}

/// A name is checked as its song is copied, so a song copied before it in the same drop counts:
/// skipping keeps the first song of a name, and replacing keeps the last.
fn copy_drop_into(
    root: &Path,
    dropped: &[PathBuf],
    on_conflict: ConflictChoice,
) -> Result<CopyOutcome, LibraryError> {
    let songs_dir = library::ensure_songs_dir_in(root)?;
    let FoundSongs {
        songs,
        mut failures,
    } = find_dropped_songs(dropped);
    let mut copied_count = 0;
    for song in &songs {
        let Some(name) = song.file_name() else {
            continue;
        };
        if on_conflict == ConflictChoice::Skip && songs_dir.join(name).exists() {
            continue;
        }
        match copy_song(song, &songs_dir, name) {
            Ok(()) => copied_count += 1,
            Err(error) => failures.push(DropFailure::new(song, &error)),
        }
    }
    Ok(CopyOutcome {
        copied_count,
        failures,
    })
}

/// Copies under a hidden name first, which the scan skips, then renames the copy over the song's
/// own name: pulling the drive mid-copy never leaves half a song listed, nor a song half replaced.
fn copy_song(song: &Path, songs_dir: &Path, name: &OsStr) -> io::Result<()> {
    let partial_copy = songs_dir.join(partial_copy_name(name));
    let copied =
        fs::copy(song, &partial_copy).and_then(|_| fs::rename(&partial_copy, songs_dir.join(name)));
    if copied.is_err() {
        // The copy's own error is the one worth reporting; this one only means nothing was written.
        let _ = fs::remove_file(&partial_copy);
    }
    copied
}

fn partial_copy_name(name: &OsStr) -> OsString {
    let mut partial_copy_name = OsString::from(PARTIAL_COPY_PREFIX);
    partial_copy_name.push(name);
    partial_copy_name.push(PARTIAL_COPY_EXTENSION);
    partial_copy_name
}

fn find_dropped_songs(dropped: &[PathBuf]) -> FoundSongs {
    let mut found = FoundSongs::default();
    for path in dropped {
        match fs::metadata(path) {
            Ok(metadata) if metadata.is_dir() => found.add_folder(path),
            Ok(metadata) if metadata.is_file() => found.add_file(path),
            // Neither a file nor a folder, like a device: nothing to copy.
            Ok(_) => {}
            Err(error) => found.failures.push(DropFailure::new(path, &error)),
        }
    }
    found
}

impl FoundSongs {
    fn add_file(&mut self, file: &Path) {
        if library::has_mp3_name(file) {
            self.songs.push(file.to_path_buf());
        }
    }

    /// Adds the songs of `folder` and of its subfolders. Links to folders aren't followed, so a link
    /// back up can't loop. Hidden subfolders are skipped like hidden files: on a dropped drive they
    /// are the trash and the system's folders, whose songs aren't meant to be added.
    fn add_folder(&mut self, folder: &Path) {
        let entries = match entries_by_name(folder) {
            Ok(entries) => entries,
            Err(error) => return self.failures.push(DropFailure::new(folder, &error)),
        };
        for entry in entries {
            let path = entry.path();
            match entry.file_type() {
                Ok(file_type) if file_type.is_dir() => {
                    if !is_hidden_folder(&entry) {
                        self.add_folder(&path);
                    }
                }
                // Follows a link to a song, unlike a link to a folder.
                Ok(_) if path.is_file() => self.add_file(&path),
                Ok(_) => {}
                Err(error) => self.failures.push(DropFailure::new(&path, &error)),
            }
        }
    }
}

/// Sorted, since a folder is read in no particular order, which would otherwise decide which of two
/// songs of the same name is copied.
fn entries_by_name(folder: &Path) -> io::Result<Vec<DirEntry>> {
    let mut entries = fs::read_dir(folder)?.collect::<io::Result<Vec<_>>>()?;
    entries.sort_by_key(DirEntry::file_name);
    Ok(entries)
}

fn is_hidden_folder(folder: &DirEntry) -> bool {
    folder.file_name().to_string_lossy().starts_with('.') || has_hidden_attribute(folder)
}

/// Windows hides folders with an attribute rather than a name, like `$RECYCLE.BIN`.
#[cfg(windows)]
fn has_hidden_attribute(entry: &DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    entry
        .metadata()
        .is_ok_and(|metadata| metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0)
}

#[cfg(not(windows))]
fn has_hidden_attribute(_entry: &DirEntry) -> bool {
    false
}

impl DropFailure {
    fn new(path: &Path, error: &io::Error) -> Self {
        Self {
            path: path.display().to_string(),
            reason: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::SONGS_FOLDER_NAME;

    /// Writes a file at `path`, with the folders it goes in, holding `contents`, which tell the
    /// copies of songs apart.
    fn write_file(path: &Path, contents: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    /// The names in `folder`, sorted, since a folder is read in no particular order.
    fn names_in(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn contents_of(path: &Path) -> String {
        fs::read_to_string(path).unwrap()
    }

    #[test]
    fn finds_the_mp3s_of_dropped_files_and_of_folders_with_their_subfolders() {
        let drop = tempfile::tempdir().unwrap();
        let roulette = drop.path().join("Roulette.mp3");
        let album = drop.path().join("Audioslave");
        let the_last_remaining_light = album.join("The Last Remaining Light.mp3");
        let light_my_way = album.join("Disc 2").join("Light My Way.mp3");
        for song in [&roulette, &the_last_remaining_light, &light_my_way] {
            write_file(song, "");
        }

        let found = find_dropped_songs(&[roulette.clone(), album]);

        // Each folder's names are sorted, and "Disc 2" comes before "The Last Remaining Light.mp3".
        assert_eq!(
            found.songs,
            [roulette, light_my_way, the_last_remaining_light]
        );
        assert_eq!(found.failures, []);
    }

    #[test]
    fn leaves_out_other_files_hidden_files_and_hidden_folders() {
        let drop = tempfile::tempdir().unwrap();
        let bleeding_me = drop.path().join("Metallica").join("Bleeding Me.mp3");
        let notes = drop.path().join("notes.txt");
        write_file(&bleeding_me, "");
        write_file(&notes, "");
        for other_file in [
            "Metallica/cover.jpg",
            "Metallica/Running Alone.flac",
            "Metallica/._Bleeding Me.mp3",
            "Metallica/.Trash-1000/Boom!.mp3",
        ] {
            write_file(&drop.path().join(other_file), "");
        }
        fs::create_dir(drop.path().join("Metallica").join("Jump in the Fire.mp3")).unwrap();

        let found = find_dropped_songs(&[notes, drop.path().join("Metallica")]);

        assert_eq!(found.songs, [bleeding_me]);
    }

    #[test]
    fn finds_the_songs_of_a_hidden_folder_dropped_itself() {
        let drop = tempfile::tempdir().unwrap();
        let hidden_folder = drop.path().join(".Shaman");
        let time_will_come = hidden_folder.join("Time Will Come.mp3");
        write_file(&time_will_come, "");

        let found = find_dropped_songs(&[hidden_folder]);

        assert_eq!(found.songs, [time_will_come]);
    }

    #[cfg(unix)]
    #[test]
    fn doesnt_follow_links_to_folders_so_a_link_back_up_cant_loop() {
        let drop = tempfile::tempdir().unwrap();
        let album = drop.path().join("Angra");
        let in_excelsis = album.join("In Excelsis.mp3");
        write_file(&in_excelsis, "");
        std::os::unix::fs::symlink(&album, album.join("Again")).unwrap();

        let found = find_dropped_songs(&[album]);

        assert_eq!(found.songs, [in_excelsis]);
    }

    #[test]
    fn reports_a_dropped_path_that_no_longer_exists() {
        let drop = tempfile::tempdir().unwrap();
        let gone = drop.path().join("Paradise.mp3");
        let reason = fs::metadata(&gone).unwrap_err().to_string();

        let found = find_dropped_songs(std::slice::from_ref(&gone));

        assert_eq!(found.songs, Vec::<PathBuf>::new());
        assert_eq!(
            found.failures,
            [DropFailure {
                path: gone.display().to_string(),
                reason
            }]
        );
    }

    #[test]
    fn names_dropped_songs_whose_file_name_is_taken_in_the_songs_folder_or_by_another_dropped_song()
    {
        let root = tempfile::tempdir().unwrap();
        let drop = tempfile::tempdir().unwrap();
        write_file(
            &root
                .path()
                .join(SONGS_FOLDER_NAME)
                .join("Time Will Come.mp3"),
            "",
        );
        let album = drop.path().join("Angra");
        let dropped = [
            drop.path().join("Time Will Come.mp3"),
            drop.path().join("Paradise.mp3"),
            album.join("CD 1").join("Waiting Silence.mp3"),
            album.join("CD 2").join("WAITING SILENCE.mp3"),
        ];
        for song in &dropped {
            write_file(song, "");
        }

        let dropped_songs = check_drop_in(
            root.path(),
            &[dropped[0].clone(), dropped[1].clone(), album],
        )
        .unwrap();

        assert_eq!(
            dropped_songs,
            DroppedSongs {
                song_count: 4,
                conflicts: vec!["Time Will Come.mp3".into(), "WAITING SILENCE.mp3".into()],
                failures: Vec::new()
            }
        );
    }

    #[test]
    fn copies_songs_flat_into_the_songs_folder_creating_it_when_missing() {
        let root = tempfile::tempdir().unwrap();
        let drop = tempfile::tempdir().unwrap();
        let album = drop.path().join("Metallica");
        write_file(&album.join("Through the Never.mp3"), "Through the Never");
        write_file(
            &album.join("Live").join("Original Fire.mp3"),
            "Original Fire",
        );

        let outcome = copy_drop_into(root.path(), &[album], ConflictChoice::Skip).unwrap();

        let songs_dir = root.path().join(SONGS_FOLDER_NAME);
        assert_eq!(
            outcome,
            CopyOutcome {
                copied_count: 2,
                failures: Vec::new()
            }
        );
        assert_eq!(
            names_in(&songs_dir),
            ["Original Fire.mp3", "Through the Never.mp3"]
        );
        assert_eq!(
            contents_of(&songs_dir.join("Original Fire.mp3")),
            "Original Fire"
        );
    }

    /// A Songs folder holding "Faithless Sanctuary.mp3", and a drop holding a song of that name
    /// and two songs both named "Nova Era.mp3", each with contents saying which one it is.
    fn drop_with_taken_names() -> (tempfile::TempDir, tempfile::TempDir, Vec<PathBuf>) {
        let root = tempfile::tempdir().unwrap();
        let drop = tempfile::tempdir().unwrap();
        write_file(
            &root
                .path()
                .join(SONGS_FOLDER_NAME)
                .join("Faithless Sanctuary.mp3"),
            "current",
        );
        write_file(&drop.path().join("Faithless Sanctuary.mp3"), "dropped");
        write_file(&drop.path().join("CD 1").join("Nova Era.mp3"), "first");
        write_file(&drop.path().join("CD 2").join("Nova Era.mp3"), "second");
        let dropped = vec![
            drop.path().join("Faithless Sanctuary.mp3"),
            drop.path().join("CD 1"),
            drop.path().join("CD 2"),
        ];
        (root, drop, dropped)
    }

    #[test]
    fn skips_taken_names_when_told_to_skip_keeping_the_first_song_of_a_name() {
        let (root, _drop, dropped) = drop_with_taken_names();

        let outcome = copy_drop_into(root.path(), &dropped, ConflictChoice::Skip).unwrap();

        let songs_dir = root.path().join(SONGS_FOLDER_NAME);
        assert_eq!(outcome.copied_count, 1);
        assert_eq!(
            contents_of(&songs_dir.join("Faithless Sanctuary.mp3")),
            "current"
        );
        assert_eq!(contents_of(&songs_dir.join("Nova Era.mp3")), "first");
    }

    #[test]
    fn replaces_songs_of_taken_names_when_told_to_replace() {
        let (root, _drop, dropped) = drop_with_taken_names();

        let outcome = copy_drop_into(root.path(), &dropped, ConflictChoice::Replace).unwrap();

        let songs_dir = root.path().join(SONGS_FOLDER_NAME);
        assert_eq!(outcome.copied_count, 3);
        assert_eq!(
            contents_of(&songs_dir.join("Faithless Sanctuary.mp3")),
            "dropped"
        );
        assert_eq!(contents_of(&songs_dir.join("Nova Era.mp3")), "second");
        assert_eq!(
            names_in(&songs_dir),
            ["Faithless Sanctuary.mp3", "Nova Era.mp3"]
        );
    }

    #[test]
    fn reports_a_song_it_couldnt_copy_and_leaves_no_partial_file() {
        let root = tempfile::tempdir().unwrap();
        let drop = tempfile::tempdir().unwrap();
        let songs_dir = root.path().join(SONGS_FOLDER_NAME);
        // A song can't take the place of a folder.
        fs::create_dir_all(songs_dir.join("ATWA.mp3")).unwrap();
        let atwa = drop.path().join("ATWA.mp3");
        let boom = drop.path().join("Boom!.mp3");
        write_file(&atwa, "ATWA");
        write_file(&boom, "Boom!");

        let outcome =
            copy_drop_into(root.path(), &[atwa.clone(), boom], ConflictChoice::Replace).unwrap();

        assert_eq!(outcome.copied_count, 1);
        assert_eq!(
            outcome
                .failures
                .iter()
                .map(|failure| failure.path.clone())
                .collect::<Vec<_>>(),
            [atwa.display().to_string()]
        );
        assert_eq!(names_in(&songs_dir), ["ATWA.mp3", "Boom!.mp3"]);
        assert!(songs_dir.join("ATWA.mp3").is_dir());
    }

    #[test]
    fn copies_the_songs_it_can_when_a_dropped_path_is_gone() {
        let root = tempfile::tempdir().unwrap();
        let drop = tempfile::tempdir().unwrap();
        let gone = drop.path().join("Light My Way.mp3");
        let roulette = drop.path().join("Roulette.mp3");
        write_file(&roulette, "Roulette");

        let outcome =
            copy_drop_into(root.path(), &[gone.clone(), roulette], ConflictChoice::Skip).unwrap();

        assert_eq!(outcome.copied_count, 1);
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].path, gone.display().to_string());
    }

    #[test]
    fn serializes_dropped_songs_like_the_frontend_dropped_songs_type() {
        let dropped_songs = DroppedSongs {
            song_count: 2,
            conflicts: vec!["Boom!.mp3".into()],
            failures: Vec::new(),
        };

        assert_eq!(
            serde_json::to_value(&dropped_songs).unwrap(),
            serde_json::json!({ "songCount": 2, "conflicts": ["Boom!.mp3"], "failures": [] })
        );
    }

    #[test]
    fn serializes_a_copy_outcome_like_the_frontend_copy_outcome_type() {
        let outcome = CopyOutcome {
            copied_count: 1,
            failures: vec![DropFailure {
                path: "/media/usb/Angra/Nova Era.mp3".into(),
                reason: "Permission denied (os error 13)".into(),
            }],
        };

        assert_eq!(
            serde_json::to_value(&outcome).unwrap(),
            serde_json::json!({
                "copiedCount": 1,
                "failures": [
                    {
                        "path": "/media/usb/Angra/Nova Era.mp3",
                        "reason": "Permission denied (os error 13)"
                    }
                ]
            })
        );
    }

    #[test]
    fn reads_the_conflict_choices_the_frontend_sends() {
        let choice_of = |name: &str| serde_json::from_value::<ConflictChoice>(name.into()).unwrap();

        assert_eq!(choice_of("skip"), ConflictChoice::Skip);
        assert_eq!(choice_of("replace"), ConflictChoice::Replace);
    }
}
