use std::{sync::Arc, time::Duration};

use rodio::{Decoder, Source};

use super::{
    PlaybackError,
    song_bytes::{SongBytes, SongReader},
};

/// Every song of the library is an MP3: the hint spares the decoder from guessing.
const MP3_EXTENSION: &str = "mp3";
const MP3_MIME_TYPE: &str = "audio/mpeg";

type SongDecoder = Decoder<SongReader>;

/// What a song's decoder found out about it once it read its start.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct SongFormat {
    pub(super) sample_rate: u32,
    pub(super) channels: u16,
    /// Without the encoder's delay and padding. `None` when the song doesn't say.
    pub(super) duration: Option<Duration>,
}

impl SongFormat {
    fn of(decoder: &SongDecoder) -> Self {
        Self {
            sample_rate: decoder.sample_rate().get(),
            channels: decoder.channels().get(),
            duration: decoder.total_duration(),
        }
    }
}

/// A decoder of the song `bytes` holds, which cuts the silence its encoder added at its start and
/// end, so songs follow each other without a gap, and seeks to the exact sample.
fn decoder_of(bytes: &Arc<SongBytes>, track_path: &str) -> Result<SongDecoder, PlaybackError> {
    Decoder::builder()
        .with_data(bytes.reader())
        .with_byte_len(bytes.length())
        .with_seekable(true)
        .with_hint(MP3_EXTENSION)
        .with_mime_type(MP3_MIME_TYPE)
        .with_gapless(true)
        .with_coarse_seek(false)
        .build()
        .map_err(|_| PlaybackError::Decode {
            path: track_path.to_owned(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_songs::{
        CHANNELS, SAMPLE_RATE, SAMPLES_PER_FRAME, gapless_audio, root_with_songs, silent_frames,
    };

    fn decoder_of_song(file_name: &str, contents: &[u8]) -> Result<SongDecoder, PlaybackError> {
        let root = root_with_songs(&[(file_name, contents)]);
        let track_path = format!("Songs/{file_name}");
        let bytes = SongBytes::open(root.path(), &track_path).unwrap();
        decoder_of(&bytes, &track_path)
    }

    fn frames_of(decoder: SongDecoder) -> usize {
        decoder.count() / usize::from(CHANNELS)
    }

    #[test]
    fn trims_the_encoder_delay_and_padding() {
        let decoder = decoder_of_song("Cure.mp3", &gapless_audio(10, 576, 1216)).unwrap();
        // The decoder's own delay, 529 samples, comes on top of the encoder's at the start, and is
        // part of the padding the tag says at the end.
        let expected_frames = 10 * SAMPLES_PER_FRAME - 576 - 1216;

        let format = SongFormat::of(&decoder);

        assert_eq!(format.sample_rate, SAMPLE_RATE);
        assert_eq!(format.channels, CHANNELS);
        let expected_duration = f64::from(expected_frames) / f64::from(SAMPLE_RATE);
        let duration = format.duration.unwrap().as_secs_f64();
        assert!((duration - expected_duration).abs() < 1e-6, "{duration}");
        assert_eq!(frames_of(decoder), expected_frames as usize);
    }

    #[test]
    fn keeps_every_sample_of_a_song_without_gapless_info() {
        let decoder = decoder_of_song("Fairy Tale.mp3", &silent_frames(10)).unwrap();

        assert_eq!(frames_of(decoder), (10 * SAMPLES_PER_FRAME) as usize);
    }

    #[test]
    fn fails_on_a_file_that_isnt_audio() {
        let not_audio = b"Not a single MPEG frame in here.".repeat(100);

        let result = decoder_of_song("Leper Messiah.mp3", &not_audio);

        assert!(matches!(
            result,
            Err(PlaybackError::Decode { path }) if path == "Songs/Leper Messiah.mp3"
        ));
    }
}
