# Fiche : passer un pipeline vidéo sous Remotion, compatible Coulisses

**À donner à la session (Claude Code, Codex…) qui tient le plugin ou le skill d'une chaîne** : L'AItelier, Vidéo du monde (The Unfinished Atlas), Uchu-chan (宇宙ちゃん). Brambleshire Theatre est déjà en Remotion : Coulisses le connaît, rien à faire ici pour lui.

## Le but, en deux phrases

**Coulisses** est le studio de revue de l'utilisateur, anciennement « Brambleshire Studio ». Il doit pouvoir **relire un run avant tout export** :
- il ouvre le fichier `.coulisses` du run ;
- il compile le projet Remotion et joue la composition en direct ;
- sa timeline sait ce qu'est chaque morceau (« ce motion graphic, de telle image à telle image ») ;
- l'utilisateur annote, et ses notes partent à l'agent en lots.

Plus besoin d'attendre un export d'une heure et demie pour relire.

Il faut donc que **le montage de la vidéo soit une composition Remotion**, plus un montage Resolve ni une composition HyperFrames, et que le projet expose deux petits modules décrits plus bas. La compatibilité HyperFrames viendra plus tard dans Coulisses : pour l'instant, c'est Remotion.

## Ce qu'il faut livrer (liste de contrôle)

