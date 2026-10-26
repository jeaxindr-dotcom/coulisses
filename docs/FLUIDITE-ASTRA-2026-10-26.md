# Coulisses : corrections et lecture fluide en mode Code

26 octobre 2026 — complément de `REVUE-ASTRA-2026-10-26.md`.

Travail dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra`, branche `revue-astra`, à partir de `10633a9`. Aucun changement fusionné, poussé ou installé. Les moteurs réels et les réglages personnels n'ont pas été modifiés. Les patchs de moteurs sont des propositions appliquées et vérifiées sur copies.

## Réponse : comment obtenir une lecture fluide en mode Code ?

Il faut supprimer le travail inutile et les blocages incorrects, puis donner un chemin de lecture calculée aux passages qui dépassent le budget du temps réel. Aucun réglage universel de Remotion ne transforme des milliers d'images, plusieurs décodeurs vidéo et une scène 3D reconstruite en une animation garantie à 30 images/s.

Le worktree apporte deux chemins dans **le même mode Code** : le Player interactif corrigé et une commande **« Préparer 30 s »**. Cette commande calcule la plage depuis les sources courantes, l'affiche dans le cadre du code avec la frise et les annotations, puis permet de revenir au Player à l'image choisie. La vidéo calculée contient son propre son et utilise une seule horloge. Il ne s'agit pas de sélectionner le dernier export du projet ; la plage est associée à une génération et refusée lorsqu'elle est périmée.

Cette première version reste une préparation explicite de plage. Elle n'est ni une compilation à chaud conservant arbitrairement tout l'état React entre changements de code, ni un calcul automatique des seules plages touchées par chaque modification. Ces deux extensions exigent des frontières et dépendances explicites dans les moteurs.

### Ce qui coûte réellement, projet par projet

| Projet | Cause et mesure disponibles | Correction livrée et effet attendu | Ce qui n'est pas prouvé |
|---|---|---|---|
| **Lesson 0** | À la sortie des fondus, le parent de `Live` changeait vers `Freeze` : 2 montages au lieu de 1. La reproduction de la première revue montrait environ 5 s de noir avec le chargeur lent injecté, puis 0 s avec un parent stable. Les scènes 3D réelles ont aussi un premier chargement et des vidéos. | Patch `Freeze` stable, nettoyage des attentes, `pauseWhenBuffering`, master exact `lesson0/mix.wav`. Le Player corrigé attend le producteur visible ; les passages lourds peuvent être préparés dans le mode Code. | Les 5 s sont celles de la reproduction contrôlée, pas le temps réel de toutes les saynètes. Aucun chiffre de FPS du film réel après patch n'est revendiqué. |
| **Brambleshire E15** | Le montage complet fabriquait 681 ressources : 244 éléments de décor, 233 variantes d'accessoires, 204 poses. L'analyse des dimensions représente environ 3,89 Gio de tableaux RGBA pour une génération, potentiellement 7,78 Gio pendant deux préparations. Ce ne sont pas des mesures de VRAM. | Patch de sélection par fenêtre, dépendances des quatre plans E15, deux décodages à la fois, textures d'aperçu réduites et cache à baux. Sur 36 points de la timeline copiée : **102 à 181 ressources sélectionnées** au lieu de 681. | La sélection prend environ 1,5 ms en moyenne ; ce n'est ni le décodage ni le rendu. Les FPS, les pics GPU et la fidélité des quatre plans restent à vérifier sur copie. |
| **AItelier** | La revue dénombrait jusqu'à 9 408 `img` pour certaines combinaisons de bobines et huit copies de scène avec flou. Sept couches vidéo et un WAV volumineux ajoutent du décodage. Le snapshot actuel possède déjà un chemin `Html5Video` pour le Player. | Une seule copie de scène en aperçu, huit conservées au rendu ; quatre scènes passent à des bobines bornées à 12 images et 32 Mio RGBA chacune ; attente locale de l'image réellement consultée. Les deux chemins vidéo attendent leur tampon. | Le plafond est par bobine, pas celui de Chrome entier. Aucun nouveau proxy vidéo n'a été fabriqué et les FPS du film réel ne sont pas mesurés. |
| **宇宙ちゃん** | Risques de chargement/démontage du moteur 3D, changements cockpit/page et tampon des vidéos. Le pilote de page nettoyait déjà son handle : lui attribuer cette fuite aurait été faux. | Patch des attentes de `Stage.tsx`, bail de lecture du pilote jusqu'à son premier positionnement, vidéos avec `pauseWhenBuffering`. | Pas de mesure de FPS du vrai Short après patch. La préparation de plage permet d'éviter le coût temps réel pendant sa relecture, mais sa préparation reste à chronométrer sur ce projet. |

Les observations de la première revue restent utiles : une fixture avec 32 Mio de tableaux passait de 34,56 à 69,10 Mio pendant deux générations, puis revenait à 34,56 Mio après collecte ; remplacement en environ 7,8 s dont 5 s de délai injecté ; cadence de référence autour de 30,09 images/s. Les compteurs d'isolate partagés ne doivent pas être additionnés entre parent et iframe. Aucun plantage GPU réel des quatre projets n'a été reproduit et attribué avec certitude.

Mesure supplémentaire après corrections, sur le **bac E03 du worktree** : **30,1 images/s pendant six secondes**, intervalle au 95e percentile **36 ms**, 181 dessins de frise pour 181 événements d'image ; processus parent occupé à 9 %, processus d'aperçu à 25 %. Le Player montait 14 séquences effectives derrière 580 enveloppes de sélection temporelle. Cela valide E03 dans ce scénario, pas E15.

### Architecture retenue, et compromis

1. **Un Player vivant, une candidate au maximum.** Les commentaires et changements hors du graphe visuel ne changent plus la génération si les sorties JS/CSS/ressources importées sont identiques. L'iframe et ses ressources restent alors en place. Une vraie nouvelle génération est préparée à l'arrêt, à l'image demandée, avec ses offsets et sa caméra, puis adoptée seulement après validation. Une erreur garde l'ancienne version et dit que la nouvelle n'a pas été adoptée. Un échange réel peut encore retenir deux générations : le patch E15 et le chemin calculé sont nécessaires pour les moteurs volumineux.
2. **Attentes possédées par les composants.** `useDelayRender()` et `useBufferState()` sont enveloppés dans le shim d'aperçu ; chaque attente a un propriétaire, une visibilité et un nettoyage. Une scène future ne bloque pas celle qui est affichée ; son attente devient active lorsqu'elle apparaît. Le prémontage global de trois secondes est retiré. Un projet peut déclarer son propre prémontage, sur des frontières choisies et avec une charge mesurée.
3. **Horloge unique pour la composition.** Le Player pilote le temps réel. Le son externe éventuel suit ses déplacements, pauses et attentes ; il ne fait plus avancer la composition par des `seek` toutes les 200 ms. Sans master final explicitement déclaré, le son natif reste utilisé. Pour une plage calculée, le seul élément vidéo pilote à la fois image, son et frise.
4. **Plages calculées bornées et invalidables.** Maximum 30 s par demande, cache de six plages et 512 Mio par studio/projet, un calcul à la fois entre studios, concurrence Remotion 1, dimensions réelles plafonnées dans 1280 × 720. La qualité de ce chemin est celle d'un aperçu, pas celle du rendu final. L'iframe reste présente mais son arbre React est démonté pendant le calcul et la lecture calculée. Les caches des moteurs peuvent conserver leur budget de ressources inactives ; le démontage ne garantit pas zéro mémoire GPU. Le retour au direct remonte cet arbre, avec une nouvelle attente possible.
5. **Priorité aux rendus de l'utilisateur.** La file contrôle par GET les états des studios sur 4170–4199 avant de démarrer et pendant le calcul. Si un rendu/export apparaît, elle annule uniquement son propre processus. Le retour au direct attend la fermeture effective de ce processus ; le verrou couvre aussi son PID pour éviter un second travail pendant le nettoyage après disparition du serveur.
6. **Proxies là où le décodage coûte.** Les réductions de textures E15 sont livrées dans le patch moteur. Des proxies vidéo à résolution d'aperçu et à accès rapide restent à produire pour les couches AItelier et les vidéos des autres moteurs. Coulisses doit sélectionner ces proxies uniquement en aperçu, conserver les sources au rendu et indexer leur version. Ce générateur universel n'est pas présenté comme livré.

Les sorties du bundle sont immuables, y compris CSS et images importées. Les médias `staticFile()` servis depuis `public/` restent externes : les recopier intégralement à chaque correction d'E15 serait contre-productif. Pour le cache de plages, le contenu du code et des données est contrôlé, et les médias binaires sont indexés par taille/date. Une modification binaire conservant volontairement taille **et** date est une limite documentée ; un manifeste de médias à empreintes fortes ou une publication atomique du projet serait nécessaire pour la supprimer.

### Ce que l'utilisateur verra

- Un changement de commentaire : pas de nouvelle iframe, pas de chargement de la scène entière.
- Un vrai changement visuel pendant Lecture : annonce d'une version disponible ; adoption à la pause. Pendant sa préparation, l'ancienne version demeure identifiée comme celle affichée.
- Une ressource visible lente : lecture suspendue avec un état de chargement. Une ressource prémontée correctement déclarée peut charger sans arrêter la scène courante. Un délai expiré devient une erreur ; il ne transforme plus une image incomplète en image prête.
- Une panne de contexte sonore : diagnostic, puis restauration explicite par le bouton son. Pas de boucle silencieuse de reconstruction de la 3D. La reprise reste arrêtée jusqu'au clic Lecture.
- **Préparer 30 s** : attente du calcul, puis lecture avec les transports et la frise habituels. La fin de plage arrête la lecture ; un déplacement hors plage revient au direct. Un changement de génération invalide la plage. Le retour au direct peut recharger les ressources de la scène, car son arbre avait été libéré.

Les temps de préparation de Lesson 0, E15, AItelier et 宇宙ちゃん ne sont pas prédits à partir d'une petite fixture. Le premier essai réel du nouveau chemin a pris environ 18 s pour calculer une seconde synthétique, avec démarrage du navigateur et du bundle ; le cache a répondu en 184 ms. Cette mesure interdit de promettre une première préparation instantanée. Les mesures de l'exécution finale figurent plus bas.

## Couverture des défauts de la revue

Les chemins de cette section sont relatifs au worktree complet `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra`. Les patchs des moteurs n'ont pas été appliqués aux projets réels.

| Défaut | Modification et preuve | État et risque |
|---|---|---|
| **B1** attribution temporelle de `delayRender` | `player/sequence-window.tsx`, `player/assets-wait.tsx` : suppression de l'attribution globale, propriétaires explicites. `preview-lifecycle` couvre scène courante/future et transition de visibilité. | Corrigé pour le contrat possédé. Les producteurs utilisant encore la fonction globale doivent être migrés par les patchs moteurs. |
| **B2** attente orpheline | Nettoyage des handles et baux au démontage ; scène quittée avant fin du chargement dans le test. | Corrigé dans le shim et proposé dans les quatre moteurs. Un handle global inconnu est diagnostiqué comme non certifié ; Coulisses ne lui invente pas un propriétaire. |
| **B3** remontage `Freeze` | `lesson0.patch`, test de réconciliation : 2 montages/1 démontage deviennent 1/0. | Correction moteur seulement, sur copie ; vérification visuelle des fondus encore nécessaire. |
| **G1** charge E15/prémontage massif | Zéro prémontage implicite ; cache de plages libérant le Player ; patch moteur bornant la sélection/décodage/textures. | Partie Coulisses corrigée. Patch E15 à risque élevé et non validé visuellement sur tout le film. |
| **G2** multiplication des images/flou | `aitelier.patch` : une copie Player, bobines à fenêtre, huit sous-images au rendu conservées. | Moteur seulement. Tests de fonctions et cycles de vie ; comparaison visuelle encore ouverte. |
| **G3** vidéos ne bloquant pas la lecture | `pauseWhenBuffering` fourni dans les chemins vidéo des patchs concernés. | Moteurs seulement ; pas de remplacement global trompeur du composant vidéo. |
| **G4** image validée différente de l'image adoptée | `page/studio/01-preview.js`, `player/bridge.js` : `prepare(frame)`, preuve de la même image, offsets et caméra recontrôlés. Test caméra déplacée pendant attente et lien initial `#f=270`. | Corrigé ; une interaction pendant la préparation annule la candidate au lieu d'adopter un état périmé. |
| **G5** ancienne transaction réinstallée | Gardes de génération après chaque attente ; fermeture de la transaction avant les déplacements induits par l'adoption. | Corrigé ; tests avant/après de réponses tardives. |
| **G6** délais considérés comme succès | `player/ready.ts`, `player/r3f.ts`, appels RPC : erreurs explicites, premier dessin visible, attentes bornées. | Corrigé. La certification des moteurs hérités utilisant des handles globaux reste impossible sans leur migration. |
| **G7** mix descriptif différent du master | `lib/review-sound.mjs`, `lib/remotion-module.mjs` : `reviewAudio` explicite ; valeur invalide refusée ; absence de master = son natif. | Corrigé. Mode historique uniquement par opt-in `COULISSES_REVIEW_SOUND=legacy`, à éviter pour ces projets. |
| **G8** horloges et attente héritée | Son externe suiveur du Player ; état d'attente réinitialisé à chaque génération ; suppression du `seek` périodique. | Corrigé ; suites navigateur `review-sound`, `preview-wait`, `sound-tab`. Le cache calculé dispose d'une seule horloge native. |
| **G9** cache audio A→B→A/WAV seul | Bonne signature associée au fichier, annulation des publications tardives, métadonnées du master vérifiées même sans nouvelle version. | Corrigé ; tests avec appels ffmpeg simulés et suite navigateur sur master explicite. |
| **G10** contexte audio tiers/fermé | `SoundContext` lie le vrai contexte du Player. Plus de sous-classe globale de `AudioContext` ; nettoyage et fermeture seulement du contexte possédé. | Corrigé ; tests de contexte tiers, fermeture et restauration. Dépendance interne Remotion isolée et vérifiée sur les versions locales. |
| **G11** racines 3D oubliées | `player/r3f.ts` sépare visibilité de pointage et liste de toutes les racines à endormir/réveiller. | Corrigé ; test racine cachée puis visible. |
| **G12** rechargements sans changement visuel | Empreinte des sorties esbuild ; même JS/CSS/ressource = même génération. Test mémoire distingue commentaire et vrais changements de titre. | Corrigé pour les changements identiques. Pas de conservation universelle de l'état React à travers un vrai changement de code. |
| **G13** bundle mutable, génération incohérente | Publication atomique par hash, JS/CSS/ressources servis par version, baux de conservation, master associé au code après construction de la frise. | Corrigé pour les bundles. Médias `public/` externes : limite indiquée ci-dessus. |
| **G14** pannes non diagnostiquées/RPC infinis | Battement de présence, diagnostic `webglcontextlost`, état d'attente transporté, délais des RPC, renouvellement des baux au retour d'onglet. | Corrigé pour détection/reprise explicite. Un battement absent ne prouve pas un crash GPU ; le rapport ne le prétend pas. |
| **N1** boucle de frise arrêtée par une exception | Prochaine animation programmée avant le dessin ; état de dessin validé après succès. `timeline-loop-regressions` exécute la vraie boucle avec une exception injectée. | Corrigé ; 0/10 avant, 10/10 après et suite canvas existante. |

