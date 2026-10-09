// The studio's page (studio.html), part 07: the connect window, the note cards, the inspector.
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  // ---------- modal ----------
  let modalLine = '';
  // updatesOk (from the server, lib/updates.mjs): the update line is calm only when everything is up to date
  function showModal(title, p1, line, p2, { updates = '', updatesOk = false, pick = false } = {}) {
    $('#mT').textContent = title; $('#mP1').textContent = p1; $('#mLine').textContent = line; $('#mP2').textContent = p2 || ''; modalLine = line;
    const u = $('#mUpd'); u.textContent = updates || ''; u.className = 'upd' + (updates ? ' on' : '') + (updates && !updatesOk ? ' todo' : '');
    $('#mAgent').classList.toggle('on', pick); markPick();
    $('#modal').style.display = 'flex'; $('#mCopy').focus();
  }
  async function copy(t) {
    try { await navigator.clipboard.writeText(t); setSave(T('st.copy.done'), 'ok'); }
    catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); setSave(T('st.copy.short'), 'ok'); }
  }
  $('#mCopy').onclick = () => { copy(modalLine); $('#mCopy').innerHTML = `${ic('check')}${T('st.copy.short')}`; setTimeout(() => { $('#mCopy').innerHTML = `${ic('copy')}${T('st.modal.copy')}`; }, 1500); };
  $('#mClose').onclick = () => { $('#modal').style.display = 'none'; };
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').style.display = 'none'; });
  const markPick = () => document.querySelectorAll('#mAgent button').forEach((b) => b.classList.toggle('on', b.dataset.a === AGENT_PICK));
  document.querySelectorAll('#mAgent button').forEach((b) => b.addEventListener('click', () => { AGENT_PICK = b.dataset.a; store.set('agent', AGENT_PICK); markPick(); }));
  const openConnect = () => showModal(STATUS.agent?.watching ? T('st.connect.on', { name: agentName() }) : T('st.agent.connect'),
    T('st.connect.what'), META.connectLine, T('st.connect.without'), { pick: !STATUS.agent?.watching });
  $('#agent').onclick = openConnect;

  // ---------- note cards (Modifs = waiting to be sent ; Notes = the others) ----------
  function renderAll() { renderAgent(); renderQueue(); renderLots(); renderList(); renderInspector(); draw(); drawOv(); syncStage(); if (onTab('scene')) renderScene(); }
  function gestureHtml(n) {
    if (n.stage) return `<div class="gest">${ic('move')}<span class="obj">${esc(n.stage.name)}</span><span class="k">${esc(deltaWords(n.stage.delta))}</span></div>`;
    if (!n.mark && !n.target) return '';
    const m = n.mark, t = n.target?.hits?.length ? humanTarget(n.target.hits[0]) : null;
    const w = !m ? '' : m.kind === 'pin' ? `${ic('pin')}<span>${T('st.card.pointed')}</span>` : `${ic('stroke')}<span>${T('st.card.drawing', { n: m.strokes?.length ?? 1 })}</span>`;
    return `<div class="gest">${w}${t ? `<span class="k">·</span><span class="obj">${esc(t.name)}</span><span class="k">${esc(t.kind)}</span>` : ''}</div>`;
  }
  function cardEl(n, i) {
    const st = statusOf(n);
    const isR = n.end !== null, msgs = threadOf(n), hasClaude = msgs.some((m) => m.from === 'claude');
    const el = document.createElement('div');
    el.className = 'card' + (n.id === sel ? ' sel' : '') + (st === 'done' ? ' done' : '');
    el.dataset.id = n.id;
    const when = isR ? `${fmt(tOf(n.frame))} → ${fmt(tOf(n.end + 1))}` : fmt(tOf(n.frame));
    const pend = pending[n.id] ?? { text: '', images: [] };
    const badge = n.draft ? `<span class="badge draft">${T('st.card.pending')}</span>`
      : st === 'working' ? `<span class="badge work">${T('st.card.working', { lot: n.lot ? T('st.card.lotSuffix', { lot: n.lot }) : '' })}</span>`
      : st === 'done' ? `<span class="badge ok">${ic('check')}${T('st.card.fixed')}</span>`
      : n.lot ? `<span class="badge">${T('st.rc.lot', { lot: n.lot })}</span>` : '';
    el.innerHTML = `
      <div class="row">
        <span class="num ${isR ? 'r' : 'p'}">${i + 1}</span>
        <span class="when">${when}</span>
        ${badge}${n.source === 'code' ? `<span class="badge code" title="${esc(T('st.card.codeTitle'))}">code</span>` : ''}
        <span class="grow"></span>
        <button class="icon more" title="${esc(T('st.card.more'))}">${ic('more')}</button>
      </div>
      <div class="frames">${T('st.card.frame')} <input type="number" class="f0" value="${n.frame}" min="0" max="${FRAMES - 1}" title="${esc(T('st.card.first'))}">
        ${isR ? `→ <input type="number" class="f1" value="${n.end}" min="0" max="${FRAMES - 1}" title="${esc(T('st.card.last'))}"><span>${((n.end - n.frame + 1) / FPS).toFixed(2)} s</span>` : ''}
        ${n.before?.length ? `<span title="${esc(T('st.card.movedTitle'))}">${T('st.card.before', { f: n.before[n.before.length - 1].frame })}</span>` : ''}</div>
      ${n.context?.scene || n.context?.lines?.length ? `<div class="ctx">${esc([n.context?.scene, ...(n.context?.lines ?? [])].filter(Boolean).join('\n'))}</div>` : ''}
      ${gestureHtml(n)}
      <textarea class="main" placeholder="${esc(T('st.card.placeholder'))}">${esc(n.text)}</textarea>
      <div class="imgs mainimgs">${(n.images || []).map((img) => thumbHtml(img, true)).join('')}</div>
      <div class="acts">
        <button class="go" title="${esc(T('st.card.goTitle'))}">${ic('goto')}${T('st.card.go')}</button>
        ${isR ? `<button class="play" title="${esc(T('st.card.playTitle'))}">${ic('play')}${T('st.card.play')}</button><button class="loop" title="${esc(T('st.card.loopTitle'))}">${ic('repeat')}${T('st.card.loop')}</button>` : ''}
        <button class="img" title="${esc(T('st.card.imgTitle'))}">${ic('image')}${T('st.card.img')}</button>
        <label class="chk"><input type="checkbox" class="dn" ${st === 'done' ? 'checked' : ''}> ${T('st.card.done')}</label>
      </div>
      ${msgs.length ? `<div class="thread">${msgs.map((m) => `
        <div class="msg ${m.from}"><div class="who">${m.from === 'claude' ? esc(m.by ?? T('st.card.agent')) : T('st.card.you')} · ${esc(hhmm(m.at))}</div>${esc(m.text)}
          <div class="imgs">${(m.images || []).map((img) => thumbHtml(img, false)).join('')}</div></div>`).join('')}</div>` : ''}
      ${hasClaude ? `<div class="repbox">
        <textarea class="rep" placeholder="${esc(T('st.card.reply'))}">${esc(pend.text)}</textarea>
        <div class="imgs repimgs">${pend.images.map((img) => thumbHtml(img, true)).join('')}</div>
        <div class="repacts"><button class="rimg">${ic('image')}${T('st.card.img')}</button><button class="send">${ic('send')}${T('st.card.send')}</button><span class="hint">${T('st.card.hint')}</span></div>
      </div>` : ''}
      ${n.render && META.render && n.render.size !== META.render.size ? `<div class="old">${T('st.card.old', { what: T(PROJ ? 'st.card.oldExport' : 'st.card.oldRender') })}</div>` : ''}`;
    if (loopId === n.id) el.querySelector('.loop')?.classList.add('on');
    el.addEventListener('mousedown', (e) => { if (sel !== n.id && !e.target.closest('.more')) { sel = n.id; document.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === sel)); draw(); drawOv(); renderInspector(); } });
    el.querySelectorAll('img[data-full]').forEach((im) => im.addEventListener('click', () => openLightbox(im.dataset.full)));
    const ta = el.querySelector('textarea.main');
    ta.addEventListener('input', () => { n.text = ta.value; n.updated = now(); save(); if (n.draft) renderQueue(); });
    el.querySelectorAll('.mainimgs .x').forEach((b, k) => b.addEventListener('click', () => { n.images.splice(k, 1); n.updated = now(); save(); renderAll(); }));
    el.querySelector('.f0').addEventListener('change', (e) => { setFrames(n, +e.target.value, n.end); save(); renderAll(); seekFrame(n.frame); });
    el.querySelector('.f1')?.addEventListener('change', (e) => { setFrames(n, n.frame, +e.target.value); save(); renderAll(); seekFrame(n.end ?? n.frame); });
    el.querySelector('.dn').addEventListener('change', (e) => { n.status = e.target.checked ? 'done' : 'open'; n.statusAt = now(); save(); renderAll(); });
    el.querySelector('.go').addEventListener('click', () => { sel = n.id; M.pause(); seekFrame(n.frame); renderAll(); });
    el.querySelector('.play')?.addEventListener('click', () => { sel = n.id; loopId = null; seekFrame(n.frame); stopAt = n.end; M.play(); renderAll(); });
    el.querySelector('.loop')?.addEventListener('click', () => { sel = n.id; loopId = loopId === n.id ? null : n.id; stopAt = null; if (loopId) { seekFrame(n.frame); M.play(); } renderAll(); });
    el.querySelector('.img').addEventListener('click', () => pick({ kind: 'note', id: n.id }));
    el.querySelector('.more').addEventListener('click', (e) => {
      const items = [
        ...(STATUS.compare?.includes(n.id) ? [{ icon: 'image', label: T('st.menu.compare'), run: () => openCompare(n.id) }, '-'] : []),
        { icon: 'start', label: T('st.menu.start'), run: () => { setFrames(n, curFrame(), n.end); save(); renderAll(); } },
        { icon: 'end', label: isR ? T('st.menu.end') : T('st.menu.rangeTo'), run: () => { setFrames(n, n.frame, curFrame()); save(); renderAll(); } },
        ...(isR ? [{ icon: 'point', label: T('st.menu.single'), run: () => { setFrames(n, n.frame, null); save(); renderAll(); } }] : []),
        ...(n.mark ? [{ icon: 'x', label: T('st.menu.clearGesture'), run: () => { delete n.mark; delete n.target; n.updated = now(); save(); renderAll(); } }] : []),
        ...(!n.draft ? ['-', { icon: 'repeat', label: T('st.menu.resend'), run: () => { if (queueFull()) return; n.draft = true; n.updated = now(); if (statusOf(n) === 'done') { n.status = 'open'; n.statusAt = now(); } save(); setTab('queue'); renderAll(); showCard(n.id); } }] : []),
        '-',
        { icon: 'trash', label: n.draft ? T('st.menu.removeEdit') : T('st.menu.deleteNote'), danger: true, run: () => { if ((n.draft && !n.text.trim() && !n.images?.length) || confirm(n.draft ? T('st.menu.removeEditConfirm') : T('st.menu.deleteNoteConfirm'))) delNote(n.id); } },
      ];
      openMenu(e.currentTarget, items);
    });
    const box = el.querySelector('.repbox');
    if (box) {
      const rt = box.querySelector('textarea.rep');
      const send = () => {
        const p = pending[n.id] ?? { text: '', images: [] };
        if (!p.text.trim() && !p.images.length) return;
        (n.thread ??= []).push({ text: p.text.trim(), images: p.images, at: now() });
        delete pending[n.id]; n.updated = now(); if (statusOf(n) === 'done') { n.status = 'open'; n.statusAt = now(); }
        save(); renderAll();
      };
      rt.addEventListener('input', () => { (pending[n.id] ??= { text: '', images: [] }).text = rt.value; });
      rt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
      box.querySelectorAll('.repimgs .x').forEach((b, k) => b.addEventListener('click', () => { pending[n.id].images.splice(k, 1); renderAll(); }));
      box.querySelector('.rimg').addEventListener('click', () => pick({ kind: 'reply', id: n.id }));
      box.querySelector('.send').addEventListener('click', send);
      dropZone(box, () => ({ kind: 'reply', id: n.id }));
    }
    dropZone(el, () => ({ kind: 'note', id: n.id }));
    return el;
  }
  function renderList() {
    const all = sorted().filter((n) => n.kind !== 'prompt'), num = new Map(all.map((n, i) => [n.id, i]));   // the requests of the Agent tab live there
    const others = all.filter((n) => !n.draft), d = all.filter((n) => n.draft), hide = $('#hideDone').checked;
    const ndone = others.filter((n) => statusOf(n) === 'done').length;
    $('#count').textContent = T('st.list.count', { n: others.length }) + (ndone ? T('st.list.fixed', { n: ndone }) : '');
    $('#nNotes').textContent = others.length; $('#nNotes').classList.toggle('zero', !others.length);
    const a = document.activeElement, focused = a && a.closest ? a.closest('.card') : null;
    const keep = focused && a.tagName === 'TEXTAREA' ? { id: focused.dataset.id, cls: a.classList.contains('rep') ? 'rep' : 'main', s: a.selectionStart, e: a.selectionEnd } : null;
    const fill = (box, list, emptyHtml) => {
      const scroll = box.scrollTop; box.innerHTML = '';
      if (!list.length) box.innerHTML = `<div class="empty">${emptyHtml}</div>`;
      for (const n of list) if (!(hide && box.id === 'list' && statusOf(n) === 'done')) box.appendChild(cardEl(n, num.get(n.id)));
      box.scrollTop = scroll;
    };
    fill($('#draftList'), d, T('st.list.noDraft'));
    fill($('#list'), others, T('st.list.noNote'));
    if (keep) { const t = document.querySelector(`.card[data-id="${keep.id}"] textarea.${keep.cls}`); if (t) { t.focus(); t.setSelectionRange(keep.s, keep.e); } }
  }

  // ---------- inspector ----------
  let inspT = 0;
  function renderInspector(force) {
    if (!onTab('insp')) return;
    if (!force && performance.now() - inspT < 150) return;
    inspT = performance.now();
    const f = curFrame(), t = (f + 0.5) / FPS, c = contextAt(f), L = LIVE, rows = [];
    const dl = (pairs) => `<div class="box"><dl>${pairs.filter(([, x]) => x !== undefined && x !== null && x !== '').map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}</dl></div>`;
    rows.push(`<h3>${T('st.insp.frame', { f, t: fmt(t) })}</h3>`);
    const last = (arr) => { let x = null; for (const e of arr ?? []) { if (e.t > t) break; x = e; } return x; };
    const cam = last(L?.camera), light = last(L?.light);
    const music = (L?.music ?? []).filter((m) => m.t <= t && t < m.until && m.volume > 0);
    const sfx = (L?.sfx ?? []).filter((s) => Math.abs(s.t - t) <= 0.6);
    const emo = (L?.emotes ?? []).filter((e) => Math.abs(e.t - t) <= 1);
    const walking = Object.entries(L?.moves ?? {}).filter(([, evs]) => evs.some((e) => e.kind === 'walk' && e.t <= t && t <= e.t + e.dur)).map(([a]) => who(a));
    const none = '<span class="muted">—</span>';
    if (PROJ) {
      const at = clipsAt(t);
      if (at.length) rows.push(dl(at.map(({ tr, c: k }) => [esc(tr.name), `${esc(k.label)}${k.off ? ` <span class="muted">${T('st.insp.disabled')}</span>` : ''}${k.file ? `<br><span class="muted">${esc(k.file)} · ${esc(tr.type === 'band' ? '' : inClip(tr, k, t))}</span>` : ''}`])));
      else rows.push(`<div class="box"><p class="muted" style="margin:0">${LIVE?.tracks ? T('st.insp.noClip') : T('st.insp.noPlan')}</p></div>`);
    } else rows.push(dl([
      [T('st.insp.scene'), esc(c.scene || '—')],
      [T('st.insp.lines'), c.lines.length ? c.lines.map(esc).join('<br>') : none],
      [T('st.insp.camera'), cam ? esc(Object.entries(cam.v).map(([k, x]) => `${k} ${x}`).join('  ·  ')) + (t < cam.t + cam.dur ? `<br><span class="muted">${T('st.insp.moving', { t: fmt(cam.t + cam.dur) })}</span>` : '') : (L ? none : '…')],
      [T('st.insp.light'), light ? esc(light.v) : (L ? none : '…')],
      [T('st.insp.music'), music.length ? music.map((m) => `${esc(m.name)} <span class="muted">vol ${m.volume}</span>`).join('<br>') : none],
      [T('st.insp.sfx'), sfx.length ? sfx.map((s) => `${esc(s.name)} <span class="muted">${fmt(s.t)}</span>`).join('<br>') : none],
      [T('st.insp.emotes'), emo.length ? emo.map((e) => `${esc(who(e.actor))} · ${esc(e.name)}`).join('<br>') : none],
      [T('st.insp.walking'), walking.length ? walking.map(esc).join(', ') : none],
    ]));
    const n = sel && byId(sel);
    rows.push(`<h3 style="margin-top:14px">${T('st.insp.selected')}</h3>`);
    if (!n) rows.push(`<div class="empty">${T('st.insp.pick')}</div>`);
    else {
      const i = sorted().indexOf(n) + 1, st = statusOf(n), m = n.mark;
      const gest = !m ? '—' : m.kind === 'pin' ? T('st.insp.pin', { x: m.points[0][0], y: m.points[0][1], w: CW, h: CH }) : T('st.insp.draw', { n: m.strokes?.length ?? 1, x0: Math.min(...m.points.map((p) => p[0])), x1: Math.max(...m.points.map((p) => p[0])), y0: Math.min(...m.points.map((p) => p[1])), y1: Math.max(...m.points.map((p) => p[1])) });
      const t0 = n.target?.hits?.length ? humanTarget(n.target.hits[0]) : null;
      rows.push(dl([
        [T('st.insp.note'), T('st.insp.noteNum', { i, where: n.end !== null ? T('st.insp.frames', { a: n.frame, b: n.end }) : T('st.insp.frameAt', { a: n.frame }) })],
        [T('st.insp.state'), n.draft ? T('st.insp.stDraft') : st === 'working' ? T('st.insp.stWorking') : st === 'done' ? T('st.insp.stDone') : T('st.insp.stOpen')],
        [T('st.insp.lot'), n.lot ? `${T('st.rc.lot', { lot: n.lot })}${n.sentAt ? ' · ' + esc(hhmm(n.sentAt)) : ''}` : none],
        [T('st.insp.view'), PROJ ? null : n.source === 'code' ? T('st.insp.viewCode') : T('st.src.video')],
        [T('st.insp.ask'), esc(n.text || '—')],
        [T('st.insp.gesture'), esc(gest)],
        [T('st.insp.object'), PROJ && !t0 ? null : t0 ? `${esc(t0.name)} <span class="muted">${esc(t0.kind)}</span>` : none],
        [T('st.insp.edit'), PROJ && n.context?.clips?.length ? n.context.clips.map(esc).join('<br>') : null],
      ]));
      if (n.target?.hits?.length) for (const h of n.target.hits) rows.push(`<div class="hit">${esc(h.names?.[0] ?? h.type)}${h.textures?.length ? '\ntexture ' + esc(h.textures.join(', ')) : ''}${h.count > 1 ? T('st.insp.points', { n: h.count }) : ''}</div>`);
    }
    $('#insp').innerHTML = rows.join('');
  }

