//! Opus, which symphonia's Ogg and MP4 demuxers read but none of its decoders decode: a symphonia
//! codec on opus-pure, so the decoder hands it an Opus track's packets like any other codec's.
//!
//! It never cuts the pre-skip, the encoder's delay: that's the container's, Ogg's granule
//! positions (see `song_decoder.rs`) or MP4's edit list (see `mp4_trim.rs`), which says so for
//! the whole track.

use opus_pure::{ChannelLayout as StreamLayout, MAX_PACKET_SAMPLES, OpusDecoder, OpusMSDecoder};
use symphonia::core::{
    audio::{
        AsGenericAudioBufferRef, AudioBuffer, AudioMut, AudioSpec, Channels, GenericAudioBufferRef,
        Position,
    },
    codecs::{
        CodecInfo,
        audio::{
            AudioCodecParameters, AudioDecoder, AudioDecoderOptions, FinalizeResult,
            well_known::CODEC_ID_OPUS,
        },
        registry::{RegisterableAudioDecoder, SupportedAudioCodec},
    },
    errors::{Error as MediaError, Result as MediaResult},
    packet::PacketRef,
};

/// Opus always decodes at 48 kHz, whatever rate its source had.
const OPUS_RATE: u32 = 48_000;
const SUPPORTED_CODECS: &[SupportedAudioCodec] = &[SupportedAudioCodec {
    id: CODEC_ID_OPUS,
    info: CodecInfo {
        short_name: "opus",
        long_name: "Opus (opus-pure)",
        profiles: &[],
    },
}];

/// The magic both headers start with: Ogg's packet holds it, and symphonia puts it before MP4's
/// `dOps` box.
const HEAD_MAGIC: &[u8; 8] = b"OpusHead";
/// Where the header's fields are, past the magic.
const VERSION_AT: usize = 8;
const CHANNELS_AT: usize = 9;
const OUTPUT_GAIN_AT: usize = 16;
const MAPPING_FAMILY_AT: usize = 18;
const STREAM_COUNT_AT: usize = 19;
const COUPLED_COUNT_AT: usize = 20;
const CHANNEL_MAPPING_AT: usize = 21;
/// MP4's `dOps` box is version 0; Ogg's header is version 1, and a version whose upper 4 bits
/// aren't 0 changes the header in ways a player can't read (RFC 7845, 5.1).
const DOPS_VERSION: u8 = 0;
const INCOMPATIBLE_VERSIONS: u8 = 0xF0;

/// Mono and stereo, in one stream.
const SINGLE_STREAM_FAMILY: u8 = 0;
/// Up to 8 channels in Vorbis order, in several streams.
const SURROUND_FAMILY: u8 = 1;

/// The fields of the identification header the codec needs.
#[derive(Debug, PartialEq)]
struct OpusHeader {
    channels: u8,
    /// The gain to apply to the output, in 1/256 dB, which RFC 7845 says players must apply.
    output_gain_q8: i16,
    mapping_family: u8,
    /// How the surround family's streams make its channels: their count, how many of them are
    /// coupled stereo pairs, and the stream channel each output channel plays.
    streams: Option<StreamTable>,
}

#[derive(Debug, PartialEq)]
struct StreamTable {
    stream_count: u8,
    coupled_count: u8,
    mapping: Vec<u8>,
}

impl OpusHeader {
    /// Reads the header symphonia hands over as the track's extra data: Ogg's `OpusHead` packet,
    /// whose fields are little-endian, or MP4's `dOps` box after the magic, whose fields are
    /// big-endian. `None` when it isn't one, or is a version that can't be read.
    fn read(extra_data: &[u8]) -> Option<Self> {
        let is_mp4 = match *extra_data.get(VERSION_AT)? {
            DOPS_VERSION => true,
            version if version & INCOMPATIBLE_VERSIONS == 0 => false,
            _ => return None,
        };
        if !extra_data.starts_with(HEAD_MAGIC) {
            return None;
        }
        let gain = extra_data.get(OUTPUT_GAIN_AT..OUTPUT_GAIN_AT + 2)?;
        let gain = [gain[0], gain[1]];
        let output_gain_q8 = if is_mp4 {
            i16::from_be_bytes(gain)
        } else {
            i16::from_le_bytes(gain)
        };
        let channels = *extra_data.get(CHANNELS_AT)?;
        let mapping_family = *extra_data.get(MAPPING_FAMILY_AT)?;
        let streams = if mapping_family == SINGLE_STREAM_FAMILY {
            None
        } else {
            let mapping_end = CHANNEL_MAPPING_AT + usize::from(channels);
            Some(StreamTable {
                stream_count: *extra_data.get(STREAM_COUNT_AT)?,
                coupled_count: *extra_data.get(COUPLED_COUNT_AT)?,
                mapping: extra_data.get(CHANNEL_MAPPING_AT..mapping_end)?.to_vec(),
            })
        };
        Some(Self {
            channels,
            output_gain_q8,
            mapping_family,
            streams,
        })
    }
}