Les diffs exacts Coulisses sont ceux des commits ci-dessous. La comparaison complète reste disponible avec `git diff 10633a9..revue-astra`. Les tests `--baseline`/`--reference` chargent le code de référence sans réinitialiser le worktree ni modifier `main`.

## Validations et commits

**État final : 28 suites concernées, 378 assertions réussies, zéro échec dans leurs dernières exécutions.** Ce total agrège les dernières exécutions de chaque suite ; ce n'est pas l'annonce d'un passage de toutes les suites du dépôt. Le relevé exact est `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\validation-finale.json`. Les journaux sont dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\run-all`.

### Commits fonctionnels de `revue-astra`

| Commit | Travail | Tests principaux |
|---|---|---|
| `2b7c083` — Attribuer les attentes et le son au Player et nettoyer leur cycle de vie | B1/B2, partie G1, G6–G11 ; contrat des moteurs et fixture adaptée. | `preview-lifecycle` 0/12 → 12/12 ; `audio-regressions` 3/25 → 25/25 ; suites navigateur d'attente et de son. |
| `8a0497a` — Publier des aperçus immuables et sécuriser leur adoption à la bonne image | G4/G5, G12/G13/G14, N1 ; garde des tests ; renouvellement des baux ; lecture des sources même à taille/date constantes. | Construction 6/23 → 23/23 ; transactions 0/17 → 17/17 ; protocole 1/17 → 17/17 ; HTTP 3/14 → 14/14 ; frise 0/10 → 10/10. |
| `538f914` — Préparer des plages bornées du code pour les relire dans le même mode | File, cache, empreintes, worker isolé, annulations confirmées et interface intégrée. | File 53/53, worker 17/17, empreintes 14/14, interface 21/21, routes 20/20 et navigateur réel 13/13. |
| `400b593` — Fournir les patchs des quatre moteurs et leurs validations sur copies | B3, G1/G2/G3 et nettoyages des moteurs. Quatre patchs exacts et preuves conservés dans Git ; copies non ajoutées. | 14 cas avant/après sur copies, sélection E15 1/1, application exacte des quatre patchs. |
| `2839ee1` — Afficher le mode Code dès le démarrage sans export | L'interface sélectionnait visuellement « MP4 rendu » alors que son état réel était Code. | Vrai branchement de démarrage exécuté : 2/3 → 3/3. |

