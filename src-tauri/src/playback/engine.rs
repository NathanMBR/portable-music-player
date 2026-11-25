use std::{
    path::Path,
    sync::{
        Arc, Mutex, MutexGuard, PoisonError,
        mpsc::{Sender, SyncSender},
    },
    time::Duration,
};

use tauri_plugin_log::log;

use super::{
    PlaybackError,
    song_bytes::SongBytes,
    song_chain::{ChainCommand, ChainEvent, ChainHandle, ChainSong, NO_SONG, SongId},
    song_feeder::{SongFeeder, SongFormat, frame_at},
};

/// A song the webview asks to play or queue.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct SongRequest {
    pub(super) id: SongId,
    /// The track's path, `Songs/<file name>`.
    pub(super) path: String,
    pub(super) title: String,
    pub(super) artist: Option<String>,
}

/// The rate an output was asked for, and the one it runs at: another when the device refused it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct OutputRates {
    pub(super) requested: u32,
    pub(super) actual: u32,
}

/// Whether a song of `song_rate` can play in an output without reopening it: the output runs at
/// the song's rate, or already resamples every song, as a device that refused the rate asked.
pub(super) fn joins_without_reopening(rates: OutputRates, song_rate: u32) -> bool {
    rates.actual == song_rate || rates.actual != rates.requested
}

/// What an output needs to build its song chain.
pub(super) struct ChainStart {
    /// The chain's number, in its events.
    pub(super) number: u64,
    pub(super) events: SyncSender<ChainEvent>,
}

/// An output's stream failed, as when its device was unplugged.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct OutputLost {
    pub(super) chain: u64,
    pub(super) reason: String,
}

pub(super) struct OpenedOutput {
    pub(super) audio: Box<dyn AudioOutput>,
    pub(super) chain: ChainHandle,
    pub(super) rates: OutputRates,
    pub(super) device_name: String,
}

/// Opens the sound output: cpal in the app, a fake in tests.
pub(super) trait OutputOpener: Send + Sync {
    /// Opens the default device at `sample_rate`, or at its own rate when it refuses it, with a
    /// song chain from `chain` running in its callback. The stream's errors go to `lost`.
    fn open(
        &self,
        sample_rate: u32,
        chain: ChainStart,
        lost: Sender<OutputLost>,
    ) -> Result<OpenedOutput, PlaybackError>;

    /// The default device, to notice when it changes.
    fn default_device_id(&self) -> Option<String>;
}

/// An open output. Dropping it closes it.
pub(super) trait AudioOutput: Send {
    fn play(&self);
    /// Stops the device's stream: the system sees nothing playing.
    fn pause(&self);
    fn device_id(&self) -> Option<String>;
}

/// What the player shows the system's media controls.
#[derive(Clone, Debug, PartialEq)]
pub(super) enum NowPlaying {
    Nothing,
    Song {
        title: String,
        artist: Option<String>,
        duration: Option<Duration>,
        position: Duration,
        is_playing: bool,
    },
}

/// What the engine tells the rest of the app: the webview's events and the media controls.
pub(super) trait PlaybackEvents: Send + Sync {
    /// The queued song took over.
    fn song_started(&self, id: SongId, duration: Option<Duration>);
    /// The song ended with nothing after it.
    fn song_ended(&self, id: SongId);
    fn progress(&self, id: SongId, position: Duration);
    /// The output went away and no other could open: the player paused.
    fn output_lost(&self, reason: &str);
    fn now_playing(&self, now_playing: &NowPlaying);
}

/// The player's audio: what plays, where, and the output it plays on, behind one lock that the
/// commands and the controller thread share. The audio thread never takes it.
pub(super) struct Engine {
    opener: Box<dyn OutputOpener>,
    events: Arc<dyn PlaybackEvents>,
    chain_events: SyncSender<ChainEvent>,
    output_lost: Sender<OutputLost>,
    state: Mutex<EngineState>,
}

struct EngineState {
    output: Option<Output>,
    current: Option<SongInPlayer>,
    /// The song the webview wants after the current one.
    queued: Option<SongInPlayer>,
    /// Songs given to the chain as the next one, then replaced by the webview. They live on until
    /// another song starts, since the chain may have moved on to one before hearing of the change.
    replaced: Vec<SongInPlayer>,
    is_playing: bool,
    volume: f32,
    /// The current song's position, as last known: the chain's clock says it while it plays.
    position: Duration,
    /// The latest song asked to play: an earlier request, whose file was still opening, is dropped.
    latest_play: SongId,
    outputs_opened: u64,
}

/// An open output and the song chain in its callback.
struct Output {
    audio: Box<dyn AudioOutput>,
    chain: ChainHandle,
    rates: OutputRates,
    /// Its chain's number.
    number: u64,
    device_name: String,
}

impl Output {
    fn send(&self, command: ChainCommand) {
        // A chain whose stream already closed has nothing left to play.
        let _ = self.chain.commands.send(command);
    }

