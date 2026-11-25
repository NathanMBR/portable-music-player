# Linux song server

## Status

Superseded by [native-playback-engine.md](native-playback-engine.md) (2026-11-25): songs now play in Rust, and the webview plays no audio. It was current from 2026-11-10 (commit `cc53d37`).

## Context

The player plays songs through the webview's `<audio>` element, and the webview can only play what it can fetch:

- Tauri's asset protocol (`convertFileSrc`) and any other custom URI scheme are out: WebKitGTK, the webview on Linux, hands media to GStreamer, whose WebKit source element accepts only `http`, `https` and `blob` URLs. A song from the asset protocol fails with media error 4, then `play()` rejects with `NotSupportedError`.
- So songs first played from memory, on both OSes: `read_song` sent the whole file as raw bytes, and the webview played them from a `blob:` object URL.

On Linux that broke every song over 2 MiB. Songs jumped ahead after about 4 seconds while the timer kept counting, and a song's real ending played around the middle of the progress bar. The same happened on WSL and on Linux Mint.

Constraints:

- the app runs from a flash drive, with nothing installed, on whatever WebKitGTK the computer has (2.50 on Ubuntu 22.04, 2.52 on Ubuntu 24.04 and Fedora 44, the build machine's in the AppImage);
- songs must stay on the drive, so nothing may be copied into a cache on the computer;
- no other file of the computer, or of the drive, may be reachable through the player.

## Decision

On Linux, songs stream to the webview from `song_server.rs`, a small HTTP server on `127.0.0.1`:

- it starts with the first song (`LazySongServer`), on a free port the system picks;
- every URL carries a random 16-byte token, so other programs on the computer can't fetch songs from it;
- it answers `GET` with Range requests, so seeking works, and `Cache-Control: no-store`, so the webview keeps no copy;
- every request goes through `library::find_song_in`, the same check as `song_source`, so it serves only the MP3s of the Songs folder;
- it's built on `std::net`, one thread per connection, with no HTTP crate.

`song_source` decides where a song plays from (`STREAMS_SONGS`): `stream`, with the song's URL, on Linux; `memory` on Windows, where `read_song` still sends the whole file and WebView2 plays it from a blob URL.

## Why

WebKitGTK's own source code and a probe, with WebKitGTK 2.52.6 and GStreamer 1.24.2, found the cause:

- From WebKitGTK 2.48, every `blob:` URL plays through `playbin3` ("MSE, Blob and Mediastream require playbin3"; 2.46 and older used `playbin`). Its `urisourcebin` gets `ring-buffer-max-size` set to 2 MB, and since WebKit's source element reports itself as bandwidth-limited, GStreamer puts a `queue2` ring buffer in front of the MP3 parser.
- The ring buffer is overwritten before it's read. Identified by their pattern of frame sizes, the frames the parser received jumped, 3.8 s into a 4.8 MB song, to the frame at 2:01: 2,113,584 bytes further into the file, the ring's size plus 16 KB.
- Control tests:

| Test | Result |
|---|---|
| A 1.67 MB song from a blob URL | correct |
| The 4.8 MB song with its tags and cover stripped, from a blob URL | the same jump at 0:03.8 |
| The 4.8 MB song from `http://127.0.0.1`, with Range support | correct, and `ended` came on time |
| `preload` set to `metadata` or `none` | still broken |

- Blob loads also failed now and then with `NotSupportedError`, GStreamer logging "invalid MPEG version/bitrate/samplerate" and "Resource not found".
- The closest upstream report, GStreamer #1554 ("queue2: overwrite in ring-buffer modes"), was closed without a fix.

With the server, every frame played in order in the probe, and on 2026-11-12 the CI AppImage played correctly on Linux Mint 22.1, with Windows unchanged.

## Alternatives rejected

- **Tauri's asset protocol, or a custom URI scheme of the app's own:** WebKitGTK can't play media from them (Tauri #3725, open since 2022 and reported again on Fedora 44 with WebKitGTK 2.52.5; WebKit bug 146351).
- **Smaller blobs, or a different `preload`:** the ring buffer is 2 MB whatever the page asks, and `preload` didn't change the jump.
- **Media Source Extensions:** WebKitGTK reports `audio/mpeg` as supported, but its append pipeline rejects MP3 ("Unsupported track codec").
- **Decoding the songs with Web Audio (`decodeAudioData`):** it decodes a whole song into memory before it plays, about 90 MB of 32-bit samples for a 4-minute stereo song, so a song would start late on a slow drive, and the `<audio>` element's seeking, events and media session would all have to be rebuilt.
- **The server on Windows too:** WebView2 plays blobs fine, and Chromium's planned Local Network Access checks would ask the user before a page reaches a local server.

## Consequences

- The app opens a port on `127.0.0.1` while it runs on Linux. Only programs on the same computer can reach it, and only with the token.
- Songs play from the drive as the webview reads them, without reading the whole file first, so a song starts sooner on a slow drive than it does on Windows.
- The two OSes play songs from different sources: `songAudio.ts` handles both (`SongSource`), and `read_song` is used only on Windows.
- `getrandom` is a dependency for the token alone.
- The server's threads must never panic: the release build aborts on panic, which would kill the app. A failed write only means the webview let go of the song.
- A CSP added later must allow `http://127.0.0.1:*`, and `blob:` for Windows, as media sources.
- Playback on Linux still depends on GStreamer's good plugins, on the host or bundled in the AppImage (`bundleMediaFramework`).

## Revisit when

- WebKitGTK plays large `blob:` media correctly again, or plays media from custom URI schemes: the server could go, and both OSes would share one source.
- Chromium's Local Network Access lands in WebView2 in a way that also affects the blob path.
- Playback moves out of the webview, as the gapless playback plan proposes: the webview would no longer fetch songs at all.
