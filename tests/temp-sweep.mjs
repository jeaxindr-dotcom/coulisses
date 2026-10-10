// The temp folders that renders leave behind (09/10/2026: 5,300 Remotion folders, 1.2 TB, the disk full): lib/frames.mjs
// removes a stale one (untouched for 3 hours), never one in use (a file open in it) nor a recent one, never one holding
// a link, and only Remotion's and Chrome's own names.
// usage: node tests/temp-sweep.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sweepStaleTemp } from '../lib/frames.mjs';
let ok = 0, ko = 0; const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const TMP = os.tmpdir(), tag = `coulissestest${process.pid}`;
const mk = (name, { hours = 5, file = true } = {}) => {
  const d = path.join(TMP, name); fs.mkdirSync(path.join(d, 'remotion-assets-dir'), { recursive: true });
  if (file) fs.writeFileSync(path.join(d, 'remotion-assets-dir', 'video.mp4'), Buffer.alloc(1024));
  const t = (Date.now() - hours * 3600e3) / 1000;
  fs.utimesSync(path.join(d, 'remotion-assets-dir'), t, t); fs.utimesSync(d, t, t);
  return d;
};
const stale = mk(`remotion-v9.9.9-assets${tag}a`), fresh = mk(`remotion-v9.9.9-assets${tag}b`, { hours: 1 }), inUse = mk(`remotion-v9.9.9-assets${tag}c`);
const profile = mk(`puppeteer_dev_chrome_profile-${tag}`), other = mk(`someone-else-${tag}`);
const linked = mk(`remotion-v9.9.9-assets${tag}d`); fs.symlinkSync(path.join(TMP), path.join(linked, 'link'), 'junction');
const t = (Date.now() - 5 * 3600e3) / 1000; fs.utimesSync(linked, t, t);
const fd = fs.openSync(path.join(inUse, 'remotion-assets-dir', 'video.mp4'), 'r');   // a render still reading it
const stamp = path.join(TMP, `${tag}-stamp.txt`);
try {
  const n = sweepStaleTemp(stamp, { force: true });
  check(!fs.existsSync(stale), 'a Remotion folder untouched for 5 hours: removed');
  check(!fs.existsSync(profile), 'a Chrome profile untouched for 5 hours (its Chrome gone): removed');
  check(fs.existsSync(fresh), 'a folder touched an hour ago: kept');
  check(fs.existsSync(inUse) && fs.existsSync(path.join(inUse, 'remotion-assets-dir', 'video.mp4')), 'a folder with a file still open (a running render): kept, whole');
  check(fs.existsSync(linked) && fs.existsSync(TMP), 'a folder holding a junction: kept (never deleted through a link)');
  check(fs.existsSync(other), 'a folder of another name: never touched');
  check(n >= 2, `${n} removed`);
  check(sweepStaleTemp(stamp) === 0, 'at most once an hour (the stamp)');
} finally {
  fs.closeSync(fd);
  try { fs.unlinkSync(path.join(linked, 'link')); } catch { /* */ }
  for (const d of [stale, fresh, inUse, profile, other, linked]) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(stamp, { force: true });
}
console.log(`\n${ok} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
