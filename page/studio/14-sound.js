// The studio's page (studio.html), part 14: the sound measured (user request, 16/10/2026, from HyperFrames Studio's audio
// meters, loudness and clip indicator: « mets tout, check comment bien le marier à l'interface »). EBU R128, as YouTube
// and the channels' finishings measure it (lib/loudness.mjs, /api/loudness): the reviewed video's loudness every 0,1 s.
//   - the timeline: a lane « Son mesuré » under « Mix »: the short-term loudness (3 s) as an area, the momentary one (0,4 s)
//     as a thin line, YouTube's reference (−14 LUFS) dashed, every 100 ms whose true peak passes −1 dBTP in red;
//   - the transport: a meter by the volume (the short-term loudness at the playhead, its peak red when it passes −1 dBTP);
//   - the Inspector: the playhead's values, the whole video's (integrated, range, peak), a range's measured exactly
//     (the note chosen, or the R range being marked).
// The values are the rendered MP4's: in « Code actuel » too (said in the meter's title).
  // (var: part 08's first tick, before this part runs, finds them undefined and does nothing)
  var LOUD = { state: null, data: null, asked: -1e9, ranges: new Map() };
  var REF_LUFS = -14, PEAK_MAX = -1;   // YouTube's reference loudness; the true peak not to pass
  var dbv = (v) => (v === null || v === undefined ? '—' : v <= -69.9 ? '−∞' : `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', T('st.ex.decimal'))}`);
  function loudFetch() {
    if (!LOUD) return;
    const vid = STATUS?.video ?? META?.render; if (!vid) return;
    const k = `${vid.name}|${vid.size}|${vid.mtime}`;   // a new video under review: measured again
    if (k !== LOUD.key) { LOUD.key = k; LOUD.state = null; LOUD.data = null; LOUD.ranges.clear(); LOUD.asked = -1e9; }
    if (LOUD.state === 'ready' || LOUD.state === 'none') return;
    if (LOUD.state === 'error' && performance.now() - LOUD.asked < 60000) return;   // (asked again a minute later, not every 2.5 s)
    if (performance.now() - LOUD.asked < 2500) return;
    LOUD.asked = performance.now();
    fetch('/api/loudness', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (k !== LOUD.key) return;   // (an answer about the video before)
      LOUD.state = j.state; if (j.data) LOUD.data = j.data;
      if (j.state === 'building') setTimeout(loudFetch, 2600);
      scheduleDraw(); renderInspector(true); loudMeter();
    }).catch(() => {});
  }
  var loudIdx = (t) => (LOUD.data ? Math.max(0, Math.min(LOUD.data.S.length - 1, Math.floor(t / LOUD.data.step))) : -1);
  function loudAt(t) {
    const d = LOUD.data, i = loudIdx(t); if (!d || i < 0) return null;
    let p = -70; for (let k = Math.max(0, i - 2); k <= Math.min(d.P.length - 1, i + 2); k++) p = Math.max(p, d.P[k]);
    return { S: d.S[i] <= -69.9 && t < 3 ? null : d.S[i], M: d.M[i], P: p };   // (the short-term loudness needs 3 s of sound)
  }
  // the lane (part 08 draws it): x → the values of the pixel's time slice
  function drawLoud(g, y, h) {
    if (!LOUD) return;
    const d = LOUD.data;
    if (!d) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = `10.5px ${FONT}`; g.fillText(T(LOUD.state === 'building' || !LOUD.state ? 'st.loud.measuring' : LOUD.state === 'error' ? 'st.loud.error' : 'st.loud.none'), 8, y + h / 2 + 3); return; }
    const lo = -42, hi = -4, Yv = (v) => y + h - (Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * h);
    const n = d.S.length, x0 = Math.max(0, tx(0)), x1 = Math.min(W, tx(n * d.step));
    // the short-term loudness: an area; the momentary: a line; the peaks over −1 dBTP: red
    g.beginPath(); g.moveTo(x0, y + h);
    const reds = [];
    for (let x = Math.floor(x0); x <= x1; x++) {
      const i0 = loudIdx(xt(x)), i1 = Math.max(i0, loudIdx(xt(x + 1)));
      let s = -70, pk = -70; for (let i = i0; i <= i1; i++) { if (d.S[i] > s) s = d.S[i]; if (d.P[i] > pk) pk = d.P[i]; }
      g.lineTo(x, Yv(s)); if (pk > PEAK_MAX) reds.push(x);
    }
    g.lineTo(x1, y + h); g.closePath(); g.fillStyle = 'rgba(126, 211, 255, 0.22)'; g.fill();
    g.beginPath();
    for (let x = Math.floor(x0); x <= x1; x += 1) { const i = loudIdx(xt(x)); const v = Yv(d.M[i]); if (x === Math.floor(x0)) g.moveTo(x, v); else g.lineTo(x, v); }
    g.strokeStyle = 'rgba(126, 211, 255, 0.55)'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = 'rgba(255, 210, 127, 0.75)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x0, Yv(REF_LUFS) + 0.5); g.lineTo(x1, Yv(REF_LUFS) + 0.5); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255, 80, 80, 0.95)'; for (const x of reds) g.fillRect(x, y, 1.5, 4);
  }
  function loudTip(t) {
    if (!LOUD) return '';
    const v = loudAt(t), d = LOUD.data;
    if (!v) return T(LOUD.state === 'building' || !LOUD.state ? 'st.loud.measuring' : 'st.loud.none');
    return T('st.loud.tip', { t: fmt(t), s: dbv(v.S), m: dbv(v.M), p: dbv(v.P), sat: v.P > PEAK_MAX ? T('st.loud.sat') : '', i: dbv(d.I), tp: dbv(d.TP), ref: dbv(REF_LUFS) });
  }
  // the meter by the volume
  function loudMeter() {
    const el = $('#loudM'); if (!el || !LOUD) return;
    loudFetch();   // (asked once, then every 2,5 s while it is being measured: the lane may be out of view)
    const v = LOUD.data ? loudAt((curFrame() + 0.5) / FPS) : null;
    el.classList.toggle('on', !!LOUD.data);
    if (!v) return;
    const s = v.S ?? v.M, pct = Math.max(0, Math.min(100, ((s + 42) / 38) * 100)), sat = v.P > PEAK_MAX;
    el.querySelector('i').style.width = `${pct}%`;
    el.querySelector('.lv').textContent = dbv(s);
    el.classList.toggle('sat', sat);
    el.title = T('st.loud.meter', { s: dbv(s), p: dbv(v.P), ref: dbv(REF_LUFS), src: mode === 'code' ? T('st.loud.fromMp4') : '' });
  }
  // the Inspector's « Son mesuré »: the playhead, the whole video, a range (the note chosen, or the R range)
  function soundRows() {
    if (!LOUD) return [];
    const d = LOUD.data, out = [`<h3 style="margin-top:14px">${T('st.loud.title')}</h3>`];
    if (!d) { out.push(`<div class="empty">${T(LOUD.state === 'building' || !LOUD.state ? 'st.loud.measuring' : LOUD.state === 'error' ? 'st.loud.error' : 'st.loud.none')}</div>`); return out; }
    const t = (curFrame() + 0.5) / FPS, v = loudAt(t), warn = (x) => (x > PEAK_MAX ? ` <span class="bad">${T('st.loud.sat')}</span>` : '');
    const n = sel && byId(sel), rg = rangeStart !== null ? [Math.min(rangeStart, curFrame()), Math.max(rangeStart, curFrame())] : n && n.end !== null ? [n.frame, n.end] : null;
    const key = rg ? rg.join('-') : null, R = key ? LOUD.ranges.get(key) : null;
    const pairs = [
      [T('st.loud.here'), v ? `${dbv(v.S)} LUFS <span class="muted">(3 s)</span> · ${dbv(v.M)} <span class="muted">(0,4 s)</span><br>${T('st.loud.peak')} ${dbv(v.P)} dBTP${warn(v.P)}` : '—'],
      [T('st.loud.whole'), `${dbv(d.I)} LUFS ${T('st.loud.integrated')} · ${T('st.loud.lra')} ${dbv(d.LRA).replace('−', '')} LU<br>${T('st.loud.peak')} ${dbv(d.TP)} dBTP${warn(d.TP)} <span class="muted">· ${T('st.loud.refIs', { ref: dbv(REF_LUFS) })}</span>`],
    ];
    if (rg) pairs.push([T('st.loud.range', { a: fmt(rg[0] / FPS), b: fmt((rg[1] + 1) / FPS) }), R?.I !== undefined ? `${dbv(R.I)} LUFS · ${T('st.loud.lra')} ${dbv(R.LRA).replace('−', '')} LU<br>${T('st.loud.peak')} ${dbv(R.TP)} dBTP${warn(R.TP)}` : R?.busy ? T('st.loud.measuringRange') : `<button class="soft" id="loudRange" data-a="${rg[0]}" data-b="${rg[1]}">${T('st.loud.measure')}</button>`]);
    out.push(`<div class="box"><dl>${pairs.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}</dl></div>`);
    return out;
  }
  // (one listener on the Inspector: its content is rewritten at every frame)
  $('#insp')?.addEventListener('click', (e) => { const b = e.target.closest?.('#loudRange'); if (b) loudRangeMeasure([+b.dataset.a, +b.dataset.b]); });
  window.__loud = () => ({ state: LOUD.state, key: LOUD.key, n: LOUD.data?.S.length ?? null, ranges: [...LOUD.ranges] });   // (the tests)
  async function loudRangeMeasure(rg) {
    const key = rg.join('-'); LOUD.ranges.set(key, { busy: true }); renderInspector(true);
    try {
      const r = await (await fetch(`/api/loudness/range?a=${rg[0] / FPS}&b=${(rg[1] + 1) / FPS}`, { cache: 'no-store' })).json();
      LOUD.ranges.set(key, r.ok ? r : { I: null, LRA: null, TP: null });
    } catch { LOUD.ranges.delete(key); }
    renderInspector(true);
  }