Un dernier commit documentaire contient ce rapport, le relevé final et l'inscription du dernier test au lanceur. Son identifiant est fourni avec la livraison, sans chercher à inscrire le hash d'un document dans le document qui définit ce hash.

### Avant/après : défauts existants et nouvelles fonctionnalités distingués

| Suite | Référence sans correction | Résultat corrigé | Nature de la preuve |
|---|---:|---:|---|
| `audio-regressions` | 3 réussites / 22 échecs sur `10633a9` | 25/25 | Vrai code du cache et du son, interfaces natives et ffmpeg simulés. |
| `preview-lifecycle` | 0/12 sur `10633a9` | 12/12 | Vrais hooks/réconciliateur ; horloge et données natives contrôlées. |
| `player-build-regressions` | 6/23 sur `10633a9` | 23/23 | Vrais builds JS/CSS/images et erreurs. Le prototype intermédiaire faisait 21/23 : les contenus à taille/date constantes étaient encore ignorés. |
| `preview-transaction-regressions` | 0/17 sur `10633a9` | 17/17 | Vraies fonctions de page, réponses asynchrones ordonnées par le test. |
| `preview-protocol-regressions` | 1/17 sur `10633a9` | 17/17 | Vrais ponts/RPC, délais, génération, contexte perdu, baux. |
| `preview-server-regressions` | 3/14 sur routes/constructeur/mixeur de `10633a9` | 14/14 | Vrai studio de fixture, GET/POST uniquement sur son port confirmé. |
| `timeline-loop-regressions` | 0/10 sur `10633a9` | 10/10 | Vraie boucle ; exception de dessin injectée puis image suivante. |
| `frames-cache-regressions` | 1/5 sur `10633a9` | 5/5 | Vraie fonction de préparation ; navigateur/compilateur simulés. |
| `initial-code-mode` | 2/3 sur `10633a9` | 3/3 | Branche initiale réelle, classes des trois contrôles. |
| `code-playback-regressions` | Fonction absente de `10633a9` | 53/53 | Nouvelle file : annulation, générations, budgets, verrou et PID, attente de fermeture. Une absence de fonctionnalité n'est pas présentée comme 53 anciens bugs. |
| `code-playback-ui` | Premier prototype : 11 courses rouges parmi les 13 premiers cas | 21/21 | Nouvelle interface : opérations tardives, retour au direct, média prêt, mode MP4, son et dimensions. |
| `code-playback-routes` | Huit retraits ciblés de protections provoquent chacun des échecs | 20/20 | Vrais helpers/routes exécutés en VM : propriétaires partagés, annulation avant création, génération modifiée pendant un GET. |
| `code-playback-sources` | Premier prototype : 8/14, dont un compromis binaire documenté | 14/14 | Vrais fichiers de test ; contenu du code/JSON, taille/date des médias, budgets, jonctions et périmètre. |
| `code-playback-render-regressions` | Nouvelle voie, sans équivalent antérieur | 17/17 | Processus simulés : entrée, résolution réelle, fermeture, annulation, disparition du parent. |
| `render-activity` | Avant le passage au HTTP natif : 26/31 | 31/31 | Vrais GET temporaires sur 4190, plus erreurs/annulation simulées. |
| `project-patches` / `project-patches-e15` | Défauts des copies d'origine : handles abandonnés, remontage, chargements massifs | 14/14 + 1/1 | Tests locaux des sources copiées ; limites de portée précisées dans la section moteurs. |

Commandes reproductibles depuis le worktree, sans changer de branche :

```powershell
node tests/audio-regressions.mjs --revision 10633a9
node tests/preview-lifecycle.mjs --reference 10633a9
node tests/player-build-regressions.mjs --baseline
node tests/preview-transaction-regressions.mjs --baseline 10633a9
node tests/preview-protocol-regressions.mjs --baseline 10633a9
node tests/preview-server-regressions.mjs --baseline
node tests/timeline-loop-regressions.mjs --baseline
node tests/frames-cache-regressions.mjs --baseline
node tests/initial-code-mode.mjs --baseline 10633a9
```

Les commandes de référence sont volontairement rouges. Pour le code corrigé, retirer leur option de référence ou utiliser les suites correspondantes de `tests/run-all.mjs --only …`. Les noms d'options diffèrent entre les tests ; `audio-regressions` utilise bien `--revision`.

### Navigateur et mesures finales

| Suite existante ou intégrée | Dernier résultat |
|---|---:|
| `typecheck` | 1/1 |
| `preview-memory` | 8/8 |
| `preview-speed` sur E03 | 7/7 |
| `sound-watch` | 16/16 |
| `sound-recovery` sur E03 | 10/10 |
| `sound-tab` avec politique d'onglet normal | 4/4 |
| `review-sound` | 9/9 |
| `preview-wait` | 5/5 |
| `preview-premount` explicite | 4/4 |
| `timeline-draw` | 4/4 |
| `code-playback-browser` | 13/13 |