    /// Queues `next` after `after` in the chain, when it can join without reopening the output.
    /// Otherwise it waits for the current song's end, and the chain queues nothing.
    fn queue(&self, after: SongId, next: Option<&mut SongInPlayer>) {
        let song = next
            .filter(|next| joins_without_reopening(self.rates, next.format.sample_rate))
            .and_then(|next| {
                next.chain_song(self, Duration::ZERO)
                    .inspect_err(|error| log::warn!("Couldn't queue the next song: {error}"))
                    .ok()
            });
        self.send(ChainCommand::QueueNext { after, song });
    }
}

/// A song in the player: its file, read once, and the feeder decoding it.
pub(super) struct SongInPlayer {
    request: SongRequest,
    bytes: Arc<SongBytes>,
    format: SongFormat,
    feeder: SongFeeder,
    /// The seeks its feeder was told: its blocks carry the count.
    generation: u32,
    /// The chain its feeder decodes for, once given to one. Until then, its feeder waits at the
    /// engine's position for the song.
    chain: Option<u64>,
}

impl SongInPlayer {
    /// Opens the song's file and reads its format, ready to decode from `start`.
    pub(super) fn open(
        root: &Path,
        request: SongRequest,
        start: Duration,
    ) -> Result<Self, PlaybackError> {
        let bytes = SongBytes::open(root, &request.path)?;
        Self::with_bytes(bytes, request, start)
    }

    fn with_bytes(
        bytes: Arc<SongBytes>,
        request: SongRequest,
        start: Duration,
    ) -> Result<Self, PlaybackError> {
        let feeder = SongFeeder::open(Arc::clone(&bytes), &request.path, start)?;
        Ok(Self {
            format: feeder.format(),
            request,
            bytes,
            feeder,
            generation: 0,
            chain: None,
        })
    }

    fn id(&self) -> SongId {
        self.request.id
    }

    fn duration(&self) -> Option<Duration> {
        self.format.duration
    }

    /// The song for `output`'s chain, from `position`. A feeder decodes for one output only, so a
    /// song given to an earlier one gets a new feeder over the same bytes.
    fn chain_song(
        &mut self,
        output: &Output,
        position: Duration,
    ) -> Result<ChainSong, PlaybackError> {
        if self.chain.is_some() {
            self.feeder = SongFeeder::open(Arc::clone(&self.bytes), &self.request.path, position)?;
            self.generation = 0;
        }
        self.chain = Some(output.number);
        Ok(ChainSong {
            id: self.id(),
            feed: self.feeder.decode_at(output.rates.actual),
            generation: self.generation,
            start_frame: frame_at(position, self.duration(), output.rates.actual),
        })
    }

    /// Whether it's the song `output`'s chain plays.
    fn is_in(&self, output: &Output) -> bool {
        self.chain == Some(output.number)
    }
}

impl EngineState {
    /// The current song's position from the chain's clock, while the chain plays it.
    fn clock_position(&self) -> Option<Duration> {
        let (Some(output), Some(current)) = (&self.output, &self.current) else {
            return None;
        };
        let reading = output.chain.clock.read();
        let is_current = current.is_in(output) && reading.id == current.id();
        is_current
            .then(|| Duration::from_secs_f64(reading.frame as f64 / f64::from(output.rates.actual)))
    }

    fn position(&self) -> Duration {
        self.clock_position().unwrap_or(self.position)
    }

    fn update_position(&mut self) {
        self.position = self.position();
    }

    fn is_chain(&self, chain: u64) -> bool {
        self.output
            .as_ref()
            .is_some_and(|output| output.number == chain)
    }

    fn current_is(&self, id: SongId) -> bool {
        self.current
            .as_ref()
            .is_some_and(|current| current.id() == id)
    }

    /// Makes `song` the current song, from its start, and forgets what was to follow the last one.
    fn start(&mut self, song: SongInPlayer) {
        self.current = Some(song);
        self.position = Duration::ZERO;
        self.replaced.clear();
    }

    fn pause_output(&self) {
        if let Some(output) = &self.output {
            output.send(ChainCommand::SetPaused(true));
            output.audio.pause();
        }
    }

    fn now_playing(&self) -> NowPlaying {
        match &self.current {
            None => NowPlaying::Nothing,
            Some(current) => NowPlaying::Song {
                title: current.request.title.clone(),
                artist: current.request.artist.clone(),
                duration: current.duration(),
                position: self.position(),
                is_playing: self.is_playing,
            },
        }
    }
}

impl Engine {
    pub(super) fn new(
        opener: Box<dyn OutputOpener>,
        events: Arc<dyn PlaybackEvents>,
        chain_events: SyncSender<ChainEvent>,
        output_lost: Sender<OutputLost>,
    ) -> Self {
        Self {
            opener,
            events,
            chain_events,
            output_lost,
            state: Mutex::new(EngineState {
                output: None,
                current: None,
                queued: None,
                replaced: Vec::new(),
                is_playing: false,
                volume: 1.0,
                position: Duration::ZERO,
                latest_play: NO_SONG,
                outputs_opened: 0,
            }),
        }
    }

