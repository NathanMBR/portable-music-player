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

In dev the executable is `src-tauri/target/debug/portable-music-player`, so the app's `Songs` folder is `src-tauri/target/debug/Songs` (gitignored). CI (`.github/workflows/quality-assurance.yml`) runs `pnpm lint:ci`, `pnpm test:ts` and `cargo test` on every push to `master` and `development`. `lint:ci` is only for that workflow; when working locally, always use `pnpm lint` so issues get fixed. Two workflows, each a copy of Tauri's official publish workflow, build the Linux (`ubuntu-22.04`) and Windows (`windows-latest`) releases: the bare executables, the AppImage, the Windows installers and the updater's `latest.json`. They differ only in their trigger and release settings, so a change to the build goes in both:
- `publish-stable.yml`, when Quality Assurance passes on a push to `master` (`workflow_run`, so it builds and tags the commit QA tested): a draft release tagged `v<version>`;
- `publish-unstable.yml`, on every push to `development`, without waiting for Quality Assurance: a pre-release tagged `v<version>-unstable.<run id>.<run attempt>`, with `unstable` and `<run id>_<run attempt>` (just before the extension) in every file name, so downloads of different builds never overwrite each other.

Both sign the updater artifacts with the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets, and turn on `bundle.createUpdaterArtifacts` only in their build command, so a local `pnpm tauri build` needs no key. Signing requires the matching public key in `plugins.updater.pubkey` of `tauri.conf.json`, even before the app uses the updater plugin: without it, bundling fails with `plugins > updater doesn't exist`.

## Architecture

- `src/`: React frontend, bundled by Vite into `dist/`, which Tauri embeds into the binary (`frontendDist`). The frontend calls Rust through `invoke()` from `@tauri-apps/api`.
- Styling is Tailwind CSS v4 via the `@tailwindcss/vite` plugin. Configuration is CSS-first: there is no `tailwind.config.js`; theme customization goes in `@theme` blocks in `src/index.css`, which is imported by `main.tsx`. Biome's `css.parser.tailwindDirectives` is enabled so `@theme`, `@apply`, etc. parse.
- UI primitives come from Headless UI (`@headlessui/react`, unstyled and accessible; style it with Tailwind) and icons from Heroicons (`@heroicons/react/24/outline`, `/24/solid`, `/20/solid`, `/16/solid`).
- Notifications in the bottom-right corner come from Sonner (`sonner`), only through `src/features/notifications/notify.ts`: `notifyError(title, error)` for failures, `notify(title, description?)` for anything else. Features never import `sonner` directly. `NotificationArea` renders Sonner's `Toaster` once, from `App.tsx`, as a portal on `<body>`: the side menu's modal dialog makes the app's root inert, and a notification raised from the menu must stay reachable.
- Frontend state is managed with Zustand (`create<State>()(...)` stores). Persistent data still goes through Rust commands to the JSON files, not Zustand's `persist` middleware (which would use webview `localStorage`, outside the flash drive).
- `src-tauri/`: Rust backend. `main.rs` only calls `portable_music_player_lib::run()` in `lib.rs`, where commands are registered in `generate_handler![...]`. New permissions for plugins have to be added in `src-tauri/capabilities/default.json`.
- Release profile in `Cargo.toml` is tuned for small binaries (LTO, strip, `panic = "abort"`).

### Frontend layout

```
.storybook/             Storybook config: main.ts (addons, components manifest), preview.tsx (app CSS,
                        theme toolbar, fake Rust commands, store reset, a11y checks)
src/
  main.tsx              entry: font + CSS imports, restores settings, starts the first library scan, renders <App />
  App.tsx               page shell
  index.css             Tailwind import, @theme design tokens, dark overrides, base styles
  constants.ts          app-wide constants (APP_TITLE_LINES); feature constants live in their feature
  components/           feature-agnostic UI built on Headless UI
    <Component>/        one folder per component (Button, IconButton, Notice, Slider): <Component>.tsx
                        and every <Component>.* file that belongs to it, like its stories
    buttonStyles.ts     the looks and states every button shares, so it sits outside any one component
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
                        withNotificationArea, unit test setup)
```

