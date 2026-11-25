use std::{
    sync::{
        Arc,
        mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender, TryRecvError, TrySendError},
    },
    thread,
    time::Duration,
};

use rodio::{Decoder, SampleRate, Source, conversions::SampleRateConverter};
use tauri_plugin_log::log;

use super::{
    PlaybackError,
    song_bytes::{SongBytes, SongReader},
};

/// Every song of the library is an MP3: the hint spares the decoder from guessing.
const MP3_EXTENSION: &str = "mp3";
const MP3_MIME_TYPE: &str = "audio/mpeg";
/// The frames of one block: about 23 ms at 44.1 kHz.
pub(super) const BLOCK_FRAMES: usize = 1024;
/// The blocks a feeder decodes ahead of the audio thread: about 1.5 s at 44.1 kHz.
pub(super) const FEED_CAPACITY: usize = 64;
/// Room for every block a feeder can have out at once: the ones in its channel, the one playing,
/// and the one waiting to be sent.
const RECYCLE_CAPACITY: usize = FEED_CAPACITY + 2;
/// How long a feeder with nothing to decode or read waits for a command before looking again.
const FEEDER_WAIT: Duration = Duration::from_millis(5);
const FEEDER_THREAD_NAME: &str = "song-feeder";

/// Decoded samples of a song, interleaved, at the output's rate.
pub(super) struct Block {
    /// Which seek they follow: a block from before the last seek is thrown away.
    pub(super) generation: u32,
    /// The song's frame the block starts at, counted at the output's rate.
    pub(super) start_frame: u64,
    pub(super) samples: Vec<f32>,
}

/// What a feeder sends the audio thread.
pub(super) enum Feed {
    Samples(Block),
    /// The song has no samples left after the last block of this generation.
    End {
        generation: u32,
    },
}

/// The audio thread's end of a feeder: the blocks, and the way back for the ones it played, which
/// the feeder fills again, so the audio thread never frees memory.
pub(super) struct FeedReceiver {
    pub(super) blocks: Receiver<Feed>,
    pub(super) recycle: SyncSender<Vec<f32>>,
    /// The song's channels, which its samples interleave.
    pub(super) channels: u16,
}

enum FeederCommand {
    Decode {
        output_rate: u32,
        blocks: SyncSender<Feed>,
        recycled: Receiver<Vec<f32>>,
    },
    Seek {
        generation: u32,
        position: Duration,
    },
}

/// A song in the player, read and decoded ahead on a thread of its own, so the audio thread only
/// copies samples. Dropping it ends the thread.
pub(super) struct SongFeeder {
    commands: Sender<FeederCommand>,
    format: SongFormat,
}

impl SongFeeder {
    /// Starts reading the song `bytes` holds from `start`, and returns once its decoder has read
    /// its format. It decodes nothing until `decode_at`, but reads the file ahead meanwhile.
    pub(super) fn open(
        bytes: Arc<SongBytes>,
        track_path: &str,
        start: Duration,
    ) -> Result<Self, PlaybackError> {
        let (commands, command_receiver) = mpsc::channel();
        let (opened, opening) = mpsc::sync_channel(1);
        let path = track_path.to_owned();
        thread::Builder::new()
            .name(FEEDER_THREAD_NAME.to_owned())
            .spawn(move || {
                let decoder = match decoder_of(&bytes, &path) {
                    Ok(decoder) => decoder,
                    Err(error) => {
                        // The caller only stops waiting once it hears back.
                        let _ = opened.send(Err(error));
                        return;
                    }
                };
                if opened.send(Ok(SongFormat::of(&decoder))).is_ok() {
                    feed(FeederStart {
                        bytes,
                        path,
                        decoder,
                        start,
                        commands: command_receiver,
                    });
                }
            })
            .map_err(|source| PlaybackError::StartDecoding {
                path: track_path.to_owned(),
                source,
            })?;
        let decoding_failed = || PlaybackError::Decode {
            path: track_path.to_owned(),
        };
        let format = opening.recv().map_err(|_| decoding_failed())??;
        Ok(Self { commands, format })
    }