    fn lock(&self) -> MutexGuard<'_, EngineState> {
        // A panic holding the lock aborts the app in release builds: the state is never seen half
        // changed there.
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Plays `request` from `from`, or holds it there paused. A request overtaken by a newer one
    /// while its file was opening changes nothing. Returns the song's duration.
    pub(super) fn play(
        &self,
        root: &Path,
        request: SongRequest,
        from: Duration,
        is_playing: bool,
    ) -> Result<Option<Duration>, PlaybackError> {
        self.claim_play(request.id);
        let song = SongInPlayer::open(root, request, from)?;
        self.install_play(song, from, is_playing)
    }

    /// Makes `id` the song the player is to end with, before its file opens, outside the lock.
    fn claim_play(&self, id: SongId) {
        self.lock().latest_play = id;
    }

    fn install_play(
        &self,
        song: SongInPlayer,
        from: Duration,
        is_playing: bool,
    ) -> Result<Option<Duration>, PlaybackError> {
        let duration = song.duration();
        let mut state = self.lock();
        if song.id() != state.latest_play {
            return Ok(duration);
        }
        state.start(song);
        state.queued = None;
        state.position = from;
        state.is_playing = is_playing;
        let played = if is_playing {
            self.play_current(&mut state)
        } else {
            state.pause_output();
            Ok(())
        };
        if played.is_err() {
            state.is_playing = false;
        }
        self.show_now_playing(&state);
        played.map(|()| duration)
    }

    /// Plays the current song: opens the output, or reopens it at the song's rate, and gives the
    /// song to its chain from the engine's position, followed by the queued song when it can join.
    fn play_current(&self, state: &mut EngineState) -> Result<(), PlaybackError> {
        let Some(song_rate) = state.current.as_ref().map(|song| song.format.sample_rate) else {
            return Ok(());
        };
        let fits = state
            .output
            .as_ref()
            .is_some_and(|output| joins_without_reopening(output.rates, song_rate));
        if !fits {
            self.open_output(state, song_rate)?;
        }
        let EngineState {
            output: Some(output),
            current: Some(current),
            queued,
            replaced,
            position,
            ..
        } = state
        else {
            return Ok(());
        };
        if current.is_in(output) {
            output.send(ChainCommand::SetPaused(false));
        } else {
            let song = current.chain_song(output, *position)?;
            output.send(ChainCommand::Play {
                song,
                is_paused: false,
            });
            replaced.clear();
            output.queue(current.id(), queued.as_mut());
        }
        output.audio.play();
        Ok(())
    }

    /// Closes the output, then opens one at `sample_rate`, with an empty chain.
    fn open_output(&self, state: &mut EngineState, sample_rate: u32) -> Result<(), PlaybackError> {
        state.update_position();
        // Closed first: some devices take one stream at a time.
        state.output = None;
        state.outputs_opened += 1;
        let number = state.outputs_opened;
        let chain = ChainStart {
            number,
            events: self.chain_events.clone(),
        };
        let opened = self
            .opener
            .open(sample_rate, chain, self.output_lost.clone())?;
        log::info!(
            "Opened sound output \"{}\" at {} Hz",
            opened.device_name,
            opened.rates.actual
        );
        let output = Output {
            audio: opened.audio,
            chain: opened.chain,
            rates: opened.rates,
            number,
            device_name: opened.device_name,
        };
        output.send(ChainCommand::SetVolume(state.volume));
        state.output = Some(output);
        Ok(())
    }

    /// Queues the song to play right after `after`, or none. Ignored unless `after` still plays.
    pub(super) fn queue_next(
        &self,
        root: &Path,
        after: SongId,
        request: Option<SongRequest>,
    ) -> Result<(), PlaybackError> {
        let Some(current_bytes) = self.bytes_of_current(after, request.as_ref()) else {
            return Ok(());
        };
        let next = match request {
            None => None,
            Some(request) => {
                let bytes = match current_bytes {
                    Some(bytes) => bytes,
                    None => SongBytes::open(root, &request.path)?,
                };
                Some(SongInPlayer::with_bytes(bytes, request, Duration::ZERO)?)
            }
        };
        let mut state = self.lock();
        if !state.current_is(after) {
            return Ok(());
        }
        if let Some(replaced) = state.queued.take().filter(|queued| queued.chain.is_some()) {
            state.replaced.push(replaced);
        }
        state.queued = next;
        let EngineState {
            output: Some(output),
            current: Some(current),
            queued,
            ..
        } = &mut *state
        else {
            return Ok(());
        };
        if current.is_in(output) {
            output.queue(after, queued.as_mut());
        }
        Ok(())
    }

