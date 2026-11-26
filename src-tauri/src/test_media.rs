//! Songs of formats other than MP3 built in memory for the tests: WAV, FLAC and Ogg FLAC files of
//! a known signal, so a test can check every sample it decodes, and the committed fixtures of the
//! codecs no Rust crate encodes. They're helpers, not example songs.

/// 1 s of a tone per channel, stereo at 44.1 kHz, in Ogg Vorbis, made by
/// `test/make_audio_fixtures.sh`.
pub(crate) const VORBIS_FIXTURE: &[u8] = include_bytes!("../../test/audio_fixtures/vorbis.ogg");
/// The frames of every fixture.
pub(crate) const FIXTURE_FRAMES: u64 = 44_100;

/// The shape of a test signal.
#[derive(Clone, Copy)]
pub(crate) struct Signal {
    pub(crate) sample_rate: u32,
    pub(crate) channels: u16,
    pub(crate) frames: u32,
}

/// The level of the signal on `channel` at `frame`, from -1 to 1: a ramp that differs from one
/// channel to the next. It's an odd number of 256ths below 1, so it's never 0, and every bit depth
/// from 16 holds it exactly.
pub(crate) fn level_at(frame: u32, channel: u16) -> f32 {
    let step = (frame + 37 * u32::from(channel)) % 256;
    (2 * step + 1) as f32 / 256.0 - 1.0
}

/// Every sample of `signal`, interleaved.
pub(crate) fn samples_of(signal: Signal) -> Vec<f32> {
    (0..signal.frames)
        .flat_map(|frame| (0..signal.channels).map(move |channel| level_at(frame, channel)))
        .collect()
}

/// `level` as a signed integer sample of `bits` bits.
fn integer_sample(level: f32, bits: u32) -> i32 {
    (f64::from(level) * f64::from(1_u32 << (bits - 1))) as i32
}

/// How a WAV file stores its samples.
#[derive(Clone, Copy, Debug)]
pub(crate) enum WavEncoding {
    Pcm16,
    Pcm24,
    Float32,
}

const WAVE_FORMAT_PCM: u16 = 1;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
/// The fmt chunk's fields: format, channels, rate, byte rate, block align and bits per sample.
const FMT_CHUNK_LENGTH: u32 = 16;
/// "WAVE", then the fmt chunk's id, length and fields, then the data chunk's id and length.
const WAV_HEADER_LENGTH: u32 = 4 + 8 + FMT_CHUNK_LENGTH + 8;

/// A WAV file of `signal`, in `encoding`.
pub(crate) fn wav_song(encoding: WavEncoding, signal: Signal) -> Vec<u8> {
    let (format, bits): (u16, u16) = match encoding {
        WavEncoding::Pcm16 => (WAVE_FORMAT_PCM, 16),
        WavEncoding::Pcm24 => (WAVE_FORMAT_PCM, 24),
        WavEncoding::Float32 => (WAVE_FORMAT_IEEE_FLOAT, 32),
    };
    let block_align = signal.channels * bits / 8;
    let data: Vec<u8> = samples_of(signal)
        .into_iter()
        .flat_map(|level| match encoding {
            WavEncoding::Pcm16 => integer_sample(level, 16).to_le_bytes()[..2].to_vec(),
            WavEncoding::Pcm24 => integer_sample(level, 24).to_le_bytes()[..3].to_vec(),
            WavEncoding::Float32 => level.to_le_bytes().to_vec(),
        })
        .collect();
    let data_length = u32::try_from(data.len()).unwrap();
    [
        b"RIFF".as_slice(),
        &(WAV_HEADER_LENGTH + data_length).to_le_bytes(),
        b"WAVE",
        b"fmt ",
        &FMT_CHUNK_LENGTH.to_le_bytes(),
        &format.to_le_bytes(),
        &signal.channels.to_le_bytes(),
        &signal.sample_rate.to_le_bytes(),
        &(signal.sample_rate * u32::from(block_align)).to_le_bytes(),
        &block_align.to_le_bytes(),
        &bits.to_le_bytes(),
        b"data",
        &data_length.to_le_bytes(),
        &data,
    ]
    .concat()
}

