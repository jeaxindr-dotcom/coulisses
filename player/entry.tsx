// Live preview of the CURRENT code of an episode (user choice: « aperçu vivant à côté du MP4 ») — no re-render.
// Built by the studio server with esbuild (lib/player-build.mjs) into one script per episode, loaded in an iframe
// (player.html) so that a rebuild after a code change is a clean reload. Every import resolves from the Remotion
// project (06_Remotion/node_modules): same React, same Remotion, same three as the renders.
// window.StudioPlayer is the iframe's API, used by the review page: seek / play / pause / frame events / pick (the
// 3D object under a point, by ray casting in the React Three Fiber scene — `_roots` is R3F's own registry of canvases).
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, PlayerRef } from '@remotion/player';
import { _roots } from '@react-three/fiber';
import * as THREE from 'three';
import { createStage } from './stage';
// @ts-ignore resolved through esbuild's alias "@episode-src" -> 06_Remotion/src
import { Episode } from '@episode-src/Episode';
// @ts-ignore
import { EPISODES } from '@episode-src/episodes/registry';

declare const __EPISODE__: string;
const FPS = 30, W = 1920, H = 1080;
const entry = (EPISODES as any[]).find((e) => e.id === __EPISODE__);
const tl = entry ? entry.build() : null;
const durationInFrames = tl ? Math.ceil(tl.duration * FPS) : 1;
const listeners = new Set<(ev: { type: string; frame: number }) => void>();
let ref: PlayerRef | null = null;
const emit = (type: string) => { const frame = ref?.getCurrentFrame() ?? 0; for (const l of listeners) l({ type, frame }); };

