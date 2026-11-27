use std::{
    sync::{Mutex, PoisonError},
    time::Duration,
};

use serde::{Serialize, Serializer};
use tauri::{
    AppHandle, State,
    utils::{config::BundleType, platform::bundle_type},
};
use tauri_plugin_log::log;
use tauri_plugin_updater::{Update, UpdaterExt};

/// How long a check waits for GitHub, so a stalled connection ends in a failure instead of a check
/// that never ends.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);

/// Where a stable release's files are downloaded from, each under its tag, `v<version>`.
const RELEASE_DOWNLOADS_URL: &str = concat!(env!("CARGO_PKG_REPOSITORY"), "/releases/download");

/// The executable's name, which starts every release file's name.
const APP_NAME: &str = env!("CARGO_PKG_NAME");

/// A newer stable release than the one running.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundUpdate {
    version: String,
    /// The release's patch notes, in Markdown: empty when it has none.
    notes: String,
}

impl FoundUpdate {
    fn new(version: String, notes: Option<String>) -> Self {
        Self {
            version,
            notes: notes.unwrap_or_default(),
        }
    }
}

/// The update the last check found, kept for its download.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

/// How the running app got on the computer, which decides how it updates.
#[derive(Debug, PartialEq)]
enum Build {
    /// Installed on Windows by the NSIS or MSI installer: the updater installs the new version in
    /// its place.
    Installed,
    /// Run from any folder, like a flash drive: the browser downloads the new file, for the user
    /// to put in place of this one.
    Portable(PortableBuild),
}

#[derive(Debug, PartialEq)]
enum PortableBuild {
    AppImage,
    LinuxExecutable,
    WindowsExecutable,
}

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("Couldn't read the latest release on GitHub: {0}")]
    Check(tauri_plugin_updater::Error),
    #[error("No update was found to download. Check for updates again.")]
    NothingToInstall,
    #[error("Couldn't open the download in the browser: {0}")]
    OpenDownload(tauri_plugin_opener::Error),
    #[error("Couldn't install the update: {0}")]
    Install(tauri_plugin_updater::Error),
}

impl Serialize for UpdateError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Looks for a release newer than the one running, among the stable ones only: the endpoint in
/// tauri.conf.json is the `latest.json` of GitHub's latest release, which is never a draft or a
/// pre-release.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<Option<FoundUpdate>, UpdateError> {
    let update = app
        .updater_builder()
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(UpdateError::Check)?
        .check()
        .await
        .map_err(UpdateError::Check)?;
    let found_update = update
        .as_ref()
        .map(|update| FoundUpdate::new(update.version.clone(), update.body.clone()));
    // The release build aborts on panic, so a poisoned lock is taken as it is.
    *pending_update
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner) = update;
    Ok(found_update)
}

/// Gets the update the last check found: on an installed build, the updater downloads it and runs
/// its installer, which closes the app (Windows' passive install mode, in tauri.conf.json, shows
/// only a progress bar, then opens the new version); on a portable build, the default browser
/// downloads the new file.
#[tauri::command]
pub async fn install_update(pending_update: State<'_, PendingUpdate>) -> Result<(), UpdateError> {
    // Cloned, since the lock can't be held while the download runs.
    let update = pending_update
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone()
        .ok_or(UpdateError::NothingToInstall)?;
    match build_of(bundle_type(), std::env::consts::OS) {
        Build::Installed => {
            log::info!("Installing update to version {}", update.version);
            update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(UpdateError::Install)
        }
        Build::Portable(build) => {
            tauri_plugin_opener::open_url(download_url(build, &update.version), None::<&str>)
                .map_err(UpdateError::OpenDownload)?;
            log::info!(
                "Opened the download of version {} in the browser",
                update.version
            );
            Ok(())
        }
    }
}

/// The bundler marks the executable inside each installer and the AppImage with their type, and
/// leaves the bare executables it uploads unmarked.
fn build_of(bundle_type: Option<BundleType>, os: &str) -> Build {
    match bundle_type {
        Some(BundleType::Nsis | BundleType::Msi) => Build::Installed,
        Some(BundleType::AppImage) => Build::Portable(PortableBuild::AppImage),
        _ if os == "windows" => Build::Portable(PortableBuild::WindowsExecutable),
        _ => Build::Portable(PortableBuild::LinuxExecutable),
    }
}

