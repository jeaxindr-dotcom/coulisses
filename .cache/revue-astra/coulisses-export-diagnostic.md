# Diagnostic de la suite coulisses-export — 26 octobre 2026

## Incident initial et limite de preuve

La troisième exécution complète a donné **13 réussites, 1 échec** pour `tests\coulisses-export.mjs`. Le premier export de 300 images avait réussi. L’export suivant, de 30 images, a été lancé à `15:05:57` (heure locale) avec le PID `98148`. Le journal de la suite se termine par `ffprobe` appelé avec un chemin vide, à l’ancienne ligne 92.

Le défaut de diagnostic est prouvé dans le test : le libellé de l’assertion évaluait `frames(dT.file ?? '')` même lorsque `dT.state === 'done'` était faux. Cette seconde erreur masquait donc l’état et l’erreur originels de l’export. La suite suivante a recréé la fixture partagée avant conservation de `revue\export.json` et `revue\export.log` : **la cause du premier échec d’export n’est plus attribuable à partir des preuves disponibles**. Un PID périmé ou une panne de navigation Remotion restent des hypothèses, pas des conclusions.

Le script d’export de la fixture appelle directement le SDK Remotion ; il ne passe pas par `lib\frames.mjs` ni par sa reprise ciblée. Aucun fichier produit, script de fixture, réglage de concurrence ou SDK n’a été modifié dans cette investigation.

## Correction du test

Fichier : `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\tests\coulisses-export.mjs`.

- `:55` : conservation de l’état de lancement, de l’état final, du journal brut complet et du journal du studio, pour chaque export, sous `.cache\coulisses-export-test\exports`. Ce dossier survit à la recréation de la fixture partagée par les autres suites.
- `:64` : validation stricte du lancement, du PID attendu, de l’état `done` et du fichier final existant avant toute inspection média ; affichage de l’erreur primaire et du journal brut en cas d’échec.
- `:132` : comptage des images une seule fois, après validation, sans appel à `ffprobe` dans le libellé d’erreur.
- Ports libres à partir de 4250, Chrome d’essai muet, `requireSandbox` avant manipulation, garde des rendus avant le test et chaque demande d’export, arrêt de l’export du studio d’essai en nettoyage lorsqu’il tourne encore.

Les 22 assertions fonctionnelles existantes sont conservées : GPU et CPU, variantes, vitesse, remplacement en lecture, arrêt, export détaché et reconnexion du studio. Aucune assertion n’est désactivée et aucun échec d’export n’est converti en réussite ou en nouvelle tentative.

## Vérifications

Commande : `node tests/run-all.mjs --only coulisses-export`, avec `tests\isolation-runtime.mjs` et `TEMP`/`TMP` sous `.cache\run-all\temp`.

Résultat : **1 suite, 22 réussites, zéro échec, 194 secondes**. L’export de 30 images a réussi du `2026-10-26T06:11:09Z` au `06:11:17Z`, avec le même PID `106632` au lancement et à la fin. Les journaux de tous les exports de cette suite sont archivés sous `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\coulisses-export-cible`.

Quatre exports supplémentaires de 30 images ont ensuite été lancés successivement sur le même bac, avec vérification préalable des rendus utilisateurs à chaque tour, sans recréer la fixture et sans modifier le produit : **4 réussites sur 4**, durées 8, 8, 8 et 7 secondes. Les 30 images ont été vérifiées par `ffprobe`. Les quatre états et journaux bruts sont sous `C:\Users\owner\Documents\ChatGPT\Dev\coulisses-revue-astra\.cache\revue-astra\export30-repetitions`, avec leur compte rendu dans `export30-repetitions.log`.

La panne d’export initiale n’a donc pas été reproduite. Ces résultats valident le fonctionnement observé et la conservation des diagnostics ; **ils ne prouvent pas qu’un défaut produit d’export a été corrigé**. Le correctif livré porte sur le masquage de l’erreur par le test et la perte de ses preuves.
