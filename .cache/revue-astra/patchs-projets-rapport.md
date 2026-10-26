# Correctifs des moteurs sur copies — 26 octobre 2026

Tous les fichiers réels sont restés en lecture seule. Aucun studio ni navigateur n'a été démarré ou piloté ; aucun média réel n'a été décodé ; aucun rendu, export, installation ou changement de configuration Git n'a été effectué par ce sous-travail. Les 25 empreintes des sources consultées sont identiques entre le début et la vérification finale (`patchs-projets/verification-originaux.json`). Les tests ci-dessous sont des tests légers de fonctions, de cycles de vie et de réconciliation React, sans navigateur.

Les patchs exacts sont dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\patchs-projets`. Chacun commence par sa correction, ses risques et sa procédure de vérification, puis contient un diff applicable par `git apply`. Les deux jeux de copies sont sous `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\projets-copies` : `<projet>` contient le prototype, `<projet>-application` contient son résultat après application du patch aux seules sources d'origine. `git apply --check`, application réelle sur copie puis comparaison octet par octet ont réussi pour les quatre patchs. Les empreintes des sources de référence et des patchs sont conservées.

## Résultats communs

Commande : `node tests/project-patches.mjs`, depuis le worktree. Trace : `.cache/revue-astra/patchs-projets/validation.json`.

| Test portant sur le code copié | Avant | Après |
|---|---:|---:|
| Chaque `Stage.tsx` (Lesson 0, Brambleshire, Uchu), démontage avant chargement | 1 handle `delayRender` abandonné | 0 handle et 0 bail de lecture |
| `SceneReact.tsx`, démontage pendant les polices | 1 handle abandonné | 0 handle et 0 bail |
| Lesson 0, passage de la saynète au fondu `Freeze` | 2 montages, 1 démontage de `Live` | 1 montage, 0 démontage |
| `i16-clips`, éléments `img` montés par `construire()` | 900 | 0 ; images ensuite demandées par fenêtre |
| `panneau-s17-01` | 1 176 | 0 ; même principe |
| `s11-01` | 900 | 0 ; même principe |
| `s15-01` | 600 | 0 ; même principe |
| Bobine simulée, sauts 0 → 899 → 0 et démontage | chargement potentiel de 900 images | 12 objets image au maximum, 0 après démontage |
| AItelier, copies de scène avec flou | 8 en aperçu, 8 au rendu | 1 en aperçu, 8 au rendu |
| Pilote de page Uchu | aucune suspension de lecture explicitement possédée | 1 bail pendant chargement, 0 après démontage |
| Cache Brambleshire | absent | partage d'une construction entre deux baux ; ressource active non évincée ; éviction et annulation libèrent les textures |

Les 17 fichiers TS/TSX modifiés passent la transformation syntaxique esbuild. Les assertions vérifient aussi le master exact de Lesson 0, les propriétés `pauseWhenBuffering` et la conservation du flou au rendu. Il ne s'agit pas d'une compilation TypeScript complète des quatre dépôts, ni d'une comparaison de pixels dans le navigateur. Le pilote Uchu libérait **déjà** son `delayRender` : la revue ne doit pas lui attribuer à tort cette fuite ; le patch lui ajoute le contrat de suspension de lecture.

## Lesson 0 — patch à risque faible à moyen

`lesson0.patch` touche trois fichiers de la copie de `C:\Users\owner\Desktop\Youtube\Jap for Eng\06_Theatre\06_Remotion` :

- `src/lesson0/Lesson0Montage.tsx` : `Freeze` reste le même parent de `Live`, seul `active` change. Les rigs vidéo utilisent `pauseWhenBuffering`.
- `src/engine/Stage.tsx` : `useDelayRender()` et `useBufferState()` possèdent leurs attentes ; succès, erreur et démontage les libèrent. Une image qui termine après le démontage ne déclenche plus sa construction 3D.
- `src/coulisses-timeline.ts` : déclare `reviewAudio: {src: L0.MEDIA.mix, offsetFrames: 0, volume: 1}` pour Lesson 0. `L0.MEDIA.mix` vaut `lesson0/mix.wav`, identique à l'audio joué par la composition. Les pistes voix/musique/bruitages restent descriptives.

À vérifier visuellement sur copie : les trois sorties de boulangerie, les 0,35 s de fondu, les sauts et la synchronisation des rigs. Le patch supprime le remontage prouvé à la sortie, mais il ne rend pas gratuit le premier montage 3D de chaque saynète.

## Brambleshire — prototype à risque élevé, validation visuelle requise

`brambleshire.patch` touche `src/engine/Stage.tsx`, `src/Episode.tsx` et ajoute `src/engine/preview-cache.ts` dans la copie de `C:\Users\owner\Desktop\Youtube\music\Brambleshire\Théatre\06_Remotion`.

Le rendu final garde le chargeur natif. Le chemin nouveau n'est utilisé que lorsque `env.isPlayer` et une timeline sont disponibles. Il sélectionne les décors et acteurs d'une fenêtre de deux secondes, conserve les variantes/poses des objets sélectionnés pour éviter une attente à chaque pas, et inclut explicitement les dépendances des quatre plans d'E15 (`intro`, `valleyline`, `viaductsunset`, `homesnow`). Les petits accessoires flottants sont conservés par prudence. Un plan inconnu reprend le jeu complet. Les apparitions courtes entre deux échantillons sont couvertes par les instants des événements. Le calcul est mémorisé par fenêtre, et non réexécuté à chaque image.

Le chargeur d'aperçu effectue au plus deux décodages à la fois et réduit la taille des textures (1024 px maximum ; plafond calculé de 64 Mio RGBA pour les pièces du jeu courant). Il corrige les ancres en pixels lors du redimensionnement. Le cache à baux garde les ressources dans la même iframe, ne libère pas les ressources utilisées, annule les préparations abandonnées et évince les jeux inactifs sous un budget estimé de 192 Mio CPU + textures GPU/mipmaps. Les géométries partagées de `buildLayered` ne sont pas disposées comme si elles appartenaient exclusivement au cache.

Commande : `node tests/project-patches-e15.mjs`. Trace : `.cache/revue-astra/patchs-projets/validation-e15.json`. Le test copie et évalue la timeline d'E15 et les fonctions de sélection ; **il ne charge aucune image et ne mesure ni FPS ni GPU**. Données : 1 112,693 s ; avant, 244 éléments de décor + 233 variantes d'accessoires + 204 poses = 681 constructions. Après, 102 à 181 ressources sur 36 points (points répartis dans le film et entrées/sorties des quatre plans). Le calcul de sélection a pris 1,54 ms en moyenne sur cette exécution ; il ne permet pas d'estimer le temps de décodage ou de construction 3D.

Limites essentielles : le budget n'est pas une limite de VRAM de tout Chrome ; terrains procéduraux, ombres, autres textures des plans et géométries restent hors de ce compteur. Un changement de jeu peut démonter/recréer `ThreeCanvas`. Le cache n'est pas partagé entre deux iframes. Les textures réduites changent la finesse de l'aperçu. Une comparaison de pixels des transitions et des quatre plans, une mesure des pics mémoire et une option explicite de désactivation du profil aperçu sont nécessaires avant son adoption générale. Ce patch est un prototype concret, **pas la preuve qu'E15 sera désormais fluide à 30 images/s**.

## AItelier — prototype à risque moyen à élevé

`aitelier.patch` touche sept fichiers de la copie de `C:\Users\owner\Desktop\Youtube\AItelier\remotion` : `SceneReact.tsx`, `Montage.tsx`, quatre modules de scènes et le nouveau `src/scenes/bobine-apercu.ts`.

Le Player utilise une seule copie de la scène ; le rendu final conserve ses sous-images et ses images d'origine. Les bobines des quatre scènes chargent les images consultées, anticipent les quatre suivantes et conservent au plus 12 images / 32 Mio RGBA chacune. Les deux derniers instants consultés sont protégés pour les fondus qui lisent deux images éloignées de la même bobine. Une image absente suspend la lecture par un bail local ; lorsqu'elle est disponible, `SceneReact` redessine l'instant actuel avant de libérer l'attente. Les promesses anciennes ne réactivent pas une scène démontée ou remplacée. Une image trop volumineuse signale qu'un proxy est nécessaire.

Le snapshot actuel contient déjà un chemin `Html5Video` pour les calques du Player ; le patch le respecte et ajoute aussi `pauseWhenBuffering` à ce chemin. Il ne remplace pas ce correctif déjà présent par l'ancien chemin systématiquement `OffthreadVideo`.

Limites : le plafond est par bobine (six bobines peuvent donc retenir théoriquement jusqu'à 192 Mio RGBA), sans compter les copies navigateur/GPU. Le système attend sur un saut hors fenêtre ; la durée réelle dépend du média et n'a pas été chronométrée. Aucun proxy H.264/VP9 nouveau n'a été généré et les scènes autres que les quatre ciblées ne sont pas converties automatiquement. Le test des bobines utilise des images simulées, pas les JPEG réels. Le gain attendu concerne le nombre d'objets chargés/montés et de copies du DOM ; il ne prouve pas les FPS du film entier.

## 宇宙ちゃん — patch à risque faible à moyen

`uchuchan.patch` touche quatre fichiers de la copie de `C:\Users\owner\Desktop\Youtube\宇宙\relance\theatre\06_Remotion` : `Stage.tsx`, `chain/components/runtime.ts`, `chain/components/UchuPage.tsx`, `mix/S23Short.tsx`.

Les attentes du moteur 3D sont locales et nettoyées ; le pilote de page possède un bail de lecture jusqu'au premier positionnement de sa chorégraphie ; ses vidéos et celles de S23 utilisent `pauseWhenBuffering`. Le nettoyage du handle de rendu du pilote existait déjà. La charge 3D et les reconstructions de page ne sont pas supprimées : il reste à les profiler sur copie aux passages cockpit/page et après saut.

## Contrat commun avec Coulisses et intégration

Les moteurs n'importent aucun registre global Coulisses. Ils utilisent les API publiques `useDelayRender()` et `useBufferState()` de Remotion ; le shim de Coulisses attribue l'attente au composant et respecte sa visibilité pendant le prémontage. Les nettoyages explicites restent nécessaires hors de Coulisses et au rendu natif.

Un master final unique n'a été démontré que pour Lesson 0. Les trois autres patchs n'inventent pas `reviewAudio` depuis les pistes descriptives : le son natif de leurs compositions reste la référence. La déclaration d'un futur master doit correspondre exactement au mix final (gains, fondus, ducking, clips et horloge), pas seulement être une piste WAV disponible.

Les quatre patchs, leurs empreintes, leurs traces de validation et les deux scripts `tests/project-patches*.mjs` sont inclus explicitement dans un commit de `revue-astra`. Les copies de travail et leurs dépôts Git internes restent ignorés. Les patchs conservent les fins de ligne et espaces de contexte des sources qu'ils modifient.

Résumé transmissible : les causes de remontage et d'attente sont corrigées sur copies, avec tests avant/après. Des prototypes bornent maintenant la charge d'E15 et les bobines d'AItelier. Ils réduisent du travail prouvé, mais leur fluidité et leur qualité visuelle sur GPU réel restent à mesurer ; il serait faux de promettre déjà une lecture parfaite de ces projets.