/// opus-pure's decoder of the song's streams. A single stream's decoder holds its state inline,
/// about 10 KB, which a box keeps out of the codec.
enum StreamDecoder {
    Single(Box<OpusDecoder>),
    Surround(OpusMSDecoder),
}

impl StreamDecoder {
    /// The decoder for `header`'s channels, applying its output gain. `None` for a family or a
    /// stream table opus-pure doesn't decode: it decodes the surround family only in the
    /// streams Vorbis's order implies, the ones every encoder writes.
    fn for_header(header: &OpusHeader) -> Option<Self> {
        let channels = usize::from(header.channels);
        let gain_q8 = i32::from(header.output_gain_q8);
        match (header.mapping_family, &header.streams) {
            (SINGLE_STREAM_FAMILY, None) if (1..=2).contains(&channels) => {
                let mut decoder = OpusDecoder::new(OPUS_RATE as i32, channels).ok()?;
                decoder.gain_q8 = gain_q8;
                Some(Self::Single(Box::new(decoder)))
            }
            (SURROUND_FAMILY, Some(table)) if is_vorbis_table(table, channels) => {
                let mut decoder =
                    OpusMSDecoder::new(OPUS_RATE as i32, channels, SURROUND_FAMILY).ok()?;
                // Each stream decodes its own channels, so each applies the gain.
                for stream in decoder.streams_mut() {
                    stream.gain_q8 = gain_q8;
                }
                Some(Self::Surround(decoder))
            }
            _ => None,
        }
    }

    fn decode(&mut self, packet: &[u8], output: &mut [f32]) -> opus_pure::Result<usize> {
        match self {
            Self::Single(decoder) => decoder.decode(packet, MAX_PACKET_SAMPLES, output),
            Self::Surround(decoder) => decoder.decode(packet, MAX_PACKET_SAMPLES, output),
        }
    }

    fn reset(&mut self) -> opus_pure::Result<()> {
        match self {
            Self::Single(decoder) => decoder.reset_state(),
            Self::Surround(decoder) => decoder.reset_state(),
        }
    }
}

fn is_vorbis_table(table: &StreamTable, channels: usize) -> bool {
    StreamLayout::surround(channels, SURROUND_FAMILY).is_ok_and(|layout| {
        usize::from(table.stream_count) == layout.nb_streams
            && usize::from(table.coupled_count) == layout.nb_coupled_streams
            && table.mapping == layout.mapping
    })
}

/// Where Vorbis order's channels play, for each channel count: their positions, and the plane
/// each one takes in WAVE order, the order of the positions' bits (Vorbis I, 4.3.9).
fn vorbis_layout(channels: usize) -> Option<(Position, &'static [usize])> {
    const FRONT: Position = Position::FRONT_LEFT.union(Position::FRONT_RIGHT);
    const REAR: Position = Position::REAR_LEFT.union(Position::REAR_RIGHT);
    const SIDE: Position = Position::SIDE_LEFT.union(Position::SIDE_RIGHT);
    const CENTER: Position = Position::FRONT_CENTER;
    const LFE: Position = Position::LFE1;
    let layout: (Position, &'static [usize]) = match channels {
        1 => (Position::FRONT_LEFT, &[0]),
        // Left, right.
        2 => (FRONT, &[0, 1]),
        // Left, center, right.
        3 => (FRONT.union(CENTER), &[0, 2, 1]),
        // Front left, front right, rear left, rear right.
        4 => (FRONT.union(REAR), &[0, 1, 2, 3]),
        // Front left, center, front right, rear left, rear right.
        5 => (FRONT.union(CENTER).union(REAR), &[0, 2, 1, 3, 4]),
        // 5.1: front left, center, front right, rear left, rear right, LFE.
        6 => (
            FRONT.union(CENTER).union(REAR).union(LFE),
            &[0, 2, 1, 4, 5, 3],
        ),
        // 6.1: front left, center, front right, side left, side right, rear center, LFE.
        7 => (
            FRONT
                .union(CENTER)
                .union(LFE)
                .union(Position::REAR_CENTER)
                .union(SIDE),
            &[0, 2, 1, 5, 6, 4, 3],
        ),
        // 7.1: front left, center, front right, side left, side right, rear left, rear right,
        // LFE.
        8 => (
            FRONT.union(CENTER).union(LFE).union(REAR).union(SIDE),
            &[0, 2, 1, 6, 7, 4, 5, 3],
        ),
        _ => return None,
    };
    Some(layout)
}

