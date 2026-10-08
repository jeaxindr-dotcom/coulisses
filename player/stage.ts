// « Mise en scène » (user wish since E03: « me déplacer en 3D dans la scène et déplacer moi-même les objets sans affecter
// les images clés »). In the live preview only: pick an object (pixel-exact, as the pins), move / turn / scale it with a
// gizmo or the arrow keys, look around with a free camera — and send the offset to Claude, who writes it in the code.
// Nothing here changes the engine nor the keyframes: an offset is applied ON TOP of what Stage.tsx computes, every frame,
// inside its scope (a range of frames), in the parent's space of the object (set-local for a set piece).
//   the object moved: a set flat → its mesh; a prop / float → its keyed <group> (mesh + glow); an actor → its <group>
import * as THREE from 'three';
import { addEffect, addAfterEffect } from '@react-three/fiber';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type V3 = [number, number, number];
export interface Delta { p: V3; r: V3; s: number }          // position (world units), rotation (radians), uniform scale factor
interface Edit { id: string; delta: Delta; from: number; to: number; obj: THREE.Object3D | null; base: { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 } | null; applied: { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 } | null }
interface Deps {
  roots: () => any[];                                   // the R3F roots (one per canvas)
  index: (root: any) => void;                           // map THREE objects -> their React fibers
  fiberOf: WeakMap<object, any>;
  reactPath: (o: THREE.Object3D) => string;
  describe: (o: THREE.Object3D) => { type: string; names: string[]; textures: string[] };
  seen: (hit: THREE.Intersection) => boolean;
  frame: () => number;
  noise: RegExp;
  W?: number; H?: number;                               // the frame (1920 × 1080 for an episode; a run's 3D shot: its own size)
}
export const ZERO: Delta = { p: [0, 0, 0], r: [0, 0, 0], s: 1 };
const isZero = (d: Delta) => d.p.every((v) => Math.abs(v) < 1e-6) && d.r.every((v) => Math.abs(v) < 1e-6) && Math.abs(d.s - 1) < 1e-6;

export function createStage(D: Deps) {
  const edits = new Map<string, Edit>();
  const listeners = new Set<(ev: any) => void>();
  const emit = (ev: any) => { for (const l of listeners) l(ev); };
  let on = false, st: any = null, canvas: HTMLCanvasElement | null = null;
  let tc: TransformControls | null = null, helper: THREE.Object3D | null = null, orbit: OrbitControls | null = null, box: THREE.BoxHelper | null = null;
  let selected: string | null = null, mode: 'translate' | 'rotate' | 'scale' = 'translate';
  let freeCam: { p: THREE.Vector3; q: THREE.Quaternion } | null = null, scenePose: { p: THREE.Vector3; q: THREE.Quaternion } | null = null, lastFree: THREE.Vector3 | null = null;
  let capture: ((url: string) => void) | null = null;

  const mainRoot = () => D.roots().find((r) => r?.store?.getState?.().scene) ?? null;
  // the object to move for a hit mesh: the host just below the first keyed component, or a keyed host group itself
  function movable(mesh: THREE.Object3D): THREE.Object3D | null {
    let f: any = null;
    for (let p: THREE.Object3D | null = mesh; p && !f; p = p.parent) f = D.fiberOf.get(p);
    let lastHost: any = null;
    for (; f; f = f.return) {
      if (typeof f.type === 'string') { lastHost = f; if (f.key != null && f.stateNode?.object) return f.stateNode.object; }
      else if (typeof f.type === 'function' && f.key != null) return lastHost?.stateNode?.object ?? null;
    }
    return null;
  }
  // an object id = the React path of its mesh (« Stage › Piece[key="library-4-set_ladder"] »): stable across renders
  function resolve(id: string): THREE.Object3D | null {
    const root = mainRoot(); if (!root) return null;
    D.index(root);
    let found: THREE.Object3D | null = null;
    root.store.getState().scene.traverse((o: any) => { if (!found && o.isMesh && D.reactPath(o) === id) found = movable(o); });
    return found;
  }
  const meshOf = (o: THREE.Object3D) => { let m: any = null; o.traverse((c: any) => { if (!m && c.isMesh) m = c; }); return m ?? o; };

  // ---- every frame, before R3F renders: offsets on top of the engine's transforms, the free camera ----
  addEffect(() => {
    const f = D.frame();
    for (const e of edits.values()) {
      let o = e.obj;
      if (!o || !o.parent) { o = e.obj = resolve(e.id); e.base = e.applied = null; }
      if (!o) continue;
      const a = e.applied;
      // React wrote a new transform since our last frame (or first time): it is the new base
      if (!a || !o.position.equals(a.p) || !o.rotation.equals(a.r) || !o.scale.equals(a.s) || !e.base) e.base = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
      const b = e.base, inScope = f >= e.from && f <= e.to, d = inScope ? e.delta : ZERO;
      o.position.set(b.p.x + d.p[0], b.p.y + d.p[1], b.p.z + d.p[2]);
      o.rotation.set(b.r.x + d.r[0], b.r.y + d.r[1], b.r.z + d.r[2]);
      o.scale.set(b.s.x * d.s, b.s.y * d.s, b.s.z * d.s);
      e.applied = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
    }
    const r = mainRoot(); const cam = r?.store.getState().camera as THREE.PerspectiveCamera | undefined;
    if (cam) {
      // the shot's camera, as the engine set it (anything that is not our free pose)
      if (!lastFree || !cam.position.equals(lastFree)) scenePose = { p: cam.position.clone(), q: cam.quaternion.clone() };
      const pose = capture ? scenePose : freeCam;
      if (pose) { cam.position.copy(pose.p); cam.quaternion.copy(pose.q); cam.updateMatrixWorld(); }
      lastFree = pose && !capture ? cam.position.clone() : null;
    }
    if (helper) helper.visible = !capture && !!selected;
    if (box) { box.visible = !capture && !!selected; if (selected) box.update(); }
  });
  addAfterEffect(() => {
    if (!capture || !canvas) return;
    const done = capture; capture = null;
    try { done(canvas.toDataURL('image/jpeg', 0.9)); } catch { done(''); }
  });

  function delta(e: Edit): Delta {
    const o = e.obj, b = e.base; if (!o || !b) return e.delta;
    return { p: [o.position.x - b.p.x, o.position.y - b.p.y, o.position.z - b.p.z], r: [o.rotation.x - b.r.x, o.rotation.y - b.r.y, o.rotation.z - b.r.z], s: b.s.x ? o.scale.x / b.s.x : 1 };
  }
  const info = (id: string) => {
    const e = edits.get(id), o = e?.obj ?? resolve(id);
    const d = o ? D.describe(meshOf(o)) : null, b = e?.base;
    return { id, kind: d?.type, delta: e?.delta ?? ZERO, from: e?.from, to: e?.to, base: b ? { p: [b.p.x, b.p.y, b.p.z], r: [b.r.x, b.r.y, b.r.z], s: b.s.x } : o ? { p: [o.position.x, o.position.y, o.position.z], r: [o.rotation.x, o.rotation.y, o.rotation.z], s: o.scale.x } : null };
  };
  function ensure(id: string, from = 0, to = 1e9): Edit {
    let e = edits.get(id);
    if (!e) { e = { id, delta: { ...ZERO, p: [0, 0, 0], r: [0, 0, 0] }, from, to, obj: resolve(id), base: null, applied: null }; edits.set(id, e); }
    return e;
  }
  function select(id: string | null) {
    selected = id;
    if (!tc || !st) return;
    if (!id) { tc.detach(); emit({ type: 'deselect' }); return; }
    const e = ensure(id);
    if (!e.obj) e.obj = resolve(id);
    if (!e.obj) { emit({ type: 'deselect' }); return; }
    if (!e.base) e.base = { p: e.obj.position.clone(), r: e.obj.rotation.clone(), s: e.obj.scale.clone() };
    tc.attach(e.obj);
    if (box) { st.scene.remove(box); box.dispose?.(); }
    box = new THREE.BoxHelper(e.obj, 0xc9f26b); (box.material as THREE.LineBasicMaterial).depthTest = false; box.renderOrder = 999; st.scene.add(box);
    emit({ type: 'select', ...info(id) });
  }

  // ---- edit mode: gizmo, free camera, click to choose, keys ----
  function pickAt(clientX: number, clientY: number): string | null {
    if (!st || !canvas) return null;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, st.camera);
    D.index(mainRoot());
    for (const hit of ray.intersectObjects(st.scene.children, true)) {
      if (!D.fiberOf.get(hit.object) || !D.seen(hit)) continue;          // gizmo, helpers: no React fiber
      const id = D.reactPath(hit.object);
      if (!id || D.noise.test(id) || !/\[key=/.test(id)) continue;      // floor, motes, light shafts
      if (movable(hit.object)) return id;
    }
    return null;
  }
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!down || (tc as any)?.dragging) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4; down = null;
    if (moved || (tc as any)?.axis) return;                              // an orbit, or a click on the gizmo
    select(pickAt(e.clientX, e.clientY));
  };
  const onKey = (e: KeyboardEvent) => {
    if (!on) return;
    const k = e.key.toLowerCase();
    if (k === 'w') return setMode('translate'); if (k === 'e') return setMode('rotate'); if (k === 'r' && !e.ctrlKey) return setMode('scale');
    if (e.key === 'Escape' && selected) { select(null); return; }
    if (selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      const st = e.shiftKey ? 0.25 : e.altKey ? 0.01 : 0.05, dd = edits.get(selected)!.delta;
      const ax = e.key === 'ArrowLeft' ? [-st, 0, 0] : e.key === 'ArrowRight' ? [st, 0, 0] : e.key === 'ArrowUp' ? [0, st, 0] : e.key === 'ArrowDown' ? [0, -st, 0] : e.key === 'PageUp' ? [0, 0, -st] : [0, 0, st];
      setDelta(selected, { ...dd, p: [dd.p[0] + ax[0], dd.p[1] + ax[1], dd.p[2] + ax[2]] }); return;
    }
    // anything else goes to the studio page (play, frames, tools…)
    try { (window.parent as any).dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey })); } catch { /* */ }
  };
  const onKeyUp = (e: KeyboardEvent) => { try { (window.parent as any).dispatchEvent(new KeyboardEvent('keyup', { key: e.key, code: e.code })); } catch { /* */ } };
  function setMode(m: typeof mode) { mode = m; tc?.setMode(m); emit({ type: 'mode', mode: m }); }
  function enable(want: boolean) {
    if (want === on) return on;
    const root = mainRoot();
    if (want && !root) return false;
    on = want;
    if (on) {
      st = root.store.getState(); canvas = st.gl.domElement;
      tc = new TransformControls(st.camera, canvas); tc.setSize(0.8); tc.setMode(mode);
      helper = (tc as any).getHelper ? (tc as any).getHelper() : (tc as any); st.scene.add(helper);
      // OrbitControls aims the camera at its target as soon as it is created: the shot's pose is put back at once
      const pose0 = { p: st.camera.position.clone(), q: st.camera.quaternion.clone() };
      orbit = new OrbitControls(st.camera, canvas); orbit.enableDamping = false;
      st.camera.position.copy(pose0.p); st.camera.quaternion.copy(pose0.q); st.camera.updateMatrixWorld();
      const target = new THREE.Vector3(0, 0, -1).applyQuaternion(st.camera.quaternion).multiplyScalar(8).add(st.camera.position);
      orbit.target.copy(target); orbit.enabled = false;
      orbit.addEventListener('change', () => { if (orbit!.enabled) { freeCam = { p: st.camera.position.clone(), q: st.camera.quaternion.clone() }; lastFree = st.camera.position.clone(); } });
      tc.addEventListener('dragging-changed', (ev: any) => { if (orbit) orbit.enabled = !ev.value && !!freeCam; });
      tc.addEventListener('objectChange', () => {
        const e = selected ? edits.get(selected) : null; if (!e || !e.obj || !e.base) return;
        if (mode === 'scale') {   // cardboard is never stretched: one factor, the axis moved the most
          const ks = [e.obj.scale.x / e.base.s.x, e.obj.scale.y / e.base.s.y, e.obj.scale.z / e.base.s.z].map((k) => (Number.isFinite(k) ? k : 1));
          const k = ks.reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a), 1);
          e.obj.scale.set(e.base.s.x * k, e.base.s.y * k, e.base.s.z * k);
        }
        e.delta = delta(e); e.applied = { p: e.obj.position.clone(), r: e.obj.rotation.clone(), s: e.obj.scale.clone() };
        emit({ type: 'change', ...info(e.id) });
      });
      canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp);
      canvas.style.cursor = 'crosshair'; canvas.tabIndex = 0; canvas.focus();
      // the bubbles / curtain / titles are HTML layers above the 3D canvas: in this mode only the canvas takes the mouse
      const css = document.createElement('style'); css.id = 'studio-staging'; css.textContent = '#stage * { pointer-events: none !important } #stage canvas { pointer-events: auto !important }'; document.head.appendChild(css);
    } else {
      select(null);
      tc?.detach(); if (helper && st) st.scene.remove(helper); tc?.dispose(); tc = null; helper = null;
      orbit?.dispose(); orbit = null; freeCam = null;
      if (box && st) { st.scene.remove(box); box = null; }
      canvas?.removeEventListener('pointerdown', onDown); canvas?.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp);
      if (canvas) canvas.style.cursor = '';
      document.getElementById('studio-staging')?.remove();
    }
    return on;
  }
  function setDelta(id: string, d: Delta, from?: number, to?: number) {
    const e = ensure(id);
    e.delta = { p: [...d.p] as V3, r: [...d.r] as V3, s: d.s || 1 };
    if (from !== undefined) e.from = from; if (to !== undefined) e.to = to;
    e.applied = null;   // re-apply from the base at the next frame
    if (e.obj && e.base) { e.obj.position.copy(e.base.p); e.obj.rotation.copy(e.base.r); e.obj.scale.copy(e.base.s); }
    emit({ type: 'change', ...info(id) });
  }
  function reset(id: string) {
    const e = edits.get(id); if (!e) return;
    if (e.obj && e.base) { e.obj.position.copy(e.base.p); e.obj.rotation.copy(e.base.r); e.obj.scale.copy(e.base.s); }
    edits.delete(id); if (selected === id) select(null);
  }
  return {
    enable, select, setMode, setDelta, reset,
    on: (fn: (ev: any) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    list: () => [...edits.values()].filter((e) => !isZero(e.delta)).map((e) => info(e.id)),
    info, get selected() { return selected; }, get enabled() { return on; },
    freeCamera: (want: boolean) => {
      if (!orbit || !st) return false;
      if (want) { freeCam = { p: st.camera.position.clone(), q: st.camera.quaternion.clone() }; const t = new THREE.Vector3(0, 0, -1).applyQuaternion(st.camera.quaternion).multiplyScalar(8).add(st.camera.position); orbit.target.copy(t); orbit.enabled = true; }
      else { freeCam = null; orbit.enabled = false; if (scenePose) { st.camera.position.copy(scenePose.p); st.camera.quaternion.copy(scenePose.q); } }
      return !!freeCam;
    },
    // the 3D image as the shot's camera sees it, with the offsets, without gizmo (the after image sent to Claude)
    snapshot: () => new Promise<string>((res) => { capture = res; setTimeout(() => { if (capture === res) { capture = null; res(''); } }, 3000); }),
    // where the object is on the 1920×1080 frame (its centre), to pin the note on it
    screenPos: (id: string) => {
      const e = edits.get(id), o = e?.obj ?? resolve(id), root = mainRoot(); if (!o || !root) return null;
      const cam = root.store.getState().camera as THREE.Camera, c = root.store.getState().gl.domElement as HTMLCanvasElement;
      const b = new THREE.Box3().setFromObject(o), v = b.getCenter(new THREE.Vector3());
      const saved = cam.matrixWorldInverse.clone();
      if (scenePose && freeCam) { const tmp = (cam as any).clone(); tmp.position.copy(scenePose.p); tmp.quaternion.copy(scenePose.q); tmp.updateMatrixWorld(); v.project(tmp); } else v.project(cam);
      cam.matrixWorldInverse.copy(saved);
      const FW = D.W ?? 1920, FH = D.H ?? 1080;
      const stage = document.getElementById('stage')!.getBoundingClientRect(), r = c.getBoundingClientRect(), k = Math.min(stage.width / FW, stage.height / FH);
      const px = r.left + (v.x + 1) / 2 * r.width, py = r.top + (1 - v.y) / 2 * r.height;
      return [Math.round((px - stage.left - (stage.width - FW * k) / 2) / k), Math.round((py - stage.top - (stage.height - FH * k) / 2) / k)];
    },
  };
}