// ---- 3D picking: what is under (x, y) of the 1920×1080 frame ----
const texName = (tex: any): string | null => {
  const img = tex?.source?.data ?? tex?.image;
  const src: string | undefined = img?.currentSrc || img?.src;
  if (!src) return null;
  try { return decodeURIComponent(new URL(src, location.href).pathname).replace(/^\/public\//, ''); } catch { return src; }
};
// Characters and many props have textures made in memory (CanvasTexture / DataTexture: no file name). What names them
// is the React tree that made them: R3F keeps, for each canvas, the reconciler root; each host fiber's stateNode is the
// R3F instance of a THREE object. Walking up from that fiber gives the components and their keys / identifying props
// (e.g. Stage › Actor key="beatrice" › CardboardCharacter) — nothing to change in the Remotion code.
const fiberOf = new WeakMap<object, any>();
function indexFibers(root: any) {
  const top = root?.fiber?.current ?? root?.fiber?.containerInfo?.current ?? root?.container?.current;
  const stack = top ? [top] : [];
  while (stack.length) {
    const f = stack.pop();
    const obj = f.stateNode?.object;
    if (obj && typeof obj === 'object') fiberOf.set(obj, f);
    if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
}
const ID_PROPS = ['id', 'name', 'character', 'actor', 'who', 'prop', 'src', 'kind', 'set', 'label'];
function reactPath(o: THREE.Object3D) {
  let f: any = null;
  for (let p: THREE.Object3D | null = o; p && !f; p = p.parent) f = fiberOf.get(p);
  const parts: { name: string; bits: string[]; key: boolean }[] = [];
  for (; f && parts.length < 8; f = f.return) {
    if (typeof f.type !== 'function') {
      // a host element with a key (<group key={prop.id}>) names the component under it when that one has none
      const last = parts[0];
      if (f.key != null && last && !last.key) { last.bits.unshift(`key="${f.key}"`); last.key = true; }
      continue;
    }
    const name = f.type.displayName || f.type.name; if (!name) continue;
    const props = f.memoizedProps ?? {}, bits: string[] = [];
    if (f.key != null) bits.push(`key="${f.key}"`);
    for (const k of ID_PROPS) { const v = props[k]; if (typeof v === 'string' && v.length < 60) bits.push(`${k}="${v}"`); }
    parts.unshift({ name, bits, key: f.key != null });
  }
  const segs = parts.map((p) => (p.bits.length ? `${p.name}[${p.bits.join(' ')}]` : p.name));
  // Remotion / React wrappers above the episode's own components say nothing: keep from Stage (or the cut-away) on
  const i = segs.findIndex((p) => !/^(Provider|h|ErrorBoundary|RemotionContextProvider|Suspense|Context|Canvas|ThreeCanvas|SequenceManager|Freeze)\b/.test(p));
  return segs.slice(Math.max(0, i)).join(" › ");
}
// floating dust, motes, sparkles… are in front of everything and never what the user points at
const NOISE = /\b(Motes?\w*|Particles?\w*|Dust\w*|Sparkles?\w*|Fireflies\w*|Pollen\w*|Shafts?\w*|ShaftMesh|GlowSprite|Streak|Stars)\b/;   // + light shafts, glows
function describe(o: THREE.Object3D) {
  const names: string[] = [];
  const react = reactPath(o);
  if (react) names.push(react);
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name) names.push(p.name);
  const textures = new Set<string>();
  const mats = ([] as any[]).concat((o as any).material ?? []);
  for (const m of mats) {
    for (const k of ['map', 'alphaMap', 'emissiveMap']) { const n = texName(m?.[k]); if (n) textures.add(n); }
    for (const u of Object.values(m?.uniforms ?? {}) as any[]) { const n = u?.value?.isTexture ? texName(u.value) : null; if (n) textures.add(n); }
  }
  return { type: o.type, names, textures: [...textures] };
}
// Pixel-exact: a cardboard piece is a quad (or a cut-out with a margin) whose texture is transparent around the drawing,
// and the renderer drops those pixels (alphaTest). The ray does the same: at the hit's UV it reads the texture's alpha
// and goes on through a transparent pixel, so pointing at the ladder behind a character's hat finds the ladder.
const px1 = document.createElement('canvas'); px1.width = px1.height = 1;
const g1 = px1.getContext('2d', { willReadFrequently: true })!;
function texOf(m: any): any {
  if (m?.map?.isTexture) return m.map;
  for (const u of Object.values(m?.uniforms ?? {}) as any[]) if (u?.value?.isTexture) return u.value;
  return null;
}
function alphaAt(tex: any, uv: THREE.Vector2): number | null {
  const img = tex?.image ?? tex?.source?.data; if (!img) return null;
  const u = uv.clone(); tex.transformUv(u);   // offset / repeat / wrap / flipY -> image space (row 0 = first row)
  const w = img.width || img.naturalWidth || img.videoWidth, h = img.height || img.naturalHeight || img.videoHeight;
  if (!w || !h) return null;
  const x = Math.min(w - 1, Math.max(0, Math.floor(u.x * w))), y = Math.min(h - 1, Math.max(0, Math.floor(u.y * h)));
  if (img.data && img.data.length >= w * h * 4) return img.data[(y * w + x) * 4 + 3] / (img.data instanceof Float32Array ? 1 : 255);   // DataTexture RGBA
  try { g1.clearRect(0, 0, 1, 1); g1.drawImage(img, x, y, 1, 1, 0, 0, 1, 1); return g1.getImageData(0, 0, 1, 1).data[3] / 255; } catch { return null; }
}
function seen(hit: THREE.Intersection): boolean {
  const o: any = hit.object;
  for (let p: any = o; p; p = p.parent) if (p.visible === false) return false;   // a hidden parent hides the object
  if (o.isPoints || o.isLine || o.isSprite) return false;
  const mat = Array.isArray(o.material) ? o.material[hit.face?.materialIndex ?? 0] : o.material;
  if (!mat || mat.visible === false || (mat.transparent && mat.opacity < 0.05)) return false;
  const tex = texOf(mat);
  if (tex && hit.uv) {
    const a = alphaAt(tex, hit.uv);
    const cut = mat.alphaTest > 0 ? mat.alphaTest : (mat.transparent ? 0.1 : 0);
    if (a !== null && cut > 0 && a < cut) return false;
  }
  return true;
}
function pick(x: number, y: number) {
  const out: any[] = [];
  for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
    const root: any = (_roots as any).get(canvas);
    const st = root?.store?.getState?.();
    if (!st?.camera || !st?.scene) continue;
    indexFibers(root);
    const box = canvas.getBoundingClientRect(), stage = document.getElementById('stage')!.getBoundingClientRect();
    // frame pixels -> this page's pixels (the Player letterboxes the 16:9 frame inside the page)
    const k = Math.min(stage.width / W, stage.height / H);
    const px = stage.left + (stage.width - W * k) / 2 + (x + 0.5) * k, py = stage.top + (stage.height - H * k) / 2 + (y + 0.5) * k;
    if (px < box.left || px > box.right || py < box.top || py > box.bottom) continue;
    const ndc = new THREE.Vector2(((px - box.left) / box.width) * 2 - 1, -((py - box.top) / box.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, st.camera);
    for (const hit of ray.intersectObjects(st.scene.children, true)) {
      if (!seen(hit)) continue;
      const d = describe(hit.object);
      if (NOISE.test(d.names[0] ?? '')) continue;
      if (!d.textures.length && !d.names.length) continue;   // floor, invisible helpers… keep only what names itself
      if (out.length && out[out.length - 1].names[0] === d.names[0]) continue;   // the same card's back face
      out.push({ distance: +hit.distance.toFixed(3), ...d });
      if (out.length >= 4) break;
    }
  }
  return out;
}
// after a seek: two animation frames; on the first pick, also wait for the 3D scene (the episode's textures load first)
// the characters load after the set (each its own delayRender): wait until the number of meshes stops changing
const meshCount = () => {
  let n = 0;
  for (const c of Array.from(document.querySelectorAll('canvas'))) (_roots as any).get(c)?.store?.getState?.().scene?.traverse((o: any) => { if (o.isMesh) n++; });
  return n;
};
const settle = async () => {
  for (let i = 0; i < 300 && !document.querySelector('canvas'); i++) await new Promise((r) => setTimeout(r, 100));
  // every pick (a seek can mount an actor that enters later): ~0.4 s when nothing loads, up to 24 s while it does
  let last = -1, same = 0;
  for (let i = 0; i < 200 && same < 3; i++) { await new Promise((r) => setTimeout(r, 120)); const n = meshCount(); same = n === last ? same + 1 : 0; last = n; }
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
};

// « Mise en scène »: move objects in the preview, the offsets go to Claude (player/stage.ts)
const stage = createStage({
  roots: () => Array.from(document.querySelectorAll('canvas')).map((c) => (_roots as any).get(c)).filter(Boolean),
  index: indexFibers, fiberOf, reactPath, describe, seen, noise: NOISE,
  frame: () => ref?.getCurrentFrame() ?? 0,
});
(window as any).StudioPlayer = {
  stage,
  episode: __EPISODE__, fps: FPS, width: W, height: H, durationInFrames, ok: !!entry,
  seek: (f: number) => ref?.seekTo(Math.max(0, Math.min(durationInFrames - 1, Math.round(f)))),
  play: () => ref?.play(), pause: () => ref?.pause(), isPlaying: () => !!ref?.isPlaying(),
  frame: () => ref?.getCurrentFrame() ?? 0,
  setVolume: (v: number) => ref?.setVolume(v), mute: () => ref?.mute(), unmute: () => ref?.unmute(),
  setRate: (r: number) => { rate = r; draw(); },
  on: (fn: any) => { listeners.add(fn); return () => listeners.delete(fn); },
  pick: async (frame: number, x: number, y: number) => {
    if (ref && ref.getCurrentFrame() !== frame) { ref.pause(); ref.seekTo(frame); }
    await settle();
    return pick(x, y);
  },
  hover: (frame: number, x: number, y: number) => (ref && ref.getCurrentFrame() === frame ? pick(x, y)[0] ?? null : undefined),
  // several points of one gesture (a pin = 1 point; a drawing = a grid inside it): what is hit most, nearest first
  pickMany: async (frame: number, points: [number, number][]) => {
    if (ref && ref.getCurrentFrame() !== frame) { ref.pause(); ref.seekTo(frame); }
    await settle();
    const seen = new Map<string, any>();
    for (const [x, y] of points) {
      const first = pick(x, y)[0]; if (!first) continue;
      const key = first.textures[0] ?? first.names[0] ?? first.type;
      const s = seen.get(key) ?? { ...first, count: 0 };
      s.count++; s.distance = Math.min(s.distance, first.distance); seen.set(key, s);
    }
    return [...seen.values()].sort((a, b) => b.count - a.count || a.distance - b.distance);
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
  if (!entry) return <div style={{ color: '#fff', padding: 20 }}>Épisode {__EPISODE__} introuvable dans src/episodes/registry.ts</div>;
  return (
    <div id="stage" style={{ width: '100vw', height: '100vh' }}>
      <Player ref={r} component={Episode} inputProps={{ tl, assets: entry.assets, scale: entry.scale }}
        durationInFrames={durationInFrames} fps={FPS} compositionWidth={W} compositionHeight={H}
        style={{ width: '100%', height: '100%' }} playbackRate={rate} clickToPlay={false} doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false} moveToBeginningWhenEnded={false} acknowledgeRemotionLicense
        numberOfSharedAudioTags={48} /* an episode stacks music, voices and sound effects: the default 5 is not enough */ />
    </div>
  );
};
const root = createRoot(document.getElementById('root')!);
const draw = () => root.render(<App />);
draw();