/// Decodes an Opus track's packets, with opus-pure, into its channels in WAVE order.
pub(super) struct OpusCodec {
    params: AudioCodecParameters,
    decoder: StreamDecoder,
    /// For each channel the decoder gives, in Vorbis order, its plane in the buffer.
    planes: &'static [usize],
    /// Whether to cut the frames a packet's trims mark, like symphonia's decoders.
    is_gapless: bool,
    /// The last packet's frames, interleaved as the decoder gives them.
    decoded: Vec<f32>,
    buffer: AudioBuffer<f32>,
}

impl OpusCodec {
    fn try_new(params: &AudioCodecParameters, options: &AudioDecoderOptions) -> MediaResult<Self> {
        let unsupported = |reason| Err(MediaError::Unsupported(reason));
        if params.codec != CODEC_ID_OPUS {
            return unsupported("opus: not an opus track");
        }
        let Some(header) = params.extra_data.as_deref().and_then(OpusHeader::read) else {
            return unsupported("opus: no identification header it can read");
        };
        let channels = usize::from(header.channels);
        let Some((positions, planes)) = vorbis_layout(channels) else {
            return unsupported("opus: more channels than vorbis order places");
        };
        let Some(decoder) = StreamDecoder::for_header(&header) else {
            return unsupported("opus: a channel mapping opus-pure doesn't decode");
        };
        let spec = AudioSpec::new(OPUS_RATE, Channels::Positioned(positions));
        Ok(Self {
            params: params.clone(),
            decoder,
            planes,
            is_gapless: options.gapless,
            decoded: vec![0.0; MAX_PACKET_SAMPLES * channels],
            buffer: AudioBuffer::new(spec, MAX_PACKET_SAMPLES),
        })
    }

    fn decode_packet(&mut self, packet: &PacketRef<'_>) -> MediaResult<()> {
        self.buffer.clear();
        let frames = self
            .decoder
            .decode(packet.data, &mut self.decoded)
            .map_err(|_| MediaError::DecodeError("opus: damaged packet"))?;
        self.buffer.render_uninit(Some(frames));
        let channels = self.planes.len();
        for (channel, &plane) in self.planes.iter().enumerate() {
            let Some(samples) = self.buffer.plane_mut(plane) else {
                return Err(MediaError::DecodeError("opus: missing audio plane"));
            };
            let decoded = self.decoded.iter().skip(channel).step_by(channels);
            for (sample, &decoded) in samples.iter_mut().zip(decoded) {
                *sample = decoded;
            }
        }
        if self.is_gapless {
            self.buffer.trim(
                packet.trim_start.get() as usize,
                packet.trim_end.get() as usize,
            );
        }
        Ok(())
    }
}

impl AudioDecoder for OpusCodec {
    fn reset(&mut self) {
        // A reset that fails leaves the old state, whose first frames the decoder drops anyway:
        // a seek decodes from before its target.
        let _ = self.decoder.reset();
    }

    fn codec_info(&self) -> &CodecInfo {
        &SUPPORTED_CODECS[0].info
    }

    fn codec_params(&self) -> &AudioCodecParameters {
        &self.params
    }

    fn decode_ref(&mut self, packet: &PacketRef<'_>) -> MediaResult<GenericAudioBufferRef<'_>> {
        if let Err(error) = self.decode_packet(packet) {
            self.buffer.clear();
            return Err(error);
        }
        Ok(self.buffer.as_generic_audio_buffer_ref())
    }

    fn finalize(&mut self) -> FinalizeResult {
        FinalizeResult::default()
    }

    fn last_decoded(&self) -> GenericAudioBufferRef<'_> {
        self.buffer.as_generic_audio_buffer_ref()
    }
}