    /// `None` unless song `after` is the current one. Otherwise the current song's bytes when
    /// `request` is the same song again, as under repeat one, so its file isn't read twice.
    fn bytes_of_current(
        &self,
        after: SongId,
        request: Option<&SongRequest>,
    ) -> Option<Option<Arc<SongBytes>>> {
        let state = self.lock();
        let current = state
            .current
            .as_ref()
            .filter(|current| current.id() == after)?;
        let is_same_song = request.is_some_and(|request| request.path == current.request.path);
        Some(is_same_song.then(|| Arc::clone(&current.bytes)))
    }

    pub(super) fn set_playing(&self, is_playing: bool) -> Result<(), PlaybackError> {
        let mut state = self.lock();
        let played = if is_playing {
            state.is_playing = true;
            self.play_current(&mut state)
        } else {
            state.update_position();
            state.is_playing = false;
            state.pause_output();
            Ok(())
        };
        if played.is_err() {
            state.is_playing = false;
        }
        self.show_now_playing(&state);
        played
    }

    pub(super) fn seek(&self, position: Duration) {
        let mut state = self.lock();
        let EngineState {
            output,
            current: Some(current),
            position: known_position,
            ..
        } = &mut *state
        else {
            return;
        };
        let position = current
            .duration()
            .map_or(position, |duration| position.min(duration));
        *known_position = position;
        current.generation += 1;
        match output {
            Some(output) if current.is_in(output) => {
                current.feeder.seek(current.generation, position);
                let frame = frame_at(position, current.duration(), output.rates.actual);
                output.send(ChainCommand::Seek {
                    id: current.id(),
                    generation: current.generation,
                    frame,
                });
                // The clock shows the new position at once, though the chain only hears of it at
                // its next buffer.
                output.chain.clock.set(current.id(), frame);
            }
            // A song given to an older chain gets a new feeder from its position when it plays.
            _ if current.chain.is_some() => {}
            _ => current.feeder.seek(current.generation, position),
        }
        self.show_now_playing(&state);
    }

    pub(super) fn set_volume(&self, volume: f32) {
        let mut state = self.lock();
        state.volume = volume.clamp(0.0, 1.0);
        if let Some(output) = &state.output {
            output.send(ChainCommand::SetVolume(state.volume));
        }
    }

    /// Empties the player and closes the output.
    pub(super) fn stop(&self) {
        let mut state = self.lock();
        state.output = None;
        state.current = None;
        state.queued = None;
        state.replaced.clear();
        state.is_playing = false;
        state.position = Duration::ZERO;
        // A song still opening is dropped too.
        state.latest_play = NO_SONG;
        self.show_now_playing(&state);
    }

    pub(super) fn handle_chain_event(&self, event: ChainEvent) {
        let mut state = self.lock();
        match event {
            ChainEvent::Started { chain, id } if state.is_chain(chain) => {
                self.take_over(&mut state, id);
            }
            ChainEvent::Ended { chain, id } if state.is_chain(chain) && state.current_is(id) => {
                self.finish_current(&mut state);
            }
            _ => {}
        }
    }

    /// The chain moved on to song `id`, the queued one, or one queued before it and replaced too
    /// late: that one plays, and the webview, told which, catches up.
    fn take_over(&self, state: &mut EngineState, id: SongId) {
        let next = match state.queued.take() {
            Some(queued) if queued.id() == id => Some(queued),
            // Queued after the song that ended: it no longer follows anything.
            _ => state
                .replaced
                .iter()
                .position(|replaced| replaced.id() == id)
                .map(|index| state.replaced.swap_remove(index)),
        };
        let Some(next) = next else {
            return;
        };
        let duration = next.duration();
        state.start(next);
        self.events.song_started(id, duration);
        self.show_now_playing(state);
    }

    /// The current song ended with nothing queued in the chain: the queued song, which couldn't
    /// join, starts on an output at its rate, or the player reports the end.
    fn finish_current(&self, state: &mut EngineState) {
        state.update_position();
        let Some(next) = state.queued.take() else {
            if let Some(current) = &state.current {
                self.events.song_ended(current.id());
            }
            return;
        };
        let (id, duration) = (next.id(), next.duration());
        state.start(next);
        let played = self.play_current(state);
        self.events.song_started(id, duration);
        match played {
            Ok(()) => self.show_now_playing(state),
            Err(error) => self.lose_output(state, &error),
        }
    }

    pub(super) fn handle_output_lost(&self, lost: OutputLost) {
        let mut state = self.lock();
        let Some(output) = state
            .output
            .as_ref()
            .filter(|output| output.number == lost.chain)
        else {
            return;
        };
        log::warn!("Lost sound output \"{}\"", output.device_name);
        self.rebuild(&mut state);
    }

