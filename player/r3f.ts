// 3D picking in a React Three Fiber scene, shared by the Theatre's preview (player/entry.tsx) and by any Remotion run
// that has 3D scenes (player/three-stage.ts, through player/remotion.tsx): what is under (x, y) of the W × H frame, named
// by the React components that made it, pixel-exact through the cardboard's transparency. Moved here unchanged from
// player/entry.tsx (08/10/2026), so that a 3D shot of Uchu-chan's theatre or Vidéo du monde gets the same staging.
import { _roots } from '@react-three/fiber';
import * as THREE from 'three';

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
export const fiberOf = new WeakMap<object, any>();
export function indexFibers(root: any) {
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
export function reactPath(o: THREE.Object3D) {
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
  const i = segs.findIndex((p) => !/^(Provider|h|ErrorBoundary|RemotionContextProvider|Suspense|Context|Canvas|ThreeCanvas|SequenceManager\w*|Freeze)\b/.test(p));
  return segs.slice(Math.max(0, i)).join(" › ");
}
// floating dust, motes, sparkles… are in front of everything and never what the user points at
export const NOISE = /\b(Motes?\w*|Particles?\w*|Dust\w*|Sparkles?\w*|Fireflies\w*|Pollen\w*|Shafts?\w*|ShaftMesh|GlowSprite|Streak|Stars)\b/;   // + light shafts, glows
export function describe(o: THREE.Object3D) {
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
export function seen(hit: THREE.Intersection): boolean {
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
// the R3F roots of the page (one per 3D canvas)
export const roots = () => Array.from(document.querySelectorAll('canvas')).map((c) => (_roots as any).get(c)).filter(Boolean);
export const hasScene = () => roots().some((r: any) => r?.store?.getState?.().scene);
// what is under (x, y) of the W × H frame (the Player letterboxes the frame inside #stage)
export function pick(x: number, y: number, W: number, H: number) {
  const out: any[] = [];
  for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
    const root: any = (_roots as any).get(canvas);
    const st = root?.store?.getState?.();
    if (!st?.camera || !st?.scene) continue;
    indexFibers(root);
    const box = canvas.getBoundingClientRect(), stage = document.getElementById('stage')!.getBoundingClientRect();
    // frame pixels -> this page's pixels (the Player letterboxes the frame inside the page)
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
export const meshCount = () => {
  let n = 0;
  for (const c of Array.from(document.querySelectorAll('canvas'))) (_roots as any).get(c)?.store?.getState?.().scene?.traverse((o: any) => { if (o.isMesh) n++; });
  return n;
};
export const settle = async (waitCanvas = true) => {
  for (let i = 0; i < 300 && waitCanvas && !document.querySelector('canvas'); i++) await new Promise((r) => setTimeout(r, 100));
  // every pick (a seek can mount an actor that enters later): ~0.4 s when nothing loads, up to 24 s while it does
  let last = -1, same = 0;
  for (let i = 0; i < 200 && same < 3; i++) { await new Promise((r) => setTimeout(r, 120)); const n = meshCount(); same = n === last ? same + 1 : 0; last = n; }
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
};