Pour la mémoire après cinq vrais changements visuels : une iframe finale et un document dans chacun des processus mesurés ; parent 1 → 2 Mo de tas JS, iframe 4 → 4 Mo, 25 390 nœuds avant/après dans l'iframe. Cela ne mesure ni la VRAM ni tous les processus Chromium. Un commentaire seul conserve la génération **1 → 1**, le même élément iframe et le même document. Trace : `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\preview-memory-test\mesures.json`.

Sur E03, un refus temporaire du périphérique sonore a été récupéré en **3,8 s**, dans la même iframe, sans F5. Les pannes durables simulées, l'horloge figée, le contexte fermé et l'erreur de périphérique sont annoncés, puis le bouton son permet de reconstruire à la même image ; Lecture reprend le son. Les tests ne diffusent rien sur les haut-parleurs.

Le test réel du cache calcule deux plages de 30 images, 640 × 360, avec son. Exécution finale : **10,743 s**, puis **8,609 s** ; réutilisation HTTP **233 ms** ; affichage dans l'interface **799 ms**. Lecture : **29,987 images/s sur 22 images observées**, environ 0,7 s — preuve courte, pas test d'endurance. Les deux fichiers durent 1,003 s, à 30/1 images/s ; 61 329 et 59 197 octets. Une modification du code à taille/date conservées change réellement les pixels rouges `[208,32,31]` en verts `[31,175,63]`. Ancienne URL : HTTP 410 ; demande portant l'ancienne version : HTTP 409. Le Player est démonté, l'iframe conservée, la frise suit la vidéo, les annotations restent accessibles et le retour au direct conserve l'image.

Preuves finales : `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\code-playback-browser\essai-8UGUgh\resultat.json` et `lecture-calculee.png`. Le screenshot a été inspecté ; il a aussi révélé le mauvais bouton de source sélectionné au démarrage, corrigé par `2839ee1` et son test. Aucune nouvelle mesure de performance n'est déduite de ce correctif purement visuel.

Deux vrais défauts supplémentaires ont donc été trouvés pendant l'intégration, avant de déclarer le chemin utilisable : le Player détruit à l'ouverture d'un lien `#f=270`, et le cache interne d'esbuild conservant un ancien contenu à taille/date constantes. Leurs tests échouaient avant les corrections et passent après.

Les premières suites concernées ont été lancées par `node tests/run-all.mjs --only typecheck,preview-wait,preview-premount,sound-tab,timeline-draw,review-sound` : **27 réussites, aucun échec**. La fixture de master utilise maintenant une déclaration explicite, et le test de prémontage déclare 45 images ; il ne dépend plus du prémontage global retiré.

Une exécution intermédiaire de la suite mémoire a été arrêtée parce qu'elle attendait des nouvelles générations après de simples commentaires. Seul l'arbre du processus de test créé a été arrêté. Le test est corrigé pour vérifier les deux comportements ; sa comparaison de libellé a ensuite été remplacée par une comparaison du vrai numéro de génération, car « compilation en cours » change le libellé sans changer la version. Deux compteurs de résultats des patchs projets ont aussi été adaptés au format du lanceur, et le test de collecte libère explicitement le nouveau bail de démarrage. Ces interruptions ne sont pas comptées comme des validations réussies.

La garde de test a révélé une particularité réelle : `fetch()` de Node refuse le port 4190 avant toute requête réseau. Le contrôle utilise désormais un GET HTTP natif, avec délai et réponse limitée à 1 Mio. Un vrai serveur temporaire sur 4190 a vérifié ce contrôle ; il a été fermé. Le hub connu sur 4170 est reconnu uniquement après un GET `/api/ping` déclarant `hub: true`. Une réponse invalide ou un statut inaccessible d'un studio reste bloquant.

Les tests ont utilisé leurs studios et navigateurs muets, avec vérification du bac à sable. Pour E03, le worktree possède son propre dossier `sandbox\07_Episodes\E03 - The Secret Garden`, une copie de la frise et des liens physiques de lecture vers la vidéo/proxy du bac existant ; aucun export n'a remplacé ces fichiers. Aucun studio utilisateur n'a été piloté. À la vérification de fin, aucun serveur/worker/test appartenant au worktree n'était encore actif.

### Repères dans le code corrigé

- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\player\sequence-window.tsx:51` : propriétaire et nettoyage ; ligne 81 : `useDelayRender` ; ligne 111 : séquences sans prémontage implicite.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\player\ready.ts:20` : disponibilité et handles non attribués.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\player\r3f.ts:170` : sommeil/réveil de toutes les racines.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\player\sound.ts:15` : contexte réel du Player.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\lib\review-sound.mjs:15` : master explicite et cache.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\lib\player-build.mjs:124` : publication immuable et empreinte des sorties.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\page\studio\01-preview.js:67` : transaction d'adoption.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\page\studio\08-timeline.js:483` : reprise de la boucle après exception.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\studio-server.mjs:132` : association frise/code ; ligne 156 : barrière de génération avant calcul de plage.
- `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\lib\code-playback.mjs:17` : file, budgets et annulation ; `lib\code-playback-render.mjs:10` : propriété du processus.

## Patchs exacts des projets

Les quatre patchs comportent un en-tête « correction / risque / vérification » et ont passé `git apply --check`, une application effective sur une seconde copie, puis une comparaison octet par octet. Les empreintes des 25 fichiers réels consultés sont restées identiques. Les projets réels peuvent évoluer dans les autres sessions : refaire `git apply --check` sur leur nouvelle copie avant intégration.

| Patch complet | Moteur cible en lecture seule | Validation et risque |
|---|---|---|
| `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\patchs-projets\lesson0.patch` | `C:\Users\owner\Desktop\Youtube\Jap for Eng\06_Theatre\06_Remotion` | Cycle de vie/Freeze/master vérifiés sur copie. Risque faible à moyen ; vérifier les fondus et rigs. |
| `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\patchs-projets\brambleshire.patch` | `C:\Users\owner\Desktop\Youtube\music\Brambleshire\Théatre\06_Remotion` | Sélection E15 et cache à baux testés ; rendu final garde le chemin natif. Risque élevé pour dépendances des plans et finesse des textures d'aperçu. |
| `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\patchs-projets\aitelier.patch` | `C:\Users\owner\Desktop\Youtube\AItelier\remotion` | Bobines bornées, nettoyage et flou final conservé testés. Risque moyen à élevé ; vérifier les fondus lisant deux positions éloignées. |
| `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\patchs-projets\uchuchan.patch` | `C:\Users\owner\Desktop\Youtube\宇宙\relance\theatre\06_Remotion` | Attentes, pilote et vidéos vérifiés sur copie. Risque faible à moyen ; vérifier les transitions cockpit/page. |

Preuves : même dossier, `sources-sha256.json`, `verification-originaux.json`, `validation.json`, `validation-e15.json`, `validation-application.json`. Explications détaillées : `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\patchs-projets-rapport.md`. Copies : `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\projets-copies`.

Les 14 tests des patchs et le test de sélection E15 sont des validations locales utilisant ces snapshots et des dépendances déjà disponibles. Ils ne prouvent pas une comparaison de pixels ni les FPS des projets réels. Sans ces snapshots sur une autre machine, ils signalent explicitement qu'ils sont sautés.

## Ordre d'intégration recommandé et points ouverts

1. Relire et intégrer les corrections de base Coulisses : attentes possédées, son, transaction d'iframe, publications immuables, frise et diagnostic. Les tests contre `10633a9` doivent rester rouges, ceux du code corrigé verts.
2. Faire appliquer les patchs moteurs par leurs sessions propriétaires, en commençant par Lesson 0 (`Freeze`, cleanup, master) et les nettoyages des trois autres moteurs. Aucun correctif de la page ne peut attribuer avec certitude une ancienne poignée globale à un composant dont il ignore le propriétaire.
3. Valider les profils de charge E15/AItelier sur copies avec comparaison de pixels et mesures de mémoire/processus/GPU. Les plafonds des patchs sont des budgets de ressources connues, pas une limite absolue de VRAM de Chrome. Ne pas annoncer 30 images/s pour ces films avant ces mesures.
4. Relire le chemin « Préparer 30 s » comme une première version utilisable et explicite du cache de code. Il reste à optimiser le coût fixe du navigateur/bundle et à mesurer les vraies plages lourdes. Le serveur ne prépare pas automatiquement toutes les modifications ; il n'invente pas de dépendances de plans.
5. Ensuite seulement : dépendances code→plages pour invalidation ciblée, worker persistant avec budget mémoire, proxies vidéo versionnés, et frontières de composants autorisant la conservation d'état lors d'un vrai changement. Une recharge intégrale reste le repli correct pour un module incompatible.

Limites supplémentaires : première ouverture d'une scène lourde encore coûteuse ; ressources non déclarées impossibles à certifier ; cache de plages utilisant un rendu Remotion susceptible de différer d'un composant qui branche volontairement son apparence sur `isPlayer` ; fidélité du contenu de rendu conservée, mais pas des interactions de mise en scène non enregistrées (la préparation est désactivée en mise en scène). Le budget disque n'est pas une limite RAM de tout le moteur. Une acquisition de verrou interrompue à un instant exceptionnel peut rester bloquée et demander un nettoyage explicite plutôt que lancer deux calculs concurrents.

## Résumé transmissible

Les défauts de lecture relevant de Coulisses sont corrigés dans une branche séparée, avec tests de régression et essais navigateur. Les patchs des quatre moteurs sont fournis sans toucher aux projets réels. Le mode Code conserve désormais son aperçu quand le résultat visuel ne change pas et propose une préparation de plage pour une lecture régulière après calcul. Les premières préparations restent coûteuses ; les FPS des quatre vrais projets après patch ne sont pas encore mesurés. Rien n'est fusionné, poussé ou installé.

## Complément du 26 octobre — G15 : réponses utilisateur invisibles à l’agent

**Gravité : bloquant pour la boucle de correction. Corrigé et testé dans `revue-astra`, pas encore intégré ni installé.** Ce défaut est distinct des problèmes de lecture vidéo : il explique pourquoi une précision enregistrée dans une note ne parvenait pas à l’agent, même lorsque celui-ci exécutait `wait`.

### Cause et preuve du cas Lesson 0

Dans la référence `f273f8e`, `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\page\studio\07-cards.js:123` ajoutait seulement la réponse à `notes[].thread`. La sauvegarde passait par `page\studio\02-notes.js:306`, puis `studio-server.mjs:627`. `studio-cli.mjs:134` ne cherchait que `lotNumbers(P).find(n => !replies.lots[n])`. Il ne consultait jamais les réponses utilisateur. Le lot conservait uniquement le fil photographié lors de son envoi (`lib\lots.mjs:112`). Une reconnexion ne réparait donc rien.

Constat en lecture seule dans `C:\Users\owner\Desktop\Youtube\Jap for Eng\10_Scripts\01_lesson0\revue` :

- `notes.json` : note 27, identifiant `0rt1b5q9`, lot 4 ; réponse du 26 octobre à **02:44:07.262 UTC, soit 11:44 au Japon**, avec une image.
- `lots\004.json` : envoyé le 25 octobre à 13:32:48 UTC ; `thread: []` pour cette note.
- `lots\005.json` : envoyé à **02:45:03 UTC**, exactement le dernier battement et `lastLot: 5` de `studio-agent.json`. Ce lot contient trois autres notes, pas la note 27. Le battement une minute après la réponse prouve la sortie sur le lot 5, pas la réception de la réponse.
- L’état a évolué pendant que d’autres sessions travaillaient : `replies.json` contenait déjà une nouvelle réponse de Claude à 04:08:29 UTC et une prise du lot 6 à 04:08:34 UTC. Je n’affirme donc pas que la note est encore ignorée aujourd’hui ; sa correction visuelle n’a pas été vérifiée dans ce complément.

Deux pertes connexes ont aussi été reproduites : les images des réponses n’apparaissaient pas dans le Markdown d’un lot renvoyé (`lib\lots.mjs:185`), et la fusion après conflit entre onglets choisissait une note entière selon sa date, écrasant le fil de l’autre onglet (`page\studio\02-notes.js:228` dans la référence).

### Chemin corrigé et portée de « vue »

1. La page donne un identifiant stable à la réponse et attend la sauvegarde avant d’annoncer son envoi. Lors d’un conflit HTTP 409, elle réunit les messages des deux onglets au lieu de remplacer tout le fil.
2. Le serveur archive les réponses de l’ancien et du nouveau document dans `revue\user-replies.json` **avant** de remplacer `notes.json` et de confirmer la sauvegarde. Les écritures sont atomiques et verrouillées. Retirer ensuite la carte ne supprime pas une réponse en attente. Un fichier illisible provoque une erreur explicite ; il n’est jamais remplacé silencieusement par une file vide.
3. `wait` consulte les réponses non acquittées avant les lots, à chaque passage de sa boucle de 1,5 seconde. Il retrouve également les anciennes réponses sans identifiant, sans réécrire `notes.json`. Chaque livraison contient au plus **20 réponses**. Elle cite le texte initial, le moment, le lot, les trois dernières réponses de l’agent et les chemins absolus des images.
4. Un fichier complet est conservé dans `revue\user-reply-deliveries\<identifiant>.md`, avec un manifeste JSON et l’empreinte SHA-256 du document. La sortie de la commande est bornée à **12 000 caractères** lorsqu’elle contient une livraison : une très longue réponse reste intégrale dans le fichier. Un lot trop long est également fourni par son chemin.
5. **La sortie de `wait` ne marque pas la réponse comme vue.** L’agent doit lire le fichier complet, regarder les pièces jointes, puis exécuter la commande `ack-replies` imprimée. Elle ne confirme que les versions précises de cette livraison ; un document modifié ou tronqué est refusé. Sans accusé, la prochaine connexion représente les réponses. Cette précaution évite de perdre la suite d’une sortie tronquée par l’outil de l’agent.
6. `GET /api/replies` expose les accusés à la page. Chaque message affiche « Non vue par l’agent » ou « Vue par l’agent ». L’infobulle précise que l’agent a confirmé sa réception : **cela ne certifie pas que la correction est faite**. Un battement, un `take`, un `done` ou une réponse ultérieure ne vaut jamais accusé.

À l’envoi sans surveillance, la page affiche : **« Aucun agent ne surveille Coulisses : ta réponse attendra sa reconnexion. »** La même fenêtre fournit la ligne de connexion et son bouton de copie. L’option existante « Renvoyer à l’agent » reste disponible pour en faire un lot. Si la réception a déjà été confirmée entre la sauvegarde et la consultation du statut, la page le reconnaît et évite une fausse demande de reconnexion.

Les notifications techniques d’annulation/rétablissement sont désormais marquées `kind: 'system'` et exclues de la livraison et des badges de lecture. Les anciens messages techniques non marqués restent ambigus : ils peuvent réapparaître lors de la première migration, plutôt que de supprimer par supposition une vraie réponse utilisateur.

### Fin de surveillance et limites restantes

`wait` reste une commande qui s’arrête après une livraison, à expiration ou sur interruption. Sur une fin normale, `waiting` repasse à `false`. Une mort brutale peut laisser un affichage « connecté » pendant au plus environ 20 secondes, durée de validité du battement. **Coulisses ne crée ni ne relance une session d’agent** ; le protocole actualisé demande de relancer `wait` après traitement ou expiration tant que l’utilisateur souhaite rester connecté. Aucune session extérieure n’a été contactée ou relancée pendant ce travail.

L’attente utilisateur dépend donc encore de la disponibilité de l’agent : sans session, aucun délai de correction ne peut être promis. Avec un `wait` actif, la détection se fait au prochain passage de sa boucle ; le test impose moins de 4 secondes pour le réveil CLI. L’affichage de l’accusé suit l’interrogation périodique de la page, environ toutes les 3 secondes.

La migration présente aussi les anciennes réponses déjà traitées autrement mais dépourvues d’accusé : l’agent doit lire l’historique avant de refaire une correction. Deux attentes concurrentes peuvent proposer le même message ; l’acquittement est idempotent et aucune réponse n’est perdue. La file et les documents de livraison restent conservés sans purge automatique ; un historique exceptionnellement volumineux augmentera le stockage et le coût de lecture. « Vue » est une déclaration explicite de l’agent, pas une preuve indépendante de compréhension. La durabilité couvre les envois enregistrés par Coulisses ; elle ne récupère pas un texte jamais sauvegardé ni un fichier effacé manuellement hors du protocole.

### Fichiers, tests et commits

Repères dans le code corrigé, sous `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra` :

- `lib\reply-delivery.mjs:39` : archivage ; `:53` : projection des accusés ; `:110` : livraison bornée ; `:129` : accusé explicite et vérification du manifeste.
- `studio-cli.mjs:132` : attente ; `:167` : `ack-replies`.
- `studio-server.mjs:326` : sauvegarde durable ; `:590` : réponses et accusés, erreur 503 sur fichier illisible.
- `page\studio\02-notes.js:78` : identité et état des réponses ; `:100` : envoi ; fonction `mergeNotes` : conservation des fils concurrents.
- `page\studio\05-agent.js:118` : événements système ; `lib\lots.mjs:185` : images des réponses dans les demandes renvoyées.
- `AGENT.md` et `AGENT.en.md` : réception, lecture complète, accusé, relance de l’attente et traitement des anciennes réponses.

| Vérification | Avant | Après |
|---|---|---|
| `tests/reply-delivery.mjs` | Référence `f273f8e` : 2 réussites, **9 échecs** ; notamment reconnexion, réveil sans lot, pièces jointes, priorité et livraison après expiration | **29 réussites, 0 échec** ; aussi accusés concurrents, arrivée pendant livraison, retrait de carte, contenu de 4 Mio, document tronqué, fichier illisible |
| `tests/reply-delivery-ui.mjs` | Référence `f273f8e` : 3 réussites, **20 échecs** | **23 réussites, 0 échec**, dont test croisé entre le vrai stockage et la page pour les identités anciennes/mélangées |
| `tests/reply-images.mjs` | **3 échecs sur 3**, exécutés avant le patch | **3 réussites, 0 échec** |
| `tests/reply-delivery-browser.mjs` | Le défaut initial est reproduit par les tests CLI et interface ci-dessus | **22 réussites, 0 échec** dans Chrome muet : envoi avec image hors ligne, rechargement, reconnexion sans accusé, accusé explicite visible, réveil, erreur de stockage et retrait de carte |
| Suites existantes `send-lots`, `notes-safety`, `note-states`, `e2e-agent` | Les premiers essais ont révélé quatre attentes de nom d’agent non isolées dans `e2e-agent` | Respectivement **13, 11, 19 et 11 réussites**, aucun échec |
| Langue du cache de lecture | Nouveau test `code-playback-i18n` contre `f273f8e` : **4 échecs** ; textes français visibles en anglais | **5 réussites** ; `code-playback-ui` : **21 réussites** ; `i18n` : **78 réussites**, 2 contrôles du binaire absents et explicitement non exécutés |

Les tests croisés ont aussi décelé puis corrigé deux erreurs dans une première version du correctif : accusé trop précoce après simple écriture de la sortie, et comptage divergent des anciens messages mélangés à des messages identifiés. Ces versions intermédiaires n’ont pas été livrées.

| Commit | Contenu et validation |
|---|---|
| `9293fc3` — Livrer les réponses aux notes et confirmer explicitement leur lecture | G15 : file, réveil, migration, accusé explicite, images, interface et protocole ; tests CLI, interface et navigateur ci-dessus. |
| `13e666a` — Fiabiliser les suites de connexion et traduire le cache de lecture | Test de connexion indépendant de l’agent qui l’exécute, vraie adoption d’une version du Player, ports réservés évités, tests enregistrés dans le lanceur, traductions et contrôles du binaire clairement signalés lorsqu’absent. |

Total de cette série : **11 suites, 235 vérifications réussies, aucun échec** dans leurs dernières exécutions ; 2 contrôles du binaire non exécutés. Le présent complément et l’inventaire sont enregistrés dans un commit documentaire séparé.

Les journaux détaillés sont conservés dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\run-all`. L’inventaire avec résultats et empreintes se trouve dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\validation-reponses.json`. Preuves avant correction : `\.cache\reply-delivery\avant-YV2IlN\resultat.json`, `\.cache\revue-astra\reply-delivery-ui-avant.log`, `\.cache\run-all\reply-images-avant.log`, `\.cache\run-all\code-playback-i18n-avant.log`, sous le même worktree. Essai navigateur final : `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\reply-delivery-browser\essai-2XkPlx`, avec `resultat.json`, `server.log` et `reponses.png`.

Précisions de validation : les suites ont utilisé des projets d’essai, leurs propres réglages et des navigateurs muets, avec contrôle des rendus/exports par GET avant les tests lourds. Le premier passage de l’ancienne suite `i18n` gardait sa configuration de hub sur **4183**, contraire à la réservation demandée ; ce point a été repéré et corrigé vers des ports libres à partir de 4220 avant le dernier passage. Il ne faut donc pas présenter cette première configuration comme conforme. Aucun studio utilisateur n’a été piloté. Le binaire `Coulisses.exe` n’étant pas présent dans le worktree, les deux contrôles qui en dépendent sont signalés comme non exécutés ; aucune installation n’a été utilisée pour les contourner. Les processus de test ont été fermés. Les quatre projets réels, l’installation et les réglages personnels n’ont pas été modifiés.

### Résumé transmissible de ce complément

Les réponses ajoutées aux notes étaient sauvegardées, mais `wait` ne les lisait jamais : il ne surveillait que les lots. Le correctif les conserve dans une file durable, les présente en premier à la reconnexion et affiche leur état sur la carte. Sans agent connecté, Coulisses l’indique et fournit la ligne de reconnexion. Une réponse reste « non vue » tant que l’agent n’a pas confirmé sa réception, même si sa sortie a été tronquée. Le parcours est testé ; les commits attendent la relecture et l’intégration de l’agent principal. Rien n’est fusionné, poussé ou installé.

## Complément — vérification indépendante avant fusion

La vérification de l’agent principal signalait **64 suites exécutées, 1102 réussites, 6 échecs et une suite sautée**. Les journaux reçus ont été conservés avant relance dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\verification-principale-2026-10-26`.

