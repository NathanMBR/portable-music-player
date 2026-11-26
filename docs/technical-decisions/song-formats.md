# Song formats

## Status

Current, since 2026-11-26 (branch `feat/increase-audio-support`).

## Context

The player played only MP3s: the scan, the playlists and the drop listed only `.mp3` files, the [native playback engine](native-playback-engine.md) decoded them through rodio's `Decoder` with only its `mp3` feature, and the tags were read as MPEG whatever the file held. The library should take the audio formats people's songs come in: M4A, AAC, Opus, Ogg, FLAC and WAV.

The constraints:

- only audio formats: no container that holds video, so no `.mp4` or `.webm`, and no `.wma`, as the user chose;
- both OSes, with nothing installed and no C library, so the CI and the cross build from WSL stay as they are;
- every format as gapless as the engine makes MP3s, and seeks to the exact frame;
- songs come from a possibly slow USB drive, and can be large: an hour of CD-quality WAV is about 600 MB;
- a 5.1 song on a stereo device must keep its centre channel, where the vocals are;
- the release build aborts on panic, so a damaged file must fail, never panic.

## Decision

- **One list of extensions** (`library::SONG_EXTENSIONS`: `mp3`, `m4a`, `aac`, `opus`, `ogg`, `oga`, `flac`, `wav`, `wave`, in any case). The extension only says a file is a song. Its format comes from its content: symphonia's probe for the sound, lofty's `guess_file_type` for the tags. So an Ogg Opus named `.ogg` still plays and shows its tags.
- **symphonia 0.6 directly** (`song_decoder.rs`), with its MP3, AAC, ALAC, FLAC, PCM, ADPCM and Vorbis codecs and its MP4, Ogg and WAV demuxers. rodio stays for its resampler only. The decoder plays the audio track the file flags as default, else the first one a codec decodes, and never decodes the others.
- **The trims are the app's own.** Each decoded buffer is placed by its packet's timestamp and clipped to the song's playable range. symphonia already cuts the trims it marks on the packets (MP3's LAME and Xing tags, Ogg Vorbis), and the clip cuts what it doesn't:
  - MP4: the range comes from the audio track's edit list, else iTunes's `iTunSMPB` comment (`mp4_trim.rs`);
  - Ogg Opus: the song starts past its pre-skip;
  - raw AAC (ADTS) says nothing of the kind, so its priming and padding play, as in FFmpeg.
- **Seeks land on the exact frame:** decoding starts 80 ms early, then the frames before the target are dropped, counted from each packet's timestamp. When the demuxer can't seek, the song is read again from its start, its packets skipped up to the same point.
- **Opus through our own symphonia codec on opus-pure** (`opus_codec.rs`). It reads Ogg's header and MP4's `dOps` box, each in its byte order, applies the output gain, reorders surround from Vorbis order into WAVE order, and leaves the pre-skip to the container.
- **Channels are mixed into the output's** (`channel_mix.rs`): a channel the output has is copied across, one it lacks goes to the nearest ones as ITU-R BS.775 downmixes, and each output channel is scaled so it can't clip. A song of more than 8 channels isn't played.
- **A song's file is read in chunks** (`song_bytes.rs`): only the chunks the decoder asks for, wherever they are, then the rest in the background. A file up to 128 MiB is kept whole; a larger one keeps only a window around its readers.
- **Ogg FLAC's tags come through symphonia** (`ogg_flac_tags.rs`), since lofty doesn't read Ogg FLAC; every other format's come through lofty.
- **Two new errors** say why a song can't play: `NoSound`, for a file without an audio track, and `UnsupportedSound`, for sound no codec decodes.
- **The release build still aborts on panic**, and a panic hook logs the panic and the song its thread was reading first (`crash_log.rs`).

## Why

Measured on 2026-11-26. FFmpeg 6.1.1 made one file per format from the same 5 s signal (220,500 frames at 44.1 kHz, 240,000 at 48 kHz), and a probe decoded them with symphonia 0.6.1, its own trimming on:

| File | Frames | Extra at the start | Extra at the end |
|---|---|---|---|
| MP3 with a LAME tag | 220,500 | 0 | 0 |
| FLAC, WAV, ALAC in MP4, Ogg Vorbis, Ogg FLAC | exact | 0 | 0 |
| AAC in MP4 | 222,208 | 1,024 | 684 |
| AAC in ADTS | 222,208 | 1,024 | 684 |
| Ogg Opus | 240,960 | 312 | 648 |

- **MP3 and Ogg Vorbis:** symphonia marks the trims on the packets, and its decoders cut them.
- **Ogg Opus:** symphonia reports the pre-skip as the track's delay but marks only the end, on the last packet.
- **MP4:** the priming is in the edit list, which symphonia reads but doesn't apply; its README rates MP4 gapless "No". FFmpeg cuts the priming from it and keeps the padding.
- **Seeking:** symphonia's own count of the frames to drop (`required_ts − actual_ts`) is 1,024 frames too many for Vorbis, whose first packet after a seek decodes nothing. In an MP4 with a text track, like a podcast's chapters, every seek fails with `requested seek timestamp is out-of-range for stream`, since symphonia's MP4 demuxer seeks every track and the text track has no sample at most times.
- **5.1:** FLAC, WAV and Ogg Vorbis come out in WAVE order. symphonia refuses 5.1 AAC (`aac too complex`).
- **Tags:** lofty by extension fails for `.oga` and reads an Ogg Opus named `.ogg` as Vorbis; by content, it reads both, but takes Ogg FLAC for MPEG and finds no tags in it. symphonia reads Ogg FLAC's.
- **Opus decoders**, on a stereo song at 128 kb/s, against FFmpeg's libopus:

  | Decoder | Against libopus | Time for 5 s |
  |---|---|---|
  | opus-pure 0.2.5 | 136.9 dB | 20 ms |
  | symphonia-opus 0.1.3 | 132.9 dB | – |
  | opus-decoder 0.1.1 | 91.0 dB | 3.0 s |

  opus-pure has no dependencies, decodes multistream surround and applies the output gain, and its encoder and Ogg writer let the tests build real Opus files. 10,040 damaged packets made neither opus-pure nor symphonia-opus panic, and opus-pure gave no sample that wasn't finite.
