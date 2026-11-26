use std::f32::consts::FRAC_1_SQRT_2;

/// The most channels the mix places, 7.1's: a song of more isn't played, and an output's channels
/// past them stay silent.
pub(super) const MAX_CHANNELS: usize = 8;

/// A speaker a channel is meant for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Speaker {
    FrontLeft,
    FrontRight,
    FrontCenter,
    Lfe,
    BackLeft,
    BackRight,
    FrontLeftOfCenter,
    FrontRightOfCenter,
    BackCenter,
    SideLeft,
    SideRight,
}

use Speaker::{
    BackCenter, BackLeft, BackRight, FrontCenter, FrontLeft, FrontLeftOfCenter, FrontRight,
    FrontRightOfCenter, Lfe, SideLeft, SideRight,
};

/// The speakers of the standard layout of each channel count.
const STANDARD_SPEAKERS: [&[Speaker]; MAX_CHANNELS + 1] = [
    &[],
    &[FrontCenter],
    &[FrontLeft, FrontRight],
    &[FrontLeft, FrontRight, FrontCenter],
    &[FrontLeft, FrontRight, BackLeft, BackRight],
    &[FrontLeft, FrontRight, FrontCenter, BackLeft, BackRight],
    &[FrontLeft, FrontRight, FrontCenter, Lfe, BackLeft, BackRight],
    &[
        FrontLeft,
        FrontRight,
        FrontCenter,
        Lfe,
        BackLeft,
        BackRight,
        BackCenter,
    ],
    &[
        FrontLeft,
        FrontRight,
        FrontCenter,
        Lfe,
        BackLeft,
        BackRight,
        SideLeft,
        SideRight,
    ],
];
const STEREO: [Speaker; 2] = [FrontLeft, FrontRight];

/// Where each channel of a song or an output plays, in the order its samples interleave them.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct ChannelLayout {
    /// The speaker of each of the first `MAX_CHANNELS` channels, `None` for one without a place.
    speakers: [Option<Speaker>; MAX_CHANNELS],
    count: u16,
}

impl ChannelLayout {
    /// `count` channels with no place: they play on the output's channels of the same number.
    pub(super) fn unpositioned(count: u16) -> Self {
        Self {
            speakers: [None; MAX_CHANNELS],
            count,
        }
    }

    /// Channels with these places, in this order.
    pub(super) fn positioned(speakers: &[Option<Speaker>]) -> Self {
        let count = u16::try_from(speakers.len()).unwrap_or(u16::MAX);
        Self::with_places(count, speakers.iter().copied())
    }

    /// `count` channels, the first of them at `places`, in this order.
    pub(super) fn with_places(
        count: u16,
        places: impl IntoIterator<Item = Option<Speaker>>,
    ) -> Self {
        let mut layout = Self::unpositioned(count);
        let placed = layout.placed();
        for (place, speaker) in layout.speakers[..placed].iter_mut().zip(places) {
            *place = speaker;
        }
        layout
    }

    /// The usual layout of `count` channels, in WAVE order, an output's: PulseAudio's default
    /// channel map, which cpal sets, and on WASAPI the order of the device's own speakers, since
    /// cpal hands it the channels as they are (`KSAUDIO_SPEAKER_DIRECTOUT`), and the usual speaker
    /// setups list theirs in WAVE order too. Unpositioned past 8.
    pub(super) fn standard(count: u16) -> Self {
        match STANDARD_SPEAKERS.get(usize::from(count)) {
            Some(speakers) => Self::with_places(count, speakers.iter().copied().map(Some)),
            None => Self::unpositioned(count),
        }
    }

    pub(super) fn count(&self) -> u16 {
        self.count
    }

    fn placed(&self) -> usize {
        usize::from(self.count).min(MAX_CHANNELS)
    }

    fn index_of(&self, speaker: Speaker) -> Option<usize> {
        self.speakers[..self.placed()]
            .iter()
            .position(|place| *place == Some(speaker))
    }

    fn has_places(&self) -> bool {
        self.speakers.iter().any(Option::is_some)
    }
}

/// How much of each channel of a song goes into each channel of an output. It's worked out once
/// per song and output, and holds no heap memory, so the audio thread applies it without
/// allocating.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct ChannelMix {
    /// `gains[output][song]`.
    gains: [[f32; MAX_CHANNELS]; MAX_CHANNELS],
    song_channels: usize,
    output_channels: usize,
    /// A mono song plays on every channel of the output.
    is_mono_song: bool,
}

