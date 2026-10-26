# Contrat des attentes de l’aperçu — 26 octobre 2026

Les projets n’importent aucun fichier de Coulisses. Ils utilisent les API publiques de Remotion : `useDelayRender()` pour une ressource nécessaire au rendu, `useBufferState()` et son bail `delayPlayback()` pour une attente de lecture. Le nettoyage du producteur reste obligatoire dans le projet, afin de fonctionner aussi hors de Coulisses.

```tsx
const {delayRender, continueRender, cancelRender} = useDelayRender();
const [assets, setAssets] = useState<Assets | null>(null);
useEffect(() => {
  const handle = delayRender('décor de cette scène');
  let disposed = false;
  loadAssetsForThisScene().then((value) => {
    if (disposed) return;
    setAssets(value);
    continueRender(handle);
  }).catch((error) => {
    if (!disposed) cancelRender(error);
  });
  return () => { disposed = true; continueRender(handle); };
}, [delayRender, continueRender, cancelRender, sceneId]);
```

Dans le bundle d’aperçu seulement, `player/sequence-window.tsx` enveloppe ces deux hooks. Une identité appartient à chaque montage ; elle connaît ses poignées et ses baux. Le démontage les libère également dans l’adaptateur, ce qui protège la lecture si un ancien producteur oublie son nettoyage. Le contexte `SequenceContext` de la version Remotion du projet fournit les états `premounting` et `postmounting`, y compris ceux des ancêtres. Cette dépendance interne est isolée dans l’adaptateur ; les moteurs ne l’utilisent pas.

Une attente prémontée ne suspend pas la lecture. Si sa ressource manque encore quand sa séquence devient visible, son bail devient bloquant. Quitter cette séquence suspend son bail ; le démontage le supprime. Une libération tardive est idempotente et ne peut libérer le bail d’une autre scène. Aucun délai maximal ne transforme automatiquement une ressource manquante en ressource prête.

`AssetsWait` est conservé comme composant vide de compatibilité. Il ne lit plus le registre global pour décider d’une pause. Le prémontage universel de trois secondes est retiré : seul un `premountFor` explicite du projet reste appliqué. Cela ne constitue pas encore un ordonnanceur avec budget GPU ; un projet déclarant trop de prémontages doit encore réduire sa fenêtre.

`createReady().status()` retourne `state`, `reason`, `verified`, `activePending` et `legacyPending`. Les états sont `ready`, `loading`, `error`, `unverified`. `when()` attend deux images d’affichage, puis rejette une erreur média, un contexte graphique perdu ou une échéance de trente secondes. Il ne résout jamais par expiration. L’événement `ready-error` contient `{reason, error:{message,where,stack}}`. `dispose()` rejette les attentes encore ouvertes. Le premier dessin 3D est vérifié via `gl.info.render.frame` sur les seuls canvas visibles ; cela ne prouve ni la justesse artistique ni la présence d’éléments que le moteur n’a pas déclarés comme ressources attendues.

Limite de compatibilité assumée : une fonction globale `delayRender()` ne fournit aucune identité de composant. On ne peut distinguer de façon fiable son oubli de nettoyage, son prélèvement par un composant interne de Remotion, et le chargement d’une scène future. Ces poignées restent un diagnostic `unverified` tant qu’elles existent ; elles ne suspendent jamais l’horloge de lecture. Une nouvelle version ne reçoit pas une fausse certification complète. Un composant interne `Img` libère normalement sa poignée après le décodage ; aucun classement permanent « incompatible » n’est appliqué au projet. La migration vers les hooks publics est nécessaire pour les ressources propres aux moteurs.

Preuves locales : `node tests/preview-lifecycle.mjs` donne 12 réussites, zéro échec ; `node tests/preview-lifecycle.mjs --reference 10633a9` donne douze échecs comportementaux. Les modules de production sont exécutés avec le vrai réconciliateur React ; seules l’horloge, les données DOM et les interfaces natives Remotion sont contrôlées. Ces tests ne mesurent pas les performances d’un navigateur. Ils couvrent les propriétaires croisés, le prémontage visible/caché, l’oubli de nettoyage, l’absence de libération après vingt secondes, les échéances, médias cassés, premier dessin/contexte perdu et sommeil de toutes les racines R3F. Les suites `preview-wait`, `preview-premount` et `sound-watch` doivent compléter ces preuves dans Chrome muet, sous coordination de l’agent principal.

La fixture accepte `makeFixture({slowScene, premount, forgetCleanup, master})`. `master:true` donne à la composition et à `reviewAudio` la même source `essai/mix.wav`, copie du sinus synthétique de dix secondes. Le défaut `master:false` vérifie le chemin sonore natif, sans reconstruire arbitrairement les pistes descriptives.
