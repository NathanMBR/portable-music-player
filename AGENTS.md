# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## Project goal

A portable music player that runs on Linux and Windows **without installation**, so it can live on a flash drive. The drive holds both executables (one per OS) side by side; the user runs whichever matches their current OS. All app data (library, playlists, settings, etc.) is stored as `.json` files **in the same folder as the executable**.

Built with Tauri 2 + React 19 + TypeScript. Implemented so far: the music library scan, which creates the `Musics` folder next to the executable if it's missing and lists its `.mp3` files alphabetically.

## Commands

Package manager is **pnpm**.

```bash
pnpm install
pnpm tauri dev          # run the desktop app (starts Vite on :1420 via beforeDevCommand)
pnpm dev                # frontend only, in a browser (Tauri APIs unavailable)
pnpm build              # tsc type-check + vite build to dist/
pnpm tauri build        # release build of the native app
pnpm lint               # biome check --fix: lint + format, applying safe fixes
pnpm lint:ci            # biome check without fixes; reserved for the CI workflow
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests (#[cfg(test)] modules next to the code)
```

There is no frontend test runner yet. In dev the executable is `src-tauri/target/debug/portable-music-player`, so the app's `Musics` folder is `src-tauri/target/debug/Musics` (gitignored). CI (`.github/workflows/quality-assurance.yml`) runs `pnpm lint:ci` on every push to `master` and `development`. `lint:ci` is only for that workflow; when working locally, always use `pnpm lint` so issues get fixed.

## Architecture

- `src/`: React frontend, bundled by Vite into `dist/`, which Tauri embeds into the binary (`frontendDist`). The frontend calls Rust through `invoke()` from `@tauri-apps/api`.
- Styling is Tailwind CSS v4 via the `@tailwindcss/vite` plugin. Configuration is CSS-first: there is no `tailwind.config.js`; theme customization goes in `@theme` blocks in `src/index.css`, which is imported by `main.tsx`. Biome's `css.parser.tailwindDirectives` is enabled so `@theme`, `@apply`, etc. parse.
- UI primitives come from Headless UI (`@headlessui/react`, unstyled and accessible; style it with Tailwind) and icons from Heroicons (`@heroicons/react/24/outline`, `/24/solid`, `/20/solid`, `/16/solid`).
- Frontend state is managed with Zustand (`create<State>()(...)` stores). Persistent data still goes through Rust commands to the JSON files, not Zustand's `persist` middleware (which would use webview `localStorage`, outside the flash drive).
- `src-tauri/`: Rust backend. `main.rs` only calls `portable_music_player_lib::run()` in `lib.rs`, where commands are registered in `generate_handler![...]`. New permissions for plugins have to be added in `src-tauri/capabilities/default.json`.
- Release profile in `Cargo.toml` is tuned for small binaries (LTO, strip, `panic = "abort"`).

### Frontend layout

```
src/
  main.tsx              entry: font + CSS imports, starts the first library scan, renders <App />
  App.tsx               page shell
  index.css             Tailwind import, @theme design tokens, dark overrides, base styles
  components/           feature-agnostic UI built on Headless UI (Button, IconButton, Notice)
  features/<feature>/   everything one feature owns
    types.ts            data shapes returned by Rust (mirror the Rust structs)
    <feature>Api.ts     the only place that calls invoke() for the feature
    <feature>Store.ts   Zustand store: state + actions
    *.ts                pure helpers (sorting, formatting)
    *.tsx               feature components
```

- Components are `PascalCase.tsx`; other modules are `camelCase.ts`.
- Styling is Tailwind utilities in JSX. Reuse goes through React components, not `@apply` (base styles in `index.css` are the exception). Style Headless UI states with `data-hover:`, `data-focus:` and `data-disabled:`.
- Colors come only from the semantic tokens in `src/index.css` (`paper`, `ink`, `ink-faded`, `rule`, `pen`, `correction`). Tailwind's default palette is disabled with `--color-*: initial`. Dark mode follows the OS by redefining the same variables under `prefers-color-scheme: dark`, so components never use `dark:`.
- Type is Archivo Variable (weight and `font-stretch` width axes), bundled through `@fontsource-variable/archivo`. Never load fonts or other assets from a CDN: the app must work offline on any computer.
- Work that runs once per launch is started in `main.tsx`, not in a mount effect, because StrictMode runs effects twice in dev.

