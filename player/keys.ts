// The staging mode keys inside the live preview (2D and 3D): the studio's own (shortcuts.js, Aide › Raccourcis clavier,
// the user's keys if changed) when the preview is in a studio, else the defaults W / E / R.
export type StageMode = 'translate' | 'rotate' | 'scale';
export function stageModeKey(e: KeyboardEvent): StageMode | null {
  try {
    const S = window.parent !== window ? (window.parent as any).Shortcuts : null;
    if (S?.is) return S.is(e, 'modeMove') ? 'translate' : S.is(e, 'modeRotate') ? 'rotate' : S.is(e, 'modeScale') ? 'scale' : null;
  } catch { /* another origin: the defaults */ }
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  const k = e.key.toLowerCase();
  return k === 'w' ? 'translate' : k === 'e' ? 'rotate' : k === 'r' ? 'scale' : null;
}
