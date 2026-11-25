//! Playback: songs play from Rust instead of the webview, so one song can follow another without a
//! gap. Each song in the player is read and decoded on a thread of its own (`song_feeder`), and the
//! audio thread only copies its samples to the output (`song_chain`).

mod song_bytes;
mod song_feeder;

use serde::{Serialize, Serializer};
use thiserror::Error;

use crate::library::LibraryError;

#[derive(Debug, Error)]
pub enum PlaybackError {
    #[error(transparent)]
    Library(#[from] LibraryError),
    #[error("Couldn't decode {path}: the file may be damaged")]
    Decode { path: String },
}

impl Serialize for PlaybackError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