impl ChannelMix {
    /// The mix of `song`'s channels into `output`'s. A channel the output has is copied across.
    /// One it lacks goes to the nearest ones, as ITU-R BS.775 downmixes: the centre and the
    /// surrounds to the front sides at -3 dB, while the LFE is left out. A mono output gets the
    /// average of the stereo mix, and a mono song plays on every channel. Each output channel is
    /// scaled down by the sum of its gains, so a mix can't clip.
    pub(super) fn between(song: ChannelLayout, output: ChannelLayout) -> Self {
        let mut mix = Self {
            gains: [[0.0; MAX_CHANNELS]; MAX_CHANNELS],
            song_channels: song.placed(),
            output_channels: output.placed(),
            is_mono_song: song.count == 1,
        };
        if mix.is_mono_song {
            return mix;
        }
        if !song.has_places() || !output.has_places() {
            mix.route_in_order();
        } else if output.count == 1 {
            mix.mix_to_mono(song);
        } else {
            mix.route(song, output);
        }
        mix.keep_from_clipping();
        mix
    }

    /// Writes one frame of the song, `input`, into one frame of the output, scaled by `volume`.
    pub(super) fn apply(&self, input: &[f32], output: &mut [f32], volume: f32) {
        if self.is_mono_song {
            output.fill(input.first().copied().unwrap_or(0.0) * volume);
            return;
        }
        let song_channels = self.song_channels.min(input.len());
        for (index, sample) in output.iter_mut().enumerate() {
            *sample = self.gains.get(index).map_or(0.0, |gains| {
                gains[..song_channels]
                    .iter()
                    .zip(input)
                    .map(|(gain, input)| gain * input)
                    .sum::<f32>()
                    * volume
            });
        }
    }

    /// Each channel on the output's channel of the same number; all of them at once on a mono
    /// output.
    fn route_in_order(&mut self) {
        if self.output_channels == 1 {
            let average = 1.0 / self.song_channels as f32;
            self.gains[0][..self.song_channels].fill(average);
            return;
        }
        for channel in 0..self.song_channels.min(self.output_channels) {
            self.gains[channel][channel] = 1.0;
        }
    }

    fn mix_to_mono(&mut self, song: ChannelLayout) {
        let stereo = Self::between(song, ChannelLayout::positioned(&STEREO.map(Some)));
        for channel in 0..self.song_channels {
            self.gains[0][channel] = (stereo.gains[0][channel] + stereo.gains[1][channel]) / 2.0;
        }
    }

    fn route(&mut self, song: ChannelLayout, output: ChannelLayout) {
        for (channel, speaker) in song.speakers[..song.placed()].iter().enumerate() {
            match speaker {
                Some(speaker) => {
                    for (target, gain) in targets_of(*speaker, output).into_iter().flatten() {
                        self.gains[target][channel] += gain;
                    }
                }
                None if channel < self.output_channels => self.gains[channel][channel] = 1.0,
                None => {}
            }
        }
    }

    fn keep_from_clipping(&mut self) {
        for gains in &mut self.gains {
            let total: f32 = gains.iter().sum();
            if total > 1.0 {
                gains.iter_mut().for_each(|gain| *gain /= total);
            }
        }
    }
}