### Mise en scène : de vrais changements de code dans les tests

Les anciens tests réécrivaient `player\keys.ts` à l’identique. Avec G12, cela ne change correctement ni les octets publiés ni la génération. Le produit n’a pas été modifié pour satisfaire ces attentes périmées.

`C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\tests\staging-rebuild.mjs:6` ajoute temporairement un marqueur JavaScript exécuté dans le document de l’iframe. Le résultat compilé diffère réellement. Un observateur de mutations vérifie que la candidate cachée est préparée pendant que l’ancienne iframe et son API restent actives, puis que cette candidate devient l’unique iframe active. Le test lit ensuite le marqueur dans la nouvelle iframe : une simple variation du texte de statut ne peut plus faire passer ce contrôle. Le fichier est restauré après fermeture des serveurs, sans écraser une modification concurrente.

Les assertions vérifient aussi la même image, la sélection, les décalages, et la caméra libre en 3D. Preuves : `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\staging2d-test\rebuild-proof.json` et `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\staging3d-run-test\rebuild-proof.json`. Résultats ciblés : **26/26 en 2D, 23/23 en 3D**. La suite 3D ouvre désormais une copie du fichier `.coulisses` avec sa propre revue sous `.cache`, au lieu de la revue du Short réel.

### « Rendre ce plan » : panne observée, récupération et limite du diagnostic

