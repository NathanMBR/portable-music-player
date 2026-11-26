# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## Project goal

A portable music player that runs on Linux and Windows **without installation**, so it can live on a flash drive. The drive holds both executables (one per OS) side by side; the user runs whichever matches their current OS. All app data (library, playlists, settings, etc.) is stored as `.json` files **in the same folder as the executable**.

Built with Tauri 2 + React 19 + TypeScript. The features implemented so far are listed under **Features** in `README.md`.

## Commands

Package manager is **pnpm**.

```bash
pnpm install
pnpm exec playwright install chromium   # once per machine: the browser the story tests run in
pnpm tauri dev          # run the desktop app (starts Vite on :1420 via beforeDevCommand)
pnpm dev                # frontend only, in a browser (Tauri APIs unavailable)
pnpm build              # tsc type-check + vite build to dist/
pnpm tauri build        # release build of the native app
pnpm lint               # tsc --noEmit type-check (writes nothing), then biome check --fix: lint + format, applying safe fixes
pnpm lint:ci            # tsc --noEmit type-check, then biome check without fixes; reserved for the CI workflow
pnpm test               # every test: the TypeScript tests, then the Rust tests
pnpm test:ts            # every Vitest test once: unit tests (jsdom) + every story (headless Chromium)
pnpm test:ts:unit       # only the TypeScript unit tests
pnpm test:ts:storybook  # only the story tests
pnpm test:rs            # only the Rust tests (cargo test)
pnpm test:report        # every test, writing reports to private/test-report/ (needs cargo-nextest, see below)
pnpm test:watch         # the Vitest tests in watch mode
pnpm storybook          # Storybook on :6006: the UI documentation, and the MCP server for agents
pnpm build-storybook    # static Storybook in storybook-static/
cargo check --manifest-path src-tauri/Cargo.toml
```

`pnpm test:report` runs `test/generate_test_report.sh`: Vitest writes a single-file HTML report to `private/test-report/typescript/index.html` (the `test-report` mode in `vite.config.ts`, through `@vitest/ui`), and nextest writes a JUnit report of the Rust tests, copied to `private/test-report/rust/junit.xml` (the `report` profile in `src-tauri/.config/nextest.toml`). Both suites always run, so one failing still reports the other. It needs cargo-nextest once per machine: `cargo install cargo-nextest --locked`.

In dev the executable is `src-tauri/target/debug/portable-music-player`, so the app's `Songs` and `Logs` folders are `src-tauri/target/debug/Songs` and `src-tauri/target/debug/Logs` (gitignored). CI (`.github/workflows/quality-assurance.yml`) runs `pnpm lint:ci`, `pnpm test:ts` and `cargo test` on every push to `master` and `development`. `lint:ci` is only for that workflow; when working locally, always use `pnpm lint` so issues get fixed. Two workflows, each a copy of Tauri's official publish workflow, build the Linux (`ubuntu-22.04`) and Windows (`windows-latest`) releases: the bare executables, the AppImage, the Windows installers and the updater's `latest.json`. They differ only in their trigger and release settings, so a change to the build goes in both:
- `publish-stable.yml`, when Quality Assurance passes on a push to `master` (`workflow_run`, so it builds and tags the commit QA tested): a draft release tagged `v<version>`, whose description, and `latest.json`'s `notes`, are the version's patch notes (`docs/changelog/v<major>-<minor>-<patch>.md`, read by its first step, which fails the build when the file is missing; see Releases), its files named `<binary>_<version>_<platform>_<arch>[-setup]<ext>` (`releaseAssetNamePattern`), the names a portable build's download links to (`download_url` in `updates.rs`);
- `publish-unstable.yml`, on every push to `development`, without waiting for Quality Assurance: a pre-release tagged `v<version>-unstable.<run id>.<run attempt>`, with `unstable` and `<run id>_<run attempt>` (just before the extension) in every file name, so downloads of different builds never overwrite each other.

Both sign the updater artifacts with the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets, and turn on `bundle.createUpdaterArtifacts` only in their build command, so a local `pnpm tauri build` needs no key. Signing requires the matching public key in `plugins.updater.pubkey` of `tauri.conf.json`: without it, bundling fails with `plugins > updater doesn't exist`. The app checks the stable releases only (see `updates.rs`): the unstable ones upload a `latest.json` too, which it never reads.

## Architecture

