// The programs Coulisses runs that are not on every PC at the same place (code review, 08/10/2026: Chrome and Python were
// written as one creator's paths, in three files). Each is: settings.json (« chrome », « python »: the user's own
// choice), else the usual places, else the name alone (found through the PATH).
import fs from 'node:fs';
import path from 'node:path';
import { readSettings } from './i18n.mjs';

const first = (list) => list.find((f) => { try { return f && fs.existsSync(f); } catch { return false; } }) ?? null;
const setting = (k) => { try { const v = readSettings()[k]; return typeof v === 'string' && v.trim() && fs.existsSync(v.trim()) ? v.trim() : null; } catch { return null; } };

// Chrome (Remotion renders and captures with it; the user's flag: --browser-executable=<chrome.exe>), else Edge
export function chromePath() {
  const pf = process.env.ProgramFiles ?? 'C:/Program Files', pf86 = process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', local = process.env.LOCALAPPDATA ?? '';
  return setting('chrome') ?? first([
    path.join(pf, 'Google/Chrome/Application/chrome.exe'), path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'), path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
  ]) ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
}
// every browser that can be run headless, best first (the « after » capture tries them in turn)
export function browsers() {
  const pf = process.env.ProgramFiles ?? 'C:/Program Files', pf86 = process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', local = process.env.LOCALAPPDATA ?? '';
  return [...new Set([setting('chrome'), path.join(pf, 'Google/Chrome/Application/chrome.exe'), path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'), path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'), path.join(pf, 'Microsoft/Edge/Application/msedge.exe')]
    .filter((f) => { try { return f && fs.existsSync(f); } catch { return false; } }))];
}
// Python (the Theatre's two image checks of a render): settings.json, else the Python of the Codex runtime, else « python »
export function pythonPath() {
  const home = process.env.USERPROFILE ?? '';
  return setting('python') ?? first([home && path.join(home, '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')]) ?? 'python';
}
