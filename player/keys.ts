// The staging mode keys inside the live preview (2D and 3D): the studio's own (shortcuts.js, Aide › Raccourcis clavier,
// the user's keys if changed) — loaded by the preview's page itself (player.html, the HyperFrames page), the studio being
// another site since the preview has its own process (player/bridge.js) — else the defaults W / E / R.
export type StageMode = 'translate' | 'rotate' | 'scale';
export function stageModeKey(e: KeyboardEvent): StageMode | null {
  const S: any = (window as any).Shortcuts ?? null;
  if (S?.is) return S.is(e, 'modeMove') ? 'translate' : S.is(e, 'modeRotate') ? 'rotate' : S.is(e, 'modeScale') ? 'scale' : null;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  const k = e.key.toLowerCase();
  return k === 'w' ? 'translate' : k === 'e' ? 'rotate' : k === 'r' ? 'scale' : null;
}
// a key typed in the preview that is the studio's (play, frames, tools…): to the studio page — as an event of its own
// when it is the same site, else by a message (player/bridge.js; page/studio/00-remote.js plays it there)
export function toParent(type: 'keydown' | 'keyup', e: KeyboardEvent) {
  const k = { key: e.key, code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey };
  if (window.parent === window) return;
  try { (window.parent as any).dispatchEvent(new KeyboardEvent(type, k)); return; } catch { /* another origin */ }
  const to = (location as any).ancestorOrigins?.[0] || (document.referrer ? new URL(document.referrer).origin : '*');
  try { window.parent.postMessage({ coulissesPreview: 1, key: { type, ...k } }, to); } catch { /* */ }
}
