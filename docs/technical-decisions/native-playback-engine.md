# Native playback engine

## Status

Current, since 2026-11-25 (branch `feat/gapless-playback`). It supersedes [linux-song-server.md](linux-song-server.md).

## Context

The player should play an album the way it was mastered: one song straight into the next, without silence between them. Through the webview's `<audio>` element there were about 0.5 s of silence at every song change, from two causes:

- **The player was torn down and rebuilt at every song change.** The `ended` event went to the store, which picked the next song. The webview then emptied the element and asked Rust where the song plays from. On Windows, Rust sent the whole file over IPC from a possibly slow drive. The webview then built a new media pipeline, prerolled it and played, closing and reopening the audio device in between.
- **MP3 padding.** Every MP3 encoder adds silence: the encoder's delay at the start, plus the decoder's own 529 samples, and padding at the end to fill the last frame. Every song of the dev `Songs` folder carries an Info tag written by FFmpeg (`Lavc60.31`), with a delay of 576 samples and padding between 576 and 1,681. A padding of 1,216 means 37 ms of silence at 48 kHz. A player that doesn't cut it can never be gapless, however fast it starts the next song.

The constraints:

- both OSes, from the same code where possible, with no installation: nothing the host lacks may be required;
- songs come from a possibly slow USB drive;
- the media keys and the system's media controls must keep working;
- the React store stays the source of truth for what should play, so the UI, the logs and the saved state don't change.

## Decision

Songs play in Rust (`src-tauri/src/playback/`), and the webview plays no audio:

