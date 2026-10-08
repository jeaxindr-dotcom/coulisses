// The studio's page (studio.html), part 06: the full render (asked here, run by the agent), the before / after wipe.
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  // ---------- the full re-render: asked here, run by Claude (studio-cli.mjs render), progress in STATUS.render ----------
  const dayTime = (iso) => (iso ? (FR ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ')
    : `${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`) : '?');
  const frDur = (s) => (FR ? String(s ?? '').replace(/(\d+)h/, '$1 h').replace(/(\d+)m(?!s)/, '$1 min').replace(/(\d+)s/, '$1 s') : String(s ?? ''));
  const mmss = (sec) => `${Math.floor(sec / 60)} min ${String(Math.round(sec % 60)).padStart(2, '0')} s`;
  const dB = (x) => (x == null ? '?' : dec((+x).toFixed(1)).replace('-', '−'));
  const finLabel = (l) => (/final mix/.test(l) ? T('st.fin.mix') : /review tool/.test(l) ? T('st.fin.plan') : /chapters/i.test(l) ? T('st.fin.chapters')
    : /paused/.test(l) ? T('st.fin.paused') : /is back/.test(l) ? T('st.fin.back') : l);
  const BAD = ['blocked', 'failed', 'interrupted', 'cancelled'];
  function renderView() {
    const lots = STATUS.lots ?? [], R = STATUS.render ?? null, cur = STATUS.video ?? META?.render ?? null;
    const req = [...lots].reverse().find((L) => L.kind === 'render') ?? null;
    const after = (a, b) => a && b && Date.parse(a) >= Date.parse(b);
    let st = 'idle';
    if (req && !req.claude) st = 'requested';
    else if (req?.claude?.status === 'taken') st = R && after(R.startedAt, req.sentAt) && !['checked', 'rendered-raw'].includes(R.state) ? R.state : 'preparing';
    else if (R?.state === 'running') st = 'running';
    else if (R?.state === 'rendered' && R.video && cur && R.video.size === cur.size) st = 'rendered';
    const since = lots.filter((L) => L.kind !== 'render' && cur && L.render?.size === cur.size);
    return { st, R, req, cur, since };
  }
  function renderPill() {
    const { st, R } = renderView(), p = $('#renderPill'), pct = R?.render?.pct ?? 0;
    let t = '', cls = '';
    if (st === 'running') t = R.phase === 'checks' ? T('st.pill.checks') : R.phase === 'finish' ? T('st.pill.finish') : R.render?.stage === 'frames' ? T('st.pill.pct', { pct: Math.floor(pct) }) : R.render?.stage === 'encode' ? T('st.pill.encode') : T('st.pill.preparing');
    else if (st === 'requested' || st === 'preparing') t = T('st.pill.requested');
    else if (st === 'blocked' || st === 'failed' || st === 'interrupted') { t = st === 'blocked' ? T('st.pill.blocked') : T('st.pill.failed'); cls = 'fail'; }
    else if (st === 'rendered') { t = T('st.pill.ready'); cls = 'ready'; }
    p.className = t ? `show ${cls}` : '';
    p.querySelector('.t').textContent = t;
    p.querySelector('.mini i').style.width = `${st === 'running' ? (R.phase === 'render' ? pct : R.phase === 'finish' ? 100 : 2) : 0}%`;
  }
  $('#renderPill').onclick = () => setTab('lots');
  let rcKey = '';
  function exportCard(box) {
    const cur = STATUS.video ?? META.render, X = STATUS.export, key = JSON.stringify(['export', cur?.size, cur?.mtime, STATUS.compare?.length, X?.state, X?.pct == null ? null : Math.round(X.pct), X?.etape]);
    if (key === rcKey) return; rcKey = key;
    if (META.kind === 'remotion' && !cur) {
      box.innerHTML = `<div class="rc"><div class="rh">${ic('code')}<b>${T('st.ex.noExport')}</b><span class="muted">${esc(kindLabel())}</span></div>
        <div class="sub2">${T('st.ex.liveCode', { comp: esc(META.composition ?? ''), w: CW, h: CH, fps: dec(FPS) })}</div>
        <div class="sub2 muted">${META.exportDir ? T('st.ex.willLoad', { dir: esc(META.exportDir) }) : T('st.ex.noDir')}</div>${exportBlock()}</div>`;
      wireExport();
      return;
    }
    const where = META.kind === 'run' ? T('st.ex.whereRun', { dir: META.exportDir ? T('st.ex.inDir', { dir: esc(META.exportDir) }) : '' })
      : META.kind === 'aitelier' ? T('st.ex.whereAit')
      : META.kind === 'video' ? T('st.ex.whereVideo') : T('st.ex.whereFolder');
    box.innerHTML = `<div class="rc"><div class="rh">${ic('film')}<b>${T('st.ex.reviewed')}</b><span class="muted">${esc(kindLabel())}</span></div>
      <div class="sub2">${cur ? T('st.ex.file', { name: esc(cur.name), date: dayTime(cur.mtime), w: CW, h: CH, fps: dec(FPS) }) : T('st.ex.noVideo')}</div>
      <div class="sub2 muted">${where} ${META.kind === 'run' ? T('st.ex.fixRun') : T('st.ex.fixYou')}</div>
      ${cur || STATUS.compare?.length ? `<div class="acts">${STATUS.compare?.length ? `<button class="soft" id="rcCmp">${ic('image')}${T('st.rc.compare', { n: STATUS.compare.length })}</button>` : ''}${cur ? `<button class="soft" id="rcReveal" title="${esc(T('st.rc.revealTitle', { name: cur.name }))}">${ic('folder')}${T('st.rc.reveal')}</button>` : ''}</div>` : ''}${exportBlock()}</div>`;
    $('#rcCmp')?.addEventListener('click', () => openCompare());
    $('#rcReveal')?.addEventListener('click', () => revealMenu('video'));
    wireExport();
  }
  // « Exporter » a run of a Remotion pipeline (lib/export.mjs): the project's own export script, on the user's order only
  const isDefaultExport = (l) => !l || l === T('common.exportVideo') || l === 'Exporter la vidéo' || l === 'Export the video';
  function exportBlock() {
    if (META.kind !== 'remotion') return '';
    const X = STATUS.export;
    if (!META.features?.export) return `<div class="sub2 muted">${T('st.ex.unavailable', { why: esc(META.exportWhy ?? T('st.ex.unavailableWhy')) })}</div>`;
    if (X?.state === 'running') {
      return `<div class="sub2">${T('st.ex.running', { label: esc(!isDefaultExport(X.label) ? X.label : T('st.ex.export')), date: dayTime(X.started) })}</div>
        <div class="rbar"><i style="width:${Math.round(X.pct ?? 0)}%"></i></div>
        <div class="num2"><span id="exNum">${X.pct != null ? T('st.ex.pct', { pct: Math.round(X.pct) }) : T('st.ex.preparing')}</span><span class="muted">${esc(X.etape ?? '')}</span></div>
        <div class="acts"><button class="soft danger" id="exStop">${ic('x')}${T('st.ex.stop')}</button><button class="soft" id="exLog">${T('st.rc.log')}</button></div>`;
    }
    const last = !X ? '' : X.state === 'done' ? `<div class="ok2">${T('st.ex.done', { date: dayTime(X.ended), file: esc(X.file ?? '') })}</div>`
      : X.state === 'failed' ? `<div class="err">${T('st.ex.failed', { err: X.error ? T('st.ex.failedWhy', { why: esc(X.error) }) : '' })}</div>` : X.state === 'stopped' ? `<div class="sub2 muted">${T('st.ex.stopped', { date: dayTime(X.ended) })}</div>` : '';
    const opts = META.exportOptions?.length ? META.exportOptions : [{ id: null, label: T('common.exportVideo') }];
    const btns = opts.map((o, i) => `<button class="${i ? 'soft' : 'primary'} exGo" data-q="${esc(o.id ?? '')}" data-label="${esc(o.label)}">${i ? '' : ic('film')}${esc(o.label)}</button>`).join('');
    const shown = X?.state === 'done' && X.file ? `<button class="soft" id="exReveal" title="${esc(X.file)}">${ic('folder')}${T('st.ex.reveal')}</button>` : '';
    return `${last}<div class="acts">${btns}${shown}${X ? `<button class="soft" id="exLog">${T('st.rc.log')}</button>` : ''}</div>`;
  }
  function wireExport() {
    for (const b of document.querySelectorAll('#renderCard .exGo')) b.addEventListener('click', () => startExportUI(b.dataset.q || null, b.dataset.label));
    $('#exStop')?.addEventListener('click', stopExportUI);
    $('#exLog')?.addEventListener('click', showExportLog);
    $('#exReveal')?.addEventListener('click', () => revealMenu('export'));
  }
  async function startExportUI(qualite, label) {
    if (!confirm(T('st.ex.confirm', { label: label || T('common.exportVideo'), title: META.title, dir: META.exportDir ? T('st.ex.confirmDir', { dir: META.exportDir }) : '' }))) return;
    const r = await postJson('/api/export', { qualite });
    setSave(r?.ok ? T('st.ex.started') : T('st.ex.cannot', { why: r?.why ?? T('st.noAnswer') }), r?.ok ? 'ok' : 'err');
  }
  async function stopExportUI() {
    if (!confirm(T('st.ex.stopConfirm'))) return;
    const r = await postJson('/api/export/stop');
    setSave(r?.ok ? T('st.ex.stoppedNow') : T('st.cannotStop', { why: r?.why ?? T('st.noAnswer') }), r?.ok ? 'ok' : 'err');
  }
  async function showExportLog() {
    let t = ''; try { t = await (await fetch('/api/export/log', { cache: 'no-store' })).text(); } catch { /* */ }
    showModal(T('st.ex.logTitle'), T('st.ex.logWhat'), t || T('st.empty'), T('st.ex.logFile'));
  }
  const kindLabel = () => (META.kind === 'run' ? T('st.kind.run', { c: META.channel || 'Run' }) : META.kind === 'remotion' ? `${META.channel || T('st.kind.remotion')}${META.features?.video ? '' : T('st.kind.liveCode')}` : META.kind === 'aitelier' ? `L'AItelier${META.format ? ' · ' + (META.format === 'short' ? 'Short' : T('st.kind.long')) : ''}` : META.kind === 'video' ? T('st.kind.video') : T('st.kind.folder'));
  function renderRender() {
    const box = $('#renderCard'); if (!box || !META) return;
    if (PROJ) return exportCard(box);
    const { st, R, req, cur, since } = renderView();
    const key = JSON.stringify([st, R?.phase, R?.state, R?.startedAt, R?.checks?.map((c) => c.status), R?.render?.stage === 'wait', R?.finish?.steps?.length, req?.lot, req?.claude?.status,
      STATUS.compare?.length, since.map((L) => [L.lot, L.claude?.status]), R?.message, STATUS.agent?.watching, cur?.size]);
    if (key === rcKey) { renderNums(R); return; }
    rcKey = key;
    const head = (right) => `<div class="rh">${ic('film')}<b>${T('st.rc.render')}</b><span class="muted">${esc(right)}</span></div>`;
    const done = since.filter((L) => L.claude?.status === 'done').length, open = since.filter((L) => !L.claude || L.claude.status === 'taken').length;
    const sinceTxt = since.length ? T('st.rc.since', { n: done, open: open ? T('st.rc.sinceOpen', { k: open }) : '' }) : T('st.rc.sinceNone');
    const B = {
      go: `<button class="primary" id="rcGo">${ic('play')}${T('st.rc.go')}</button>`,
      again: `<button class="primary" id="rcGo">${ic('play')}${T('st.rc.again')}</button>`,
      cmp: STATUS.compare?.length ? `<button class="soft" id="rcCmp">${ic('image')}${T('st.rc.compare', { n: STATUS.compare.length })}</button>` : '',
      log: R ? `<button class="soft" id="rcLog">${T('st.rc.log')}</button>` : '',
      reveal: cur ? `<button class="soft" id="rcReveal" title="${esc(T('st.rc.revealTitle', { name: cur.name }))}">${ic('folder')}${T('st.rc.reveal')}</button>` : '',
      copy: req ? `<button class="soft" id="rcCopy">${ic('copy')}${T('st.lot.copy')}</button>` : '',
      stop: R?.state === 'running' && R.phase !== 'finish' ? `<button class="soft danger" id="rcStop">${ic('x')}${T('st.rc.stop')}</button>` : '',
    };
    let h = '';
    if (st === 'idle') {
      h = head(cur ? T('st.rc.videoOf', { date: dayTime(cur.mtime) }) : T('st.ex.noVideo')) + `<div class="sub2">${sinceTxt}</div>`;
      if (R?.state === 'reviewed' && R.video?.size === cur?.size) h += `<div class="ok2">${T('st.rc.lastChecked', { msg: R.message ? T('st.rc.lastMsg', { msg: esc(R.message) }) : '' })}</div>`;
      else if (R && BAD.includes(R.state)) h += `<div class="sub2 muted">${T('st.rc.lastTry', { state: T(R.state === 'cancelled' ? 'st.rc.stoppedWord' : 'st.rc.interruptedWord'), date: dayTime(R.endedAt ?? R.updatedAt) })}</div>`;
      h += `<div class="acts">${B.go}${B.cmp}${B.reveal}${B.log}</div>`;
    } else if (st === 'requested') {
      h = head(T('st.rc.requested', { date: dayTime(req.sentAt) })) + `<div class="sub2">${STATUS.agent?.watching ? T('st.rc.watching', { name: agentName() }) : T('st.rc.paste', { name: agentName() })}</div>`
        + `<div class="acts">${B.copy.replace('soft', 'primary')}<button class="soft danger" id="rcWithdraw">${T('st.rc.withdraw')}</button></div>`;
    } else {
      const right = st === 'preparing' ? T('st.rc.lot', { lot: req?.lot ?? '' }) : R?.startedAt ? T('st.rc.started', { date: dayTime(R.startedAt) }) : '';
      h = head(right) + steps(st === 'preparing' ? null : R);
      if (st === 'preparing') h += `<div class="sub2">${T('st.rc.preparing')}</div>`;
      if (st === 'blocked') h += `<div class="err">${esc(R.error ?? T('st.rc.checkFailed'))}${T('st.rc.agentFixes')}</div>`;
      if (st === 'failed') h += `<div class="err">${esc(R.error ?? T('st.rc.failed'))}</div>`;
      if (st === 'interrupted') h += `<div class="err">${T('st.rc.interrupted')}</div>`;
      if (st === 'cancelled') h += `<div class="sub2">${T('st.rc.cancelled', { date: dayTime(R.endedAt) })}</div>`;
      if (st === 'rendered') {
        const F = R.finish ?? {}, dur = F.duration ? mmss(F.duration).replace(/ 0?(\d+) s$/, ' $1 s') : '';
        h += `<div class="ok2">${T('st.rc.ready', { dur: dur ? ` · ${dur}` : '', lufs: F.loudness?.I != null ? ` · ${dB(F.loudness.I)} LUFS` : '', peak: F.loudness?.peak != null ? T('st.rc.peak', { v: dB(F.loudness.peak) }) : '', remapped: F.remapped != null ? T('st.rc.remapped', { n: F.remapped }) : '' })}</div>`;
      }
      const again = ['failed', 'interrupted', 'cancelled'].includes(st) ? B.again : '';
      h += `<div class="acts">${again}${B.stop}${st === 'rendered' ? B.cmp + B.reveal : ''}${st === 'preparing' ? B.copy : ''}${B.log}</div>`;
    }
    box.innerHTML = `<div class="rc">${h}</div>`;
    $('#rcGo')?.addEventListener('click', launchRender);
    $('#rcCmp')?.addEventListener('click', () => openCompare());
    $('#rcLog')?.addEventListener('click', showRenderLog);
    $('#rcReveal')?.addEventListener('click', () => revealMenu('video'));
    $('#rcCopy')?.addEventListener('click', () => copy(req.line));
    $('#rcStop')?.addEventListener('click', stopRender);
    $('#rcWithdraw')?.addEventListener('click', async () => {
      const r = await postJson('/api/render/withdraw', { lot: req.lot });
      setSave(r?.ok ? T('st.rc.withdrawn') : T('st.cannot', { why: r?.why ?? T('st.noAnswer') }), r?.ok ? 'ok' : 'err'); statusTxt = '';
    });
    renderNums(R);
  }
  function steps(R) {
    const order = ['checks', 'render', 'finish', 'review'], only = R?.only ?? ['checks', 'render', 'finish'];
    const cur = R ? order.indexOf(R.phase === 'done' ? 'review' : R.phase) : -1;
    const stOf = (k) => {
      if (k !== 'review' && R && !only.includes(k)) return 'skip';
      if (!R) return 'wait';
      const i = order.indexOf(k);
      if (i < cur) return 'ok';
      if (i > cur) return 'wait';
      if (R.state === 'running') return 'run';
      if (BAD.includes(R.state)) return 'fail';
      if (k === 'review') return R.state === 'reviewed' ? 'ok' : 'run';
      return 'ok';
    };
    const ix = (s, n) => (s === 'ok' ? ic('check') : s === 'fail' ? ic('x') : s === 'run' ? '<span class="spin"></span>' : n);
    const row = (k, n, title, body) => { const s = stOf(k); return s === 'skip' ? '' : `<div class="stp ${s}"><span class="ix">${ix(s, n)}</span><div><div class="t">${title}</div>${body}</div></div>`; };
    const chk = R?.checks ?? [], judge = chk.find((c) => c.toJudge)?.toJudge;
    const chip = (c) => `<span class="chip ${c.status === 'wait' ? '' : c.status}" title="${esc(c.detail)}">${c.status === 'ok' ? ic('check') : c.status === 'fail' ? ic('x') : c.status === 'run' ? '<span class="spin"></span>' : ''}${esc(c.label)}</span>`;
    const checksBody = chk.length ? `<div class="chips">${chk.map(chip).join('')}</div>${judge ? `<div class="d">${T('st.steps.judge', { n: judge })}</div>` : ''}`
      : `<div class="d">${T('st.steps.checksList')}</div>`;
    const fin = R?.finish?.steps ?? [];
    return `<div class="steps">${row('checks', 1, T('st.steps.checks'), checksBody)}`
      + row('render', 2, T('st.steps.render'), `<div class="rbar"><i id="rcBar"></i></div><div class="num2"><span id="rcNum">${T('st.steps.waiting')}</span><span class="muted" id="rcEta"></span></div>`)
      + row('finish', 3, T('st.steps.finish'), `<div class="d" id="rcFin">${fin.length && stOf('finish') === 'run' ? esc(finLabel(fin.at(-1).label)) : T('st.steps.finishList')}</div>`)
      + row('review', 4, T('st.steps.review'), `<div class="d">${T('st.steps.reviewWhat')}</div>`) + '</div>';
  }
  function renderNums(R) {   // the parts that move every few seconds, without rebuilding the card
    const bar = $('#rcBar'), r = R?.render; if (!bar || !r) return;
    let num = T('st.steps.waiting'), eta = '', w = 0;
    const n = (x) => (+x || 0).toLocaleString(FR ? 'fr-FR' : 'en-US');
    if (r.stage === 'bundle') num = T('st.num.bundle', { pct: r.pct });
    else if (r.stage === 'copy') num = T('st.num.copy', { size: r.copied ?? '' });
    else if (r.stage === 'compose') num = T('st.num.compose');
    else if (r.stage === 'frames') { num = T('st.num.frames', { f: n(r.frame), total: n(r.total), pct: dec(r.pct) }); eta = r.remaining ? T('st.num.left', { t: frDur(r.remaining) }) : ''; w = r.pct; }
    else if (r.stage === 'encode') { num = T('st.num.encode', { pct: r.total ? Math.round((r.encoded / r.total) * 100) : 0 }); w = 100; }
    else if (r.stage === 'done') { num = T('st.num.done', { n: n(r.total) }); eta = r.startedAt && r.endedAt ? T('st.num.in', { t: mmss((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000) }) : ''; w = 100; }
    bar.style.width = `${w}%`; $('#rcNum').textContent = num; $('#rcEta').textContent = eta;
    const f = $('#rcFin'), fs2 = R.finish?.steps ?? []; if (f && fs2.length && R.phase === 'finish' && R.state === 'running') f.textContent = finLabel(fs2.at(-1).label);
  }
  const postJson = (url, data) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) }).then((r) => r.json()).catch(() => null);
  async function launchRender() {
    const d = drafts().length;
    const open = (STATUS.lots ?? []).filter((L) => L.kind !== 'render' && (!L.claude || L.claude.status === 'taken')).map((L) => L.lot);
    const msg = [T('st.launch.ask', { ep: META.episode }), '', T('st.launch.what')];
    if (d) msg.push('', T('st.launch.drafts', { n: d }));
    if (open.length) msg.push('', T('st.launch.open', { n: open.length, list: open.join(', ') }));
    if (!confirm(msg.join('\n'))) return;
    const r = await postJson('/api/render', { agent: AGENT_PICK });
    if (!r?.ok) { setSave(T('st.launch.failed', { why: r?.why ?? T('st.launch.noStudio') }), 'err'); return; }
    statusTxt = ''; rcKey = '';
    showModal(T('st.launch.title', { lot: r.lot }),
      r.agent?.watching ? T('st.launch.gotIt', { name: agentName() }) : T('st.launch.paste', { name: agentName() }),
      r.line, T('st.launch.progress'), { updates: r.updates, updatesOk: r.updatesOk });
    setTab('lots');
  }
  async function stopRender() {
    if (!confirm(T('st.stop.confirm'))) return;
    const r = await postJson('/api/render/stop');
    setSave(r?.ok ? T('st.stop.asked') : T('st.cannotStop', { why: r?.why ?? T('st.noAnswer') }), r?.ok ? 'ok' : 'err');
  }
  async function showRenderLog() {
    let t = ''; try { t = await (await fetch('/api/render/log', { cache: 'no-store' })).text(); } catch { /* */ }
    showModal(T('st.rlog.title'), T('st.rlog.what'), t || T('st.empty'), T('st.rlog.file'));
  }
  // the video is being replaced (hold): let go of it, then reload once the new one is there
  let wasHeld = false, heldFrame = 0, reloading = false;
  function onHeld() {
    if (!META) return;
    if (!META.render) { if (STATUS.video && !reloading) { reloading = true; setSave(T('st.save.firstExport'), 'ok'); const f = curFrame(); flushNow().then(() => { location.hash = `f=${f}`; location.reload(); }); } return; }
    if (!STATUS.video) return;
    const fresh = STATUS.video.size !== META.render.size || STATUS.video.mtime !== META.render.mtime;
    if (STATUS.held && !wasHeld) {
      wasHeld = true; heldFrame = curFrame(); if (shuttle) stopShuttle(); M.pause();
      if (staging) setStaging(false);
      $('#stage').classList.add('held');
      try { v.removeAttribute('src'); v.load(); } catch { /* */ }
    }
    if (!STATUS.held && fresh && !reloading) {
      reloading = true; setSave(T('st.save.newVideo'), 'ok');
      const f = wasHeld ? heldFrame : curFrame();
      flushNow().then(() => { location.hash = `f=${f}`; location.reload(); });
      return;
    }
    if (!STATUS.held && wasHeld && !fresh) {   // the replacement did not happen: back to the same video
      wasHeld = false; $('#stage').classList.remove('held');
      v.addEventListener('loadedmetadata', () => seekFrame(heldFrame), { once: true });
      v.src = META.proxy === 'ready' ? '/video/revue' : '/video/original';
    }
  }

  // ---------- before / after of the corrected notes (wipe) ----------
  let CMP = [], cmpI = 0, cmpX = 50;
  async function openCompare(id) {
    let r = null; try { r = await (await fetch('/api/compare', { cache: 'no-store' })).json(); } catch { /* */ }
    CMP = r?.items ?? [];
    if (!CMP.length) { setSave(T('st.cmp.nothing'), 'err'); return; }
    cmpI = Math.max(0, CMP.findIndex((x) => x.id === id)); cmpX = 50;
    if (shuttle) stopShuttle(); M.pause();
    $('#cmpW').style.aspectRatio = `${CW} / ${CH}`; $('#cmpW').style.width = `min(100%, calc(72vh * ${CW} / ${CH}))`;
    $('#cmp').classList.add('open'); showCmp();
  }
  function showCmp() {
    const it = CMP[cmpI], num = sorted().findIndex((n) => n.id === it.id) + 1;
    $('#cmpT').textContent = T('st.cmp.head', { num: num || '?', lot: it.lot });
    $('#cmpN').textContent = `${cmpI + 1} / ${CMP.length}`;
    $('#cmpLA').textContent = T('st.cmp.labelBefore', { what: it.beforeSource === 'code' ? T('st.cmp.codePreview') : T(PROJ ? 'st.cmp.exportOf' : 'st.cmp.renderOf', { date: dayTime(it.beforeRender?.mtime) }), f: it.beforeFrame });
    $('#cmpLB').textContent = T('st.cmp.labelAfter', { what: T(PROJ ? 'st.cmp.newExport' : 'st.cmp.newRender'), f: it.frame });
    $('#cmpTx').innerHTML = `<b>${esc(it.text || T('st.cmp.noText'))}</b>${it.reply ? T('st.cmp.agentSays', { reply: esc(it.reply) }) : ''}`;
    const A = $('#cmpA'), Bi = $('#cmpB'), w = $('#cmpWait'); let n = 0;
    w.textContent = T('st.cmp.loading');
    const ok = () => { if (++n >= 2) w.textContent = ''; };
    A.onload = ok; Bi.onload = ok; A.onerror = Bi.onerror = () => { w.textContent = T('st.cmp.unavailable'); };
    A.src = it.before; Bi.src = `/api/frame?f=${it.frame}&source=video&w=1600`;
    $('#cmpPrev').disabled = cmpI === 0; $('#cmpNext').disabled = cmpI === CMP.length - 1;
    setWipe(cmpX);
  }
  function setWipe(x) { cmpX = Math.max(0, Math.min(100, x)); $('#cmpW .after').style.clipPath = `inset(0 0 0 ${cmpX}%)`; $('#cmpW .handle').style.left = `${cmpX}%`; }
  const cmpOpen = () => $('#cmp').classList.contains('open');
  const cmpClose = () => $('#cmp').classList.remove('open');
  const cmpStep = (d) => { const j = cmpI + d; if (j >= 0 && j < CMP.length) { cmpI = j; showCmp(); } };
  {
    const w = $('#cmpW'); let drag = false;
    const at = (e) => { const r = w.getBoundingClientRect(); setWipe(((e.clientX - r.left) / r.width) * 100); };
    w.addEventListener('pointerdown', (e) => { drag = true; w.setPointerCapture(e.pointerId); at(e); });
    w.addEventListener('pointermove', (e) => { if (drag) at(e); });
    w.addEventListener('pointerup', () => { drag = false; });
  }
  $('#cmpPrev').onclick = () => cmpStep(-1); $('#cmpNext').onclick = () => cmpStep(1);
  $('#cmpFlip').onclick = () => setWipe(cmpX > 50 ? 0 : 100);
  $('#cmpX').onclick = cmpClose;
  $('#cmp').addEventListener('click', (e) => { if (e.target.id === 'cmp') cmpClose(); });
  $('#cmpGo').onclick = () => {
    const it = CMP[cmpI]; cmpClose();
    const n = byId(it.id); if (!n) return;
    if (staging) setStaging(false);
    if (mode !== 'video') setMode('video');
    sel = n.id; seekFrame(n.frame); setTab('notes'); renderAll(); showCard(n.id);
  };

