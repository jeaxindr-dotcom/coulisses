// The 3D staging of a Remotion run (player/remotion.tsx), for a project that has React Three Fiber scenes (Uchu-chan's
// theatre shots, Vidéo du monde's 3D sets): the Theatre's own staging (player/stage.ts — pick an object, move / turn /
// scale it, free camera) and its pixel-exact picking (player/r3f.ts). lib/player-build.mjs bundles this file only when
// the project has @react-three/fiber; otherwise player/no3d.ts stands in (a run without 3D).
import * as R3F from './r3f';
import { createStage } from './stage';

export function create3d({ W, H, frame }: { W: number; H: number; frame: () => number }) {
  const stage = createStage({ roots: R3F.roots, index: R3F.indexFibers, fiberOf: R3F.fiberOf, reactPath: R3F.reactPath, describe: R3F.describe, seen: R3F.seen, noise: R3F.NOISE, frame, W, H });
  // what the 3D scene holds ({ type, name } of every object): the tests, and a quick look at what the agent built
  const objects = () => R3F.roots().flatMap((r: any) => { const out: { type: string; name: string }[] = []; r.store?.getState?.().scene?.traverse((o: any) => out.push({ type: o.type, name: o.name })); return out; });
  return { stage, hasScene: R3F.hasScene, pick: (x: number, y: number) => R3F.pick(x, y, W, H), settle: () => R3F.settle(false), objects };
}
