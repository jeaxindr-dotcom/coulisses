# Contract: moving a video pipeline to Remotion, compatible with Coulisses

*French version (the original): [FICHE-COULISSES-REMOTION.md](FICHE-COULISSES-REMOTION.md). The field names, the command names and their flags are French in both versions (`pistes`, `nom`, `de`, `a`, `projet creer`, `--depuis`…): they are an API, not text.*

**To give to the session (Claude Code, Codex…) that maintains a channel's plugin or skill**: L'AItelier, Vidéo du monde (The Unfinished Atlas), Uchu-chan (宇宙ちゃん). Brambleshire Theatre is already in Remotion: Coulisses knows it, nothing to do here for it.

## The goal, in two sentences

**Coulisses** is the user's review studio, formerly "Brambleshire Studio". It must be able to **review a run before any export**:
- it opens the run's `.coulisses` file;
- it compiles the Remotion project and plays the composition live;
- its timeline knows what each piece is ("this motion graphic, from this frame to that frame");
- the user annotates, and their notes go to the agent in batches.

No more waiting for an hour-and-a-half export to review.

So **the video's edit must be a Remotion composition**, no longer a Resolve edit nor a HyperFrames composition, and the project must expose two small modules described below. HyperFrames compatibility will come later in Coulisses: for now, it is Remotion.

## What to deliver (checklist)

1. **One Remotion project per channel**, not per run. It is a folder with `package.json`, `node_modules`, `src/index.ts` (`registerRoot`) and `public/`.
2. **One composition per run**, with a stable id, for example `AIT-2026-10-06-recap-ia-semaine`. The run's data (shots, texts, timing) live **in the project**, in `src/runs/<run>.ts` or in JSON imported by the code. The Coulisses preview reloads on every save.
3. **`src/coulisses.ts`**: the list of compositions. It is the single source: the `Root` declares its `<Composition>` from it.
4. **`src/coulisses-timeline.ts`**: the run's timeline, in frames, for Node. Data only: no component imported.
5. **`data-coulisses="<readable name>"`** on the visible elements that matter (titles, cards, diagrams, parts of a motion graphic). A note pinned on them names them by itself.
6. **Media through `staticFile()`**, from `public/<run>/`. That folder can be a junction to the run's media: `mklink /J`, without copying.
7. **The `.coulisses` file, created at the start of the run**, by the `projet creer` command, see below.
8. **`projet verifier` must say "PROJET CONFORME"**, and the check image it produces must be looked at.

## The two modules of the contract

### `src/coulisses.ts` (the browser: the live preview)

```ts
import { MonRun } from './MonRun';
import { RUN, totalFrames } from './runs/2026-10-06_recap-ia-semaine';
export const compositions = [
  { id: 'AIT-2026-10-06-recap-ia-semaine', component: MonRun, fps: 30, width: 1920, height: 1080,
    durationInFrames: (props) => totalFrames(), defaultProps: { run: '2026-10-06_recap-ia-semaine' } },
];
```

- `durationInFrames`: a number, or a function of the props. A Short is `width: 1080, height: 1920`.
- `Root.tsx`: `compositions.map((c) => <Composition key={c.id} id={c.id} component={c.component} fps={c.fps} width={c.width} height={c.height} durationInFrames={…} defaultProps={c.defaultProps} />)`. If the Root and this module diverge, `projet verifier` reports it.

### `src/coulisses-timeline.ts` (Node: the timeline)

```ts
import { RUN, totalFrames } from './runs/2026-10-06_recap-ia-semaine';
export function timeline(compositionId: string, props: unknown) {
  return {
    fps: 30, durationInFrames: totalFrames(),
    pistes: [
      { id: 'chap', nom: 'Chapitres', type: 'band',  clips: [{ de: 0, a: 1177, label: 'acte0-hook' }] },
      { id: 'V1',   nom: 'Plans',     type: 'video', clips: [{ de: 0, a: 489, label: 'plan s00-01 · titre', fichier: 'src/scenes/S0001.tsx', ref: 's00-01' }] },
      { id: 'V2',   nom: 'Présentateur', type: 'video', clips: [{ de: 0, a: 489, label: 'présentateur acte0', fichier: 'public/<run>/06-metahuman/acte0.mp4', debut: 0 }] },
      { id: 'A1',   nom: 'Voix',      type: 'audio', clips: [{ de: 0, a: 19034, label: 'voix du film', son: '<run>/voix.wav' }] },
    ],
  };
}
```

- **A track** (`piste`): `id`, a readable `nom`, `type` = `video` (visible clips), `audio` (waveform) or `band` (chapters or sections). The track names are shown as they are: write them in the language you want to see.
- **A clip**:
  - `de` and `a`, in frames of the composition, `a` excluded;
  - a readable `label`;
  - `fichier`: **the file to fix** for this piece (component, media);
  - `ref`: the id of the segment or scene;
  - `son`: the path in `public/`, for the waveform;
  - `debut`: the offset in frames in the source media;
  - `off: true` for a disabled clip.
