# Diagnostic de « Rendre ce plan » — 26 octobre 2026

## Faits établis avant modification du produit

Le premier état consulté dans `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\shot-render-test\plan\revue\shot-render.json` indiquait un échec commencé à `2026-10-26T05:05:21Z` et terminé à `05:05:24Z`, avec :

```text
Error: Visited "http://localhost:3001/index.html" but got no response.
```

Son journal, lu avant la reproduction qui recrée ce bac, contenait successivement : bundle prêt en 1 s ; composition 1920×1080, 30 ips, 300 images ; clip cible 960×540 muet ; début de rendu, zéro image ; puis cette pile :

```text
at gotoPageOrThrow (...\@remotion\renderer\dist\goto-page-or-throw.js:8:27)
at async innerSetPropsAndEnv (...\dist\set-props-and-env.js:101:30)
at async setPropsAndEnv (...\dist\set-props-and-env.js:210:24)
at async makePage (...\dist\make-page.js:17:5)
at async makeNewPage (...\dist\render-frames.js:71:22)
at async Promise.all (index 4)
at async getPool (...\dist\render-frames.js:104:32)
```

Il s’agit d’un retour `null` de `page.goto`, que Remotion transforme en erreur. La sélection de la composition avait déjà réussi. Cette trace ne prouve pas que le serveur HTTP était arrêté : elle signifie que le pilote de navigation n’a pas fourni d’objet réponse. Le SDK local consulté est celui de `C:\Users\owner\Desktop\Youtube\music\Brambleshire\Théatre\06_Remotion\node_modules\@remotion\renderer`, uniquement lu.

Le fichier final de 2 secondes n’a pas été remplacé et aucun ancien clip n’a été archivé : la protection du remplacement fonctionnait. L’absence de carte « Plan rendu » et de `.shUndo` était une conséquence de cet échec, non trois autres régressions.

**Le défaut n’est pas systématique.** Une relance ciblée sur la branche, avant tout correctif produit, a réussi : `shot-render-avant.log`, 8 réussites, clip de 10 secondes conforme et annulation réussie. Il serait faux d’affirmer que la publication immuable G12 ou le verrou du cache de plages cause cette panne. Le chemin `shot-render-run → compositionOf → renderVideo` passe `cacheKey: null` ; les seules modifications précédentes de `frames.mjs` ajoutaient l’option de cache explicite, non utilisée ici.

## Correction et portée de la preuve

`C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\lib\frames.mjs:232` reprend le rendu **une seule fois**, uniquement pour le message exact de navigation locale sans réponse. Il ferme le navigateur possédé, enlève la sortie incomplète et ouvre un nouveau navigateur, **avec une seule page de rendu** pour cette reprise (`:265`). Le bundle, la composition, les propriétés, le format, la plage et le chemin de sortie ne changent pas. Les annulations, erreurs du projet, URL distantes et délais génériques ne déclenchent pas cette reprise. Si la fermeture du navigateur échoue, sa référence est conservée pour le nettoyage final et aucune reprise n’est lancée.

`C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\lib\shot-render-run.mjs:39` et `:57` ferment aussi le navigateur lors d’un échec de sélection, de nettoyage initial du temporaire ou de rendu, puis nettoient le temporaire après fermeture. Le clip final reste remplacé uniquement après validation, avec sa sauvegarde habituelle.

La cause précise du retour `null` dans Chrome/CDP n’est pas établie. Le défaut de Coulisses corrigé est l’absence de récupération bornée et de nettoyage pour cette panne de navigation observée. Le même test avec l’erreur injectée échoue sur **main `10633a9` et revue-astra `1de607c`** : c’est un défaut de robustesse préexistant révélé de façon intermittente, pas une régression de branche démontrée. L’impact de la reprise est une ouverture supplémentaire de navigateur, puis un rendu moins parallèle en cas de cette erreur seulement. La première tentative conserve la concurrence demandée.

## Essais avec le véritable moteur