- **Damaged files:** 60 damaged copies of each file, overwritten or cut short, decoded to their end and seeked, made no demuxer or decoder panic. The tests do the same on every format (`never_panics_on_a_damaged_song`, `never_panics_on_a_damaged_file`).
- **Panics:** the app built with `panic = "unwind"` was 2.21 MB larger (13,415,648 bytes against 11,200,736), while the hook costs nothing.

The tests pin what the app relies on: every format but raw AAC plays exactly its frames and seeks to the exact frame (FLAC, WAV and Ogg FLAC to the sample, the lossy codecs by their frame count), raw AAC keeps its whole packets, two FLAC or two Opus songs join without an extra frame, the MP4 seek fallback lands where a seek would, 5.1 Opus comes out in WAVE order, and the gain is applied.

## Alternatives rejected

- **rodio's `Decoder`:** it holds symphonia 0.5 inside and hides the packets' timestamps, so the app couldn't clip to a playable range or seek exactly. It retries a failing packet forever, which decodes nothing forever on a damaged file, and takes the length from the default track whatever plays.
- **FFmpeg, through bindings or a bundled executable:** C libraries to build and ship for each OS, against "nothing installed" and the cross build, and the binary would grow by megabytes.
- **symphonia-opus 0.1.3:** two weeks old, with 3,924 downloads, against opus-pure's three months and 154,524. It labels 5.1 in Vorbis order as WAVE order, so its channels would play from the wrong speakers, and Opus in MP4 came out at 79.4 dB, against 132.9 dB from Ogg, which fits a header read in the wrong byte order.
- **opus-decoder 0.1.1:** 3 s to decode 5 s of a song is too slow to play.
- **libopus, through symphonia-adapter-libopus:** it builds the reference C library with cmake.
- **Reading a song whole before it plays, as before:** an hour of WAV would reserve 600 MB, twice that with the queued song, and an M4A whose index sits at its end, as FFmpeg writes them, would be read whole before its first sound.
- **Keeping a song's first channels on an output with fewer:** a 5.1 song on stereo would lose its centre and its surrounds.
- **MP4 video, WebM and WMA:** the user dropped them. They'd have needed readers of Matroska and ASF, and a WMA decoder.

## Consequences

- The bare Linux release executable grows from 11,200,736 to 12,502,320 bytes (+1.30 MB, +11.6%), with symphonia's codecs and formats and opus-pure.
- Every format joins without a gap, except raw AAC, whose priming and padding, about 40 ms, stay. AAC in MP4 is gapless only with an edit list or `iTunSMPB`, which every FFmpeg and iTunes file has.
- These don't play, and notify `Couldn't play <title>` with the reason: AAC of more than 2 channels, AC-3 and E-AC-3; a song of more than 8 channels; Opus of a channel mapping family other than 0 and 1, or a family 1 whose stream table isn't the one Vorbis order implies, the one every encoder writes. HE-AAC is unverified: symphonia decodes AAC-LC only, so it may play only its low band, at half the rate, or fail.
- Only songs up to 128 MiB play on to their end when the drive is pulled.
- The app's code now owns the gapless trims of MP4 and Opus, a small reader of MP4's boxes, exact seeking, the channel mix and the Opus codec. symphonia 0.6's API changed from 0.5's and may change again in a minor release, so updates go through the tests.
- A seek in an MP4 with a text track reads the song again from its start, skipping its packets without decoding them, which takes a little longer than a seek.
- Opus always decodes at 48 kHz, so on a 44.1 kHz device the output opens at 48 kHz and the system's mixer resamples.
- The output's channels are assumed to be in WAVE order, the default of WASAPI and PulseAudio, which a custom channel map could change.
- opus-pure is BSD-3-Clause, whose notice must go with the app's binaries; symphonia is MPL-2.0, as it was already.
- The tests build every file they can (`test_media.rs`), and the codecs no Rust crate encodes, Vorbis, AAC and ALAC, and Opus in MP4, which no Rust crate writes, come from fixtures FFmpeg makes (`test/make_audio_fixtures.sh`).

## Revisit when

- symphonia applies MP4's edit lists and `iTunSMPB` itself: `mp4_trim.rs` would go, and the clip would cut nothing.
- symphonia's MP4 demuxer seeks past a text track's last sample: the fallback would stop firing.
- opus-pure stops being maintained, or symphonia gets an Opus decoder of its own that's as close to libopus.
- symphonia decodes HE-AAC or AAC of more than 2 channels, or a real HE-AAC song plays wrong.
- The library should take another format: symphonia's features grow, and so does the binary.
- The user wants containers that hold video, or WMA, again.
