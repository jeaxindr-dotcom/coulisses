// The studio's page (studio.html), part 01: the media: the rendered MP4 or the live preview of the code (its versions), time helpers, a 3D object in words.
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  // ---------- media: the rendered MP4, or the live preview of the code (Remotion Player in an iframe) ----------
  let mode = 'video', SP = null, codeVer = -1, codeLoading = null, rate = 1, vol = 1;
  const bus = new EventTarget();
  const fire = (t) => bus.dispatchEvent(new Event(t));
  const M = {
    get currentTime() { return mode === 'code' && SP ? ((pendF ?? SP.frame()) + 0.5) / FPS : v.currentTime; },
    set currentTime(t) {
      if (mode === 'code' && SP) {
        const f = Math.floor(t * FPS), now = performance.now(), quick = now - lastStep < 250;
        if (crash) { codeRecover(f); v.currentTime = t; return; }   // after an error, the next move mounts the Player again there
        lastStep = now;
        // moving (the arrows held, steps in a row, a drag on the timeline): the frames as they come, no veil — the motion is
        // what is judged; the frame where it stops is watched (codeSettle)
        if (SP.isPlaying() || shuttle || quick || drag?.mode === 'scrub') { pendF = null; cwSeq++; codeWaitEl.classList.remove('pend', 'pend-key', 'on'); SP.seek(f); if (!SP.isPlaying()) codeSettle(); }
        else if (f !== (pendF ?? SP.frame())) codeStep(f);
      }
      v.currentTime = t;
      if (rsOn()) rsAt(t);   // (the review sound there too)
    },
    get paused() { return mode === 'code' && SP ? !SP.isPlaying() : v.paused; },
    play() { if (mode === 'code' && SP) { v.pause(); cwSeq++; codeWaitEl.classList.remove('pend', 'pend-key', 'on'); SP.play(); if (rsOn()) { SP.mute?.(); rsAt(M.currentTime); rsPlay(); } } else { const r = v.play(); r?.catch?.(() => {}); } },   // playing: no veil
    pause() { if (mode === 'code' && SP) { SP.pause(); v.currentTime = (SP.frame() + 0.5) / FPS; } RS.el?.pause(); v.pause(); },
    get playbackRate() { return rate; },
    set playbackRate(r) { rate = r; v.playbackRate = r; SP?.setRate(r); if (RS.el) RS.el.playbackRate = r; },
    // (the volume moved: the sound is wanted — a mute of the preview's own, after a lag, taken back too: player/sound.ts)
    // (the review sound playing: the preview stays muted — its sound and this one together would be heard twice)
    set volume(x) { vol = x; v.volume = x; v.muted = false; if (RS.el) { RS.el.volume = x; RS.el.muted = false; } SP?.setVolume(x); if (!rsOn()) SP?.restoreSound?.(); },
    get seeking() { return mode === 'code' ? false : v.seeking; },
    on(t, f) { bus.addEventListener(t, f); },
  };
  ['play', 'pause', 'seeked'].forEach((t) => v.addEventListener(t, () => { if (mode === 'video' || !SP) fire(t); }));
  // ---------- the review sound (lib/review-sound.mjs; user reports 24/10/2026: « le son fait que de se couper », « c'est
  // impossible de review la vidéo ») ----------
  // In the live code of a Remotion project, the film's sound as the studio mixed it from the timeline's audio tracks,
  // played by THIS page as a plain <audio>: the clock. The preview is muted and follows it — late (its videos loading, the
  // PC busy), it is moved to the sound's moment; the sound never waits for the picture. Without it (no audio tracks, being
  // mixed again after a change of the sound, failed): the preview's own sound, as before.
  const RS = { el: null, sig: null, fix: 0, wait: false };   // (wait: the preview waits for its assets — the sound with it)
  const rsOn = () => mode === 'code' && !!SP && !!RS.el;
  const rsAt = (t) => { try { RS.el.currentTime = Math.max(0, t); } catch { /* not loaded yet: its play sets it */ } };
  const rsPlay = () => { RS.el?.play()?.catch?.(() => {}); };
  window.__rs = () => ({ on: rsOn(), sig: RS.sig, t: RS.el ? +RS.el.currentTime.toFixed(2) : null, paused: RS.el?.paused ?? null, ready: RS.el?.readyState ?? null });   // (the tests: tests/review-sound.mjs)
  function rsStatus() {
    const s = STATUS.reviewSound, ok = s?.state === 'ready' && !!s.sig;
    if (ok && s.sig !== RS.sig) {
      const el = new Audio(); el.preload = 'auto'; el.src = `/api/review-sound/${s.sig}.m4a`; el.volume = vol; el.playbackRate = rate; el.preservesPitch = true;
      const first = !RS.el; if (RS.el) { RS.el.pause(); RS.el.removeAttribute('src'); RS.el.load(); }
      RS.el = el; RS.sig = s.sig;
      if (mode === 'code' && SP) { SP.mute?.(); rsAt(M.currentTime); if (!M.paused) rsPlay(); }
      if (first) setSave(TN('st.rs.ready'), 'ok');
    } else if (!ok && RS.el) {   // its sound changed (mixed again: the preview's own meanwhile), or none any more
      RS.el.pause(); RS.el.removeAttribute('src'); RS.el.load(); RS.el = null; RS.sig = null;
      if (SP) { SP.unmute?.(); SP.setVolume(vol); }
    }
  }
  // the preview follows the sound: more than ¼ s apart while playing, moved to it (a little ahead: it is loading)
  setInterval(() => {
    if (!rsOn() || M.paused || RS.wait) return;
    const a = RS.el; if (a.paused && !a.ended) { rsAt(M.currentTime); rsPlay(); return; }
    const want = a.currentTime * FPS, d = SP.frame() - want, now = performance.now();
    if (Math.abs(d) > FPS / 4 && now - RS.fix > 800) { RS.fix = now; SP.seek(Math.min(FRAMES - 1, Math.round(want + (d < 0 ? FPS / 10 : 0)))); }
  }, 200);
  // The live preview: the player of the code, in an iframe. A new version of the code (every edit of the agent rebuilds it)
  // is prepared in a second, hidden frame while the one on screen keeps playing; once its scene is there (an episode of
  // the Theatre loads its textures again: about 20 s), it takes the old one's place, at the same frame, playing if it
  // was, with the staging in progress (the free camera where it was, the object chosen, the offsets not queued yet), and
  // the old one goes (user bug, 08/10/2026: « des fois la vidéo déconnecte » — the preview was reloaded in place, and
  // stayed black that long after every edit of the agent). A newer version while one is prepared: that one is dropped.
  // fresh: the same version again, in a new frame — a new sound for the preview (soundDead below: what F5 did)
  let codeLoad = null;   // { ver, frame, promise, dropped, fresh }
  function loadCode({ fresh = false } = {}) {
    const ver = STATUS.code?.version ?? META?.code?.version ?? 0;
    if (SP && codeVer === ver && !fresh) return Promise.resolve(SP);
    if (codeLoad && codeLoad.ver === ver) return codeLoad.promise;
    if (codeLoad) { codeLoad.dropped = true; codeLoad.remote?.api.dispose(); if (codeLoad.frame !== codeEl) codeLoad.frame.remove(); }
    const inPlace = !SP;   // nothing on screen yet (the first time, after the video): loaded in the frame itself
    const el = inPlace ? codeEl : document.createElement('iframe');
    if (!inPlace) { el.className = 'code-next'; el.title = codeEl.title || ''; for (const k of ['allow', 'allowfullscreen']) if (codeEl.hasAttribute(k)) el.setAttribute(k, codeEl.getAttribute(k)); codeEl.after(el); }
    const job = { ver, frame: el, dropped: false, fresh };
    if (inPlace) $('#codeStatus').textContent = T('st.code.loading');
    else {   // (prepared behind the version on screen: said, with its time — a Theatre episode builds all its cardboard again)
      const base = fresh ? TN('st.sound.preparing') : TN('st.code.preparingOld'), t0 = Date.now();
      showCodeNote(base);
      job.tick = setInterval(() => { if (codeLoad === job) showCodeNote(`${base} ${Math.round((Date.now() - t0) / 1000)} s`); else clearInterval(job.tick); }, 1000);
    }
    job.promise = new Promise((resolve) => {
      const f0 = curFrame();
      const finish = async (sp) => {
        clearInterval(job.tick);
        if (codeLoad === job) { codeLoad = null; codeLoading = null; }
        if (job.dropped) return resolve(SP);
        if (!sp) {
          if (!inPlace) { el.remove(); showCodeNote(''); setSave(T('st.code.unavailable'), 'err'); } else $('#codeStatus').textContent = T('st.code.unavailable');
          return resolve(inPlace ? null : SP);
        }
        // what the preview on screen showed, carried over to the new one
        // (what is carried over is copied into this page: the old preview's world goes with its frame — plain)
        const old = inPlace ? null : SP, f = old ? old.frame() : f0, was = !!old && old.isPlaying();
        const pose = old && staging && old.stage ? plain(await Promise.resolve(old.stage.freePose()).catch(() => null)) : null, chosen = old && staging ? stSel?.id ?? null : null;
        const queued = new Set(drafts().filter((n) => n.stage).map((n) => n.stage.id));
        const carry = plain(old && old.stage ? old.stage.list().filter((x) => !queued.has(x.id)) : []);
        if (old) { try { old.pause(); } catch { /* gone */ } try { stUnsub?.(); } catch { /* gone */ } stUnsub = null; stSel = plain(stSel); old.dispose?.(); codeEl.remove(); el.className = ''; el.id = 'code'; codeEl = el; }
        SP = sp; codeVer = ver; window.__preview = sp;   // (the tests: the preview as the page sees it)
        if (!META.render && sp.durationInFrames) adoptCode(sp);
        sp.setVolume(vol); sp.setRate(rate); if (RS.el) sp.mute?.();   // (the review sound plays: lib/review-sound.mjs)
        codeWait(false);
        watchPlayer(sp);
        if (sp.durationInFrames !== FRAMES && FRAMES) showCodeNote(T('st.code.length', { a: sp.durationInFrames, b: FRAMES }));
        else showCodeNote('');
        if (old) { sp.seek(f); if (was && mode === 'code') sp.play(); if (mode === 'code') setSave(job.fresh ? TN('st.sound.reloaded') : T('st.code.updated'), 'ok'); }
        if (old && mode !== 'code') sp.sleep?.(true);   // a new version, ready (whenReady above): asleep behind the MP4; a first load sleeps once ready (preloadCode)
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
            if (pose && SP.stage.freeCamera) freeCamOn = !!(await SP.stage.freeCamera(true, pose));
            if (chosen) SP.stage.select(chosen);
            renderScene();
          }
        }, 0);
        showCodeStatus(); resolve(sp);
      };
      // the preview's own process (page/studio/00-remote.js, player/bridge.js): its player once it says it is there
      const rem = remotePlayer(el.contentWindow, String(ver)); job.remote = rem;
      (async () => {
        const sp = await Promise.race([rem.hello, new Promise((r) => setTimeout(() => r(null), 60000))]);
        if (job.dropped || !sp) { rem.api.dispose(); return finish(null); }
        // a new version is shown once its scene is there (at most 90 s: then as it is)
        if (!inPlace) await Promise.race([sp.whenReady().catch(() => {}), new Promise((r) => setTimeout(r, 90000))]);
        // the one on screen shows a 3D scene: the new one takes its place once its own is mounted (« ready » does not wait
        // for it; the staging in progress would come back on the 2D picture, without its free camera nor its object)
        if (!inPlace && SP?.stage?.scene3d && sp.stage) {
          const t0 = performance.now();
          while (!job.dropped && performance.now() - t0 < 30000 && !(await sp.stage.hasScene().catch(() => false))) await new Promise((r) => setTimeout(r, 150));
          if (!job.dropped) await Promise.race([sp.whenReady().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]);
        }
        finish(sp);
      })();
      el.src = previewUrl(`f=${f0}&v=${ver}${fresh ? `&r=${Date.now()}` : ''}`);
    });
    codeLoad = job; codeLoading = job.promise;
    return job.promise;
  }
  // the preview's events (its own function: its closure holds the player only, never the one it replaced)
  function watchPlayer(sp) {
    sp.on((ev) => {
      if (SP !== sp) return;
      // (while moving, the preview's « loading » is not shown: the end of the move is watched by codeSettle)
      if (ev.type === 'error') { codeCrashed(plain(ev)); return; }
      // (playing, the only « loading » is a wait for the scene's assets: player/assets-wait.tsx — said too)
      if (ev.type === 'loading' || ev.type === 'loaded') { codeWait(ev.type === 'loading' && !shuttle && performance.now() - lastStep > 250); return; }
      if (ev.type === 'waiting') { RS.wait = true; RS.el?.pause(); return; }
      if (ev.type === 'resume') { RS.wait = false; if (rsOn() && !M.paused) { rsAt(M.currentTime); rsPlay(); } return; }
      if (mode !== 'code') return;
      // the sound of the preview cut by its Player after a lag of the PC, and given back by the preview (player/sound.ts)
      if (ev.type === 'sound' && ev.state === 'dead') { soundDead(ev.why); return; }
      if (ev.type === 'sound') { setSave(TN(ev.state === 'lost' ? 'st.sound.lost' : 'st.sound.back'), ev.state === 'lost' ? 'err' : 'ok'); return; }
      if (ev.type === 'play' || ev.type === 'pause' || ev.type === 'seeked') fire(ev.type);
      if (ev.type === 'ended') fire('pause');
      if (RS.el && (ev.type === 'pause' || ev.type === 'ended')) RS.el.pause();
    });
  }
  // The live preview loaded in the background as soon as the studio has opened its video (user report, 09/10/2026: « le
  // bouton pour activer la caméra libre met du temps à charger » — 12 s for E03, the episode's 260 MB of textures and its
  // cardboard): once its scene is there it goes to sleep (nothing drawn), and « Code actuel », M or the staging find it
  // ready. Only when the page is shown and the MP4 not playing, so that it never makes the video stutter.
  let preloaded = false;
  function preloadCode(delay = 2500) {
    if (preloaded || !META?.features?.code) return;
    setTimeout(function go() {
      if (preloaded || mode === 'code' || SP || codeLoad) { preloaded = true; return; }
      if (document.hidden || !M.paused) { setTimeout(go, 2000); return; }   // later: the user is watching
      preloaded = true;
      loadCode().then(async (sp) => {
        if (!sp || mode === 'code') return;
        await Promise.race([sp.whenReady?.() ?? null, new Promise((r) => setTimeout(r, 90000))]);
        if (mode !== 'code' && SP === sp) sp.sleep?.(true);
      });
    }, delay);
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
  // the live preview's frame not complete (player/ready.ts: a video of the frame still loading or seeking): covered and
  // said, so that a loading state is never taken for a defect of the video (fiche du 10/10/2026, long04's junctions)
  const codeWaitEl = $('#codeWait');
  function codeWait(on) { codeWaitEl.classList.toggle('on', !!on && mode === 'code'); }
  // a step of the paused preview (← →, ↑ ↓, a click on the timeline): the veil is asked first — it shows after 90 ms
  // unless the frame is complete by then (the CSS delay runs on the compositor: even while the preview is busy mounting
  // the next chapter's page, 1.3 s for long04, the screen never shows the frame before with the new frame's number) —,
  // the seek one frame later, and the veil goes once the preview says the frame asked is complete (player/ready.ts)
  let pendF = null, cwSeq = 0, lastStep = 0, settleT = null, keyStep = false;
  // the composition failed (player/crash.tsx, user report 16/10/2026: the whole picture black with a « ⚠ » in E10): what
  // happened, where in the code, kept in revue\preview-errors.log; « Réessayer », any move mounts the Player again
  let crash = null;
  const codeErrEl = $('#codeCrash');   // (#codeErr is the build error of the code)
  function codeCrashed(ev) {
    const e = ev.error ?? {}, at = ev.at ?? ev.frame ?? curFrame();
    crash = { ...e, at };
    $('#ceTitle').textContent = T('st.code.crash', { f: at }); $('#ceMsg').textContent = e.message ?? ''; $('#ceWhere').textContent = e.where ? T('st.code.crashWhere', { w: e.where }) : '';
    codeErrEl.classList.add('on'); codeWaitEl.classList.remove('pend', 'pend-key', 'on');
    postJson('/api/preview-error', { frame: at, message: e.message, where: e.where, stack: (e.stack ?? '').split('\n').slice(0, 12).join('\n'), version: codeVer }).catch(() => {});
    setSave(T('st.code.crash', { f: at }), 'err');
  }
  function codeRecover(f = curFrame()) {
    if (!crash || !SP) return;
    crash = null; codeErrEl.classList.remove('on');
    SP.recover?.(f);
    if (mode === 'code') codeWaitEl.classList.add('on');   // the Player mounts again: the frame covered until it is complete (behind the MP4: nothing to cover)
    const sp = SP, my = ++cwSeq; setTimeout(() => Promise.resolve(sp.whenFrameReady?.()).then(() => { if (my === cwSeq) codeWaitEl.classList.remove('on'); }), 400);
  }
  $('#ceRetry').onclick = () => codeRecover();
  $('#ceCopy').onclick = () => { if (crash) copy(`${T('st.code.crash', { f: crash.at })}\n${crash.message}\n${crash.where ?? ''}`); };
  $('#ceNote').onclick = () => {
    if (!crash) return;
    const n = addNote(crash.at, null, false, { source: 'code' });
    if (n) { n.text = T('st.code.crashNoteText', { msg: crash.message, where: crash.where ? ` (${crash.where})` : '' }); save(); renderAll(); setSave(T('st.code.crashNoted'), 'ok'); }
  };
  // an arrow released before the hold (a tap): its veil at the usual 90 ms from now
  function keyReleased() { if (codeWaitEl.classList.contains('pend-key')) { codeWaitEl.classList.remove('pend-key'); codeWaitEl.classList.add('pend'); } }
  // the end of a move: once nothing has moved for 220 ms, a frame not complete is covered until it is
  function codeSettle() {
    clearTimeout(settleT);
    settleT = setTimeout(() => {
      if (mode !== 'code' || !SP || SP.isPlaying() || shuttle || drag?.mode === 'scrub' || performance.now() - lastStep < 200) { if (shuttle || drag?.mode === 'scrub') codeSettle(); return; }
      // (the preview in its own process answers in a moment: its frame is asked for, the veil shown only if it is not
      // complete 90 ms later)
      const sp = SP, my = ++cwSeq;
      const veil = setTimeout(() => { if (my === cwSeq && mode === 'code') codeWaitEl.classList.add('on'); }, 90);
      const done = () => { clearTimeout(veil); if (my === cwSeq) codeWaitEl.classList.remove('on'); };
      Promise.resolve(sp.whenFrameReady?.()).then(done, done);
    }, 220);
  }
  function codeStep(f) {
    const sp = SP, my = ++cwSeq; pendF = f;
    // the first step of an arrow may become a hold (the shuttle at 280 ms): its veil waits 330 ms, never a flash at the
    // start of a fast forward / rewind; released at once, keyReleased brings it back to 90 ms
    codeWaitEl.classList.remove('pend', 'pend-key'); codeWaitEl.classList.add(keyStep ? 'pend-key' : 'pend');
    requestAnimationFrame(() => {
      if (my !== cwSeq || SP !== sp) return;
      pendF = null; sp.seek(f);
      const done = () => { if (my === cwSeq) codeWaitEl.classList.remove('pend', 'pend-key'); };
      Promise.resolve(sp.whenFrameReady?.()).then(done, done);
    });
  }
  // « Rétablir le son » (the speaker under the image; user report 19/10/2026: « quand il y a des lags, le son se désactive,
  // et impossible à réactiver sans F5 »): every sound path as at the start — nothing muted, the volume of the slider; the
  // live preview's Player unmuted (its own mute after a failed start of its sound, player/sound.ts); the MP4 loaded again
  // where it is (a new sound output: the one of before may have died with the sound device), playing if it was
  // The preview's sound dead (player/sound.ts: its AudioContext refusing for good, suspended, its clock stopped, its
  // « error »; user report 22/10/2026: « il n'y a plus de son et je suis obligé d'appuyer sur F5 »): the preview made
  // again — a new frame of the same version at the same image, playing if it was, nothing else touched. Twice in 2 min
  // at most by itself (a sound device really gone: said, the speaker under the image tries again).
  let soundTries = [];
  async function soundDead(why, asked = false) {
    const t = Date.now(); soundTries = soundTries.filter((x) => t - x < 120000);
    if (!asked && soundTries.length >= 2) { setSave(TN('st.sound.gone'), 'err'); return null; }
    soundTries.push(t);
    if (!asked) setSave(TN('st.sound.reload'), 'err');
    window.__soundDead = (window.__soundDead ?? 0) + 1;   // (the tests: tests/sound-watch.mjs)
    return loadCode({ fresh: true });
  }
  async function restoreSound() {
    v.muted = false; v.volume = vol;
    if (mode === 'code' && SP && RS.el) {
      const src = RS.el.src, t = M.currentTime, playing = !M.paused; RS.el.pause();
      const el = new Audio(); el.preload = 'auto'; el.src = src; el.volume = vol; el.playbackRate = rate; el.preservesPitch = true;
      RS.el.removeAttribute('src'); RS.el.load(); RS.el = el; SP.mute?.(); rsAt(t); if (playing) rsPlay();
      setSave(TN('st.rs.reloaded'), 'ok'); return;
    }
    if (mode === 'code' && SP) { SP.setVolume(vol); await SP.restoreSound?.(); setSave(TN('st.sound.reloading'), ''); await soundDead('asked', true); return; }
    else if (v.currentSrc && !wasHeld && v.readyState >= 1) {
      const t = v.currentTime, playing = !v.paused, src = v.currentSrc;
      v.addEventListener('loadedmetadata', () => { v.currentTime = t; v.volume = vol; v.muted = false; if (playing) v.play().catch(() => {}); }, { once: true });
      v.src = src;
    }
    setSave(TN('st.sound.restored'), 'ok');
  }
  $('#bSound').onclick = () => restoreSound();
  let modeWant = null;
  async function setMode(m) {
    if (m === mode && modeWant === null) return;
    modeWant = m;
    let f = curFrame(); const was = !M.paused, planFrom = viewPlan(); M.pause();
    if (m === 'code' && !(await loadCode())) { if (modeWant === m) modeWant = null; return; }
    if (modeWant !== m) return;   // (another choice came while the code loaded: that one)
    modeWant = null;
    if (m === mode) return;
    if (m === 'video' && SP) SP.pause();
    mode = m;
    codeWait(m === 'code' && SP?.frameLoading?.()); codeWaitEl.classList.remove('pend', 'pend-key'); pendF = null; cwSeq++;
    codeErrEl.classList.toggle('on', m === 'code' && !!crash);
    SP?.sleep?.(m !== 'code');   // drawn only while it is on screen (Remotion's 3D canvas draws at every frame, even paused)
    media.classList.toggle('code', m === 'code');
    $('#srcVideo').classList.toggle('on', m === 'video'); $('#srcCode').classList.toggle('on', m === 'code'); $('#bSrc').classList.toggle('on', m === 'code');
    f = await frameOn(f, planFrom, viewPlan());   // (the code changed since the video: the same moment, not the same frame)
    seekFrame(f); if (was) M.play();
    followPlans();   // (the notes on this version's frames)
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

