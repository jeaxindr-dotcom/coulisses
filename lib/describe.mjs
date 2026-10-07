// A mark drawn on the frame, in words, so the agent can place things (after HyperFrames' agentTargetLine: pixels of the
// 1920×1080 frame, shares of the frame, the third of the frame as a person says it).
const share = (v, size) => Math.round((v / size) * 100);
const third = (v, size) => Math.min(2, Math.max(0, Math.floor((v / size) * 3)));
export function area(x, y, W = 1920, H = 1080) {
  const a = `${['en haut', 'au milieu', 'en bas'][third(y, H)]} ${['à gauche', 'au centre', 'à droite'][third(x, W)]}`;
  return a === 'au milieu au centre' ? 'au centre' : a;
}
const spot = (x, y, W, H) => `(${Math.round(x)}, ${Math.round(y)}) [${share(x, W)} % depuis la gauche, ${share(y, H)} % depuis le haut, ${area(x, y, W, H)}]`;

// mark = { kind: 'pin' | 'circle', points: [[x, y]…], strokes?: [[[x, y]…]…] }
export function markWords(mark, W = 1920, H = 1080) {
  if (!mark?.points?.length) return null;
  const size = `en pixels de l'image ${W}×${H}`;
  if (mark.kind === 'pin' || mark.points.length === 1) return `a pointé ${spot(...mark.points[0], W, H)} ${size}`;
  const pts = mark.points.map(([x, y]) => [Math.min(Math.max(x, 0), W), Math.min(Math.max(y, 0), H)]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const [l, t, r, b] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round);
  const n = mark.strokes?.length ?? 1;
  return `a entouré${n > 1 ? ` (dessin en ${n} traits)` : ''} la zone x ${l}-${r}, y ${t}-${b} ${size} ` +
    `(x ${share(l, W)}-${share(r, W)} %, y ${share(t, H)}-${share(b, H)} % de l'image), centrée en ${spot((l + r) / 2, (t + b) / 2, W, H)}`;
}

// target = what the 3D pick found under the pin / inside the drawing (live preview, ray casting)
export function targetWords(target) {
  if (!target?.hits?.length) return null;
  // names[0] = the React components that made the object (Stage › Actor[key="hazel" …]), textures = image files
  const first = target.hits.slice(0, 3).map((h) => {
    const parts = [h.names?.[0] && `composant ${h.names[0]}`, h.textures?.length && `texture ${h.textures.join(', ')}`].filter(Boolean);
    return `${parts.join(', ') || h.type}${h.count > 1 ? ` (${h.count} points du geste)` : ''}`;
  });
  return `${first.join(' ; puis, derrière : ')} — d'après le code actuel${target.frame !== undefined ? `, image ${target.frame}` : ''}`;
}