- Components are `PascalCase.tsx`, each in a `<Component>/` folder with its stories; other modules are `camelCase.ts` and stay at the root of their feature (or of `components/`).
- Styling is Tailwind utilities in JSX. Reuse goes through React components, not `@apply` (base styles in `index.css` are the exception). Style Headless UI states with `data-hover:`, `data-focus:` and `data-disabled:`.
- Buttons and other controls take their look and states from `src/components/buttonStyles.ts`: a `variant` named by look (`quiet`, `outlined`, `filled`), `ACTIVE_CLASSES` for whatever is on (pressed toggles, the playing song, the current category), `FOCUS_CLASSES` and `DISABLED_CLASSES`. Components own only their geometry. Add a new look there instead of hand-writing colors in a component.
- Colors come only from the semantic tokens in `src/index.css` (`paper`, `ink`, `ink-faded`, `rule`, `pen`, `correction`, `shade`). Tailwind's default palette is disabled with `--color-*: initial`. Use `shade` for dimming overlays: `ink` turns light in dark mode, so it would brighten instead of dim.
- The theme is the `data-theme` attribute (`light` or `dark`) on `<html>`, and the dark values of the same tokens live under `:root[data-theme="dark"]`, so components never use `dark:`.
  - An inline script in `index.html` sets the attribute from the OS before the first paint.
  - `src/features/settings/settingsStore.ts` then applies the saved theme, if there is one, and the toggle saves new choices.
- Navigation: `src/features/navigation/categories.ts` lists the side menu's categories. `App.tsx` maps each category id to its view, so navigation never imports feature views. `App.tsx` also renders `MenuButton` in the views' left margin, so views never include it. Views keep equal side margins with `px-gutter` (the `gutter` spacing token), so nothing sits under the button. A new category is one entry in `CATEGORIES` plus one view in `viewByCategory`.
- Scrolling: the window never scrolls. `App.tsx` makes the page exactly the window's height, and each view keeps its header in place and scrolls only the content below it (`main`).
  - The app draws every scrollbar itself: `::-webkit-scrollbar` base styles in `src/index.css`, `scrollbar` spacing token for the width. WebKitGTK and WebView2 both draw those, and WebView2 would ignore them if `scrollbar-color` or `scrollbar-width` were set.
  - The scrollbar sits in the right gutter, beside the content, and the content keeps the width between the gutters, like the header (`px-gutter`). The scroll area stops inside the right gutter (see `LibraryView.tsx`) and uses `overflow-y-scroll`, so the scrollbar always keeps its room and only hides while nothing scrolls: WebKitGTK ignores `scrollbar-gutter`.
  - Playwright hides scrollbars by default, so the story tests launch Chromium without `--hide-scrollbars` (`vite.config.ts`) to lay them out like the webviews.
