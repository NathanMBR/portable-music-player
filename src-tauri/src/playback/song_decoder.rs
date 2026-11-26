use std::{
    ffi::OsStr,
    io,
    path::Path,
    sync::{Arc, LazyLock},
    time::Duration,
};

use lofty::{config::ParseOptions, file::AudioFile, probe::Probe};
use symphonia::core::{
    audio::{ChannelLabel, Channels, Position},
    codecs::{
        CodecParameters,
        audio::{AudioCodecParameters, AudioDecoder, AudioDecoderOptions},
        registry::CodecRegistry,
    },
    errors::Error as MediaError,
    formats::{FormatOptions, FormatReader, SeekMode, SeekTo, Track, TrackFlags, probe::Hint},
    io::{MediaSource, MediaSourceStream, MediaSourceStreamOptions},
    meta::MetadataOptions,
    packet::Packet,
    units::{TimeBase, Timestamp},
};
use tauri_plugin_log::log;

use super::{
    PlaybackError,
    channel_mix::{ChannelLayout, MAX_CHANNELS, Speaker},
    song_bytes::{SongBytes, SongReader},
};

/// The decoders of every codec symphonia's features enable.
static CODECS: LazyLock<CodecRegistry> = LazyLock::new(|| {
    let mut codecs = CodecRegistry::new();
    symphonia::default::register_enabled_codecs(&mut codecs);
    codecs
});

/// Packets that fail to decode one after the other before the rest of the song counts as damaged:
/// a damaged file would otherwise be read to its end without a sound.
const MAX_FAILED_PACKETS: u32 = 64;
/// How far before a seek's target decoding starts again, the frames before the target then
/// dropped: the warm-up a codec needs to decode the target's frames right. RFC 7845 asks 80 ms for
/// Opus, which covers the overlap of MP3, AAC and Vorbis too.
const SEEK_PREROLL: Duration = Duration::from_millis(80);

/// A song's decoder, which hands out its samples interleaved as `f32`: only its audio track's,
/// without the silence its encoder added at its start and end, so songs follow each other without
/// a gap, and from the exact frame a seek asks for.
pub(super) struct SongDecoder {
    bytes: Arc<SongBytes>,
    track_path: String,
    demuxer: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    params: AudioCodecParameters,
    track: TrackTiming,
    playable: Playable,
    /// The song's length when its file says only roughly, like an MP3 without an Info frame.
    estimated_duration: Option<Duration>,
    /// Where its channels play, from its first decoded frames.
    layout: ChannelLayout,
    /// The decoded samples not handed out yet, and the next of them.
    samples: Vec<f32>,
    next_sample: usize,
    /// The song's first frame to hand out: its start, or where it was sought.
    first_frame: u64,
    /// Where a seek the demuxer couldn't make lands, once the song is read again from its start:
    /// the packets that end before it are skipped without being decoded.
    skip_packets_before: Option<i64>,
    failed_packets: u32,
    has_ended: bool,
}

/// How a track counts time: in its time base's ticks, which aren't always the frames of its rate.
#[derive(Clone, Copy)]
struct TrackTiming {
    id: u32,
    sample_rate: u32,
    time_base: TimeBase,
    start_ts: i64,
}

/// The part of a track that's the song: past the silence its encoder added, in the cases symphonia
/// doesn't cut it on its own.
#[derive(Clone, Copy)]
struct Playable {
    /// The timestamp of the song's first frame.
    start_ts: i64,
    /// The song's frames, when its container says exactly where it ends.
    frames: Option<u64>,
}