/// The frames of each FLAC frame but the last, which holds the rest.
const FLAC_BLOCK_FRAMES: u32 = 4096;
const STREAMINFO_LENGTH: u32 = 34;
/// A metadata block header's flag for the last block before the frames.
const LAST_METADATA_BLOCK: u8 = 0x80;
/// The frame header's sync code, then a fixed block size.
const FRAME_SYNC: [u8; 2] = [0xFF, 0xF8];
/// The block size's code for a 16-bit size, minus one, after the frame number.
const BLOCK_SIZE_IN_16_BITS: u8 = 0b0111;
/// A subframe that stores its samples as they are.
const VERBATIM_SUBFRAME: u8 = 0b0000_0010;

/// A FLAC file of `signal`, in samples of `bits` bits, 16 or 24: a STREAMINFO block, then frames
/// whose subframes store each channel's samples as they are.
pub(crate) fn flac_song(bits: u32, signal: Signal) -> Vec<u8> {
    let mut song = FLAC_SIGNATURE.to_vec();
    song.extend(stream_info_block(bits, signal, true));
    song.extend(flac_frames(bits, signal).concat());
    song
}

const FLAC_SIGNATURE: &[u8; 4] = b"fLaC";
const STREAMINFO_BLOCK: u8 = 0;
const VORBIS_COMMENT_BLOCK: u8 = 4;
const PICTURE_BLOCK: u8 = 6;
/// The ID3v2 picture type FLAC's PICTURE block uses for a front cover.
const FRONT_COVER: u32 = 3;
const COVER_MIME_TYPE: &[u8] = b"image/png";
/// The Ogg FLAC mapping's first packet: its type, its signature, then its version, 1.0.
const OGG_FLAC_HEADER: &[u8; 7] = b"\x7FFLAC\x01\x00";
const VENDOR: &[u8] = b"portable-music-player tests";

/// What an Ogg FLAC file's headers hold besides its STREAMINFO.
#[derive(Default)]
pub(crate) struct OggFlacHeaders<'a> {
    /// Its Vorbis comment, as `KEY=value`.
    pub(crate) comments: &'a [(&'a str, &'a str)],
    /// The bytes of its front cover, in a PICTURE block.
    pub(crate) front_cover: Option<&'a [u8]>,
}

/// An Ogg FLAC file of `signal`, in samples of `bits` bits: the frames of `flac_song`, one per
/// packet, after the headers.
pub(crate) fn ogg_flac_song(bits: u32, signal: Signal, headers: &OggFlacHeaders) -> Vec<u8> {
    // The mapping puts the STREAMINFO block in its first packet, then the Vorbis comment block.
    let mut header_blocks = vec![vorbis_comment_block(
        headers.comments,
        headers.front_cover.is_none(),
    )];
    if let Some(cover) = headers.front_cover {
        header_blocks.push(picture_block(cover));
    }
    let header_packets = u16::try_from(header_blocks.len()).unwrap();
    let identification = [
        OGG_FLAC_HEADER.as_slice(),
        &header_packets.to_be_bytes(),
        FLAC_SIGNATURE,
        &stream_info_block(bits, signal, false),
    ]
    .concat();
    let mut ogg = OggWriter::default();
    ogg.write_page(&identification, 0, PageKind::First);
    for block in &header_blocks {
        ogg.write_page(block, 0, PageKind::Middle);
    }
    let frames = flac_frames(bits, signal);
    let last = frames.len() - 1;
    let mut end_frame = 0;
    for (index, frame) in frames.iter().enumerate() {
        end_frame = (end_frame + u64::from(FLAC_BLOCK_FRAMES)).min(signal.frames.into());
        let kind = if index == last {
            PageKind::Last
        } else {
            PageKind::Middle
        };
        // A page's granule position counts the frames up to the end of its last packet.
        ogg.write_page(frame, end_frame, kind);
    }
    ogg.into_bytes()
}

/// A metadata block's header: whether it's the last before the frames, its type and length.
fn metadata_block(block_type: u8, is_last: bool, contents: &[u8]) -> Vec<u8> {
    let flag = if is_last { LAST_METADATA_BLOCK } else { 0 };
    let length = u32::try_from(contents.len()).unwrap();
    [&[flag | block_type], &length.to_be_bytes()[1..], contents].concat()
}

