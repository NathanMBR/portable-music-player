//! Songs of formats other than MP3 built in memory for the tests: WAV and FLAC files of a known
//! signal, so a test can check every sample it decodes. They're helpers, not example songs.

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
    let mut song = b"fLaC".to_vec();
    song.push(LAST_METADATA_BLOCK);
    song.extend_from_slice(&STREAMINFO_LENGTH.to_be_bytes()[1..]);
    song.extend(stream_info(bits, signal));
    let mut first_frame = 0;
    let mut frame_number = 0;
    while first_frame < signal.frames {
        let frames = FLAC_BLOCK_FRAMES.min(signal.frames - first_frame);
        song.extend(flac_frame(
            bits,
            signal,
            frame_number,
            first_frame..first_frame + frames,
        ));
        first_frame += frames;
        frame_number += 1;
    }
    song
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
