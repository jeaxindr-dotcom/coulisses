// « Vérifier » a HyperFrames project before its export (user request, 16/10/2026, from HyperFrames Studio: « mets tout,
// check comment bien le marier à l'interface »): « hyperframes check --json » of the user's own CLI — the lint of the
// composition, its errors in headless Chrome (JS, missing assets), its layout through time (what overflows, what
// overlaps), its motion, the contrast of its texts — in one run, in the background. What it finds, for the studio's
// « Envois » card: each finding with its severity, its words, its fix, its file and line, its moment in the video.
// The last result is kept in revue/hf-check.json (with the code's version it was made on: stale once the code changes).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { hfFor, hfEnv } from './hyperframes.mjs';
import { t } from './i18n.mjs';

const SECTIONS = ['lint', 'runtime', 'layout', 'motion', 'contrast'];
const running = new Map();   // project folder -> { child, started }
const file = (P) => path.join(P.REVUE, 'hf-check.json');
const readLast = (P) => { try { return JSON.parse(fs.readFileSync(file(P), 'utf8')); } catch { return null; } };

// the findings of « check --json », flat: { sev, part, code, msg, hint, file, line, time, selector }
export function findingsOf(j, dir) {
  const out = [];
  for (const part of SECTIONS) {
    for (const f of j?.[part]?.findings ?? []) {
      const src = f.sourceFile ?? f.file ?? null;
      out.push({
        sev: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'info', part, code: f.code ?? '',
        msg: String(f.message ?? '').slice(0, 400), hint: f.fixHint ? String(f.fixHint).slice(0, 300) : null,
        file: src ? (path.isAbsolute(src) ? path.relative(dir, src) : src).split(path.sep).join('/') : null,
        line: Number.isFinite(+f.line) ? +f.line : Number.isFinite(+f.loc?.line) ? +f.loc.line : null,
        time: Number.isFinite(+f.time) ? +f.time : null, selector: f.selector ?? null,
      });
    }
  }
  const rank = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev] || (a.time ?? 0) - (b.time ?? 0));
}

// { state: 'none' | 'running' | 'done' | 'failed', … the last result }
export function hfCheckState(P) {
  const dir = P.hf?.projet; if (!dir) return { state: 'none' };
  const r = running.get(dir), last = readLast(P);
  if (r) return { ...(last ?? {}), state: 'running', started: r.started };
  return last ?? { state: 'none' };
}

// what the page polls every 3 s: the state and the counts, not the findings (GET /api/hf/check has them)
export function hfCheckLite(P) {
  const s = hfCheckState(P);
  return { state: s.state, at: s.at ?? null, started: s.started ?? null, version: s.version ?? null, errors: s.errors ?? 0, warnings: s.warnings ?? 0, total: s.total ?? 0, error: s.error ?? null };
}
// start one (never two at a time for a project); version: the code's version it is made on (the page compares it)
export function startHfCheck(P, { version = null, log = () => {} } = {}) {
  const dir = P.hf?.projet; if (!dir) throw new Error(t('hfc.notHf'));
  if (running.has(dir)) return hfCheckState(P);
  const hf = hfFor(dir); if (!hf) throw new Error(t('hf.noneShort'));
  const started = new Date().toISOString(), t0 = Date.now();
  const c = spawn(process.execPath, [hf.cli, 'check', '--json', '.'], { cwd: dir, env: hfEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  running.set(dir, { child: c, started });
  let out = '', err = '';
  c.stdout.on('data', (d) => { out += d; if (out.length > 8e6) out = out.slice(-8e6); });
  c.stderr.on('data', (d) => { err = (err + d).slice(-6000); });
  const timer = setTimeout(() => { try { c.kill(); } catch { /* */ } }, 5 * 60000);
  const end = (res) => {
    clearTimeout(timer); running.delete(dir);
    try { fs.mkdirSync(P.REVUE, { recursive: true }); fs.writeFileSync(file(P), JSON.stringify(res, null, 1)); } catch { /* read-only revue */ }
    log(res.state === 'done' ? t('hfc.done', { e: res.errors, w: res.warnings, s: Math.round(res.ms / 1000) }) : t('hfc.failed', { why: res.error }));
  };
  c.on('error', (e) => end({ state: 'failed', started, at: new Date().toISOString(), ms: Date.now() - t0, version, cli: hf.version, error: e.message }));
  c.on('close', (code) => {
    const at = new Date().toISOString(), ms = Date.now() - t0;
    let j = null; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* not JSON */ }
    if (!j) return end({ state: 'failed', started, at, ms, version, cli: hf.version, error: (err.trim().split('\n').slice(-2).join(' ') || `code ${code}`).slice(0, 400) });
    const findings = findingsOf(j, dir);
    end({ state: 'done', started, at, ms, version, cli: hf.version, passed: !!j.ok, browserSkipped: !!j.browserSkipped,
      errors: findings.filter((f) => f.sev === 'error').length, warnings: findings.filter((f) => f.sev === 'warning').length, findings: findings.slice(0, 200), total: findings.length });
  });
  return { ...(readLast(P) ?? {}), state: 'running', started };
}

// the segments of a long export already made (HF_SEGMENTED_CAPTURE: renders/.hf-segments/<plan>/segments.json): the
// next export of the same composition and settings starts from them (« hyperframes render --resume »)
export function hfSegments(P) {
  const dir = P.hf?.projet; if (!dir) return null;
  const root = path.join(dir, 'renders', '.hf-segments');
  let best = null;
  try {
    for (const h of fs.readdirSync(root)) {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(root, h, 'segments.json'), 'utf8')), st = fs.statSync(path.join(root, h, 'segments.json'));
        const done = (m.completed ?? []).length, all = Math.ceil((m.totalFrames ?? 0) / Math.max(1, m.segmentFrames ?? 1));
        if (done && (!best || st.mtimeMs > best.mtime)) best = { done, all, mtime: st.mtimeMs, frames: (m.completed ?? []).reduce((n, x) => n + (x.endFrame - x.startFrame), 0), totalFrames: m.totalFrames };
      } catch { /* not a manifest */ }
    }
  } catch { return null; }
  return best;
}
