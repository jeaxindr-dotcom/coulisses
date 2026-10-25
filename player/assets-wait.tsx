// The live preview waits for what the composition waits for (user report 25/10/2026: « à l'arrêt on voit bien deux
// images superposées suite à un fondu ; quand je mets play, l'écran devient noir — résultat, j'envoie des corrections qui
// n'ont pas lieu d'être »). A scene that loads its assets when it mounts (a Theatre stage: every texture, its cardboard
// built — several seconds; an <Img> loading) says so with delayRender(): a render waits for it at every frame, Remotion's
// Player did not — it went on playing over the composition's black background, and that black was judged.
// The Player's own bookkeeping is read (remotion/delay-render: window.remotion_delayRenderHandles, kept in the Player
// too): while a handle is pending, the playback waits — Remotion's buffering (useBufferState().delayPlayback(): the
// clock stops, the page is told « waiting », its review sound stops with it), and goes on once the scene is there.
// A handle still pending after 20 s is not waited for any more (a component that clears it only when rendering).
import React, { useEffect, useRef } from 'react';
import { useBufferState } from 'remotion';

const STALE = 20000;

export const AssetsWait: React.FC = () => {
  const buffer = useBufferState();
  const ref = useRef(buffer); ref.current = buffer;
  useEffect(() => {
    const W = window as any, seen = new Map<number, number>();
    let held: { unblock: () => void } | null = null;
    const tick = () => {
      const now = performance.now(), hs: number[] = Array.isArray(W.remotion_delayRenderHandles) ? W.remotion_delayRenderHandles : [];
      for (const h of hs) if (!seen.has(h)) seen.set(h, now);
      for (const h of [...seen.keys()]) if (!hs.includes(h)) seen.delete(h);
      let wait = false;
      for (const t of seen.values()) if (now - t < STALE) { wait = true; break; }
      if (wait && !held) held = ref.current.delayPlayback();
      else if (!wait && held) { held.unblock(); held = null; }
    };
    const id = setInterval(tick, 50); tick();
    return () => { clearInterval(id); held?.unblock(); held = null; };
  }, []);
  return null;
};
