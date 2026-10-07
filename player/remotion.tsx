// Live preview of ANY Remotion project opened through a .coulisses file (lib/coulisses-file.mjs) — no export.
// Built by the studio server with the project's own esbuild (lib/player-build.mjs): « @coulisses-module » is the
// project's module (src/coulisses.ts: export const compositions = [{ id, component, fps, width, height,
// durationInFrames, defaultProps }]), __COMPOSITION__ / __PROPS__ the run's composition and input props.
// window.StudioPlayer is the same API as the Brambleshire preview (player/entry.tsx), so the review page works as is.
// Picking: the element under a point that carries data-coulisses="<name>" (the contract asks the project to name the
// visible parts of its motion graphics that way), else nothing.
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, PlayerRef } from '@remotion/player';
// @ts-ignore resolved through esbuild's alias
import * as M from '@coulisses-module';

declare const __COMPOSITION__: string;
declare const __PROPS__: Record<string, unknown>;
const mod: any = (M as any).compositions ? M : (M as any).coulisses ?? (M as any).default ?? {};
const comps: any[] = mod.compositions ?? [];
const comp = comps.find((c) => c.id === __COMPOSITION__);
const props = { ...(comp?.defaultProps ?? {}), ...(__PROPS__ ?? {}) };
const durationInFrames = comp ? Math.max(1, Math.round(typeof comp.durationInFrames === 'function' ? comp.durationInFrames(props) : comp.durationInFrames)) : 1;
const FPS = comp?.fps ?? 30, W = comp?.width ?? 1920, H = comp?.height ?? 1080;
const listeners = new Set<(ev: { type: string; frame: number }) => void>();
let ref: PlayerRef | null = null;
const emit = (type: string) => { const frame = ref?.getCurrentFrame() ?? 0; for (const l of listeners) l({ type, frame }); };

// the composition's (x, y) in its own pixels -> the element there; its nearest ancestor named by data-coulisses
function pick(x: number, y: number) {
  const host = document.querySelector('#stage [data-player-container], #stage') as HTMLElement | null;
  const canvas = Array.from(document.querySelectorAll('#stage div')).find((d) => (d as HTMLElement).style.width === `${W}px` && (d as HTMLElement).style.height === `${H}px`) as HTMLElement | undefined;
  const box = (canvas ?? host)?.getBoundingClientRect(); if (!box) return [];
  const cx = box.left + (x / W) * box.width, cy = box.top + (y / H) * box.height;
  const hits: any[] = [];
  for (const el of document.elementsFromPoint(cx, cy)) {
    const named = (el as HTMLElement).closest?.('[data-coulisses]') as HTMLElement | null;
    if (!named) continue;
    const label = named.dataset.coulisses ?? '';
    if (hits.some((h) => h.label === label)) continue;
    hits.push({ label, kind: named.dataset.coulissesType ?? 'élément', names: [label], textures: [], type: named.tagName.toLowerCase(), distance: hits.length, count: 1 });
  }
  return hits;
}
const settle = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 80))));

(window as any).StudioPlayer = {
  stage: null, generic: true,
  composition: __COMPOSITION__, fps: FPS, width: W, height: H, durationInFrames, ok: !!comp,
  seek: (f: number) => ref?.seekTo(Math.max(0, Math.min(durationInFrames - 1, Math.round(f)))),
  play: () => ref?.play(), pause: () => ref?.pause(), isPlaying: () => !!ref?.isPlaying(),
  frame: () => ref?.getCurrentFrame() ?? 0,
  setVolume: (v: number) => ref?.setVolume(v), mute: () => ref?.mute(), unmute: () => ref?.unmute(),
  setRate: (r: number) => { rate = r; draw(); },
  on: (fn: any) => { listeners.add(fn); return () => listeners.delete(fn); },
  pick: async (frame: number, x: number, y: number) => { if (ref && ref.getCurrentFrame() !== frame) { ref.pause(); ref.seekTo(frame); } await settle(); return pick(x, y); },
  hover: (frame: number, x: number, y: number) => (ref && ref.getCurrentFrame() === frame ? pick(x, y)[0] ?? null : undefined),
  pickMany: async (frame: number, points: [number, number][]) => {
    if (ref && ref.getCurrentFrame() !== frame) { ref.pause(); ref.seekTo(frame); }
    await settle();
    const seen = new Map<string, any>();
    for (const [x, y] of points) { const first = pick(x, y)[0]; if (!first) continue; const s = seen.get(first.label) ?? { ...first, count: 0 }; s.count++; seen.set(first.label, s); }
    return [...seen.values()].sort((a, b) => b.count - a.count);
  },
};

let rate = 1;
const App: React.FC = () => {
  const r = useRef<PlayerRef>(null);
  useEffect(() => {
    ref = r.current; if (!ref) return;
    const evs = ['play', 'pause', 'seeked', 'frameupdate', 'ended'] as const;
    const offs = evs.map((e) => { const h = () => emit(e); ref!.addEventListener(e as any, h); return () => ref?.removeEventListener(e as any, h); });
    const start = +(new URLSearchParams(location.search).get('f') ?? 0);
    if (start) ref.seekTo(start);
    emit('ready');
    return () => offs.forEach((o) => o());
  }, []);
  if (!comp) return <div style={{ color: '#fff', padding: 20, font: '14px sans-serif' }}>Composition « {__COMPOSITION__} » absente de compositions (src/coulisses.ts). Disponibles : {comps.map((c) => c.id).join(', ') || 'aucune'}</div>;
  return (
    <div id="stage" style={{ width: '100vw', height: '100vh' }}>
      <Player ref={r} component={comp.component} inputProps={props}
        durationInFrames={durationInFrames} fps={FPS} compositionWidth={W} compositionHeight={H}
        style={{ width: '100%', height: '100%' }} playbackRate={rate} clickToPlay={false} doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false} moveToBeginningWhenEnded={false} acknowledgeRemotionLicense numberOfSharedAudioTags={48} />
    </div>
  );
};
const root = createRoot(document.getElementById('root')!);
const draw = () => root.render(<App />);
draw();