    /// Moves to the default device when it's no longer the one the output plays on.
    pub(super) fn follow_default_device(&self) {
        let Some((number, device)) = self.open_device() else {
            return;
        };
        let Some(default_device) = self.opener.default_device_id() else {
            return;
        };
        if device.as_ref() == Some(&default_device) {
            return;
        }
        let mut state = self.lock();
        if state.is_chain(number) {
            self.rebuild(&mut state);
        }
    }

    /// The open output's chain and device.
    fn open_device(&self) -> Option<(u64, Option<String>)> {
        let state = self.lock();
        let output = state.output.as_ref()?;
        Some((output.number, output.audio.device_id()))
    }

    /// Opens a new output, on the default device, playing on from where the old one was.
    fn rebuild(&self, state: &mut EngineState) {
        state.update_position();
        state.output = None;
        if !state.is_playing {
            return;
        }
        if let Err(error) = self.play_current(state) {
            self.lose_output(state, &error);
        }
    }

    /// No output could open: the player pauses, and says why.
    fn lose_output(&self, state: &mut EngineState, error: &PlaybackError) {
        state.is_playing = false;
        self.events.output_lost(&error.to_string());
        self.show_now_playing(state);
    }

    /// The current song's position.
    pub(super) fn position(&self) -> Duration {
        self.lock().position()
    }

    /// Reports the playing song's position, once the chain plays it.
    pub(super) fn report_progress(&self) {
        let state = self.lock();
        let Some(current) = state.current.as_ref().filter(|_| state.is_playing) else {
            return;
        };
        if let Some(position) = state.clock_position() {
            self.events.progress(current.id(), position);
        }
    }

