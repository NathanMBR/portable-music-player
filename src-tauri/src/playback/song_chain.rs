use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
    mpsc::{self, Receiver, Sender, SyncSender, TryRecvError},
};

use super::song_feeder::{Block, Feed, FeedReceiver};

/// The webview's number for a song in the player, echoed in every event about it, so an event
/// about a song no longer there is recognizable. The webview counts from 1.
pub(super) type SongId = u32;
/// The clock's song when the chain has none.
pub(super) const NO_SONG: SongId = 0;
/// Room for the events a chain can raise before the controller takes them: a few per song.
const EVENT_CAPACITY: usize = 16;

/// A song as the chain plays it: its blocks, and the generation they must carry to be played.
pub(super) struct ChainSong {
    pub(super) id: SongId,
    pub(super) feed: FeedReceiver,
    pub(super) generation: u32,
    /// The frame its blocks start at, which the clock shows until they come.
    pub(super) start_frame: u64,
}

pub(super) enum ChainCommand {
    /// Plays `song` at once, in place of the current song, and forgets the queued one.
    Play {
        song: ChainSong,
        is_paused: bool,
    },
    /// The song to play right after `after` ends, or none. Ignored unless `after` is still the
    /// current song and hasn't ended.
    QueueNext {
        after: SongId,
        song: Option<ChainSong>,
    },
    SetPaused(bool),
    /// The feeder of song `id` goes on from `frame`, with blocks of `generation`. Ignored unless
    /// `id` is the current song: the chain may have just moved on to the next one.
    Seek {
        id: SongId,
        generation: u32,
        frame: u64,
    },
    SetVolume(f32),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum ChainEvent {
    /// The queued song took over, at its first sample.
    Started { chain: u64, id: SongId },
    /// The current song ended with nothing queued: the chain plays silence after it.
    Ended { chain: u64, id: SongId },
}

/// The song in a chain and its position, which the audio thread publishes and the controller reads.
/// One atomic holds both, so they're always read together.
#[derive(Default)]
pub(super) struct ChainClock(AtomicU64);

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct ClockReading {
    pub(super) id: SongId,
    /// The song's frame the output is at, at the output's rate.
    pub(super) frame: u64,
}

impl ChainClock {
    pub(super) fn set(&self, id: SongId, frame: u64) {
        let frame = frame.min(u64::from(u32::MAX));
        self.0
            .store((u64::from(id) << u32::BITS) | frame, Ordering::Relaxed);
    }

    pub(super) fn read(&self) -> ClockReading {
        let value = self.0.load(Ordering::Relaxed);
        ClockReading {
            id: (value >> u32::BITS) as SongId,
            frame: value & u64::from(u32::MAX),
        }
    }
}

/// What a chain's owner keeps to drive it.
pub(super) struct ChainHandle {
    pub(super) commands: Sender<ChainCommand>,
    pub(super) clock: Arc<ChainClock>,
}

/// The audio thread's whole job: it copies the current song's samples to the output, switches to
/// the queued song on the very next sample once the current one ends, and plays silence while
/// paused, idle or waiting for blocks. It never blocks, locks or allocates, since a late output
/// buffer is a click: its feeders do everything else on their own threads.
pub(super) struct SongChain {
    /// This chain's number, in its events, so the events of a chain already replaced are ignored.
    chain: u64,
    commands: Receiver<ChainCommand>,
    events: SyncSender<ChainEvent>,
    clock: Arc<ChainClock>,
    output_channels: usize,
    current: Option<PlayingSong>,
    queued: Option<ChainSong>,
    is_paused: bool,
    volume: f32,
}

struct PlayingSong {
    song: ChainSong,
    block: Option<Block>,
    /// The next sample of `block`.
    offset: usize,
    /// The song's frame of the next sample.
    frame: u64,
    has_ended: bool,
}

impl SongChain {
    pub(super) fn new(
        chain: u64,
        output_channels: u16,
        events: SyncSender<ChainEvent>,
    ) -> (Self, ChainHandle) {
        let (commands, command_receiver) = mpsc::channel();
        let clock = Arc::new(ChainClock::default());
        let song_chain = Self {
            chain,
            commands: command_receiver,
            events,
            clock: Arc::clone(&clock),
            output_channels: usize::from(output_channels.max(1)),
            current: None,
            queued: None,
            is_paused: false,
            volume: 1.0,
        };
        (song_chain, ChainHandle { commands, clock })
    }

    /// A channel for the events of the chains, which the controller reads.
    pub(super) fn event_channel() -> (SyncSender<ChainEvent>, Receiver<ChainEvent>) {
        mpsc::sync_channel(EVENT_CAPACITY)
    }

