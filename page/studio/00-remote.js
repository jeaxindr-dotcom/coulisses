// The studio's page (studio.html), part 00-remote: the live preview in a process of its own (user request, 18/10/2026:
// « faire tourner [l'aperçu] dans son propre processus »). The page is 127.0.0.1, the preview is shown from localhost —
// another site for the browser: its own process, its own thread; its 3D, its React never hold the page any more, nor the
// page it. The page cannot touch it directly any more: it speaks with it by messages (player/bridge.js inside it), and
// remotePlayer(frame) is the same StudioPlayer for the rest of the page:
//   - what is read often is read at once, from what the preview last said (its frame, playing or not, its frame complete
//     or not, stopped by an error, its staging's objects and the one chosen); what the page does to it is told to it,
//     and counted as done here at once (a seek, a play, an offset);
//   - what needs its answer is a promise (a pick, a capture, the frame complete, its camera…).
// ?apercu=page in the studio's address: the preview in the page's own process again, as before (to compare).
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  const PREVIEW_OWN = !/[?&]apercu=page\b/.test(location.search);
  const PREVIEW_ORIGIN = !PREVIEW_OWN ? location.origin : `${location.protocol}//${location.hostname === 'localhost' ? '127.0.0.1' : 'localhost'}:${location.port}`;
  const previewUrl = (q) => `${PREVIEW_ORIGIN}/player.html?${q}`;
  const remotes = new Map();   // a preview frame's window -> its remote player
  window.addEventListener('message', (e) => {
    if (e.origin !== PREVIEW_ORIGIN) return;
    const d = e.data; if (!d || d.coulissesPreview !== 1) return;
    const r = remotes.get(e.source); if (r) r.receive(d);
    // a key typed in the preview that is the studio's (player/keys.ts toParent): played here as if typed here
    if (d.key && (r || remotes.size)) window.dispatchEvent(new KeyboardEvent(d.key.type, { key: d.key.key, code: d.key.code, shiftKey: d.key.shiftKey, ctrlKey: d.key.ctrlKey, altKey: d.key.altKey, metaKey: d.key.metaKey, bubbles: true }));
  });
  // the user's keys changed (Aide › Raccourcis clavier): the previews read them again (their staging keys W / E / R)
  window.Shortcuts?.onChange?.(() => { for (const w of remotes.keys()) try { w.postMessage({ coulissesPreview: 1, shortcuts: 1 }, PREVIEW_ORIGIN); } catch { /* gone */ } });
  const ZERO_D = { p: [0, 0, 0], r: [0, 0, 0], s: 1 };
  const zeroDelta = (d) => !d || ((d.p ?? [0, 0, 0]).every((v) => Math.abs(v) < 1e-9) && (d.r ?? [0, 0, 0]).every((v) => Math.abs(v) < 1e-9) && Math.abs((d.s ?? 1) - 1) < 1e-9);
  function remotePlayer(win) {
    const M = { hello: null, frame: 0, playing: false, ready: true, loading: false, crashed: false, st: null, infos: new Map() };
    let seq = 0, helloRes = null;
    const waits = new Map(), evOn = new Set(), stOn = new Set();
    const hello = new Promise((r) => { helloRes = r; });
    const callWith = (extra, path, ...args) => new Promise((res, rej) => {
      const id = ++seq; waits.set(id, { res, rej });
      try { win.postMessage({ coulissesPreview: 1, call: path, id, args: plain(args), ...extra }, PREVIEW_ORIGIN); } catch (e) { waits.delete(id); rej(e); }
    });
    const call = (path, ...args) => callWith(null, path, ...args);
    const send = (path, ...args) => { call(path, ...args).catch(() => {}); };
    const setState = (s) => {
      if (!s) return;
      M.frame = s.frame ?? M.frame; M.playing = !!s.playing; M.ready = s.ready !== false; M.loading = !!s.loading; M.crashed = !!s.crashed; M.scene3d = !!s.scene3d;
      if (s.stage !== undefined) {
        M.st = s.stage;
        if (s.stage) {   // the objects moved, as the preview says; the one chosen kept (its info from its « select »)
          const keep = s.stage.selected ? M.infos.get(s.stage.selected) : null;
          M.infos = new Map((s.stage.list ?? []).map((x) => [x.id, x]));
          if (keep && !M.infos.has(keep.id)) M.infos.set(keep.id, keep);
        }
      }
    };
    function receive(d) {
      if (d.hello) { M.hello = d.hello; setState(d.state); helloRes(api); return; }
      if (d.re) { const w = waits.get(d.re); if (w) { waits.delete(d.re); if (d.ok) w.res(d.value); else w.rej(new Error(d.error ?? 'preview')); } return; }
      if (d.state) setState(d.state);
      if (d.ev) {
        const ev = d.ev;
        if (Number.isFinite(ev.frame)) M.frame = ev.frame;
        if (ev.type === 'play') M.playing = true;
        else if (ev.type === 'pause' || ev.type === 'ended') M.playing = false;
        else if (ev.type === 'loading') { M.loading = true; M.ready = false; }
        else if (ev.type === 'loaded') { M.loading = false; M.ready = true; }
        else if (ev.type === 'error') M.crashed = true;
        for (const f of evOn) f(ev);
      }
      if (d.stageEv) {
        const ev = d.stageEv;
        if (ev.id && (ev.type === 'select' || ev.type === 'change' || ev.type === 'cutout')) { const { type, ...info } = ev; void type; M.infos.set(ev.id, { ...(M.infos.get(ev.id) ?? {}), ...info }); }
        if (M.st) { if (ev.type === 'select') M.st.selected = ev.id; if (ev.type === 'deselect') M.st.selected = null; }
        for (const f of stOn) f(ev);
      }
    }
    const stage = {
      get kind() { return M.st?.kind ?? null; }, get enabled() { return !!M.st?.enabled; }, get selected() { return M.st?.selected ?? null; }, get scene3d() { return !!M.scene3d; },
      hasScene: () => call('stage.scene3d'),   // (asked now: its 3D scene mounted)
      enable: (want) => call('stage.enable', want),   // (a promise: true once the scene is there)
      on: (fn) => { stOn.add(fn); return () => stOn.delete(fn); },
      list: () => [...M.infos.values()].filter((x) => !zeroDelta(x.delta) || x.cutout),
      info: (id) => M.infos.get(id) ?? { id, delta: plain(ZERO_D), from: undefined, to: undefined, base: null },
      infoNow: (id) => call('stage.info', id),
      has: (id) => M.infos.has(id),
      // (its scope kept when none is given, as the stages do; { quiet: true }: an undo or a redo, its « change » said quiet)
      setDelta: (id, d, from, to, opts) => {
        const o = M.infos.get(id) ?? { id }; M.infos.set(id, { ...o, delta: plain(d), from: from ?? o.from, to: to ?? o.to });
        callWith(opts?.quiet ? { quiet: true } : null, 'stage.setDelta', id, d, from, to).catch(() => {});
      },
      reset: (id) => { M.infos.delete(id); if (M.st?.selected === id) M.st.selected = null; send('stage.reset', id); },
      select: (id) => { if (M.st) M.st.selected = id; send('stage.select', id); },
      selectParent: () => call('stage.selectParent'),
      setMode: (m) => send('stage.setMode', m),
      freeCamera: (want, pose) => call('stage.freeCamera', want, pose ?? null),
      freePose: () => call('stage.freePose'),
      resetCamera: () => call('stage.resetCamera'),
      snapshot: () => call('stage.snapshot'),
      screenPos: (id) => call('stage.screenPos', id),
      edits: () => call('stage.edits'),
      applyNow: () => send('stage.applyNow'),
      addCutout: (spec) => call('stage.addCutout', spec).then((c) => { if (c?.id) M.infos.set(c.id, c); return c; }),
    };
    const api = {
      remote: true,
      get durationInFrames() { return M.hello?.durationInFrames ?? 0; }, get fps() { return M.hello?.fps; }, get width() { return M.hello?.width; }, get height() { return M.hello?.height; },
      get ok() { return !!M.hello?.ok; }, get generic() { return !!M.hello?.generic; }, get composition() { return M.hello?.composition; }, get episode() { return M.hello?.episode; }, get hyperframes() { return !!M.hello?.hyperframes; },
      get stage() { return M.hello?.stage ? stage : undefined; },
      frame: () => M.frame, isPlaying: () => M.playing, frameReady: () => M.ready, frameLoading: () => M.loading, crashed: () => M.crashed,
      seek: (f) => { M.frame = Math.max(0, Math.min((M.hello?.durationInFrames ?? 1) - 1, Math.round(f))); send('seek', f); },
      play: () => { M.playing = true; send('play'); }, pause: () => { M.playing = false; send('pause'); },
      setRate: (r) => send('setRate', r), setVolume: (v) => send('setVolume', v), mute: () => send('mute'), unmute: () => send('unmute'),
      sleep: (on) => send('sleep', on), recover: (f) => { M.crashed = false; send('recover', f); }, __crash: () => send('__crash'),
      whenReady: () => call('whenReady'), whenFrameReady: () => call('whenFrameReady'),
      pick: (f, x, y) => call('pick', f, x, y), hover: (f, x, y) => call('hover', f, x, y), pickMany: (f, pts) => call('pickMany', f, pts),
      objects: () => call('objects'), cameraPos: () => call('cameraPos'),
      on: (fn) => { evOn.add(fn); return () => evOn.delete(fn); },
      // the frame of this player gone: its waiting calls end, its messages are no longer read
      dispose: () => { remotes.delete(win); for (const w of waits.values()) w.rej(new Error('preview gone')); waits.clear(); evOn.clear(); stOn.clear(); },
    };
    remotes.set(win, { receive });
    return { api, hello };
  }
