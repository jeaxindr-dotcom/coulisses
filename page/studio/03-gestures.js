// The studio's page (studio.html), part 03: the overlay on the image (pins, drawings, the hover), the « what should change here? » box.
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  // ---------- overlay on the image ----------
  let tool = 'select', pickPt = null, drawing = null, stroke = null, popFor = null;
  const ovRect = () => ov.getBoundingClientRect();
  // composition pixel under the pointer (0…1919, 0…1079): the pixel the user sees under the cursor tip
  const toComp = (e) => { const r = ovRect(); return [Math.min(CW - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * CW))), Math.min(CH - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * CH)))]; };
  const toPx = ([x, y]) => { const r = ovRect(); return [(x + 0.5) / CW * r.width, (y + 0.5) / CH * r.height]; };
  function setTool(t) {
    tool = t; ov.className = t;
    document.querySelectorAll('#rail button[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    if (t !== 'draw' && drawing && !popFor) drawing = null;
    if (t !== 'select') { pickPt = null; $('#pickBtn').style.display = 'none'; hideHover(); }
    drawOv();
  }
  document.querySelectorAll('#rail button[data-tool]').forEach((b) => b.onclick = () => setTool(b.dataset.tool));
  const thin = (pts, n) => pts.length <= n ? pts : Array.from({ length: n }, (_, i) => pts[Math.round(i * (pts.length - 1) / (n - 1))]);
  const visibleNotes = () => { const f = curFrame(); return notes.filter((n) => n.mark && f >= n.frame && f <= (n.end ?? n.frame)); };
  // a mark on the image (also drawn at full size, k = 1, into the PNG sent with a batch)
  function paintMark(g, mark, label, k, color, faded, bw = CW * k) {
    g.save(); g.globalAlpha = faded ? 0.5 : 1;
    g.lineJoin = g.lineCap = 'round';
    const halo = (fn, w) => { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = w + 3 * Math.max(1, k * 2); fn(); g.strokeStyle = color; g.lineWidth = w; fn(); };
    let lx, ly;
    if (mark.kind === 'pin') {
      const [x, y] = [(mark.points[0][0] + 0.5) * k, (mark.points[0][1] + 0.5) * k], R = Math.max(7, 14 * k);
      halo(() => { g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke(); }, Math.max(1.5, 3 * k));
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x, y, Math.max(2.4, 4 * k), 0, Math.PI * 2); g.fill();
      g.fillStyle = color; g.beginPath(); g.arc(x, y, Math.max(1.6, 2.6 * k), 0, Math.PI * 2); g.fill();   // the exact pixel
      lx = x + R + 4; ly = y - R;
    } else {
      for (const s of mark.strokes ?? [mark.points]) halo(() => { g.beginPath(); s.forEach(([x, y], i) => (i ? g.lineTo((x + 0.5) * k, (y + 0.5) * k) : g.moveTo((x + 0.5) * k, (y + 0.5) * k))); g.stroke(); }, Math.max(1.8, 4 * k));
      const xs = (mark.strokes ?? [mark.points]).flat().map((p) => p[0]), ys = (mark.strokes ?? [mark.points]).flat().map((p) => p[1]);
      lx = Math.max(...xs) * k + 6; ly = Math.min(...ys) * k;
    }
    if (label) {
      const fs = Math.max(10.5, 22 * k); g.font = `600 ${fs}px "Segoe UI Variable Text", "Segoe UI", sans-serif`;
      const w = g.measureText(label).width + fs * 0.9, hh = fs * 1.45;
      if (lx + w > bw - 4) lx = Math.max(4, (mark.kind === 'pin' ? (mark.points[0][0] + 0.5) * k - Math.max(7, 14 * k) - 4 : Math.min(...(mark.strokes ?? [mark.points]).flat().map((p) => p[0])) * k - 6) - w);   // flip left at the right edge
      ly = Math.max(hh / 2 + 2, ly);
      g.fillStyle = color; g.beginPath(); g.roundRect(lx, ly - hh / 2, w, hh, hh / 2); g.fill();
      g.fillStyle = '#1d160b'; g.textBaseline = 'middle'; g.fillText(label, lx + fs * 0.45, ly + 0.5);
    }
    g.restore();
  }
  function drawOv() {
    const dpr = window.devicePixelRatio || 1, r = ovRect();
    if (!r.width) return;
    if (ov.width !== Math.round(r.width * dpr) || ov.height !== Math.round(r.height * dpr)) { ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr); }
    const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const k = r.width / CW, num = new Map(sorted().map((n, i) => [n.id, i + 1]));
    for (const n of visibleNotes()) {
      const done = statusOf(n) === 'done';
      paintMark(g, n.mark, String(num.get(n.id)), k, n.id === sel ? C.acc : (done ? C.done : C.mark), done && n.id !== sel);
    }
    if (drawing) paintMark(g, { kind: 'circle', strokes: [...drawing.strokes, ...(stroke ? [stroke] : [])] }, '', k, C.acc);
    else if (stroke) paintMark(g, { kind: 'circle', strokes: [stroke] }, '', k, C.acc);
    if (pickPt && !drawing) paintMark(g, { kind: 'pin', points: [pickPt.pt] }, '', k, C.acc);
  }
  function markHit(pt) {
    for (const n of visibleNotes()) {
      const pts = n.mark.kind === 'pin' ? n.mark.points : (n.mark.strokes ?? [n.mark.points]).flat();
      if (pts.some(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) < 26)) return n;
    }
    return null;
  }
  // hover (select tool): the object that a click will target, named next to the cursor — pixel-exact ray cast in the
  // live preview of the code, at the frame shown (loaded hidden on first use)
  let hoverT = 0, hoverPending = false;
  const hideHover = () => { $('#hoverTag').style.display = 'none'; };
  // a label next to the cursor: on its right, or on its left when it would leave the image; kept inside vertically
  function placeBeside(el, pt) {
    const [px, py] = toPx(pt), r = ovRect(), w = el.offsetWidth, h = el.offsetHeight;
    el.classList.toggle('left', px + 16 + w > r.width - 6 && px - 16 - w >= 6);
    el.style.left = px + 'px';
    el.style.top = Math.max(h / 2 + 6, Math.min(r.height - h / 2 - 6, py)) + 'px';
  }
  async function hoverAt(e) {
    if (tool !== 'select' || popFor || stroke || !M.paused) { hideHover(); return; }
    const t = performance.now(); if (t - hoverT < 70 || hoverPending) return;
    hoverT = t; hoverPending = true;
    try {
      const sp = SP ?? (await loadCode()); if (!sp) return;
      const f = curFrame();
      if (sp.frame() !== f) { sp.pause(); sp.seek(f); return; }   // the next move names it
      const pt = toComp(e), h = sp.hover(f, pt[0], pt[1]), tag = $('#hoverTag');
      if (h === undefined) return;
      const tt = humanTarget(h);
      if (!tt || markHit(pt)) { hideHover(); return; }
      tag.innerHTML = `${esc(tt.name)}<span class="k">${esc(tt.kind)}</span>`; tag.style.display = 'block'; placeBeside(tag, pt);
    } finally { hoverPending = false; }
  }
  ov.addEventListener('pointerleave', hideHover);
  ov.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const pt = toComp(e); hideHover();
    if (popFor && tool !== 'draw') { closePop(); return; }
    if (tool === 'select') {
      const n = markHit(pt);
      if (n) { sel = n.id; pickPt = null; $('#pickBtn').style.display = 'none'; renderAll(); showCard(n.id); return; }
      M.pause(); pickPt = { pt, frame: curFrame() };
      const b = $('#pickBtn'); b.style.display = 'inline-flex'; placeBeside(b, pt);
      drawOv(); return;
    }
    if (tool === 'comment') { M.pause(); openPop({ kind: 'pin', points: [pt] }, curFrame()); return; }
    if (tool === 'draw') {
      if (queueFull()) return;
      M.pause(); ov.setPointerCapture(e.pointerId);
      if (drawing && drawing.frame !== curFrame()) { drawing = null; closePop(); }
      stroke = [pt]; drawOv();
    }
  });
  ov.addEventListener('pointermove', (e) => {
    if (!stroke) { ov.title = markHit(toComp(e)) ? T('st.ov.pickNote') : ''; hoverAt(e); return; }
    const pt = toComp(e), last = stroke[stroke.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= 4) { stroke.push(pt); drawOv(); }
  });
  ov.addEventListener('pointerup', () => {
    if (!stroke) return;
    const s = stroke; stroke = null;
    if (s.length < 4) { drawOv(); return; }
    drawing ??= { frame: curFrame(), strokes: [] };
    if (drawing.strokes.length < 200) drawing.strokes.push(thin(s, 32));
    openPop({ kind: 'circle', strokes: drawing.strokes }, drawing.frame);
  });
  $('#pickBtn').onclick = () => promptAtPick();
  window.__studio = { state: () => ({ staging, stage: stSel?.id ?? null, tool, mode, tab, vzoom, drawing, popFor: popFor && { frame: popFor.frame, kind: popFor.mark.kind }, stroke: stroke?.length ?? null, drafts: drafts().length, frame: curFrame(), lanes: lanes.map((l) => l.name), view: { ...view }, vscroll,
    video: META?.render?.size ?? null, held: wasHeld, proj: PROJ, size: [CW, CH], cmp: cmpOpen() ? { i: cmpI, n: CMP.length, x: cmpX } : null, renderView: STATUS.lots ? renderView().st : null }) };   // for tests
  function promptAtPick() { if (!pickPt) return; $('#pickBtn').style.display = 'none'; openPop({ kind: 'pin', points: [pickPt.pt] }, pickPt.frame); }

  // ---------- the « what should change here? » box ----------
  let pickJob = 0;
  function openPop(mark, frame) {
    const keep = popFor ? $('#popTx').value : '';
    popFor = { mark, frame, target: popFor?.frame === frame ? popFor.target : null };
    const pop = $('#pop'), all = mark.kind === 'pin' ? mark.points : mark.strokes.flat(), r = ovRect();
    const [x0, y0] = toPx([Math.min(...all.map((p) => p[0])) - 30, Math.min(...all.map((p) => p[1])) - 30]);
    const [x1, y1] = toPx([Math.max(...all.map((p) => p[0])) + 30, Math.max(...all.map((p) => p[1])) + 30]);
    pop.style.display = 'block';
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left, top = Math.max(6, Math.min(r.height - ph - 6, y0));
    if (x1 + 10 + pw <= r.width) left = x1 + 10;
    else if (x0 - 10 - pw >= 0) left = x0 - 10 - pw;
    else { left = Math.max(6, Math.min(r.width - pw - 6, x0)); top = y1 + 10 + ph <= r.height ? y1 + 10 : Math.max(6, y0 - 10 - ph); }
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    const c = contextAt(frame);
    $('#popT').innerHTML = T('st.pop.head', { what: mark.kind === 'pin' ? T('st.pop.pin') : T('st.pop.draw', { n: mark.strokes.length }), f: frame, scene: c.scene ? ' · ' + esc(c.scene) : '', code: mode === 'code' ? T('st.pop.code') : '' });
    $('#popClear').style.display = mark.kind === 'pin' ? 'none' : '';
    $('#popTx').value = keep;
    $('#popTx').focus();
    drawOv();
    identify(mark, frame);
  }
  function closePop() { $('#popTx').blur(); $('#pop').style.display = 'none'; popFor = null; drawing = null; pickPt = null; $('#pickBtn').style.display = 'none'; drawOv(); }
  function setTg(state, html) { const tg = $('#popTg'); tg.dataset.state = state; tg.innerHTML = html; }
  async function identify(mark, frame) {
    const job = ++pickJob;
    setTg('busy', `<span class="dot"></span><span class="k">${T('st.pop.searching')}</span>`);
    let pts;
    if (mark.kind === 'pin') pts = mark.points;
    else {   // a grid inside the drawing's box, kept when inside the drawn outline (as HyperFrames' 8×8 sampling)
      const all = mark.strokes.flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
      const [l, t, r, b] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const poly = all, inPoly = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
      pts = [];
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const x = l + (i + 0.5) * (r - l) / 8, y = t + (j + 0.5) * (b - t) / 8; if (inPoly(x, y)) pts.push([x, y]); }
      if (!pts.length) pts = [[(l + r) / 2, (t + b) / 2]];
    }
    try {
      const sp = await loadCode();
      if (!sp || job !== pickJob) { if (job === pickJob) setTg('done', ''); return; }
      const hits = (await sp.pickMany(frame, pts)).slice(0, 4).map((h) => ({ textures: h.textures, names: h.names, type: h.type, count: h.count, distance: h.distance }));
      if (job !== pickJob || !popFor) return;
      popFor.target = hits.length ? { frame, hits } : null;
      setTg('done', hits.length
        ? `<span class="dot"></span>${hits.slice(0, 2).map((h) => { const t = humanTarget(h); return `${esc(t.name)} <span class="k">${esc(t.kind)}</span>`; }).join(`<span class="k">${T('st.pop.then')}</span>`)}`
        : `<span class="k">${T('st.pop.none')}</span>`);
      if (mode === 'code') seekFrame(frame);
    } catch (e) { if (job === pickJob) setTg('done', ''); }
  }
  function commitPop() {
    if (!popFor) return;
    const { mark, frame, target } = popFor, text = $('#popTx').value.trim();
    const stored = mark.kind === 'pin' ? { kind: 'pin', points: [mark.points[0]] }
      : { kind: 'circle', points: thin(mark.strokes.flat(), 64), strokes: mark.strokes };
    const n = addNote(frame, null, false, { text, mark: stored, target });
    closePop();
    if (n) { setSave(T('st.pop.added'), 'ok'); showCard(n.id); }
  }
  $('#popOk').onclick = commitPop;
  $('#popCancel').onclick = closePop;
  $('#popClear').onclick = () => { drawing = null; closePop(); };
  $('#popTx').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitPop(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePop(); }
    e.stopPropagation();
  });