impl SongDecoder {
    /// Opens the song `bytes` holds and decodes its first frames, which tell its channels.
    pub(super) fn open(bytes: Arc<SongBytes>, track_path: &str) -> Result<Self, PlaybackError> {
        let undecodable = || PlaybackError::Decode {
            path: track_path.to_owned(),
        };
        let demuxer = demuxer_of(&bytes, track_path).map_err(|_| undecodable())?;
        let track = audio_track(demuxer.as_ref()).ok_or_else(undecodable)?;
        let Some(CodecParameters::Audio(params)) = &track.codec_params else {
            return Err(undecodable());
        };
        let params = params.clone();
        let sample_rate = params
            .sample_rate
            .filter(|rate| *rate > 0)
            .ok_or_else(undecodable)?;
        let timing = TrackTiming {
            id: track.id,
            sample_rate,
            time_base: track
                .time_base
                .or_else(|| TimeBase::try_from_recip(sample_rate))
                .ok_or_else(undecodable)?,
            start_ts: track.start_ts.get(),
        };
        let playable = Playable {
            start_ts: 0,
            frames: None,
        };
        let decoder = new_decoder(&params).map_err(|_| undecodable())?;
        let mut song = Self {
            bytes,
            track_path: track_path.to_owned(),
            demuxer,
            decoder,
            params,
            track: timing,
            playable,
            estimated_duration: None,
            layout: ChannelLayout::unpositioned(0),
            samples: Vec::new(),
            next_sample: 0,
            first_frame: 0,
            skip_packets_before: None,
            failed_packets: 0,
            has_ended: false,
        };
        // A song of more channels than the mix places would lose some of them.
        if !song.decode_next() || usize::from(song.channels()) > MAX_CHANNELS {
            return Err(undecodable());
        }
        if song.exact_duration().is_none() {
            song.estimated_duration = estimated_duration(&song.bytes);
        }
        Ok(song)
    }

    pub(super) fn sample_rate(&self) -> u32 {
        self.track.sample_rate
    }

    pub(super) fn channels(&self) -> u16 {
        self.layout.count()
    }

    pub(super) fn layout(&self) -> ChannelLayout {
        self.layout
    }

    /// The song's length, without its encoder's silence: as its file says, else estimated. `None`
    /// when neither tells.
    pub(super) fn duration(&self) -> Option<Duration> {
        self.exact_duration().or(self.estimated_duration)
    }

    fn exact_duration(&self) -> Option<Duration> {
        let track = self
            .demuxer
            .tracks()
            .iter()
            .find(|track| track.id == self.track.id)?;
        let frames = self.playable.frames.or(track.num_frames).or_else(|| {
            let duration = i64::try_from(track.duration?.get()).ok()?;
            u64::try_from(self.track.frames_of(duration)).ok()
        })?;
        Some(Duration::from_secs_f64(
            frames as f64 / f64::from(self.track.sample_rate),
        ))
    }

    /// Goes on from `position` of the song: from just before it, so the codec warms up, and drops
    /// the frames before it. When the demuxer can't seek, the song is read again from its start.
    pub(super) fn seek(&mut self, position: Duration) -> Result<(), MediaError> {
        let frame = self.track.frame_at(position);
        self.first_frame = frame;
        self.samples.clear();
        self.next_sample = 0;
        self.skip_packets_before = None;
        self.failed_packets = 0;
        self.has_ended = false;
        let preroll = self.track.frame_at(SEEK_PREROLL);
        let seek_ts = (self.playable.start_ts
            + self.track.ts_of(frame.saturating_sub(preroll) as i64))
        .max(self.track.start_ts);
        let sought = self.demuxer.seek(
            SeekMode::Accurate,
            SeekTo::Timestamp {
                ts: Timestamp::new(seek_ts),
                track_id: self.track.id,
            },
        );
        match sought {
            Ok(_) => self.decoder.reset(),
            Err(_) => {
                self.demuxer = demuxer_of(&self.bytes, &self.track_path)?;
                self.decoder = new_decoder(&self.params)?;
                self.skip_packets_before = Some(seek_ts);
            }
        }
        Ok(())
    }

    /// Decodes packets until some of their frames are the song's to hand out. `false` once it has
    /// none left.
    fn decode_next(&mut self) -> bool {
        self.samples.clear();
        self.next_sample = 0;
        while !self.has_ended {
            match self.demuxer.next_packet() {
                Ok(Some(packet)) => {
                    if self.decode(&packet) {
                        return true;
                    }
                }
                Ok(None) => self.has_ended = true,
                Err(error) => self.end_on(&error),
            }
        }
        false
    }

