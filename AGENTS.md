# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## Project goal

A portable music player that runs on Linux and Windows **without installation**, so it can live on a flash drive. The drive holds both executables (one per OS) side by side; the user runs whichever matches their current OS. All app data (library, playlists, settings, etc.) is stored as `.json` files **in the same folder as the executable**.

This is currently a fresh Tauri 2 + React 19 + TypeScript scaffold (`src/App.tsx` is a placeholder; `src-tauri/src/lib.rs` still has the template `greet` command).

## Commands

Package manager is **pnpm**.

```bash
pnpm install
pnpm tauri dev          # run the desktop app (starts Vite on :1420 via beforeDevCommand)
pnpm dev                # frontend only, in a browser (Tauri APIs unavailable)
pnpm build              # tsc type-check + vite build to dist/
pnpm tauri build        # release build of the native app
pnpm lint               # biome check --fix: lint + format, applying safe fixes
pnpm lint:ci            # biome check: lint + format check only, no writes (run by CI)
cargo check --manifest-path src-tauri/Cargo.toml
```

There is no test setup yet. CI (`.github/workflows/quality-assurance.yml`) runs `pnpm lint:ci` on every push to `master` and `development`.

## Architecture

- `src/`: React frontend, bundled by Vite into `dist/`, which Tauri embeds into the binary (`frontendDist`). The frontend calls Rust through `invoke()` from `@tauri-apps/api`.
- Styling is Tailwind CSS v4 via the `@tailwindcss/vite` plugin. Configuration is CSS-first: there is no `tailwind.config.js`; theme customization goes in `@theme` blocks in `src/index.css`, which is imported by `main.tsx`. Biome's `css.parser.tailwindDirectives` is enabled so `@theme`, `@apply`, etc. parse.
- UI primitives come from Headless UI (`@headlessui/react`, unstyled and accessible; style it with Tailwind) and icons from Heroicons (`@heroicons/react/24/outline`, `/24/solid`, `/20/solid`, `/16/solid`).
- Frontend state is managed with Zustand (`create<State>()(...)` stores). Persistent data still goes through Rust commands to the JSON files, not Zustand's `persist` middleware (which would use webview `localStorage`, outside the flash drive).
- `src-tauri/`: Rust backend. `main.rs` only calls `portable_music_player_lib::run()` in `lib.rs`, where commands are registered in `generate_handler![...]`. New permissions for plugins have to be added in `src-tauri/capabilities/default.json`.
- Release profile in `Cargo.toml` is tuned for small binaries (LTO, strip, `panic = "abort"`).

## Portability constraints

These follow from the project goal and are easy to get wrong:

- **Resolve data paths from the executable's location** (`std::env::current_exe()` → parent dir), in Rust. Don't use Tauri's `app_data_dir` / `app_config_dir` or the OS user profile, because they write outside the flash drive. Keep file I/O for the JSON stores in Rust commands, not in the webview.
- Both executables share the same folder and the same JSON files, so data formats must be OS-agnostic. Store music paths **relative to the executable folder** (the drive letter or mount point changes between machines and OSes), and normalize path separators.
- The portable artifact is the bare binary (`src-tauri/target/release/portable-music-player[.exe]`), not the installers/bundles `tauri build` produces (`bundle.targets` is `"all"`). If an AppImage is ever used, `current_exe()` points inside a temporary mount, so read the `APPIMAGE` env var instead.
- Each OS executable has to be built on (or cross-compiled for) that OS. Development here happens in WSL2, which produces the Linux binary.
- Runtime dependencies are on the host: Windows needs WebView2 (preinstalled on Win 10/11), and Linux needs webkit2gtk.

## Git

Commit messages follow Conventional Commits with a short lowercase subject and no body (e.g. `chore: add headlessui and heroicons`, `ci: add quality assurance github workflow`). Never add a `Co-Authored-By` trailer or any other AI attribution line to commits or pull requests.

## Code style (Biome)

Single quotes, no semicolons, no trailing commas, 2-space indent, 100-column lines, arrow params without parens when possible. `noFloatingPromises` is an error, so every promise (e.g. `invoke(...)`) must be awaited or explicitly handled. `noConsole` is a warning. Components are named exports (`export const App = ...`).