- `src/`: React frontend, bundled by Vite into `dist/`, which Tauri embeds into the binary (`frontendDist`). The frontend calls Rust through `invoke()` from `@tauri-apps/api`.
- Styling is Tailwind CSS v4 via the `@tailwindcss/vite` plugin. Configuration is CSS-first: there is no `tailwind.config.js`; theme customization goes in `@theme` blocks in `src/index.css`, which is imported by `main.tsx`. Biome's `css.parser.tailwindDirectives` is enabled so `@theme`, `@apply`, etc. parse.
- UI primitives come from Headless UI (`@headlessui/react`, unstyled and accessible; style it with Tailwind) and icons from Heroicons (`@heroicons/react/24/outline`, `/24/solid`, `/20/solid`, `/16/solid`).
- Notifications in the bottom-right corner come from Sonner (`sonner`), only through `src/features/notifications/notify.ts`: `notifyError(title, error)` for failures, `notifySuccess(title, description?)` for what went well, `notifyUndoable(title, undo)` for what was just done, with an Undo button (Sonner's `action`, styled by `NotificationArea`), and `notify(title, description?)` for anything else. Features never import `sonner` directly. `NotificationArea` renders Sonner's `Toaster` once, from `App.tsx`, as a portal on `<body>`: the side menu's modal dialog makes the app's root inert, and a notification raised from the menu must stay reachable.
- Logs: what the user does and what plays goes to the log through `log(message)` (`src/features/logging/log.ts`), which hands it to Rust's `write_log` (`logs.rs`) without waiting: Rust prints it to stdout and saves it in the Logs folder, under the `webview` target. A failed write notifies. The messages follow **Logging** below, each logged where it's known for sure:
  - buttons: `buttonLog.ts`, connected once from `main.tsx`, logs every click on a `<button>`, by its accessible name (`accessibleNameOf`, `src/components/accessibleName.ts`). It listens in the capture phase, so a plain click is logged before what it does. A toggle (`aria-pressed`, `IconButton`'s `isPressed`) or a button with three or more states (`data-state`, `IconButton`'s `state`) is logged a task later, once React has drawn the state the click left, with the name the button had when clicked;
  - switches and checkboxes: `Switch` and `Checkbox` log themselves (`logToggle`), though they're otherwise feature-agnostic, because Space toggles them without a click; `buttonLog.ts` skips switches, and a Headless checkbox isn't a `<button>`;
  - selects: `Select` logs its list opening and closing (from Headless UI's `open`, skipping the first render) and the option chosen, from the pointer or the keyboard alike, by the select's label alone (`labelOf`), without the chosen option its button's accessible name includes. `buttonLog.ts` skips a select's button (`aria-haspopup="listbox"`), since the keyboard opens it without a click;
  - menus: `ActionMenu` logs its opening and closing the same way (`useOpenStateLog`, shared with `Select`), by its label. `buttonLog.ts` skips its button (`aria-haspopup="menu"`) for the same reason, and logs its items, which are `<button>`s, like any other: Headless UI clicks the item on Enter and Space too;
  - radio groups: `RadioGroup` logs the option chosen, from the pointer or the keyboard alike, by the group's label and the option's, since the arrows choose an option without a click;
  - songs: the playback store logs them only when the state changes, whether from a button, the media keys or Rust, as when the queued song takes over. A song that ends with nothing after it is `Stopped`;
  - jumps and the volume: the progress bar (`formatPreciseTime`) and the volume slider log from the slider's `onCommit`, at the end of a click or drag and at each key press or turn of the wheel, not at every step of a drag;
  - pages: the navigation store logs them when the category changes;
  - playlists: the playlists store logs one created, opened, deleted or brought back, and a song moved, removed or put back;
  - drops: the song drop store logs the songs a drop holds and the songs it copied;
  - updates: the update store logs what each check found, a check at launch that failed, and an update skipped; `PatchNotes` logs a link it opens; Rust logs a download opened in the browser and an install starting;
  - the sound output: Rust logs each one it opens, with its device and rate, and one it loses (`playback/engine.rs`);
  - Rust logs the app's opening and closing (see `logs.rs`), and a crash, with the song being read then (`crash_log.rs`).
- Frontend state is managed with Zustand (`create<State>()(...)` stores). Persistent data still goes through Rust commands to the JSON files, not Zustand's `persist` middleware (which would use webview `localStorage`, outside the flash drive).
- `src-tauri/`: Rust backend. `main.rs` only calls `portable_music_player_lib::run()` in `lib.rs`, where commands are registered in `generate_handler![...]`. New permissions for plugins have to be added in `src-tauri/capabilities/default.json`.
- Release profile in `Cargo.toml` is tuned for small binaries (LTO, strip, `panic = "abort"`).
- App icons: `src-tauri/icons/app-icon.png` (1024×1024, transparent: "PMP" in the side menu title's type and `ink`, on a `paper` circle) is the source of every icon. Regenerate them with `pnpm tauri icon src-tauri/icons/app-icon.png`, then delete what it adds beyond the files already there (`64x64.png`, `android/`, `ios/`). `public/favicon.svg` is the same design, with the letters as paths. Cargo doesn't track the icon files, so an existing dev build keeps the old ones until the crate recompiles.

### Frontend layout

```
.storybook/             Storybook config: main.ts (addons, components manifest), preview.tsx (app CSS,
                        theme toolbar, fake Rust commands, store reset, a11y checks)
src/
  main.tsx              entry: font + CSS imports, restores settings, checks for updates, starts the first
                        library scan, lists the playlists, renders <App />
  App.tsx               page shell
  index.css             Tailwind import, @theme design tokens, dark overrides, base styles
  constants.ts          app-wide constants (APP_TITLE_LINES); feature constants live in their feature
  clamp.ts              keeps a number within a range, for the stores and the components alike
  compareNames.ts       compares names for sorting the same way on every computer (songs, playlists)
  components/           feature-agnostic UI built on Headless UI
    <Component>/        one folder per component (ActionMenu, AlertMark, Button, Checkbox,
                        ConfirmDialog, EmptyState, IconButton, ListRow, Marquee, Modal, Notice,
                        NotificationDot, RadioGroup, ScrollBox, Select, Slider, SortableList,
                        StatusLine, StepTabs, Switch, TextField, Tooltip, ViewHeader,
                        ViewLayout): <Component>.tsx
                        and every <Component>.* file that belongs to it, like its stories
    buttonStyles.ts     the looks and states every button shares, so it sits outside any one component
    useOpenStateLog.ts  logs a popup's opening and closing, for Select and ActionMenu alike
    usePrefersReducedMotion.ts  whether the system asks for reduced motion, for motion run from
                        script, like Marquee's slide, which motion-reduce: can't stop
  features/<feature>/   everything one feature owns
    types.ts            data shapes returned by Rust (mirror the Rust structs)
    <feature>Api.ts     the only place that calls invoke() for the feature
    <feature>Store.ts   Zustand store: state + actions
    *.ts                pure helpers (sorting, formatting)
    *.test.ts           unit tests of the module next to them
    <Component>/        one folder per feature component, like those of components/
      <Component>.tsx
      <Component>.stories.tsx  its stories: its documentation and component tests
  docs/                 Storybook MDX pages (Introduction, Design tokens)
  testing/              helpers shared by tests and stories (mockCommands, resetStores, shownNotifications,
                        loggedMessages, withNotificationArea, covers, untilBrowserPointerSettles, unit
                        test setup)
```

- Components are `PascalCase.tsx`, each in a `<Component>/` folder with its stories; other modules are `camelCase.ts` and stay at the root of their feature (or of `components/`).
- Styling is Tailwind utilities in JSX. Reuse goes through React components, not `@apply` (base styles in `index.css` are the exception). Style Headless UI states with `data-hover:`, `data-focus:` and `data-disabled:`. A plain element that needs those states, like a list's row (`ListRow`), gets them from Headless UI's `DataInteractive`, never from `hover:`: stories can hover it with `userEvent`, and synthetic events don't trigger `:hover`.
- Buttons and other controls take their look and states from `src/components/buttonStyles.ts`: a `variant` named by look (`quiet`, `outlined`, `filled`), `ACTIVE_CLASSES` for whatever is on (pressed toggles, the playing song's button and row, the current category), `FOCUS_CLASSES` (`STRETCHED_FOCUS_CLASSES` for a button stretched over a row) and `DISABLED_CLASSES`, and for the panel a button opens, a select's list or a menu, `POPUP_CLASSES` and `POPUP_OPTION_CLASSES`, and for a form's steps, `STEP_TAB_CLASSES` and `STEP_INDICATOR_CLASSES`. Components own only their geometry. Add a new look there instead of hand-writing colors in a component.
- Colors come only from the semantic tokens in `src/index.css` (`paper`, `ink`, `ink-faded`, `rule`, `pen`, `correction`, `shade`). Tailwind's default palette is disabled with `--color-*: initial`. Use `shade` for dimming overlays: `ink` turns light in dark mode, so it would brighten instead of dim.
- The theme is the `data-theme` attribute (`light` or `dark`) on `<html>`, and the dark values of the same tokens live under `:root[data-theme="dark"]`, so components never use `dark:`.
  - An inline script in `index.html` sets the attribute from the OS before the first paint.
  - `src/features/settings/settingsStore.ts` then applies the saved theme, if there is one, and the toggle saves new choices.
- Settings: `settingsStore.ts` holds the settings of `settings.json` (theme, `checksForUpdates`, `skipUpdateVersion`, `songOrder`, and the player's state in `playback`) and saves each choice as it's made. The Settings view (`SettingsView`) shows the update search and song order, each in a `SettingCard` (label at the left, controls at the right), the update search's switch with `CheckForUpdatesButton` before it; the theme toggle stays in the side menu.
  - `checksForUpdates` (on by default) has the app look for a newer release each time it opens (see Updates).
  - The library store keeps the songs in the order Rust lists them, and the Songs view sorts them (`sortTracks.ts`) as `songOrder` says: by title (the default), or by file name without its extension. Sorting at render applies a new order at once, and still sorts the first scan when the settings load after it.
- Updates: the update store (`src/features/updates/updateStore.ts`) looks for a newer stable release through Rust's `check_for_update` (`updates.rs`), and keeps the one it finds (`foundUpdate`), which it offers until it's skipped.
  - `main.tsx` calls `checkAtLaunch` once the settings load, and it checks only while `checksForUpdates` is on. It passes over a release whose version is `skipUpdateVersion`, the one the user skipped, though a newer one is offered again.
  - A check at launch that fails is only logged, never notified: a flash drive often runs on offline computers, where a notification at every launch would nag.
  - `CheckForUpdatesButton`, in the Settings view, checks by hand (`checkByHand`), offering even the version skipped: it says when nothing newer is found (`notify`), and notifies a failure. It's disabled while `checksForUpdates` is on, and while any check runs (`isChecking`), when it reads "Checking for updates…".
  - While an update is offered, a `NotificationDot` (`src/components/`, a decorative pen dot ringed with the paper) sits on the corner of `MenuButton`, and the side menu shows an Update option after the categories, outside their `<nav>` since it isn't a page, with the dot on its icon (`MenuOption`'s `hasNotificationDot`). The option closes the menu, then opens `UpdateDialog` (`openDialog`), rendered once from `App.tsx`, so the two dialogs never stack.
  - `UpdateDialog` shows the release's patch notes, `latest.json`'s `notes`, in a `ScrollBox`, through `PatchNotes`: Markdown rendered by `react-markdown`, never as HTML. Its headings start at h3, under the dialog's title. A link opens in the default browser (`openLink`, plugin-opener's `openUrl`, allowed by `opener:default`), so the webview never leaves the app; images are left out, since the app loads nothing from the web, and raw HTML is skipped (`skipHtml`).
  - Skip update (`skipUpdate`) stops offering the update, which takes the dots and the option away, and saves its version as `skipUpdateVersion` in `settings.json`.
  - Download update (`downloadUpdate`) calls Rust's `install_update`, which decides from the build (`build_of`, from `tauri::utils::platform::bundle_type()`): an executable inside the NSIS or MSI installer downloads and installs the update with Windows' passive install mode (`plugins.updater.windows.installMode`), a progress bar only, which closes the app and opens the new version; the AppImage and the bare executables, which the bundler leaves unmarked, open the new file's direct link in the default browser (`download_url`). While it runs (`isDownloading`), the button reads "Downloading update…", both buttons are disabled, and the dialog can't be closed. Then the dialog closes, and the update stays offered until the new version runs. A failure keeps the dialog open and notifies.
  - A disabled `Button` says why in a `Tooltip` above it while a mouse or pen is over it (`disabledReason`, also its description for screen readers), like "Disabled while automatic update checks are on". A disabled `<button>` may get no pointer events, depending on the webview, so the button lets the pointer through (`pointer-events-none`) to a wrapper, which follows it and shows the not-allowed cursor. Which pointers hover is `canHover` (`pointerHover.ts`), shared with `Slider`.
- Navigation: `src/features/navigation/categories.ts` lists the side menu's categories, each drawn as a `MenuOption` (`CategoryList`). `App.tsx` maps each category id to its view, so navigation never imports feature views. `App.tsx` also renders `MenuButton` in the views' left margin, so views never include it. Every view is a `ViewLayout` (`src/components/`) with a `ViewHeader`, which keep equal side margins with `px-gutter` (the `gutter` spacing token), so nothing sits under the button. Every header looks the same: the view's icon, title and buttons above the rule, nothing else; anything more about the view, like the Songs view's song count, goes below the rule, at the top of its content (`StatusLine`). A page inside a category, like a playlist, has a back button in the icon's place (`back`). A view with nothing to list says so in its middle (`EmptyState`). A new category is one entry in `CATEGORIES` plus one view in `viewByCategory`.
- Scrolling: the window never scrolls. `App.tsx` makes the page exactly the window's height, and each view keeps its header in place and scrolls only the content below it (`main`).
  - The app draws every scrollbar itself: `::-webkit-scrollbar` base styles in `src/index.css`, `scrollbar` spacing token for the width. WebKitGTK and WebView2 both draw those, and WebView2 would ignore them if `scrollbar-color` or `scrollbar-width` were set.
  - The scrollbar sits in the right gutter, beside the content, and the content keeps the width between the gutters, like the header (`px-gutter`). The scroll area stops inside the right gutter (see `ViewLayout.tsx`) and uses `overflow-y-scroll`, so the scrollbar always keeps its room and only hides while nothing scrolls: WebKitGTK ignores `scrollbar-gutter`.
  - Playwright hides scrollbars by default, so the story tests launch Chromium without `--hide-scrollbars` (`vite.config.ts`) to lay them out like the webviews.
- Rescans: every scan after the first, the one at launch (`main.tsx`), ends with a success notification counting the songs, like "Scan again" does. The library store tells them apart by `lastScan`, which is `null` only before the first scan finishes.
- Covers: each row of the song list shows a square miniature of its song's embedded cover (`CoverThumbnail`), read apart from the scan, which skips pictures to stay fast on a slow drive.
  - A square asks for its cover only once it has stayed on screen for `COVER_READ_DELAY_MS` (`useHasStayedOnScreen.ts`, on `useIsOnScreen.ts`, an `IntersectionObserver`), so a long list reads only the covers it shows, and the rows a fast scroll flies past read nothing.
  - A playlist's row shows the cover of its first song that has one: `CoverThumbnail` takes a list of songs (`paths`, one for a song's row), here the playlist's songs the last scan found, in its order (`foundPathsOf`), and reads their covers one after the other, without waiting on screen again, until one has a cover (`firstSongThatMayHaveCover`, `coverSearch.ts`). A picture the webview can't draw is passed over like a missing one. With no cover among them, or no songs found, it shows its `placeholderIcon`, the Playlists icon.
  - `read_cover` (`library.rs`) sends the picture's bytes as they are (`tauri::ipc::Response`), the same way on both OSes, or no bytes when the song has none; `readCover` in `libraryApi.ts` turns no bytes into `null`. The webview scales the full picture down into the square (`object-cover`), so no image crate is needed. A custom URI scheme could serve the images instead, but a command can be mocked in stories and tells a song without a cover from a failure.
  - `coverStore.ts` keeps each cover as an object URL, by track path. It frees the pictures asked for longest ago past `MAX_CACHED_COVERS`, and all of them after every scan (`forgetCovers`), so changed covers are read again. A read that finishes after its cover was freed is dropped. The songs known to have no cover hold no bytes, so they don't count and stay known until the next scan: a playlist's square would otherwise read them again, round after round.
  - A song without a picture, or whose tags can't be read, shows the placeholder: Heroicons' `PhotoIcon` (it has no crossed-out photo) in `ink-faded` on `rule`. So does a picture the webview can't draw, through the image's `error` event. Only a cover Rust can't read at all, because the song vanished or the drive was pulled, is a failure: it shows the placeholder too, and notifies under one title, so failing rows replace one notification instead of stacking one each.
- Playback: `App.tsx` renders `AudioPlayer` after the views, never inside one, so a song keeps playing when the category changes. The `player` spacing token in `src/index.css` sets the player's height, and, only while it's open, the space kept for it at the bottom of the window (`pb-player`, eased with the player's slide) and the notifications' bottom offset (`NotificationArea`'s `bottomClearance`, eased the same way), so nothing hides behind it. `App.tsx` adds up the room of everything floating at the bottom for the notifications (`stackClearances`): the player and the New playlist button.
  - The notifications' easing is in important utilities (`!`) on Sonner's list: Sonner's stylesheet sits in no cascade layer, so it beats Tailwind's layered utilities otherwise. They keep Sonner's own `transform` transition, the lift of a hovered stack. `App.stories.tsx` checks that the list moves with the player's own timing and curve, so a change to the player's slide shows up there.
  - Songs play in Rust (`src-tauri/src/playback/`, see Rust layout), never in the webview, so one follows the next without a gap: the webview's `<audio>` element was torn down and rebuilt at every song change, about half a second of silence, and WebKitGTK also played the silence MP3 encoders pad songs with. `src/features/playback/songEngine.ts` is the only module that drives the engine, through `playbackApi.ts`. `main.tsx` connects it once; it then follows the playback store (song, play state, position, volume) through Rust's commands, and reports the song's length, progress and end back to it from Rust's events. Stories never connect it, so they stay silent.
    - Each song Rust is given gets a new id, counted up by the webview, which every event about it carries (`playback:song-started`, `playback:song-ended`, `playback:progress`): an event about a song no longer in the player is ignored.
    - Rust always holds the song that plays once the current one ends (`queue_next_song`): the one the store's `finishSong` moves to, the same song under repeat one, else the next in the play order (`findTrackAfterEnd`, `playOrder.ts`), queued again whenever it changes, as with repeat or shuffle. It starts on the very next sample, Rust says so (`playback:song-started`), and the store moves to it by the same rule, so nothing loads again. With nothing queued, Rust says the song ended (`playback:song-ended`), and the store moves on or stops. A song that can't be opened isn't queued: the store plays it like any other when it's its turn, which notifies.
    - The position Rust and the store last agreed on (`agreedSeconds`) tells a jump from progress: when the store's position differs, something other than Rust moved it, like the progress bar or a song starting over, and Rust jumps there (`seek_song`). Progress Rust sent before a jump reached it is ignored, so the bar never moves back.
    - The progress comes from the output's own clock, the frames it played, every 100 ms, so it needs no estimate.
    - A song that can't be played (`play_song` or `set_playing` fails: the file is gone or damaged, or no sound output opens) notifies under `Couldn't play <title>` and pauses; playing again tries again. A sound output lost with no other to move to notifies under `Lost the sound output` and pauses.
  - The frontend never handles absolute paths, except the ones a drop hands it (see Song drop): it gives Rust a track's relative path, and Rust finds its file (`library::find_song_in`).
  - Where a song plays from: the playback session keeps the list it was started from (`source`, a `PlaybackSource` in `playbackSource.ts`: the Songs view, or a playlist by its file name), given to `playTrack` by every list and kept by next, previous, a song's end, repeat and shuffle; a song put back when the app opens plays from the list it was saved from. A song is current (row tint, `aria-current`, name in pen, `PlayButton` pressed) only in the list it plays from: `useIsInPlayerFrom(track, source)` (`isInPlayerFrom` in the playback store) compares the song and the list. Elsewhere its play button plays it from that list, with that list's queue, from its start; the same song starting over keeps its known length. The player bar names the playlist after the song's artist, behind a middle dot (`findPlaylist`, in the playlists store), and nothing for the Songs view; the window title and the system's media controls don't depend on it, and `settings.json` keeps it to put the song back.
  - Volume: the playback store keeps the volume chosen (`volume`, what's saved and what unmuting brings back), `isMuted`, and the slider's value while it moves (`movingVolume`). The song plays at `audibleVolume`: the moving value, else silent while muted, else the volume. `VolumeSlider` moves it live (`moveVolume`) and chooses it on release (`setVolume`, from the slider's `onCommit`); released at 0, it mutes instead, keeping the volume from before.
  - Tooltips: given `formatPointerValue`, a `Slider` shows a `Tooltip` above the pointer while a mouse or pen is over it, its arrow on the pointer, saying what a click there would set: the song's bar as `mm:ss.d` (`formatTenthsTime`), the volume as a percentage. `valueAtPointer` (`sliderPointer.ts`) finds that value the way WebKitGTK and WebView2 place the thumb under a click, half a thumb in from each end of the track, so the slider's thumb size is a TS constant in px, which the CSS reads through `--slider-thumb-size` (JS can't resolve a custom property's `calc()`). `placeTooltip` (`tooltipPlacement.ts`) shifts the tooltip to keep its collision padding, 8px, from the window's edges, and moves its arrow to keep pointing at the anchor, as at the volume's right end. Synthetic events don't move a range input, so a story can't click where the tooltip points: that a click lands on the value shown is checked by hand. Hovering logs nothing.
  - The player is put back as it was left when the app opens again (`playbackMemory.ts`): the volume and whether it's muted, repeat, shuffle, and the song in the player with its position and the playlist it plays from (`playlist`, the playlist's file name, or `null` from the Songs view), saved in `settings.json`'s `playback`. Their defaults are full volume, unmuted, repeat off and shuffle off, the playback store's own.
    - `main.tsx` waits for the settings, the first scan and the list of playlists, then calls `restorePlayback`, which finds the song among the scanned ones by its file name (`fileNameOf`, the same on every OS) and puts it back paused (the playback store's `restore`, which also keeps hand-edited values in range): in its playlist, queued with the playlist's found songs in its order, or from the Songs view, queued as it sorts them. A song gone from the Songs folder, or with no songs scanned, is saved as `null` at once and leaves the player closed; a song whose playlist is gone, or no longer holds it, is put back in the Songs view, and its `playlist` saved as `null` at once. `songEngine.ts` then has Rust hold a song put back paused at its position, and Rust opens no sound output until it plays.
    - Only then does `connectPlaybackMemory` start saving: `PLAYBACK_SAVE_DELAY_MS` after the saved state last changed, so turning the mouse wheel saves once, and when the window is asked to close. A playing song's position alone calls for no save, since it changes a few times a second.
    - The close goes through `onCloseRequested`: Tauri keeps the window open while a JS listener runs, and the JS API closes it with `destroy()` once the save is done (`core:window:allow-destroy` in the capabilities). The save never rejects, since a rejected listener would keep the window from closing. A process killed from outside keeps the last state saved.
  - `windowTitle.ts`, also connected once from `main.tsx`, names the window after the title of the song in the player, never its artist (`setTitle`, allowed by `core:window:allow-set-title` in the capabilities), and after the app while there is none. It sets the title only when it changes, since the store changes a few times a second while a song plays.
  - `mediaControls.ts`, also connected once from `main.tsx`, has the media keys and the system's media controls drive the playback store (play, pause, play/pause, stop, next, previous, seek). Rust reaches them (`media_controls.rs`, see Rust layout), shows them the song in the player, with its artist, and sends their buttons' actions as `playback:media-control` events, so they work on any webview version.
- Song drop: files and folders dropped anywhere on the window add their songs to the Songs folder (`src/features/songDrop/`).
  - `songDropEvents.ts`, connected once from `main.tsx`, follows Tauri's drag events (`getCurrentWebview().onDragDropEvent`). While a drag holding files is over the window, `SongDropOverlay` fades in, blurs the whole page behind frosted glass (`backdrop-blur`) and covers it with a dashed box saying "Drop files here", its dashes marching clockwise (`animate-march`; the border is an SVG stroke, since CSS can't move a border's dashes); a drag without files, like a selected text, shows nothing. An app only learns of a drag once it enters its window: Windows and Wayland tell no other app, so the box can't show any earlier.
  - Tauri's `dragDropEnabled` is on by default, and on Windows its drop handling replaces WebView2's, so the page gets no HTML5 drag and drop events: dragging within the page, like reordering a playlist's songs, goes through pointer events (`SortableList`, on dnd-kit).
  - The drop's paths, absolute as the OS gives them, go straight back to Rust (`song_drop.rs`), which copies only the MP3s among them, and only into the Songs folder.
  - `songDropStore.ts` takes a drop through the steps `SongDropDialog` shows: `check_dropped_songs` counts the MP3s of the drop, subfolders included, and names those whose file name is taken; if any is, the dialog lists them all, in a box that scrolls when they're many (`ScrollBox`), and asks to skip them, replace the songs already there, or cancel; `copy_dropped_songs` copies them flat into the Songs folder; then the Songs folder is scanned again, once any scan already running ends (the library store's `scanAgain`), and that rescan notifies. The dialog stays open, with a loader, until the rescan ends. A drop without songs notifies instead, and a drop while another is added is ignored.
- Playlists: the Playlists view (`PlaylistsView`) shows the list of playlists (`PlaylistsOverview`), sorted by title with `compareNames` and no setting to change it, or the one opened from its row (`PlaylistPage`). The playlists store keeps the open one (`shownPlaylist`), so it stays open while other pages are on screen.
  - A click anywhere on a playlist's row opens it: its title is a button (named `See <title>`) stretched over the row (`after:absolute after:inset-0`, with `STRETCHED_FOCUS_CLASSES`, its focus ring around the row), and the row's own controls, the play button, or the alert in its place, and the menu, sit above it (`relative z-10`). `ListRow` is `relative isolate`, so the stretched button stays inside its row and the raised controls never rise above the header or the floating buttons. The row ends with a menu (`ActionMenu`): Recheck songs while songs are missing, then Edit playlist, then Delete playlist. `PlaylistsOverview` holds both dialogs, outside the rows (`useDialogAbout`).
  - `main.tsx` lists them once at launch. Scans never list them again, since nothing in a playlist's file changes with the Songs folder until Rust checks it.
  - The last scan, the song list, is the app's one record of which songs are in the Songs folder: everything showing whether a song is there reads it, never a playlist's `allSongsFound`, so it all changes at once. A playlist's songs are missing when the song list lacks any of them (`hasMissingSongs`, `useHasMissingSongs`); only until the first scan ends does its file's `allSongsFound` decide. While songs are missing, a red alert (`AlertMark`) takes the place of the playlist's play button, on its row and in its page's header (`PlaylistPlayButton`), in a box of the button's size, every song's play button is disabled, its row's menu starts with Recheck songs, and a Recheck button (`RecheckButton`) shows in its page's header, which has no menu.
  - Playing a playlist, from its row, its page's large play button or one of its songs, and Recheck songs both have Rust look for its songs first (`check_playlist`, through the store's `lookForSongsOf`): the store takes the playlist as Rust rewrote it, and when Rust finds other songs missing than the song list does, songs came or went since the last scan, so the Songs folder is scanned again (`scanAgain`), which notifies like every rescan. If songs are missing, nothing plays and `notifyError` says how many. Rust looks at the same listing of the Songs folder as the scan and pairs names the same way, exactly, case included, so the two never disagree on a drive of any file system.
  - The songs are matched to the last scan by exact file name, case included (`playlistSongs.ts`), like Rust's check: a name in another case is a missing song. A playlist plays the songs the scan has, in its order, as songs of that playlist (`playlistSource(fileName)`), and a song the scan lacks is listed under its file name in `ink-faded`, with an alert where its play button would be.
  - Delete playlist asks first (`ConfirmDialog`, on `Modal`, like the song drop's dialog), and `notifyUndoable`'s Undo writes the file again under its old name, with its old contents (`create_playlist`).
  - A playlist's songs (`PlaylistSongList`) are reordered by dragging their Move handle, with the pointer or from the keyboard (`SortableList`, `src/components/`): dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) works on pointer and keyboard events, which the webviews still send while Tauri takes the window's drag and drop. The handle isn't a `<button>`, so `buttonLog.ts` logs no click for it; the store logs the move. A move shows at once, then `save_playlist` writes the file, which works `allSongsFound` out again; a failed save notifies and keeps the new order on screen. Each row shows its song's position after the handle, from the order the list renders, so it changes at the drop, not while a row is dragged; it's hidden from screen readers, which hear each row's place from the list itself.
  - Each row ends with a menu of what can be done to its song (`ActionMenu`): Change position, then Remove from playlist.
  - Change position opens `ChangePositionDialog`, on `Modal`: Before or After, on one line (`RadioGroup`, Before at first), then a search over the playlist's other songs, listed with their positions, which also finds a position whole (`matchesPlaylistSearch`: 4 finds the fourth song, not the fourteenth), and a single pick among them (`RadioGroup` in rows), kept while the search hides it. Confirm moves the song through the store's `moveSong`, like a drop, to the index `placementIndex` (`songPlacement.ts`) works out; placing it where it already is saves nothing.
  - Remove from playlist asks first too, then `save_playlist` writes the playlist without the song, which stays in the Songs folder, and `notifyUndoable`'s Undo puts it back at its old place, or at the end of a playlist that got shorter since. Missing songs move and go like the others.
  - dnd-kit renders its live region inline, a second `role="status"` beside the page's status line, so stories of a page with a sortable list find the status line by its text.
  - A round + button (`NewPlaylistButton`), rendered from `App.tsx` outside the views so it can slide out when the page changes, floats in the bottom-right corner only while the list of playlists is on screen (`useIsNewPlaylistButtonShown`). It slides up from below the window's bottom edge, without fading, over Sonner's notification timing (400ms `ease`), rides above the player with the player's slide (300ms ease-out), and keeps its room below the notifications (`NEW_PLAYLIST_BUTTON_CLEARANCE`). Neither it nor the player has a z-index, and `App.tsx` renders it before `AudioPlayer`, so it slides in from behind an open player. The list's bottom padding lets its last row scroll clear of it.
  - It opens `PlaylistDialog`, in two steps, whose tabs (`StepTabs`) show the one on screen, a bar sliding under it: first Details, a required title (at most `MAX_TITLE_LENGTH`) and a description, then, after Next, Songs, the scanned songs in the Songs view's order (`useSortedTracks`), each with a `Checkbox`. The search (`songSearch.ts`) matches title, artist and file name, with case and accents folded on both sides (`plainText.ts`); picked songs stay picked while it hides them, and are saved in the list's order. Creating, only Next and Back move between the steps: the tabs can't be clicked, showing the not-allowed cursor, and Headless UI's tab and panel are rendered with `tabIndex={-1}` (through `as`), so the keyboard never stops on them. Editing, the tabs go to their step too (`StepTabs`' `onStepChange`), and the Songs tab is disabled while the title is blank, like Next; their activation is manual (Enter or Space, not the arrows), since a step focuses its first field when it shows. The steps share the form's state, so Back keeps what was typed and picked, and each step focuses its first field when it shows (`TextField`'s `ref`). The form lives inside the dialog's panel, which Headless UI unmounts once it closes, so each opening starts over: empty, or from an edited playlist's values then. It doesn't submit on Enter, which would save from the search box. A failed save keeps it open.
  - The same dialog edits a playlist, given one (`playlist`), from the Edit button in its page's header, before the large play button, or from Edit playlist in its row's menu: it says "Edit playlist", starts from the playlist's title, description and found songs, picked, and saves through `save_playlist` (the store's `editPlaylist`), so the file keeps its name whatever the new title, since the name only identifies the file. The songs still picked keep their place, the unpicked ones leave, and the newly picked ones follow in the list's order (`editedSongs`, `playlistSongs.ts`); songs the last scan lacks can't show in the picker, so they stay where they are, and the second step says how many.
  - The file name is `<Date.now()>-<title>.json` (`playlistFileName.ts`): the title with its accents folded, keeping only `A-Z`, `a-z`, `0-9` and spaces, trimmed, spaces turned into `_`, or `playlist` when nothing is left, as for a title in another script. Rust checks the same pattern.
- Type is Archivo Variable (weight and `font-stretch` width axes), bundled through `@fontsource-variable/archivo`. Never load fonts or other assets from a CDN: the app must work offline on any computer.
- Work that runs once per launch is started in `main.tsx`, not in a mount effect, because StrictMode runs effects twice in dev.

### Rust layout

- `portable.rs`: `root_dir()`, the folder containing the executable, or the AppImage it runs from. Every app file lives under it.
- `main_window.rs`: the window remembers only its size, saved by the official `tauri-plugin-window-state`. It always opens centered.
  - The window starts hidden (`"visible": false` in `tauri.conf.json`). `show()` reads the saved size from the plugin's file, shrinks it to fit the current screen, centers it, and only then shows the window, so it never visibly jumps.
  - The plugin's own restore is skipped because on Linux it applies the size asynchronously, too late for centering. For the same reason Tauri's `center()` can't be used: GTK reports a 0×0 outer size until the window is first drawn.
- One module per feature (e.g. `library.rs`) holding its constants, data structs, commands and error enum.
- `library.rs`: the scan lists the MP3s of the Songs folder and reads each one's tags with `lofty` (`read_song_tags`).
  - It reads only the tags (`tags_only()`: no audio properties, no embedded pictures), since every song comes from a possibly slow drive. lofty still reads through a picture's bytes to get past it, but doesn't decode or keep it.
  - `Track::title` is the title tag, else the file name without the extension. `Track::artist` is the artist tag (ID3's lead performer), else the album artist (ID3's band/orchestra), else `None`. Several values of one tag, like ID3v2.4's multi-value frames, are joined with `, ` (`ARTIST_SEPARATOR`). Values are trimmed, and blank counts as missing.
  - Each value comes from the first tag that has it: an MP3's ID3v2 tag first, so its ID3v1 or APE tag only fills in what the ID3v2 tag lacks.
  - Bad tags never fail the scan: a song with no tags, or with unreadable or corrupt ones, is listed under its file name with no artist.
  - `read_cover` reads one song's tags with their pictures (`tags_with_pictures()`, still without audio properties), once `find_song_in` has checked its path, and sends its front cover, else its first picture (`cover_among`). Only a song that can't be found or opened is an error (`SongMissing`, `ReadSong`); a song without pictures, or with unreadable or corrupt tags, has no cover.
  - lofty hands back whatever part of a picture is there when the file ends inside it, as after a copy cut short, so such a song can send part of an image: the webview draws what it can, or the placeholder.
- `playback.rs` and `playback/`: songs play in Rust, so one follows the next without a gap. The webview says what should play through the commands (`play_song`, `queue_next_song`, `set_playing`, `seek_song`, `set_volume`, `stop_playback`) and hears what does through the events (`playback:song-started`, `playback:song-ended`, `playback:progress`, `playback:output-lost`, `playback:media-control`). `start` builds it all in `setup`, managed as `Playback`.
  - `song_bytes.rs`: a song's file, read into memory in 64 KiB chunks (`READ_CHUNK_BYTES`) as its decoder asks for them, wherever they are in the file, and in the background in between: a song starts once the chunks it needs are read, like an index at the file's end, not the whole file. It opens songs through `library::find_song_in`, so the engine reaches no other file. The player holds two songs' files at most, the current one and the queued one.
    - A file up to `MEMORY_LIMITS.whole_file` (128 MiB, nearly every song) is read whole and kept: once it's all in, it plays on when the drive is pulled.
    - A larger one, like an hour-long WAV, keeps only a window around each of its readers (`SongReader`, one per decoder): it reads ahead by `read_ahead` (16 MiB) and keeps `keep_behind` (4 MiB), and lets go of the chunks outside every window, which a seek back reads again.
  - `song_feeder.rs`: a decode thread for each song in the player, with rodio's `Decoder` (symphonia, MP3 only), which cuts the encoder's delay and padding (the LAME/Xing tag) and seeks to the exact sample. It decodes about 1.5 s ahead (`FEED_CAPACITY` blocks of `BLOCK_FRAMES`), into blocks the audio thread sends back to be filled again, and resamples only when the output runs at another rate than the song. Each seek starts a new generation, and the blocks of an older one are thrown away.
  - `song_chain.rs`: the audio thread's whole job, in cpal's callback: it copies the current song's samples to the output, scaled by the volume and mapped to the output's channels, switches to the queued song on the very next sample once the current one ends, and plays silence while it waits. It never blocks, locks or allocates, since a late buffer is a click. Its clock holds the song's id and frame in one atomic (`ChainClock`), so the progress always names its song.
  - `output.rs`: a cpal stream on the system's default device, opened at the rate of the song that plays, so the system's mixer does any resampling, with a 40 ms buffer (`OUTPUT_BUFFER`; PulseAudio's own choice can reach seconds), as `f32`, else `i16`, else at the device's rate. A song of another rate reopens it once the current song ends, one short gap there, as in mpv, unless the device refused a rate already and every song is resampled. The hosts are tried by hand (`PREFERRED_HOSTS`: PulseAudio, then ALSA, on Linux; WASAPI on Windows), since cpal's `default_host()` panics when ALSA can't start. The stream pauses with the player (corked on PulseAudio), so the system sees nothing playing.
  - `engine.rs`: what plays and where, behind one lock that the commands and the controller share, never the audio thread. A song held paused, like one put back when the app opens, opens no output until it plays. A request overtaken by a newer one while its file opened is dropped (`latest_play`). A queued song replaced by the webview lives on until another song starts, since the chain may have moved on to it already, and the webview then catches up.
  - `controller.rs`: a thread that hands the engine what the chains and streams report, the progress every 100 ms (`PROGRESS_INTERVAL`), and the default device's changes, checked every 2 s (`DEVICE_CHECK_INTERVAL`). When the default device changes, or a stream fails (WASAPI reports a changed default device that way, at once), the engine reopens the output on the default device and plays on; when none opens, it pauses and emits `playback:output-lost`.
  - `media_controls.rs`: the system's media controls through souvlaki: MPRIS on Linux (over zbus, pure Rust), Windows' media transport controls on Windows (through the window's handle). The engine shows them the song in the player, with its artist, length, position and play state, and their buttons and the media keys reach the webview as `playback:media-control` actions. Blank fields are sent as empty strings, since the Windows backend keeps a field it isn't given.
    - souvlaki's zbus thread panics without a session bus, or when its bus name is taken, so it connects only once the session bus is found to accept connections (`session_bus`), under a name unique to the process (`portable_music_player.instance<pid>`). Without one, songs still play, with no media keys, and the log says why.
  - Nothing in it may panic: the release build aborts on panic, which would kill the app, and the audio thread runs inside cpal.
- `settings.rs`: user settings in `settings.json` next to the executable.
  - It holds the theme, whether to search for updates (`checks_for_updates`, on by default), the version of the update the user skipped (`skip_update_version`, `None` until one is), the songs' order (`SongOrder`: title by default, or file name) and what the player was left with (`SavedPlayback`: volume, `is_muted`, `RepeatMode`, shuffle, and the song as its file name, position and the file name of the playlist it plays from, `SavedSong`, whose `playlist` is `None` from the Songs view or in a file saved before it existed).
  - A missing file gives the defaults, and `#[serde(default)]` keeps older files loading when fields are added, with the `Default` impl's values.
  - Saves go through `write_atomically` (`atomic_write.rs`), so pulling the drive mid-save can't corrupt it.
- `song_drop.rs`: adds the songs of a drop to the Songs folder, through `check_dropped_songs` and `copy_dropped_songs`.
  - It walks each dropped folder with its subfolders, each folder's names sorted, so which of two songs of the same name is copied never depends on how the OS lists them. It doesn't follow links to folders, so a link back up can't loop, and it skips hidden subfolders (dot names, and Windows' hidden attribute): on a dropped drive they're the trash and the system's folders.
  - A name is taken by a file of that name in the Songs folder (`exists()`, so the drive's file system applies its own case rules, as FAT and NTFS ignore case) or by an earlier dropped song (compared lowercase). The copy checks each name as it goes, so skipping keeps the first song of a name and replacing keeps the last.
  - Each song is copied under a hidden `.<name>.part`, which the scan skips, then renamed over its own name, so pulling the drive never leaves half a song. A path that can't be read or copied is reported (`DropFailure`), and the other songs are still copied.
- `playlists.rs`: the playlists, one JSON file each in the `Playlists` folder next to the executable, created when missing like `Songs`, through `list_playlists`, `create_playlist`, `save_playlist`, `check_playlist` and `delete_playlist`.
  - A file is named `<Date.now()>-<normalized title>.json`: digits, a dash, then at least one of `A-Z`, `a-z`, `0-9` and `_` (`is_playlist_file_name`). The webview builds the name from the title, and Rust refuses any other name before touching a file, so the webview can't reach other files through it.
  - It holds exactly `title`, `description`, `allSongsFound` and `songs`, the songs' file names in the Songs folder (`deny_unknown_fields`).
  - Listing sorts the files by name, so by the time they were created, and skips with a warning in the log:
    - a file whose name doesn't fit, or a folder;
    - a file that isn't valid JSON, or holds a missing, mistyped or unknown field;
    - a blank title;
    - a song that isn't a plain `.mp3` file name (`library::is_song_file_name`);
    - a song listed twice, compared lowercase like the drive's file system may.
  - Hidden files, like a save's temporary file, are skipped quietly. Create and save refuse the same contents (`ContentsProblem`), so the player never writes a file it would then skip.
  - `allSongsFound` is worked out only when a playlist is created, saved or checked (`check_playlist`, which also names the songs missing), never by a listing or a scan, through `library::missing_songs_in`: the songs the scan wouldn't list, from the same listing (`song_files_in`), with names paired exactly, case included, the way the webview pairs a playlist's songs with the scan. Checking rewrites the file only when the value changes, and Rust logs each change of it.
  - Create never overwrites a file (`Taken`), and can recreate a deleted playlist under its old name. Every write goes through `write_atomically`.
- `atomic_write.rs`: `write_atomically` writes a file under a hidden temporary name next to it, `.<name>.tmp`, then renames it over the file, so pulling the drive mid-write leaves the old file or the new one, never half of one. The settings and the playlists save through it.
- `crash_log.rs`: the release build aborts on panic, so a damaged song that crashes a tag reader or a decoder closes the app, at every launch if the scan reads it. `log_crashes`, called first thing in `run`, installs a panic hook that logs the panic, and the song its thread was reading, before the abort, then prints it as usual: the plugin's file is flushed at each line, so the line reaches the drive. The scan, the cover read and each feeder note their song for as long as they read it (`reading_song`, a guard bound to its thread).
- `logs.rs`: the log, through the official `tauri-plugin-log`, printed to stdout and saved in `Logs/portable-music-player.log` next to the executable (its `Folder` target: the plugin's default `LogDir` is in the user's profile, off the drive). It takes everything logged through the `log` crate, which the plugin re-exports (`tauri_plugin_log::log`).
  - Each opening starts a new file (`FileOpenStrategy::Rotate`): the last session's is renamed `portable-music-player_<date>.log`, the date it's set aside, in UTC, so the opening after it. A full file (`MAX_LOG_FILE_BYTES`, 1 MB, instead of the plugin's 40 KB) is renamed the same way and a new one starts. The 3 newest renamed files are kept, sessions and full ones alike (`PAST_LOG_FILES_KEPT`).
  - The plugin's settings come from `builder`, so a test can get its logger from a mock app (`split`, with Tauri's `test` feature, a dev-dependency) without installing it as the global logger.
  - `writable_logs_dir` creates the folder and opens the log file before the plugin starts, because the plugin opens it in its setup, and an error there would stop the app from starting, as on a write-protected drive. If it can't, the log goes only to stdout, and a warning says why once the plugin runs (`warn_if_unsaved`).
  - The Windows release build has no console (`windows_subsystem` in `main.rs`), so there the file is the only log.
  - `log_opening` writes `Opening app` in `setup`, the first moment the plugin runs, and `log_closing` writes `Closing app` on `RunEvent::Exit`, which a process killed from outside never reaches.
  - The webview writes through `write_log`, a command of this module, rather than `@tauri-apps/plugin-log`, whose lines would each carry the caller's place in the bundled script.
- `updates.rs`: the update check, through the official `tauri-plugin-updater`.
  - `check_for_update` reads the `latest.json` of GitHub's latest release, the endpoint in `tauri.conf.json` (`plugins.updater.endpoints`). GitHub's latest release is never a draft or a pre-release, so the unstable builds are never offered. The plugin compares its version with the one running, and finds the release's files for this OS.
  - It sends back the version and the notes (`FoundUpdate`), and keeps the plugin's `Update` (`PendingUpdate`, managed state) for its download.
  - `install_update` gets the kept update (`NothingToInstall` when there's none): an installed build downloads and installs it (`download_and_install`, which exits the app on Windows to run the installer), and a portable build opens its download in the browser (`tauri_plugin_opener::open_url`). The download links (`download_url`) follow the stable workflow's file names, for x64 only, the one architecture built.
  - A check gives up after `CHECK_TIMEOUT`, so a stalled connection fails instead of checking forever.
  - `plugins.updater.requireSignedVersion` makes the plugin refuse a release whose signature names another version than the one `latest.json` announces, so a tampered `latest.json` can't pass an older release off as a new one. The Tauri CLI writes the version into every signature it makes.
- Commands are `async`: sync commands run on the main thread, and file I/O on a slow USB drive would freeze the window.
- Commands return `Result<T, FeatureError>`. The error enum uses `thiserror` for messages and serializes as its message string, which the frontend shows to the user. Structs sent to the frontend use `#[serde(rename_all = "camelCase")]`.

## Portability constraints

These follow from the project goal and are easy to get wrong:

- **Resolve data paths from the executable's location** (`std::env::current_exe()` → parent dir), in Rust. Don't use Tauri's `app_data_dir` / `app_config_dir` or the OS user profile, because they write outside the flash drive. The one deliberate exception is the window size, which the window-state plugin keeps in each computer's `app_config_dir`, because every computer has a different screen. Keep file I/O for the JSON stores in Rust commands, not in the webview.
- Both executables share the same folder and the same JSON files, so data formats must be OS-agnostic. Store music paths **relative to the executable folder** (the drive letter or mount point changes between machines and OSes), and normalize path separators.
- The portable artifact is the bare binary (`src-tauri/target/release/portable-music-player[.exe]`), not the installers/bundles `tauri build` produces (`bundle.targets` lists `appimage`, `msi` and `nsis`; the bundler keeps those of the OS it builds on, so there are no `.deb` or `.rpm` packages). An AppImage works too: it runs the executable from a temporary read-only mount, so `root_dir()` uses the folder of the AppImage file (`APPIMAGE`) while the executable is inside that mount (`APPDIR`). Programs started from an AppImage inherit both variables, so outside the mount they're ignored.
- Each OS executable has to be built on (or cross-compiled for) that OS. Development here happens in WSL2, which produces the Linux binary.
- Runtime dependencies are on the host: Windows needs WebView2 (preinstalled on Win 10/11), and Linux needs webkit2gtk and ALSA's library (`libasound.so.2`, on every desktop), which cpal links for its ALSA host. Songs play through PulseAudio, or PipeWire's PulseAudio server, when there is one, else straight through ALSA. They play in Rust, not in the webview, so GStreamer's plugins aren't needed, and the AppImage bundles none. Building on Linux needs ALSA's headers too (`libasound2-dev`, which the three workflows install).
- Don't rely on the host's locale for anything order-sensitive. With `LANG=C` (WSL's default), the Linux webview's default `Intl` locale is `en-US-u-va-posix`, whose collation puts every uppercase letter before any lowercase one. Pass an explicit locale (see `src/compareNames.ts`).
- Don't canonicalize paths shown to the user: on Windows, `canonicalize` adds a `\\?\` prefix.

## Documentation

- **Storybook is the detailed documentation of the UI.** To understand how the interface works, read it rather than expecting it here:
  - the `*.stories.tsx` next to each component, one story per situation it handles;
  - the JSDoc of the components and their props;
  - the MDX pages in `src/docs/`: `Introduction.mdx` (app shell, data flow, how stories fake Rust) and `DesignTokens.mdx` (colors, type, interaction states).
- With `pnpm storybook` running, the `storybook` MCP server (`.mcp.json`, `http://localhost:6006/mcp`) serves these docs. Before UI work:
  - list the documented components with `docs-list` and read the ones involved with `docs-show`;
  - never guess a component's props: if one isn't documented, ask the user;
  - call `get-storybook-story-instructions` before writing or changing stories;
  - check the result with `test-run` (or `pnpm test:ts:storybook`).
  - Without the server, read the story and MDX files directly.
- Every exported component has a JSDoc block saying what it's for and when it's used, ending with a `@summary` line, and every prop has a JSDoc line. This is the one exception to "comments explain why, not what": Storybook's Docs pages and its components manifest (what the MCP server serves) are built from them.
- Every component has a `<Component>.stories.tsx` next to it, in CSF 3:
  - one concept per story, with a JSDoc description saying when that situation happens;
  - stories set the store state they show in `beforeEach`, and mock the commands they trigger with `mockCommands`;
  - stories that set store state use `renderInOwnFrame`, so they don't overwrite each other on Docs pages;
- MDX pages have a `summary` on `<Meta>` and write all their content in the file, because the manifest doesn't follow imports. `DesignTokens.mdx` repeats the token values of `src/index.css`, so keep them in sync.
- `README.md` lists the user-facing features under **Features**, one short line each that names the feature without explaining it.
- `docs/changelog/` holds the patch notes of each stable release, one Markdown file per version, written when it's released (see Releases). The folder is created with the first release's notes.
- `docs/technical-decisions/` holds why parts of the app are built the way they are, one Markdown file per decision, named in kebab-case after what it decides, e.g. `linux-song-server.md`.
  - The user chooses which decisions get a file. Suggest one when a change settles a choice worth explaining (an obvious approach that was rejected, a platform workaround, a constraint the code doesn't show), and write it only once the user agrees.
  - Each file starts with a `# <title>`, then these sections in order: **Status** (`Current`, or `Superseded by <file>` with the date), **Context** (the problem and its constraints), **Decision**, **Why** (the evidence: measurements, bugs, documentation), **Alternatives rejected** (each with its reason), **Consequences** (what it costs, and the code it shapes) and **Revisit when** (what would make it worth deciding again).
  - Update a file in the same change as the code it describes. A decision that's replaced is marked superseded, never deleted, so its reasons stay on record.
- `private/` holds the user's own files and the generated test reports. Git tracks only its `.gitignore`, which ignores everything else in it. `private/tests.html` is a hand-written guide to the tests: never update it, even when the tests change, unless the user asks for it.
- Update the stories, the docs and the README in the same change as the feature.

## Testing

| Layer | Where | Runs with |
|---|---|---|
| Rust: file system, data formats, window sizing, the playback engine | `#[cfg(test)] mod tests` at the bottom of the module | `pnpm test:rs` |
| Frontend logic: helpers and stores | `*.test.ts` next to the module | Vitest `unit` project (jsdom) |
| Components: rendering, interactions, accessibility | stories and their `play` functions | Vitest `storybook` project (headless Chromium) |

- Vitest is configured in `vite.config.ts` (`test.projects`), and `pnpm test:ts` runs both projects. Unit tests import `describe`, `it`, `expect` and `vi` from `vitest` explicitly (no globals).
- **Fake the Rust side only through `mockCommands`** (`src/testing/mockCommands.ts`):
  - it answers commands through Tauri's `mockIPC`, and a command without a handler rejects;
  - it always answers `write_log`, unless a handler replaces it, keeping the messages: check them with `loggedMessages()` (`src/testing/logs.ts`). Unit tests start with `mockCommands({})` (`setupUnitTests.ts`), like stories, so logging works in every test;
  - it mocks events too (`shouldMockEvents`), so a test can `emit` what Rust would, like `tauri://close-requested` or `tauri://drag-drop`; window and webview APIs also need `mockWindows('main')`;
  - never mock the `*Api.ts` modules: going through `invoke` keeps the command names and argument shapes under test;
  - fake a Rust error with `failingCommand(message)`, since errors reach the frontend as strings.
- Stores reset automatically before every story and after every unit test (`src/testing/resetStores.ts`). A new store must be added there. The reset also dismisses every notification and forgets the logged messages.
- Notifications are checked through what the user sees:
  - in unit tests, `shownNotifications()` (`src/testing/notifications.ts`) lists the ones on screen as `{ type, title, description, action }`, `action` being the label of its button, like Undo, which `clickNotificationAction(title)` clicks;
  - stories of a component that raises them add the `withNotificationArea` decorator and find the text in `<body>`. Notifications fade in, so wait for them with `waitFor(() => expect(...).toBeVisible())`.
- **Every story is a test**:
  - It must render, its `play` function must pass, and the axe accessibility check must find no violations. That check is `a11y.test: 'error'` in `.storybook/preview.tsx`, run on the whole `<body>` so portaled dialogs are included.
  - Write a `play` only when it proves something the render doesn't: an interaction, async content, an aria state.
  - In a `play`, use the `canvas` and `userEvent` it receives. Query portaled content, like the side menu, with `within(canvasElement.ownerDocument.body)`.
  - In some runs the browser's real pointer rests on the story's top-left corner and, a frame after the story renders, hovers whatever is there, for `:hover` and Headless UI's `data-hover` alike. That hover also ends any `data-hover` the story started elsewhere, so never assert that an element there is unhovered, and let two frames pass before hovering (`untilBrowserPointerSettles`, `src/testing/browserPointer.ts`).
  - The `CssCheck` story in `Button.stories.tsx` proves the app's CSS loads in Storybook; there is only one.
- **Rust commands stay thin**:
  - a command resolves its path from `portable::root_dir()` and delegates to a function that takes it (`ensure_songs_dir_in`, `read_settings`, `write_settings`);
  - tests call that function with a `tempfile::tempdir()`, never the real executable folder, and the folder is deleted even when a test fails.
- Every struct and error sent to the frontend has a test pinning its JSON (`serde_json::to_value`), which must match the TypeScript type in the feature's `types.ts`.
- `unwrap`/`expect` are fine in tests: a panic is how a Rust test fails.
- Rust tests of tag reading build their MP3s in the temp folder instead of committing fixtures: lofty writes the tag's bytes (`dump_to`), followed by two silent MPEG frames (`silent_audio()` in `test_songs.rs`). Pictures go in the same way (`tag_with_pictures`), each with its own description, since ID3v2 keeps one picture per description.
- Rust tests of playback build their MP3s the same way (`test_songs.rs`): silent MPEG frames at 44.1 or 48 kHz, with or without the Info frame that tells the decoder the encoder's delay and padding (`gapless_audio`). The engine's tests play on a fake output (`FakeOpener`), whose chains they run by hand, so no sound device is needed.
- Covers in stories come from `src/testing/covers.ts`: `drawCover` draws a small PNG in the browser for `read_cover` to answer, `noCover` answers a song without one, and waits for a cover use `UNTIL_COVER_SHOWS`, longer than `waitFor`'s default. Every story that renders `TrackList` or a playlist's row (`PlaylistRow`) mocks `read_cover`.
- **Example songs come from `test/get_mock_songs.sh`**, in stories, tests (frontend and Rust) and docs: titles, artists, file names and paths alike. Never make up a song name or artist.
  - Run `test/get_mock_songs.sh <count>`, asking for as many songs as the example needs, and use the songs it prints, picked at random from `test/mock_songs.csv`. It repeats songs only when you ask for more than the file holds.
  - It prints one CSV record per line, `title,artist`, without a header. A field holding a comma, a double quote, or leading or trailing spaces comes enclosed in double quotes, with inner quotes doubled; take the field without them. The artist may be empty.
  - `test/mock_songs.csv` follows RFC 4180 under a `title,artist` header, one song per line, quoting a field only when it needs it. Every song has a title, the artist may be empty, and no field holds a line break. The script rejects a malformed file, naming the line.
  - Example songs are the exception to "No duplication": never share them through a constant or helper module, and never reuse songs written elsewhere. Every time an example needs songs, run the script again and write the songs where they're used.
  - A test that needs a special title (lowercase, accents, numbers) adapts a drawn title, e.g. lowercases it or prefixes a track number, or draws more songs and keeps the ones that fit.
- Name a test after the rule it checks: `rejects_hidden_and_non_mp3_names`, `it('compares numbers by value')`.

## Test-driven development

Features and fixes are developed test first. A test states a rule the system must follow, and the code comes after it, to make it pass:

1. **State the rule** the change introduces, e.g. "hidden files are not songs" or "a failed save keeps the chosen theme on screen".
2. **Write the test first**, in the layer that owns the rule: a Rust test for file system and data rules, a `*.test.ts` for frontend logic and stores, or a story with a `play` function for what the user sees and does.
3. **Run it and watch it fail** for the expected reason: the missing behavior, not a typo or a missing import.
4. **Write the least code that makes it pass.**
5. **Refactor** with every test green.

- A bug fix starts with a test that reproduces the bug.
- A feature is done when its tests pass, its components have stories and JSDoc, and its line is in the README.

## Packages

- Look up a package's documentation (setup, APIs, configuration, migrations) with the `/context7:docs` skill instead of relying on memory: the dependencies here are recent majors whose APIs differ from older, better-known versions.
- **Set up new packages with their own init command.** When a package's official documentation declares an init or setup command, run it first, then edit the files it generated; never write those files by hand.
  - For example, adding TypeScript means running `pnpm exec tsc --init` and then editing the generated `tsconfig.json`. Storybook addons go through `pnpm exec storybook add <addon>`.
  - This applies when the package isn't set up in the project yet and the command doesn't conflict with the project's current state. Otherwise edit the existing files.
  - Remove whatever the command generates that the project doesn't use (example files, unused addons), and pin any version it wrote as `latest` to a version range.

## Git

**Always run `pnpm lint` before every commit**, and stage any fixes it applies as part of that commit.

**NEVER, under ANY circumstance, undo work to make commits.** Don't revert, rewrite or hold back part of a file's changes, or stage a made-up version of it, so that a commit gets only one change's lines. Changes that overlap in a file can go in the same commit. When changes overlap, commit first the ones that overlap least, and put each shared file in the commit of a change it belongs to.

**Run the tests when you finish a task**, to check that everything still works. Only run the tests of the regions of the code you changed; there's no need to run tests for unaffected areas.
- For TypeScript, pass the changed folders or files to Vitest, e.g. `pnpm exec vitest run src/features/playback`. Run `pnpm test:rs` only when `src-tauri/` changed.
- Code that others build on counts as changed for them too: a change to `src/components/`, a store, `src/index.css` or `src/testing/` also runs the tests of the code that uses it.
- There's no need to run them again before committing: the CI workflow runs every test on every push.

Commit messages follow Conventional Commits with a short lowercase subject and no body (e.g. `chore: add headlessui and heroicons`, `ci: add quality assurance github workflow`). Never add a `Co-Authored-By` trailer or any other AI attribution line to commits or pull requests.

## Releases

A stable release is made by hand, in these steps:

1. **Find the last stable release**: `git fetch --tags`, then the newest tag without a suffix, `git tag --list 'v*' --sort=-v:refname | grep -v -- - | head -1`. Unstable releases' tags carry `-unstable.`, and a draft gets its tag only once it's published. With no stable tag yet, the release covers the whole history.
2. **Summarize the changes since then** from the commits: `git log <tag>..development --no-merges --format=%s` (or `development` alone with no tag). Write each change once, for the player's users: what changed for them, not how, in the README's plain style, with no commit types or hashes. Merge the commits of one change into one line, and condense the rest, like refactors, tests and CI, into a few lines.
3. **Group them**: `feat` commits under **New features**, `fix` commits under **Bug fixes**, everything else under **Other**. Leave out a group with nothing in it.
4. **Pick the version**, in semver: a breaking change raises the major, a new feature the minor, only fixes the patch. Set it in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (then `cargo check --manifest-path src-tauri/Cargo.toml` updates `Cargo.lock`) and `package.json` (`pnpm version <version> --no-git-tag-version`). The tag, the release's name and the notes' file name all come from it.
5. **Write the patch notes** in `docs/changelog/v<major>-<minor>-<patch>.md`, e.g. `docs/changelog/v1-0-0.md` for 1.0.0, creating the folder if it's missing: a `## New features`, `## Bug fixes` and `## Other` heading for each group, in that order, each followed by `- ` items, and no title, since the release's name says the version. The update dialog renders them as Markdown (`PatchNotes`), without images or HTML, and links open in the browser.
6. **Commit** (`chore: release v<version>`), merge `development` into `master` and push. `publish-stable.yml` then builds the draft release, with the notes as its description and as `latest.json`'s `notes`, and fails if the notes' file is missing. Publish the draft by hand on GitHub: only then is it the latest release, the one the app's update check reads.

## Logging

Every feature logs what the user does and what the app does in response, following these patterns. Keep the double quotes: they hold names as the user sees them.

| Situation | Message |
|---|---|
| A button is clicked | `Clicked at button "<name>"` |
| A toggle button (on/off, not a switch) is clicked | `"<name>" is on` or `"<name>" is off`, its state after the click |
| A button with three or more states is clicked | `Clicked at button "<name>" State: "<state>"`, its state after the click |
| A switch or checkbox is toggled | `"<name>" is on` or `"<name>" is off` |
| A select's list opens | `Opened selector "<label>"` |
| An option is chosen in a select | `Selector "<label>" set value to "<option>"`, the option's visible text |
| A select's list closes, by a choice or not | `Closed selector "<label>"`, after the choice if there is one |
| A menu opens | `Opened menu "<label>"` |
| A menu closes, by a choice or not | `Closed menu "<label>"`, after the chosen item's click if there is one |
| An option is chosen in a radio group | `Radio group "<label>" set value to "<option>"`, the option's label |
| A song starts, pauses, resumes or stops | `Started`, `Paused`, `Resumed` or `Stopped playing song "<title>"`: the title tag, else the file name without its extension |
| The song's progress bar is clicked or dragged | `Jumping song to mm:ss.mmm` |
| The volume slider is moved | `Set volume to <percent>%` |
| The current page changes | `Changing to page "<page name>"`, the category's name in the menu |
| A song is put back in the player when the app opens | `Restored song "<title>" at mm:ss.mmm` |
| A playlist is created | `Created playlist "<title>" with <count> songs`, e.g. `Created playlist "Road trip" with 1 song` |
| A playlist is edited | `Edited playlist "<title>"`, its title after the edit |
| A playlist is opened from its row | `Opened playlist "<title>"` |
| A playlist is deleted | `Deleted playlist "<title>"` |
| A deleted playlist comes back with Undo | `Restored playlist "<title>"` |
| A song of a playlist is moved | `Moved song "<song title>" to position <n> in playlist "<title>"`, counted from 1 |
| A song is removed from a playlist | `Removed song "<song title>" from playlist "<title>"` |
| A removed song comes back with Undo | `Put song "<song title>" back in playlist "<title>"` |
| Files or folders are dropped on the window | `Dropped <count> songs`, the MP3s found in them, e.g. `Dropped 1 song` |
| The songs of a drop are copied | `Copied <count> songs to the Songs folder` |
| The app opens and closes | `Opening app`, `Closing app` |
| The app crashes | `Crashed while reading "<song>": <panic message> (<place in the code>)`, the song's file name, or `Crashed: <panic message> (<place in the code>)` when no song is being read |
| A sound output opens, for a song or another device | `Opened sound output "<device name>" at <rate> Hz`, the rate it runs at, e.g. `Opened sound output "Speakers" at 44100 Hz` |
| The sound output fails, as when its device is unplugged | `Lost sound output "<device name>"` |
| Rust finds songs of a playlist missing, when its file said they were all there or is new | `Found <count> songs missing from playlist "<title>"`, e.g. `Found 1 song missing from playlist "Road trip"` |
| Rust finds every song of a playlist whose file said some were missing | `Found every song of playlist "<title>"` |
| A check for updates finds a newer release | `Found update to version <version>`, e.g. `Found update to version 0.2.0` |
| A check for updates finds none | `Found no update` |
| The check for updates at launch fails | `Couldn't check for updates: <reason>`, the error Rust sent |
| The check for updates at launch finds the version the user skipped | `Ignored skipped update to version <version>` |
| An update is skipped | `Skipped update to version <version>` |
| A portable build's download of an update opens in the browser | `Opened the download of version <version> in the browser` |
| An installed build starts installing an update | `Installing update to version <version>` |
| A link of an update's patch notes opens in the browser | `Opened link "<url>"` |

- `<name>` is the control's accessible name, as screen readers hear it.
- Buttons need no code of their own: `buttonLog.ts` logs them all. Give a two-state toggle `isPressed`, and a button with three or more states `state` (`IconButton`), so the log knows which pattern it follows. Selects built on `Select` log their opening, choice and closing on their own, menus built on `ActionMenu` their opening and closing, radio groups built on `RadioGroup` their choice, and checkboxes built on `Checkbox` their toggles.
- A slider logs the value a move ends on, through `onCommit`, never at every step of a drag.
- A new kind of situation gets a message in the same style, a short sentence starting with a capitalized verb with names in double quotes, and its test asserts the exact message. Say which message was chosen when proposing the change.
- Test each message where it's logged: `loggedMessages()` lists them in unit tests and stories.

## Clean code

All code (TypeScript and Rust) must follow Clean Code principles:

- **Meaningful names**: names should say what something is for, and be easy to read and search. Don't abbreviate or use single letters outside tiny scopes (`track`, not `t`). Booleans read as predicates (`isPlaying`, `hasCover`), functions as verbs (`loadPlaylist`), components and types as nouns (`TrackList`, `Playlist`).
- **UI terms, not analogies**: the user may describe a UI with an analogy or everyday words, like "a small talk balloon from comics" for a tooltip with an arrow, or "translucent" for a backdrop blur (frosted glass). Work out what they mean, tell them the standard UI terms for it (tooltip, arrow, anchor, collision padding; backdrop blur; drop zone; marching ants; empty state), and use those terms in code, comments, tests and docs, never the analogy.
- **Small functions that do one thing**: keep each function at a single level of abstraction. If a block needs a comment to explain what it does, extract it into a well-named function. Keep parameter lists short, and group related values into an object or struct.
- **Single responsibility**: each module, component and store has one reason to change. Components render UI, Zustand stores hold state and its actions, Rust commands handle file I/O and system access, and pure helper functions hold the logic (path normalization, sorting, filtering). Keep business logic out of JSX.
- **No duplication, no speculation**: extract logic instead of copy-pasting it, but don't build abstractions or options for needs that don't exist yet (KISS, YAGNI).
- **No magic values**: use named constants for file names, limits, defaults and similar values.
- **Explicit types**: no `any`. Model domain data with explicit types, and prefer types that make invalid states impossible to represent.
- **Errors are handled, never swallowed**: Rust commands return `Result` instead of calling `unwrap`/`expect` on fallible operations. This matters here: the release profile uses `panic = "abort"`, so a panic kills the whole app. On the frontend, handle rejected `invoke` promises and show the failure to the user with `notifyError`, never as red text in the view.
- **Comments explain why, not what**: code should explain itself. Don't leave commented-out code. The one exception is the JSDoc that documents components and their props (see Documentation).
- **Leave it cleaner**: improve the code you touch, but keep unrelated refactors out of the change.

## Code style (Biome)

Single quotes, no semicolons, no trailing commas, 2-space indent, 100-column lines, arrow params without parens when possible. `noFloatingPromises` is an error, so every promise (e.g. `invoke(...)`) must be awaited or explicitly handled. `noConsole` is a warning. Components are named exports (`export const App = ...`).