- **Two clips at the same time on one track**: make two tracks.
- **Everything visible on screen must appear in the timeline**, where it is visible.
- **The timeline is computed from the same data as the composition**, never by hand: they cannot diverge.

## The run's `.coulisses` file

It is created at **the start of the run**, in the run's folder, by Coulisses' command. The values go through a UTF-8 JSON file, never through non-ASCII text in the shell:

```json
{ "dossier": "C:\\Users\\owner\\Desktop\\Youtube\\AItelier\\long\\2026-10-06_recap-ia-semaine",
  "titre": "Récap IA de la semaine", "chaine": "L'AItelier", "format": "16:9",
  "projet": "<folder of the channel's Remotion project>", "composition": "AIT-2026-10-06-recap-ia-semaine",
  "props": { "run": "2026-10-06_recap-ia-semaine" }, "export": "07-renders" }
```

```
node "<CLI>" projet creer --depuis spec.json        → prints the path of the file "Récap IA de la semaine.coulisses"
node "<CLI>" projet verifier "<…>.coulisses"         → "PROJET CONFORME", or the list of the problems to fix
```

- **The optional fields**: `entree` (`src/index.ts` by default), `module` (`src/coulisses.ts`), `timeline` (`src/coulisses-timeline.ts`), `motif` (`\.mp4$`, to recognise the export in the `export` folder).
- **`projet verifier`**:
  - runs the timeline under Node;
  - reads the composition;
  - compiles the preview the way Coulisses does;
  - has Remotion render a frame, the check image, into `<run>\revue\images\`. **Look at it.**

  `--rapide` skips that render. `--images 1700,8000` renders the chosen frames instead of the middle one (useful when the middle falls inside a full-frame video).
- **The verdict is a machine marker**, the same in both languages: `PROJET CONFORME` or `PROJET NON CONFORME`. In English, a gloss follows it (`PROJET CONFORME (compliant): …`), and the detail lines start with `ok`, `!` or `FAIL` (`ÉCHEC` in French).
- **`<CLI>`** is Coulisses' command. It is `C:\Users\owner\AppData\Local\Programs\Coulisses\studio-cli.mjs`, and the exact path is repeated in each batch `.md`. A double-click on a `.coulisses` opens the run in Coulisses.
- **The user's notes** go into `<run>\revue\` (`notes.json`, `lots\`…). The agent's protocol is `AGENT.en.md` (`AGENT.md` in French), next to `studio-cli.mjs`: the commands take the path `"<run>\revue"` instead of "E03".

## Remotion rules so that the preview is exactly the export

- **Everything derives from the frame**: `useCurrentFrame()`, `useVideoConfig()`, `interpolate`, `spring`.
  - Never `Math.random()`: use `random(seed)` from `remotion`.
  - Never `Date.now()`.
  - Never a CSS animation nor a `setTimeout` to animate.
- **Existing GSAP**: create the timeline **paused**, then `tl.seek(frame / fps)` in a `useLayoutEffect` on every frame. Never let it play by itself.
- **No access to `window` or `document` when a file loads**, only in the components and their effects: Coulisses imports the modules under Node.
- **Videos**: `<OffthreadVideo>`, in H.264 MP4, or WebM VP9 for a video with transparency.
  - **QuickTime Animation (`qtrle`, the overlay `.mov` files) does not play in Chrome**. Convert it once: `ffmpeg -i overlay.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 overlay.webm`.
- **Sounds**: `<Audio>` with `volume` (a constant or a function of the frame). The voice, the music and the sound effects can stay pre-mixed files.
- **Composition id**: letters, digits and `-` only. Remotion refuses `_`: `short11_biosignature` becomes `UCHU-short11-biosignature`.
- **Fonts**: `@remotion/google-fonts`, or a local font loaded before the render (`@remotion/fonts`).
- **Versions**: `remotion` and every `@remotion/*` at **the same exact version**, without `^`. **`@remotion/player` must be installed**: it is Coulisses' preview. Upgrades are done with `npx remotion upgrade`, then a check.
- **Recommended official skills**: `npx skills add remotion-dev/skills -g` (`remotion-best-practices`, `remotion-upgrade`…).
- **Render**:
  - `npx remotion render src/index.ts <composition> "<run>\07-renders\master.mp4" --props=<file.json> --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe" --gl=angle`, then the channel's usual sound finish (loudnorm);
  - **on this PC, if `public\` holds a junction** (`mklink /J` to a run's media), that form fails (`EPERM symlink`): Remotion copies `public\` into its bundle and recreates the junctions as symbolic links, which are forbidden without developer mode. You then have to prepare the bundle yourself, with an empty `public` folder, then make `<bundle>\public` a junction to the project's `public\`, and render from that bundle (`npx remotion render <bundle> <composition> …`). That is what Coulisses does for its frames, and the `bundle.mjs` / `prepare-stills.cjs` scripts of the L'AItelier and Vidéo du monde projects. Before rebuilding the bundle, remove the junction with `cmd /c rmdir "<bundle>\public"`, never with a recursive delete;
  - **only on the user's order**, once the review is done in Coulisses;
  - the export must land in the `.coulisses` file's `export` folder. Coulisses loads it by itself, and offers "Compare before / after".

## The export script: what Coulisses runs when the user clicks "Export"

The channel's Remotion project provides **`scripts\coulisses-rendu.mjs`**. Coulisses runs it from the project's folder, when the user asks for it (the Batches tab, or Tools › Export in the menu bar), never by itself:

```
node scripts/coulisses-rendu.mjs --composition <id> --props "<props.json>" --dossier "<export folder of the .coulisses>" --titre "<title>"
```

The script:
- **prepares the bundle** without breaking the junctions of `public\` (see above), with `--browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe" --gl=angle`;
- **renders then finishes** the way the channel does: loudness, 4K, joining the pieces…;
- **chooses the name** of the final file by the channel's habits (`master.mp4`, `<Name>-1080p.mp4`, `shortNN_4k_final.mp4`…);
- **writes first to a `….tmp.mp4` file**, then renames it at the end: Coulisses never loads a file being written;
- **if it replaces a file that already exists** (the same name as the last export, which Coulisses may be showing): it first prints `COULISSES REMPLACE "<path>"`, then retries the rename for at least 60 s. Coulisses then lets go of the video (Windows refuses to replace an open file), and takes it back at the end of the export;
- **prints its progress** on the standard output, one line per step or per percent: `COULISSES PROGRES <0-100> <step>` (e.g. `COULISSES PROGRES 42 rendu`), and ends with **`COULISSES FIN "<path of the final file>"`**. These three markers are the same in every language;
- **exits with code 0** if it succeeded, otherwise with another code and the error on the standard error;
- **can be stopped at any time**: Coulisses then ends the process and its children. Only a `….tmp.mp4` is left, never a false final file.

The `.coulisses` must have an `export` folder, otherwise Coulisses does not offer the export.

**The export variants** (one button each in Coulisses, and one entry each under Tools › Export): `node scripts/coulisses-rendu.mjs --options` prints a JSON array on the standard output, then exits at once, without rendering anything:

```json
[{ "id": "test", "label": "Test render (1080p)" }, { "id": "final", "label": "Export in 4K" }]
```

Coulisses then runs the script again with `--qualite <id>` for the chosen variant. The first element is the main button. The labels are shown as they are: write them in the user's language. Without `--options` (the script does not know it, or returns anything other than an array), Coulisses shows a single button, "Export the video" ("Exporter la vidéo" in French), without `--qualite`.

## A 3D shot rendered elsewhere and edited in as a video ("utilise")

When a 3D scene is made in another Remotion project (Uchu-chan's theatre, for example), then rendered to MP4 and edited into the run as a video, the run only sees a flat picture. To rework it in 3D:

1. **The scene's project** has its own `src/coulisses.ts` (its shots' compositions) and, if possible, `src/coulisses-timeline.ts`. If it uses React Three Fiber, Coulisses gives it the Theatre's 3D staging by itself: pick an object, move it, turn it, and the free camera.
2. **Each shot has its own `.coulisses`**, in its own folder (one `revue` folder per shot), with in addition:

```json
"utilise": [{ "coulisses": "C:\\…\\shorts\\short12\\short12.coulisses", "fichier": "public/short12/mg/chibi1.mp4" }]
```

`coulisses` is the `.coulisses` of the run that shows this shot. `fichier` is the shot's file in that run, as its timeline gives it, relative to the run's Remotion project.

3. **In the run's studio**, on that clip, an "Open the 3D scene" button opens the shot in its own studio. The shot must be imported in the Coulisses home screen.
4. **The shot's batch** tells the agent where its render goes: render the composition again and replace that file of the run, with the same name, format and length.

`studio-cli.mjs projet creer --depuis spec.json` accepts `utilise` in the JSON file.

## How to migrate without redoing everything at once

1. **First the edit**. The Resolve edit becomes a Remotion composition: one `<Sequence>` per clip, one track per layer.
   - **The pieces already rendered as MP4** (scenes, MetaHuman presenter) go in as they are, as `<OffthreadVideo>`. Coulisses can then review the whole edit straight away.
   - **The Resolve effects** are redone in CSS: blur and darkening with `filter: blur() brightness()` on a copy of the layer, the 9:16 frame through the layout.
2. **Then, scene by scene**, the HTML or HyperFrames scenes become React components. They are the ones that gain the most: fixed in the code, they are reviewed again at once in Coulisses, without a render.
3. **The timeline** keeps the tracks the user knows (chapters, shots, presenter, overlays, voice, music, sound effects), computed from the same data as the composition.

## Until Remotion: the "video" `.coulisses`

Coulisses can also open a run that is not in Remotion. **No plugin uses it**: on 07/10/2026 the user chose to move L'AItelier, Vidéo du monde and 宇宙ちゃん to Remotion (rewritten in React), the `.coulisses` being created when the agent starts coding the edit. This variant stays available for a one-off case. Coulisses then opens the run **on its video**, as soon as a render arrives, with the timeline the pipeline writes. The notes already go into `<run>\revue\`.

```
node "<CLI>" projet creer --moteur video --dossier "<run>" --nom <slug> --titre "<title or slug>" --chaine "<channel>" --format 16:9
     --export "07-publish|06-video/renders" --motif "-(1080p|2160p)\.mp4$" --plan 06-video/coulisses-timeline.json
```

- **`--export`**: the folder or folders where the run's renders land, separated by `|`, relative to the run (`..\<neighbour folder>` is allowed). **`--motif`**: the expression that recognises a render to review, not the drafts nor the pieces. `--profondeur N` also looks in N levels of subfolders (0 by default). Coulisses takes the newest, **never a file written less than 20 s ago** (a render in progress).
- **`--plan`** (optional): the timeline. It may not exist yet: it appears when the pipeline writes it. Two formats:
  - Coulisses' format, in frames: `{ "fps": 30, "durationInFrames": N, "pistes": [{ "id", "nom", "type": "video|audio|band", "clips": [{ "de", "a", "label", "fichier" }] }] }`;
  - L'AItelier's montage plan (`08-montage\plan-montage.json`).
- **`--nom`** sets the file's name (`<slug>.coulisses`). Running `projet creer` again with the same `--nom` **updates** the file (the title known later, for example): the creation date, the export and the plan already written are kept.
- **The day of the move to Remotion**: `projet creer --nom <slug> --projet … --composition …` on the same run turns that file into a Remotion run, with the same notes. The reverse is refused.
- **Never blocking**: if Coulisses is missing or too old, the pipeline prints a notice and goes on.

## Per channel

**Decision of 07/10/2026**: L'AItelier (Short and long), Vidéo du monde and 宇宙ちゃん (Short and long) move to Remotion, rewriting their edit in React. The `.coulisses` is created **when the agent starts coding the edit** of the run. The music channels are not concerned.

The move to Remotion, channel by channel:

- **L'AItelier** (`C:\Users\owner\Desktop\Claude Plugin\laitelier-studio`, production copy):
  - `08-montage\plan-montage.json` already holds the whole edit (V1, V2, V3, A1-A3, chapters, frame ranges): it is the composition's data.
  - The overlays of `10-overlays\*.mov` are `qtrle`: they must be converted.
  - the `.coulisses` is created at the start of the coded edit (`projet creer` with `--projet` and `--composition`). **The user wants to see the change before it is made.**
  - The rule "the human exports from Resolve" becomes "Remotion render on the user's order".
- **Vidéo du monde** (`C:\Users\owner\.agents\plugins\plugins\video-du-monde-studio`) and **Uchu-chan** (`C:\Users\owner\.claude\skills\uchuchan-short`):
  - HyperFrames compositions rendered by the `hyperframes` CLI (no Resolve), to be rewritten as React components;
  - the `.coulisses` is created at the start of the coded edit (`projet creer` with `--projet` and `--composition`);
  - **show the change to the user first**.

## The example that works

A small complete project that follows this contract, generated by `node tests\coulisses-fixture.mjs` in the Coulisses workshop. It passes `projet verifier` and opens in Coulisses before any export:
- **the Remotion project**: `C:\Users\owner\Documents\ChatGPT\Dev\remotion-studio\.cache\coulisses-test\remotion-essai\`, with `src\coulisses.ts`, `src\coulisses-timeline.ts`, `src\Root.tsx`, `src\Video.tsx` (with `data-coulisses`) and `src\runs\essai.ts`;
- **the run**: `C:\Users\owner\Documents\ChatGPT\Dev\remotion-studio\.cache\coulisses-test\runs\2026-10-07_essai\Essai de Coulisses.coulisses`.

## What not to do

- **Write `revue\notes.json`**: it belongs to the Coulisses page. The agent writes only through `studio-cli.mjs` (`replies.json`).
- **Write the timeline by hand**, or let it diverge from the composition.
- **Leave a visible element out of the timeline**, or a media outside `public/`.
- **Render without the user's order.**
- **Update Remotion or the skills without their consent**: Coulisses checks those updates with every batch, and the agent offers them as a multiple-choice question.