    /// Fills one output buffer, interleaved at the output's channel count.
    pub(super) fn fill(&mut self, output: &mut [f32]) {
        self.take_commands();
        for frame in output.chunks_mut(self.output_channels) {
            if self.is_paused || frame.len() < self.output_channels || !self.write_frame(frame) {
                frame.fill(0.0);
            }
        }
        self.publish_position();
    }

    fn take_commands(&mut self) {
        loop {
            match self.commands.try_recv() {
                Ok(command) => self.apply(command),
                // Without its owner the chain plays on what it has: the output goes first anyway.
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => return,
            }
        }
    }

    fn apply(&mut self, command: ChainCommand) {
        match command {
            ChainCommand::Play { song, is_paused } => {
                self.retire_current();
                self.current = Some(PlayingSong::new(song));
                self.queued = None;
                self.is_paused = is_paused;
            }
            ChainCommand::QueueNext { after, song } => {
                let is_after_current = self
                    .current
                    .as_ref()
                    .is_some_and(|current| current.song.id == after && !current.has_ended);
                if is_after_current {
                    self.queued = song;
                }
            }
            ChainCommand::SetPaused(is_paused) => self.is_paused = is_paused,
            ChainCommand::Seek {
                id,
                generation,
                frame,
            } => {
                if let Some(current) = self
                    .current
                    .as_mut()
                    .filter(|current| current.song.id == id)
                {
                    current.recycle_block();
                    current.song.generation = generation;
                    current.frame = frame;
                    current.has_ended = false;
                }
            }
            ChainCommand::SetVolume(volume) => self.volume = volume,
        }
    }

    /// Writes the current song's next frame. `false` when it has none to write yet.
    fn write_frame(&mut self, frame: &mut [f32]) -> bool {
        loop {
            let Some(current) = self.current.as_mut() else {
                return false;
            };
            match current.next_step() {
                Step::Play => {
                    current.write_frame(frame, self.volume);
                    return true;
                }
                Step::Wait => return false,
                Step::Finish => self.finish_current(),
            }
        }
    }

    /// The current song has no samples left: the queued song takes over, or the chain reports
    /// the end and keeps the song, ended, so a seek can play it again.
    fn finish_current(&mut self) {
        let Some(mut current) = self.current.take() else {
            return;
        };
        match self.queued.take() {
            Some(next) => {
                self.send(ChainEvent::Started {
                    chain: self.chain,
                    id: next.id,
                });
                current.recycle_block();
                self.current = Some(PlayingSong::new(next));
            }
            None => {
                current.has_ended = true;
                self.send(ChainEvent::Ended {
                    chain: self.chain,
                    id: current.song.id,
                });
                self.current = Some(current);
            }
        }
    }

    fn retire_current(&mut self) {
        if let Some(current) = self.current.as_mut() {
            current.recycle_block();
        }
    }

    fn send(&self, event: ChainEvent) {
        // An event that finds no room is dropped: the audio thread never waits.
        let _ = self.events.try_send(event);
    }

    fn publish_position(&self) {
        match &self.current {
            Some(current) => self.clock.set(current.song.id, current.frame),
            None => self.clock.set(NO_SONG, 0),
        }
    }
}

/// What the current song does at the next frame.
enum Step {
    Play,
    /// No block yet: the feeder is behind.
    Wait,
    /// It has no samples left.
    Finish,
}

impl PlayingSong {
    fn new(song: ChainSong) -> Self {
        let frame = song.start_frame;
        Self {
            song,
            block: None,
            offset: 0,
            frame,
            has_ended: false,
        }
    }

    fn channels(&self) -> usize {
        usize::from(self.song.feed.channels.max(1))
    }

    /// Makes sure a block with a whole frame left is at hand, taking the next one from the feeder
    /// and throwing away the blocks of an older generation.
    fn next_step(&mut self) -> Step {
        if self.has_ended {
            return Step::Wait;
        }
        loop {
            if self
                .block
                .as_ref()
                .is_some_and(|block| self.offset + self.channels() <= block.samples.len())
            {
                return Step::Play;
            }
            self.recycle_block();
            match self.song.feed.blocks.try_recv() {
                Ok(Feed::Samples(block)) if block.generation == self.song.generation => {
                    self.frame = block.start_frame;
                    self.block = Some(block);
                    self.offset = 0;
                }
                Ok(Feed::Samples(stale)) => self.recycle(stale.samples),
                Ok(Feed::End { generation }) if generation == self.song.generation => {
                    return Step::Finish;
                }
                Ok(Feed::End { .. }) => {}
                Err(TryRecvError::Empty) => return Step::Wait,
                // A feeder that stopped has nothing more to send.
                Err(TryRecvError::Disconnected) => return Step::Finish,
            }
        }
    }