    /// Decodes `packet` when it's the song's, keeping its playable frames. Whether any are left.
    fn decode(&mut self, packet: &Packet) -> bool {
        if packet.track_id != self.track.id || self.is_skipped(packet) {
            return false;
        }
        let first_ts = packet.pts.get() + packet.trim_start.get() as i64;
        let decoded = match self.decoder.decode(packet) {
            Ok(buffer) if buffer.frames() == 0 => Decoded::Nothing,
            Ok(buffer) => {
                buffer.copy_to_vec_interleaved(&mut self.samples);
                Decoded::Frames {
                    layout: layout_of(buffer.spec().channels()),
                }
            }
            Err(MediaError::DecodeError(_) | MediaError::IoError(_)) => Decoded::Damaged,
            Err(MediaError::ResetRequired) => Decoded::ResetRequired,
            Err(error) => Decoded::Failed(error),
        };
        let layout = match decoded {
            Decoded::Frames { layout } => layout,
            Decoded::Nothing => {
                self.failed_packets = 0;
                return false;
            }
            Decoded::Damaged => {
                self.count_failed_packet();
                return false;
            }
            Decoded::ResetRequired => {
                match new_decoder(&self.params) {
                    Ok(decoder) => self.decoder = decoder,
                    Err(error) => self.end_on(&error),
                }
                return false;
            }
            Decoded::Failed(error) => {
                self.end_on(&error);
                return false;
            }
        };
        self.failed_packets = 0;
        if self.layout.count() == 0 {
            self.layout = layout;
        }
        if layout.count() != self.layout.count() {
            // A song's samples interleave the same channels from start to end.
            self.samples.clear();
            return false;
        }
        self.keep_playable(first_ts);
        !self.samples.is_empty()
    }

    fn is_skipped(&mut self, packet: &Packet) -> bool {
        let Some(skip_before) = self.skip_packets_before else {
            return false;
        };
        let end_ts = packet.pts.get() + (packet.trim_start.get() + packet.dur.get()) as i64;
        if end_ts <= skip_before {
            return true;
        }
        self.skip_packets_before = None;
        false
    }

    /// Keeps of the decoded samples, which start at `first_ts`, the frames from the first one to
    /// hand out to the song's end.
    fn keep_playable(&mut self, first_ts: i64) {
        let channels = usize::from(self.layout.count());
        let frames = (self.samples.len() / channels) as i64;
        let first = self.track.frames_of(first_ts - self.playable.start_ts);
        let end = first + frames;
        let keep_from = first.max(self.first_frame as i64);
        let keep_to = self
            .playable
            .frames
            .map_or(end, |song_frames| end.min(song_frames as i64));
        if self
            .playable
            .frames
            .is_some_and(|song_frames| end >= song_frames as i64)
        {
            self.has_ended = true;
        }
        if keep_to <= keep_from {
            self.samples.clear();
            return;
        }
        self.samples.truncate((keep_to - first) as usize * channels);
        self.samples
            .drain(..(keep_from - first) as usize * channels);
    }

    fn count_failed_packet(&mut self) {
        self.failed_packets += 1;
        if self.failed_packets >= MAX_FAILED_PACKETS {
            log::warn!(
                "Couldn't decode the rest of {}: {MAX_FAILED_PACKETS} parts in a row are damaged",
                self.track_path
            );
            self.has_ended = true;
        }
    }

    /// Ends the song where a read of its file failed. Its end comes as an early end of the file
    /// when the file was cut short.
    fn end_on(&mut self, error: &MediaError) {
        let is_cut_short = matches!(error, MediaError::IoError(error) if error.kind() == io::ErrorKind::UnexpectedEof);
        if !is_cut_short {
            log::warn!("Couldn't read the rest of {}: {error}", self.track_path);
        }
        self.has_ended = true;
    }
}

/// What decoding a packet gave.
enum Decoded {
    Frames {
        layout: ChannelLayout,
    },
    /// No frames, like Vorbis's first packet after a seek.
    Nothing,
    /// A packet that couldn't be decoded, which is skipped.
    Damaged,
    /// The stream changed: the decoder must be made again.
    ResetRequired,
    Failed(MediaError),
}

impl Iterator for SongDecoder {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        loop {
            if let Some(&sample) = self.samples.get(self.next_sample) {
                self.next_sample += 1;
                return Some(sample);
            }
            if !self.decode_next() {
                return None;
            }
        }
    }
}

impl TrackTiming {
    /// The frames of `ts` ticks of the track's time base.
    fn frames_of(&self, ts: i64) -> i64 {
        let frames =
            i128::from(ts) * i128::from(self.sample_rate) * i128::from(self.time_base.numer.get());
        frames.div_euclid(i128::from(self.time_base.denom.get())) as i64
    }

