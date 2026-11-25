//! The thread between the engine and time: it hands the engine what the audio thread and the
//! outputs report, the playing song's progress, and the default device's changes.

use std::{
    io,
    sync::{
        Arc,
        mpsc::{Receiver, RecvTimeoutError},
    },
    thread,
    time::{Duration, Instant},
};

use super::{
    engine::{Engine, StreamFailure},
    song_chain::ChainEvent,
};

/// How often the webview hears the playing song's position.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
/// How often the default device is compared with the output's. PulseAudio binds a stream to one
/// device, so a new default, like headphones plugged in, only plays once the output reopens.
const DEVICE_CHECK_INTERVAL: Duration = Duration::from_secs(2);
const CONTROLLER_THREAD_NAME: &str = "playback-controller";

/// What the controller listens to.
pub(super) struct ControllerInputs {
    pub(super) chain_events: Receiver<ChainEvent>,
    pub(super) stream_failures: Receiver<StreamFailure>,
}

/// Starts the controller, which runs as long as the app does.
pub(super) fn start(engine: Arc<Engine>, inputs: ControllerInputs) -> io::Result<()> {
    thread::Builder::new()
        .name(CONTROLLER_THREAD_NAME.to_owned())
        .spawn(move || run(&engine, &inputs))
        .map(drop)
}

fn run(engine: &Engine, inputs: &ControllerInputs) {
    let mut progress_due = Instant::now() + PROGRESS_INTERVAL;
    let mut device_check_due = Instant::now() + DEVICE_CHECK_INTERVAL;
    loop {
        let wait = progress_due.saturating_duration_since(Instant::now());
        match inputs.chain_events.recv_timeout(wait) {
            Ok(event) => engine.handle_chain_event(event),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        for failure in inputs.stream_failures.try_iter() {
            engine.handle_stream_failure(failure);
        }
        let now = Instant::now();
        if now >= progress_due {
            progress_due = now + PROGRESS_INTERVAL;
            engine.report_progress();
        }
        if now >= device_check_due {
            device_check_due = now + DEVICE_CHECK_INTERVAL;
            engine.follow_default_device();
        }
    }
}