    /// Writes the frame at hand, mapped to the output's channels and scaled by the volume.
    fn write_frame(&mut self, output: &mut [f32], volume: f32) {
        let channels = self.channels();
        let Some(block) = self.block.as_ref() else {
            return;
        };
        let input = &block.samples[self.offset..self.offset + channels];
        map_channels(input, output, volume);
        self.offset += channels;
        self.frame += 1;
    }

    fn recycle_block(&mut self) {
        if let Some(block) = self.block.take() {
            self.recycle(block.samples);
        }
        self.offset = 0;
    }

    fn recycle(&self, samples: Vec<f32>) {
        // A full way back only happens when the feeder is gone: the block is just dropped.
        let _ = self.song.feed.recycle.try_send(samples);
    }
}

/// One frame of a song, at the output's channel count: a mono song plays on every channel, a
/// mono output gets the average, and other counts keep the channels they share, in order, with
/// silence on the output's others.
fn map_channels(input: &[f32], output: &mut [f32], volume: f32) {
    match (input.len(), output.len()) {
        (1, _) => output.fill(input[0] * volume),
        (_, 1) => output[0] = input.iter().sum::<f32>() / input.len() as f32 * volume,
        _ => {
            for (index, sample) in output.iter_mut().enumerate() {
                *sample = input.get(index).map_or(0.0, |input| input * volume);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::SyncSender;

    use super::*;
    use crate::playback::song_feeder::FEED_CAPACITY;

    const MONO: u16 = 1;
    const STEREO: u16 = 2;

    /// The feeder's end of a song given to a chain in a test.
    struct FakeFeeder {
        blocks: SyncSender<Feed>,
        recycled: Receiver<Vec<f32>>,
    }

    impl FakeFeeder {
        fn send(&self, generation: u32, start_frame: u64, samples: &[f32]) {
            self.blocks
                .send(Feed::Samples(Block {
                    generation,
                    start_frame,
                    samples: samples.to_vec(),
                }))
                .unwrap();
        }

        fn end(&self, generation: u32) {
            self.blocks.send(Feed::End { generation }).unwrap();
        }
    }

    fn fake_song(id: SongId, channels: u16) -> (ChainSong, FakeFeeder) {
        let (blocks, block_receiver) = mpsc::sync_channel(FEED_CAPACITY);
        let (recycle, recycled) = mpsc::sync_channel(FEED_CAPACITY);
        let song = ChainSong {
            id,
            feed: FeedReceiver {
                blocks: block_receiver,
                recycle,
                channels,
            },
            generation: 0,
            start_frame: 0,
        };
        (song, FakeFeeder { blocks, recycled })
    }

    /// A song whose feeder already sent all of `samples`, then its end.
    fn song_of(id: SongId, channels: u16, samples: &[f32]) -> (ChainSong, FakeFeeder) {
        let (song, feeder) = fake_song(id, channels);
        feeder.send(0, 0, samples);
        feeder.end(0);
        (song, feeder)
    }

    struct TestChain {
        chain: SongChain,
        handle: ChainHandle,
        events: Receiver<ChainEvent>,
        output_channels: usize,
    }

    impl TestChain {
        fn new(output_channels: u16) -> Self {
            let (events, event_receiver) = SongChain::event_channel();
            let (chain, handle) = SongChain::new(7, output_channels, events);
            Self {
                chain,
                handle,
                events: event_receiver,
                output_channels: usize::from(output_channels),
            }
        }

        fn command(&self, command: ChainCommand) {
            self.handle.commands.send(command).unwrap();
        }

        fn play(&self, song: ChainSong) {
            self.command(ChainCommand::Play {
                song,
                is_paused: false,
            });
        }

        fn queue(&self, after: SongId, song: ChainSong) {
            self.command(ChainCommand::QueueNext {
                after,
                song: Some(song),
            });
        }

        fn fill(&mut self, frames: usize) -> Vec<f32> {
            let mut output = vec![f32::NAN; frames * self.output_channels];
            self.chain.fill(&mut output);
            output
        }

        fn events(&self) -> Vec<ChainEvent> {
            self.events.try_iter().collect()
        }

        fn clock(&self) -> ClockReading {
            self.handle.clock.read()
        }
    }

    #[test]
    fn plays_the_queued_song_right_after_the_current_one() {
        let mut chain = TestChain::new(MONO);
        let (first, _first_feeder) = song_of(1, MONO, &[0.1, 0.2, 0.3]);
        let (second, _second_feeder) = song_of(2, MONO, &[0.4, 0.5]);
        chain.play(first);
        chain.queue(1, second);

        assert_eq!(chain.fill(2), [0.1, 0.2]);
        assert_eq!(chain.fill(4), [0.3, 0.4, 0.5, 0.0]);
    }

    #[test]
    fn announces_the_queued_song_at_its_first_sample() {
        let mut chain = TestChain::new(MONO);
        let (first, _first_feeder) = song_of(1, MONO, &[0.1, 0.2, 0.3]);
        let (second, _second_feeder) = song_of(2, MONO, &[0.4, 0.5]);
        chain.play(first);
        chain.queue(1, second);

        chain.fill(3);
        assert_eq!(chain.events(), []);

        assert_eq!(chain.fill(1), [0.4]);
        assert_eq!(chain.events(), [ChainEvent::Started { chain: 7, id: 2 }]);
    }

    #[test]
    fn replaces_the_queued_song_before_it_starts() {
        let mut chain = TestChain::new(MONO);
        let (first, _first_feeder) = song_of(1, MONO, &[0.1]);
        let (second, _second_feeder) = song_of(2, MONO, &[0.2]);
        let (third, _third_feeder) = song_of(3, MONO, &[0.3]);
        chain.play(first);
        chain.queue(1, second);
        chain.queue(1, third);

        assert_eq!(chain.fill(3), [0.1, 0.3, 0.0]);
    }

    #[test]
    fn ignores_a_queued_song_meant_for_another() {
        let mut chain = TestChain::new(MONO);
        let (first, _first_feeder) = song_of(1, MONO, &[0.1]);
        let (second, _second_feeder) = song_of(2, MONO, &[0.2]);
        chain.play(first);
        chain.queue(9, second);

        assert_eq!(chain.fill(2), [0.1, 0.0]);
        assert_eq!(chain.events(), [ChainEvent::Ended { chain: 7, id: 1 }]);
    }

    #[test]
    fn ignores_a_queued_song_once_the_current_one_ended() {
        let mut chain = TestChain::new(MONO);
        let (first, _first_feeder) = song_of(1, MONO, &[0.1]);
        let (second, _second_feeder) = song_of(2, MONO, &[0.2]);
        chain.play(first);
        chain.fill(2);

        chain.queue(1, second);

        assert_eq!(chain.fill(1), [0.0]);
        assert_eq!(chain.events(), [ChainEvent::Ended { chain: 7, id: 1 }]);
    }

    #[test]
    fn forgets_the_queued_song_when_another_plays() {
        let mut chain = TestChain::new(MONO);
        let (first, _first_feeder) = song_of(1, MONO, &[0.1, 0.1]);
        let (second, _second_feeder) = song_of(2, MONO, &[0.2]);
        let (other, _other_feeder) = song_of(3, MONO, &[0.3]);
        chain.play(first);
        chain.queue(1, second);
        chain.fill(1);

        chain.play(other);

        assert_eq!(chain.fill(3), [0.3, 0.0, 0.0]);
        assert_eq!(chain.events(), [ChainEvent::Ended { chain: 7, id: 3 }]);
    }

    #[test]
    fn reports_the_end_once_and_plays_silence() {
        let mut chain = TestChain::new(MONO);
        let (song, feeder) = song_of(1, MONO, &[0.1, 0.2]);
        chain.play(song);

        assert_eq!(chain.fill(3), [0.1, 0.2, 0.0]);
        assert_eq!(chain.fill(2), [0.0, 0.0]);
        assert_eq!(chain.events(), [ChainEvent::Ended { chain: 7, id: 1 }]);

        chain.command(ChainCommand::Seek {
            id: 1,
            generation: 1,
            frame: 0,
        });
        feeder.send(1, 0, &[0.1, 0.2]);
        assert_eq!(chain.fill(2), [0.1, 0.2]);
    }

    #[test]
    fn plays_silence_without_moving_while_paused() {
        let mut chain = TestChain::new(MONO);
        let (song, _feeder) = song_of(1, MONO, &[0.1, 0.2]);
        chain.command(ChainCommand::Play {
            song,
            is_paused: true,
        });

        assert_eq!(chain.fill(2), [0.0, 0.0]);
        assert_eq!(chain.clock(), ClockReading { id: 1, frame: 0 });

        chain.command(ChainCommand::SetPaused(false));
        assert_eq!(chain.fill(2), [0.1, 0.2]);
    }

    #[test]
    fn waits_in_silence_for_blocks() {
        let mut chain = TestChain::new(MONO);
        let (song, feeder) = fake_song(1, MONO);
        chain.play(song);

        assert_eq!(chain.fill(2), [0.0, 0.0]);
        assert_eq!(chain.clock(), ClockReading { id: 1, frame: 0 });
        assert_eq!(chain.events(), []);

        feeder.send(0, 0, &[0.1, 0.2]);
        assert_eq!(chain.fill(2), [0.1, 0.2]);
    }

    #[test]
    fn scales_samples_by_the_volume() {
        let mut chain = TestChain::new(MONO);
        let (song, _feeder) = song_of(1, MONO, &[0.5, -1.0]);
        chain.play(song);

        chain.command(ChainCommand::SetVolume(0.5));

        assert_eq!(chain.fill(2), [0.25, -0.5]);
    }

    #[test]
    fn drops_blocks_from_before_a_seek() {
        let mut chain = TestChain::new(MONO);
        let (song, feeder) = fake_song(1, MONO);
        feeder.send(0, 0, &[0.1, 0.2]);
        feeder.send(0, 2, &[0.3, 0.4]);
        chain.play(song);
        chain.fill(1);

        chain.command(ChainCommand::Seek {
            id: 1,
            generation: 1,
            frame: 100,
        });
        chain.fill(0);
        assert_eq!(chain.clock(), ClockReading { id: 1, frame: 100 });

        feeder.send(1, 100, &[0.9]);
        assert_eq!(chain.fill(2), [0.9, 0.0]);
        let recycled: Vec<Vec<f32>> = feeder.recycled.try_iter().collect();
        assert_eq!(recycled.len(), 3);
    }

    #[test]
    fn ignores_a_seek_meant_for_another_song() {
        let mut chain = TestChain::new(MONO);
        let (first, _first_feeder) = song_of(1, MONO, &[0.1]);
        let (second, _second_feeder) = song_of(2, MONO, &[0.2, 0.3]);
        chain.play(first);
        chain.queue(1, second);
        chain.fill(2);

        chain.command(ChainCommand::Seek {
            id: 1,
            generation: 1,
            frame: 0,
        });

        assert_eq!(chain.fill(2), [0.3, 0.0]);
    }

    #[test]
    fn counts_the_position_of_the_song_in_it() {
        let mut chain = TestChain::new(MONO);
        let (first, _first_feeder) = song_of(1, MONO, &[0.1, 0.2, 0.3]);
        let (second, second_feeder) = fake_song(2, MONO);
        second_feeder.send(0, 0, &[0.4, 0.5]);
        chain.play(first);
        chain.queue(1, second);

        chain.fill(2);
        assert_eq!(chain.clock(), ClockReading { id: 1, frame: 2 });

        chain.fill(2);
        assert_eq!(chain.clock(), ClockReading { id: 2, frame: 1 });
    }

    #[test]
    fn maps_the_song_channels_to_the_output() {
        let mut stereo_output = TestChain::new(STEREO);
        let (mono_song, _mono_feeder) = song_of(1, MONO, &[0.1, 0.2]);
        stereo_output.play(mono_song);
        assert_eq!(stereo_output.fill(2), [0.1, 0.1, 0.2, 0.2]);

        let mut mono_output = TestChain::new(MONO);
        let (stereo_song, _stereo_feeder) = song_of(1, STEREO, &[0.2, 0.4, 0.0, -0.2]);
        mono_output.play(stereo_song);
        let mixed = mono_output.fill(2);
        assert!((mixed[0] - 0.3).abs() < 1e-6 && (mixed[1] + 0.1).abs() < 1e-6);

        let mut surround_output = TestChain::new(4);
        let (stereo_song, _stereo_feeder) = song_of(1, STEREO, &[0.1, 0.2]);
        surround_output.play(stereo_song);
        assert_eq!(surround_output.fill(1), [0.1, 0.2, 0.0, 0.0]);
    }

    #[test]
    fn sends_played_blocks_back() {
        let mut chain = TestChain::new(MONO);
        let (song, feeder) = fake_song(1, MONO);
        feeder.send(0, 0, &[0.1, 0.2]);
        feeder.send(0, 2, &[0.3]);
        chain.play(song);

        chain.fill(3);

        let recycled: Vec<Vec<f32>> = feeder.recycled.try_iter().collect();
        assert_eq!(recycled, [vec![0.1, 0.2]]);
        chain.fill(1);
        assert_eq!(feeder.recycled.try_iter().count(), 1);
    }
}
