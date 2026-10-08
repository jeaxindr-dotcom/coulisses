// The studio's page (studio.html), part 02: the notes, their images, an image of the library placed on the picture, saving, Ctrl+Z / Ctrl+Y.
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  // ---------- notes ----------
  const sorted = () => [...notes].sort((a, b) => a.frame - b.frame || (a.end ?? a.frame) - (b.end ?? b.frame));
  const byId = (id) => notes.find((n) => n.id === id);
  const drafts = () => sorted().filter((n) => n.draft && n.kind !== 'prompt');
  const reply = (n) => REPLIES.notes?.[n.id] ?? null;
  function statusOf(n) {
    const r = reply(n), ut = Date.parse(n.statusAt || 0) || 0, ct = Date.parse(r?.statusAt || 0) || 0;
    return r?.status && ct > ut ? r.status : (n.status || 'open');
  }
  function threadOf(n) {
    const msgs = (n.thread || []).map((m) => ({ ...m, from: 'user' }));
    for (const m of reply(n)?.messages || []) msgs.push({ ...m, from: 'claude' });
    if (n.reply) msgs.push({ from: 'claude', text: n.reply, images: [], at: n.updated });
    return msgs.sort((a, b) => (Date.parse(a.at || 0) || 0) - (Date.parse(b.at || 0) || 0));
  }
  function stamp(n) { n.updated = now(); n.context = contextAt(n.frame, n.end ?? n.frame); }
  function queueFull() {
    if (drafts().length < MAXQ) return false;
    setSave(T('st.queue.full', { max: MAXQ }), 'err');
    setTab('queue'); $('#qcnt').animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], 400);
    return true;
  }
  function addNote(frame, end = null, focus = true, extra = {}) {
    if (queueFull()) return null;
    if (end !== null && end < frame) [frame, end] = [end, frame];
    if (end !== null && end === frame) end = null;
    const n = { id: uid(), frame, end, text: '', images: [], thread: [], status: 'open', created: now(), render: META.render, draft: true, source: mode, ...extra };
    stamp(n); notes.push(n); sel = n.id; save(); setTab('queue'); renderAll();
    if (focus) requestAnimationFrame(() => { const ta = document.querySelector(`.card[data-id="${n.id}"] textarea.main`); if (ta) { ta.focus(); ta.scrollIntoView({ block: 'nearest' }); } });
    return n;
  }
  function delNote(id) { notes = notes.filter((n) => n.id !== id); if (sel === id) sel = null; if (loopId === id) loopId = null; delete pending[id]; save(); renderAll(); }
  function setFrames(n, frame, end) {
    frame = Math.max(0, Math.min(FRAMES - 1, Math.round(frame)));
    if (end !== null && end !== undefined) { end = Math.max(0, Math.min(FRAMES - 1, Math.round(end))); if (end < frame) [frame, end] = [end, frame]; if (end === frame) end = null; }
    n.frame = frame; n.end = end ?? null; stamp(n);
  }
  function showCard(id) {
    const n = byId(id); if (!n) return;
    if (tab !== 'insp') setTab(n.draft ? 'queue' : 'notes');
    requestAnimationFrame(() => document.querySelector(`.card[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  // ---------- images ----------
  const imagesOf = (e) => {
    const dt = e.clipboardData || e.dataTransfer; if (!dt) return [];
    const fromFiles = [...(dt.files || [])].filter((f) => f.type.startsWith('image/'));
    if (fromFiles.length) return fromFiles;
    return [...(dt.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
  };
  async function upload(file, noteId) {
    const r = await fetch('/api/image', { method: 'POST', headers: { 'Content-Type': file.type || 'image/png', 'X-Note': noteId }, body: file });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).file;
  }
  async function attach(files, target) {
    files = [...files].filter((f) => f && f.type.startsWith('image/'));
    if (!files.length) return;
    let n = target.kind === 'new' ? null : byId(target.id);
    if (!n) { M.pause(); n = addNote(curFrame(), null, false); if (!n) return; target = { kind: 'note', id: n.id }; }
    setSave(files.length > 1 ? T('st.img.uploadMany', { n: files.length }) : T('st.img.uploadOne'));
    try {
      for (const f of files) {
        const file = await upload(f, n.id);
        if (target.kind === 'reply') (pending[n.id] ??= { text: '', images: [] }).images.push({ file, at: now() });
        else (n.images ??= []).push({ file, at: now() });
      }
      sel = n.id;
      if (target.kind !== 'reply') { n.updated = now(); save(); } else setSave(T('st.img.ready'), 'ok');
      renderAll();
    } catch (e) { setSave(T('st.img.failed'), 'err'); }
  }
  const thumbHtml = (img, removable) => `<span class="thumb"><img src="/${esc(img.file)}" data-full="/${esc(img.file)}" alt="">${removable ? `<button class="x" title="${esc(T('st.img.remove'))}">${ic('x')}</button>` : ''}</span>`;
  function openLightbox(src) { const lb = $('#lb'); lb.querySelector('img').src = src; lb.style.display = 'flex'; }
  $('#lb').addEventListener('click', () => { $('#lb').style.display = 'none'; });
  let pickTarget = null;
  $('#filePick').addEventListener('change', (e) => { const t = pickTarget; pickTarget = null; if (t) attach(e.target.files, t); e.target.value = ''; });
  const pick = (target) => { pickTarget = target; $('#filePick').click(); };
  document.addEventListener('paste', (e) => {
    const files = imagesOf(e); if (!files.length) return;
    e.preventDefault();
    const a = document.activeElement, card = a && a.closest ? a.closest('.card') : null;
    if (card) attach(files, { kind: a.classList.contains('rep') ? 'reply' : 'note', id: card.dataset.id });
    else if (sel) attach(files, { kind: 'note', id: sel });
    else attach(files, { kind: 'new' });
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  const dropZone = (el, target) => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('drop'); attach(imagesOf(e), target()); });
  };
  dropZone($('#viewer'), () => ({ kind: 'new' }));

  // ---------- an image of the library (« Médias » tab, medias.js) placed on the picture ----------
  // A pinned edit for the agent, at the frame shown, with the image attached (a copy in revue/images) and what the
  // library knows of it (note.media): the agent copies it into the project and writes it in the code (lib/lots.mjs).
  // Nothing changes in the project here (user's choice, 08/10/2026: « L'agent » writes the placement).
  async function placeMedia(id, pt, frame = curFrame()) {
    if (queueFull()) return null;
    M.pause();
    const r = await postJson('/api/medias/place', { id, frame });
    if (!r?.ok) { setSave(T('st.md.placeFailed', { why: r?.why ?? '' }), 'err'); return null; }
    return placeNote(r, pt, frame);
  }
  // « Médias » dropped on a live preview (user request, 08/10/2026: « quand je place l'image créée dans le décor, elle se
  // met automatiquement en carton 3D comme Brambleshire »): in a 3D scene the image becomes a cardboard cutout right where
  // it falls (player/stage.ts), in a 2D picture the image itself (player/stage2d.ts); the staging opens on it to place it,
  // and « Ajouter à la file » asks the agent to add it to the project there. Without a live preview of the code (a video
  // only), or if the preview cannot take it: the pinned note, as before. Ctrl+Z takes the drop back.
  const cutMedia = new Map();   // a cutout's id → the media of the library (and its copy in revue/images)
  async function dropMedia(id, pt, frame = curFrame()) {
    if (!META.features?.code || stageWhy()) return placeMedia(id, pt, frame);
    if (queueFull()) return null;
    M.pause();
    const r = await postJson('/api/medias/place', { id, frame });
    if (!r?.ok) { setSave(T('st.md.placeFailed', { why: r?.why ?? '' }), 'err'); return null; }
    if (!staging) await setStaging(true);
    if (!staging || !SP?.stage?.addCutout) return placeNote(r, pt, frame);
    setSave(T('st.md.cutMaking', { name: r.media.nom }));
    const c = await SP.stage.addCutout({ url: '/medias/file/' + encodeURIComponent(id), name: r.media.nom, category: r.media.categorie, at: pt ?? null });
    if (!c?.cutout) return placeNote(r, pt, frame);
    cutMedia.set(c.id, r.media);
    HIST.back.push({ type: 'cutout', id: c.id, spec: cutSpec(c), media: r.media, label: T('st.undo.cutout', { name: r.media.nom }) }); HIST.fwd = [];
    SP.stage.select(c.id);
    setSave(T(D2() ? 'st.md.cut2dPlaced' : 'st.md.cutPlaced', { name: r.media.nom }), 'ok');
    return c;
  }
  // what lays a cutout again at its place (a page reloaded, Ctrl+Y): its image, its name, its place before any offset
  const cutSpec = (i) => ({ id: i.id, url: i.cutout.url, name: i.cutout.name, category: i.cutout.category, ...(i.cutout.box ? { box: i.cutout.box } : { base: i.cutout.base }) });
  function placeNote(r, pt, frame) {
    const at = pt ?? [Math.floor(CW / 2), Math.floor(CH / 2)];
    const n = addNote(frame, null, false, { text: T(pt ? 'st.md.placeText' : 'st.md.placeTextCenter', { name: r.media.nom }), mark: { kind: 'pin', points: [at] },
      images: [{ file: r.file, at: now(), label: r.media.nom }], media: r.media });
    if (n) { setSave(T('st.md.placed', { name: r.media.nom }), 'ok'); showCard(n.id); }
    return n;
  }
  $('#viewer').addEventListener('drop', (e) => {
    const id = e.dataTransfer?.getData('application/x-coulisses-media');
    window.Studio.mediaDragging(false);
    if (id) dropMedia(id, toComp(e), curFrame());
  });
  window.Studio = {
    esc: (x) => esc(x), ic: (n, c) => ic(n, c), setSave: (a, b) => setSave(a, b), placeMedia: (id, pt) => dropMedia(id, pt), dropMedia: (id, pt) => dropMedia(id, pt),
    setTabCount: (t, txt) => { const e = $('#n' + t.charAt(0).toUpperCase() + t.slice(1)); if (e) e.textContent = txt; },
    mediaDragging: (on) => {
      const vw = $('#viewer'); vw.classList.toggle('mdrag', !!on); document.querySelector('#mdDropHint')?.remove();
      if (!on) return;
      const r = vw.getBoundingClientRect(), h = document.createElement('div');
      h.id = 'mdDropHint'; h.textContent = T('st.md.dropHint'); h.style.left = (r.left + r.width / 2) + 'px'; h.style.top = (r.top + 18) + 'px';
      document.body.appendChild(h);
    },
  };

  // ---------- saving ----------
  let saveT = null, saving = false, dirty = false;
  const setSave = (txt, cls) => { const s = $('#save'); s.textContent = txt; s.className = cls || ''; };
  const payload = () => JSON.stringify({ episode: META.episode, title: META.title, fps: FPS, render: META.render, updated: now(), notes: sorted() });
  // Ctrl+Z / Ctrl+Y (user request, 08/10/2026: « les raccourcis habituels »): the user's own actions in the page — a note
  // added, deleted, moved or written, a mark, an edit in the queue, a staging offset — 60 steps back, kept in memory. The
  // words typed in a field keep the browser's own undo while it has the focus, and typing in a note makes one step per
  // burst. Sending the queue starts a new history (a batch sent is not taken back here: « Annuler la correction du lot »).
  // The agent's fixes have their own undo (Édition › Annuler la correction du lot N).
  const HIST = { back: [], fwd: [], last: null, lastAt: 0, max: 60 };
  const noText = (j) => { try { return JSON.stringify(JSON.parse(j).map(({ text, updated, context, ...r }) => r)); } catch { return j; } };
  function stepLabel(before, after) {
    let a = [], b = []; try { a = JSON.parse(before); b = JSON.parse(after); } catch { /* */ }
    if (b.length > a.length) return T('st.undo.add');
    if (b.length < a.length) return T('st.undo.del');
    return T('st.undo.edit');
  }
  function remember() {   // called by save(): the state before this change becomes one step back
    const cur = JSON.stringify(notes);
    if (HIST.last === null) { HIST.last = cur; return; }
    if (cur === HIST.last) return;
    const now = Date.now(), top = HIST.back.at(-1);
    // one step per burst: still typing in a note (1.5 s), or dragging a note along the timeline (0.4 s)
    const ids = (j) => { try { return JSON.parse(j).map((n) => n.id).join(); } catch { return j; } };
    const typingOn = noText(cur) === noText(HIST.last);
    const burst = top?.type === 'notes' && ids(cur) === ids(HIST.last) && now - HIST.lastAt < (typingOn && top.text ? 1500 : 400);
    if (!burst) { HIST.back.push({ type: 'notes', state: HIST.last, label: stepLabel(HIST.last, cur), text: noText(cur) === noText(HIST.last) }); if (HIST.back.length > HIST.max) HIST.back.shift(); }
    HIST.fwd = []; HIST.last = cur; HIST.lastAt = now;
  }
  function persist() { dirty = true; setSave(T('st.save.saving')); clearTimeout(saveT); saveT = setTimeout(flush, 400); }
  function save() { remember(); persist(); }
  let stQuiet = false; const stPrev = new Map(), stAt = new Map();
  function rememberStage(ev) {   // a staging offset: one step per gesture (a drag, a burst of arrows or of the wheel)
    if (stQuiet) return;
    const now = Date.now(), prev = stPrev.get(ev.id) ?? { delta: { p: [0, 0, 0], r: [0, 0, 0], s: 1 }, from: ev.from, to: ev.to };
    if (now - (stAt.get(ev.id) ?? 0) > 700) { HIST.back.push({ type: 'stage', id: ev.id, ...prev, label: T('st.undo.stage', { name: stageName(ev.id, ev).name }) }); if (HIST.back.length > HIST.max) HIST.back.shift(); HIST.fwd = []; }
    stAt.set(ev.id, now); stPrev.set(ev.id, { delta: JSON.parse(JSON.stringify(ev.delta)), from: ev.from, to: ev.to });
  }
  function undoStep(dir) {   // 'undo' | 'redo'
    const from = dir === 'undo' ? HIST.back : HIST.fwd, to = dir === 'undo' ? HIST.fwd : HIST.back;
    let step = from.pop();
    while (step && step.type === 'notes' && step.state === HIST.last) step = from.pop();   // a step that changes nothing
    if (!step) { setSave(T(dir === 'undo' ? 'st.undo.none' : 'st.redo.none'), ''); return; }
    if (step.type === 'cutout') {   // the drop of an image: undo takes it away, redo lays it again at its place
      if (!SP?.stage) { setSave(T(dir === 'undo' ? 'st.undo.none' : 'st.redo.none'), ''); return; }
      if (dir === 'undo') { if (SP.stage.has(step.id)) SP.stage.reset(step.id); if (stSel?.id === step.id) stSel = null; renderScene(); }
      else if (!SP.stage.has(step.id)) SP.stage.addCutout(step.spec).then((c) => { if (c) { cutMedia.set(step.id, step.media); if (staging) SP.stage.select(step.id); } renderScene(); });
      to.push(step);
    } else if (step.type === 'stage') {
      if (!SP?.stage) { setSave(T(dir === 'undo' ? 'st.undo.none' : 'st.redo.none'), ''); return; }
      const cur = SP.stage.info(step.id);
      to.push({ type: 'stage', id: step.id, delta: cur.delta, from: cur.from, to: cur.to, label: step.label });
      stQuiet = true; SP.stage.setDelta(step.id, step.delta, step.from, step.to); stQuiet = false;
      stPrev.set(step.id, { delta: step.delta, from: step.from, to: step.to }); stAt.set(step.id, 0);
      if (stSel?.id === step.id) stSel = { ...stSel, ...SP.stage.info(step.id) };
      renderScene.force = true; renderScene(); renderScene.force = false;
    } else {
      to.push({ type: 'notes', state: HIST.last, label: step.label });
      const had = new Set(notes.map((n) => n.id));
      notes = JSON.parse(step.state); HIST.last = step.state; HIST.lastAt = 0;
      const back = notes.find((n) => !had.has(n.id));   // a note that comes back is the one selected
      if (back) sel = back.id; else if (sel && !byId(sel)) sel = null;
      if (loopId && !byId(loopId)) loopId = null;
      persist(); renderAll(); syncStage();
    }
    setSave(T(dir === 'undo' ? 'st.undo.done' : 'st.redo.done', { what: step.label, key: window.Shortcuts?.show(dir === 'undo' ? 'redo' : 'undo') ?? '' }), 'ok');
  }
  window.__undo = { state: () => ({ back: HIST.back.length, fwd: HIST.fwd.length, top: HIST.back.at(-1)?.label ?? null }) };   // for tests
  async function flush() {
    if (saving) { saveT = setTimeout(flush, 300); return; }
    saving = true; dirty = false;
    try {
      const r = await fetch('/api/notes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload() });
      if (!r.ok) throw new Error(await r.text());
      setSave(T('st.save.saved', { t: hm5(new Date()) }), 'ok');
    } catch (e) { dirty = true; setSave(T('st.save.failed'), 'err'); }
    saving = false;
  }
  async function flushNow() { clearTimeout(saveT); while (saving) await new Promise((r) => setTimeout(r, 50)); if (dirty) await flush(); return !dirty; }
  window.addEventListener('beforeunload', () => { if (dirty) fetch('/api/notes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload(), keepalive: true }); });
  let AGENT_PICK = store.get('agent', 'claude');   // chosen in « Connecter à l'agent »; the agent watching the tool wins
  const AGENT_LABELS = { claude: 'Claude Code', codex: 'Codex' };
  const agentName = () => (STATUS.agent?.watching && STATUS.agent?.agent?.name) || AGENT_LABELS[AGENT_PICK] || T('st.agent.yours');
  let repliesTxt = '', statusTxt = '', offline = false;
  async function pollReplies() {
    try {
      const t = await (await fetch('/api/replies', { cache: 'no-store' })).text();
      const s = await (await fetch('/api/status', { cache: 'no-store' })).text();
      let changed = false;
      if (t !== repliesTxt) { repliesTxt = t; REPLIES = JSON.parse(t); if (!REPLIES.notes) REPLIES.notes = {}; applyRemaps(); changed = true; }
      if (s !== statusTxt) { statusTxt = s; STATUS = JSON.parse(s); onStatus(); changed = true; }
      if (changed) renderAll();
    } catch (e) {
      if (!offline) { offline = true; setSave(T('st.save.paused'), 'err'); }
      setTimeout(pollReplies, 3000); return;
    }
    if (offline) {
      offline = false;
      try {
        const m = await (await fetch('/api/meta', { cache: 'no-store' })).json();
        if (m.render && META.render && (m.render.size !== META.render.size || m.render.mtime !== META.render.mtime)) { setSave(T('st.save.newVideo'), 'ok'); const f = curFrame(); await flushNow(); location.hash = `f=${f}`; location.reload(); return; }
        setSave(T('st.save.back'), 'ok');
      } catch { /* next round */ }
    }
    setTimeout(pollReplies, 3000);
  }
  function applyRemaps() {
    if (!META?.render) return;
    let changed = false;
    for (const n of notes) {
      const m = REPLIES.notes?.[n.id]?.remap;
      if (!m || !m.render || m.render.size !== META.render.size || (n.render && n.render.size === META.render.size)) continue;
      (n.before ??= []).push({ frame: n.frame, end: n.end, render: n.render });
      n.frame = m.frame; n.end = m.end ?? null; n.render = META.render; stamp(n); changed = true;
    }
    if (changed) { save(); setSave(T('st.save.remapped'), 'ok'); }
  }
  function onStatus() {
    const a = STATUS.agent ?? {}, b = $('#agent');
    b.classList.toggle('on', !!a.watching);
    b.querySelector('.t').textContent = a.watching ? T('st.agent.on', { name: a.agent?.name ? ' · ' + a.agent.name : '' }) : T('st.agent.connect');
    b.title = a.watching ? T('st.agent.watchTitle', { name: a.agent?.name ?? T('st.agent.Yours'), since: hhmm(a.since) }) : T('st.agent.clickTitle');
    const ver = STATUS.code?.version ?? 0;
    if (SP && ver !== codeVer && STATUS.code?.status === 'ready') {
      if (mode === 'code') { if (codeLoad?.ver !== ver) loadCode(); }   // shown when ready, at the frame and in the state of now
      else if (codeLoad?.ver !== ver) loadCode();   // the MP4 shown: the preview made ready behind, asleep (01-preview.js)
    } else if (!SP && mode === 'code' && STATUS.code?.status === 'ready' && !codeLoading) loadCode();   // the preview was not built yet at the start
    if ((STATUS.timeline?.version ?? 0) !== liveVer) loadLive();
    showCodeStatus();
    renderPill(); onHeld();
  }
  let liveVer = -1;
  async function loadLive() {
    try {
      const r = await (await fetch('/api/timeline', { cache: 'no-store' })).json();
      if (r.status === 'ready' && r.data) { LIVE = r.data; liveVer = r.version; buildLanes(); draw(); renderInspector(); }
    } catch { /* retried with the next status */ }
  }

