// The « Médias » tab (lib/medias.mjs, lib/image-chat.mjs, medias.js), with a stand-in for Codex (tests/fake-codex.mjs):
// nothing real is touched — the libraries are in .cache\medias-test (COULISSES_MEDIAS), Codex's folder is a fake one
// (CODEX_HOME), and the user's settings.json is never read nor written (COULISSES_SETTINGS).
//   1. the library on disk: names, no overwrite, the Explorer followed (added, moved, removed by hand), the bin, sizes;
//   2. the studio's API: import -> sorted by the agent, the chat (an image, a follow-up with the last image, two images,
//      a question, a failure, a stop), placing an image (a copy for the edit, where it was used), the batch's request;
//   3. the page: the tab, the grid, the chat, an image dragged onto the video -> a pinned edit with the image.
// usage: node tests/medias.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCR = path.join(STUDIO, '.cache', 'medias-test');
fs.rmSync(SCR, { recursive: true, force: true }); fs.mkdirSync(SCR, { recursive: true });
process.env.COULISSES_LANG = 'fr';
process.env.STUDIO_PROJECTS = path.join(SCR, 'projets.json');
process.env.COULISSES_SETTINGS = path.join(SCR, 'settings.json');
process.env.COULISSES_MEDIAS = path.join(SCR, 'Médias');
process.env.CODEX_HOME = path.join(SCR, 'codex-home');
process.env.COULISSES_CODEX = path.join(STUDIO, 'tests', 'fake-codex.mjs');
fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
// Codex's own list of models, where its config's model is one the command line refuses (as gpt-6.1-sol on 08/10/2026)
fs.writeFileSync(path.join(process.env.CODEX_HOME, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'gpt-refuse' }, { slug: 'gpt-test' }, { slug: 'codex-auto-review' }] }));
fs.writeFileSync(path.join(process.env.CODEX_HOME, 'config.toml'), 'model = "gpt-refuse"\n');
const M = await import('../lib/medias.mjs');
const C = await import('../lib/image-chat.mjs');
const { lotMarkdown } = await import('../lib/lots.mjs');
const { makeFixture } = await import('./coulisses-fixture.mjs');
const { importProject } = await import('../lib/projects.mjs');
const PORT = 4189, U = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
const get = async (u) => (await fetch(U + u, { cache: 'no-store' })).json();
const post = async (u, b = {}) => (await fetch(U + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
const calls = () => { try { return fs.readFileSync(path.join(process.env.CODEX_HOME, 'fake-calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
async function until(fn, ms, what) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`délai dépassé : ${what}`); await sleep(300); } }
// a small PNG (the fake Codex makes them too) and a JPEG (ffmpeg)
const pngOf = (file, w, h) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=red@0.5:s=${w}x${h},format=rgba`, '-frames:v', '1', file]);
const jpgOf = (file, w, h) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=blue:s=${w}x${h}`, '-frames:v', '1', file]);

let studio = null, page = null;
try {
  // ---------- 1. the library on disk ----------
  console.log('la bibliothèque sur le disque');
  const L = M.library('宇宙ちゃん');
  check(L.dir === path.join(process.env.COULISSES_MEDIAS, '宇宙ちゃん') && M.library('A/B: "c"?').dir.endsWith('A-B- -c--'), `one folder per channel, its name kept (${path.basename(L.dir)}), forbidden characters replaced`);
  check(M.slug('Décor du café — Nuit !') === 'decor-du-cafe-nuit' && M.slug('宇宙ちゃん が 笑う') === '宇宙ちゃん-が-笑う', `file names: « ${M.slug('Décor du café — Nuit !')} », « ${M.slug('宇宙ちゃん が 笑う')} »`);
  const src = path.join(SCR, 'pomme.png'); pngOf(src, 120, 90);
  const a = M.addMedia(L, src, { nom: 'Pomme rouge', categorie: 'accessoires', tags: 'Fruit, rouge, fruit', source: 'chat' });
  const b = M.addMedia(L, src, { nom: 'Pomme rouge', categorie: 'accessoires' });
  check(a.fichier === 'accessoires/pomme-rouge.png' && b.fichier === 'accessoires/pomme-rouge-2.png' && fs.existsSync(src), `never overwritten: ${a.fichier}, then ${b.fichier} (the source is copied, not moved)`);
  check(a.largeur === 120 && a.hauteur === 90 && a.transparent === true && a.tags.join() === 'fruit,rouge', `what the library knows: ${a.largeur}×${a.hauteur}, transparent, tags ${a.tags.join(', ')}`);
  const jpg = path.join(SCR, 'ciel.jpg'); jpgOf(jpg, 64, 48);
  check(JSON.stringify(M.imageInfo(jpg)) === JSON.stringify({ w: 64, h: 48, alpha: false }), 'a JPEG: its size, no transparency');
  for (const d of ['LISEZMOI.txt', 'bibliotheque.json', 'personnages', 'decors', 'accessoires', 'effets', 'divers', 'a-ranger', '_coulisses']) if (!fs.existsSync(path.join(L.dir, d))) check(false, `missing ${d}`);
  check(fs.readFileSync(path.join(L.dir, 'LISEZMOI.txt'), 'utf8').includes('宇宙ちゃん'), 'the folders, the index and a LISEZMOI.txt are there');
  // the Explorer: a file added by hand, a file moved, a file removed
  fs.copyFileSync(jpg, path.join(L.dir, 'decors', 'ciel_du_soir.jpg'));
  fs.renameSync(path.join(L.dir, 'accessoires', 'pomme-rouge-2.png'), path.join(L.dir, 'divers', 'pomme-rouge-2.png'));
  let items = M.listMedias(L);
  const hand = items.find((it) => it.fichier === 'decors/ciel_du_soir.jpg'), moved = items.find((it) => it.id === b.id);
  check(hand?.categorie === 'decors' && hand.nom === 'ciel du soir' && hand.source === 'dossier', 'a file added by hand is indexed (its folder is its category)');
  check(moved?.fichier === 'divers/pomme-rouge-2.png' && moved.categorie === 'divers', 'a file moved by hand keeps its record, in its new category');
  fs.rmSync(path.join(L.dir, 'decors', 'ciel_du_soir.jpg'));
  items = M.listMedias(L);
  check(!items.some((it) => it.id === hand.id) && items.length === 2, 'a file removed by hand leaves the index');
  const up = M.updateMedia(L, a.id, { nom: 'Pomme du marché', categorie: 'personnages', tags: ['marché'] });
  check(up.fichier === 'personnages/pomme-du-marche.png' && fs.existsSync(path.join(L.dir, 'personnages', 'pomme-du-marche.png')) && up.tags.join() === 'marché', `a new name and category move the file (${up.fichier})`);
  const del = M.removeMedia(L, b.id);
  check(fs.existsSync(del.trash) && !M.listMedias(L).some((it) => it.id === b.id), 'deleting puts the image in _coulisses\\corbeille');
  const mini = await M.miniature(L, up, 64);
  check(mini.endsWith(`${up.id}.png`) && M.imageInfo(mini).w <= 64 && M.imageInfo(mini).alpha === true, 'a small copy for the grid, transparency kept');

  // ---------- 2. the studio's API ----------
  console.log('le studio');
  const file = makeFixture(), imp = importProject(file);
  studio = spawn(process.execPath, [path.join(STUDIO, 'studio-server.mjs'), '--project', imp.revue, '--no-open', '--port', String(PORT)], { cwd: STUDIO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; studio.stdout.on('data', (d) => { out += d; }); studio.stderr.on('data', (d) => { out += d; });
  await until(() => /Ouvre : http/.test(out), 40000, 'le studio démarre');
  let D = await get('/api/medias');
  check(D.channel === 'Atelier Coulisses' && D.items.length === 0 && D.available.ok && D.model === 'gpt-refuse', `the tab opens on the channel's library (${D.channel}), the workshop is available, with Codex's own model (${D.model})`);
  // an image dropped in: « à ranger », then the agent sorts it
  const imported = await (await fetch(U + '/api/medias/import', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Name': encodeURIComponent('photo du marché.jpg') }, body: fs.readFileSync(jpg) })).json();
  check(imported.ok && imported.item.categorie === 'a-ranger' && imported.sorting, `an image dropped in goes to « à ranger » (${imported.item?.fichier}), and the agent is asked to sort it`);
  D = await until(async () => { const d = await get('/api/medias'); return d.job?.state === 'done' && d.items[0]?.categorie === 'accessoires' ? d : null; }, 20000, 'rangement');
  check(D.items[0].nom === 'objet rangé 1' && D.items[0].fichier === 'accessoires/objet-range-1.jpg' && D.items[0].trie === 'agent', `sorted by the agent: « ${D.items[0].nom} », ${D.items[0].fichier}`);
  const c0 = calls().at(-1);
  const cR = calls().at(-2);
  check(cR.args[cR.args.indexOf('-m') + 1] === 'gpt-refuse' && c0.args[c0.args.indexOf('-m') + 1] === 'gpt-test' && (await get('/api/medias')).model === 'gpt-test' && /refuse le modèle gpt-refuse : nouvel essai avec gpt-test/.test(out),
    'a model Codex refuses: the same run again at once with the next one, and that one is kept');
  check(c0.images.length === 1 && c0.args.includes('--ignore-user-config') && c0.args.includes('read-only') && /Tu ranges la bibliothèque/.test(c0.prompt),
    'the sorting run: the image attached, read-only, the user config not loaded');
  // the chat: an image
  let r = await post('/api/medias/chat', { text: 'une pomme rouge en dessin animé', transparent: true });
  check(r.ok && r.job.state === 'running', 'a request starts Codex');
  check((await post('/api/medias/chat', { text: 'une autre' })).why?.includes('déjà'), 'one run at a time per library');
  D = await until(async () => { const d = await get('/api/medias'); return d.job?.state === 'done' ? d : null; }, 20000, 'image');
  const made = D.items.find((it) => it.source === 'chat'), agentMsg = D.chat.at(-1);
  check(made && made.fichier === 'accessoires/pomme-rouge.png' && made.prompt === 'une pomme rouge en dessin animé' && made.session && made.transparent === true, `the image lands in the library (${made?.fichier}), with its request and Codex's session`);
  check(agentMsg.role === 'agent' && agentMsg.images?.[0] === made.id && D.chat.at(-2).role === 'user', 'the conversation: the request, then the answer with the image');
  const c1 = calls().at(-1);
  check(/Fond transparent demandé/.test(c1.prompt) && /« Atelier Coulisses »/.test(c1.prompt) && /Essai de Coulisses/.test(c1.prompt) && /16:9/.test(c1.prompt) && c1.images.length === 0, 'the request carries the channel, the video, its format and the transparent background');
  // a follow-up: the last image goes with it
  await post('/api/medias/chat', { text: 'plus grand' });
  D = await until(async () => { const d = await get('/api/medias'); return d.job?.state === 'done' && d.chat.length >= 4 ? d : null; }, 20000, 'suite');
  const c2 = calls().at(-1), edited = D.items.find((it) => it.id === D.chat.at(-1).images?.[0]);
  check(c2.images.length === 1 && c2.images[0].endsWith('pomme-rouge.png') && /les dernières que tu as créées/.test(c2.prompt) && /une pomme rouge en dessin animé/.test(c2.prompt), 'a follow-up goes with the last image made, and the conversation so far');
  check(edited?.parent === made.id && edited.fichier === 'accessoires/pomme-rouge-2.png', `the edited image keeps a link to the one it comes from (${edited?.fichier})`);
  // images picked by the user, two images, a question
  await post('/api/medias/chat', { text: 'DEUX variantes', refs: [made.id, D.items.find((it) => it.trie === 'agent').id] });
  D = await until(async () => { const d = await get('/api/medias'); return d.job?.state === 'done' && d.chat.length >= 6 ? d : null; }, 20000, 'deux');
  const c3 = calls().at(-1);
  check(c3.images.length === 2 && /choisies par l'utilisateur/.test(c3.prompt) && D.chat.at(-1).images.length === 2 && D.chat.at(-2).refs.length === 2, 'the images picked go with the request; two images made, two in the library');
  await post('/api/medias/chat', { text: 'QUESTION : quelle taille pour un décor ?' });
  D = await until(async () => { const d = await get('/api/medias'); return d.job?.state === 'done' && d.chat.length >= 8 ? d : null; }, 20000, 'question');
  check(D.chat.at(-1).role === 'agent' && !D.chat.at(-1).images?.length && D.chat.at(-1).text === 'Une question, pas d’image.', 'a question gets an answer, no image');
  // a failure, a stop
  await post('/api/medias/chat', { text: 'ÉCHEC demandé' });
  D = await until(async () => { const d = await get('/api/medias'); return d.job?.state === 'failed' ? d : null; }, 20000, 'échec');
  check(D.chat.at(-1).role === 'error' && /Limite d'utilisation de Codex atteinte/.test(D.chat.at(-1).text), `a failure is said in the chat (« ${D.chat.at(-1).text.slice(0, 70)}… »)`);
  await post('/api/medias/chat', { text: 'LENT, très lent' });
  await until(async () => (await get('/api/medias')).job?.step, 10000, 'en cours');
  check((await get('/api/medias')).job.step === 'Je crée l’image demandée.', 'what Codex says while it works is shown');
  r = await post('/api/medias/stop', {});
  D = await until(async () => { const d = await get('/api/medias'); return d.job?.state === 'stopped' ? d : null; }, 15000, 'arrêt');
  check(r.ok && D.chat.at(-1).role === 'info', 'a run can be stopped');
  // placing an image: a copy for the edit, the library notes where it went
  r = await post('/api/medias/place', { id: made.id, frame: 120 });
  const copy = path.join(imp.revue, r.file ?? 'x');
  check(r.ok && fs.existsSync(copy) && r.media.bibliotheque.endsWith('pomme-rouge.png') && r.media.chaine === 'Atelier Coulisses', `placing: a copy goes with the edit (${r.file})`);
  D = await get('/api/medias');
  const use = D.items.find((it) => it.id === made.id).utilisations?.[0];
  check(use?.titre === 'Essai de Coulisses' && use.image === 120, 'the library notes where the image was placed');
  const md = lotMarkdown({ kind: 'remotion', target: 'x', title: 'Essai', remotionDir: SCR, remotion: { composition: 'C' }, coulisses: file, EP: SCR, REVUE: imp.revue }, { lot: 1, sentAt: new Date().toISOString(), fps: 30, size: [1920, 1080], render: null, edits: [{ k: 1, id: 'n1', frame: 120, end: null, time: 4, text: 'Placer ici', thread: [], context: null, mark: { kind: 'pin', points: [[100, 200]] }, target: null, source: 'code', images: [], captures: {}, stage: null, media: { ...r.media, file: copy } }] });
  check(md.includes('Média de la bibliothèque à placer : "pomme rouge"') && md.includes(copy) && md.includes('Copier ce fichier dans le projet'), 'the batch tells the agent which image to place, and to copy it into the project');
  const mdB = lotMarkdown({ kind: 'brambleshire', ep: 'E09', target: 'E09', title: 'Essai', remotionDir: SCR, EP: SCR, REVUE: imp.revue }, { lot: 1, sentAt: new Date().toISOString(), fps: 30, size: [1920, 1080], render: null, edits: [{ k: 1, id: 'n1', frame: 120, end: null, time: 4, text: '', thread: [], context: null, mark: null, target: null, source: 'code', images: [], captures: {}, stage: null, media: { ...r.media, file: copy } }] });
  check(mdB.includes('en faire un carton épais'), 'in the Theatre: as a thick cardboard piece, like the other props');
  r = await post('/api/medias/update', { id: made.id, nom: 'Pomme de Coulisses', categorie: 'divers' });
  check(r.ok && r.item.fichier === 'divers/pomme-de-coulisses.png', 'renaming from the page moves the file');
  const n0 = (await get('/api/medias')).items.length, victim = (await get('/api/medias')).items.at(-1);
  r = await post('/api/medias/delete', { id: victim.id });
  check(r.ok && (await get('/api/medias')).items.length === n0 - 1, 'deleting from the page');
  r = await post('/api/medias/new-chat', {});
  check(r.ok && (await get('/api/medias')).chat.length === 0 && fs.readdirSync(path.join(D.dir, '_coulisses')).some((f) => /^chat-.*\.json$/.test(f)), 'a new conversation; the old one is kept');
  const thumb = await fetch(U + `/medias/mini/${made.id}`);
  check(thumb.ok && thumb.headers.get('content-type') === 'image/png', 'the grid gets small copies');

  // ---------- 3. the page ----------
  console.log('la page');
  page = await launch({ port: 9351 });
  await page.goto(U + '/');
  await page.until(`document.querySelector('[data-tab="medias"]')`, 20000);
  await page.eval(`document.querySelector('[data-tab="medias"]').click(); return 1`);
  await page.until(`document.querySelectorAll('#mdGrid .md-it').length >= 3`, 15000);
  const tabTxt = await page.eval(`return document.querySelector('[data-tab="medias"]').textContent`);
  check(/Médias/.test(tabTxt), `the tab « ${tabTxt} »`);
  const shown = await page.eval(`return { n: document.querySelectorAll('#mdGrid .md-it').length, chips: [...document.querySelectorAll('#mdFilters button')].map((b) => b.textContent), chat: document.querySelector('#mdMsgs').textContent }`);
  check(shown.chips.some((c) => /Accessoires/.test(c)) && shown.chips.some((c) => /Divers/.test(c)) && /Décris une image/.test(shown.chat), `the grid, its categories (${shown.chips.join(' · ')}), the workshop`);
  // the chat from the page
  await page.eval(`document.querySelector('#mdText').value = 'une pomme verte'; document.querySelector('#mdSend').click(); return 1`);
  await page.until(`[...document.querySelectorAll('#mdMsgs .md-msg.agent')].some((m) => m.querySelector('.imgs .md-pic'))`, 25000);
  check(true, 'a request typed in the page: the answer comes with its image');
  await page.eval(`document.querySelector('#mdGrid .md-it').click(); return 1`);
  await page.until(`document.querySelector('#mdCard.on #mdNom')`, 8000);
  await sleep(600);
  await page.shot(path.join(SCR, 'medias-tab.png'));
  // an image dragged onto the picture of a project with live code: laid there at once in the preview (08/10/2026: « elle
  // se met automatiquement… »), the staging open on it; « Ajouter à la file » makes the pinned edit, the image attached
  const placed = await page.eval(`
    const id = document.querySelector('#mdGrid .md-it').dataset.id;
    const ov = document.querySelector('#ov') ?? document.querySelector('#viewer'), r = ov.getBoundingClientRect();
    const dt = new DataTransfer(); dt.setData('application/x-coulisses-media', id);
    document.querySelector('#viewer').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: r.left + r.width * 0.25, clientY: r.top + r.height * 0.5, bubbles: true, cancelable: true }));
    return id`);
  await page.until(`document.querySelector('#code')?.contentWindow?.StudioPlayer?.stage?.list?.().some((x) => x.cutout)`, 30000); await sleep(600);
  const cut = await page.eval(`return document.querySelector('#code').contentWindow.StudioPlayer.stage.list().find((x) => x.cutout)`);
  check(cut && Math.abs(cut.cutout.final.x - 480) < 40 && Math.abs(cut.cutout.final.y - 540) < 40 && await page.eval(`return __studio.state().staging && __studio.state().stage`) === cut.id,
    `dropped on the picture: laid there in the preview at once, chosen (centre ${cut?.cutout?.final.x?.toFixed(0)}, ${cut?.cutout?.final.y?.toFixed(0)})`);
  await page.eval(`document.querySelector('#sc-add').click(); return 1`);
  await page.until(`__studio.state().drafts === 1`, 60000); await sleep(1500);
  const notes = (await get('/api/notes')).notes ?? [];
  const pin = notes.find((n) => n.media?.id === placed);
  check(pin && pin.draft && pin.mark?.kind === 'pin' && Math.abs(pin.mark.points[0][0] - 480) < 40 && pin.media?.file?.startsWith('images/media-') && pin.stage?.cutout && /^Ajouter l'image « /.test(pin.text),
    `« Ajouter à la file »: a pinned edit at that place (${pin?.mark?.points?.[0]?.join(', ')}), with the image (${pin?.media?.file})`);
  check((await page.eval(`return document.querySelector('#nQueue').textContent`)) === '1', 'the page counts the new edit in « Modifs »');
  await page.shot(path.join(SCR, 'medias.png'));
} catch (e) {
  check(false, `erreur : ${e.stack ?? e.message}`);
} finally {
  if (page) await page.close();
  if (studio) { try { execFileSync('taskkill', ['/PID', String(studio.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
}
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
