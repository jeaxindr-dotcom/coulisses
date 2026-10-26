// The sound never lost for good (user report 19/10/2026: « quand il y a des lags, le son se désactive, et impossible à
// réactiver sans F5 »), on the SANDBOX's E03 (nothing real is touched; the test's Chrome is silent: tests/cdp.mjs):
//   1. « Code actuel » playing, the sound device refusing to start for a few seconds (AudioContext.resume() rejected, as
//      Chrome does when the device fails while the PC lags): Remotion's Player mutes itself — and the sound comes back by
//      itself once the device answers again (player/sound.ts), said on the page; pause / play keep it;
//   2. « Rétablir le son » (the speaker under the image): the preview made again (a new frame, a new sound: what F5
//      did — user report 22/10/2026), à la même image et à l'arrêt ; Lecture reprend le son. Le MP4 unmuted, at the
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
// the preview on screen: its frame told by its own address (« Rétablir le son » makes it again: same version, a new « r »)
const shownFrame = () => p.eval(`const f = document.querySelector('#code'); return f && f.src && !document.querySelector('iframe.code-next') ? new URL(f.src).search : 'player.html'`).catch(() => 'player.html');
// the preview's sound now: its Player muted or not, its AudioContexts' states, its sound tags playing (an <audio> played
// through Web Audio says its time by steps of about 1.3 s: watched until its next one, 2.5 s at most)
const codeSound = async () => {
  const m = await shownFrame();
  const proto = await p.frameSend(m, 'Runtime.evaluate', { expression: 'AudioContext.prototype' });
  let ctx = [];
  if (proto?.result?.objectId) {
    const q = await p.frameSend(m, 'Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
    ctx = (await p.frameSend(m, 'Runtime.callFunctionOn', { objectId: q.objects.objectId, functionDeclaration: 'function () { return this.map((c) => c.state); }', returnByValue: true }))?.result?.value ?? [];
  }
  const f = await p.frameEval(m, `const P = window.StudioPlayer, au = [...document.querySelectorAll('audio')], t0 = au.map((a) => a.currentTime), w0 = performance.now();
    const sounding = () => au.filter((a, i) => a.src && !a.paused && !a.muted && a.volume > 0 && Math.abs(a.currentTime - t0[i]) > 0.05).length;
    while (performance.now() - w0 < 2500 && (performance.now() - w0 < 1000 || !sounding())) await new Promise((r) => setTimeout(r, 100));
    return { muted: P.isMuted(), playing: P.isPlaying(), sounding: sounding() }`);
  return { ...f, ctx };
};
const saveText = () => p.eval(`return document.querySelector('#save').textContent`);
const play = () => p.eval(`document.querySelector('#bPlay').click(); return 1`);
const click = async selector => {
  const xy = await p.eval(`const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
  await p.mouse('mouseMoved', ...xy); await p.mouse('mousePressed', ...xy); await p.mouse('mouseReleased', ...xy);
};
try {
  await p.goto(`${URL}#f=900`);
  await p.until(`window.__studio && document.querySelector('#v').readyState >= 2`, 120000); await sleep(1000);

  // ---------- 1. the device refusing, then back ----------
  console.log('l\'aperçu : la carte son refuse, puis répond');
  await p.eval(`document.querySelector('#srcCode').click(); return 1`);
  await p.until(`__studio.state().mode === 'code'`, 180000); await sleep(3000);
  // (the episode's assets loaded first: the playback waits for them now — player/assets-wait.tsx)
  for (let i = 0; i < 240 && (await p.frameEval('player.html', 'return window.remotion_delayRenderHandles?.length ?? 0')); i++) await sleep(250);
  await play(); await sleep(2500);
  const s0 = await codeSound();
  check(!s0.muted && s0.playing && s0.sounding > 0 && s0.ctx.includes('running'), `playing, with its sound (${JSON.stringify(s0)})`);
  const incidentFrame = await shownFrame();
  await p.frameEval(incidentFrame, `window.__res0 = AudioContext.prototype.resume; AudioContext.prototype.resume = function () { return Promise.reject(new DOMException('device', 'InvalidStateError')); }; return 1`);
  await play(); await sleep(400); await play();   // (a pause, a play: the Player starts its sound again — refused)
  let lostSeen = false, mutedSeen = false;
  for (let i = 0; i < 12; i++) {   // 6 s of a device that refuses
    await sleep(500);
    if (/coupé/.test(await saveText())) lostSeen = true;
    if (await p.frameEval(incidentFrame, 'return window.StudioPlayer.isMuted()')) mutedSeen = true;
  }
  check(mutedSeen && lostSeen, `the device refusing: Remotion mutes its Player (${mutedSeen}), the page says it (${lostSeen})`);
  await p.frameEval(incidentFrame, `AudioContext.prototype.resume = window.__res0; return 1`);
  let back = null; const backAt = Date.now();
  for (let i = 0; i < 30 && !back; i++) { await sleep(500); const s = await codeSound(); if (!s.muted && s.playing && s.ctx.includes('running') && s.sounding > 0) back = { ...s, after: (Date.now() - backAt) / 1000 }; }
  check(!!back && back.after <= 12 && (await shownFrame()) === incidentFrame,
    `le périphérique répond : son revenu seul dans la même iframe, sans F5 (${back ? `${back.after.toFixed(1)} s` : 'jamais'})`);
  let msg = '';   // (said once it holds 3 s: player/sound.ts)
  for (let i = 0; i < 16 && !/rétabli/.test(msg); i++) { await sleep(500); msg = await saveText(); }
  check(/rétabli/.test(msg), `… said once it holds (« ${msg} »)`);
  await play(); await sleep(600); await play(); await sleep(1500);
  const s1 = await codeSound();
  check(!s1.muted && s1.sounding > 0 && s1.ctx.includes('running'), `pause, play: still with its sound (${JSON.stringify(s1)})`);

  // Une suspension simple doit réutiliser le contexte et l'iframe du Player.
  const suspendedFrame = await shownFrame();
  await p.frameEval(suspendedFrame, `const contexts = window.__coulissesAudio; window.__suspendedContext = contexts[contexts.length - 1]; await window.__suspendedContext.suspend(); return 1`);
  let resumed = null; const resumeAt = Date.now();
  while (!resumed && Date.now() - resumeAt < 12000) {
    await sleep(500); const state = await codeSound();
    if (!state.muted && state.playing && state.ctx.includes('running') && state.sounding > 0) resumed = state;
  }
  const sameContext = (await shownFrame()) === suspendedFrame && await p.frameEval(suspendedFrame,
    'return window.__coulissesAudio?.includes(window.__suspendedContext) && window.__suspendedContext.state === "running"');
  check(!!resumed && sameContext, `suspension temporaire : même contexte et même iframe, son revenu (${JSON.stringify(resumed)})`);

  // ---------- 2. « Rétablir le son » ----------
  console.log('« Rétablir le son »');
  await p.frameEval(await shownFrame(), `window.StudioPlayer.mute(); return 1`); await sleep(2500);   // (a mute asked: left as it is…)
  const kept = await p.frameEval(await shownFrame(), 'return window.StudioPlayer.isMuted()');
  // (in the code, the speaker makes the preview again — a new frame, a new sound: what F5 did; user report 22/10/2026)
  const before = await shownFrame();
  const target = await p.eval('return __studio.state().frame');
  await click('#bSound');
  let now = before;
  for (let i = 0; i < 240 && (now === before || now === 'player.html'); i++) { await sleep(500); now = await shownFrame(); }
  await sleep(500);
  const prepared = await p.eval('return {frame: __studio.state().frame, playing: window.__preview.isPlaying()}');
  const stopped = await codeSound();
  check(kept && now !== before && now !== 'player.html' && prepared && Math.abs(prepared.frame - target) <= 2 && !prepared.playing && !stopped.playing && stopped.sounding === 0,
    `le haut-parleur reconstruit à l'image courante et reste à l'arrêt (${JSON.stringify(prepared)}, cible ${target})`);
  await click('#bPlay'); await sleep(1500);
  const s2 = await codeSound();
  check(!s2.muted && s2.playing && s2.sounding > 0 && s2.ctx.includes('running'),
    `Lecture reprend le son après restauration explicite, sans F5 (${JSON.stringify(s2)}, « ${await saveText()} »)`);
  await p.frameEval(await shownFrame(), `window.StudioPlayer.mute(); return 1`); await sleep(500);
  await p.eval(`const r = document.querySelector('#vol'); r.value = '0.6'; r.dispatchEvent(new Event('input')); return 1`); await sleep(800);
  check(!(await p.frameEval(await shownFrame(), 'return window.StudioPlayer.isMuted()')), 'the volume slider moved: unmuted too');
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
