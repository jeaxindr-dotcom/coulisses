# Coulisses

*A video review studio for AI-assisted editing: annotate a video, before or after its export, and send the notes to the coding agent that made it.*

*[Version française](README.fr.md)*

Coulisses ("backstage" in French) is a local review studio for videos made with code — mainly [Remotion](https://www.remotion.dev) projects. You watch the video (or the live code), point at what is wrong, draw on the frame, leave notes on a frame or a range, and send them as a **batch** to **your agent**: the coding agent session that made the video (Claude Code today, Codex or any agent that can run commands tomorrow). The agent reads a precise request — frames, pixels, the 3D object under your gesture, the clips of the edit — fixes the code, answers on each note, and you see the fix at once in the live preview. Every fix can be undone.

It runs on Windows, as a small desktop app (an app window of Chrome or Edge, with no tabs and no address bar), and everything stays on your machine (`127.0.0.1`).

It was born as the review tool of the *Brambleshire Theatre* channel (a 3D paper theatre made in Remotion) and grew, with ideas taken from [HyperFrames Studio](https://github.com/heygen-com/hyperframes), into the review studio of several channels.

## Features

| | |
|---|---|
| **Gestures on the image** | **V** Select: hover to see the object you are aiming at, click, then **A** "Request an edit". **D** Draw: several strokes make one drawing. **C** a pinned comment. **N** a note on the frame, **R** a range. |
| **Pixel-exact 3D picking** | Under your gesture, a ray cast in the live preview's Three.js scene names the object hit ("Hazel · character", "flower arch · set"), reading the texture's transparency like the render does. A Remotion run names its elements through `data-coulisses="…"`. |
| **Pending edits, sent as a batch** | Up to 10 edits wait in the queue, editable, then **Send to the agent** turns them into a batch: a `.md` request with absolute paths and images (the frame, your drawing, a zoom, the end of a range). |
| **The link with the agent** | Each batch shows a line to paste in the agent's session. Or **Connect to the agent** once: the agent watches the tool in the background and each batch wakes it up. |
| **Live preview of the code** | **P** switches between the rendered MP4 and the current code (Remotion Player), rebuilt in about 0.15 s on every save, on the same frame. |
| **The agent's eyes** | `studio-cli.mjs frame` / `sheet` give a frame or a before/after strip, from the MP4 or from the code, so the agent checks its fix without a render. |
| **Undo a fix** | The agent snapshots the files before fixing; "Undo this fix" puts them back (refused if a file changed since). "Redo" applies it again. |
| **Staging** | **M**: move an object yourself in the preview. In a Theatre episode, a 3D object (drag it, Shift + drag for its height, handles, arrow keys, free camera, **Reset the camera**); in a Remotion run, any element of the picture in 2D (drag, wheel = size, Shift + wheel = turn), and **Camera** reframes the whole picture. Nothing is written: the exact offset and an "after" image go to the agent, who writes it in the code. The same tools and menus are in every project; one that does not apply is greyed, with the reason. |
| **Render or export from the studio** | For an episode, "Start the render" asks the agent for the full render (checks, render, finish) and shows its progress. For a Remotion run, "Export" runs the project's own export script, with its variants. The new video loads by itself, and **Compare before / after** wipes between the old and the new frame of every fixed note. |
| **A new project, built live** | **File › New project**: an empty 3D scene (React Three Fiber; a black background, a floor grid on the y = 0 plane, axes at the origin — editor aids, left out of the export), in `Documents\Coulisses\Projects\<name>\`. In the studio's **Agent** tab, you write what you want to see; each message goes at once to the agent connected to Coulisses, which writes the code, and the scene builds itself in the preview. The modules (Remotion, three.js, React Three Fiber) are installed once, on your order, and shared by every new project. |
| **Media library and image workshop** | The **Media** tab: one library per channel (characters, sets, props, effects), in `Documents\Coulisses\Media\<channel>\`. Describe an image in the workshop: **Codex CLI** creates it with its image_gen tool (your ChatGPT account, no API key), it lands in the library, and you refine it by answering ("bigger", "from the back"). Images dropped in are sorted by the agent. Drag an image onto the preview: it shows there at once, **as 3D cardboard** in a 3D scene (like Brambleshire's cardboard: the cut-out picture, its edge and its back, standing on the floor where you drop it, at the size of a prop, a character or a set piece), as is on a 2D picture. Place it with the staging tools, `Ctrl`+`Z` takes it away, then "Add to the queue": the agent adds it to the project at that place. On a video without code, it becomes a pinned edit. |
| **Imported projects** | Besides the episodes: an AItelier run (its Resolve tracks as the timeline), any folder of videos, a single video, or a `.coulisses` file. |
| **The `.coulisses` file** | Like a DaVinci Resolve project file: created at the start of a run, it points to the run's Remotion composition, which Coulisses plays **live, before any export**. |
| **Updates, checked with every batch** | Remotion's version and the agent's skills: the agent offers the updates as a multiple-choice question, and installs nothing without your consent. |
| **French or English** | Everything you see, and what the agent reads, follows one setting (see below). |
| **A menu bar** | File · Edit · Tools · Help, like any desktop app (see below). |

## Requirements

- Windows 10 or 11.
- [Node.js](https://nodejs.org) 22 or later on the `PATH`.
- Google Chrome (or Microsoft Edge) — the app window, the frames rendered from the code, and the tests.
- `ffmpeg` and `ffprobe` on the `PATH`.
- For the live preview: a Remotion project with `remotion` and `@remotion/player` installed (Coulisses uses the project's own `esbuild` and Remotion; it installs nothing).
- To build the `.exe` files: nothing beyond Windows (`csc.exe` of the .NET Framework 4.8).

## Install

1. **Get the app**: download `Coulisses-<version>.zip` from the [latest release](https://github.com/jeaxindr-dotcom/coulisses/releases/latest) and unzip it — the app with its two programs. Or clone this repository, then put `Coulisses.exe` and `Coulisses Setup.exe` in the cloned folder: download them from the same release, or build them with `pwsh -File app\build.ps1` (they are not in the repository).
2. **Install**: run `Coulisses Setup.exe` from that folder (it runs `install.mjs` next to it; or run `node install.mjs` yourself; `--dry` shows what would change, `--to <dir>` installs elsewhere). It copies the app to `%LOCALAPPDATA%\Programs\Coulisses\`, creates the "Coulisses" shortcuts (Desktop and Start menu) and makes a double-click on a `.coulisses` file open Coulisses (for your account, no admin rights). It refuses to overwrite files changed in the installed copy unless you confirm.
3. **Or run it from this folder**: `node hub-server.mjs` (the home screen), or `node studio-server.mjs E03 --episodes <folder>` / `node studio-server.mjs --project "<project folder>"` (one studio), then open the printed address.

> **This is one creator's setup.** A few defaults point to the author's own folders (the Brambleshire project in `lib/episode.mjs`, a Python path in `lib/render.mjs`, Chrome's path in `lib/frames.mjs` and `lib/render.mjs`, the start folder of the file dialog in `hub-server.mjs`). The imported projects, the `.coulisses` runs and the studio itself do not depend on them; the Brambleshire episodes and their render do.

## Using it

- **The home screen** lists the episodes and the imported projects: thumbnail, duration, date of the render, notes to fix, batches. **Open the studio** opens one; the "C" logo comes back. **Import a project** takes a folder, a video or a `.coulisses` file (the Windows dialog, a pasted path, or drag and drop on the app's icon). **Remove** takes a project off the list and deletes nothing. **Search for .coulisses…** finds every project file on the whole PC or in a chosen folder (never in Windows, Program Files, AppData, node_modules, .git or hidden folders, never through a junction) and imports the ones you tick. The projects are sorted into **folders**, by channel by default; **Folder** on a card (or dragging the card onto a folder) moves it, a folder can be renamed (the channel's next projects follow) or folded.
- **The studio**: the tools on the left, the image in the middle, the tabs on the right (**Edits**, **Notes**, **Batches**, **Inspector**, **Media**, **Scene**), the multi-track timeline at the bottom. The borders between the panels can be dragged.
- **Keyboard** (the default keys; **Help › Keyboard shortcuts** (`F1`) lists them all and changes any of them): `Ctrl`+`Z` undo, one step back · `Ctrl`+`Y` or `Ctrl`+`Shift`+`Z` redo, one step forward (notes, marks, pending edits, staging offsets; in a text field, first the field's own typing, then the steps before it: a note just made with `N`, still empty, goes away) · `Ctrl`+`S` save · `Del` delete the selected note · `Ctrl`+`Enter` send the edits · `Ctrl`+`O` open · `Space` play · `←` `→` frame by frame (hold = scrub ×2) · `Shift`+`←` `→` one second · `V` `D` `C` tools · `A` request an edit at the pointed spot · `N` note · `R` range · `I` `O` start / end of the selected note · `L` loop · `P` MP4 ⇄ code · `M` staging · `Del` delete · `Ctrl`+`V` paste an image · `F1` the shortcuts.
- **Timeline, DaVinci Resolve style**: wheel = tracks up / down · `Ctrl`+wheel = move through time · `Alt`+wheel = horizontal zoom · `Shift`+wheel = track height · double-click a line or a clip = a note on all of it · drag in the Notes band = a new range.
- **Send**: the **Edits** tab › **Send to the agent**. Paste the line shown in your agent's session, or connect the agent once (the button at the top).

### The menu bar

At the top of both the home screen and the studio, a menu bar like any desktop app: **File · Edit · Tools · Help**.

- **File**: Home (projects), Open a project… (`Ctrl+O`: a `.coulisses` file or a video), Import a folder… / a video…, Open the project folder, Show the `.coulisses` file in Explorer, Close the studio.
- **Edit**: Undo / Redo the last fix (the "Batches" panel's undo), Copy the line to paste, Copy the connect line, Preferences… (language, agent).
- **Tools**: Connect to the agent, Send the edits, Staging (`M`), Rendered MP4 ⇄ current code (`P`), Export ▸ (one entry per variant of the export script) and Stop the export for a Remotion run, Start / Stop the render for an episode, Compare before / after, Check for updates, Check the project (`projet verifier --rapide`), Log.
- **Help**: Keyboard shortcuts (`F1`: every action and its keys; click a key and press the new one, `+` adds one, `×` removes it, `↺` puts the original back; the same keys for the home screen and every project, kept in `settings.json`), The agent's protocol, Pipeline contract, Online documentation, About Coulisses.
- **Keyboard**: `Alt` alone or `F10` gives the bar the focus, `←` `→` move between menus, `↓` or `Enter` opens, `↑` `↓` in a menu, `→` opens a submenu, `Escape` closes. A click outside closes the menu.
- What makes no sense where you are is greyed out, and its tooltip says why. Every item calls the feature that already exists in the page (`menubar.js`, served by both servers).

### Language: French or English

- **One setting for everything you see**: the home screen, the studio, the dialogs of `Coulisses.exe` and `Coulisses Setup.exe`, the line to paste, the batch files the agent reads and the messages of `studio-cli.mjs`. In English the agent is pointed to `AGENT.en.md` (`AGENT.md` in French) and the pipelines to `docs/COULISSES-REMOTION-CONTRACT.md` (`docs/FICHE-COULISSES-REMOTION.md` in French).
- **By default**: the Windows display language — French gives French, any other language gives English.
- **To change it**: the "FR · EN" buttons of the home screen, or **Edit › Preferences…** in the menu bar. The choice is kept in `%LOCALAPPDATA%\Coulisses\settings.json` (`{ "lang": "en" }`) and applies to the whole app.
- **Other settings** in the same file: `"chrome"` and `"python"`, the programs to use when they are not where they usually are (Chrome renders and captures; Python runs two image checks of a Theatre render).
- **Safety**: the servers listen on this PC only (`127.0.0.1`) and answer only Coulisses itself (its pages, the agent's command line): a page of another site open in the browser is refused. One studio per project: opening a project twice shows the studio already open, so the notes never overwrite each other.
- **`COULISSES_LANG=fr|en`** forces the language (the tests use it, so they never touch your setting); `COULISSES_SETTINGS` points to another settings file.
- **The texts** live in `lib/i18n-fr.mjs` (the original French) and `lib/i18n-en.mjs`, same keys; `lib/i18n.mjs` is the engine (`{name}` values, `{n|one|other}` plurals). The pages receive their texts from the server that serves them (`{{key}}` in the HTML, `window.T(key, values)` in their script).
- **Machine markers never change** with the language, so agents and pipelines that parse them keep working: `COULISSES PROGRES` / `FIN` / `REMPLACE` (export scripts), `PROJET CONFORME` / `PROJET NON CONFORME`, `LOT N REÇU`, `DEMANDE DE RENDU (lot N) REÇUE`, the `RENDU …` verdicts of `studio-cli.mjs render`, `HUB_READY`. In English a short gloss follows them, e.g. `PROJET CONFORME (compliant): …`. The command names and flags (`projet creer`, `--depuis`, `--rapide`…) and the JSON fields (`titre`, `pistes`, `de`, `a`…) are French in both languages: they are an API.

## The agent's side

The full protocol is [`AGENT.en.md`](AGENT.en.md) (French: [`AGENT.md`](AGENT.md)). In short, with `CLI` = `node "<Coulisses folder>\studio-cli.mjs"`:

| Command | What it does |
|---|---|
| `CLI wait E03` | waits for a batch sent from the tool, prints it and exits (run in the background: its end wakes the session) |
| `CLI take E03 <batch>` | the tool shows "The agent is fixing" on the batch's notes |
| `CLI snapshot E03 <batch> <files…>` | saves the files before changing them (this is what makes "Undo this fix" possible) |
| `CLI frame E03 <frame> [--source code\|video]` | one frame, from the current code or from the MP4 |
| `CLI sheet E03 <note id>` | before / after strips around a note |
| `CLI reply E03 <note id> "<text>" --status done\|open` | the answer on a note (the strips are attached) |
| `CLI done E03 <batch> "<summary>"` | closes the batch and records the "after" state of the files |
| `CLI render E03 <batch>` | the full re-render asked from the studio (checks, render, finish) |
| `CLI undo E03 <batch> [--redo]` · `CLI status E03` · `CLI updates E03` | undo / redo, a summary, the update check |

An imported project is named by its path instead of `E03` (`CLI take "<project>\revue" 3`). Each batch `.md` holds the exact commands to run.

## The `.coulisses` contract (Remotion pipelines)

A pipeline whose edit is a Remotion composition becomes reviewable **before any export**. In short ([the full contract](docs/COULISSES-REMOTION-CONTRACT.md)):

1. One Remotion project per channel, one composition per run, the run's data in the project.
2. `src/coulisses.ts` — the list of compositions (the browser side, for the live preview); the `Root` builds its `<Composition>` from it.
3. `src/coulisses-timeline.ts` — the run's timeline in frames, data only (the Node side): `{ fps, durationInFrames, pistes: [{ id, nom, type: 'video'|'audio'|'band', clips: [{ de, a, label, fichier, … }] }] }`.
4. `data-coulisses="<name>"` on the visible elements that matter.
5. The run's `.coulisses` file, created at the start of the run: `node studio-cli.mjs projet creer --depuis spec.json`.
6. `node studio-cli.mjs projet verifier "<file>.coulisses"` until it says `PROJET CONFORME`, and look at the check image it renders.
7. Optionally `scripts/coulisses-rendu.mjs`, the export script Coulisses runs on your order (it prints `COULISSES PROGRES <pct> <step>` and ends with `COULISSES FIN "<file>"`; `--options` lists its variants).

`node tests\coulisses-fixture.mjs` generates a small complete example project that follows the contract.

## Files and who writes them

| File (in the episode's or project's `revue\`) | Written by |
|---|---|
| `notes.json` | the page only (never the agent) |
| `replies.json` | the agent only (`studio-cli.mjs`) |
| `lots\NNN.json`, `NNN.md`, `NNN\` | the server, when you send (the request and its images) |
| `runs\NNN\` | `studio-cli.mjs snapshot` and `done`, then the tool to undo |
| `studio-agent.json` | `studio-cli.mjs wait` (the heartbeat of the watching session) |
| `render.json`, `render.log`, `export.json`, `export.log` | `studio-cli.mjs render`, the export (progress and full output) |

## Architecture

| Path | Role |
|---|---|
| `app\` | `Launcher.cs` (`Coulisses.exe`: starts the home screen hidden, opens the app window, stops everything when it closes; the Windows file dialog), `Setup.cs` (`Coulisses Setup.exe`), `Lang.cs` (the dialogs' language), `build.ps1` |
| `hub-server.mjs` + `hub.html` | the home screen (port 4170, or 4171 in the workshop): the list, imports, one studio process per episode or project |
| `studio-server.mjs` + `studio.html` | a studio (port 4173 installed, 4174 in the workshop): the video, notes, batches, the live preview, render, export |
| `page/studio.css`, `page/studio/*.js` | the studio page's styles and script, in parts (`00-base.js` … `10-start.js`: preview, notes, gestures, staging, agent, render, cards, timeline, keys and menus, start); the server joins the parts in their order into one script (`/studio.js`), no build step |
| `menubar.js` | the menu bar of both pages, and their small dialogs |
| `studio-cli.mjs` | the agent's command line |
| `install.mjs` | copies the workshop into the installed app |
| `lib\` | `i18n*.mjs` (the texts), `lots.mjs` (batches, the line to paste), `frames.mjs` (frames from the MP4 or the code), `player-build.mjs` / `timeline-live.mjs` / `remotion-module.mjs` (the live preview and the timelines), `runs.mjs` (undo), `render.mjs`, `export.mjs`, `projects.mjs`, `coulisses-file.mjs` / `coulisses-check.mjs` (the `.coulisses` file and `projet verifier`), `updates.mjs`, `agent.mjs`, `menu.mjs`, `describe.mjs`, `peaks.mjs`, `episode.mjs`, `place.mjs` |
| `player\` | the Remotion Player of the live preview (`entry.tsx`, `remotion.tsx`) and the staging (`stage.ts`), compiled by the project's esbuild into `.cache\` |
| `tests\` | end-to-end tests: headless Chrome driven through the DevTools protocol (`cdp.mjs`), no dependency |
| `docs\` | the pipeline contract (`COULISSES-REMOTION-CONTRACT.md`, `FICHE-COULISSES-REMOTION.md`) and an internal planning note (French) |

## Tests

Every suite runs in French (`COULISSES_LANG=fr`, set by the tests themselves); `tests\i18n.mjs` runs in English.

- **All of them, in one command**: `node tests\run-all.mjs` (`--quick` leaves out the three slowest; `--only a,b`, `--skip a,b`). It starts the sandbox studios the suites need itself, with the tests' own settings and media library (never yours), prints one line per suite and a summary, and keeps each suite's log in `.cache\run-all\`.
- **What is not in the repository** (a Remotion project's `node_modules`, Uchu-chan's theatre and its Short 12, the real E03 video) is found by `tests\where.mjs`: set `COULISSES_TEST_REMOTION`, `COULISSES_TEST_UCHU`, `COULISSES_TEST_SHORT12`, `COULISSES_TEST_E03` on another PC; a suite whose resource is missing skips itself. `COULISSES_TEST_SLOW=2` doubles every fixed wait on a slower PC.

- **Render this shot** (`node tests\shot-render.mjs`): a 3D shot edited into a Short as a clip (its `.coulisses` "utilise") gets, in its studio (Batches tab), a "Render this shot" button: the shot's video made again from the current code, in the format of the clip it replaces, checked, the old clip kept in `revue\shot-backups\` ("Put the previous version back"), then put in place in the Short, whose open studio refreshes.
- **On their own**: `node tests\guard.mjs` (only Coulisses may call its servers; one studio per project), `node tests\typecheck.mjs` (the TypeScript of the live preview, `player\`, checked with the TypeScript and the types of a Remotion project on the PC: nothing is installed), `node tests\coulisses.mjs` (a Remotion run reviewed before any export), `node tests\coulisses-video.mjs` (the "video" `.coulisses`), `node tests\coulisses-export.mjs` (export from the studio), `node tests\projects.mjs` (imported projects), `node tests\app.mjs` (the Windows app, its window made invisible), `node tests\i18n.mjs` (English: home screen, studio, a batch and its line to paste, the command line, the menu bar, and no French text left on screen; then the language switch), `node tests\menu.mjs` (the menu bar, in French), `node tests\medias.mjs` (the Media tab, with a stand-in for Codex).
- **With a sandbox studio running first**, `node studio-server.mjs E03 --no-open --episodes "<workshop>\sandbox\07_Episodes" --port 4174` (and `COULISSES_LANG=fr`): `node tests\e2e.mjs`, `node tests\e2e-agent.mjs`, `node tests\staging.mjs`.
- **The render** (stand-in steps, no real render): on the test sandbox `.cache\sandbox-test\07_Episodes`, start a studio on port 4180 with `STUDIO_PORT=4180` and `STUDIO_SANDBOX=<that folder>`, run `node tests\render.mjs`, stop the server, then `node tests\render.mjs --restore`.

## License

[MIT](LICENSE).

Coulisses takes ideas from [HyperFrames Studio](https://github.com/heygen-com/hyperframes) (HeyGen, Apache 2.0); no code nor binary is copied from it. The icons are drawn after [Lucide](https://lucide.dev) (ISC).
