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
pnpm test               # every Vitest test once: unit tests (jsdom) + every story (headless Chromium)
pnpm test:watch         # the same, in watch mode
pnpm exec vitest run --project unit        # only the unit tests
pnpm exec vitest run --project storybook   # only the story tests
pnpm storybook          # Storybook on :6006: the UI documentation, and the MCP server for agents
pnpm build-storybook    # static Storybook in storybook-static/
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests (#[cfg(test)] modules next to the code)
```

In dev the executable is `src-tauri/target/debug/portable-music-player`, so the app's `Songs` folder is `src-tauri/target/debug/Songs` (gitignored). CI (`.github/workflows/quality-assurance.yml`) runs `pnpm lint:ci`, `pnpm test` and `cargo test` on every push to `master` and `development`. `lint:ci` is only for that workflow; when working locally, always use `pnpm lint` so issues get fixed.

## Architecture

- `src/`: React frontend, bundled by Vite into `dist/`, which Tauri embeds into the binary (`frontendDist`). The frontend calls Rust through `invoke()` from `@tauri-apps/api`.
- Styling is Tailwind CSS v4 via the `@tailwindcss/vite` plugin. Configuration is CSS-first: there is no `tailwind.config.js`; theme customization goes in `@theme` blocks in `src/index.css`, which is imported by `main.tsx`. Biome's `css.parser.tailwindDirectives` is enabled so `@theme`, `@apply`, etc. parse.
- UI primitives come from Headless UI (`@headlessui/react`, unstyled and accessible; style it with Tailwind) and icons from Heroicons (`@heroicons/react/24/outline`, `/24/solid`, `/20/solid`, `/16/solid`).
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
  components/           feature-agnostic UI built on Headless UI (Button, IconButton, Notice)
  features/<feature>/   everything one feature owns
    types.ts            data shapes returned by Rust (mirror the Rust structs)
    <feature>Api.ts     the only place that calls invoke() for the feature
    <feature>Store.ts   Zustand store: state + actions
    *.ts                pure helpers (sorting, formatting)
    *.tsx               feature components
    *.test.ts           unit tests of the module next to them
    *.stories.tsx       stories of the component next to them: its documentation and component tests
  docs/                 Storybook MDX pages (Introduction, Design tokens)
  testing/              helpers shared by tests and stories (mockCommands, resetStores, unit test setup)
```

- Components are `PascalCase.tsx`; other modules are `camelCase.ts`.
- Styling is Tailwind utilities in JSX. Reuse goes through React components, not `@apply` (base styles in `index.css` are the exception). Style Headless UI states with `data-hover:`, `data-focus:` and `data-disabled:`.
- Colors come only from the semantic tokens in `src/index.css` (`paper`, `ink`, `ink-faded`, `rule`, `pen`, `correction`, `shade`). Tailwind's default palette is disabled with `--color-*: initial`. Use `shade` for dimming overlays: `ink` turns light in dark mode, so it would brighten instead of dim.
- The theme is the `data-theme` attribute (`light` or `dark`) on `<html>`, and the dark values of the same tokens live under `:root[data-theme="dark"]`, so components never use `dark:`.
  - An inline script in `index.html` sets the attribute from the OS before the first paint.
  - `src/features/settings/settingsStore.ts` then applies the saved theme, if there is one, and the toggle saves new choices.
- Navigation: `src/features/navigation/categories.ts` lists the side menu's categories. `App.tsx` maps each category id to its view, so navigation never imports feature views. `App.tsx` also renders `MenuButton` in a column of its own, so views never include it and nothing sits under it. An empty column of the same width on the right keeps the view's side margins equal. A new category is one entry in `CATEGORIES` plus one view in `viewByCategory`.
- Type is Archivo Variable (weight and `font-stretch` width axes), bundled through `@fontsource-variable/archivo`. Never load fonts or other assets from a CDN: the app must work offline on any computer.
- Work that runs once per launch is started in `main.tsx`, not in a mount effect, because StrictMode runs effects twice in dev.

### Rust layout

- `portable.rs`: `root_dir()`, the folder containing the executable. Every app file lives under it.
- `main_window.rs`: the window remembers only its size, saved by the official `tauri-plugin-window-state`. It always opens centered.
  - The window starts hidden (`"visible": false` in `tauri.conf.json`). `show()` reads the saved size from the plugin's file, shrinks it to fit the current screen, centers it, and only then shows the window, so it never visibly jumps.
  - The plugin's own restore is skipped because on Linux it applies the size asynchronously, too late for centering. For the same reason Tauri's `center()` can't be used: GTK reports a 0×0 outer size until the window is first drawn.
- One module per feature (e.g. `library.rs`) holding its constants, data structs, commands and error enum.
- `settings.rs`: user settings in `settings.json` next to the executable.
  - A missing file gives the defaults, and `#[serde(default)]` keeps older files loading when fields are added.
  - Saves write a temporary file and rename it over the old one, so pulling the drive mid-save can't corrupt it.
- Commands are `async`: sync commands run on the main thread, and file I/O on a slow USB drive would freeze the window.
- Commands return `Result<T, FeatureError>`. The error enum uses `thiserror` for messages and serializes as its message string, which the frontend shows to the user. Structs sent to the frontend use `#[serde(rename_all = "camelCase")]`.

## Portability constraints

These follow from the project goal and are easy to get wrong:

- **Resolve data paths from the executable's location** (`std::env::current_exe()` → parent dir), in Rust. Don't use Tauri's `app_data_dir` / `app_config_dir` or the OS user profile, because they write outside the flash drive. The one deliberate exception is the window size, which the window-state plugin keeps in each computer's `app_config_dir`, because every computer has a different screen. Keep file I/O for the JSON stores in Rust commands, not in the webview.
- Both executables share the same folder and the same JSON files, so data formats must be OS-agnostic. Store music paths **relative to the executable folder** (the drive letter or mount point changes between machines and OSes), and normalize path separators.
- The portable artifact is the bare binary (`src-tauri/target/release/portable-music-player[.exe]`), not the installers/bundles `tauri build` produces (`bundle.targets` is `"all"`). If an AppImage is ever used, `current_exe()` points inside a temporary mount, so read the `APPIMAGE` env var instead.
- Each OS executable has to be built on (or cross-compiled for) that OS. Development here happens in WSL2, which produces the Linux binary.
- Runtime dependencies are on the host: Windows needs WebView2 (preinstalled on Win 10/11), and Linux needs webkit2gtk.
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
  - check the result with `test-run` (or `pnpm test`).
  - Without the server, read the story and MDX files directly.
- Every exported component has a JSDoc block saying what it's for and when it's used, ending with a `@summary` line, and every prop has a JSDoc line. This is the one exception to "comments explain why, not what": Storybook's Docs pages and its components manifest (what the MCP server serves) are built from them.
- Every component has a `<Component>.stories.tsx` next to it, in CSF 3:
  - one concept per story, with a JSDoc description saying when that situation happens;
  - stories set the store state they show in `beforeEach`, and mock the commands they trigger with `mockCommands`;
  - stories that set store state use `renderInOwnFrame`, so they don't overwrite each other on Docs pages;
  - stories written by an agent keep the `ai-generated` tag until the user reviews them and removes it, and stories that don't pass yet also carry `needs-work`.
- MDX pages have a `summary` on `<Meta>` and write all their content in the file, because the manifest doesn't follow imports. `DesignTokens.mdx` repeats the token values of `src/index.css`, so keep them in sync.
- `README.md` lists the user-facing features under **Features**, one short line each that names the feature without explaining it.
- Update the stories, the docs and the README in the same change as the feature.

## Testing

| Layer | Where | Runs with |
|---|---|---|
| Rust: file system, data formats, window sizing | `#[cfg(test)] mod tests` at the bottom of the module | `cargo test` |
| Frontend logic: helpers and stores | `*.test.ts` next to the module | Vitest `unit` project (jsdom) |
| Components: rendering, interactions, accessibility | stories and their `play` functions | Vitest `storybook` project (headless Chromium) |

- Vitest is configured in `vite.config.ts` (`test.projects`), and `pnpm test` runs both projects. Unit tests import `describe`, `it`, `expect` and `vi` from `vitest` explicitly (no globals).
- **Fake the Rust side only through `mockCommands`** (`src/testing/mockCommands.ts`):
  - it answers commands through Tauri's `mockIPC`, and a command without a handler rejects;
  - never mock the `*Api.ts` modules: going through `invoke` keeps the command names and argument shapes under test;
  - fake a Rust error with `failingCommand(message)`, since errors reach the frontend as strings.
- Stores reset automatically before every story and after every unit test (`src/testing/resetStores.ts`). A new store must be added there.
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

**Always run `pnpm lint` before every commit**, and stage any fixes it applies as part of that commit. Make sure `pnpm test` and `cargo test --manifest-path src-tauri/Cargo.toml` pass before committing, too.

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
- **Comments explain why, not what**: code should explain itself. Don't leave commented-out code. The one exception is the JSDoc that documents components and their props (see Documentation).
- **Leave it cleaner**: improve the code you touch, but keep unrelated refactors out of the change.

## Code style (Biome)

Single quotes, no semicolons, no trailing commas, 2-space indent, 100-column lines, arrow params without parens when possible. `noFloatingPromises` is an error, so every promise (e.g. `invoke(...)`) must be awaited or explicitly handled. `noConsole` is a warning. Components are named exports (`export const App = ...`).
