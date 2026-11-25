//! The sound output: a cpal stream on the system's default device, opened at the rate of the song
//! that plays, with the song chain in its callback.

use std::{
    sync::{Mutex, MutexGuard, PoisonError, mpsc::Sender},
    time::Duration,
};

use cpal::{
    BufferSize, Device, ErrorKind, FromSample, Host, HostId, SampleFormat, SampleRate, SizedSample,
    Stream, StreamConfig,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use tauri_plugin_log::log;

use super::{
    PlaybackError,
    engine::{AudioOutput, ChainStart, OpenedOutput, OutputOpener, OutputRates, StreamFailure},
    song_chain::{ChainHandle, SongChain},
};

/// The output's buffer: a jump or a volume change is heard within about two of them. With cpal's
/// default, the PulseAudio server picks the buffer, which can reach seconds.
const OUTPUT_BUFFER: Duration = Duration::from_millis(40);
/// How long opening a stream may take, on the hosts that honor it.
const OPEN_TIMEOUT: Duration = Duration::from_secs(2);
/// The frames the callback fills at a time, in a buffer allocated before the stream starts: the
/// audio thread never allocates. A larger buffer is filled in parts.
const SCRATCH_FRAMES: usize = 4096;
/// What the log calls a device that doesn't give its name.
const UNNAMED_DEVICE: &str = "default device";
/// cpal's `default_host` would panic, and so abort the app, when ALSA can't start: the hosts are
/// tried one by one instead, in this order.
#[cfg(target_os = "linux")]
const PREFERRED_HOSTS: [HostId; 2] = [HostId::PulseAudio, HostId::Alsa];
#[cfg(windows)]
const PREFERRED_HOSTS: [HostId; 1] = [HostId::Wasapi];

/// One way of opening a stream.
#[derive(Clone, Copy, Debug, PartialEq)]
struct StreamAttempt {
    sample_rate: SampleRate,
    buffer_size: BufferSize,
    sample_format: SampleFormat,
}

/// The ways of opening a stream for a song of `song_rate`, in order: at the song's rate, then at
/// the device's own, each with the short buffer first, in `f32` first.
fn stream_attempts(song_rate: SampleRate, device_rate: SampleRate) -> Vec<StreamAttempt> {
    let mut rates = vec![song_rate];
    if device_rate != song_rate {
        rates.push(device_rate);
    }
    rates
        .into_iter()
        .flat_map(|sample_rate| {
            let buffer_sizes = [
                BufferSize::Fixed(buffer_frames_for(sample_rate)),
                BufferSize::Default,
            ];
            buffer_sizes.into_iter().flat_map(move |buffer_size| {
                [SampleFormat::F32, SampleFormat::I16]
                    .into_iter()
                    .map(move |sample_format| StreamAttempt {
                        sample_rate,
                        buffer_size,
                        sample_format,
                    })
            })
        })
        .collect()
}

fn buffer_frames_for(sample_rate: SampleRate) -> u32 {
    (f64::from(sample_rate) * OUTPUT_BUFFER.as_secs_f64()).round() as u32
}

/// Whether a stream error stops the output: glitches and automatic rerouting don't.
fn is_fatal(kind: ErrorKind) -> bool {
    !matches!(
        kind,
        ErrorKind::Xrun | ErrorKind::DeviceChanged | ErrorKind::RealtimeDenied
    )
}

/// The hosts to try, best first, among the ones available: PulseAudio, which PipeWire and WSLg
/// serve too, then ALSA on Linux.
fn hosts_to_try(available: &[HostId]) -> Vec<HostId> {
    PREFERRED_HOSTS
        .into_iter()
        .filter(|host| available.contains(host))
        .collect()
}

fn new_host() -> Result<Host, PlaybackError> {
    let mut first_error = None;
    for host_id in hosts_to_try(&cpal::available_hosts()) {
        match cpal::host_from_id(host_id) {
            Ok(host) => return Ok(host),
            Err(error) => {
                log::warn!("Couldn't reach the sound system {host_id:?}: {error}");
                first_error.get_or_insert(error);
            }
        }
    }
    Err(first_error.map_or(PlaybackError::NoOutput, opening_error))
}

fn opening_error(error: cpal::Error) -> PlaybackError {
    match error.kind() {
        ErrorKind::DeviceNotAvailable | ErrorKind::HostUnavailable => PlaybackError::NoOutput,
        _ => PlaybackError::OpenOutput(error.to_string()),
    }
}

/// Opens cpal streams on the default device.
#[derive(Default)]
pub(super) struct CpalOpener {
    /// Made at the first open, and again when opening on it fails, as after the sound server
    /// restarted.
    host: Mutex<Option<Host>>,
}

impl CpalOpener {
    fn lock_host(&self) -> MutexGuard<'_, Option<Host>> {
        self.host.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl OutputOpener for CpalOpener {
    fn open(
        &self,
        sample_rate: u32,
        chain: ChainStart,
        failures: Sender<StreamFailure>,
    ) -> Result<OpenedOutput, PlaybackError> {
        let mut host = self.lock_host();
        if let Some(current) = host.as_ref()
            && let Ok(opened) = open_on(current, sample_rate, &chain, &failures)
        {
            return Ok(opened);
        }
        let fresh = new_host()?;
        let opened = open_on(&fresh, sample_rate, &chain, &failures);
        *host = Some(fresh);
        opened
    }

    fn default_device_id(&self) -> Option<String> {
        let host = self.lock_host();
        id_of(&host.as_ref()?.default_output_device()?)
    }
}

fn id_of(device: &Device) -> Option<String> {
    device.id().ok().map(|id| id.to_string())
}

fn name_of(device: &Device) -> String {
    device
        .description()
        .map(|description| description.name().to_owned())
        .unwrap_or_else(|_| UNNAMED_DEVICE.to_owned())
}

/// Opens a stream on `host`'s default device, at `sample_rate` when it takes it, with the device's
/// channels.
fn open_on(
    host: &Host,
    sample_rate: SampleRate,
    chain: &ChainStart,
    failures: &Sender<StreamFailure>,
) -> Result<OpenedOutput, PlaybackError> {
    let device = host
        .default_output_device()
        .ok_or(PlaybackError::NoOutput)?;
    let device_config = device.default_output_config().map_err(opening_error)?;
    let channels = device_config.channels();
    let mut first_error = None;
    for attempt in stream_attempts(sample_rate, device_config.sample_rate()) {
        let config = StreamConfig {
            channels,
            sample_rate: attempt.sample_rate,
            buffer_size: attempt.buffer_size,
        };
        match build_stream(&device, config, attempt.sample_format, chain, failures) {
            Ok((stream, chain_handle)) => {
                let audio = CpalOutput {
                    stream,
                    device_id: id_of(&device),
                    chain: chain.number,
                    failures: failures.clone(),
                };
                return Ok(OpenedOutput {
                    audio: Box::new(audio),
                    chain: chain_handle,
                    rates: OutputRates {
                        requested: sample_rate,
                        actual: attempt.sample_rate,
                    },
                    device_name: name_of(&device),
                });
            }
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
    }
    Err(first_error.map_or(PlaybackError::NoOutput, opening_error))
}

fn build_stream(
    device: &Device,
    config: StreamConfig,
    sample_format: SampleFormat,
    chain: &ChainStart,
    failures: &Sender<StreamFailure>,
) -> Result<(Stream, ChainHandle), cpal::Error> {
    let (song_chain, chain_handle) =
        SongChain::new(chain.number, config.channels, chain.events.clone());
    let on_error = report_failures(chain.number, failures.clone());
    let stream = match sample_format {
        SampleFormat::I16 => stream_of::<i16>(device, config, song_chain, on_error),
        _ => stream_of::<f32>(device, config, song_chain, on_error),
    }?;
    Ok((stream, chain_handle))
}

/// A stream whose callback fills its buffer from `song_chain`, converted to `T`.
fn stream_of<T: SizedSample + FromSample<f32>>(
    device: &Device,
    config: StreamConfig,
    mut song_chain: SongChain,
    on_error: impl FnMut(cpal::Error) + Send + 'static,
) -> Result<Stream, cpal::Error> {
    let mut scratch = vec![0.0; SCRATCH_FRAMES * usize::from(config.channels.max(1))];
    device.build_output_stream::<T, _, _>(
        config,
        move |output: &mut [T], _| {
            for part in output.chunks_mut(scratch.len()) {
                let samples = &mut scratch[..part.len()];
                song_chain.fill(samples);
                for (sample, chained) in part.iter_mut().zip(samples.iter()) {
                    *sample = T::from_sample(*chained);
                }
            }
        },
        on_error,
        Some(OPEN_TIMEOUT),
    )
}

/// Sends the stream's fatal errors to the engine, which opens another output.
fn report_failures(
    chain: u64,
    failures: Sender<StreamFailure>,
) -> impl FnMut(cpal::Error) + Send + 'static {
    move |error| {
        if is_fatal(error.kind()) {
            // Without its receiver, the app is closing.
            let _ = failures.send(StreamFailure {
                chain,
                reason: error.to_string(),
            });
        }
    }
}

/// An open cpal stream. Dropping it closes it.
struct CpalOutput {
    stream: Stream,
    device_id: Option<String>,
    chain: u64,
    failures: Sender<StreamFailure>,
}

impl AudioOutput for CpalOutput {
    fn play(&self) {
        if let Err(error) = self.stream.play() {
            let _ = self.failures.send(StreamFailure {
                chain: self.chain,
                reason: error.to_string(),
            });
        }
    }

    fn pause(&self) {
        // The chain plays silence while paused anyway: only the system still sees the stream.
        if let Err(error) = self.stream.pause() {
            log::warn!("Couldn't pause the sound output: {error}");
        }
    }

    fn device_id(&self) -> Option<String> {
        self.device_id.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CD_RATE: SampleRate = 44_100;
    const DEVICE_RATE: SampleRate = 48_000;

    fn attempt(
        sample_rate: SampleRate,
        buffer_size: BufferSize,
        sample_format: SampleFormat,
    ) -> StreamAttempt {
        StreamAttempt {
            sample_rate,
            buffer_size,
            sample_format,
        }
    }

    #[test]
    fn opens_at_the_song_rate_before_the_device_rate() {
        let short_buffer = BufferSize::Fixed(1764);
        let device_buffer = BufferSize::Fixed(1920);

        assert_eq!(
            stream_attempts(CD_RATE, DEVICE_RATE),
            [
                attempt(CD_RATE, short_buffer, SampleFormat::F32),
                attempt(CD_RATE, short_buffer, SampleFormat::I16),
                attempt(CD_RATE, BufferSize::Default, SampleFormat::F32),
                attempt(CD_RATE, BufferSize::Default, SampleFormat::I16),
                attempt(DEVICE_RATE, device_buffer, SampleFormat::F32),
                attempt(DEVICE_RATE, device_buffer, SampleFormat::I16),
                attempt(DEVICE_RATE, BufferSize::Default, SampleFormat::F32),
                attempt(DEVICE_RATE, BufferSize::Default, SampleFormat::I16),
            ]
        );
    }

    #[test]
    fn tries_a_rate_once_when_the_device_runs_at_the_song_rate() {
        let attempts = stream_attempts(DEVICE_RATE, DEVICE_RATE);

        assert_eq!(attempts.len(), 4);
        assert!(
            attempts
                .iter()
                .all(|attempt| attempt.sample_rate == DEVICE_RATE)
        );
    }

    #[test]
    fn asks_for_a_buffer_of_40_ms() {
        assert_eq!(buffer_frames_for(CD_RATE), 1764);
        assert_eq!(buffer_frames_for(DEVICE_RATE), 1920);
        assert_eq!(buffer_frames_for(22_050), 882);
    }

    #[test]
    fn keeps_playing_through_glitches() {
        for kind in [
            ErrorKind::Xrun,
            ErrorKind::DeviceChanged,
            ErrorKind::RealtimeDenied,
        ] {
            assert!(!is_fatal(kind), "{kind:?}");
        }
        for kind in [
            ErrorKind::DeviceNotAvailable,
            ErrorKind::StreamInvalidated,
            ErrorKind::HostUnavailable,
            ErrorKind::BackendError,
            ErrorKind::Other,
        ] {
            assert!(is_fatal(kind), "{kind:?}");
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn prefers_pulseaudio_to_alsa() {
        assert_eq!(
            hosts_to_try(&[HostId::PulseAudio, HostId::Alsa]),
            [HostId::PulseAudio, HostId::Alsa]
        );
        assert_eq!(
            hosts_to_try(&[HostId::Alsa, HostId::PulseAudio]),
            [HostId::PulseAudio, HostId::Alsa]
        );
        assert_eq!(hosts_to_try(&[HostId::Alsa]), [HostId::Alsa]);
    }
}
