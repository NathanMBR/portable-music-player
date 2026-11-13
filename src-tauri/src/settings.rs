use std::{
    fs, io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize, Serializer};

use crate::portable;

const SETTINGS_FILE_NAME: &str = "settings.json";

/// Fields missing from the file take their default, so files saved before a choice existed load.
#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// `None` until the user picks one, which means following the OS.
    theme: Option<Theme>,
    /// Whether the player looks for new versions on its own. Nothing acts on it yet.
    checks_for_updates: bool,
    song_order: SongOrder,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: None,
            checks_for_updates: true,
            song_order: SongOrder::default(),
        }
    }
}

/// How the songs list is sorted.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SongOrder {
    FileName,
    /// By the title shown: the title tag, or the file name when the song has none.
    #[default]
    Title,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
}

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("Couldn't find the folder the player is running from: {0}")]
    RootDir(io::Error),
    #[error("Couldn't read the settings at {}: {source}", .path.display())]
    Read { path: PathBuf, source: io::Error },
    #[error("The settings at {} aren't valid: {source}", .path.display())]
    Parse {
        path: PathBuf,
        source: serde_json::Error,
    },
    #[error("Couldn't save the settings at {}: {source}", .path.display())]
    Write { path: PathBuf, source: io::Error },
}

impl Serialize for SettingsError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub async fn load_settings() -> Result<Settings, SettingsError> {
    read_settings(&settings_path()?)
}

#[tauri::command]
pub async fn save_settings(settings: Settings) -> Result<(), SettingsError> {
    write_settings(&settings_path()?, &settings)
}

fn settings_path() -> Result<PathBuf, SettingsError> {
    Ok(portable::root_dir()
        .map_err(SettingsError::RootDir)?
        .join(SETTINGS_FILE_NAME))
}

/// A missing file means nothing was saved yet, so it gives the defaults.
fn read_settings(path: &Path) -> Result<Settings, SettingsError> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Settings::default()),
        Err(source) => {
            return Err(SettingsError::Read {
                path: path.to_path_buf(),
                source,
            });
        }
    };
    serde_json::from_str(&contents).map_err(|source| SettingsError::Parse {
        path: path.to_path_buf(),
        source,
    })
}

/// Writes a temporary file and renames it over the old one, so pulling the drive mid-save can't
/// leave a half-written settings file.
fn write_settings(path: &Path, settings: &Settings) -> Result<(), SettingsError> {
    let write_error = |source: io::Error| SettingsError::Write {
        path: path.to_path_buf(),
        source,
    };
    let contents =
        serde_json::to_string_pretty(settings).map_err(|error| write_error(error.into()))?;
    let temporary_path = path.with_extension("json.tmp");
    fs::write(&temporary_path, contents).map_err(write_error)?;
    fs::rename(&temporary_path, path).map_err(write_error)
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use super::*;

    /// The folder is deleted when the returned `TempDir` drops, so tests keep it alive.
    fn temporary_settings_path() -> (TempDir, PathBuf) {
        let test_dir = tempfile::tempdir().unwrap();
        let path = test_dir.path().join(SETTINGS_FILE_NAME);
        (test_dir, path)
    }

    #[test]
    fn empty_object_has_no_theme() {
        let settings: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(settings.theme, None);
    }

    #[test]
    fn reads_a_saved_theme() {
        let settings: Settings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.theme, Some(Theme::Dark));
    }

    #[test]
    fn settings_saved_before_a_choice_existed_get_its_default() {
        let settings: Settings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();

        assert!(settings.checks_for_updates);
        assert_eq!(settings.song_order, SongOrder::Title);
    }

    #[test]
    fn reads_the_saved_update_and_song_order_choices() {
        let settings: Settings =
            serde_json::from_str(r#"{"checksForUpdates":false,"songOrder":"fileName"}"#).unwrap();

        assert!(!settings.checks_for_updates);
        assert_eq!(settings.song_order, SongOrder::FileName);
    }

    #[test]
    fn missing_file_gives_defaults() {
        let (_test_dir, path) = temporary_settings_path();
        let settings = read_settings(&path).unwrap();
        assert_eq!(settings, Settings::default());
    }

    #[test]
    fn saved_settings_load_back() {
        let (_test_dir, path) = temporary_settings_path();
        let saved = Settings {
            theme: Some(Theme::Light),
            checks_for_updates: false,
            song_order: SongOrder::FileName,
        };
        write_settings(&path, &saved).unwrap();
        let loaded = read_settings(&path).unwrap();
        assert_eq!(loaded, saved);
    }

    #[test]
    fn saving_leaves_no_temporary_file_behind() {
        let (test_dir, path) = temporary_settings_path();
        write_settings(&path, &Settings::default()).unwrap();

        let file_names: Vec<_> = fs::read_dir(test_dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();

        assert_eq!(file_names, [SETTINGS_FILE_NAME]);
    }

    #[test]
    fn invalid_json_is_a_parse_error() {
        let (_test_dir, path) = temporary_settings_path();
        fs::write(&path, "{ not json").unwrap();
        let result = read_settings(&path);
        assert!(matches!(result, Err(SettingsError::Parse { .. })));
    }

    #[test]
    fn serializes_settings_like_the_frontend_settings_type() {
        // Mirrors `Settings` in src/features/settings/types.ts, where no theme is `null`.
        let chosen = Settings {
            theme: Some(Theme::Dark),
            checks_for_updates: false,
            song_order: SongOrder::FileName,
        };

        assert_eq!(
            serde_json::to_value(Settings::default()).unwrap(),
            serde_json::json!({ "theme": null, "checksForUpdates": true, "songOrder": "title" })
        );
        assert_eq!(
            serde_json::to_value(chosen).unwrap(),
            serde_json::json!({ "theme": "dark", "checksForUpdates": false, "songOrder": "fileName" })
        );
    }

    #[test]
    fn serializes_errors_as_their_message() {
        let error = SettingsError::Write {
            path: PathBuf::from("settings.json"),
            source: io::Error::new(io::ErrorKind::PermissionDenied, "read-only file system"),
        };

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!("Couldn't save the settings at settings.json: read-only file system")
        );
    }
}
