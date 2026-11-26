# Portable Music Player

Portable music player made with Node.js, TypeScript, Tauri and React

## Features

- Can run without installation on Windows and Linux
- Keeps all its data next to the executable
- Log of clicks, switches, songs, jumps, pages and sound outputs, in the terminal and the `Logs` folder
- Songs library from the `Songs` folder
- Plays MP3, FLAC and WAV files
- Song titles and artists from their tags, in the song list and the player
- Song cover miniatures from their tags
- Songs sorted by title or by filename
- Song lists highlight the hovered song, and the song in the player in the list it plays from
- Open the `Songs` folder
- Scan the library again, with a notification counting the songs
- Add songs by dropping files or folders on the window
- Playlists page, from the `Playlists` folder
- Create playlists, picking their songs with a search
- Edit a playlist's title, description and songs
- Play, open and delete playlists, with an Undo notification
- Playlist covers, from their first song with one
- Reorder and remove the numbered songs of a playlist
- Move a playlist's song before or after another, found by name or position
- Flags playlists whose songs are missing, until a recheck finds them
- Audio player with shuffle, repeat, volume and seeking
- Gapless playback between songs
- Volume from the mouse wheel
- Seeking from the arrow keys
- Tooltips on the song's progress and the volume showing where a click lands
- Media keys and the system's media controls
- Window title names the song in the player
- Remembers the volume, repeat, shuffle and the song in the player, with its position and playlist
- Side menu with the categories
- Settings page
- Checks for updates when the app opens, or from the Settings page
- Update notice in the side menu with the new version's changes
- Updates installed builds in place; portable builds download in the browser
- Dark theme
- Error and success notifications in the bottom-right corner
- Remembers the window size on each computer
- Always opens centered

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

[MIT](./LICENSE)
