// A stand-in for `codex exec` (COULISSES_CODEX, tests/medias.mjs): the same command line, the request on stdin, the same
// JSON events on stdout, the answer in the -o file, and the images in $CODEX_HOME\generated_images\<thread>\ — made here
// (small PNGs), so the tests never use the user's Codex account. What it does depends on the request:
//   « ÉCHEC »  -> a turn.failed event (a usage limit), exit 1         « LENT » -> waits 30 s (to be stopped)
//   -m gpt-refuse -> the model is refused, as Codex does for a model the account cannot use from the command line
//   « DEUX »   -> two images                                          « QUESTION » -> an answer with no image
// Every call is noted in $CODEX_HOME\fake-calls.jsonl (args, request, attached images) for the tests to read.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const images = args.flatMap((a, i) => (a === '-i' ? [args[i + 1]] : []));
const HOME = process.env.CODEX_HOME;
const out = (e) => process.stdout.write(JSON.stringify(e) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a w×h RGBA PNG: a disc of one colour on a transparent background
function png(file, w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 4 + 1) + 1 + x * 4, inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (Math.min(w, h) * 0.4) ** 2;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = inside ? 255 : 0;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

let prompt = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) prompt += c;
const schema = JSON.parse(fs.readFileSync(opt('--output-schema'), 'utf8'));
const ask = /(?:Demande de l'utilisateur|The user's request)[^:]*: ?"(.*)"\s*$/m.exec(prompt)?.[1] ?? '';
fs.appendFileSync(path.join(HOME, 'fake-calls.jsonl'), JSON.stringify({ args, images, ask, prompt, at: new Date().toISOString() }) + '\n');
const thread = crypto.randomUUID();
out({ type: 'thread.started', thread_id: thread });
out({ type: 'turn.started' });
out({ type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Skill descriptions were shortened to fit the skills context budget.' } });

const fail = (message) => { const m = JSON.stringify({ type: 'error', status: 400, error: { type: 'invalid_request_error', message } }); out({ type: 'error', message: m }); out({ type: 'turn.failed', error: { message: m } }); process.exit(1); };
if (opt('-m') === 'gpt-refuse') fail("The 'gpt-refuse' model is not supported when using Codex with a ChatGPT account.");
if (/ÉCHEC/.test(ask)) fail("You've hit your usage limit. Try again later.");
let answer;
if (schema.properties.images.items.required.includes('index')) {   // sorting the library: one entry per attached image
  out({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'Je regarde les images.' } });
  await sleep(300);
  answer = { images: images.map((f, i) => ({ index: i + 1, nom: `objet rangé ${i + 1}`, categorie: 'accessoires', tags: ['essai', 'rangé'], description: `Une image rangée (${path.basename(f)}).`, transparent: true })) };
} else {
  out({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'Je crée l’image demandée.' } });
  if (/LENT/.test(ask)) await sleep(30000);
  await sleep(400);
  const n = /QUESTION/.test(ask) ? 0 : /DEUX/.test(ask) ? 2 : 1, made = [];
  for (let k = 0; k < n; k++) {
    const f = path.join(HOME, 'generated_images', thread, `exec-${crypto.randomUUID()}.png`);
    png(f, 96 + k * 16, 80, k ? [80, 120, 240] : [230, 60, 60]);
    made.push(f);
  }
  const edit = images.length && /plus grand|bigger/i.test(ask) ? 1 : 0;
  answer = { message: n ? `Voici ${n === 1 ? 'l’image' : 'les images'}.` : 'Une question, pas d’image.', images: made.map((f, k) => ({ fichier: f, nom: k ? 'pomme bleue' : 'pomme rouge', categorie: 'accessoires',
    tags: ['pomme', 'fruit'], description: 'Une pomme sur fond transparent.', transparent: true, retouche_de: edit })) };
}
fs.writeFileSync(opt('-o'), JSON.stringify(answer));
out({ type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: JSON.stringify(answer) } });
out({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } });
