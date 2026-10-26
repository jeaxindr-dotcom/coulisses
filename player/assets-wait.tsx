// Compatibilité du point de montage des Players. Les attentes sont acquises par
// leur producteur (useDelayRender/useBufferState, sequence-window.tsx) et libérées
// au démontage. Un registre global ne peut distinguer une scène d'un orphelin.
// ready.ts observe les propriétaires et les médias ; aucun délai ne transforme
// un chargement de vingt secondes en une image réputée prête.
import React from 'react';
export const AssetsWait: React.FC = () => null;