La trace détaillée consultée avant recréation du bac montre un échec à zéro image, lors de la création parallèle des pages de rendu (`Promise.all`, index 4) :

```text
Error: Visited "http://localhost:3001/index.html" but got no response.
```

Le bundle et la sélection de composition avaient réussi. Remotion reçoit `null` à la fin de `page.goto` et transforme ce résultat en erreur ; Coulisses abandonnait alors le rendu. Le clip initial de 2 secondes restait intact. L’absence de sauvegarde, de carte « Plan rendu » et de bouton d’annulation était la conséquence de cet abandon, pas trois défauts indépendants. Le test affiche maintenant cette cause au lieu de finir sur un clic dans un élément absent.

**Il n’est pas démontré que la branche a introduit cette panne.** Une relance ciblée avant correction avait passé ses huit contrôles. Le même test de panne injectée échoue dans `main` à `10633a9` et dans la branche avant correction à `1de607c` : **6 réussites, 8 échecs**, contre **14 réussites, aucun échec** après correction. Le chemin de rendu de plan n’utilise ni le verrou du cache de plages ni son `cacheKey` explicite. Attribuer cet incident à G12 serait sans preuve.

Un scénario léger utilisant les vraies classes du SDK **4.0.535** démontre une course possible : `Network.responseReceived` indique HTTP 200 avec `hasExtraInfo=true`, hors cache mémoire, mais `NetworkManager.js:147–159` conserve la réponse en attente de `responseReceivedExtraInfo`. Si `load` termine la navigation avant cet événement, `LifecycleWatcher.js:87–92` renvoie encore `null`, puis `goto-page-or-throw.js:6–8` construit exactement l’erreur observée, ensuite propagée par son appelant. Après `ExtraInfo`, la même requête renvoie 200. Le scénario témoin où `ExtraInfo` précède `load` réussit. SDK lu : `C:\Users\owner\Desktop\Youtube\music\Brambleshire\Théatre\06_Remotion\node_modules\@remotion\renderer\dist`.

Cette reproduction démontre un ordre d’événements défaillant possible dans le SDK ; **l’ordre CDP de l’incident initial n’a pas été enregistré**, donc sa cause interne exacte reste indéterminée. Le script et son résultat sont conservés sous `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\shot-sdk-navigation-preuve.mjs` et `shot-sdk-navigation-resultat.json`. La première trace détaillée avait été lue mais pas copiée avant recréation du bac ; la note de diagnostic en conserve une transcription, explicitement distinguée d’un journal brut.

Correction dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\lib\frames.mjs:238` : pour cette erreur exacte et une URL locale seulement, fermer le navigateur possédé, supprimer la sortie temporaire, ouvrir un navigateur neuf et reprendre **une seule fois, avec une seule page de rendu**. Bundle, composition, propriétés, dimensions, son et plage restent identiques. Une erreur du projet, une annulation, une URL distante ou un délai générique ne déclenche pas cette reprise. Un second échec remonte normalement. La première tentative conserve la concurrence habituelle ; seul le secours est plus lent.

`C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\lib\shot-render-run.mjs:38` ferme aussi le navigateur en cas d’échec de sélection, de nettoyage initial ou de rendu. Le temporaire est nettoyé après fermeture. Si la fermeture de la première tentative échoue, la référence du navigateur reste disponible pour le nettoyage final ; cela ne garantit pas sa fermeture si Chrome refuse aussi cette dernière tentative. Le fichier cible n’est remplacé qu’après validation et sauvegarde.

La première proposition — navigateur neuf mais même concurrence — a encore échoué dans le véritable SDK. Son journal brut est conservé dans `.cache\run-all\shot-render-injection-navigateur-seul-rendu.log`. Avec une seule page, le test `node tests/shot-render.mjs --navigation-failure` passe **10 contrôles sur 10** : véritable encodage des 300 images en 960×540 muet, durée 10 secondes, sauvegarde du clip de 2 secondes, remplacement, carte, restauration et arrêt propre. Compte rendu : `.cache\run-all\shot-render-injection-concurrence1.log`. Cette récupération est validée sur la panne injectée et le rendu réel ; elle ne garantit pas qu’une panne persistante de Chrome puisse être réparée automatiquement.

### Bac de rendu et isolation de la suite

`C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\tests\prepare-render-sandbox.mjs` prépare `.cache\sandbox-test\07_Episodes\E03 - The Secret Garden` depuis le bac de `main` : liens physiques pour les MP4, copies indépendantes des petits JSON, notes et réponses propres. Le rendu simulé écrit un nouveau fichier puis le renomme ; il ne modifie pas les octets du lien source. La restauration utilise explicitement le MP4 du bac du worktree. **`render` n’est plus sautée : ses 35 contrôles ciblés passent.** Un échec de restauration est désormais compté comme échec par le lanceur.

Le binaire `Coulisses.exe` fourni par l’agent principal est conservé sans remplacement ni compilation. Son SHA-256 reste `D49189C7C7766A3A12694E8008560D875D9DA1E361D6FB7915190065575D5F02`. Le test vérifie effectivement `--mute-audio` dans les arguments de son navigateur. Les studios ouverts indirectement par les tests reçoivent des ports libres à partir de 4240 ; les processus arrêtés appartiennent au worktree d’essai.

Le lanceur contrôle par GET les statuts de 4170 à 4199 avant chaque suite ; les ouvertures de navigateurs et essais lourds ciblés gardent aussi leur contrôle. `TEMP` et `TMP` sont isolés sous `.cache\run-all\temp`. Les dépendances des fixtures étant parfois des jonctions vers les moteurs réels, un préchargement réservé aux tests redirige **à la fois l’écriture et l’effacement** du cache Webpack vers `.cache\run-all\webpack`. Le SDK est adapté en mémoire, jamais sur disque ; une forme de SDK inconnue est refusée. Le scénario synthétique donne 9 réussites/1 échec sans isolation et 10/10 avec elle. Cette précaution ne permet pas d’affirmer rétrospectivement que les anciens tests n’avaient écrit aucun cache via ces jonctions ; aucun nettoyage des caches réels n’a été effectué.

### Commits et validation finale

Le premier nouveau passage complet a terminé à **67 suites, 1170 réussites, un échec et aucune suite sautée**. Il a révélé un défaut de démarrage dans `coulisses` : le studio avait bien démarré sur 4240 et compilé sa version 1 en 660 ms, mais la page attendait indéfiniment son premier aperçu. Le test n’enregistrait auparavant qu’un délai dépassé ; il conserve maintenant l’URL, le mode, les iframes, le statut de compilation, les erreurs de page et la sortie de l’accueil avant nettoyage. Ce passage est archivé dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\verification-complete-premier-passage`.