/// The direct link to a release's file for this build, named by the stable workflow: the AppImage
/// by its `releaseAssetNamePattern`, the bare executables by its step that uploads them. Releases
/// are built for x64 only.
fn download_url(build: PortableBuild, version: &str) -> String {
    let file_name = match build {
        PortableBuild::AppImage => format!("{APP_NAME}_{version}_linux_amd64.AppImage"),
        PortableBuild::LinuxExecutable => format!("{APP_NAME}_{version}_linux_x64-portable"),
        PortableBuild::WindowsExecutable => {
            format!("{APP_NAME}_{version}_windows_x64-portable.exe")
        }
    };
    format!("{RELEASE_DOWNLOADS_URL}/v{version}/{file_name}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_a_found_update_like_the_frontend_type() {
        let found_update = FoundUpdate::new(
            "0.2.0".to_string(),
            Some("## New features\n\n- Checks for updates".to_string()),
        );

        assert_eq!(
            serde_json::to_value(found_update).unwrap(),
            serde_json::json!({
                "version": "0.2.0",
                "notes": "## New features\n\n- Checks for updates"
            })
        );
    }

    #[test]
    fn a_release_without_notes_has_empty_notes() {
        let found_update = FoundUpdate::new("0.2.0".to_string(), None);

        assert_eq!(found_update.notes, "");
    }

    #[test]
    fn serializes_errors_as_their_message() {
        let error = UpdateError::Check(tauri_plugin_updater::Error::ReleaseNotFound);

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!(
                "Couldn't read the latest release on GitHub: Could not fetch a valid release JSON from the remote"
            )
        );
        assert_eq!(
            serde_json::to_value(UpdateError::NothingToInstall).unwrap(),
            serde_json::json!("No update was found to download. Check for updates again.")
        );
        assert_eq!(
            serde_json::to_value(UpdateError::OpenDownload(
                tauri_plugin_opener::Error::UnknownProgramName("firefox".to_string())
            ))
            .unwrap(),
            serde_json::json!("Couldn't open the download in the browser: unknown program firefox")
        );
        assert_eq!(
            serde_json::to_value(UpdateError::Install(
                tauri_plugin_updater::Error::ReleaseNotFound
            ))
            .unwrap(),
            serde_json::json!(
                "Couldn't install the update: Could not fetch a valid release JSON from the remote"
            )
        );
    }

    #[test]
    fn an_installer_build_updates_in_place() {
        assert_eq!(
            build_of(Some(BundleType::Nsis), "windows"),
            Build::Installed
        );
        assert_eq!(build_of(Some(BundleType::Msi), "windows"), Build::Installed);
    }

    #[test]
    fn the_appimage_downloads_the_new_appimage() {
        assert_eq!(
            build_of(Some(BundleType::AppImage), "linux"),
            Build::Portable(PortableBuild::AppImage)
        );
    }

    #[test]
    fn a_bare_executable_downloads_the_new_one_for_its_os() {
        assert_eq!(
            build_of(None, "linux"),
            Build::Portable(PortableBuild::LinuxExecutable)
        );
        assert_eq!(
            build_of(None, "windows"),
            Build::Portable(PortableBuild::WindowsExecutable)
        );
    }

    #[test]
    fn downloads_the_release_files_by_the_names_the_stable_workflow_gives_them() {
        let releases = "https://github.com/NathanMBR/chopi/releases/download/v0.2.0";

        assert_eq!(
            download_url(PortableBuild::AppImage, "0.2.0"),
            format!("{releases}/chopi_0.2.0_linux_amd64.AppImage")
        );
        assert_eq!(
            download_url(PortableBuild::LinuxExecutable, "0.2.0"),
            format!("{releases}/chopi_0.2.0_linux_x64-portable")
        );
        assert_eq!(
            download_url(PortableBuild::WindowsExecutable, "0.2.0"),
            format!("{releases}/chopi_0.2.0_windows_x64-portable.exe")
        );
    }
}