/// The output channels a song's `speaker` plays on, with their gains.
fn targets_of(speaker: Speaker, output: ChannelLayout) -> [Option<(usize, f32)>; 2] {
    if let Some(index) = output.index_of(speaker) {
        return [Some((index, 1.0)), None];
    }
    let at = |speaker, gain| output.index_of(speaker).map(|index| (index, gain));
    let either =
        |first: Speaker, second: Speaker, gain| at(first, gain).or_else(|| at(second, gain));
    match speaker {
        FrontCenter => [at(FrontLeft, FRAC_1_SQRT_2), at(FrontRight, FRAC_1_SQRT_2)],
        Lfe => [None, None],
        BackLeft => [either(SideLeft, FrontLeft, FRAC_1_SQRT_2), None],
        BackRight => [either(SideRight, FrontRight, FRAC_1_SQRT_2), None],
        SideLeft => [either(BackLeft, FrontLeft, FRAC_1_SQRT_2), None],
        SideRight => [either(BackRight, FrontRight, FRAC_1_SQRT_2), None],
        BackCenter => match (at(BackLeft, FRAC_1_SQRT_2), at(BackRight, FRAC_1_SQRT_2)) {
            (Some(left), Some(right)) => [Some(left), Some(right)],
            _ => [
                either(SideLeft, FrontLeft, FRAC_1_SQRT_2),
                either(SideRight, FrontRight, FRAC_1_SQRT_2),
            ],
        },
        FrontLeftOfCenter => [at(FrontLeft, 1.0), None],
        FrontRightOfCenter => [at(FrontRight, 1.0), None],
        FrontLeft | FrontRight => [None, None],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SURROUND_5_1: [Option<Speaker>; 6] = [
        Some(FrontLeft),
        Some(FrontRight),
        Some(FrontCenter),
        Some(Lfe),
        Some(BackLeft),
        Some(BackRight),
    ];

    /// The output frame of a song frame with a full-scale sample on its channel `channel` only.
    fn output_of_channel(mix: &ChannelMix, song_channels: usize, channel: usize) -> Vec<f32> {
        let mut input = vec![0.0; song_channels];
        input[channel] = 1.0;
        let mut output = vec![f32::NAN; mix.output_channels.max(1)];
        mix.apply(&input, &mut output, 1.0);
        output
    }

    fn assert_close(actual: &[f32], expected: &[f32]) {
        assert_eq!(actual.len(), expected.len());
        for (actual, expected) in actual.iter().zip(expected) {
            assert!(
                (actual - expected).abs() < 1e-6,
                "{actual:?} != {expected:?}"
            );
        }
    }

    #[test]
    fn downmixes_surround_to_stereo() {
        let mix = ChannelMix::between(
            ChannelLayout::positioned(&SURROUND_5_1),
            ChannelLayout::standard(2),
        );
        // Each side gets its front, the centre and its surround: 1 + 0.707 + 0.707.
        let total = 1.0 + 2.0 * FRAC_1_SQRT_2;

        assert_close(&output_of_channel(&mix, 6, 0), &[1.0 / total, 0.0]);
        assert_close(&output_of_channel(&mix, 6, 1), &[0.0, 1.0 / total]);
        let centre = FRAC_1_SQRT_2 / total;
        assert_close(&output_of_channel(&mix, 6, 2), &[centre, centre]);
        assert_close(&output_of_channel(&mix, 6, 3), &[0.0, 0.0]);
        assert_close(&output_of_channel(&mix, 6, 4), &[centre, 0.0]);
        assert_close(&output_of_channel(&mix, 6, 5), &[0.0, centre]);
    }

    #[test]
    fn keeps_the_channels_the_output_has() {
        let mix = ChannelMix::between(
            ChannelLayout::positioned(&SURROUND_5_1),
            ChannelLayout::standard(6),
        );

        for channel in 0..6 {
            let mut expected = vec![0.0; 6];
            expected[channel] = 1.0;
            assert_close(&output_of_channel(&mix, 6, channel), &expected);
        }
    }

    #[test]
    fn plays_side_channels_on_the_surrounds_an_output_has() {
        let surround_7_1 = [
            Some(FrontLeft),
            Some(FrontRight),
            Some(FrontCenter),
            Some(Lfe),
            Some(BackLeft),
            Some(BackRight),
            Some(SideLeft),
            Some(SideRight),
        ];
        let mix = ChannelMix::between(
            ChannelLayout::positioned(&surround_7_1),
            ChannelLayout::standard(6),
        );

        let side_left = output_of_channel(&mix, 8, 6);
        // The back left channel gets its own and the side left: 1 + 0.707.
        let back_left_total = 1.0 + FRAC_1_SQRT_2;
        assert_close(
            &side_left,
            &[0.0, 0.0, 0.0, 0.0, FRAC_1_SQRT_2 / back_left_total, 0.0],
        );
    }

    #[test]
    fn mixes_to_a_mono_output() {
        let stereo = ChannelMix::between(
            ChannelLayout::positioned(&STEREO.map(Some)),
            ChannelLayout::standard(1),
        );
        let surround = ChannelMix::between(
            ChannelLayout::positioned(&SURROUND_5_1),
            ChannelLayout::standard(1),
        );

        assert_close(&output_of_channel(&stereo, 2, 0), &[0.5]);
        assert_close(&output_of_channel(&stereo, 2, 1), &[0.5]);
        let total = 1.0 + 2.0 * FRAC_1_SQRT_2;
        assert_close(
            &output_of_channel(&surround, 6, 2),
            &[FRAC_1_SQRT_2 / total],
        );
        assert_close(&output_of_channel(&surround, 6, 3), &[0.0]);
    }

    #[test]
    fn plays_a_mono_song_on_every_channel() {
        let mix = ChannelMix::between(ChannelLayout::unpositioned(1), ChannelLayout::standard(6));
        let mut output = [f32::NAN; 6];

        mix.apply(&[0.5], &mut output, 0.5);

        assert_close(&output, &[0.25; 6]);
    }

    #[test]
    fn keeps_unpositioned_channels_in_order() {
        let to_stereo =
            ChannelMix::between(ChannelLayout::unpositioned(3), ChannelLayout::standard(2));
        let to_mono =
            ChannelMix::between(ChannelLayout::unpositioned(3), ChannelLayout::standard(1));
        let mut stereo = [f32::NAN; 2];
        let mut mono = [f32::NAN; 1];

        to_stereo.apply(&[0.1, 0.2, 0.3], &mut stereo, 1.0);
        to_mono.apply(&[0.1, 0.2, 0.3], &mut mono, 1.0);

        assert_close(&stereo, &[0.1, 0.2]);
        assert_close(&mono, &[0.2]);
    }

    #[test]
    fn leaves_silent_the_output_channels_past_the_song() {
        let mix = ChannelMix::between(
            ChannelLayout::positioned(&STEREO.map(Some)),
            ChannelLayout::standard(4),
        );
        let mut output = [f32::NAN; 4];

        mix.apply(&[0.1, 0.2], &mut output, 1.0);

        assert_close(&output, &[0.1, 0.2, 0.0, 0.0]);
    }
}