    pub(super) fn format(&self) -> SongFormat {
        self.format
    }

    /// Starts decoding ahead at the output's sample rate, resampling when it isn't the song's.
    pub(super) fn decode_at(&self, output_rate: u32) -> FeedReceiver {
        let (blocks, block_receiver) = mpsc::sync_channel(FEED_CAPACITY);
        let (recycle, recycled) = mpsc::sync_channel(RECYCLE_CAPACITY);
        // A thread that already ended decodes nothing: the receiver just finds it disconnected.
        let _ = self.commands.send(FeederCommand::Decode {
            output_rate,
            blocks,
            recycled,
        });
        FeedReceiver {
            blocks: block_receiver,
            recycle,
            channels: self.format.channels,
        }
    }

    /// Goes on from `position`, tagging the blocks after it with `generation`.
    pub(super) fn seek(&self, generation: u32, position: Duration) {
        let _ = self.commands.send(FeederCommand::Seek {
            generation,
            position,
        });
    }
}

/// What a feeder's thread starts from, once its decoder has read the song's format.
struct FeederStart {
    bytes: Arc<SongBytes>,
    path: String,
    decoder: SongDecoder,
    start: Duration,
    commands: Receiver<FeederCommand>,
}

/// A feeder's thread: it follows the seeks until it knows the output's rate, then decodes ahead.
fn feed(start: FeederStart) {
    let FeederStart {
        bytes,
        path,
        mut decoder,
        start,
        commands,
    } = start;
    let mut position = start;
    let mut generation = 0;
    if !position.is_zero() {
        seek_decoder(&mut decoder, position, &path);
    }
    let output = loop {
        match wait_for_command(&bytes, &commands) {
            Waited::Command(FeederCommand::Decode {
                output_rate,
                blocks,
                recycled,
            }) => {
                break FeedOutput {
                    rate: output_rate,
                    blocks,
                    recycled,
                };
            }
            Waited::Command(FeederCommand::Seek {
                generation: seek_generation,
                position: seek_position,
            }) => {
                seek_decoder(&mut decoder, seek_position, &path);
                generation = seek_generation;
                position = seek_position;
            }
            Waited::Nothing => {}
            Waited::Stopped => return,
        }
    };
    let channels = usize::from(decoder.channels().get());
    let duration = decoder.total_duration();
    FeederThread {
        next_frame: frame_at(position, duration, output.rate),
        samples: Samples::new(decoder, output.rate),
        bytes,
        path,
        commands,
        output,
        channels,
        duration,
        generation,
        pending: None,
        has_ended: false,
        is_stopped: false,
    }
    .run();
}

/// Where a feeder sends its blocks, and at which rate.
struct FeedOutput {
    rate: u32,
    blocks: SyncSender<Feed>,
    recycled: Receiver<Vec<f32>>,
}

struct FeederThread {
    bytes: Arc<SongBytes>,
    path: String,
    samples: Samples,
    commands: Receiver<FeederCommand>,
    output: FeedOutput,
    channels: usize,
    duration: Option<Duration>,
    generation: u32,
    /// The song's frame the next block starts at, at the output's rate.
    next_frame: u64,
    /// A feed the channel had no room for yet.
    pending: Option<Feed>,
    has_ended: bool,
    is_stopped: bool,
}

impl FeederThread {
    fn run(mut self) {
        loop {
            self.take_commands();
            if self.is_stopped {
                return;
            }
            if self.pending.is_none() && !self.has_ended {
                self.pending = Some(self.next_feed());
            }
            let Some(feed) = self.pending.take() else {
                self.wait();
                continue;
            };
            match self.output.blocks.try_send(feed) {
                Ok(()) => {}
                Err(TrySendError::Full(feed)) => {
                    self.pending = Some(feed);
                    self.wait();
                }
                Err(TrySendError::Disconnected(_)) => return,
            }
        }
    }