    /// The ticks of the track's time base that `frames` last.
    fn ts_of(&self, frames: i64) -> i64 {
        let ts = i128::from(frames) * i128::from(self.time_base.denom.get());
        ts.div_euclid(i128::from(self.sample_rate) * i128::from(self.time_base.numer.get())) as i64
    }

    fn frame_at(&self, position: Duration) -> u64 {
        (position.as_secs_f64() * f64::from(self.sample_rate)).round() as u64
    }
}

fn demuxer_of(
    bytes: &Arc<SongBytes>,
    track_path: &str,
) -> Result<Box<dyn FormatReader>, MediaError> {
    let source = MediaSourceStream::new(
        Box::new(bytes.reader()),
        MediaSourceStreamOptions::default(),
    );
    let mut hint = Hint::new();
    if let Some(extension) = Path::new(track_path).extension().and_then(OsStr::to_str) {
        hint.with_extension(extension);
    }
    symphonia::default::get_probe().probe(
        &hint,
        source,
        FormatOptions::default(),
        MetadataOptions::default(),
    )
}

/// Where the channels symphonia describes play, in the order they interleave: positioned
/// channels come in WAVE order, the order of their bits.
fn layout_of(channels: &Channels) -> ChannelLayout {
    let count = u16::try_from(channels.count()).unwrap_or(u16::MAX);
    match channels {
        Channels::Positioned(positions) => {
            ChannelLayout::with_places(count, positions.iter().map(speaker_at))
        }
        Channels::Custom(labels) => ChannelLayout::with_places(
            count,
            labels.iter().map(|label| match label {
                ChannelLabel::Positioned(position) => speaker_at(*position),
                _ => None,
            }),
        ),
        _ => ChannelLayout::unpositioned(count),
    }
}

/// The speaker of a single position, `None` for one the mix doesn't place, like a height channel.
fn speaker_at(position: Position) -> Option<Speaker> {
    const SPEAKERS: [(Position, Speaker); 11] = [
        (Position::FRONT_LEFT, Speaker::FrontLeft),
        (Position::FRONT_RIGHT, Speaker::FrontRight),
        (Position::FRONT_CENTER, Speaker::FrontCenter),
        (Position::LFE1, Speaker::Lfe),
        (Position::REAR_LEFT, Speaker::BackLeft),
        (Position::REAR_RIGHT, Speaker::BackRight),
        (Position::FRONT_LEFT_CENTER, Speaker::FrontLeftOfCenter),
        (Position::FRONT_RIGHT_CENTER, Speaker::FrontRightOfCenter),
        (Position::REAR_CENTER, Speaker::BackCenter),
        (Position::SIDE_LEFT, Speaker::SideLeft),
        (Position::SIDE_RIGHT, Speaker::SideRight),
    ];
    SPEAKERS
        .iter()
        .find(|(known, _)| *known == position)
        .map(|(_, speaker)| *speaker)
}

/// lofty's estimate of a song's length, from its audio's bytes and bitrate, for a file that doesn't
/// say it, like a constant-bitrate MP3 without an Info frame.
fn estimated_duration(bytes: &Arc<SongBytes>) -> Option<Duration> {
    let properties_only = ParseOptions::new()
        .read_tags(false)
        .read_cover_art(false)
        .read_properties(true);
    let song = Probe::new(bytes.reader())
        .guess_file_type()
        .ok()?
        .options(properties_only)
        .read()
        .ok()?;
    Some(song.properties().duration()).filter(|duration| !duration.is_zero())
}

/// The audio track to play: the one the file flags as its default among those a codec can decode,
/// else the first of them. Other tracks are never decoded.
fn audio_track(demuxer: &dyn FormatReader) -> Option<&Track> {
    let is_decodable = |track: &&Track| {
        matches!(
            &track.codec_params,
            Some(CodecParameters::Audio(params)) if CODECS.get_audio_decoder(params.codec).is_some()
        )
    };
    let tracks = demuxer.tracks();
    tracks
        .iter()
        .filter(is_decodable)
        .find(|track| track.flags.contains(TrackFlags::DEFAULT))
        .or_else(|| tracks.iter().find(is_decodable))
}

