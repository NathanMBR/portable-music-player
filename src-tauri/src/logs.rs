use std::{
    fs::{self, OpenOptions},
    io,
    path::{Path, PathBuf},
};

use tauri::{RunEvent, Runtime, plugin::TauriPlugin};
use tauri_plugin_log::{
    RotationStrategy, Target, TargetKind,
    log::{self, LevelFilter},
};

use crate::portable;

const LOGS_FOLDER_NAME: &str = "Logs";
/// The log file's name, without the extension the plugin adds.
const LOG_FILE_NAME: &str = "portable-music-player";
const LOG_FILE_EXTENSION: &str = "log";
const LOG_LEVEL: LevelFilter = LevelFilter::Info;
/// The plugin's own limit, 40 KB, would empty the log every few hundred lines.
const MAX_LOG_FILE_BYTES: u128 = 1_000_000;
/// Full log files kept beside the current one, each renamed with the date it filled up.
const FULL_LOG_FILES_KEPT: usize = 3;
/// Where the webview's lines show in the log, in place of this module's path.
const WEBVIEW_TARGET: &str = "webview";
const OPENING_MESSAGE: &str = "Opening app";
const CLOSING_MESSAGE: &str = "Closing app";

#[derive(Debug, thiserror::Error)]
pub enum LogsError {
    #[error("Couldn't find the folder of the executable: {0}")]
    RootDir(io::Error),
    #[error("Couldn't create the Logs folder at {}: {source}", .path.display())]
    CreateFolder { path: PathBuf, source: io::Error },
    #[error("Couldn't open the log file at {}: {source}", .path.display())]
    OpenFile { path: PathBuf, source: io::Error },
}

/// The Logs folder next to the executable, once the log file in it can be written.
pub fn writable_logs_dir() -> Result<PathBuf, LogsError> {
    writable_logs_dir_in(&portable::root_dir().map_err(LogsError::RootDir)?)
}

/// Prints the log to stdout and, given the Logs folder, saves it there too: everything logged
/// through the `log` crate, by the app or by its crates. On Windows the release build has no
/// console, so there only the file has it.
pub fn plugin<R: Runtime>(logs_dir: Option<&Path>) -> TauriPlugin<R> {
    let mut targets = vec![Target::new(TargetKind::Stdout)];
    if let Some(logs_dir) = logs_dir {
        targets.push(Target::new(TargetKind::Folder {
            path: logs_dir.to_path_buf(),
            file_name: Some(LOG_FILE_NAME.into()),
        }));
    }
    // `targets` replaces the plugin's defaults, whose file is in the user's profile, off the drive.
    tauri_plugin_log::Builder::new()
        .targets(targets)
        .level(LOG_LEVEL)
        .max_file_size(MAX_LOG_FILE_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(FULL_LOG_FILES_KEPT))
        .build()
}

/// Says the app is opening and, when the log can't be saved, why. It runs once the plugin does:
/// before that, nothing would print it.
pub fn log_opening(logs_dir: &Result<PathBuf, LogsError>) {
    log::info!("{OPENING_MESSAGE}");
    if let Err(error) = logs_dir {
        log::warn!("{error}. The log goes only to stdout.");
    }
}

/// Says the app is closing, once it's about to exit. A process killed from outside never gets
/// there.
pub fn log_closing(event: &RunEvent) {
    if matches!(event, RunEvent::Exit) {
        log::info!("{CLOSING_MESSAGE}");
    }
}

/// Writes a line from the webview to the log, about what the user does or what plays.
#[tauri::command]
pub async fn write_log(message: String) {
    log::info!(target: WEBVIEW_TARGET, "{message}");
}

/// Returns the Logs folder inside `root`, creating it first if it's missing, once the log file in
/// it opens for appending. The plugin opens that file as the app starts, and one it can't open,
/// as on a write-protected drive, would stop the whole app from starting.
fn writable_logs_dir_in(root: &Path) -> Result<PathBuf, LogsError> {
    let logs_dir = root.join(LOGS_FOLDER_NAME);
    fs::create_dir_all(&logs_dir).map_err(|source| LogsError::CreateFolder {
        path: logs_dir.clone(),
        source,
    })?;
    let log_file = log_file_in(&logs_dir);
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|source| LogsError::OpenFile {
            path: log_file,
            source,
        })?;
    Ok(logs_dir)
}

/// Where the plugin writes the current log inside `logs_dir`.
fn log_file_in(logs_dir: &Path) -> PathBuf {
    logs_dir
        .join(LOG_FILE_NAME)
        .with_extension(LOG_FILE_EXTENSION)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_the_logs_folder_when_missing() {
        let root = tempfile::tempdir().unwrap();

        let logs_dir = writable_logs_dir_in(root.path()).unwrap();

        assert_eq!(logs_dir, root.path().join(LOGS_FOLDER_NAME));
        assert!(logs_dir.is_dir());
    }

    #[test]
    fn keeps_what_an_existing_logs_folder_holds() {
        let root = tempfile::tempdir().unwrap();
        let logs_dir = root.path().join(LOGS_FOLDER_NAME);
        let current_log = log_file_in(&logs_dir);
        let full_log = logs_dir.join(format!("{LOG_FILE_NAME}_2026-11-12_21-04-37.log"));
        fs::create_dir(&logs_dir).unwrap();
        fs::write(&current_log, "the last session's lines\n").unwrap();
        fs::write(&full_log, "an older session's lines\n").unwrap();

        writable_logs_dir_in(root.path()).unwrap();

        assert_eq!(
            fs::read_to_string(&current_log).unwrap(),
            "the last session's lines\n"
        );
        assert_eq!(
            fs::read_to_string(&full_log).unwrap(),
            "an older session's lines\n"
        );
    }

    #[test]
    fn writes_the_log_to_a_file_named_after_the_app() {
        let logs_dir = Path::new("Logs");

        assert_eq!(
            log_file_in(logs_dir),
            logs_dir.join("portable-music-player.log")
        );
    }

    #[test]
    fn refuses_a_logs_folder_that_cant_be_created() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join(LOGS_FOLDER_NAME), "").unwrap();

        let result = writable_logs_dir_in(root.path());

        assert!(matches!(result, Err(LogsError::CreateFolder { .. })));
    }

    #[test]
    fn refuses_a_log_file_that_cant_be_opened() {
        let root = tempfile::tempdir().unwrap();
        let logs_dir = root.path().join(LOGS_FOLDER_NAME);
        fs::create_dir_all(log_file_in(&logs_dir)).unwrap();

        let result = writable_logs_dir_in(root.path());

        assert!(matches!(result, Err(LogsError::OpenFile { .. })));
    }
}
