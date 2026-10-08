// The user's own keyboard shortcuts (Aide › Raccourcis clavier, shortcuts.js): the keys they changed, for the whole app
// (the home screen and every studio), in settings.json « shortcuts »: { actionId: ['Ctrl+K', …] }. Only the changed
// actions are kept; the list of actions and their default keys live in shortcuts.js.
import { readSettings, writeSettings } from './i18n.mjs';

const ID = /^[A-Za-z][A-Za-z0-9]{1,39}$/;
const KEY = /^((Ctrl|Alt|Shift)\+){0,3}[^\s+]{1,20}$/;
export function cleanShortcuts(o) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const [id, ks] of Object.entries(o).slice(0, 200)) {
    if (!ID.test(id) || !Array.isArray(ks)) continue;
    out[id] = [...new Set(ks.filter((k) => typeof k === 'string' && KEY.test(k)))].slice(0, 4);
  }
  return out;
}
export const getShortcuts = () => cleanShortcuts(readSettings().shortcuts);
export function setShortcuts(o) {
  const s = cleanShortcuts(o);
  writeSettings({ shortcuts: s });
  return s;
}