### Rust layout

- `portable.rs`: `root_dir()`, the folder containing the executable. Every app file lives under it.
- One module per feature (e.g. `library.rs`) holding its constants, data structs, commands and error enum.
- Commands are `async`: sync commands run on the main thread, and file I/O on a slow USB drive would freeze the window.
- Commands return `Result<T, FeatureError>`. The error enum uses `thiserror` for messages and serializes as its message string, which the frontend shows to the user. Structs sent to the frontend use `#[serde(rename_all = "camelCase")]`.

## Portability constraints

These follow from the project goal and are easy to get wrong:

- **Resolve data paths from the executable's location** (`std::env::current_exe()` → parent dir), in Rust. Don't use Tauri's `app_data_dir` / `app_config_dir` or the OS user profile, because they write outside the flash drive. Keep file I/O for the JSON stores in Rust commands, not in the webview.
- Both executables share the same folder and the same JSON files, so data formats must be OS-agnostic. Store music paths **relative to the executable folder** (the drive letter or mount point changes between machines and OSes), and normalize path separators.
- The portable artifact is the bare binary (`src-tauri/target/release/portable-music-player[.exe]`), not the installers/bundles `tauri build` produces (`bundle.targets` is `"all"`). If an AppImage is ever used, `current_exe()` points inside a temporary mount, so read the `APPIMAGE` env var instead.
- Each OS executable has to be built on (or cross-compiled for) that OS. Development here happens in WSL2, which produces the Linux binary.
- Runtime dependencies are on the host: Windows needs WebView2 (preinstalled on Win 10/11), and Linux needs webkit2gtk.
- Don't rely on the host's locale for anything order-sensitive. With `LANG=C` (WSL's default), the Linux webview's default `Intl` locale is `en-US-u-va-posix`, whose collation puts every uppercase letter before any lowercase one. Pass an explicit locale (see `src/features/library/sortTracks.ts`).
- Don't canonicalize paths shown to the user: on Windows, `canonicalize` adds a `\\?\` prefix.

## Git

**Always run `pnpm lint` before every commit**, and stage any fixes it applies as part of that commit.

Commit messages follow Conventional Commits with a short lowercase subject and no body (e.g. `chore: add headlessui and heroicons`, `ci: add quality assurance github workflow`). Never add a `Co-Authored-By` trailer or any other AI attribution line to commits or pull requests.

## Clean code

All code (TypeScript and Rust) must follow Clean Code principles:

- **Meaningful names**: names should say what something is for, and be easy to read and search. Don't abbreviate or use single letters outside tiny scopes (`track`, not `t`). Booleans read as predicates (`isPlaying`, `hasCover`), functions as verbs (`loadPlaylist`), components and types as nouns (`TrackList`, `Playlist`).
- **Small functions that do one thing**: keep each function at a single level of abstraction. If a block needs a comment to explain what it does, extract it into a well-named function. Keep parameter lists short, and group related values into an object or struct.
- **Single responsibility**: each module, component and store has one reason to change. Components render UI, Zustand stores hold state and its actions, Rust commands handle file I/O and system access, and pure helper functions hold the logic (path normalization, sorting, filtering). Keep business logic out of JSX.
- **No duplication, no speculation**: extract logic instead of copy-pasting it, but don't build abstractions or options for needs that don't exist yet (KISS, YAGNI).
- **No magic values**: use named constants for file names, limits, defaults and similar values.
- **Explicit types**: no `any`. Model domain data with explicit types, and prefer types that make invalid states impossible to represent.
- **Errors are handled, never swallowed**: Rust commands return `Result` instead of calling `unwrap`/`expect` on fallible operations. This matters here: the release profile uses `panic = "abort"`, so a panic kills the whole app. On the frontend, handle rejected `invoke` promises and show the failure to the user.
- **Comments explain why, not what**: code should explain itself. Don't leave commented-out code.
- **Leave it cleaner**: improve the code you touch, but keep unrelated refactors out of the change.

## Code style (Biome)

Single quotes, no semicolons, no trailing commas, 2-space indent, 100-column lines, arrow params without parens when possible. `noFloatingPromises` is an error, so every promise (e.g. `invoke(...)`) must be awaited or explicitly handled. `noConsole` is a warning. Components are named exports (`export const App = ...`).