    fn take_commands(&mut self) {
        loop {
            match self.commands.try_recv() {
                Ok(command) => self.apply(command),
                Err(TryRecvError::Empty) => return,
                Err(TryRecvError::Disconnected) => {
                    self.is_stopped = true;
                    return;
                }
            }
        }
    }

    fn apply(&mut self, command: FeederCommand) {
        // Only the first `Decode` counts: the output's rate is set by then.
        if let FeederCommand::Seek {
            generation,
            position,
        } = command
        {
            seek_decoder(self.samples.decoder(), position, &self.path);
            self.generation = generation;
            self.next_frame = frame_at(position, self.duration, self.output.rate);
            self.pending = None;
            self.has_ended = false;
        }
    }

    /// The next block of samples, in a block the audio thread sent back when there is one.
    fn next_feed(&mut self) -> Feed {
        let mut samples = self
            .output
            .recycled
            .try_recv()
            .unwrap_or_else(|_| Vec::with_capacity(BLOCK_FRAMES * self.channels));
        samples.clear();
        samples.extend(self.samples.by_ref().take(BLOCK_FRAMES * self.channels));
        if samples.is_empty() {
            self.has_ended = true;
            return Feed::End {
                generation: self.generation,
            };
        }
        let start_frame = self.next_frame;
        self.next_frame += (samples.len() / self.channels) as u64;
        Feed::Samples(Block {
            generation: self.generation,
            start_frame,
            samples,
        })
    }

    fn wait(&mut self) {
        match wait_for_command(&self.bytes, &self.commands) {
            Waited::Command(command) => self.apply(command),
            Waited::Nothing => {}
            Waited::Stopped => self.is_stopped = true,
        }
    }
}

enum Waited {
    Command(FeederCommand),
    Nothing,
    /// The feeder's handle was dropped.
    Stopped,
}

/// Reads more of the file while there's some left, else waits a little for a command.
fn wait_for_command(bytes: &SongBytes, commands: &Receiver<FeederCommand>) -> Waited {
    let received = if matches!(bytes.load_more(), Ok(true)) {
        commands.try_recv().map_err(|error| match error {
            TryRecvError::Empty => RecvTimeoutError::Timeout,
            TryRecvError::Disconnected => RecvTimeoutError::Disconnected,
        })
    } else {
        commands.recv_timeout(FEEDER_WAIT)
    };
    match received {
        Ok(command) => Waited::Command(command),
        Err(RecvTimeoutError::Timeout) => Waited::Nothing,
        Err(RecvTimeoutError::Disconnected) => Waited::Stopped,
    }
}

fn seek_decoder(decoder: &mut SongDecoder, position: Duration, path: &str) {
    if let Err(error) = decoder.try_seek(position) {
        log::warn!("Couldn't jump within {path}: {error}");
    }
}

/// The frame at `position`, at `rate`, no further than the song's end.
pub(super) fn frame_at(position: Duration, duration: Option<Duration>, rate: u32) -> u64 {
    let position = duration.map_or(position, |duration| position.min(duration));
    (position.as_secs_f64() * f64::from(rate)).round() as u64
}

/// A song's samples at the output's rate: as decoded, or resampled when the output runs at
/// another rate than the song.
enum Samples {
    Native(SongDecoder),
    Resampled(SampleRateConverter<SongDecoder>),
}

impl Samples {
    fn new(decoder: SongDecoder, output_rate: u32) -> Self {
        let song_rate = decoder.sample_rate();
        match SampleRate::new(output_rate) {
            Some(output_rate) if output_rate != song_rate => {
                let channels = decoder.channels();
                Self::Resampled(SampleRateConverter::new(
                    decoder,
                    song_rate,
                    output_rate,
                    channels,
                ))
            }
            _ => Self::Native(decoder),
        }
    }

    fn decoder(&mut self) -> &mut SongDecoder {
        match self {
            Self::Native(decoder) => decoder,
            Self::Resampled(converter) => converter.inner_mut(),
        }
    }
}

