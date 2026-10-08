// The studio's page (studio.html), part 01: the media: the rendered MP4 or the live preview of the code (its versions), time helpers, a 3D object in words.
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  // ---------- media: the rendered MP4, or the live preview of the code (Remotion Player in an iframe) ----------
  let mode = 'video', SP = null, codeVer = -1, codeLoading = null, rate = 1, vol = 1;
  const bus = new EventTarget();
  const fire = (t) => bus.dispatchEvent(new Event(t));
  const M = {
    get currentTime() { return mode === 'code' && SP ? (SP.frame() + 0.5) / FPS : v.currentTime; },
    set currentTime(t) { if (mode === 'code' && SP) SP.seek(Math.floor(t * FPS)); v.currentTime = t; },
    get paused() { return mode === 'code' && SP ? !SP.isPlaying() : v.paused; },
    play() { if (mode === 'code' && SP) { v.pause(); SP.play(); } else { const r = v.play(); r?.catch?.(() => {}); } },
    pause() { if (mode === 'code' && SP) { SP.pause(); v.currentTime = (SP.frame() + 0.5) / FPS; } v.pause(); },
    get playbackRate() { return rate; },
    set playbackRate(r) { rate = r; v.playbackRate = r; SP?.setRate(r); },
    set volume(x) { vol = x; v.volume = x; SP?.setVolume(x); },
    get seeking() { return mode === 'code' ? false : v.seeking; },
    on(t, f) { bus.addEventListener(t, f); },
  };
  ['play', 'pause', 'seeked'].forEach((t) => v.addEventListener(t, () => { if (mode === 'video' || !SP) fire(t); }));
  // The live preview: the player of the code, in an iframe. A new version of the code (every edit of the agent rebuilds it)
  // is prepared in a second, hidden frame while the one on screen keeps playing; once its scene is there (an episode of
  // the Theatre loads its textures again: about 20 s), it takes the old one's place, at the same frame, playing if it
  // was, with the staging in progress (the free camera where it was, the object chosen, the offsets not queued yet), and
  // the old one goes (user bug, 08/10/2026: « des fois la vidéo déconnecte » — the preview was reloaded in place, and
  // stayed black that long after every edit of the agent). A newer version while one is prepared: that one is dropped.
  let codeLoad = null;   // { ver, frame, promise, dropped }
  function loadCode() {
    const ver = STATUS.code?.version ?? META?.code?.version ?? 0;
    if (SP && codeVer === ver) return Promise.resolve(SP);
    if (codeLoad && codeLoad.ver === ver) return codeLoad.promise;
    if (codeLoad) { codeLoad.dropped = true; if (codeLoad.frame !== codeEl) codeLoad.frame.remove(); }
    const inPlace = !SP;   // nothing on screen yet (the first time, after the video): loaded in the frame itself
    const el = inPlace ? codeEl : document.createElement('iframe');
    if (!inPlace) { el.className = 'code-next'; el.title = codeEl.title || ''; for (const k of ['allow', 'allowfullscreen']) if (codeEl.hasAttribute(k)) el.setAttribute(k, codeEl.getAttribute(k)); codeEl.after(el); }
    const job = { ver, frame: el, dropped: false };
    if (inPlace) $('#codeStatus').textContent = T('st.code.loading'); else showCodeNote(T('st.code.preparing'));
    job.promise = new Promise((resolve) => {
      const f0 = curFrame();
      const finish = (sp) => {
        if (codeLoad === job) { codeLoad = null; codeLoading = null; }
        if (job.dropped) return resolve(SP);
        if (!sp) {
          if (!inPlace) { el.remove(); showCodeNote(''); setSave(T('st.code.unavailable'), 'err'); } else $('#codeStatus').textContent = T('st.code.unavailable');
          return resolve(inPlace ? null : SP);
        }
        // what the preview on screen showed, carried over to the new one
        const old = inPlace ? null : SP, f = old ? old.frame() : f0, was = !!old && old.isPlaying();
        const pose = old && staging ? old.stage?.freePose?.() ?? null : null, chosen = old && staging ? stSel?.id ?? null : null;
        const queued = new Set(drafts().filter((n) => n.stage).map((n) => n.stage.id));
        const carry = old && old.stage ? old.stage.list().filter((x) => !queued.has(x.id)) : [];
        if (old) { try { old.pause(); } catch { /* gone */ } codeEl.remove(); el.className = ''; el.id = 'code'; codeEl = el; }
        SP = sp; codeVer = ver;
        if (!META.render && sp.durationInFrames) adoptCode(sp);
        sp.setVolume(vol); sp.setRate(rate);
        sp.on((ev) => {
          if (mode !== 'code' || SP !== sp) return;
          if (ev.type === 'play' || ev.type === 'pause' || ev.type === 'seeked') fire(ev.type);
          if (ev.type === 'ended') fire('pause');
        });
        if (sp.durationInFrames !== FRAMES && FRAMES) showCodeNote(T('st.code.length', { a: sp.durationInFrames, b: FRAMES }));
        else showCodeNote('');
        if (old) { sp.seek(f); if (was && mode === 'code') sp.play(); setSave(T('st.code.updated'), 'ok'); }
        stageSynced = new Set();
        setTimeout(async () => {
          // the offsets not queued yet (an image dropped from « Médias » too), then the queued ones (syncStage)
          for (const x of carry) {
            if (x.cutout && SP.stage.addCutout) SP.stage.addCutout(cutSpec(x)).then((c) => { if (c) SP.stage.setDelta(x.id, x.delta, x.from, x.to); });
            else if (!x.cutout) SP.stage.setDelta(x.id, x.delta, x.from, x.to);
          }
          syncStage();
          if (staging) {
            staging = false; freeCamOn = false; await setStaging(true);
            if (pose && SP.stage.freeCamera) freeCamOn = SP.stage.freeCamera(true, pose);
            if (chosen) SP.stage.select(chosen);
            renderScene();
          }
        }, 0);
        showCodeStatus(); resolve(sp);
      };
      el.onload = () => {
        const w = el.contentWindow, t0 = performance.now();
        (async function wait() {
          if (job.dropped) return finish(null);
          const sp = w.StudioPlayer;
          if (!sp) { if (performance.now() - t0 > 60000) return finish(null); setTimeout(wait, 100); return; }
          // a new version is shown once its scene is there (at most 90 s: then as it is)
          if (!inPlace) await Promise.race([sp.whenReady?.() ?? null, new Promise((r) => setTimeout(r, 90000))]);
          finish(sp);
        })();
      };
      el.src = `/player.html?f=${f0}&v=${ver}`;
    });
    codeLoad = job; codeLoading = job.promise;
    return job.promise;
  }
  let codeNote = '';
  const showCodeNote = (t) => { codeNote = t; showCodeStatus(); };
  function showCodeStatus() {
    const c = STATUS.code ?? {}, el = $('#codeStatus');
    if (c.status === 'error') el.textContent = T('st.code.error');
    else if (c.status === 'building') el.textContent = T('st.code.building');
    else if (SP) el.textContent = `Code v${c.version} · ${c.builtAt ? hm5(new Date(c.builtAt)) : ''}${codeNote ? ' · ' + codeNote : ''}`;
    else el.textContent = '';
    const e = $('#codeErr'); e.style.display = c.status === 'error' ? 'block' : 'none'; e.textContent = c.status === 'error' ? T('st.code.errorLong', { err: c.error }) : '';
  }
  async function setMode(m) {
    if (m === mode) return;
    const f = curFrame(), was = !M.paused; M.pause();
    if (m === 'code' && !(await loadCode())) return;
    if (m === 'video' && SP) SP.pause();
    mode = m;
    media.classList.toggle('code', m === 'code');
    $('#srcVideo').classList.toggle('on', m === 'video'); $('#srcCode').classList.toggle('on', m === 'code'); $('#bSrc').classList.toggle('on', m === 'code');
    seekFrame(f); if (was) M.play();
  }
  // a 3D shot of the theatre shown here as a video (a Short's chibi shot): « Ouvrir la scène 3D » opens it in its own
  // studio (the home screen starts it), where the staging is the Theatre's 3D one; the agent then renders it again into
  // this run (the shot's .coulisses « utilise », lib/projects.mjs shotsUsedIn)
  const norm3d = (f) => String(f ?? '').replace(/\\/g, '/').toLowerCase();
  function shotHere() {
    const shots = META?.shots3d ?? []; if (!shots.length || !LIVE?.tracks) return null;
    const t = (curFrame() + 0.5) / FPS;
    for (const { c } of clipsAt(t)) { const s = shots.find((x) => c.file && norm3d(c.file) === norm3d(x.fichier)); if (s) return s; }
    return null;
  }
  let lastShot = undefined;
  function showShot() {
    const s = shotHere(), b = $('#open3d');
    if (s === lastShot) return; lastShot = s;
    b.style.display = s ? '' : 'none';
    if (s) { b.querySelector('span').textContent = T('st.s3.open', { title: s.title }); b.title = META.hub ? T('st.s3.openTitle', { file: s.fichier }) : T('st.s3.noHub'); b.classList.toggle('off', !META.hub); }
  }
  $('#open3d').onclick = async () => {
    const s = shotHere(); if (!s) return;
    if (!META.hub) return setSave(T('st.s3.noHub'), 'err');
    await flushNow(); location.href = `${META.hub.replace(/\/$/, '')}/go/${s.id}`;
  };
  // the same tools in every project: one that does not apply here is greyed, with the reason in its tooltip
  const stageWhy = () => (META?.features?.code ? null : T('st.why.stageNoCode'));
  const srcWhy = () => (!META?.features?.code ? T('st.why.srcNoCode') : !META?.render ? T('menu.why.noVideo') : null);
  function markTools() {
    for (const [b, why] of [[$('#bStage'), stageWhy()], [$('#bSrc'), srcWhy()]]) {
      b.classList.toggle('off', !!why); b.setAttribute('aria-disabled', why ? 'true' : 'false');
      const w = b.querySelector('.tipr .why'); if (w) w.textContent = why ?? '';
    }
    $('#srcVideo').classList.toggle('off', !META?.render); $('#srcVideo').title = META?.render ? '' : T('menu.why.noVideo');
    $('#srcCode').classList.toggle('off', !META?.features?.code); $('#srcCode').title = META?.features?.code ? '' : T('st.why.srcNoCode');
  }
  $('#srcVideo').onclick = () => { if (!META?.render) return setSave(T('menu.why.noVideo'), 'err'); if (staging) setStaging(false); setMode('video'); };
  $('#srcCode').onclick = () => { if (!META?.features?.code) return setSave(T('st.why.srcNoCode'), 'err'); setMode('code'); };
  $('#bSrc').onclick = () => { const why = srcWhy(); if (why) return setSave(why, 'err'); setMode(mode === 'video' ? 'code' : 'video'); };

  // ---------- time helpers ----------
  const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };
  const fmtS = (t) => { const m = Math.floor(t / 60), s = Math.floor(t - m * 60); return `${m}:${String(s).padStart(2, '0')}`; };
  const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : FR ? d.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const curFrame = () => Math.max(0, Math.min(FRAMES - 1, Math.floor(M.currentTime * FPS + 1e-4)));
  const seekFrame = (f) => { f = Math.max(0, Math.min(FRAMES - 1, Math.round(f))); M.currentTime = (f + 0.5) / FPS; draw(); updateHud(); };
  const tOf = (f) => f / FPS;
  const who = (a) => a === 'narrator' ? T('st.narrator') : a.charAt(0).toUpperCase() + a.slice(1);

  // a project's timeline: the tracks of its montage plan (AItelier: chapters, V1 plans, V2 presenter, V3 overlays, A1-A3)
  const clipsAt = (t) => (LIVE?.tracks ?? []).flatMap((tr) => tr.clips.filter((c) => c.t0 <= t && t < c.t1).map((c) => ({ tr, c })));
  const inClip = (tr, c, t) => (tr.type === 'video' ? T('st.ctx.clipFrame', { n: Math.floor(c.from + (t - c.t0) * FPS + 1e-6) }) : T('st.ctx.fileTime', { t: fmt(c.from / FPS + t - c.t0) }));
  function contextAt(f0, f1 = f0) {
    if (PROJ) {
      const t = (f0 + 0.5) / FPS, at = clipsAt(t);
      return { scene: at.find((x) => x.tr.type === 'band')?.c.label ?? '', lines: [],
        clips: at.filter((x) => x.tr.type !== 'band').map(({ tr, c }) => T('st.ctx.clip', { track: tr.name, label: c.label, file: c.file ? ` · ${c.file}, ${inClip(tr, c, t)}` : '', off: c.off ? T('st.ctx.off') : '' })) };
    }
    if (!SNAP) return { scene: '', lines: [] };
    const t0 = (f0 + 0.5) / FPS, t1 = (f1 + 0.5) / FPS, t = t0;
    let scene = '';
    const cut = SNAP.cutaways.find((c) => t >= c.t && t < c.t + c.dur);
    if (cut) scene = cut.name;
    else {
      const on = SNAP.sets.filter((w) => w.inT <= t && t < (w.outT ?? 1e9) + w.outDur).sort((a, b) => b.inT - a.inT)[0];
      if (on) scene = t < on.inT + on.inDur ? T('st.ctx.arrives', { name: on.name }) : (on.outT !== null && t >= on.outT ? T('st.ctx.leaves', { name: on.name }) : on.name);
      let open = false; for (const c of SNAP.curtain) { if (c.t > t) break; open = c.open; }
      if (!open) scene = scene ? `${scene} · ${T('st.ctx.curtain')}` : T('st.ctx.curtain');
    }
    const lines = SNAP.says.filter((s) => s.t <= t1 && s.t + s.dur + 0.4 >= t0).slice(0, 14).map((s) => T('st.ctx.line', { id: s.id, who: who(s.actor), text: s.text }));
    return { scene, lines };
  }

  // ---------- the 3D object under a gesture, in words: « Penelope · personnage », « ladder · décor » ----------
  // a Remotion run reviewed before any export: the composition gives the timeline's length, its fps and its pixels
  function adoptCode(sp) {
    const first = !FRAMES;
    FRAMES = sp.durationInFrames; FPS = sp.fps || FPS; DUR = FRAMES / FPS;
    if (sp.width && sp.height) { CW = sp.width; CH = sp.height; }
    if (first) view = { a: 0, b: DUR };
    fitMedia(); resize(); renderAll(); updateHud();
    if (first) { const f = hashFrame(); if (f !== null) seekFrame(f); }
  }
  function humanTarget(h) {
    if (!h) return null;
    if (h.label) return { name: h.label, kind: h.kind && h.kind !== 'élément' ? h.kind : T('st.kind.element') };   // an element named data-coulisses="…" (a Remotion run)
    const segs = (h.names?.[0] ?? '').split(' › ').filter(Boolean);
    const seg = [...segs].reverse().find((s) => s.includes('[')) ?? segs.at(-1) ?? '';
    const m = /^(\w+)(?:\[(.*)\])?$/.exec(seg) ?? [];
    const comp = m[1] ?? '', at = Object.fromEntries([...(m[2] ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const key = at.actor || at.key || at.id || at.name || '';
    const pretty = (k) => k.replace(/^[a-z0-9]+-\d+-/i, '').replace(/^f-/, '').replace(/^(set|prop|ground|bg|fg|far|near|back|front|flat)_/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+\d+$/, '').trim();
    if (comp === 'Actor') return { name: who(key), kind: T('st.kind.character') };
    if (comp === 'Piece') {
      if (/^f-/.test(key)) return { name: pretty(key), kind: T('st.kind.prop') };
      if (/^g-/.test(key)) return { name: pretty(key.slice(2)), kind: T('st.kind.ground') };
      // a set's painted layers: <set>-<n>-backdrop | far | middle | near | front
      const lay = /^([a-z0-9]+)-\d+-(backdrop|far|middle|near|front)$/i.exec(key);
      if (lay) return { name: lay[1], kind: T(`st.kind.${lay[2].toLowerCase()}`) };
      if (/backdrop/.test(key)) return { name: key.split('-')[0], kind: T('st.kind.backdrop') };
      if (/ground|-g_/.test(key)) return { name: pretty(key.replace(/-g_/, '-')), kind: T('st.kind.ground') };
      return { name: pretty(key) || T('st.kind.element'), kind: T('st.kind.set') };
    }
    if (comp === 'Stage') return { name: T('st.kind.floor'), kind: T('st.kind.stage') };
    if (comp) return { name: pretty(key) || comp, kind: comp.toLowerCase() };
    const tx = h.textures?.[0]; return tx ? { name: tx.split('/').pop().replace(/\.\w+$/, ''), kind: 'texture' } : { name: h.type ?? '?', kind: '3D' };
  }
  const targetText = (h) => { const t = humanTarget(h); return t ? `${t.name} · ${t.kind}` : ''; };

