//! MP3 audio built in memory for the tests: silent MPEG frames, with or without the Info frame
//! that tells a decoder the encoder's delay and padding. They're helpers, not example songs.

use std::fs;

use tempfile::TempDir;

use crate::library::SONGS_FOLDER_NAME;

/// A temporary folder holding a Songs folder with these files, by name and contents. The folder is
/// deleted when the result is dropped, even when the test fails.
pub(crate) fn root_with_songs(songs: &[(&str, &[u8])]) -> TempDir {
    let root = tempfile::tempdir().unwrap();
    let songs_dir = root.path().join(SONGS_FOLDER_NAME);
    fs::create_dir(&songs_dir).unwrap();
    for (file_name, contents) in songs {
        fs::write(songs_dir.join(file_name), contents).unwrap();
    }
    root
}

/// A silent MPEG-1 Layer III frame's header: 128 kbit/s, 44.1 kHz, joint stereo, no CRC.
const FRAME_HEADER: [u8; 4] = [0xFF, 0xFB, 0x90, 0x64];
/// The length of a frame with `FRAME_HEADER`: 144 × 128,000 ÷ 44,100, rounded down.
const FRAME_LENGTH: usize = 417;
/// The sample rate `FRAME_HEADER` says.
pub(crate) const SAMPLE_RATE: u32 = 44_100;
/// The channels `FRAME_HEADER` says.
pub(crate) const CHANNELS: u16 = 2;
/// Every MPEG-1 Layer III frame holds this many samples per channel.
pub(crate) const SAMPLES_PER_FRAME: u32 = 1152;
/// A stereo MPEG-1 frame's side information, which the Info tag follows.
const SIDE_INFO_LENGTH: usize = 32;
const INFO_TAG_ID: &[u8; 4] = b"Info";
/// The Info tag holds the frame count, and none of its other optional fields.
const FRAME_COUNT_FLAG: u32 = 0x1;
/// FFmpeg's encoder, which wrote the Info tags of the dev songs. Its name tells decoders to read
/// the delay and padding, like LAME's.
const ENCODER: &[u8; 9] = b"Lavc60.31";
/// The LAME extension's fields between the encoder and the delay and padding: revision, lowpass,
/// peak, radio and audiophile gains, flags and ABR bitrate.
const FIELDS_BEFORE_DELAY_LENGTH: usize = 1 + 1 + 4 + 2 + 2 + 1 + 1;
/// The delay and padding, 12 bits each.
const DELAY_PADDING_BITS: u32 = 12;

/// The header of a frame like `FRAME_HEADER`'s, at 48 kHz.
const FRAME_HEADER_48_KHZ: [u8; 4] = [0xFF, 0xFB, 0x94, 0x64];
/// The length of a frame with `FRAME_HEADER_48_KHZ`: 144 × 128,000 ÷ 48,000.
const FRAME_LENGTH_48_KHZ: usize = 384;

/// `count` silent MPEG frames, which decode as `count` × `SAMPLES_PER_FRAME` samples per channel.
pub(crate) fn silent_frames(count: u32) -> Vec<u8> {
    frames_of(&FRAME_HEADER, FRAME_LENGTH, count)
}

/// `count` silent MPEG frames at 48 kHz instead of `SAMPLE_RATE`.
pub(crate) fn silent_frames_at_48_khz(count: u32) -> Vec<u8> {
    frames_of(&FRAME_HEADER_48_KHZ, FRAME_LENGTH_48_KHZ, count)
}

fn frames_of(header: &[u8; 4], length: usize, count: u32) -> Vec<u8> {
    let mut frame = vec![0; length];
    frame[..header.len()].copy_from_slice(header);
    frame.repeat(count as usize)
}

/// Two silent frames: the shortest audio lofty reads as MP3, since it checks a frame against the
/// next one.
pub(crate) fn silent_audio() -> Vec<u8> {
    silent_frames(2)
}

/// `frame_count` silent frames after an Info frame, as an encoder writes it: it counts the frames
/// after it, and its LAME extension says the encoder added `delay` samples at the start and
/// `padding` at the end.
pub(crate) fn gapless_audio(frame_count: u32, delay: u32, padding: u32) -> Vec<u8> {
    [
        info_frame(frame_count, delay, padding),
        silent_frames(frame_count),
    ]
    .concat()
}

fn info_frame(frame_count: u32, delay: u32, padding: u32) -> Vec<u8> {
    let delay_and_padding = (delay << DELAY_PADDING_BITS) | padding;
    let mut frame = [
        FRAME_HEADER.as_slice(),
        &[0; SIDE_INFO_LENGTH],
        INFO_TAG_ID,
        &FRAME_COUNT_FLAG.to_be_bytes(),
        &frame_count.to_be_bytes(),
        ENCODER,
        &[0; FIELDS_BEFORE_DELAY_LENGTH],
        // The low 3 bytes of the word: 24 bits.
        &delay_and_padding.to_be_bytes()[1..],
    ]
    .concat();
    frame.resize(FRAME_LENGTH, 0);
    frame
}
