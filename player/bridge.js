// The live preview in a process of its own (user request, 18/10/2026: « faire tourner [l'aperçu] dans son propre
// processus »): the studio page (127.0.0.1) shows the preview from the other name of the machine (localhost), another
// site for the browser, so the preview has its own process and its own thread — its rendering never holds the page (the
// menus, the notes, the timeline), the page never holds it. Being another site, the page cannot touch it any more: this
// script, loaded after the player (player.html, the HyperFrames page), speaks for it by messages (page/studio/00-remote.js
// on the other side):
//   - the page's calls: { call: 'seek' | 'stage.setDelta' | …, id, args } → the player's own function, its answer
//     { re: id, ok, value | error } (a promise is waited for);
//   - the player's events (frame, play, pause, loading, error…) and its staging's (select, change…) as they come;
//   - its state (the frame, playing, the staging's objects) after every call and every staging event: the page reads it
//     at once, without asking;
//   - the keys typed in the preview that are the studio's (keys.ts toParent).
// Nothing happens when the preview is not inside a page (the server's own captures, a test opening player.html alone).
(() => {
  if (window.parent === window) return;
  const parentOrigin = (location.ancestorOrigins && location.ancestorOrigins[0]) || '*';
  const loop = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
  const plainOf = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const post = (m) => {
    const msg = { coulissesPreview: 1, ...m };
    try { window.parent.postMessage(msg, parentOrigin); }
    catch { try { window.parent.postMessage(plainOf(msg), parentOrigin); } catch { /* not to be sent */ } }   // (a value that cannot be copied: as JSON)
  };
  const sp = () => window.StudioPlayer;
  const stageState = () => {
    const st = sp()?.stage; if (!st) return null;
    let list = []; try { list = st.list(); } catch { /* not mounted yet */ }
    return { kind: st.kind ?? null, enabled: !!st.enabled, selected: st.selected ?? null, scene3d: !!st.scene3d, list };
  };
  const stateOf = (withStage) => {
    const p = sp(); if (!p) return null;
    const s = { frame: p.frame(), playing: !!p.isPlaying(), ready: p.frameReady?.() !== false, loading: !!p.frameLoading?.(), crashed: !!p.crashed?.(), scene3d: !!p.stage?.scene3d };
    if (withStage) s.stage = stageState();
    return s;
  };
  let stageT = 0;
  const pushStage = () => { clearTimeout(stageT); stageT = setTimeout(() => post({ state: stateOf(true) }), 0); };
  // a call the page made « quiet » (an undo, a redo: its own offset put back): the staging events it causes say so, the
  // page does not count them as a new step (they used to come during the call itself, the page then quiet)
  let quiet = false;
  window.addEventListener('message', async (e) => {
    if (e.source !== window.parent || !loop.test(e.origin)) return;
    const d = e.data; if (!d || d.coulissesPreview !== 1) return;
    if (d.shortcuts) { try { await window.Shortcuts?.reload?.(); } catch { /* the defaults */ } return; }   // the user's keys changed (Aide › Raccourcis clavier)
    if (typeof d.call !== 'string') return;
    let value, ok = true, error = null;
    try {
      const parts = d.call.split('.'), name = parts.pop();
      let o = sp(); for (const k of parts) o = o?.[k];
      if (!o) throw new Error(`StudioPlayer.${d.call}: absent`);
      let r;
      if (typeof o[name] === 'function') { quiet = !!d.quiet; try { r = o[name](...(d.args ?? [])); } finally { quiet = false; } } else r = o[name];
      value = await r;
    } catch (err) { ok = false; error = String(err?.message ?? err); }
    if (d.id) post({ re: d.id, ok, value: ok ? value : undefined, error });
    post({ state: stateOf(d.call.startsWith('stage.') || d.call === 'recover') });
  });
  // the player there: what it is, then its events
  (function hello() {
    const p = sp();
    if (!p) { setTimeout(hello, 50); return; }
    post({ hello: { durationInFrames: p.durationInFrames, fps: p.fps, width: p.width, height: p.height, ok: p.ok, generic: !!p.generic, composition: p.composition ?? null, episode: p.episode ?? null, stage: !!p.stage, hyperframes: !!p.hyperframes }, state: stateOf(true) });
    p.on((ev) => post({ ev: plainOf(ev) }));
    p.stage?.on?.((ev) => { post({ stageEv: plainOf(quiet ? { ...ev, quiet: true } : ev) }); pushStage(); });
  })();
})();