impl Iterator for Samples {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        match self {
            Self::Native(decoder) => decoder.next(),
            Self::Resampled(converter) => converter.next(),
        }
    }
}

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

    /// Long enough to fill a feeder's buffer several times over.
    const LONG_SONG_FRAMES: u32 = 300;
    /// Longer than any wait for the feeder's thread should take.
    const FEED_TIMEOUT: Duration = Duration::from_secs(5);

    /// A feeder of a song in its own root, kept with it so the song stays on disk.
    struct OpenSong {
        _root: tempfile::TempDir,
        bytes: Arc<SongBytes>,
        feeder: SongFeeder,
        format: SongFormat,
    }

    fn open_song(file_name: &str, contents: &[u8], start: Duration) -> OpenSong {
        let root = root_with_songs(&[(file_name, contents)]);
        let track_path = format!("Songs/{file_name}");
        let bytes = SongBytes::open(root.path(), &track_path).unwrap();
        let feeder = SongFeeder::open(Arc::clone(&bytes), &track_path, start).unwrap();
        let format = feeder.format();
        OpenSong {
            _root: root,
            bytes,
            feeder,
            format,
        }
    }

    fn next_feed(receiver: &FeedReceiver) -> Feed {
        receiver.blocks.recv_timeout(FEED_TIMEOUT).unwrap()
    }

    /// The blocks up to the end of the generation the feeder is on, which it then reports.
    fn blocks_to_the_end(receiver: &FeedReceiver) -> (Vec<Block>, u32) {
        let mut blocks = Vec::new();
        loop {
            match next_feed(receiver) {
                Feed::Samples(block) => blocks.push(block),
                Feed::End { generation } => return (blocks, generation),
            }
        }
    }

    fn frame_count(blocks: &[Block]) -> usize {
        blocks
            .iter()
            .map(|block| block.samples.len() / usize::from(CHANNELS))
            .sum()
    }

    /// Waits until `condition` holds, failing the test past `FEED_TIMEOUT`.
    fn wait_until(condition: impl Fn() -> bool) {
        let deadline = std::time::Instant::now() + FEED_TIMEOUT;
        while !condition() {
            assert!(std::time::Instant::now() < deadline, "timed out");
            std::thread::sleep(Duration::from_millis(1));
        }
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

    #[test]
    fn sends_every_sample_of_the_song_in_blocks_then_its_end() {
        let song = open_song(
            "Gasoline.mp3",
            &gapless_audio(10, 576, 1216),
            Duration::ZERO,
        );
        let receiver = song.feeder.decode_at(SAMPLE_RATE);

        let (blocks, generation) = blocks_to_the_end(&receiver);

        assert_eq!(receiver.channels, CHANNELS);
        assert_eq!(generation, 0);
        assert_eq!(
            frame_count(&blocks),
            (10 * SAMPLES_PER_FRAME - 576 - 1216) as usize
        );
        let mut next_frame = 0;
        for block in &blocks {
            assert_eq!(block.generation, 0);
            assert_eq!(block.start_frame, next_frame);
            assert!(block.samples.len() <= BLOCK_FRAMES * usize::from(CHANNELS));
            next_frame += (block.samples.len() / usize::from(CHANNELS)) as u64;
        }
    }

    #[test]
    fn starts_from_the_position_asked_for() {
        let start = Duration::from_millis(100);
        let song = open_song("Rebirth.mp3", &gapless_audio(10, 576, 1216), start);
        let receiver = song.feeder.decode_at(SAMPLE_RATE);

        let (blocks, _) = blocks_to_the_end(&receiver);

        let start_frame = u64::from(SAMPLE_RATE / 10);
        assert_eq!(blocks[0].start_frame, start_frame);
        let frames_left = u64::from(10 * SAMPLES_PER_FRAME - 576 - 1216) - start_frame;
        assert_eq!(frame_count(&blocks) as u64, frames_left);
    }

    #[test]
    fn reads_the_rest_of_the_file_while_its_blocks_wait() {
        let contents = silent_frames(LONG_SONG_FRAMES);
        let song = open_song("Sad but True.mp3", &contents, Duration::ZERO);
        let receiver = song.feeder.decode_at(SAMPLE_RATE);

        let _first = next_feed(&receiver);

        wait_until(|| song.bytes.loaded_length() == contents.len());
    }

    #[test]
    fn tags_blocks_after_a_seek_with_the_new_generation() {
        let song = open_song(
            "Vicinity of Obscenity.mp3",
            &silent_frames(LONG_SONG_FRAMES),
            Duration::ZERO,
        );
        let receiver = song.feeder.decode_at(SAMPLE_RATE);
        let Feed::Samples(first) = next_feed(&receiver) else {
            panic!("the song ended at once");
        };

        song.feeder.seek(1, Duration::from_millis(500));

        assert_eq!(first.generation, 0);
        let after_seek = loop {
            match next_feed(&receiver) {
                Feed::Samples(block) if block.generation == 1 => break block,
                Feed::Samples(block) => assert_eq!(block.generation, 0),
                Feed::End { .. } => panic!("the song ended before the seek"),
            }
        };
        assert_eq!(after_seek.start_frame, u64::from(SAMPLE_RATE / 2));
    }

    #[test]
    fn waits_after_the_end_for_a_seek() {
        let song = open_song(
            "Here I Am.mp3",
            &gapless_audio(10, 576, 1216),
            Duration::ZERO,
        );
        let receiver = song.feeder.decode_at(SAMPLE_RATE);
        let (first_time, _) = blocks_to_the_end(&receiver);

        song.feeder.seek(1, Duration::ZERO);
        let (second_time, generation) = blocks_to_the_end(&receiver);

        assert_eq!(generation, 1);
        assert_eq!(second_time[0].start_frame, 0);
        assert_eq!(frame_count(&second_time), frame_count(&first_time));
    }

    #[test]
    fn reuses_the_blocks_sent_back() {
        let song = open_song(
            "(Anesthesia) Pulling Teeth.mp3",
            &silent_frames(LONG_SONG_FRAMES),
            Duration::ZERO,
        );
        let receiver = song.feeder.decode_at(SAMPLE_RATE);
        let Feed::Samples(played) = next_feed(&receiver) else {
            panic!("the song ended at once");
        };
        let played_samples = played.samples.as_ptr();

        receiver.recycle.send(played.samples).unwrap();

        // Every other block stays alive, so no new block can land where the played one was.
        let mut kept = Vec::new();
        let reused = loop {
            match next_feed(&receiver) {
                Feed::Samples(block) if block.samples.as_ptr() == played_samples => break true,
                Feed::Samples(block) => kept.push(block),
                Feed::End { .. } => break false,
            }
        };
        assert!(reused);
    }

    #[test]
    fn resamples_to_the_output_rate() {
        let song = open_song(
            "Gods Of The World.mp3",
            &gapless_audio(10, 576, 1216),
            Duration::ZERO,
        );
        let output_rate = 48_000;
        let receiver = song.feeder.decode_at(output_rate);

        let (blocks, _) = blocks_to_the_end(&receiver);

        let song_frames = f64::from(10 * SAMPLES_PER_FRAME - 576 - 1216);
        let expected = song_frames * f64::from(output_rate) / f64::from(SAMPLE_RATE);
        assert!((frame_count(&blocks) as f64 - expected).abs() <= 2.0);
        assert_eq!(song.format.sample_rate, SAMPLE_RATE);
    }

    #[test]
    fn stops_when_its_handle_is_dropped() {
        let song = open_song(
            "Darts.mp3",
            &silent_frames(LONG_SONG_FRAMES),
            Duration::ZERO,
        );
        let receiver = song.feeder.decode_at(SAMPLE_RATE);

        drop(song.feeder);

        let deadline = std::time::Instant::now() + FEED_TIMEOUT;
        let is_disconnected = loop {
            match receiver.blocks.recv_timeout(FEED_TIMEOUT) {
                Ok(_) => assert!(std::time::Instant::now() < deadline, "still decoding"),
                Err(error) => break error == std::sync::mpsc::RecvTimeoutError::Disconnected,
            }
        };
        assert!(is_disconnected);
    }
}