/// A decoder that cuts the frames the packets mark as the encoder's silence.
fn new_decoder(params: &AudioCodecParameters) -> Result<Box<dyn AudioDecoder>, MediaError> {
    CODECS.make_audio_decoder(params, &AudioDecoderOptions::default().gapless(true))
}

impl MediaSource for SongReader {
    fn is_seekable(&self) -> bool {
        true
    }

    fn byte_len(&self) -> Option<u64> {
        Some(self.length())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playback::channel_mix::Speaker;
    use crate::test_media::{Signal, WavEncoding, flac_song, samples_of, wav_song};
    use crate::test_songs::{
        CHANNELS, SAMPLE_RATE, SAMPLES_PER_FRAME, damaged_frames, gapless_audio, root_with_songs,
        silent_frames,
    };

    fn decoder_of_song(file_name: &str, contents: &[u8]) -> Result<SongDecoder, PlaybackError> {
        let root = root_with_songs(&[(file_name, contents)]);
        let track_path = format!("Songs/{file_name}");
        let bytes = SongBytes::open(root.path(), &track_path).unwrap();
        SongDecoder::open(bytes, &track_path)
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

        assert_eq!(decoder.sample_rate(), SAMPLE_RATE);
        assert_eq!(decoder.channels(), CHANNELS);
        let expected_duration = f64::from(expected_frames) / f64::from(SAMPLE_RATE);
        let duration = decoder.duration().unwrap().as_secs_f64();
        assert!((duration - expected_duration).abs() < 1e-6, "{duration}");
        assert_eq!(frames_of(decoder), expected_frames as usize);
    }

    #[test]
    fn keeps_every_sample_of_a_song_without_gapless_info() {
        let decoder = decoder_of_song("Fairy Tale.mp3", &silent_frames(10)).unwrap();

        assert_eq!(frames_of(decoder), (10 * SAMPLES_PER_FRAME) as usize);
    }

    #[test]
    fn tells_the_length_of_a_song_without_gapless_info() {
        let decoder = decoder_of_song("Light My Way.mp3", &silent_frames(10)).unwrap();

        let expected = f64::from(10 * SAMPLES_PER_FRAME) / f64::from(SAMPLE_RATE);
        let duration = decoder.duration().unwrap().as_secs_f64();
        assert!((duration - expected).abs() < 1e-3, "{duration}");
    }

    #[test]
    fn seeks_to_the_exact_frame() {
        let song = gapless_audio(20, 576, 1216);
        let song_frames = u64::from(20 * SAMPLES_PER_FRAME - 576 - 1216);

        for frame in [0, 1, 1151, 1152, 5000, song_frames - 1] {
            let mut decoder = decoder_of_song("Darts.mp3", &song).unwrap();
            let position = Duration::from_secs_f64(frame as f64 / f64::from(SAMPLE_RATE));

            decoder.seek(position).unwrap();

            assert_eq!(
                frames_of(decoder) as u64,
                song_frames - frame,
                "from {frame}"
            );
        }
    }

    #[test]
    fn skips_the_damaged_parts_of_a_song() {
        let song = [silent_frames(3), damaged_frames(10), silent_frames(3)].concat();

        let decoder = decoder_of_song("Dreaming.mp3", &song).unwrap();

        assert_eq!(frames_of(decoder), (6 * SAMPLES_PER_FRAME) as usize);
    }

    #[test]
    fn stops_reading_a_song_whose_parts_keep_failing() {
        let song = [silent_frames(3), damaged_frames(2000)].concat();
        let root = root_with_songs(&[("Blackened.mp3", &song)]);
        let bytes = SongBytes::open(root.path(), "Songs/Blackened.mp3").unwrap();
        let decoder = SongDecoder::open(Arc::clone(&bytes), "Songs/Blackened.mp3").unwrap();

        assert_eq!(frames_of(decoder), (3 * SAMPLES_PER_FRAME) as usize);
        assert!(
            bytes.loaded_length() < song.len() / 2,
            "read {}",
            bytes.loaded_length()
        );
    }

    /// A few seconds' fraction of stereo at 44.1 kHz, over several FLAC frames.
    const STEREO_SIGNAL: Signal = Signal {
        sample_rate: SAMPLE_RATE,
        channels: 2,
        frames: 10_000,
    };

    #[test]
    fn plays_every_frame_of_flac_and_wav_songs() {
        let songs = [
            ("Paradise.flac", flac_song(16, STEREO_SIGNAL)),
            ("Phantom Lord.flac", flac_song(24, STEREO_SIGNAL)),
            (
                "Run Boy Run.wav",
                wav_song(WavEncoding::Pcm16, STEREO_SIGNAL),
            ),
            (
                "The Shaman.wav",
                wav_song(WavEncoding::Pcm24, STEREO_SIGNAL),
            ),
            (
                "Carry On.wave",
                wav_song(WavEncoding::Float32, STEREO_SIGNAL),
            ),
        ];

        for (file_name, song) in songs {
            let decoder = decoder_of_song(file_name, &song).unwrap();

            assert_eq!(decoder.sample_rate(), SAMPLE_RATE, "{file_name}");
            assert_eq!(decoder.channels(), 2, "{file_name}");
            let expected_duration =
                f64::from(STEREO_SIGNAL.frames) / f64::from(STEREO_SIGNAL.sample_rate);
            let duration = decoder.duration().unwrap().as_secs_f64();
            assert!(
                (duration - expected_duration).abs() < 1e-6,
                "{file_name}: {duration}"
            );
            let samples: Vec<f32> = decoder.collect();
            assert!(samples == samples_of(STEREO_SIGNAL), "{file_name}");
        }
    }

    #[test]
    fn seeks_to_the_exact_frame_of_a_flac_song() {
        let song = flac_song(16, STEREO_SIGNAL);

        for frame in [0, 1, 4095, 4096, 7000, STEREO_SIGNAL.frames - 1] {
            let mut decoder = decoder_of_song("Jet Pilot.flac", &song).unwrap();
            let position = Duration::from_secs_f64(f64::from(frame) / f64::from(SAMPLE_RATE));

            decoder.seek(position).unwrap();

            let samples: Vec<f32> = decoder.collect();
            let expected = &samples_of(STEREO_SIGNAL)[frame as usize * 2..];
            assert!(samples == expected, "from {frame}");
        }
    }

    #[test]
    fn places_the_channels_of_a_surround_wav() {
        let surround = Signal {
            channels: 6,
            ..STEREO_SIGNAL
        };

        let decoder =
            decoder_of_song("Orion.wav", &wav_song(WavEncoding::Pcm16, surround)).unwrap();

        assert_eq!(decoder.layout(), ChannelLayout::standard(6));
    }

    #[test]
    fn refuses_a_song_of_more_than_eight_channels() {
        let nine_channels = Signal {
            channels: 9,
            ..STEREO_SIGNAL
        };

        let result = decoder_of_song("Ronnie.wav", &wav_song(WavEncoding::Pcm16, nine_channels));

        assert!(matches!(
            result,
            Err(PlaybackError::Decode { path }) if path == "Songs/Ronnie.wav"
        ));
    }

    #[test]
    fn places_the_channels_where_the_file_says() {
        let surround = Position::FRONT_LEFT
            | Position::FRONT_RIGHT
            | Position::FRONT_CENTER
            | Position::LFE1
            | Position::REAR_LEFT
            | Position::REAR_RIGHT;
        let with_height = Position::FRONT_LEFT | Position::FRONT_RIGHT | Position::TOP_CENTER;
        let labelled = Channels::Custom(Box::new([
            ChannelLabel::Positioned(Position::FRONT_LEFT),
            ChannelLabel::Positioned(Position::FRONT_RIGHT),
            ChannelLabel::Discrete(0),
        ]));

        assert_eq!(
            layout_of(&Channels::Positioned(surround)),
            ChannelLayout::positioned(&[
                Some(Speaker::FrontLeft),
                Some(Speaker::FrontRight),
                Some(Speaker::FrontCenter),
                Some(Speaker::Lfe),
                Some(Speaker::BackLeft),
                Some(Speaker::BackRight),
            ])
        );
        assert_eq!(
            layout_of(&Channels::Positioned(with_height)),
            ChannelLayout::positioned(&[Some(Speaker::FrontLeft), Some(Speaker::FrontRight), None])
        );
        assert_eq!(
            layout_of(&labelled),
            ChannelLayout::positioned(&[Some(Speaker::FrontLeft), Some(Speaker::FrontRight), None])
        );
        assert_eq!(
            layout_of(&Channels::Discrete(3)),
            ChannelLayout::unpositioned(3)
        );
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
