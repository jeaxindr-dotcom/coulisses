// The studio's page (studio.html), part 10: the start: the project's meta, the notes, the video or the live code.
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  // ---------- start ----------
  (async () => {
    for (const n of ['s9', 's11', 'acc', 'ntodo', 'nfixed', 'nok', 'head', 'lime']) C[n] = css('--' + n);
    try {
      META = await (await fetch('/api/meta')).json();
      const data0Notes = META.newProject ? ((await (await fetch('/api/notes')).json()).notes ?? []).length : 0;
      SNAP = META.snapshot; FPS = META.fps || 30; MAXQ = META.maxEdits || 0;
      PROJ = !!META.kind && META.kind !== 'brambleshire';
      if (META.size?.length === 2) { CW = META.size[0]; CH = META.size[1]; }
      if (PROJ) { document.body.classList.add('proj'); $('#kindTag').textContent = kindLabel(); }
      if (META.newProject && !(data0Notes ?? 0)) tabL = 'agent';
      if (!META.features?.code) document.body.classList.add('nocode');
      if (!META.render) document.body.classList.add('novideo');
      markTools(); $('#bSound').title = TN('st.sound.btn');   // (« Rétablir le son », 01-preview.js)
      $('#bMicTip').textContent = TN('st.rail.mic', { key: window.Shortcuts?.show('dictate') || 'F2' });   // (the dictation, 17-dictate.js)
      $('#dictee .x').title = FR ? 'Échap : annuler' : 'Esc: cancel';
      document.title = PROJ ? `Coulisses — ${META.title}` : `Coulisses · ${META.episode} — ${META.title}`;
      if (META.hub) { const l = $('#logo'); l.href = META.hub; l.title = T('st.start.home'); l.style.cursor = 'pointer'; $('#crumb').href = META.hub; $('#crumb').title = T('st.start.home'); }
      else { document.body.classList.add('nohub'); $('#bHome').classList.add('off'); $('#bHome').querySelector('.why').textContent = T('menu.why.noHub'); }
      $('#title').textContent = PROJ ? META.title : `${META.episode} · ${META.title}`;
      $('#render').textContent = META.render ? T('st.start.render', { name: META.render.name, what: T(PROJ ? 'st.start.exported' : 'st.start.rendered'), date: FR ? new Date(META.render.mtime).toLocaleString() : new Date(META.render.mtime).toLocaleString('en-US', { hour12: false }) }) : META.features?.code ? T('st.start.liveCode') : T('st.start.noVideo');
      if (PROJ) { /* no episode plan: the montage plan (if any) gives the tracks */ }
      else if (!SNAP) { $('#warn').style.display = 'block'; $('#warn').textContent = T('st.start.noPlan'); }
      else if (!META.snapshotMatches) { $('#warn').style.display = 'block'; $('#warn').textContent = T('st.start.stalePlan'); }
      // the notes: read, or nothing is saved (a file there but unreadable answers 503: said, the page saves nothing over it)
      const nr = await fetch('/api/notes', { cache: 'no-store' });
      const data = nr.ok ? await nr.json() : null;
      if (!data || !Array.isArray(data.notes)) {
        $('#warn').style.display = 'block';
        $('#warn').textContent = FR ? `Les notes n'ont pas pu être lues (${nr.status === 503 ? 'fichier illisible' : 'pas de réponse'}) : rien ne sera enregistré tant qu'elles ne le sont pas. Fichier › Actualiser.` : `The notes could not be read (${nr.status === 503 ? 'unreadable file' : 'no answer'}): nothing is saved until they are. File › Reload.`;
        throw new Error('notes not read');
      }
      notes = (data.notes || []).map((n) => ({ status: 'open', end: null, images: [], thread: [], ...n }));
      HIST.last = JSON.stringify(notes); notesLoaded(data);
      LOTF = store.get(lotfKey(), 'all');   // the batch shown last time for this video (02-notes.js)
      // the notes of before the notes followed the video (02-notes.js followPlans): the version they were placed on, when
      // it can be told — the video they were placed on is the one here, or the code as it is
      STATUS.plans = META.plans ?? {};
      { let n0 = 0; for (const n of notes) if (!n.at && n.kind !== 'prompt') {
        const p = n.source === 'code' ? META.plans?.code : (META.render && n.render?.size === META.render.size ? META.plans?.video : null);
        if (p) { n.at = { frame: n.frame, end: n.end ?? null, plan: p }; n.plan = p; n0++; }
      } if (n0) { HIST.last = JSON.stringify(notes); persist(); } }
      if (SNAP) { DUR = SNAP.frames / FPS; FRAMES = SNAP.frames; view = { a: 0, b: DUR }; }
      STATUS = { lots: [], agent: META.agent, code: META.code, timeline: {}, plans: META.plans ?? {} }; onStatus();
      restoreDrafts();   // (what was being typed before a reload of this tab)
      buildLanes(); setTab(tabR); setTab(tabL); fitMedia(); resize(); renderAll(); updateHud();
      loadLive();
      setSave(notes.length ? T('st.start.loaded', { n: notes.length }) : T('st.start.ready'), 'ok');
      pollReplies();
      v.addEventListener('loadedmetadata', () => {
        const d = v.duration;
        FRAMES = SNAP?.frames && Math.abs(SNAP.frames / FPS - d) < 1 ? SNAP.frames : Math.round(d * FPS);
        DUR = FRAMES / FPS; view = { a: 0, b: DUR }; resize(); renderAll(); seekFrame(hashFrame() ?? 0);
        preloadCode();   // the live preview, ready behind for « Code actuel » and the staging (01-preview.js)
      }, { once: true });
      window.addEventListener('hashchange', () => { const f = hashFrame(); if (f !== null) { M.pause(); seekFrame(f); } });
      v.addEventListener('error', () => setSave(T('st.start.cannotRead'), 'err'));
      v.addEventListener('loadeddata', drawOv);
      const proxyTxt = $('#proxy');
      const coming = (p) => p === 'building' || p === 'missing' || p === 'stale';
      const showProxy = () => { proxyTxt.textContent = coming(META.proxy) ? T('st.start.proxy') : ''; };
      showProxy();
      if (!META.render && META.features?.code) {   // nothing exported yet: the code is the video
        proxyTxt.textContent = ''; mode = 'code'; media.classList.add('code'); loadCode(); return;
      }
      v.src = META.proxy === 'ready' ? '/video/revue' : '/video/original';
      if (coming(META.proxy)) (function waitProxy() {
        setTimeout(async () => {
          try {
            const m = await (await fetch('/api/meta', { cache: 'no-store' })).json();
            META.proxy = m.proxy; showProxy();
            if (m.proxy === 'ready') {
              if (shuttle) stopShuttle();
              const t = v.currentTime, wasPlaying = mode === 'video' && !v.paused;
              v.addEventListener('loadedmetadata', () => { v.currentTime = t; if (wasPlaying) v.play(); }, { once: true });
              v.src = '/video/revue';
              return;
            }
            if (coming(m.proxy)) waitProxy();
          } catch (e) { waitProxy(); }
        }, 4000);
      })();
    } catch (e) { setSave(T('st.start.noAnswer'), 'err'); console.error(e); }
  })();
  window.addEventListener('resize', () => { applySizes(); fitMedia(); resize(); });   // a narrower window: the two columns give way (00-base.js)
