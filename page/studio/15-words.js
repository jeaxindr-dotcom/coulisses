// The studio's page (studio.html), part 15: « Paroles », the words heard in the video (user request, 16/10/2026, from
// HyperFrames Studio's transcription: « mets tout, check comment bien le marier à l'interface »). The reviewed MP4
// transcribed word by word (lib/transcript.mjs: « hyperframes transcribe », Parakeet or Whisper, on this PC):
//   - the timeline bar: the « Paroles » button (to transcribe, the language, the engine: a small panel), then, once there,
//     a search field: the words found are lit in the lane, Entrée goes to the next one, Maj+Entrée to the one before
//     (Ctrl+F there; Échap leaves it);
//   - the timeline: a lane « Paroles » above the sound, its phrases (each word at its place once zoomed in); the mouse
//     over one says it, a double-click makes a range note on it (as on a line of the plan);
//   - the Inspector: what is said at the playhead; a note keeps it (« heard »: the agent reads the words of its moment).
// The words are the rendered MP4's (in « Code actuel » too). A project transcribed once is transcribed again by itself
// at each new render (revue/paroles.json keeps its language).
  // (var: the parts before this one may run into them first, at the start)
  var WORDS = { state: null, data: null, key: null, asked: -1e9, pct: 0, error: null, engines: null, choice: null, q: '', hits: [], hit: -1, J: null };
  var WLANGS = ['auto', 'ja', 'zh', 'ko', 'ar', 'hi', 'tr', 'vi', 'th', 'id', 'he', 'fa'];
  function wordsFetch(force) {
    if (!WORDS) return;
    const vid = STATUS?.video ?? META?.render; if (!vid) return;
    const k = `${vid.name}|${vid.size}|${vid.mtime}`;   // a new video: its own words (the server transcribes it again if the project was)
    if (k !== WORDS.key) { WORDS.key = k; WORDS.state = null; WORDS.data = null; WORDS.J = null; WORDS.hits = []; WORDS.hit = -1; WORDS.asked = -1e9; force = true; }
    if (!force && WORDS.state !== 'building' && !wordsPopOpen()) return;
    if (performance.now() - WORDS.asked < 1800) return;
    WORDS.asked = performance.now();
    fetch('/api/transcript', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (k !== WORDS.key) return;   // (an answer about the video before)
      const was = WORDS.state;
      WORDS.state = j.state; WORDS.pct = j.pct ?? 0; WORDS.error = j.error ?? null; WORDS.engines = j.engines ?? null; WORDS.choice = j.choice ?? null;
      if (j.data && j.data !== WORDS.data) { WORDS.data = j.data; wordsIndex(); }
      if (j.state === 'building' || WORDS.engines?.installing) setTimeout(() => wordsFetch(true), 2000);
      if (was !== j.state) { buildLanes(); renderInspector(true); if (was === 'building' && j.state === 'ready') setSave(WORDS.data?.words.length ? T('st.words.done', { n: WORDS.data.words.length }) : T('st.words.empty'), 'ok'); }
      wordsBar(); scheduleDraw();
    }).catch((e) => console.warn('Paroles :', e));
  }
  // the search: the words' normal form joined (no case, no accents, no punctuation), each word's place in it
  // (functions, not consts: the parts before this one call them)
  function wnorm(s) { return String(s).toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
  function wjoin() { return /^(ja|zh|ko|th)$/.test(WORDS?.data?.lang ?? '') ? '' : ' '; }
  function wordsIndex() {
    const ws = WORDS.data?.words ?? [], sep = wjoin(); let s = '', at = [];
    for (const w of ws) { if (s) s += sep; at.push(s.length); s += wnorm(w.w); }
    WORDS.J = { s, at };
    if (WORDS.q) wordsFind(WORDS.q, false);
  }
  function wordsFind(q, jump = true) {
    WORDS.q = q; WORDS.hits = []; WORDS.hit = -1;
    const n = wnorm(q), J = WORDS.J, ws = WORDS.data?.words ?? [];
    if (n && J) {
      const idx = (o) => { let lo = 0, hi = J.at.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (J.at[m] <= o) lo = m; else hi = m - 1; } return lo; };
      for (let o = J.s.indexOf(n); o >= 0 && WORDS.hits.length < 2000; o = J.s.indexOf(n, o + 1)) {
        const i = idx(o), j = idx(o + n.length - 1);
        if (WORDS.hits.length && WORDS.hits[WORDS.hits.length - 1].i === i) continue;
        WORDS.hits.push({ i, j, a: ws[i].a, b: ws[j].b });
      }
    }
    if (jump && WORDS.hits.length) wordsGo(0, true); else { wordsBar(); scheduleDraw(); }
  }
  // the next hit after the playhead (dir 1), the one before (−1); from: the first one from where the playhead is
  function wordsGo(dir, from = false) {
    const H = WORDS.hits; if (!H.length) { wordsBar(); return; }
    const t = curFrame() / FPS;
    let k;
    if (from) { k = H.findIndex((h) => h.b >= t); if (k < 0) k = 0; }
    else if (dir > 0) { k = H.findIndex((h) => h.a > t + 0.05); if (k < 0) k = 0; }
    else { k = -1; for (let i = H.length - 1; i >= 0; i--) if (H[i].a < t - 0.05) { k = i; break; } if (k < 0) k = H.length - 1; }
    WORDS.hit = k;
    M.pause(); seekFrame(Math.max(0, Math.floor(H[k].a * FPS + 1e-6)));
    wordsLaneInView();
    wordsBar(); scheduleDraw();
  }
  // the lane of the words in view (the timeline may hold many lanes): scrolled to it if it is under or over
  function wordsLaneInView() {
    const l = lanes.find((x) => x.id === 'words'); if (!l || l.y === undefined) return;
    if (l.y < Y.top || l.y + l.h > H) { vscroll = Math.max(0, l.y + vscroll - Y.top - 4); draw(); }
  }
  // the phrase at t (or null), the words of a span of time (a note's)
  function wPhraseAt(t) { return (WORDS?.data?.phrases ?? []).find((p) => p.a - 0.15 <= t && t <= p.b + 0.15) ?? null; }
  function heardIn(f0, f1) {
    if (!WORDS?.data) return '';
    const a = f0 / FPS - 0.3, b = (f1 + 1) / FPS + 0.3, ws = WORDS.data.words.filter((w) => w.b >= a && w.a <= b).map((w) => w.w);
    const s = ws.join(wjoin()); return s.length > 280 ? s.slice(0, 277) + '…' : s;
  }

  // ---- the lane (part 08 draws it, above the sound) ----
  function wordsLane() { return WORDS && (WORDS.data || WORDS.state === 'building' || WORDS.state === 'error') ? [{ id: 'words', name: T('st.lane.words'), bh: 26 }] : []; }
  function drawWords(g, y, h, TL) {
    if (!WORDS) return;
    const d = WORDS.data, msg = (t) => { g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = `10.5px ${FONT}`; g.fillText(t, 8, y + h / 2); };
    if (!d) { msg(WORDS.state === 'building' ? T('st.words.building', { pct: WORDS.pct }) : WORDS.state === 'error' ? T('st.words.failed') : ''); return; }
    if (!d.words.length) { msg(T('st.words.empty')); return; }
    const ws = d.words, hitOf = new Map();
    WORDS.hits.forEach((x, k) => { for (let i = x.i; i <= x.j; i++) hitOf.set(i, k === WORDS.hit ? 2 : 1); });
    g.font = `500 10.5px ${FONT}`;
    for (const p of d.phrases) {
      if (p.b < view.a || p.a > view.b) continue;
      const x0 = tx(p.a), x1 = tx(p.b), w = Math.max(2, x1 - x0);
      g.fillStyle = tone(TL, 0.15); rr(g, x0, y, w, h, 4); g.fill();
      g.fillStyle = tone(TL, 0.55); g.fillRect(x0, y + h - 2, w, 2);
      // the words found: lit (the current one brighter)
      for (let i = p.i0; i <= p.i1; i++) {
        const k = hitOf.get(i); if (!k) continue;
        const a = tx(ws[i].a), b = tx(ws[i].b);
        g.fillStyle = k === 2 ? 'rgba(255, 210, 127, 0.75)' : 'rgba(255, 210, 127, 0.38)'; rr(g, a, y + 1, Math.max(3, b - a), h - 2, 3); g.fill();
      }
      if (w < 18 || h < 11) continue;
      g.save(); g.beginPath(); g.rect(x0, y, w - 2, h); g.clip();
      // zoomed in: each word at its place; else the phrase from its start
      let roomy = true;
      for (let i = p.i0; i <= p.i1 && roomy; i++) { const nx = i < p.i1 ? tx(ws[i + 1].a) : x1 + 40; if (nx - tx(ws[i].a) < g.measureText(ws[i].w).width + 4) roomy = false; }
      g.fillStyle = tone(TL, 0.95);
      if (roomy) for (let i = p.i0; i <= p.i1; i++) g.fillText(ws[i].w, tx(ws[i].a) + 2, y + h / 2);
      else g.fillText(p.text, x0 + 6, y + h / 2);
      g.restore();
    }
  }
  function wordsTip(t) {
    if (!WORDS?.data) return WORDS?.state === 'building' ? T('st.words.building', { pct: WORDS.pct }) : T('st.lane.words');
    const p = wPhraseAt(t); if (!p) return T('st.words.silence', { t: fmt(t) });
    const w = WORDS.data.words.slice(p.i0, p.i1 + 1).find((x) => x.a - 0.05 <= t && t <= x.b + 0.05);
    return T('st.words.tip', { text: p.text, a: fmt(p.a), b: fmt(p.b), word: w ? T('st.words.tipWord', { w: w.w }) : '' });
  }

  // ---- the Inspector: what is said here ----
  function wordsRows() {
    if (!WORDS?.data) return [];
    const t = (curFrame() + 0.5) / FPS, p = wPhraseAt(t);
    const next = p ? null : WORDS.data.phrases.find((x) => x.a > t);
    return [`<h3 style="margin-top:14px">${T('st.lane.words')}</h3>`,
      `<div class="box"><dl><dt>${T(p ? 'st.words.here' : 'st.words.next')}</dt><dd>${p ? `« ${esc(p.text)} »` : next ? `« ${esc(next.text)} » <span class="muted">${T('st.words.at', { t: fmt(next.a) })}</span>` : '—'}</dd></dl></div>`];
  }

  // ---- the timeline bar: the « Paroles » button, its panel, the search field ----
  function wordsPopOpen() { return !!$('#wPop')?.classList.contains('open'); }
  function wordsBar() {
    const el = $('#words'); if (!el || !WORDS) return;
    const ready = !!WORDS.data, st = WORDS.state;
    el.classList.toggle('ready', ready);
    el.style.display = STATUS?.video ?? META?.render ? '' : 'none';
    const b = $('#wBtn');
    b.querySelector('span').textContent = st === 'building' ? T('st.words.btnBuilding', { pct: WORDS.pct }) : ready ? '' : T('st.lane.words');
    b.title = T(ready ? 'st.words.btnReady' : 'st.words.btnIdle');
    const n = $('#wn'), H = WORDS.hits;
    n.textContent = !WORDS.q ? '' : H.length ? `${WORDS.hit >= 0 ? WORDS.hit + 1 : '–'} / ${H.length}` : T('st.words.noHit');
    n.classList.toggle('none', !!WORDS.q && !H.length);
    if (wordsPopOpen()) wordsPop(true);
  }
  function wordsPop(on) {
    const p = $('#wPop'); if (!p) return;
    if (!on) { p.classList.remove('open'); return; }
    const E = WORDS.engines, d = WORDS.data, st = WORDS.state;
    const cur = $('#wLang')?.value ?? WORDS.choice?.lang ?? d?.asked ?? 'auto';
    const parakeet = cur === 'auto', canGo = E?.cli && (!parakeet || E.parakeet) && st !== 'building';
    const state = st === 'building' ? T('st.words.stBuilding', { pct: WORDS.pct })
      : d ? T('st.words.stReady', { n: d.words.length, engine: d.engine === 'parakeet' ? 'Parakeet' : 'Whisper', lang: d.lang ? d.lang.toUpperCase() : T('st.words.langFound') })
      : st === 'error' ? T('st.words.stError', { why: esc(WORDS.error ?? '') }) : st === 'noCli' || (E && !E.cli) ? T('hf.noneShort') : T('st.words.stIdle');
    const eng = !E?.cli ? '' : parakeet ? (E.parakeet ? T('st.words.engParakeet')
      : E.installing ? T('st.words.installing') : `${T('st.words.noParakeet')}${E.installError ? ` <span class="bad">${esc(E.installError)}</span>` : ''}<button class="soft" id="wInstall">${T('st.words.install')}</button>`)
      : T('st.words.engWhisper');
    p.innerHTML = `<b>${T('st.lane.words')}</b><p class="muted">${state}</p>
      <label>${T('st.words.lang')}<select id="wLang">${WLANGS.map((l) => `<option value="${l}"${l === cur ? ' selected' : ''}>${T('st.words.l.' + l)}</option>`).join('')}</select></label>
      <p class="eng">${eng}</p>
      <button class="soft go" id="wGo"${canGo ? '' : ' disabled'}>${T(d ? 'st.words.again' : 'st.words.go')}</button>
      <p class="muted small">${T('st.words.auto')}</p>`;
    const r = $('#wBtn').getBoundingClientRect();
    p.classList.add('open');
    p.style.left = `${Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left))}px`;
    p.style.top = `${Math.max(8, r.top - p.offsetHeight - 8)}px`;
  }
  async function wordsStart() {
    const lang = $('#wLang')?.value ?? 'auto';
    WORDS.state = 'building'; WORDS.pct = 0; wordsBar();
    try { const j = await (await fetch('/api/transcript/start', { method: 'POST', body: JSON.stringify({ lang }) })).json(); WORDS.state = j.state; } catch { /* asked again below */ }
    WORDS.asked = -1e9; buildLanes(); scheduleDraw(); wordsFetch(true);
    setSave(T('st.words.started'), 'ok');
  }
  // Ctrl+F (part 09), « Affichage › Paroles »: the field when the words are there, else the panel
  function wordsFocus() {
    if (WORDS?.data) { const q = $('#wq'); q.focus(); q.select(); }
    else { wordsFetch(true); wordsPop(true); }
  }
  function initWords() {
    const q = $('#wq'); if (!q) return;
    let tm = null;
    // typed: the words found lit at once; the first Entrée goes to the first one from the playhead, the next ones further
    let fresh = false;
    q.addEventListener('input', () => { fresh = true; clearTimeout(tm); tm = setTimeout(() => wordsFind(q.value, false), 120); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tm); if (fresh || wnorm(q.value) !== wnorm(WORDS.q)) { fresh = false; wordsFind(q.value, true); } else wordsGo(e.shiftKey ? -1 : 1); }
    });
    $('#wPrev').addEventListener('click', () => wordsGo(-1));
    $('#wNext').addEventListener('click', () => wordsGo(1));
    $('#wBtn').addEventListener('click', () => { if (wordsPopOpen()) wordsPop(false); else { wordsFetch(true); wordsPop(true); } });
    const p = $('#wPop');
    p.addEventListener('click', (e) => {
      if (e.target.closest('#wGo')) { wordsPop(false); wordsStart(); }
      else if (e.target.closest('#wInstall')) { fetch('/api/transcript/install', { method: 'POST' }).then(() => { WORDS.asked = -1e9; wordsFetch(true); }); if (WORDS.engines) WORDS.engines.installing = true; wordsPop(true); }
    });
    p.addEventListener('change', (e) => { if (e.target.id === 'wLang') wordsPop(true); });
    document.addEventListener('pointerdown', (e) => { if (wordsPopOpen() && !e.target.closest('#wPop, #wBtn')) wordsPop(false); }, true);
    window.__words = () => ({ bar: $('#words')?.className + ' ' + $('#words')?.style.display, key: WORDS.key, state: WORDS.state, n: WORDS.data?.words.length ?? null, hits: WORDS.hits.length, hit: WORDS.hit, q: WORDS.q, engines: WORDS.engines });   // (the tests)
    wordsFetch(true);
  }