fn stream_info_block(bits: u32, signal: Signal, is_last: bool) -> Vec<u8> {
    let contents = stream_info(bits, signal);
    assert_eq!(contents.len(), STREAMINFO_LENGTH as usize);
    metadata_block(STREAMINFO_BLOCK, is_last, &contents)
}

fn vorbis_comment_block(comments: &[(&str, &str)], is_last: bool) -> Vec<u8> {
    let with_length =
        |bytes: &[u8]| [&u32::try_from(bytes.len()).unwrap().to_le_bytes(), bytes].concat();
    let mut contents = with_length(VENDOR);
    contents.extend_from_slice(&u32::try_from(comments.len()).unwrap().to_le_bytes());
    for (key, value) in comments {
        contents.extend(with_length(format!("{key}={value}").as_bytes()));
    }
    metadata_block(VORBIS_COMMENT_BLOCK, is_last, &contents)
}

/// A PICTURE block holding `data` as the front cover, with no description and its size unknown.
fn picture_block(data: &[u8]) -> Vec<u8> {
    let length_of = |bytes: &[u8]| u32::try_from(bytes.len()).unwrap().to_be_bytes();
    let contents = [
        FRONT_COVER.to_be_bytes().as_slice(),
        &length_of(COVER_MIME_TYPE),
        COVER_MIME_TYPE,
        // The description's length, then the width, height, color depth and palette size.
        &[0; 4 * 5],
        &length_of(data),
        data,
    ]
    .concat();
    metadata_block(PICTURE_BLOCK, true, &contents)
}

/// The FLAC frames of `signal`, each of `FLAC_BLOCK_FRAMES` but the last.
fn flac_frames(bits: u32, signal: Signal) -> Vec<Vec<u8>> {
    (0..signal.frames)
        .step_by(FLAC_BLOCK_FRAMES as usize)
        .enumerate()
        .map(|(number, first_frame)| {
            let end_frame = (first_frame + FLAC_BLOCK_FRAMES).min(signal.frames);
            let number = u32::try_from(number).unwrap();
            flac_frame(bits, signal, number, first_frame..end_frame)
        })
        .collect()
}

#[derive(Clone, Copy, PartialEq)]
enum PageKind {
    First,
    Middle,
    Last,
}

/// The Ogg page header's flags for the first and last pages of a stream.
const BEGINNING_OF_STREAM: u8 = 0x02;
const END_OF_STREAM: u8 = 0x04;
const OGG_SERIAL: u32 = 0x5EED;
/// A lacing value: a packet's segment of 255 bytes is followed by more of it.
const FULL_SEGMENT: usize = 255;

/// Writes Ogg pages of one stream, a packet per page.
#[derive(Default)]
struct OggWriter {
    bytes: Vec<u8>,
    sequence: u32,
}

impl OggWriter {
    fn write_page(&mut self, packet: &[u8], granule_position: u64, kind: PageKind) {
        let flags = match kind {
            PageKind::First => BEGINNING_OF_STREAM,
            PageKind::Middle => 0,
            PageKind::Last => END_OF_STREAM,
        };
        // Full segments, then the rest, even when it's empty, which ends the packet.
        let mut lacing = vec![FULL_SEGMENT as u8; packet.len() / FULL_SEGMENT];
        lacing.push((packet.len() % FULL_SEGMENT) as u8);
        let mut page = [
            b"OggS".as_slice(),
            &[0, flags],
            &granule_position.to_le_bytes(),
            &OGG_SERIAL.to_le_bytes(),
            &self.sequence.to_le_bytes(),
            // The CRC, written once the page is whole.
            &[0; 4],
            &[u8::try_from(lacing.len()).unwrap()],
            &lacing,
            packet,
        ]
        .concat();
        let crc = ogg_crc(&page);
        page[22..26].copy_from_slice(&crc.to_le_bytes());
        self.bytes.extend(page);
        self.sequence += 1;
    }

    fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}

/// Ogg's CRC-32 of a page: polynomial 0x04C11DB7, not reflected.
fn ogg_crc(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0, |crc, byte| {
        (0..8).fold(crc ^ (u32::from(*byte) << 24), |crc, _| {
            if crc & 0x8000_0000 == 0 {
                crc << 1
            } else {
                (crc << 1) ^ 0x04C1_1DB7
            }
        })
    })
}