- **One decode thread per song in the player** (`song_feeder.rs`): the current one and the queued one. Each reads its song's file into memory as it goes (`song_bytes.rs`), decodes it with symphonia (`song_decoder.rs`), MP3, FLAC or WAV, with gapless trimming on, and decodes about 1.5 s ahead.
- **The audio thread only copies samples** (`song_chain.rs`, in cpal's callback). It switches to the queued song's blocks on the very next sample once the current one ends. It never blocks, locks or allocates.
- **The output is a cpal stream opened at the rate of the song that plays** (`output.rs`), so the system's mixer does any resampling. A song of another rate reopens it once the current song ends, which leaves one short gap there, the same as mpv's default. The stream is paused (corked) while the player is paused.
- **The webview always tells Rust which song comes next** (`queue_next_song`), by the same rule the store follows when a song ends (`findTrackAfterEnd`). When Rust starts it, the store moves to it without loading anything (`songEngine.ts`). Each song carries an id the webview counts up, so events about a song no longer in the player are ignored.
- **souvlaki takes over the media keys and the system's media controls** (`media_controls.rs`): MPRIS on Linux, over zbus, and Windows' media transport controls.

The crates are symphonia 0.6 (decoding), rodio 0.23 (its resampler only, no features), cpal 0.18 (`pulseaudio` feature) and souvlaki 0.9 (`use_zbus`). rodio's `Decoder` did the decoding at first; symphonia is used directly since, so a song's trims and seeks are the app's own.

## Why

**How mpv does it**, from its manual and published source:

- With `--gapless-audio=weak`, its default, mpv keeps the audio output open between files. It closes and reopens the output only when the decoded format changes.
- It moves on to the next file while the output still plays the last one's buffered tail. Opening and decoding the next file happens under that buffer.
- Its trimming comes from FFmpeg's `libavformat/mp3dec.c`. It reads the delay and padding from the Info tag's LAME extension when the encoder is `LAME`, `Lavf` or `Lavc`, and adds the decoder's delay of 529 samples.

symphonia's gapless mode follows the same rule (symphonia-bundle-mp3 0.5.5, `try_read_info_tag`).

**What the webviews can do**, measured on 2026-11-25 with a probe page in WebKitGTK 2.52.6 (GStreamer 1.24.2) and Chromium 156, through Playwright, standing in for WebView2. The probe song decodes to 2,294,831 samples trimmed and 2,297,088 untrimmed:

| Check | WebKitGTK 2.52.6 | Chromium 156 |
|---|---|---|
| `<audio>` duration | 47.856 s (untrimmed) | 47.809 s (trimmed) |
| `decodeAudioData` length | 2,297,088 (untrimmed) | 2,294,831 (exact) |
| Appending the MP3 to a `SourceBuffer` | fails: `Unsupported track codec: audio/mpeg` | works |
| Two songs appended with `timestampOffset` and an append window | not possible | one buffered range, exactly the two trimmed lengths |

So only Chromium could be gapless from the webview, and WebKitGTK plays the padding whatever the page does.

**cpal on this machine**, checked before building on it: PulseAudio is the first host, through WSLg's server. Streams open in 8 to 21 ms at 22.05, 44.1, 48 and 96 kHz. A 40 ms buffer gets 25 callbacks a second. A paused stream gets none.

**Removing the webview's audio also removed its workarounds**, each for a bug of the webviews' media stacks:

- the song server, for WebKitGTK's `blob:` ring buffer;
- the progress estimate, for PulseAudio's clock stalls in WSL and on Linux Mint;
- reloading a song held paused before playing it, for WebKitGTK freezing in WSL;
- the `canPlayType` check, for WebKitGTK freezing without GStreamer's plugins.

## Alternatives rejected

- **A second `<audio>` preloading the next song, started on `ended`:** the gap shrinks to the element's start latency but never reaches zero, and WebKitGTK's padding stays. A preloaded element is also one held paused, the very state that froze WebKitGTK in WSL. Its workaround, loading again before playing, throws the preload away.
- **Media Source Extensions:** they are gapless to the sample in Chromium, but WebKitGTK 2.52 can't append MP3 at all. Two engines, or transmuxing MP3 into fragmented MP4 for WebKitGTK, would be fragile and double the work.
- **Web Audio (`decodeAudioData`, then `AudioBufferSourceNode.start(when)`):** its scheduling is exact, but each song is decoded whole into memory before it can start. At 48 kHz stereo that is about 115 MB for a 5-minute song, and a click would wait for the whole file to be read from the drive and decoded. The media keys are tied to media elements in both webviews. And WebKitGTK's Web Audio goes through the same GStreamer and PulseAudio path whose clock stalls.
- **rodio's own output (its mixer and device sink):**
  - it resamples by linear interpolation, which dulls the high frequencies of 44.1 kHz songs on a 48 kHz device;
  - it keeps the cpal stream private, so it can't pause the device;
  - it decodes on the audio thread, where its decoder allocates a buffer per packet.

  cpal is used directly instead, and rodio only for its resampler, on each song's own thread.
- **One output kept at the device's rate, resampling every song:** no gap at a rate change, but every 44.1 kHz song on a 48 kHz device would go through our resampler instead of the system's.

## Consequences

- Songs follow each other without a gap, repeat one loops without one, and repeat all wraps around without one. A change of sample rate between two songs leaves one short gap, while the output reopens.
- Linux playback no longer needs GStreamer's good plugins, so the AppImage no longer bundles them (`bundleMediaFramework` is gone). Linux now needs ALSA's library at runtime (`libasound.so.2`, on every desktop) and its headers to build (`libasound2-dev`, installed by the three workflows).
- The media keys work on any webview version, with no need for WebKitGTK 2.46's MPRIS support.
- The app no longer opens a port on `127.0.0.1`, and a song put back when the app opens takes the sound device only once it plays.
- The progress comes from the output's own clock, a frame count, so the estimate is gone. Seeking decodes from memory, to the exact sample.
- A song fully read keeps playing when the drive is pulled, if it's kept whole: one up to 128 MiB, nearly every song. A larger file keeps only a window around its readers, so it stops once the drive is pulled and its window runs out. The player holds the files of two songs at most, plus about 1.5 s of decoded samples for each.
- Songs are about 47 ms shorter on Linux, with the padding cut. Windows already cut it.
- Apple-encoded MP3s keep their padding of about 40 ms, since symphonia doesn't read the `iTunSMPB` comment, but the half-second gap still goes.
- Following the output device is now this code's job:
  - WASAPI reports a changed default device through the stream's error callback;
  - on Linux the default device is checked every 2 s, so the old one can play for up to 2 s, then there's a short hiccup.
- On Linux, cpal names its PulseAudio client `cpal-pulseaudio-<pid>`, so the volume mixer shows the app under that name, and cpal 0.18 offers no way to change it.
- Real-time audio code is now ours, and none of it may panic, since the release build aborts on panic.
  - cpal's `default_host()` panics when ALSA can't start, so the hosts are picked by hand.
  - souvlaki's zbus thread panics without a session bus, or when its bus name is taken. It connects only once the bus accepts connections, under a name unique to the process. A bus that dies after the app connected still ends in that panic.
- souvlaki's Windows backend shows fast-forward and rewind buttons that do nothing.
- The joining logic is unit-tested on a fake output. Real devices, Bluetooth and the media keys can only be checked by hand. The Windows code is checked only by the CI build.
- Builds are slower, with zbus, symphonia and cpal, and the bare executables are larger.

## Revisit when

- cpal lets the app name its PulseAudio client, so the volume mixer shows the app's own name.
- symphonia reads `iTunSMPB`, or the library gets Apple-encoded MP3s, whose padding should then be read by hand.
- souvlaki's zbus backend stops panicking on a lost bus, or the app needs to survive one.
- The library takes formats other than MP3, FLAC and WAV: symphonia's features grow, and so does the binary.
- A song change between two sample rates needs to be gapless too: the output would then stay at one rate and resample every song itself, with a good resampler.