1. **Un projet Remotion par chaîne**, pas par run. C'est un dossier avec `package.json`, `node_modules`, `src/index.ts` (`registerRoot`) et `public/`.
2. **Une composition par run**, avec un id stable, par exemple `AIT-2026-10-06-recap-ia-semaine`. Les données du run (plans, textes, minutage) sont **dans le projet**, en `src/runs/<run>.ts` ou en JSON importé par le code. L'aperçu de Coulisses se recharge à chaque enregistrement.
3. **`src/coulisses.ts`** : la liste des compositions. C'est la source unique : le `Root` déclare ses `<Composition>` à partir d'elle.
4. **`src/coulisses-timeline.ts`** : la timeline du run, en images, pour Node. Ce sont des données seulement : aucun composant importé.
5. **`data-coulisses="<nom lisible>"`** sur les éléments visibles qui comptent (titres, cartes, schémas, sous-parties d'un motion graphic). Une note épinglée dessus les nomme d'elle-même.
6. **Les médias par `staticFile()`**, depuis `public/<run>/`. Ce dossier peut être une jonction vers les médias du run : `mklink /J`, sans copier.
7. **Le fichier `.coulisses`, créé au début du run**, par la commande `projet creer`, voir plus bas.
8. **`projet verifier` doit dire « PROJET CONFORME »**, et l'image de vérification qu'il produit doit être regardée.

## Les deux modules du contrat

### `src/coulisses.ts` (le navigateur : l'aperçu en direct)

```ts
import { MonRun } from './MonRun';
import { RUN, totalFrames } from './runs/2026-10-06_recap-ia-semaine';
export const compositions = [
  { id: 'AIT-2026-10-06-recap-ia-semaine', component: MonRun, fps: 30, width: 1920, height: 1080,
    durationInFrames: (props) => totalFrames(), defaultProps: { run: '2026-10-06_recap-ia-semaine' } },
];
```

- `durationInFrames` : un nombre, ou une fonction des props. Un Short est en `width: 1080, height: 1920`.
- `Root.tsx` : `compositions.map((c) => <Composition key={c.id} id={c.id} component={c.component} fps={c.fps} width={c.width} height={c.height} durationInFrames={…} defaultProps={c.defaultProps} />)`. Si le Root et ce module divergent, `projet verifier` le signale.

### `src/coulisses-timeline.ts` (Node : la timeline)

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

- **Une piste** : `id`, `nom` lisible, `type` = `video` (clips visibles), `audio` (forme d'onde) ou `band` (chapitres ou sections).
- **Un clip** :
  - `de` et `a`, en images de la composition, avec `a` exclu ;
  - `label` lisible ;
  - `fichier` : **le fichier à corriger** pour ce morceau (composant, média) ;
  - `ref` : l'id du segment ou de la scène ;
  - `son` : le chemin dans `public/`, pour la forme d'onde ;
  - `debut` : le décalage en images dans le média source ;
  - `off: true` pour un clip désactivé.
- **Deux clips simultanés sur la même piste** : faire deux pistes.
- **Tout ce qui est visible à l'écran doit apparaître dans la timeline**, là où il est visible.
- **La timeline se calcule à partir des mêmes données que la composition**, jamais à la main : elles ne peuvent pas diverger.

## Le fichier `.coulisses` du run

Il se crée au **début du run**, dans le dossier du run, par la commande de Coulisses. Les valeurs passent par un fichier JSON UTF-8, jamais par du texte français dans le shell :

```json
{ "dossier": "C:\\Users\\owner\\Desktop\\Youtube\\AItelier\\long\\2026-10-06_recap-ia-semaine",
  "titre": "Récap IA de la semaine", "chaine": "L'AItelier", "format": "16:9",
  "projet": "<dossier du projet Remotion de la chaîne>", "composition": "AIT-2026-10-06-recap-ia-semaine",
  "props": { "run": "2026-10-06_recap-ia-semaine" }, "export": "07-renders" }
```

```
node "<CLI>" projet creer --depuis spec.json        → imprime le chemin du fichier « Récap IA de la semaine.coulisses »
node "<CLI>" projet verifier "<…>.coulisses"         → « PROJET CONFORME », ou la liste des problèmes à corriger
```

- **Les champs facultatifs** : `entree` (`src/index.ts` par défaut), `module` (`src/coulisses.ts`), `timeline` (`src/coulisses-timeline.ts`), `motif` (`\.mp4$`, pour reconnaître l'export dans le dossier `export`).
- **`projet verifier`** :
  - lance la timeline sous Node ;
  - lit la composition ;
  - compile l'aperçu comme Coulisses ;
  - fait rendre une image par Remotion, l'image de vérification, dans `<run>\revue\images\`. **La regarder.**

  `--rapide` saute ce rendu. `--images 1700,8000` rend les images choisies au lieu de celle du milieu (utile quand le milieu tombe dans une vidéo plein cadre).
- **`<CLI>`** est la commande de Coulisses. C'est `C:\Users\owner\AppData\Local\Programs\Coulisses\studio-cli.mjs`, et le chemin exact est rappelé dans chaque lot `.md`. Un double-clic sur un `.coulisses` ouvre le run dans Coulisses.
- **Les notes de l'utilisateur** vont dans `<run>\revue\` (`notes.json`, `lots\`…). Le protocole de l'agent est `AGENT.md`, à côté de `studio-cli.mjs` : les commandes prennent le chemin `"<run>\revue"` à la place de « E03 ».

## Les règles Remotion pour que l'aperçu soit exactement l'export

- **Tout se déduit de l'image** : `useCurrentFrame()`, `useVideoConfig()`, `interpolate`, `spring`.
  - Jamais `Math.random()` : utiliser `random(seed)` de `remotion`.
  - Jamais `Date.now()`.
  - Jamais d'animation CSS ni de `setTimeout` pour animer.
- **GSAP existant** : créer la timeline **en pause**, puis `tl.seek(frame / fps)` dans un `useLayoutEffect` à chaque image. Ne jamais la laisser jouer seule.
- **Aucun accès à `window` ou `document` au chargement d'un fichier**, seulement dans les composants et leurs effets : Coulisses importe les modules sous Node.
- **Vidéos** : `<OffthreadVideo>`, en H.264 MP4, ou en WebM VP9 pour une vidéo avec transparence.
  - **Le QuickTime Animation (`qtrle`, les `.mov` de calques) ne se lit pas dans Chrome**. Le convertir une fois : `ffmpeg -i calque.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 calque.webm`.
- **Sons** : `<Audio>` avec `volume` (constante ou fonction de l'image). La voix, la musique et les bruitages peuvent rester des fichiers pré-mixés.
- **Identifiant de composition** : lettres, chiffres et `-` seulement. Remotion refuse le `_` : `short11_biosignature` devient `UCHU-short11-biosignature`.
- **Polices** : `@remotion/google-fonts`, ou une police locale chargée avant le rendu (`@remotion/fonts`).
- **Versions** : `remotion` et tous les `@remotion/*` à **la même version exacte**, sans `^`. **`@remotion/player` doit être installé**, c'est l'aperçu de Coulisses. Les montées de version se font avec `npx remotion upgrade`, puis une vérification.
- **Skills officiels conseillés** : `npx skills add remotion-dev/skills -g` (`remotion-best-practices`, `remotion-upgrade`…).
- **Rendu** :
  - `npx remotion render src/index.ts <composition> "<run>\07-renders\master.mp4" --props=<fichier.json> --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe" --gl=angle`, puis la finition sonore habituelle de la chaîne (loudnorm) ;
  - **sur ce PC, si `public\` contient une jonction** (`mklink /J` vers les médias d'un run), cette forme échoue (`EPERM symlink`) : Remotion recopie `public\` dans son paquet et recrée les jonctions en liens symboliques, interdits sans le mode développeur. Il faut alors préparer le paquet soi-même, avec un dossier `public` vide, puis faire de `<paquet>\public` une jonction vers le `public\` du projet, et rendre depuis ce paquet (`npx remotion render <paquet> <composition> …`). C'est ce que font Coulisses pour ses images et les scripts `bundle.mjs` / `prepare-stills.cjs` des projets de L'AItelier et de Vidéo du monde. Avant de refaire le paquet, retirer la jonction par `cmd /c rmdir "<paquet>\public"`, jamais par une suppression récursive ;
  - **seulement sur ordre de l'utilisateur**, une fois la revue faite dans Coulisses ;
  - l'export doit arriver dans le dossier `export` du `.coulisses`. Coulisses le charge seul, et propose « Comparer avant / après ».

## Le script d'export : ce que Coulisses lance quand l'utilisateur clique « Exporter »

Le projet Remotion de la chaîne fournit **`scripts\coulisses-rendu.mjs`**. Coulisses le lance depuis le dossier du projet, quand l'utilisateur le demande, jamais seul :

```
node scripts/coulisses-rendu.mjs --composition <id> --props "<props.json>" --dossier "<dossier export du .coulisses>" --titre "<titre>"
```

Le script :
- **prépare le paquet** sans casser les jonctions de `public\` (voir plus haut), avec `--browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe" --gl=angle` ;
- **rend puis finit** comme la chaîne le fait : volume, 4K, assemblage des morceaux… ;
- **choisit le nom** du fichier final selon les habitudes de la chaîne (`master.mp4`, `<Nom>-1080p.mp4`, `shortNN_4k_final.mp4`…) ;
- **écrit d'abord dans un fichier `….tmp.mp4`**, puis le renomme à la fin : Coulisses ne charge jamais un fichier en cours d'écriture ;
- **s'il remplace un fichier qui existe déjà** (même nom que le dernier export, que Coulisses est peut-être en train de montrer) : il affiche d'abord `COULISSES REMPLACE "<chemin>"`, puis réessaie le renommage pendant au moins 60 s. Coulisses lâche alors la vidéo (Windows refuse de remplacer un fichier ouvert), et la reprend à la fin de l'export ;
- **affiche son avancement** sur la sortie standard, une ligne par étape ou par pour cent : `COULISSES PROGRES <0-100> <étape>` (ex. `COULISSES PROGRES 42 rendu`), et finit par **`COULISSES FIN "<chemin du fichier final>"`** ;
- **sort avec le code 0** s'il a réussi, sinon avec un autre code et l'erreur sur la sortie d'erreur ;
- **peut être arrêté à tout moment** : Coulisses arrête alors le processus et ses enfants. Il ne reste qu'un `….tmp.mp4`, jamais un faux fichier final.

Le `.coulisses` doit avoir un dossier `export`, sinon Coulisses ne propose pas l'export.

**Les variantes d'export** (un bouton chacune dans Coulisses) : `node scripts/coulisses-rendu.mjs --options` affiche sur la sortie standard un tableau JSON, puis sort aussitôt, sans rien rendre :

```json
[{ "id": "test", "label": "Rendu test (1080p)" }, { "id": "final", "label": "Exporter en 4K" }]
```

Coulisses relance alors le script avec `--qualite <id>` pour la variante choisie. Le premier élément est le bouton principal. Sans `--options` (le script ne le connaît pas, ou renvoie autre chose qu'un tableau), Coulisses montre un seul bouton, « Exporter la vidéo », sans `--qualite`.

## Un plan 3D rendu à part et monté en vidéo (« utilise »)

Quand une scène 3D est faite dans un autre projet Remotion (le théâtre d'Uchu-chan, par exemple), puis rendue en MP4 et montée dans le run comme une vidéo, le run ne voit qu'une image plate. Pour la retoucher en 3D :

1. **Le projet de la scène** a lui aussi `src/coulisses.ts` (ses compositions de plans) et, si possible, `src/coulisses-timeline.ts`. S'il utilise React Three Fiber, Coulisses lui donne d'office la mise en scène 3D du Théâtre : choisir un objet, le déplacer, le tourner, et la caméra libre.
2. **Chaque plan a son `.coulisses`**, dans son propre dossier (un dossier `revue` par plan), avec en plus :

```json
"utilise": [{ "coulisses": "C:\\…\\shorts\\short12\\short12.coulisses", "fichier": "public/short12/mg/chibi1.mp4" }]
```

`coulisses` est le `.coulisses` du run qui montre ce plan. `fichier` est le fichier du plan dans ce run, tel que sa timeline le donne, relatif au projet Remotion du run.

3. **Dans le studio du run**, sur ce clip, un bouton « Ouvrir la scène 3D » ouvre le plan dans son propre studio. Le plan doit être importé dans l'accueil de Coulisses.
4. **Le lot du plan** dit à l'agent où va son rendu : refaire le rendu de la composition et remplacer ce fichier du run, même nom, même format et même durée.

`studio-cli.mjs projet creer --depuis spec.json` accepte `utilise` dans le fichier JSON.

## Comment migrer sans tout refaire d'un coup

1. **D'abord le montage**. Le montage Resolve devient une composition Remotion : une `<Sequence>` par clip, une piste par calque.
   - **Les morceaux déjà rendus en MP4** (scènes, présentateur MetaHuman) y entrent tels quels, en `<OffthreadVideo>`. Coulisses peut alors relire le montage complet tout de suite.
   - **Les effets de Resolve** se refont en CSS : flou et assombrissement par `filter: blur() brightness()` sur une copie du calque, cadre 9:16 par la mise en page.
2. **Ensuite, scène par scène**, les scènes HTML ou HyperFrames deviennent des composants React. Ce sont elles qui gagnent le plus : corrigées dans le code, elles se revoient aussitôt dans Coulisses, sans rendu.
3. **La timeline** reprend les pistes que l'utilisateur connaît (chapitres, plans, présentateur, calques, voix, musique, bruitages), calculées depuis les mêmes données que la composition.

## En attendant Remotion : le `.coulisses` « vidéo »

Coulisses sait aussi ouvrir un run qui n'est pas en Remotion. **Aucun plugin ne s'en sert** : l'utilisateur a choisi le 07/10/2026 de faire passer L'AItelier, Vidéo du monde et 宇宙ちゃん sous Remotion (réécriture en React), le `.coulisses` se créant au moment où l'agent commence à coder le montage. Cette variante reste disponible pour un cas ponctuel. Coulisses ouvre alors le run **sur sa vidéo**, dès qu'un rendu arrive, avec la timeline que le pipeline écrit. Les notes vont déjà dans `<run>\revue\`.

```
node "<CLI>" projet creer --moteur video --dossier "<run>" --nom <slug> --titre "<titre ou slug>" --chaine "<chaîne>" --format 16:9
     --export "07-publish|06-video/renders" --motif "-(1080p|2160p)\.mp4$" --plan 06-video/coulisses-timeline.json
```

- **`--export`** : le ou les dossiers où arrivent les rendus du run, séparés par `|`, relatifs au run (`..\<dossier voisin>` est permis). **`--motif`** : l'expression qui reconnaît un rendu à relire, pas les brouillons ni les morceaux. `--profondeur N` cherche aussi dans N niveaux de sous-dossiers (0 par défaut). Coulisses prend le plus récent, **jamais un fichier écrit il y a moins de 20 s** (un rendu en cours).
- **`--plan`** (facultatif) : la timeline. Elle peut ne pas exister encore : elle apparaît quand le pipeline l'écrit. Deux formats :
  - le format de Coulisses, en images : `{ "fps": 30, "durationInFrames": N, "pistes": [{ "id", "nom", "type": "video|audio|band", "clips": [{ "de", "a", "label", "fichier" }] }] }` ;
  - le plan de montage de L'AItelier (`08-montage\plan-montage.json`).
- **`--nom`** fixe le nom du fichier (`<slug>.coulisses`). Relancer `projet creer` avec le même `--nom` **met à jour** le fichier (le titre connu plus tard, par exemple) : la date de création, l'export et le plan déjà écrits sont gardés.
- **Le jour du passage à Remotion** : `projet creer --nom <slug> --projet … --composition …` sur le même run transforme ce fichier en run Remotion, avec les mêmes notes. L'inverse est refusé.
- **Jamais bloquant** : si Coulisses est absent ou trop ancien, le pipeline affiche un avis et continue.

## Par chaîne

**Décision du 07/10/2026** : L'AItelier (Short et long), Vidéo du monde et 宇宙ちゃん (Short et long) passent sous Remotion, en réécrivant leur montage en React. Le `.coulisses` se crée **quand l'agent commence à coder le montage** du run. Les chaînes musicales ne sont pas concernées.

Le passage à Remotion, chaîne par chaîne :

- **L'AItelier** (`C:\Users\owner\Desktop\Claude Plugin\laitelier-studio`, copie de production) :
  - `08-montage\plan-montage.json` contient déjà tout le montage (V1, V2, V3, A1-A3, chapitres, plages du cadre) : c'est la donnée de la composition.
  - Les calques de `10-overlays\*.mov` sont en `qtrle` : il faut les convertir.
  - le `.coulisses` se crée au début du montage codé (`projet creer` avec `--projet` et `--composition`). **L'utilisateur veut voir la modification avant qu'elle soit faite.**
  - La règle « l'humain exporte depuis Resolve » devient « rendu Remotion sur ordre de l'utilisateur ».
- **Vidéo du monde** (`C:\Users\owner\.agents\plugins\plugins\video-du-monde-studio`) et **Uchu-chan** (`C:\Users\owner\.claude\skills\uchuchan-short`) :
  - compositions HyperFrames rendues par la CLI `hyperframes` (pas de Resolve), à réécrire en composants React ;
  - le `.coulisses` se crée au début du montage codé (`projet creer` avec `--projet` et `--composition`) ;
  - **montrer d'abord la modification à l'utilisateur**.

## L'exemple qui marche

Un petit projet complet qui suit ce contrat, généré par `node tests\coulisses-fixture.mjs` dans l'atelier de Coulisses. Il passe `projet verifier` et s'ouvre dans Coulisses avant tout export :
- **le projet Remotion** : `C:\Users\owner\Documents\ChatGPT\Dev\remotion-studio\.cache\coulisses-test\remotion-essai\`, avec `src\coulisses.ts`, `src\coulisses-timeline.ts`, `src\Root.tsx`, `src\Video.tsx` (avec `data-coulisses`) et `src\runs\essai.ts` ;
- **le run** : `C:\Users\owner\Documents\ChatGPT\Dev\remotion-studio\.cache\coulisses-test\runs\2026-10-07_essai\Essai de Coulisses.coulisses`.

## Ce qu'il ne faut pas faire

- **Écrire `revue\notes.json`** : il appartient à la page de Coulisses. L'agent écrit seulement par `studio-cli.mjs` (`replies.json`).
- **Écrire la timeline à la main**, ou la laisser diverger de la composition.
- **Laisser un élément visible absent de la timeline**, ou un média hors de `public/`.
- **Rendre sans ordre de l'utilisateur.**
- **Mettre à jour Remotion ou les skills sans son accord** : Coulisses vérifie ces mises à jour à chaque envoi, et l'agent les propose en QCM.
