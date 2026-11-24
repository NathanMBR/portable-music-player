use std::{
    sync::{Mutex, PoisonError},
    time::Duration,
};

use serde::{Serialize, Serializer};
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// How long a check waits for GitHub, so a stalled connection ends in a failure instead of a check
/// that never ends.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);

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

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("Couldn't read the latest release on GitHub: {0}")]
    Check(tauri_plugin_updater::Error),
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
    }
}