impl RegisterableAudioDecoder for OpusCodec {
    fn try_registry_new(
        params: &AudioCodecParameters,
        options: &AudioDecoderOptions,
    ) -> MediaResult<Box<dyn AudioDecoder>> {
        Ok(Box::new(Self::try_new(params, options)?))
    }

    fn supported_codecs() -> &'static [SupportedAudioCodec] {
        SUPPORTED_CODECS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An identification header of version `version`, whose fields after the magic are `fields`.
    fn header(version: u8, fields: &[u8]) -> Vec<u8> {
        [HEAD_MAGIC.as_slice(), &[version], fields].concat()
    }

    fn params_with(extra_data: Vec<u8>) -> AudioCodecParameters {
        let mut params = AudioCodecParameters::new();
        params
            .for_codec(CODEC_ID_OPUS)
            .with_extra_data(extra_data.into_boxed_slice());
        params
    }

    #[test]
    fn reads_the_fields_of_an_ogg_header_little_endian() {
        // 2 channels, a pre-skip of 312, 44.1 kHz in, a gain of 1 dB, family 0.
        let fields = [2, 0x38, 0x01, 0x44, 0xAC, 0x00, 0x00, 0x00, 0x01, 0];

        let read = OpusHeader::read(&header(1, &fields));

        assert_eq!(
            read,
            Some(OpusHeader {
                channels: 2,
                output_gain_q8: 256,
                mapping_family: 0,
                streams: None,
            })
        );
    }

    #[test]
    fn reads_the_fields_of_an_mp4_dops_box_big_endian() {
        // The same fields, in dOps's byte order, after the version 0 it has.
        let fields = [2, 0x01, 0x38, 0x00, 0x00, 0xAC, 0x44, 0x01, 0x00, 0];

        let read = OpusHeader::read(&header(0, &fields));

        assert_eq!(read.map(|header| header.output_gain_q8), Some(256));
    }

    #[test]
    fn reads_the_stream_table_of_a_surround_header() {
        // 5.1 in four streams, two of them coupled.
        let fields = [
            6, 0x38, 0x01, 0x80, 0xBB, 0x00, 0x00, 0x00, 0x00, 1, 4, 2, 0, 4, 1, 2, 3, 5,
        ];

        let read = OpusHeader::read(&header(1, &fields)).unwrap();

        assert_eq!(
            read.streams,
            Some(StreamTable {
                stream_count: 4,
                coupled_count: 2,
                mapping: vec![0, 4, 1, 2, 3, 5],
            })
        );
        assert!(StreamDecoder::for_header(&read).is_some());
    }

    #[test]
    fn reads_no_header_of_another_major_version_or_cut_short() {
        let fields = [2, 0x38, 0x01, 0x80, 0xBB, 0x00, 0x00, 0x00, 0x00, 0];

        assert_eq!(OpusHeader::read(&header(0x10, &fields)), None);
        assert_eq!(OpusHeader::read(&header(1, &fields[..6])), None);
        assert_eq!(OpusHeader::read(b"OpusTags\x01\x02"), None);
    }

    #[test]
    fn refuses_the_channel_mappings_opus_pure_doesnt_decode() {
        let rate = [0x80, 0xBB, 0x00, 0x00];
        let mappings: [&[u8]; 3] = [
            // Family 255: channels without a place.
            &[
                3, 0x38, 0x01, rate[0], rate[1], rate[2], rate[3], 0, 0, 255, 3, 0, 0, 1, 2,
            ],
            // Family 1 in other streams than Vorbis order implies: every channel alone.
            &[
                2, 0x38, 0x01, rate[0], rate[1], rate[2], rate[3], 0, 0, 1, 2, 0, 0, 1,
            ],
            // Family 0 holds only mono and stereo.
            &[3, 0x38, 0x01, rate[0], rate[1], rate[2], rate[3], 0, 0, 0],
        ];

        for fields in mappings {
            let result = OpusCodec::try_new(
                &params_with(header(1, fields)),
                &AudioDecoderOptions::default(),
            );

            assert!(
                matches!(result, Err(MediaError::Unsupported(_))),
                "{fields:?}"
            );
        }
    }
}
