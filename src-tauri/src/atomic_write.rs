use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

/// A file is written under a hidden name next to it first, `.<name>.tmp`, which nothing reads.
const TEMPORARY_PREFIX: &str = ".";
const TEMPORARY_EXTENSION: &str = ".tmp";

/// Writes `contents` to a temporary file next to `path`, then renames it over `path`, so pulling the
/// drive mid-write leaves either the old file or the new one, never half of one.
pub(crate) fn write_atomically(path: &Path, contents: impl AsRef<[u8]>) -> io::Result<()> {
    let temporary_path = temporary_path_of(path);
    fs::write(&temporary_path, contents)?;
    fs::rename(&temporary_path, path)
}

fn temporary_path_of(path: &Path) -> PathBuf {
    let mut name = OsString::from(TEMPORARY_PREFIX);
    name.push(path.file_name().unwrap_or_default());
    name.push(TEMPORARY_EXTENSION);
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_the_whole_file() {
        let test_dir = tempfile::tempdir().unwrap();
        let path = test_dir.path().join("settings.json");
        fs::write(&path, "an older and longer content").unwrap();

        write_atomically(&path, "new").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    }

    #[test]
    fn leaves_no_temporary_file_behind() {
        let test_dir = tempfile::tempdir().unwrap();
        let path = test_dir.path().join("settings.json");

        write_atomically(&path, "{}").unwrap();

        let file_names: Vec<_> = fs::read_dir(test_dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(file_names, ["settings.json"]);
    }

    #[test]
    fn writes_under_a_hidden_name_first() {
        assert_eq!(
            temporary_path_of(Path::new("Playlists/1763581234567-Road_trip.json")),
            Path::new("Playlists/.1763581234567-Road_trip.json.tmp")
        );
    }
}