    fn show_now_playing(&self, state: &EngineState) {
        self.events.now_playing(&state.now_playing());
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc::{self, Receiver},
        },
        thread,
        time::Instant,
    };

    use tempfile::TempDir;

    use super::*;
    use crate::{
        playback::song_chain::SongChain,
        test_songs::{
            SAMPLE_RATE, gapless_audio, root_with_songs, silent_frames, silent_frames_at_48_khz,
        },
    };

    const RATE_48_KHZ: u32 = 48_000;
    /// Longer than any wait for the feeders' threads should take.
    const TIMEOUT: Duration = Duration::from_secs(5);
    /// One output buffer pulled by hand.
    const FILL_FRAMES: usize = 1024;

    #[derive(Default)]
    struct FakeDevices {
        state: Mutex<FakeDevicesState>,
    }

    struct FakeDevicesState {
        /// The rate each open asked for.
        opened: Vec<u32>,
        /// The chain of each output, the last one the current.
        chains: Vec<SongChain>,
        outputs: Vec<Arc<FakeOutputState>>,
        /// Set when the device refuses every rate but its own.
        own_rate: Option<u32>,
        default_device: Option<String>,
    }

    impl Default for FakeDevicesState {
        fn default() -> Self {
            Self {
                opened: Vec::new(),
                chains: Vec::new(),
                outputs: Vec::new(),
                own_rate: None,
                default_device: Some("Speakers".to_owned()),
            }
        }
    }

    struct FakeOutputState {
        device: String,
        is_playing: AtomicBool,
        is_open: AtomicBool,
    }

    struct FakeOutput(Arc<FakeOutputState>);

    impl AudioOutput for FakeOutput {
        fn play(&self) {
            self.0.is_playing.store(true, Ordering::Relaxed);
        }

        fn pause(&self) {
            self.0.is_playing.store(false, Ordering::Relaxed);
        }

        fn device_id(&self) -> Option<String> {
            Some(self.0.device.clone())
        }
    }

    impl Drop for FakeOutput {
        fn drop(&mut self) {
            self.0.is_open.store(false, Ordering::Relaxed);
        }
    }

    struct FakeOpener(Arc<FakeDevices>);

    impl OutputOpener for FakeOpener {
        fn open(
            &self,
            sample_rate: u32,
            chain: ChainStart,
            _lost: Sender<OutputLost>,
        ) -> Result<OpenedOutput, PlaybackError> {
            let mut devices = self.0.lock();
            let Some(device) = devices.default_device.clone() else {
                return Err(PlaybackError::NoOutput);
            };
            devices.opened.push(sample_rate);
            let (song_chain, handle) = SongChain::new(chain.number, 2, chain.events);
            devices.chains.push(song_chain);
            let output = Arc::new(FakeOutputState {
                device: device.clone(),
                is_playing: AtomicBool::new(false),
                is_open: AtomicBool::new(true),
            });
            devices.outputs.push(Arc::clone(&output));
            Ok(OpenedOutput {
                audio: Box::new(FakeOutput(output)),
                chain: handle,
                rates: OutputRates {
                    requested: sample_rate,
                    actual: devices.own_rate.unwrap_or(sample_rate),
                },
                device_name: device,
            })
        }

        fn default_device_id(&self) -> Option<String> {
            self.0.lock().default_device.clone()
        }
    }

    impl FakeDevices {
        fn lock(&self) -> MutexGuard<'_, FakeDevicesState> {
            self.state.lock().unwrap()
        }

        fn opened(&self) -> Vec<u32> {
            self.lock().opened.clone()
        }

        fn latest_output(&self) -> Arc<FakeOutputState> {
            Arc::clone(self.lock().outputs.last().unwrap())
        }

        /// Pulls one buffer from the current chain, as its device would.
        fn fill(&self) {
            let mut output = vec![0.0; FILL_FRAMES * 2];
            if let Some(chain) = self.lock().chains.last_mut() {
                chain.fill(&mut output);
            }
        }
    }

    #[derive(Debug, PartialEq)]
    enum Recorded {
        Started(SongId),
        Ended(SongId),
        Progress(SongId),
        Lost(String),
    }

    #[derive(Default)]
    struct RecordedEvents {
        events: Mutex<Vec<Recorded>>,
        now_playing: Mutex<Option<NowPlaying>>,
    }

    impl PlaybackEvents for RecordedEvents {
        fn song_started(&self, id: SongId, _duration: Option<Duration>) {
            self.events.lock().unwrap().push(Recorded::Started(id));
        }

        fn song_ended(&self, id: SongId) {
            self.events.lock().unwrap().push(Recorded::Ended(id));
        }

        fn progress(&self, id: SongId, _position: Duration) {
            self.events.lock().unwrap().push(Recorded::Progress(id));
        }

        fn output_lost(&self, reason: &str) {
            self.events
                .lock()
                .unwrap()
                .push(Recorded::Lost(reason.to_owned()));
        }

        fn now_playing(&self, now_playing: &NowPlaying) {
            *self.now_playing.lock().unwrap() = Some(now_playing.clone());
        }
    }

    struct TestEngine {
        engine: Engine,
        devices: Arc<FakeDevices>,
        events: Arc<RecordedEvents>,
        chain_events: Receiver<ChainEvent>,
        root: TempDir,
    }

    impl TestEngine {
        fn with_songs(songs: &[(&str, &[u8])]) -> Self {
            let devices = Arc::new(FakeDevices::default());
            let events = Arc::new(RecordedEvents::default());
            let (chain_events, chain_event_receiver) = SongChain::event_channel();
            let (output_lost, _) = mpsc::channel();
            let engine = Engine::new(
                Box::new(FakeOpener(Arc::clone(&devices))),
                Arc::clone(&events) as Arc<dyn PlaybackEvents>,
                chain_events,
                output_lost,
            );
            Self {
                engine,
                devices,
                events,
                chain_events: chain_event_receiver,
                root: root_with_songs(songs),
            }
        }

        fn play(&self, id: SongId, file_name: &str, is_playing: bool) {
            self.engine
                .play(
                    self.root.path(),
                    request(id, file_name),
                    Duration::ZERO,
                    is_playing,
                )
                .unwrap();
        }

        fn queue(&self, after: SongId, id: SongId, file_name: &str) {
            self.engine
                .queue_next(self.root.path(), after, Some(request(id, file_name)))
                .unwrap();
        }

        /// Plays the chain the way the controller thread would, until `condition` holds.
        fn run_until(&self, condition: impl Fn(&[Recorded]) -> bool) {
            let deadline = Instant::now() + TIMEOUT;
            while !condition(&self.events.events.lock().unwrap()) {
                assert!(Instant::now() < deadline, "timed out");
                self.devices.fill();
                while let Ok(event) = self.chain_events.try_recv() {
                    self.engine.handle_chain_event(event);
                }
                thread::sleep(Duration::from_millis(1));
            }
        }

        fn recorded(&self) -> Vec<Recorded> {
            std::mem::take(&mut *self.events.events.lock().unwrap())
        }

        fn is_playing(&self) -> bool {
            matches!(
                *self.events.now_playing.lock().unwrap(),
                Some(NowPlaying::Song {
                    is_playing: true,
                    ..
                })
            )
        }
    }

    fn request(id: SongId, file_name: &str) -> SongRequest {
        SongRequest {
            id,
            path: format!("Songs/{file_name}"),
            title: file_name.trim_end_matches(".mp3").to_owned(),
            artist: None,
        }
    }

    fn short_song() -> Vec<u8> {
        gapless_audio(10, 576, 1216)
    }

    fn has_ended(id: SongId) -> impl Fn(&[Recorded]) -> bool {
        move |events| events.contains(&Recorded::Ended(id))
    }

    fn has_started(id: SongId) -> impl Fn(&[Recorded]) -> bool {
        move |events| events.contains(&Recorded::Started(id))
    }

    #[test]
    fn joins_a_song_of_the_output_rate_without_reopening() {
        let native = OutputRates {
            requested: SAMPLE_RATE,
            actual: SAMPLE_RATE,
        };
        let resampling = OutputRates {
            requested: SAMPLE_RATE,
            actual: RATE_48_KHZ,
        };

        assert!(joins_without_reopening(native, SAMPLE_RATE));
        assert!(!joins_without_reopening(native, RATE_48_KHZ));
        assert!(joins_without_reopening(resampling, SAMPLE_RATE));
        assert!(joins_without_reopening(resampling, 22_050));
    }

    #[test]
    fn opens_the_output_at_the_rate_of_the_song() {
        let test = TestEngine::with_songs(&[("Know.mp3", &short_song())]);

        test.play(1, "Know.mp3", true);

        assert_eq!(test.devices.opened(), [SAMPLE_RATE]);
        assert!(
            test.devices
                .latest_output()
                .is_playing
                .load(Ordering::Relaxed)
        );
        assert!(test.is_playing());
    }

    #[test]
    fn keeps_the_output_for_a_song_of_the_same_rate() {
        let test = TestEngine::with_songs(&[
            ("Pictures.mp3", &short_song()),
            ("Weakness of a Man.mp3", &short_song()),
        ]);

        test.play(1, "Pictures.mp3", true);
        test.play(2, "Weakness of a Man.mp3", true);

        assert_eq!(test.devices.opened(), [SAMPLE_RATE]);
    }

    #[test]
    fn reopens_the_output_when_the_rate_changes() {
        let test = TestEngine::with_songs(&[
            ("Here In The Now.mp3", &short_song()),
            ("The Golden Age.mp3", &silent_frames_at_48_khz(10)),
        ]);
        test.play(1, "Here In The Now.mp3", true);
        let first_output = test.devices.latest_output();

        test.play(2, "The Golden Age.mp3", true);

        assert_eq!(test.devices.opened(), [SAMPLE_RATE, RATE_48_KHZ]);
        assert!(!first_output.is_open.load(Ordering::Relaxed));
    }

    #[test]
    fn doesnt_open_the_output_for_a_paused_song_until_it_plays() {
        let test = TestEngine::with_songs(&[("Unholy Wars.mp3", &short_song())]);

        test.play(1, "Unholy Wars.mp3", false);
        assert!(test.devices.opened().is_empty());
        assert!(!test.is_playing());

        test.engine.set_playing(true).unwrap();
        assert_eq!(test.devices.opened(), [SAMPLE_RATE]);
        assert!(test.is_playing());
    }

    #[test]
    fn pauses_the_output_with_the_player() {
        let test = TestEngine::with_songs(&[("Whiplash.mp3", &short_song())]);
        test.play(1, "Whiplash.mp3", true);
        let output = test.devices.latest_output();

        test.engine.set_playing(false).unwrap();
        assert!(!output.is_playing.load(Ordering::Relaxed));
        assert!(!test.is_playing());

        test.engine.set_playing(true).unwrap();
        assert!(output.is_playing.load(Ordering::Relaxed));
        assert_eq!(test.devices.opened(), [SAMPLE_RATE]);
    }

    #[test]
    fn queues_a_song_of_the_same_rate_in_the_chain() {
        let test = TestEngine::with_songs(&[
            ("Your Time Has Come.mp3", &short_song()),
            ("Deer Dance.mp3", &short_song()),
        ]);
        test.play(1, "Your Time Has Come.mp3", true);
        test.queue(1, 2, "Deer Dance.mp3");

        test.run_until(has_started(2));

        assert_eq!(test.recorded(), [Recorded::Started(2)]);
        assert_eq!(test.devices.opened(), [SAMPLE_RATE]);
    }

    #[test]
    fn starts_a_song_of_another_rate_once_the_current_one_ends() {
        let test = TestEngine::with_songs(&[
            ("Drown Me Slowly.mp3", &short_song()),
            ("Arising Thunder.mp3", &silent_frames_at_48_khz(10)),
        ]);
        test.play(1, "Drown Me Slowly.mp3", true);
        test.queue(1, 2, "Arising Thunder.mp3");

        test.run_until(has_started(2));

        assert_eq!(test.recorded(), [Recorded::Started(2)]);
        assert_eq!(test.devices.opened(), [SAMPLE_RATE, RATE_48_KHZ]);
    }

    #[test]
    fn reports_the_end_of_a_song_with_nothing_after_it() {
        let test = TestEngine::with_songs(&[("Damage Inc..mp3", &short_song())]);
        test.play(1, "Damage Inc..mp3", true);

        test.run_until(has_ended(1));

        assert_eq!(test.recorded(), [Recorded::Ended(1)]);
    }

    #[test]
    fn plays_again_from_the_start_after_the_end() {
        let test = TestEngine::with_songs(&[("The Shaman.mp3", &short_song())]);
        test.play(1, "The Shaman.mp3", true);
        test.run_until(has_ended(1));
        test.recorded();

        test.engine.seek(Duration::ZERO);

        test.run_until(has_ended(1));
    }

    #[test]
    fn drops_a_play_request_overtaken_by_a_newer_one() {
        let test = TestEngine::with_songs(&[
            ("Cure.mp3", &short_song()),
            ("Fairy Tale.mp3", &silent_frames_at_48_khz(10)),
        ]);
        let root = test.root.path();
        let older = request(1, "Cure.mp3");
        let newer = request(2, "Fairy Tale.mp3");

        test.engine.claim_play(older.id);
        test.engine.claim_play(newer.id);
        let older_song = SongInPlayer::open(root, older, Duration::ZERO).unwrap();
        test.engine
            .install_play(older_song, Duration::ZERO, true)
            .unwrap();
        assert!(test.devices.opened().is_empty());

        let newer_song = SongInPlayer::open(root, newer, Duration::ZERO).unwrap();
        test.engine
            .install_play(newer_song, Duration::ZERO, true)
            .unwrap();
        assert_eq!(test.devices.opened(), [RATE_48_KHZ]);
    }

    #[test]
    fn ignores_a_queue_request_after_another_song() {
        let test = TestEngine::with_songs(&[
            ("Leper Messiah.mp3", &short_song()),
            ("Gasoline.mp3", &short_song()),
        ]);
        test.play(1, "Leper Messiah.mp3", true);
        test.queue(9, 2, "Gasoline.mp3");

        test.run_until(has_ended(1));

        assert_eq!(test.recorded(), [Recorded::Ended(1)]);
    }

    #[test]
    fn rebuilds_from_the_last_position_when_the_device_changes() {
        let test = TestEngine::with_songs(&[("Rebirth.mp3", &silent_frames(300))]);
        test.play(1, "Rebirth.mp3", true);
        let first_output = test.devices.latest_output();
        for _ in 0..20 {
            test.devices.fill();
            thread::sleep(Duration::from_millis(1));
        }
        let position = test.engine.position();
        assert!(position > Duration::ZERO);

        test.devices.lock().default_device = Some("Headphones".to_owned());
        test.engine.follow_default_device();

        assert_eq!(test.devices.opened(), [SAMPLE_RATE, SAMPLE_RATE]);
        assert!(!first_output.is_open.load(Ordering::Relaxed));
        assert_eq!(test.devices.latest_output().device, "Headphones");
        assert!(test.engine.position() >= position);
    }

    #[test]
    fn pauses_and_reports_when_no_device_is_left() {
        let test = TestEngine::with_songs(&[("Sad but True.mp3", &silent_frames(300))]);
        test.play(1, "Sad but True.mp3", true);

        test.devices.lock().default_device = None;
        test.engine.handle_output_lost(OutputLost {
            chain: 1,
            reason: "The device was unplugged".to_owned(),
        });

        assert_eq!(
            test.recorded(),
            [Recorded::Lost(PlaybackError::NoOutput.to_string())]
        );
        assert!(!test.is_playing());
    }

    #[test]
    fn ignores_events_of_an_older_chain() {
        let test = TestEngine::with_songs(&[("Vicinity of Obscenity.mp3", &short_song())]);
        test.play(1, "Vicinity of Obscenity.mp3", true);

        test.engine
            .handle_chain_event(ChainEvent::Ended { chain: 99, id: 1 });
        test.engine.handle_output_lost(OutputLost {
            chain: 99,
            reason: "Gone".to_owned(),
        });

        assert_eq!(test.recorded(), []);
        assert_eq!(test.devices.opened(), [SAMPLE_RATE]);
    }

    #[test]
    fn reports_the_progress_of_the_playing_song() {
        let test = TestEngine::with_songs(&[("Here I Am.mp3", &silent_frames(300))]);
        test.play(1, "Here I Am.mp3", true);
        test.devices.fill();

        test.engine.report_progress();
        test.engine.set_playing(false).unwrap();
        test.engine.report_progress();

        assert_eq!(test.recorded(), [Recorded::Progress(1)]);
    }

    #[test]
    fn closes_the_output_when_the_player_stops() {
        let test = TestEngine::with_songs(&[("Gods Of The World.mp3", &short_song())]);
        test.play(1, "Gods Of The World.mp3", true);
        let output = test.devices.latest_output();

        test.engine.stop();

        assert!(!output.is_open.load(Ordering::Relaxed));
        assert_eq!(
            *test.events.now_playing.lock().unwrap(),
            Some(NowPlaying::Nothing)
        );
    }

    #[test]
    fn resamples_on_a_device_that_refuses_the_song_rate() {
        let test = TestEngine::with_songs(&[
            ("Darts.mp3", &short_song()),
            ("Pictures.mp3", &silent_frames_at_48_khz(10)),
        ]);
        test.devices.lock().own_rate = Some(RATE_48_KHZ);
        test.play(1, "Darts.mp3", true);

        test.queue(1, 2, "Pictures.mp3");
        test.run_until(has_started(2));

        assert_eq!(test.devices.opened(), [SAMPLE_RATE]);
    }
}