fn stream_info(bits: u32, signal: Signal) -> Vec<u8> {
    let mut writer = BitWriter::default();
    // The smallest and largest block sizes, the last block left out of the smallest.
    writer.write(FLAC_BLOCK_FRAMES.into(), 16);
    writer.write(FLAC_BLOCK_FRAMES.into(), 16);
    // The smallest and largest frames' sizes, unknown.
    writer.write(0, 24);
    writer.write(0, 24);
    writer.write(signal.sample_rate.into(), 20);
    writer.write(u64::from(signal.channels - 1), 3);
    writer.write(u64::from(bits - 1), 5);
    writer.write(signal.frames.into(), 36);
    // The audio's MD5, unknown.
    writer.write(0, 64);
    writer.write(0, 64);
    writer.into_bytes()
}

fn flac_frame(bits: u32, signal: Signal, number: u32, frames: std::ops::Range<u32>) -> Vec<u8> {
    let mut header = FRAME_SYNC.to_vec();
    header.push((BLOCK_SIZE_IN_16_BITS << 4) | sample_rate_code(signal.sample_rate));
    let channel_assignment = u8::try_from(signal.channels - 1).unwrap();
    header.push((channel_assignment << 4) | (sample_size_code(bits) << 1));
    // Frame numbers below 128 take one byte in FLAC's UTF-8-like coding.
    header.push(u8::try_from(number).unwrap());
    header.extend_from_slice(&u16::try_from(frames.len() - 1).unwrap().to_be_bytes());
    header.push(crc8(&header));
    let mut writer = BitWriter::from_bytes(header);
    for channel in 0..signal.channels {
        writer.write(VERBATIM_SUBFRAME.into(), 8);
        for frame in frames.clone() {
            let sample = integer_sample(level_at(frame, channel), bits);
            writer.write(u64::from(sample as u32), bits);
        }
    }
    let mut frame = writer.into_bytes();
    frame.extend_from_slice(&crc16(&frame).to_be_bytes());
    frame
}

fn sample_rate_code(sample_rate: u32) -> u8 {
    match sample_rate {
        44_100 => 0b1001,
        48_000 => 0b1010,
        _ => panic!("no FLAC code for {sample_rate} Hz in the tests"),
    }
}

fn sample_size_code(bits: u32) -> u8 {
    match bits {
        16 => 0b100,
        24 => 0b110,
        _ => panic!("no FLAC code for {bits}-bit samples in the tests"),
    }
}

/// FLAC's CRC-8 of a frame header: polynomial x⁸ + x² + x + 1.
fn crc8(bytes: &[u8]) -> u8 {
    bytes.iter().fold(0, |crc, byte| {
        (0..8).fold(crc ^ byte, |crc, _| {
            if crc & 0x80 == 0 {
                crc << 1
            } else {
                (crc << 1) ^ 0x07
            }
        })
    })
}

/// FLAC's CRC-16 of a whole frame: polynomial x¹⁶ + x¹⁵ + x² + 1.
fn crc16(bytes: &[u8]) -> u16 {
    bytes.iter().fold(0, |crc, byte| {
        (0..8).fold(crc ^ (u16::from(*byte) << 8), |crc, _| {
            if crc & 0x8000 == 0 {
                crc << 1
            } else {
                (crc << 1) ^ 0x8005
            }
        })
    })
}

/// Writes values of any width, most significant bit first, padding the last byte with zeros.
#[derive(Default)]
struct BitWriter {
    bytes: Vec<u8>,
    /// The bits of the last byte already written, 0 when it's full.
    used_bits: u32,
}

impl BitWriter {
    fn from_bytes(bytes: Vec<u8>) -> Self {
        Self {
            bytes,
            used_bits: 0,
        }
    }

    /// Writes the low `width` bits of `value`.
    fn write(&mut self, value: u64, width: u32) {
        for bit in (0..width).rev() {
            if self.used_bits == 0 {
                self.bytes.push(0);
            }
            let is_set = (value >> bit) & 1 == 1;
            if is_set {
                *self.bytes.last_mut().unwrap() |= 0x80 >> self.used_bits;
            }
            self.used_bits = (self.used_bits + 1) % 8;
        }
    }

    fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}
