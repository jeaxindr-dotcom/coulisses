// The 3D staging of a Remotion run (player/remotion.tsx), for a project that has React Three Fiber scenes (Uchu-chan's
// theatre shots, Vidéo du monde's 3D sets): the Theatre's own staging (player/stage.ts — pick an object, move / turn /
// scale it, free camera) and its pixel-exact picking (player/r3f.ts). lib/player-build.mjs bundles this file only when
// the project has @react-three/fiber; otherwise player/no3d.ts stands in (a run without 3D).
import * as R3F from './r3f';
import { createStage } from './stage';

export function create3d({ W, H, frame }: { W: number; H: number; frame: () => number }) {
  const stage = createStage({ roots: R3F.roots, index: R3F.indexFibers, fiberOf: R3F.fiberOf, reactPath: R3F.reactPath, describe: R3F.describe, seen: R3F.seen, noise: R3F.NOISE, frame, W, H });
  return { stage, hasScene: R3F.hasScene, pick: (x: number, y: number) => R3F.pick(x, y, W, H), settle: () => R3F.settle(false) };
}
