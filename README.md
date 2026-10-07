# Coulisses (anciennement « Brambleshire Studio »)

Coulisses est le studio de revue de toutes les chaînes : relire et annoter une vidéo, **avant ou après son export**, et envoyer les notes à l'agent. Il est né de l'outil de revue de Brambleshire (`06_Remotion\review\`), enrichi de ce qui est bien fait dans HyperFrames Studio. Il fonctionne sous Windows et s'appuie sur Remotion. Tout ce que faisait l'outil actuel est conservé ; seul changement de comportement, un clic sur l'image ne lance plus la lecture : on joue avec **Espace** ou le bouton Lecture. Les corrections sont faites par **ton agent** (aujourd'hui une session Claude Code, demain Codex/GPT si tu veux), celui qui a fabriqué la vidéo et qui en a tout le contexte. Le studio dit « l'agent », jamais « Claude ».

## L'application (`.exe`)

- **`Coulisses.exe`** est l'application, installée dans `C:\Users\owner\AppData\Local\Programs\Coulisses\`. Raccourcis « Coulisses » sur le Bureau et dans le menu Démarrer. **Un double-clic sur un fichier `.coulisses`** l'ouvre sur ce projet (association de fichier pour ton compte, sans droits administrateur).
  - Pas de console noire : elle démarre l'accueil en arrière-plan (`hub-server.mjs`, port 4170) et l'ouvre dans sa propre fenêtre, sans onglets ni barre d'adresse (Chrome en mode application, Edge à défaut).
  - L'accueil liste les épisodes : miniature, durée, date du rendu, notes à corriger, lots. **Ouvrir le studio** lance le studio de l'épisode dans la même fenêtre, et le logo « B » ramène à l'accueil.
  - `Coulisses.exe E03` (c'est ce que font `Revoir et annoter.cmd` et `The Secret Garden.coulisses`) ouvre directement l'E03.
  - `Coulisses.exe "<dossier, vidéo ou .coulisses>"`, ce qui se passe quand on glisse un dossier sur l'icône ou qu'on double-clique un `.coulisses`, importe ce projet et l'ouvre (voir « Projets importés »).
  - Fermer la fenêtre arrête tout : l'accueil, le studio, ses copies et sa capture d'images.
  - Pendant un re-rendu, `finish-render.sh` met le studio en pause, puis le relance. La fenêtre reste ouverte et recharge seule la nouvelle vidéo.
- **`Coulisses Setup.exe`** (dans cet atelier) installe ou met à jour l'application, crée les raccourcis (et retire les anciens « Brambleshire Studio ») et enregistre l'ouverture des fichiers `.coulisses`. La première fois, il a déménagé Coulisses hors du pipeline Brambleshire : l'ancien dossier `06_Remotion\review\studio\` ne garde qu'un `studio-cli.mjs` de renvoi.
  - Si le studio est ouvert, il propose de le fermer.
  - Il refuse d'écraser des fichiers modifiés directement dans le pipeline, sauf si tu confirmes.
  - `/silent` fait la même chose sans fenêtre (journal : `%LOCALAPPDATA%\Coulisses\setup.log`).
- **Compilation** : `pwsh -File app\build.ps1` utilise le compilateur C# fourni avec Windows (`csc.exe`, .NET Framework 4.8), sans rien installer. Les sources sont dans `app\` : `Launcher.cs`, `Setup.cs`, l'icône (`make-icon.ps1`) et le manifeste.
- **Test de l'application** : `node tests\app.mjs`. Il ouvre la vraie fenêtre, rendue invisible, sur le bac à sable.

## Deux copies

- **L'application installée** vit dans `C:\Users\owner\AppData\Local\Programs\Coulisses\` (port 4173 pour le studio, 4170 pour l'accueil : les mêmes que l'ancien outil).
  - Le `Revoir et annoter.cmd` de chaque épisode l'ouvre.
  - `scripts/new-episode.mjs` crée ce lanceur pour les nouveaux épisodes.
  - `scripts/finish-render.sh` refuse de remplacer la vidéo tant qu'un studio la lit (ports 4173 à 4176, les bacs à sable exceptés).
  - L'étape 7 du skill `brambleshire-theatre` décrit le déroulé.
  - L'ancien outil (`review-server.mjs`) reste à côté, en secours.
- **Cet atelier** est l'endroit où l'on développe (port 4174), avec le bac à sable (`Studio de revue - bac a sable E03.cmd`, une copie des notes de l'E03) et les tests.
- **Pour mettre à jour le pipeline** : `node install.mjs` (`--dry` pour voir ce qui changerait). Le script refuse d'écraser un fichier modifié directement dans le pipeline depuis la dernière installation (`installed.json`). Un studio déjà lancé doit être relancé.
- **Le cache** : celui de Coulisses installé vit hors de tout projet, dans `%LOCALAPPDATA%\Coulisses\`. Il contient une jonction vers `06_Remotion\public` : on le supprime par l'Explorateur ou `rmdir /s /q`, jamais par `Remove-Item -Recurse`.

## Design

- **Style « glass », sombre et coloré** : fond bleu nuit avec des halos de couleur (violet, bleu, menthe, rose), panneaux flottants en verre dépoli, grands arrondis, onglets et boutons en pilules.
- **Dégradés** : citron vert → menthe pour l'action principale (Envoyer à l'agent), violet et ciel pour les outils actifs.
- **Polices** : Outfit pour les titres et les chiffres, Inter pour le texte (Google Fonts, avec repli sur Segoe UI hors ligne).
- **Timeline** : une couleur vive par personnage, tête de lecture blanche lumineuse.
- **Icônes** : au trait, dessins d'après [Lucide](https://lucide.dev) (licence ISC), aucun émoji. Les actions rares d'une carte sont rangées dans le menu « … ».
- **Étiquettes au bord** : près d'un bord de l'image, l'étiquette de survol et le bouton « Demander une modif » passent de l'autre côté de la souris, au lieu de sortir du cadre.

## Timeline : raccourcis façon DaVinci Resolve

| Geste | Effet |
|---|---|
| molette | pistes vers le haut / le bas |
| Ctrl + molette | défiler dans le temps |
| Alt + molette | zoom horizontal |
| Maj + molette | hauteur des pistes |

## Visée au pixel près

- **Au survol** : avec l'outil Sélection, une étiquette nomme l'objet sous le curseur avant le clic, par exemple « ladder · décor » ou « Penelope · personnage ».
- **Transparence** : le rayon lit la transparence de la texture au pixel touché, comme le fait le rendu. Il traverse donc les zones transparentes autour d'un personnage ou entre deux barreaux.
- **Éléments ignorés** : les particules, les rayons de lumière et les halos ne sont jamais visés.

## Mise en page

Les bords entre les panneaux se tirent à la souris, et les tailles sont mémorisées.

| Zone | Contenu |
|---|---|
| **À gauche** | Les outils : Sélection (V), Dessin (D), Commentaire (C), Note (N), Plage (R), MP4 ⇄ code (P), Mise en scène (M). |
| **Au centre** | L'image, ajustée à la place disponible : le MP4 rendu ou l'aperçu vivant du code. |
| **À droite** | Des onglets. **Modifs** : les notes en attente d'envoi, puis « Envoyer à l'agent ». **Notes** : les notes déjà envoyées et les anciennes. **Envois** : les lots, leur état, et « Annuler cette correction ». **Scène** : la mise en scène (objet choisi, décalage, portée, caméra libre). **Inspecteur** : à l'image affichée, la scène, les répliques, la caméra, la lumière, la musique, les bruitages, les émotes et qui marche, puis le détail de la note choisie avec l'objet 3D visé. |
| **En bas** | La timeline multipiste. Pistes : Décors (avec le rideau fermé), Caméra (images clés), Lumière, une piste par personnage (répliques avec forme d'onde, marches, émotes), Musique, Ambiance, Bruitages, Mix (son du MP4), et la bande Notes. Un double-clic sur une réplique crée une note sur toute la réplique. |

## Ce qui est nouveau

| Fonction | Comment |
|---|---|
| **Outils sur l'image** | **V** Sélection : pointer un endroit, puis **A** « Demander une modif ». **D** Dessin : plusieurs traits forment un seul dessin, **Entrée** pour l'ajouter. **C** Commentaire épinglé à un endroit et à une image. |
| **Objet 3D visé** | Sous le geste, un lancer de rayon dans la scène Three.js de l'aperçu nomme l'objet touché, par exemple « Hazel · personnage » ou « flower arch · décor », avec son chemin complet dans l'Inspecteur (`Stage › Actor[key="hazel"]`). Aucun changement dans le code Remotion. |
| **Modifs en attente** | Chaque nouvelle note entre dans la file, 10 au plus, modifiable ou supprimable. **Envoyer à l'agent** envoie toute la file en un **lot**. |
| **Lien avec l'agent** | L'envoi affiche une ligne à coller dans la session de ton agent. Autre possibilité, le bouton **« Connecter à l'agent »** en haut : la ligne de connexion se colle une fois, puis chaque envoi réveille l'agent automatiquement. Une fois connecté, le bouton dit « Agent connecté · Claude Code » (ou Codex…). |
| **Aperçu vivant** | **P**, ou « MP4 rendu / Code actuel » : le Remotion Player montre le code actuel au même instant, sans re-rendu. Il se recompile à chaque enregistrement, en environ 0,15 s, et se recharge sur la même image. |
| **Les yeux de l'agent** | `studio-cli.mjs frame` / `sheet` donnent une image ou une bande avant/après, prise dans le MP4 ou dans le code (`renderStill` / `renderFrames`, Chrome `--gl=angle`). |
| **Annuler une correction** | Panneau « Envois » : **Annuler cette correction** remet les fichiers du lot dans leur état d'avant (instantanés de `revue\runs\NNN\`). L'annulation est refusée si un fichier a changé depuis. **Rétablir** refait la correction. |

## Mise en scène : déplacer les objets toi-même

- **M**, ou le bouton « Mise en scène » du rail, passe dans l'aperçu du code et ouvre l'onglet **Scène**.
- **Choisir un objet** : un clic sur un personnage, un accessoire ou un élément de décor l'encadre et affiche ses poignées. La visée est la même qu'au survol : elle traverse la transparence et ignore les particules.
- **Le bouger** :
  - tirer les poignées ;
  - **W** déplacer, **E** tourner, **R** échelle ;
  - les flèches et **Pg↑** / **Pg↓** poussent l'objet de 0,05 (**Maj** : 0,25, **Alt** : 0,01) ;
  - ou saisir les valeurs dans l'onglet Scène.
- **Caméra libre** : glisser pour tourner autour, clic droit pour se déplacer, molette pour avancer. « Revenir à la caméra du plan » la remet en place. Elle ne change jamais le rendu.
- **Portée** : la scène en cours, « à partir d'ici jusqu'à la fin de la scène », toute la vidéo, ou une plage d'images.
- **Ajouter à la file** crée une modif qui contient l'objet, le décalage exact, sa portée et une image « après », prise par la caméra du plan. Tant qu'elle attend dans la file, l'aperçu garde l'objet déplacé.
- **Rien n'est écrit dans le projet** : ni le moteur ni les images clés ne changent. L'agent reçoit le décalage dans le lot et l'écrit dans la config du décor ou dans la timeline, sans toucher au minutage (`AGENT.md`, « Une modif de mise en scène »).
- Pendant un plan 3D cinématique, la mise en scène ne s'applique pas.
- Test : `node tests\staging.mjs`.

## Le fichier `.coulisses` : relire avant l'export

- **Chaque run crée un fichier projet**, à la façon d'un `.drp` de DaVinci : `<titre>.coulisses`, dans son dossier. Un double-clic l'ouvre dans Coulisses.
  - **Brambleshire** : chaque épisode a le sien (`"moteur": "brambleshire"`), créé par `new-episode.mjs`. Il s'ouvre avec tout le moteur intégré : 3D, mise en scène, rendu.
  - **Les autres chaînes, dès maintenant** (`"moteur": "video"`, depuis le 07/10/2026) : L'AItelier (`new-run.mjs`), Vidéo du monde (`new-project.sh`) et 宇宙ちゃん (`new_episode.cjs`, `new_long.cjs`) créent leur `.coulisses` au début du run. Coulisses l'ouvre sur la vidéo du run dès qu'un rendu arrive (jamais un fichier en cours d'écriture), avec la timeline que le pipeline écrit (`--plan`). Test : `node tests\coulisses-video.mjs`.
  - **Les autres chaînes**, une fois passées sous Remotion : le fichier pointe vers la composition du run, que Coulisses joue **en direct, sans export**. La timeline montre les pistes décrites par le projet, chaque note nomme l'élément visé (`data-coulisses`) et le clip (fichier, image du clip), et Claude lit le code. Quand l'export arrive dans le dossier prévu, Coulisses le charge seul.
- **Le contrat** (ce que le projet Remotion doit fournir) : `docs\FICHE-COULISSES-REMOTION.md`, à donner aux sessions des pipelines. Il compte deux modules, `src/coulisses.ts` et `src/coulisses-timeline.ts`.
- **Les commandes** : `studio-cli.mjs projet creer --depuis spec.json` (au début du run) et `studio-cli.mjs projet verifier "<fichier.coulisses>"` (jusqu'à « PROJET CONFORME »).
- **Un exemple complet** : `node tests\coulisses-fixture.mjs` (le projet d'essai). Test : `node tests\coulisses.mjs`.

## Projets importés (L'AItelier, n'importe quelle vidéo)

- **Importer un projet**, sur l'accueil, à la manière du gestionnaire de projets de DaVinci Resolve. Trois façons :
  - **Un dossier…** ou **Une vidéo…** ouvrent la fenêtre Windows de choix (`Coulisses.exe --pick`) ;
  - **ou colle un chemin** ;
  - glisser un dossier ou une vidéo **sur l'icône** Coulisses l'importe et l'ouvre directement.
- **Ce qui est reconnu** :
  - **un run de L'AItelier** (`run.json`, `08-montage\plan-montage.json`) : son titre vient de `02-script.md`, et sa vidéo est le dernier export de `07-renders\` (ou la vidéo livrée). Un export en cours d'écriture est ignoré tant qu'il bouge ;
  - **un dossier** : sa vidéo la plus récente ;
  - **une vidéo seule**.

  Un épisode Brambleshire est refusé, car il est déjà dans la liste.
- **Les notes vont dans le projet**, sous `revue\` (ton choix), avec `revue\projet.json`. La liste des projets importés est dans `%LOCALAPPDATA%\Coulisses\projets.json`. **Retirer** enlève un projet de la liste sans rien supprimer.
- **Dans le studio** :
  - l'image garde la taille de la vidéo (un Short 9:16 s'affiche debout) ;
  - pas d'aperçu du code, pas de mise en scène, pas de « Lancer le rendu » ;
  - la timeline montre les pistes du montage Resolve (chapitres, V1 plans, V2 présentateur, V3 calques, A1 voix, A2 musique, A3 bruitages ; un clip désactivé en pointillés) et le son de la vidéo ;
  - un double-clic sur un clip crée une note sur tout le clip ;
  - l'Inspecteur et chaque lot disent quels clips sont sous la note, avec le fichier et l'image exacte du clip.
- **Quand tu exportes une nouvelle version**, le studio la charge tout seul, et « Comparer avant / après » oppose l'ancien et le nouvel export.
- **Côté agent** : les commandes prennent le chemin du projet à la place de `E03` (`AGENT.md`, « Un projet importé »). Pour L'AItelier, ses propres règles s'appliquent, et l'agent n'exporte jamais.
- Test : `node tests\projects.mjs`. Il porte sur de faux projets générés dans `.cache\projects-test\`, avec son propre accueil.

## Rendu depuis le studio

- **Lancer le rendu** : en haut de l'onglet **Envois**. La carte « Rendu » dit ce que le rendu emportera (les lots corrigés depuis la vidéo actuelle). Le clic envoie une demande à ton agent : une ligne à coller, ou rien à coller s'il surveille l'outil. C'est toujours lui qui rend, comme tu l'avais choisi (« rendu sur ton ordre »).
- **Avancement**, dans la carte et dans une pastille en haut de l'écran, visible depuis tous les onglets :
  1. les cinq contrôles automatiques, un par un ;
  2. le rendu : image en cours, pourcentage, temps restant ;
  3. la finition : mixage final, plan du rendu, notes recalées, chapitres ;
  4. la vérification par l'agent, qui regarde la vidéo entière.

  L'accueil de l'application l'affiche aussi sur la carte de l'épisode.
- **Remplacement de la vidéo** : pendant la finition, le studio lâche la vidéo (« Le nouveau rendu remplace la vidéo »), puis recharge seul la nouvelle, sur la même image et avec les notes recalées.
- **Arrêter le rendu** : possible tant que la finition n'a pas commencé. La vidéo actuelle ne change pas.
- **Contrôle non passé** : le rendu ne démarre pas. La carte montre le contrôle en rouge, et l'agent corrige avant de relancer.
- **Comparer avant / après** : dans la carte, ou dans le menu « … » d'une note corrigée.
  - Chaque note corrigée lors d'un rendu précédent s'affiche en volet. À gauche de la barre, l'image du lot (avant) ; à droite, la même image dans la nouvelle vidéo (après).
  - Glisser la barre pour comparer. **B** ou **Espace** passe tout en avant ou tout en après ; **←** **→** passent d'une note à l'autre ; « Aller à la note » ouvre la note.
- Côté agent : `studio-cli.mjs render` (voir `AGENT.md`, « Une demande de rendu »). Fichiers : `revue\render.json` (l'avancement) et `revue\render.log` (la sortie complète), écrits par cette commande.
- Test : `node tests\render.mjs`. Il utilise des étapes simulées (`tests\fake-render.mjs`) sur le bac à sable de test : aucun vrai rendu, rien dans le pipeline. Ensuite, arrêter le serveur de test et lancer `node tests\render.mjs --restore`.

## Les fichiers et qui les écrit

| Fichier (dans `07_Episodes\<épisode>\revue\`) | Écrit par | Compatibilité |
|---|---|---|
| `notes.json` | la page seule | Les champs existants sont inchangés. Nouveaux champs **optionnels** : `draft` (en attente d'envoi), `lot`, `sentAt`, `mark` (`{kind: pin|circle, points, strokes}` en pixels 1920×1080), `target` (objet 3D), `source` (`video` ou `code`). |
| `replies.json` | l'agent seul | Même format `{ notes: { <id>: { status, statusAt, messages, remap } } }`. Ajouts : `status: "working"` et une clé `lots`. `reply.py` et `remap-notes.mjs` marchent toujours. |
| `lots\NNN.json`, `NNN.md`, `NNN\` | le serveur, à l'envoi | Nouveau. Le `.md` est la demande que lit l'agent, avec des chemins absolus. Il commence par les mises à jour vérifiées à l'envoi. |
| `runs\NNN\` | `studio-cli.mjs snapshot` et `done`, puis l'outil pour annuler | Nouveau. |
| `studio-agent.json` | `studio-cli.mjs wait` | Signal de vie de la session qui surveille l'outil. |
| `render.json`, `render.log` | `studio-cli.mjs render` | Nouveau. L'avancement d'un rendu demandé depuis le studio, et sa sortie complète. `render-stop` est créé par le studio pour demander l'arrêt. |

## L'agent : Claude Code aujourd'hui, Codex (GPT) demain

- **« Connecter à l'agent »** : le bouton en haut du studio donne la ligne à coller une fois dans la session de ton agent. Tant qu'elle n'est pas collée, la fenêtre propose de choisir ton agent (Claude Code ou Codex/GPT). Ce choix sert à vérifier ses skills.
- **Une fois connecté**, l'agent se nomme lui-même : sa commande lit la variable `AI_AGENT` (Claude Code, Codex…), ou `STUDIO_AGENT=claude|codex` pour la forcer. Le bouton dit alors « Agent connecté · Claude Code », et ses réponses dans les notes sont signées de son nom.
- **Rien n'est propre à Claude** dans les échanges : les lots, `AGENT.md` et les commandes de `studio-cli.mjs` marchent pour tout agent capable de lancer des commandes.

## Mises à jour, vérifiées à chaque envoi

À chaque lot (et à chaque demande de rendu), le studio vérifie, en une seconde environ (puis instantanément pendant 6 h) :

| Quoi | Comparé à |
|---|---|
| **Remotion** du projet (un épisode) | la dernière version sur npm |
| **Les skills de ton agent** installés par l'outil `skills` (`~/.agents/.skill-lock.json`, par exemple les skills HyperFrames) | leur source sur GitHub |
| **Le skill `brambleshire-theatre`** chez cet agent | celui de Claude Code, la référence (il manque aujourd'hui chez Codex) |
| **Les skills officiels de Remotion** (`remotion-dev/skills`, dont `remotion-upgrade`) | installés ou non |

- Le résumé s'affiche dans la fenêtre d'envoi, en ambre s'il y a quelque chose à mettre à jour.
- Le détail ouvre la demande de l'agent (section « Mises à jour »). **L'agent te propose ces mises à jour en QCM avant de corriger, et n'installe rien sans ton accord.**
- Après une montée de version de Remotion, il lance les trois tests de non-régression.
- Revérifier à la main : `studio-cli.mjs updates E03`. Le code est dans `lib\updates.mjs` et `lib\agent.mjs`.

## Côté agent

Le protocole complet est dans `AGENT.md` : `wait`, `take`, `snapshot`, correction, `frame` / `sheet`, `reply`, `done`, `render`, `undo`, `status`.

## Fichiers

- `studio-server.mjs` : le serveur local, sur 127.0.0.1, port 4174 par défaut.
- `studio.html` : la page.
- `studio-cli.mjs` : la ligne de commande de l'agent.
- `lib\` : chemins, captures, lots, instantanés, compilation de l'aperçu, rendu complet (`render.mjs`).
- `player\` : le Remotion Player de l'aperçu vivant (`entry.tsx`, et la mise en scène dans `stage.ts`), compilé par l'esbuild du projet Remotion dans `.cache\`.
- `tests\` : tests de bout en bout (Chrome headless piloté par le protocole DevTools, aucune dépendance). Ils se lancent avec le serveur du bac à sable démarré : `node tests\e2e.mjs`, `node tests\e2e-agent.mjs`, `node tests\staging.mjs` et `node tests\render.mjs` (puis `--restore`, serveur arrêté). `node tests\app.mjs` teste l'application, `node tests\projects.mjs` les projets importés (il lance son propre accueil).
- `sandbox\` : copie des notes et des réponses de l'E03, avec un lien physique vers le MP4 (pas de copie de 576 Mo).
- `.cache\` : aperçu compilé et bundle Remotion. `public\` y est une **jonction** vers `06_Remotion\public`, pas une copie de 2,9 Go. On peut supprimer `.cache\` à tout moment.

## Pistes pour la suite

- Comparer deux rendus sur toute la vidéo, et pas seulement note par note (garder le rendu précédent : environ 576 Mo de plus par épisode).
- Créer un nouvel épisode depuis l'accueil et suivre son avancement.

Inspiré de [HyperFrames Studio](https://github.com/heygen-com/hyperframes) (HeyGen, Apache 2.0). Aucun code ni binaire n'en est copié : seul le principe de fonctionnement est repris.
