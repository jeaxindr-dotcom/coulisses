// Before a test runs on the SANDBOX: what the previous runs of the same test left behind is removed, and nothing else
// (07/10/2026: seven « Le portail : plus de lumière » circles at frame 1200 caught the clicks of the next e2e run, and an
// open batch of an interrupted run woke the `wait` of e2e-agent at once). The sandbox also holds the user's own trials:
// only notes whose text is EXACTLY one the test types are touched (a string), or starts the way a test's generated note
// does (a RegExp, e.g. the staging test's « Mise en scène : ladder (décor) — … »), through the page's API.
import fs from 'node:fs';
import path from 'node:path';
const isTest = (texts, t) => texts.some((x) => (x instanceof RegExp ? x.test(t ?? '') : x === t));

// the test's own notes, out of the list (the studio of the sandbox must be running on `port`)
export async function removeTestNotes(port, texts) {
  const u = `http://localhost:${port}/api/notes`;
  const nb = await (await fetch(u)).json();
  const keep = nb.notes.filter((n) => !isTest(texts, n.text));
  if (keep.length === nb.notes.length) return 0;
  const n = nb.notes.length - keep.length;
  nb.notes = keep;
  await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nb) });
  return n;
}

// the test's own batches still open (every edit is one of its texts): closed, as the agent would (take + done)
export function closeTestLots(revue, cli, texts) {
  const dir = path.join(revue, 'lots');
  if (!fs.existsSync(dir)) return 0;
  let replies = {}; try { replies = JSON.parse(fs.readFileSync(path.join(revue, 'replies.json'), 'utf8')); } catch { /* none */ }
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{3}\.json$/.test(x))) {
    let L; try { L = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    const st = replies.lots?.[L.lot]?.status;
    if (L.kind === 'render' || (st && st !== 'open' && st !== 'taken')) continue;
    if (!L.edits?.length || !L.edits.every((e) => isTest(texts, e.text))) continue;
    try { if (!st || st === 'open') cli('take', String(L.lot)); cli('done', String(L.lot), 'nettoyage avant un nouveau test'); n++; } catch { /* already closed */ }
  }
  return n;
}
