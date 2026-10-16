// The studio's page (studio.html), part 16: « Historique », every change of the project's files (user request,
// 16/10/2026, from HyperFrames Studio's edit history: « mets tout, check comment bien le marier à l'interface »).
// The server keeps them (lib/history.mjs): who made each (the batch the agent was working on, or nobody known: an
// editor, another tool; a restore), the file before and after. Here:
//   - the left panel's tab « Historique »: the changes, newest first, by steps (one batch, or the changes made together);
//     each file with its lines added and removed; a step's « Revenir ici » brings the whole project back to just after
//     it (asked twice; itself a step of the history, so it can be undone the same way);
//   - a click on a file: its change over the image (as the « Planche »): the lines, before and after, numbered;
//     « Annuler ce changement » puts that file back as it was before it. Échap closes it.
// The badge of the tab counts the changes come while it was not shown. Only for a project with code (not a video
// imported alone).
  var HISTO = { ver: null, seen: null, data: null, loading: false, diff: null, confirm: null, busy: null };
  function histStatus() {
    if (!HISTO) return;
    const h = STATUS?.history;
    $('#ltabs button[data-tab="hist"]')?.classList.toggle('none', !h);
    if (!h) return;
    if (HISTO.seen === null) HISTO.seen = h.version;
    if (h.version !== HISTO.ver) { HISTO.ver = h.version; if (onTab('hist')) histLoad(); }
    const n = onTab('hist') ? 0 : Math.max(0, h.version - HISTO.seen), b = $('#nHist');
    if (b) { b.textContent = n; b.classList.toggle('zero', !n); b.classList.toggle('hot', n > 0); }
    if (onTab('hist')) HISTO.seen = h.version;
  }
  async function histLoad() {
    if (HISTO.loading) return; HISTO.loading = true;
    try { HISTO.data = await (await fetch('/api/history?limit=600', { cache: 'no-store' })).json(); } catch { /* the next poll */ }
    HISTO.loading = false; renderHist();
  }
  const histWho = (by, short = false) => {
    if (!by || by.kind === 'outside') return { cls: 'out', t: T('st.hist.byOutside'), tip: T('st.hist.byOutsideTip') };
    if (by.kind === 'restore') return { cls: 'back', t: T('st.hist.byRestore'), tip: T('st.hist.byRestoreTip') };
    const t = by.lotKind === 'chat' ? T('st.hist.byChat', { lot: by.lot }) : by.lotKind === 'render' ? T('st.hist.byRender', { lot: by.lot }) : T('st.hist.byLot', { lot: by.lot });
    return { cls: 'lot', t: short || !by.agent ? t : `${t} · ${by.agent}`, tip: T('st.hist.byLotTip', { lot: by.lot }) };
  };
  // the steps: the changes in a row by the same hand, less than 2 minutes apart (newest first)
  function histSteps(entries) {
    const steps = [], key = (e) => `${e.by?.kind}|${e.by?.lot ?? ''}|${e.by?.of ?? ''}`;
    for (const e of entries) {
      const s = steps.at(-1);
      if (s && s.key === key(e) && Date.parse(s.items.at(-1).at) - Date.parse(e.at) < 120000) s.items.push(e);
      else steps.push({ key: key(e), by: e.by, items: [e] });
    }
    return steps;
  }
  const hClock = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
  const hDay = (iso) => new Date(iso).toLocaleDateString(FR ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  function renderHist() {
    const el = $('#histList'); if (!el || !HISTO) return;
    const d = HISTO.data;
    if (!d) { el.innerHTML = `<div class="empty">${T('st.hist.loading')}</div>`; return; }
    if (!d.on) { el.innerHTML = `<div class="empty">${T(d.roots ? 'st.hist.starting' : 'st.hist.noCode')}</div>`; return; }
    $('#histSub').textContent = T('st.hist.sub', { n: d.files });
    if (!d.entries.length) { el.innerHTML = `<div class="empty">${T('st.hist.none', { since: d.since ? `${hDay(d.since)} ${hClock(d.since)}` : '' })}</div>`; return; }
    const steps = histSteps(d.entries); let day = '';
    el.innerHTML = steps.map((s, i) => {
      const w = histWho(s.by), top = s.items[0], dd = hDay(top.at), head = dd !== day ? `<div class="hday">${esc(dd)}</div>` : ''; day = dd;
      const ask = HISTO.confirm === top.id;
      const back = i === 0 ? `<span class="muted now">${T('st.hist.now')}</span>`
        : ask ? `<span class="ask">${T(HISTO.busy ? 'st.hist.askBusy' : 'st.hist.ask', { lot: HISTO.busy ?? '' })}<button class="soft mini yes" data-yes="${top.id}">${T('st.hist.yes')}</button><button class="soft mini" data-no="1">${T('st.hist.no')}</button></span>`
          : `<button class="soft mini" data-back="${top.id}" title="${esc(T('st.hist.backTip', { t: hClock(top.at) }))}">${T('st.hist.back')}</button>`;
      const files = s.items.map((e) => `<button class="hf${HISTO.diff?.id === e.id ? ' sel' : ''}" data-id="${e.id}" title="${esc(T('st.hist.fileTip', { f: e.file }))}"><span class="k ${e.kind}">${T('st.hist.k.' + e.kind)}</span><span class="fn">${esc(e.file.replace(/^[^/]+\//, ''))}</span><span class="pm">${e.add ? `<b class="p">+${e.add}</b>` : ''}${e.del ? `<b class="m">−${e.del}</b>` : ''}</span></button>`).join('');
      return `${head}<div class="hstep"><div class="hh"><span class="who ${w.cls}" title="${esc(w.tip)}">${esc(w.t)}</span><span class="muted">${hClock(top.at)}</span><span class="grow"></span>${back}</div>${files}</div>`;
    }).join('') + (d.total > d.entries.length ? `<div class="empty">${T('st.hist.older', { n: d.total - d.entries.length })}</div>` : '');
  }
  async function histRestore(id, force = false) {
    try {
      const r = await (await fetch('/api/history/restore', { method: 'POST', body: JSON.stringify({ id, to: 'after', scope: 'all', force }) })).json();
      if (!r.ok && r.busy && !force) { HISTO.busy = r.busy; HISTO.confirm = id; renderHist(); return; }
      HISTO.confirm = null; HISTO.busy = null;
      setSave(r.ok ? (r.files.length ? T('st.hist.restored', { n: r.files.length }) : T('st.hist.same')) : r.why, r.ok ? 'ok' : 'err');
      histLoad();
    } catch (e) { setSave(e.message, 'err'); }
  }
  // ---- one change, over the image ----
  async function histShow(id) {
    const el = $('#histDiff'); if (!el) return;
    let d; try { d = await (await fetch(`/api/history/diff?id=${encodeURIComponent(id)}`, { cache: 'no-store' })).json(); } catch { return; }
    if (!d.ok) { setSave(d.why, 'err'); return; }
    HISTO.diff = d; M.pause();
    const w = histWho(d.by), num = (n) => `<span class="ln">${n ?? ''}</span>`;
    const body = d.hunks.length ? d.hunks.map((h) => {
      let a = h.a, b = h.b;
      return `<div class="hunk"><div class="hat">${T('st.hist.at', { a: h.a, b: h.b })}</div>${h.lines.map(([op, l]) => {
        const row = `<div class="dl ${op === '+' ? 'add' : op === '-' ? 'del' : ''}">${num(op === '+' ? null : a)}${num(op === '-' ? null : b)}<span class="op">${op === ' ' ? '' : op === '+' ? '+' : '−'}</span><code>${esc(l) || ' '}</code></div>`;
        if (op !== '+') a++; if (op !== '-') b++;
        return row;
      }).join('')}</div>`;
    }).join('') : `<div class="empty">${T('st.hist.noLines')}</div>`;
    const now = d.now === 'same' ? '' : `<span class="warn">${T(d.now === 'gone' ? 'st.hist.nowGone' : 'st.hist.nowChanged')}</span>`;
    el.innerHTML = `<div class="sbar"><span class="k ${d.kind}">${T('st.hist.k.' + d.kind)}</span><b title="${esc(d.abs ?? '')}">${esc(d.file.replace(/^[^/]+\//, ''))}</b>
      <span class="muted">${esc(w.t)} · ${hDay(d.at)} ${hClock(d.at)}</span><span class="pm">${d.add ? `<b class="p">+${d.add}</b>` : ''}${d.del ? `<b class="m">−${d.del}</b>` : ''}</span>${now}<span class="grow"></span>
      <button class="soft" id="histUndo" title="${esc(T('st.hist.undoTip'))}">${ic('undo')}${T('st.hist.undo')}</button>
      <button class="soft icon" id="histX" title="${esc(T('st.sheet.close'))}">${ic('x')}</button></div>
      <div class="dbody">${body}</div>`;
    el.classList.add('on');
    $('#histX').addEventListener('click', () => histClose());
    $('#histUndo').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!btn.classList.contains('sure')) { btn.classList.add('sure'); btn.lastChild.textContent = T('st.hist.undoSure'); return; }
      try {
        const r = await (await fetch('/api/history/restore', { method: 'POST', body: JSON.stringify({ id: d.id, to: 'before', scope: 'file', force: true }) })).json();
        setSave(r.ok ? T('st.hist.undone', { f: d.file.replace(/^[^/]+\//, '') }) : r.why, r.ok ? 'ok' : 'err');
        if (r.ok) { histClose(); histLoad(); }
      } catch (err) { setSave(err.message, 'err'); }
    });
    el.querySelector('.dl.add, .dl.del')?.scrollIntoView({ block: 'center' });
    renderHist();
  }
  function histClose() { $('#histDiff')?.classList.remove('on'); if (HISTO) HISTO.diff = null; renderHist(); }
  function histOpen() { return !!$('#histDiff')?.classList.contains('on'); }
  function initHist() {
    const el = $('#histList'); if (!el) return;
    el.addEventListener('click', (e) => {
      const f = e.target.closest('.hf'), bk = e.target.closest('[data-back]'), yes = e.target.closest('[data-yes]'), no = e.target.closest('[data-no]');
      if (f) histShow(f.dataset.id);
      else if (bk) { HISTO.confirm = bk.dataset.back; HISTO.busy = null; renderHist(); }
      else if (yes) histRestore(yes.dataset.yes, !!HISTO.busy);
      else if (no) { HISTO.confirm = null; HISTO.busy = null; renderHist(); }
    });
    window.__hist = () => ({ ver: HISTO.ver, n: HISTO.data?.entries?.length ?? null, on: HISTO.data?.on ?? null, diff: HISTO.diff?.id ?? null });   // (the tests)
  }