La séquence fautive est reproduite sur les vraies fonctions de la page, sans navigateur : `loadCode()` crée une candidate pour `v0` alors qu’aucun bundle n’est publié ; la route immuable refuse cette version. Quand le statut `ready/v1` arrive, `onStatus()` ne démarre rien parce que `codeLoading` existe déjà. L’attente de la candidate périmée bloque ainsi la première publication. Le nouveau test `tests\initial-publication-regressions.mjs` donne **1 réussite et 6 échecs** sur `4e5216a`, contre **7 réussites et aucun échec** sur les sources corrigées.

La correction attend une génération publiée avant de créer l’iframe, remplace aussi une préparation initiale dépassée, et conserve une demande de mode Code effectuée pendant la compilation. Le MP4 continue jusque-là ; revenir au MP4 annule cette demande sans pause ni saut. Un jeton de demande empêche le retour tardif d’une ancienne préparation d’effacer le choix récent ; l’état de lecture est conservé quand une version en remplace une autre pendant cette transition. Aucun délai n’a été augmenté pour masquer le défaut.

La relecture indépendante a ensuite reproduit une autre course préexistante : après le choix Code, un recalage `frameOn()` peut revenir après un retour au MP4. Il déplaçait alors la vidéo de l’image 31 vers 83 et la relançait malgré le choix récent. Le contrôle du jeton est maintenant répété **après** cette attente, avant tout déplacement ou reprise de lecture. Le huitième cas donne **7 réussites/1 échec sur `c0a4df8`, puis 8/0 après correction**. Le deuxième passage complet, encore en début de parcours, a été interrompu volontairement pour intégrer ce contrôle ; seuls ses processus de test identifiés ont été arrêtés. Il n’est pas compté comme une validation complète.

Le troisième passage a rencontré un incident intermittent dans `coulisses-export` : après le rendu initial réussi, l’export de 30 images n’avait pas de fichier final. Le test évaluait `frames(dT.file ?? '')` dans son libellé, avant de vérifier son état ; `ffprobe` recevait donc un chemin vide et masquait la cause. La suite suivante avait déjà recréé la fixture et effacé son journal quand cet échec a été examiné. **La cause de cet incident annexe n’est pas établie : elle ne peut être assimilée à la panne de navigation du plan sans trace.** Ce passage a été interrompu et archivé dans `.cache\revue-astra\verification-complete-troisieme-passage`.

`tests\coulisses-export.mjs` conserve désormais les états et journaux de chaque export hors de la fixture partagée, vérifie le PID attendu, la fin réussie et l’existence du fichier avant de l’analyser, et arrête son propre rendu si l’essai échoue. Les assertions sur les 300/30 images, le GPU/CPU, les vitesses, le remplacement, l’annulation et la fermeture du studio sont conservées. La relance ciblée donne **22/22**, puis quatre exports supplémentaires de 30 images réussissent en **8, 8, 8 et 7 secondes**, avec la concurrence automatique inchangée. Aucun changement produit, SDK ou recette de fixture n’a été fait pour faire disparaître cet incident. Ces relances ne prouvent pas sa correction ; elles fournissent désormais le diagnostic nécessaire s’il revient. Preuves : `.cache\revue-astra\coulisses-export-diagnostic.md`, `coulisses-export-cible` et `export30-repetitions` sous la même racine du worktree.

| Commit | Objet | Validation ciblée |
|---|---|---|
| `081c6ab` | Reprendre une navigation de rendu sans réponse et fermer ses ressources | Régressions : 6/8 avant sur les deux références, 14/0 après ; rendu réel avec panne injectée : 10/0. |
| `c7ca622` | Tester une vraie révision en conservant la mise en scène des aperçus | `staging2d` 26/0 ; `staging3d-run` 23/0 ; preuve de préparation puis adoption et conservation de l’état. |
| `4e5216a` | Isoler la suite complète et préparer son bac de rendu | Isolation 10/0, accès 16/0, raccourcis 33/0, application 8/0, rendu 35/0. |
| `c0a4df8` | Attendre la première publication du code sans perdre le choix de lecture | Régression initiale 1/6 avant, 7/0 après ; import réel `coulisses` 14/0 ; transaction d’aperçu 17/0 et mode initial 3/0. Ensemble ciblé : 4 suites, 41 réussites, aucun échec. |
| `65aae41` | Ignorer un recalage tardif après un changement de mode | Régression du retour tardif : 7/1 avant, 8/0 après ; suites associées 17/0 et 3/0. |
| `430f772` | Conserver le diagnostic des exports avant toute lecture du fichier | Test d’export ciblé 22/0 ; quatre exports de 30 images réussis. Le défaut de diagnostic est corrigé ; la panne intermittente initiale reste non attribuée. |

**Validation complète finale : `node tests/run-all.mjs` → 68 suites, 1187 réussites, 0 échec, aucune suite sautée, 23 minutes.** Code testé : `430f77262fa40a8927d81b92462fcbb1f8f885d8`. Les 68 suites comprennent le rendu E03 réactivé et les trois nouvelles suites de régression/isolation ; aucun filtre `--only`, `--skip` ou `--quick` n’a été employé pour ce passage.

Le journal global est `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\run-all\validation-complete-2026-10-26.log`. Une copie stable des résultats clés est conservée dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\validation-fusion-2026-10-26`, avec les preuves rouges et vertes ; ses fins de ligne sont préservées dans Git. L’inventaire des **68 journaux**, de leurs résultats et de leurs SHA-256 se trouve dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\validation-fusion.json`. Le présent complément et les preuves font l’objet d’un commit documentaire séparé, sans changement du code testé.

Les processus de test ont été fermés et `player\keys.ts` est restauré. Les deux JSON de validation des patchs de projets, déjà modifiés avant cette intervention, ont retrouvé exactement leur contenu d’arrivée ; les résultats régénérés par le dernier passage sont archivés séparément. Le binaire fourni conserve son empreinte. Rien n’est fusionné, poussé ou installé.

### Résumé transmissible après vérification complète

La branche passe désormais **68 suites, 1187 contrôles, aucun échec et aucune suite sautée**. Les tests de mise en scène déclenchent de vraies révisions et prouvent l’échange des iframes avec conservation de l’état. « Rendre ce plan » récupère une panne de navigation locale par une reprise unique dans un navigateur neuf avec une seule page. Deux courses supplémentaires au démarrage/changement de mode sont corrigées. L’attribution de la panne du plan à G12 n’est pas démontrée ; l’absence de récupération existe aussi sur l’ancienne référence. Un incident annexe d’export n’a pas été reproduit et reste non attribué, avec un diagnostic désormais conservé. Tous les commits restent sur `revue-astra`, en attente de relecture et d’intégration.
