# 🪺 CodeNest

A lightweight desktop project manager built with **Tauri 2 + React + TypeScript**.
Create new dev projects from presets, manage them in one dashboard, and launch them
in the IDE of your choice.

## Features

- **Project dashboard** — search, favorites, last-opened sorting, import existing folders
  (project type is auto-detected).
- **New Project wizard** — scaffold from presets with live console output:
  - **Web:** Angular, React, Vue, Svelte, Next.js, Vanilla TS (Vite), Static HTML
  - **.NET:** C# Console, ASP.NET Web API, ASP.NET MVC, Blazor, WPF, WinForms, Class Library
  - **Basics:** Node.js, Empty project
  - Optional `git init`, tool availability checks (npm / dotnet), open in IDE when done.
- **IDE integration** — auto-detects installed IDEs (VS Code *(default)*, Visual Studio
  2022/2019, JetBrains family, Cursor, Windsurf, VSCodium, Sublime Text, Notepad++, Zed,
  Android Studio) and lets you add any editor manually. Global default IDE plus per-project
  override; Visual Studio opens the `.sln`/`.csproj` automatically.
- **Run projects** — integrated console with live output and stop button, or launch in an
  external terminal window. Run command per preset, overridable per project.
- **Extras** — open project folder in Explorer, open a terminal there, local JSON storage
  (no cloud, no account).

## Development

```bash
npm install
npm run tauri dev     # run the app in dev mode
npm run tauri build   # build the Windows installer
```

- Frontend: `src/` (React + TS, presets in `src/presets.ts`)
- Backend: `src-tauri/src/lib.rs` (process spawning, IDE detection, storage)
- Project data is stored in `%APPDATA%/com.johanneshehl.codenest/codenest.json`

## Adding a preset

Add an entry to `PRESETS` in [src/presets.ts](src/presets.ts) — a preset is just a list of
shell commands (plus optional built-in file template and run command). No other changes needed.