- Playback: `App.tsx` renders `AudioPlayer` after the views, never inside one, so a song keeps playing when the category changes. The `player` spacing token in `src/index.css` sets the player's height, and, only while it's open, the space kept for it at the bottom of the window (`pb-player`, eased with the player's slide) and the notifications' bottom offset (`NotificationArea`'s `bottomClearance`), so nothing hides behind it.
  - The audio plays from `src/features/playback/songAudio.ts`, the only module that touches it. `main.tsx` connects it once to an `Audio` element, which then follows the playback store (song, play state, position, volume) and reports the song's length, progress and end back to it. Stories never connect it, so they stay silent.
    - The progress follows the wall clock between the audio's reports (`progressEstimate.ts`), from the moment the audio's clock is seen moving until it pauses, waits for data or jumps. On Linux, PulseAudio's clock can hold still for seconds and then catch up while the song plays on (seen in WSL and on Linux Mint, and with plain GStreamer), which froze the progress bar.
  - Where songs play from depends on the OS, and Rust decides: `song_source` (`library.rs`) finds a track's file from its relative path and answers `stream` on Linux or `memory` on Windows (`STREAMS_SONGS`). The frontend never handles absolute paths.
    - On Linux they stream from `song_server.rs`, a small HTTP server on `127.0.0.1`, started with the first song: a random port, a random token in every URL, Range requests for seeking, and only the MP3s of the Songs folder. Blob URLs can't be used there: WebKitGTK 2.48+ plays `blob:` media through a 2 MB ring buffer that skips ahead in larger files while the timer keeps counting.
    - On Windows `read_song` sends the whole file as raw bytes (`tauri::ipc::Response`), and `songAudio.ts` plays them from an object URL, freed when the song changes. WebView2 plays those fine, and the song server would run into its planned Local Network Access checks on requests to `127.0.0.1`.
    - Tauri's asset protocol (`convertFileSrc`) can't be used for audio: WebKitGTK's media backend can't stream from a custom URI scheme, and `play()` fails with `NotSupportedError`. A CSP added later must allow `blob:` and `http://127.0.0.1:*` as media sources.
  - `windowTitle.ts`, also connected once from `main.tsx`, names the window after the song in the player (`setTitle`, allowed by `core:window:allow-set-title` in the capabilities), and after the app while there is none. It sets the title only when it changes, since the store changes a few times a second while a song plays.
  - Before loading a song, `songAudio.ts` checks `canPlayType('audio/mpeg')` and, if it's empty, notifies what to install instead. WebKitGTK freezes the whole app, with no `error` event, as soon as it gets a source that GStreamer lacks the plugins (`appsink`, `autoaudiosink`, an MP3 decoder) to play.
- Type is Archivo Variable (weight and `font-stretch` width axes), bundled through `@fontsource-variable/archivo`. Never load fonts or other assets from a CDN: the app must work offline on any computer.
- Work that runs once per launch is started in `main.tsx`, not in a mount effect, because StrictMode runs effects twice in dev.

### Rust layout

- `portable.rs`: `root_dir()`, the folder containing the executable, or the AppImage it runs from. Every app file lives under it.
- `main_window.rs`: the window remembers only its size, saved by the official `tauri-plugin-window-state`. It always opens centered.
  - The window starts hidden (`"visible": false` in `tauri.conf.json`). `show()` reads the saved size from the plugin's file, shrinks it to fit the current screen, centers it, and only then shows the window, so it never visibly jumps.
  - The plugin's own restore is skipped because on Linux it applies the size asynchronously, too late for centering. For the same reason Tauri's `center()` can't be used: GTK reports a 0×0 outer size until the window is first drawn.
- One module per feature (e.g. `library.rs`) holding its constants, data structs, commands and error enum.
- `song_server.rs`: the HTTP server that streams songs to the Linux webview, on `std::net` with no HTTP crate.
  - It answers one request per connection, each on its own thread, since sending a song takes as long as the webview takes to read it.
  - Every request goes through `library::find_song_in`, the same check as `song_source`, so the server reaches no other file.
  - Its threads must never panic: the release build aborts on panic, which would kill the app. A failed write only means the webview let go of the song.
  - Responses carry `Cache-Control: no-store`, so the webview doesn't copy songs into its cache on the computer.
- `settings.rs`: user settings in `settings.json` next to the executable.
  - A missing file gives the defaults, and `#[serde(default)]` keeps older files loading when fields are added.
  - Saves write a temporary file and rename it over the old one, so pulling the drive mid-save can't corrupt it.
- Commands are `async`: sync commands run on the main thread, and file I/O on a slow USB drive would freeze the window.
- Commands return `Result<T, FeatureError>`. The error enum uses `thiserror` for messages and serializes as its message string, which the frontend shows to the user. Structs sent to the frontend use `#[serde(rename_all = "camelCase")]`.

## Portability constraints

These follow from the project goal and are easy to get wrong:

- **Resolve data paths from the executable's location** (`std::env::current_exe()` → parent dir), in Rust. Don't use Tauri's `app_data_dir` / `app_config_dir` or the OS user profile, because they write outside the flash drive. The one deliberate exception is the window size, which the window-state plugin keeps in each computer's `app_config_dir`, because every computer has a different screen. Keep file I/O for the JSON stores in Rust commands, not in the webview.
- Both executables share the same folder and the same JSON files, so data formats must be OS-agnostic. Store music paths **relative to the executable folder** (the drive letter or mount point changes between machines and OSes), and normalize path separators.
- The portable artifact is the bare binary (`src-tauri/target/release/portable-music-player[.exe]`), not the installers/bundles `tauri build` produces (`bundle.targets` lists `appimage`, `msi` and `nsis`; the bundler keeps those of the OS it builds on, so there are no `.deb` or `.rpm` packages). An AppImage works too: it runs the executable from a temporary read-only mount, so `root_dir()` uses the folder of the AppImage file (`APPIMAGE`) while the executable is inside that mount (`APPDIR`). Programs started from an AppImage inherit both variables, so outside the mount they're ignored.
- Each OS executable has to be built on (or cross-compiled for) that OS. Development here happens in WSL2, which produces the Linux binary.
- Runtime dependencies are on the host: Windows needs WebView2 (preinstalled on Win 10/11), and Linux needs webkit2gtk plus GStreamer's good plugins (`gstreamer1.0-plugins-good`), which decode MP3 for the webview. An AppImage can't use the host's plugins: its bundled GStreamer is relocatable and looks for them only in `usr/lib/gstreamer-1.0` next to itself, so `bundle.linux.appimage.bundleMediaFramework` copies the build machine's plugins into it. That setting only touches the AppImage: Windows plays MP3 through WebView2, without GStreamer.
- Don't rely on the host's locale for anything order-sensitive. With `LANG=C` (WSL's default), the Linux webview's default `Intl` locale is `en-US-u-va-posix`, whose collation puts every uppercase letter before any lowercase one. Pass an explicit locale (see `src/features/library/sortTracks.ts`).
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
- `private/` holds the user's own files and the generated test reports. Git tracks only its `.gitignore`, which ignores everything else in it. `private/tests.html` is a hand-written guide to the tests: never update it, even when the tests change, unless the user asks for it.
- Update the stories, the docs and the README in the same change as the feature.

## Testing

| Layer | Where | Runs with |
|---|---|---|
| Rust: file system, data formats, window sizing, the song server | `#[cfg(test)] mod tests` at the bottom of the module | `pnpm test:rs` |
| Frontend logic: helpers and stores | `*.test.ts` next to the module | Vitest `unit` project (jsdom) |
| Components: rendering, interactions, accessibility | stories and their `play` functions | Vitest `storybook` project (headless Chromium) |

- Vitest is configured in `vite.config.ts` (`test.projects`), and `pnpm test:ts` runs both projects. Unit tests import `describe`, `it`, `expect` and `vi` from `vitest` explicitly (no globals).
- **Fake the Rust side only through `mockCommands`** (`src/testing/mockCommands.ts`):
  - it answers commands through Tauri's `mockIPC`, and a command without a handler rejects;
  - never mock the `*Api.ts` modules: going through `invoke` keeps the command names and argument shapes under test;
  - fake a Rust error with `failingCommand(message)`, since errors reach the frontend as strings.
- Stores reset automatically before every story and after every unit test (`src/testing/resetStores.ts`). A new store must be added there. The reset also dismisses every notification.
- Notifications are checked through what the user sees:
  - in unit tests, `shownNotifications()` (`src/testing/notifications.ts`) lists the ones on screen as `{ type, title, description }`;
  - stories of a component that raises them add the `withNotificationArea` decorator and find the text in `<body>`. Notifications fade in, so wait for them with `waitFor(() => expect(...).toBeVisible())`.
- **Every story is a test**:
  - It must render, its `play` function must pass, and the axe accessibility check must find no violations. That check is `a11y.test: 'error'` in `.storybook/preview.tsx`, run on the whole `<body>` so portaled dialogs are included.
  - Write a `play` only when it proves something the render doesn't: an interaction, async content, an aria state.
  - In a `play`, use the `canvas` and `userEvent` it receives. Query portaled content, like the side menu, with `within(canvasElement.ownerDocument.body)`.
  - The `CssCheck` story in `Button.stories.tsx` proves the app's CSS loads in Storybook; there is only one.
- **Rust commands stay thin**:
  - a command resolves its path from `portable::root_dir()` and delegates to a function that takes it (`ensure_songs_dir_in`, `read_settings`, `write_settings`);
  - tests call that function with a `tempfile::tempdir()`, never the real executable folder, and the folder is deleted even when a test fails.
- Every struct and error sent to the frontend has a test pinning its JSON (`serde_json::to_value`), which must match the TypeScript type in the feature's `types.ts`.
- `unwrap`/`expect` are fine in tests: a panic is how a Rust test fails.
- **Example songs come from `test/get_mock_songs.sh`**, in stories, tests (frontend and Rust) and docs: titles, file names and paths alike. Never make up a song name.
  - Run `test/get_mock_songs.sh <count>`, asking for as many songs as the example needs, and use the titles it prints (one per line, picked at random from `test/mock_songs.txt`). It repeats songs only when you ask for more than the file holds.
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

## Clean code

All code (TypeScript and Rust) must follow Clean Code principles:

- **Meaningful names**: names should say what something is for, and be easy to read and search. Don't abbreviate or use single letters outside tiny scopes (`track`, not `t`). Booleans read as predicates (`isPlaying`, `hasCover`), functions as verbs (`loadPlaylist`), components and types as nouns (`TrackList`, `Playlist`).
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
