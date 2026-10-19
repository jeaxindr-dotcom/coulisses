// The sound never lost for good (user report 19/10/2026: « quand il y a des lags, le son se désactive, et impossible à
// réactiver sans F5 »), on the SANDBOX's E03 (nothing real is touched; the test's Chrome is silent: tests/cdp.mjs):
//   1. « Code actuel » playing, the sound device refusing to start for a few seconds (AudioContext.resume() rejected, as
//      Chrome does when the device fails while the PC lags): Remotion's Player mutes itself — and the sound comes back by
//      itself once the device answers again (player/sound.ts), said on the page; pause / play keep it;
//   2. « Rétablir le son » (the speaker under the image): the preview unmuted whatever happened; the MP4 unmuted, at the
//      volume of the slider, loaded again where it was and playing if it was; the volume slider moved unmutes too.
// usage: start `node studio-server.mjs E03 --no-open --episodes <sandbox>\07_Episodes --port 4174`, then
//        node tests/sound-recovery.mjs   (or tests/run-all.mjs, which starts it)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, requireFrench, requireSandbox } from './cdp.mjs';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = process.env.STUDIO_SANDBOX ?? path.join(STUDIO, 'sandbox', '07_Episodes');
const PORT = +(process.env.STUDIO_PORT ?? 4174);
const URL = `http://127.0.0.1:${PORT}/`;   // (as in the app: the preview in a process of its own)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (+(process.env.COULISSES_TEST_SLOW ?? 1) || 1)));
let ok = 0, ko = 0;
const check = (c, w) => { c ? ok++ : ko++; console.log(`  ${c ? '✓' : '✗'} ${w}`); };
await requireFrench(URL); await requireSandbox(URL, SANDBOX);   // (never a real episode's studio: 19/10/2026, E12 was on 4174)
const p = await launch();
// the preview's sound now: its Player muted or not, its AudioContexts' states, its sound tags playing (in 1 s)
const codeSound = async () => {
  const proto = await p.frameSend('player.html', 'Runtime.evaluate', { expression: 'AudioContext.prototype' });
  let ctx = [];
  if (proto?.result?.objectId) {
    const q = await p.frameSend('player.html', 'Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
    ctx = (await p.frameSend('player.html', 'Runtime.callFunctionOn', { objectId: q.objects.objectId, functionDeclaration: 'function () { return this.map((c) => c.state); }', returnByValue: true }))?.result?.value ?? [];
  }
  const f = await p.frameEval('player.html', `const P = window.StudioPlayer, au = [...document.querySelectorAll('audio')], t0 = au.map((a) => a.currentTime);
    await new Promise((r) => setTimeout(r, 1000));
    return { muted: P.isMuted(), playing: P.isPlaying(), sounding: au.filter((a, i) => !a.paused && !a.muted && a.currentTime > t0[i] + 0.2).length }`);
  return { ...f, ctx };
};
const saveText = () => p.eval(`return document.querySelector('#save').textContent`);
const play = () => p.eval(`document.querySelector('#bPlay').click(); return 1`);
try {
  await p.goto(`${URL}#f=900`);
  await p.until(`window.__studio && document.querySelector('#v').readyState >= 2`, 120000); await sleep(1000);

  // ---------- 1. the device refusing, then back ----------
  console.log('l\'aperçu : la carte son refuse, puis répond');
  await p.eval(`document.querySelector('#srcCode').click(); return 1`);
  await p.until(`__studio.state().mode === 'code'`, 180000); await sleep(3000);
  await play(); await sleep(2500);
  const s0 = await codeSound();
  check(!s0.muted && s0.playing && s0.sounding > 0 && s0.ctx.includes('running'), `playing, with its sound (${JSON.stringify(s0)})`);
  await p.frameEval('player.html', `window.__res0 = AudioContext.prototype.resume; AudioContext.prototype.resume = function () { return Promise.reject(new DOMException('device', 'InvalidStateError')); }; return 1`);
  await play(); await sleep(400); await play();   // (a pause, a play: the Player starts its sound again — refused)
  let lostSeen = false, mutedSeen = false;
  for (let i = 0; i < 12; i++) {   // 6 s of a device that refuses
    await sleep(500);
    if (/coupé/.test(await saveText())) lostSeen = true;
    if (await p.frameEval('player.html', 'return window.StudioPlayer.isMuted()')) mutedSeen = true;
  }
  check(mutedSeen && lostSeen, `the device refusing: Remotion mutes its Player (${mutedSeen}), the page says it (${lostSeen})`);
  await p.frameEval('player.html', `AudioContext.prototype.resume = window.__res0; return 1`);
  let back = null;
  for (let i = 0; i < 30 && !back; i++) { await sleep(500); const s = await codeSound(); if (!s.muted && s.ctx.includes('running') && s.sounding > 0) back = { ...s, after: (i + 1) * 0.5 }; }
  check(!!back && back.after <= 12, `the device answering again: the sound back by itself, without F5 (${back ? `${back.after} s` : 'never'})`);
  let msg = '';   // (said once it holds 3 s: player/sound.ts)
  for (let i = 0; i < 16 && !/rétabli/.test(msg); i++) { await sleep(500); msg = await saveText(); }
  check(/rétabli/.test(msg), `… said once it holds (« ${msg} »)`);
  await play(); await sleep(600); await play(); await sleep(1500);
  const s1 = await codeSound();
  check(!s1.muted && s1.sounding > 0 && s1.ctx.includes('running'), `pause, play: still with its sound (${JSON.stringify(s1)})`);

  // ---------- 2. « Rétablir le son » ----------
  console.log('« Rétablir le son »');
  await p.frameEval('player.html', `window.StudioPlayer.mute(); return 1`); await sleep(2500);   // (a mute asked: left as it is…)
  const kept = await p.frameEval('player.html', 'return window.StudioPlayer.isMuted()');
  await p.eval(`document.querySelector('#bSound').click(); return 1`); await sleep(1500);
  const s2 = await codeSound();
  check(kept && !s2.muted && s2.sounding > 0, `the preview muted (kept ${kept}): the speaker gives its sound back (${JSON.stringify(s2)})`);
  await p.frameEval('player.html', `window.StudioPlayer.mute(); return 1`); await sleep(500);
  await p.eval(`const r = document.querySelector('#vol'); r.value = '0.6'; r.dispatchEvent(new Event('input')); return 1`); await sleep(800);
  check(!(await p.frameEval('player.html', 'return window.StudioPlayer.isMuted()')), 'the volume slider moved: unmuted too');
  await play(); await sleep(300);
  await p.eval(`document.querySelector('#srcVideo').click(); return 1`); await sleep(1500);
  await play(); await sleep(1500);
  await p.eval(`const v = document.querySelector('#v'); v.muted = true; v.volume = 0.1; return 1`);
  const t0 = await p.eval(`return document.querySelector('#v').currentTime`);
  await p.eval(`document.querySelector('#bSound').click(); return 1`); await sleep(2500);
  const v = await p.eval(`const v = document.querySelector('#v'), a0 = v.webkitAudioDecodedByteCount; await new Promise((r) => setTimeout(r, 800)); return { muted: v.muted, volume: v.volume, paused: v.paused, t: v.currentTime, audio: v.webkitAudioDecodedByteCount - a0 }`);
  check(!v.muted && Math.abs(v.volume - 0.6) < 0.01 && !v.paused && v.t >= t0 && v.t - t0 < 6 && v.audio > 0, `the MP4: unmuted, at the slider's volume, loaded again where it was and still playing (${JSON.stringify(v)} from ${t0.toFixed(2)} s)`);
  await play();
} catch (e) { ko++; console.log('  ✗ ERREUR', e.stack); } finally { await p.close(); }
console.log(`\n${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
