// A mark drawn on the frame, in words, so the agent can place things (after HyperFrames' agentTargetLine: pixels of the
// 1920×1080 frame, shares of the frame, the third of the frame as a person says it). In the user's language (desc.*).
import { lang, tr } from './i18n.mjs';

const share = (v, size) => Math.round((v / size) * 100);
const third = (v, size) => Math.min(2, Math.max(0, Math.floor((v / size) * 3)));
export function area(x, y, W = 1920, H = 1080, l = lang()) {
  const T = tr(l), v = ['desc.top', 'desc.middle', 'desc.bottom'][third(y, H)], h = ['desc.left', 'desc.center', 'desc.right'][third(x, W)];
  return v === 'desc.middle' && h === 'desc.center' ? T('desc.center') : T('desc.area', { v: T(v), h: T(h) });
}
const spot = (x, y, W, H, l) => tr(l)('desc.spot', { x: Math.round(x), y: Math.round(y), sx: share(x, W), sy: share(y, H), area: area(x, y, W, H, l) });

// mark = { kind: 'pin' | 'circle', points: [[x, y]…], strokes?: [[[x, y]…]…] }
export function markWords(mark, W = 1920, H = 1080, l = lang()) {
  if (!mark?.points?.length) return null;
  const T = tr(l), size = T('desc.size', { w: W, h: H });
  if (mark.kind === 'pin' || mark.points.length === 1) return T('desc.pin', { spot: spot(...mark.points[0], W, H, l), size });
  const pts = mark.points.map(([x, y]) => [Math.min(Math.max(x, 0), W), Math.min(Math.max(y, 0), H)]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const [lf, tp, rt, bt] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round);
  const n = mark.strokes?.length ?? 1;
  return T('desc.circle', { strokes: n > 1 ? T('desc.strokes', { n }) : '', l: lf, r: rt, t: tp, b: bt, size,
    sl: share(lf, W), sr: share(rt, W), st: share(tp, H), sb: share(bt, H), spot: spot((lf + rt) / 2, (tp + bt) / 2, W, H, l) });
}

// target = what the 3D pick found under the pin / inside the drawing (live preview, ray casting)
export function targetWords(target, l = lang()) {
  if (!target?.hits?.length) return null;
  const T = tr(l);
  // names[0] = the React components that made the object (Stage › Actor[key="hazel" …]), textures = image files
  const first = target.hits.slice(0, 3).map((h) => {
    const parts = [h.names?.[0] && T('desc.component', { name: h.names[0] }), h.textures?.length && T('desc.texture', { list: h.textures.join(', ') })].filter(Boolean);
    return `${parts.join(', ') || h.type}${h.count > 1 ? T('desc.points', { n: h.count }) : ''}`;
  });
  return `${first.join(T('desc.behind'))}${T('desc.fromCode', { frame: target.frame !== undefined ? T('desc.frame', { f: target.frame }) : '' })}`;
}