Le premier essai de reprise avec un navigateur neuf et la concurrence automatique conservée a échoué : **1 réussite, 1 échec**, journal `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\run-all\shot-render-injection-navigateur-seul.log`. L’injection est exécutée une seule fois ; le second appel atteint le véritable SDK, qui échoue naturellement avec le même message à `Promise.all (index 4)`, avant la première image. Sa pile intégrale est conservée dans `shot-render-injection-navigateur-seul-rendu.log`, dans ce même dossier. Le navigateur neuf seul était donc insuffisant dans cet essai.

Le SDK crée les pages parallèles dans `render-frames.js:104`. Sa concurrence automatique peut atteindre huit pages (`get-concurrency.js`), alors que la reprise corrigée en utilise une. L’essai suivant, même injection puis véritable moteur, réussit : **10 réussites, zéro échec**, journal `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\run-all\shot-render-injection-concurrence1.log`. Le premier rendu s’est déroulé de `05:24:41Z` à environ `05:25:14Z` : clip muet 960×540 de 300 images / 10 secondes, sauvegarde de l’ancien clip, remplacement, carte et restauration vérifiés. Le test a également vérifié l’annulation d’un deuxième rendu et la suppression de son temporaire. Ces mesures concernent uniquement le petit projet d’essai.

Cette comparaison prouve le fonctionnement de la récupération à une page dans le scénario testé ; elle ne suffit pas à attribuer le retour `null` à un défaut interne déterminé de Chrome. Il n’y a pas de boucle de relance ni de deuxième reprise après une nouvelle erreur.

Limite de conservation des traces : le journal initial de `05:05:21Z` a été lu puis transcrit avant recréation du bac, sans copie brute. L’essai de reprise insuffisante dispose, lui, de son journal brut complet. Le journal du rendu injecté réussi a été remplacé par le test d’annulation ; son compte rendu, ses assertions et le relevé de progression sont conservés, mais pas sa trace de rendu complète. `tests\shot-render.mjs:94` sauvegarde désormais `shot-render-success.log` avant l’annulation pour les prochains essais.

## Références précises dans le SDK lu

Racine : `C:\Users\owner\Desktop\Youtube\music\Brambleshire\Théatre\06_Remotion\node_modules\@remotion\renderer\dist` (aucun fichier de cette racine modifié).

- `goto-page-or-throw.js:7` : absence d’objet réponse de `page.goto`, transformée en erreur à la ligne 8.
- `browser\LifecycleWatcher.js:87` : `navigationResponse()` peut retourner `null` si aucune requête de navigation n’a été suivie ; la réponse de cette requête peut aussi être absente.
- `set-props-and-env.js:103` : les reprises du SDK visent `ECONNRESET` et `ERR_CONNECTION_TIMED_OUT`, pas ce cas.
- `render-frames.js:104` : création des pages par `Promise.all`, lieu de l’échec observé à l’index 4.

## Tests

- `tests\shot-render-regressions.mjs` exécute les vraies fonctions du produit avec le SDK simulé. Version corrigée : **14 réussites, zéro échec**. Les deux références : **6 réussites, 8 échecs**, pour la reprise et les nettoyages absents. Les erreurs du projet et annulations restent transmises ; le mode GPU est couvert séparément pour ne pas confondre navigation et encodeur. Les deux derniers cas ajoutés vérifient une fermeture refusée et un temporaire impossible à supprimer avant le rendu.
- Journaux : `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\run-all\shot-render-regressions-{avant,main,apres}.log`.
- `tests\shot-render.mjs --navigation-failure` prépare une injection dans le module SDK **en mémoire du processus d’essai seulement**, puis exécute le véritable rendu. Aucun fichier du SDK réel n’est modifié. **10 réussites, zéro échec**, comme détaillé ci-dessus.
- Le test utilise désormais un port libre à partir de 4240, `requireSandbox`, la garde de rendus et un Chrome muet. Son diagnostic imprime l’erreur initiale avant de s’arrêter ; il ne la masque plus par un clic sur un bouton inexistant. Il arrête son propre rendu en cas d’échec du test.
