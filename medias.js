// The « Médias » tab of the studio: the channel's library (lib/medias.mjs) and its image chat (lib/image-chat.mjs).
//   - the grid, by category, with a search; a card for the image picked (name, category, tags, where it was placed)
//   - an image is dragged onto the video to place it there: a pinned edit for the agent, the image attached
//     (studio.html placeMedia; the agent copies it into the project and writes it in the code)
//   - files dropped or pasted here go to « à ranger », and the agent sorts them (Codex looks at them)
//   - the chat: the request goes to Codex (image_gen), the images it makes land in the library; the images picked
//     (or, for a follow-up, the last ones made) go with the request
// Texts: « st.md.* » (lib/i18n-*.mjs). The page's own helpers come from studio.html (window.Studio).
(() => {
  const S = window.Studio, T = window.T ?? ((k) => k), $ = (s, r = document) => r.querySelector(s);
  const esc = S.esc, ic = S.ic;
  const MT = 'application/x-coulisses-media';
  const store = { get(k, d) { try { const v = localStorage.getItem('medias.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('medias.' + k, JSON.stringify(v)); } catch { /* private window */ } } };
  const post = (url, data) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) }).then((r) => r.json()).catch((e) => ({ ok: false, why: e.message }));

  const css = `
  #tab-medias { gap: 0; }
  #mdTop { display: flex; flex-direction: column; flex: 1 1 55%; min-height: 160px; }
  #mdTop .bar .chan { font: 500 12px var(--font); color: var(--s11); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px; }
  #mdFilters { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 14px 8px; align-items: center; }
  #mdFilters button { height: 24px; padding: 0 10px; font-size: 11.5px; }
  #mdFilters button .k { color: var(--s9); margin-left: 2px; }
  #mdFilters button.on .k { color: #4a4f63; }
  #mdFilters input { flex: 1; min-width: 90px; height: 26px; border-radius: 999px; border: 1px solid var(--stroke); background: rgba(0, 0, 0, 0.22); color: var(--s12); padding: 0 11px; font: 12px var(--font); }
  #mdFilters input:focus { outline: none; border-color: rgba(201, 242, 107, 0.45); }
  #mdGridWrap { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 12px 12px; }
  #mdGridWrap.drop { outline: 2px dashed var(--lime); outline-offset: -6px; border-radius: 18px; }
  #mdGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
  .md-it { position: relative; border-radius: 14px; border: 1px solid var(--stroke); background: var(--glass-2); overflow: hidden; cursor: pointer; user-select: none; }
  .md-it:hover { border-color: var(--stroke-2); }
  .md-it.sel { border-color: rgba(201, 242, 107, 0.7); box-shadow: 0 0 0 3px rgba(201, 242, 107, 0.12); }
  .md-it.ref::after { content: ''; position: absolute; top: 6px; right: 6px; width: 10px; height: 10px; border-radius: 99px; background: var(--violet); box-shadow: 0 0 0 2px rgba(0,0,0,.35); }
  .md-pic { aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
    background: repeating-conic-gradient(rgba(255,255,255,.06) 0 25%, transparent 0 50%) 0 0 / 14px 14px; }
  .md-pic img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; pointer-events: none; }
  .md-it .nm { font-size: 11.5px; padding: 5px 8px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--s11); }
  .md-it .cat { position: absolute; left: 6px; top: 6px; font: 600 9.5px var(--font-d); padding: 1px 6px; border-radius: 99px; background: rgba(0,0,0,.55); color: var(--s11); }
  .md-empty { color: var(--s9); font-size: 12.5px; padding: 18px 6px; line-height: 1.6; }
  #mdCard { margin: 0 12px 8px; padding: 10px; align-items: flex-start; border-radius: 18px; background: rgba(0,0,0,.22); border: 1px solid var(--stroke); display: none; gap: 10px; }
  #mdCard.on { display: flex; }
  #mdCard .big { width: 92px; flex: none; align-self: flex-start; border-radius: 12px; overflow: hidden; cursor: zoom-in; }
  #mdCard .big.md-pic { aspect-ratio: 1; }
  #mdCard .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
  #mdCard .two { display: flex; gap: 5px; }
  #mdCard .two > * { flex: 1; min-width: 0; }
  #mdCard input, #mdCard select { width: 100%; height: 26px; border-radius: 10px; border: 1px solid var(--stroke); background: rgba(0,0,0,.25); color: var(--s12); padding: 0 9px; font: 12.5px var(--font); }
  #mdCard select option { background: #151826; }
  #mdCard .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  #mdCard .row button { height: 26px; padding: 0 10px; font-size: 11.5px; }
  #mdCard .row button.icon { width: 26px; padding: 0; }
  #mdCard .row .grow { flex: 1; }
  #mdCard .small { font-size: 11px; color: var(--s9); line-height: 1.45; max-height: 48px; overflow: auto; }
  #mdChat { display: flex; flex-direction: column; flex: 1 1 42%; min-height: 0; border-top: 1px solid var(--stroke); }
  #mdChat.closed { flex: 0 0 auto; }
  #mdChat.closed #mdMsgs, #mdChat.closed #mdCompose { display: none; }
  #mdChat .bar { padding-top: 10px; cursor: pointer; }
  #mdMsgs { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 14px 8px; display: flex; flex-direction: column; gap: 8px; }
  .md-msg { max-width: 92%; padding: 8px 11px; border-radius: 14px; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  .md-msg.user { align-self: flex-end; background: rgba(201, 242, 107, 0.12); border: 1px solid rgba(201, 242, 107, 0.22); }
  .md-msg.agent { align-self: flex-start; background: var(--glass-2); border: 1px solid var(--stroke); }
  .md-msg.error { align-self: flex-start; background: rgba(255, 143, 126, 0.1); border: 1px solid rgba(255, 143, 126, 0.3); color: #ffc4ba; }
  .md-msg.info { align-self: center; color: var(--s9); font-size: 11.5px; padding: 2px 8px; }
  .md-msg .imgs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
  .md-msg .imgs .md-pic { width: 76px; border-radius: 10px; overflow: hidden; cursor: grab; border: 1px solid var(--stroke); }
  .md-msg .refs { font-size: 11px; color: var(--s9); margin-top: 3px; }
  #mdWork { display: none; align-self: flex-start; font-size: 12px; color: var(--sky); padding: 4px 2px; }
  #mdWork.on { display: block; }
  #mdWork .dot { display: inline-block; width: 7px; height: 7px; border-radius: 99px; background: var(--sky); margin-right: 7px; animation: mdp 1.1s infinite ease-in-out; }
  @keyframes mdp { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
  #mdCompose { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 7px; }
  #mdCompose.drop textarea { outline: 2px dashed var(--lime); }
  #mdRefs { display: flex; gap: 5px; flex-wrap: wrap; }
  #mdRefs:empty { display: none; }
  #mdRefs .chip { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 4px 0 3px; border-radius: 99px; background: rgba(180, 156, 255, 0.14); border: 1px solid rgba(180, 156, 255, 0.3); font-size: 11.5px; color: var(--lav); }
  #mdRefs .chip img { width: 20px; height: 20px; border-radius: 99px; object-fit: cover; background: rgba(255,255,255,.08); }
  #mdRefs .chip button { height: 20px; width: 20px; padding: 0; justify-content: center; border: 0; background: transparent; }
  #mdText { width: 100%; min-height: 52px; max-height: 140px; resize: vertical; background: rgba(0,0,0,.25); color: var(--s12); border: 1px solid var(--stroke); border-radius: 14px; padding: 9px 11px; font: 13px/1.5 var(--font); }
  #mdText:focus { outline: none; border-color: rgba(201, 242, 107, 0.45); }
  #mdCompose .row { display: flex; align-items: center; gap: 8px; }
  #mdCompose .row .grow { flex: 1; }
  #mdCompose label { font-size: 12px; color: var(--s11); display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
  #mdWhy { font-size: 11.5px; color: var(--amber); }
  `;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

  const tab = $('#tab-medias');
  tab.innerHTML = `
    <div id="mdTop">
      <div class="bar"><b>${T('st.tab.medias')}</b><span class="chan" id="mdChan"></span><span class="grow"></span>
        <button class="icon soft" id="mdSort" title="${esc(T('st.md.sortTitle'))}">${ic('check')}</button>
        <button class="icon soft" id="mdAdd" title="${esc(T('st.md.addTitle'))}">${ic('plus')}</button>
        <button class="icon soft" id="mdOpen" title="${esc(T('st.md.openTitle'))}">${ic('folder')}</button></div>
      <div id="mdFilters"></div>
      <div id="mdCard"></div>
      <div id="mdGridWrap"><div id="mdGrid"></div></div>
    </div>
    <div id="mdChat">
      <div class="bar" id="mdChatBar"><b>${T('st.md.chatTitle')}</b><span class="muted" id="mdModel"></span><span class="grow"></span>
        <button class="soft" id="mdNew" style="height:24px;font-size:11px">${T('st.md.newChat')}</button></div>
      <div id="mdMsgs"></div>
      <div id="mdCompose">
        <div id="mdRefs"></div>
        <textarea id="mdText" placeholder="${esc(T('st.md.placeholder'))}"></textarea>
        <div class="row"><label title="${esc(T('st.md.transparentTitle'))}"><input type="checkbox" id="mdTransp"> ${T('st.md.transparent')}</label><span class="grow"></span>
          <button id="mdStop" class="danger" style="display:none">${ic('x')}${T('st.md.stop')}</button>
          <button id="mdSend" class="primary">${ic('send')}${T('st.md.send')}</button></div>
        <div id="mdWhy"></div>
      </div>
    </div>
    <input type="file" id="mdPick" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>`;

  let D = null, sig = '', chatSig = '', shown = 0, cat = store.get('cat', 'all'), query = '', sel = null, refs = [], timer = null, visible = false;
  const byId = (id) => D?.items.find((it) => it.id === id);
  const ver = (it) => encodeURIComponent(it.modifie ?? it.cree ?? '');
  const mini = (it) => `/medias/mini/${it.id}?v=${ver(it)}`;
  const full = (it) => `/medias/file/${it.id}?v=${ver(it)}`;
  const catName = (c) => T('st.md.cat.' + c);
  $('#mdTransp').checked = store.get('transp', true);
  $('#mdTransp').onchange = () => store.set('transp', $('#mdTransp').checked);
  if (store.get('chatClosed', false)) $('#mdChat').classList.add('closed');
  $('#mdChatBar').onclick = (e) => { if (e.target.closest('button')) return; const c = $('#mdChat').classList.toggle('closed'); store.set('chatClosed', c); };

  // ---------- the data ----------
  async function load() {
    let d; try { d = await (await fetch('/api/medias', { cache: 'no-store' })).json(); } catch { return; }
    if (!d || !d.items) return;
    D = d;
    refs = refs.filter((id) => byId(id));
    if (sel && !byId(sel)) sel = null;
    const n = d.items.length, inbox = d.counts?.['a-ranger'] ?? 0;
    S.setTabCount('medias', d.job?.state === 'running' ? '…' : n ? String(n) : '');
    $('#mdChan').textContent = d.channel ? `· ${d.channel}` : '';
    $('#mdChan').title = d.dir ?? '';
    $('#mdModel').textContent = d.available?.ok ? (d.model ? ` · Codex ${d.model}` : ' · Codex') : '';
    $('#mdSort').style.display = inbox ? '' : 'none';
    $('#mdSort').title = T('st.md.sortTitle', { n: inbox });
    const s = JSON.stringify([d.items.map((it) => [it.id, it.modifie ?? it.cree, it.categorie, it.nom, (it.tags ?? []).join()]), cat, query, sel, refs]);
    if (s !== sig) { sig = s; renderFilters(); renderGrid(); renderCard(); renderRefs(); }
    const c = JSON.stringify([d.chat?.map((m) => m.id), d.job?.state, d.job?.step, d.available?.ok]);
    if (c !== chatSig) { chatSig = c; renderChat(); }
    renderWork();
    schedule();
  }
  // the library is read while the tab is shown (and while Codex works, for the tab's badge): opening a studio never
  // creates a channel's library by itself
  function schedule() {
    clearTimeout(timer);
    const running = D?.job?.state === 'running';
    if (!visible && !running) return;
    timer = setTimeout(load, running ? (visible ? 1500 : 5000) : 4000);
  }

  // ---------- library ----------
  function renderFilters() {
    const counts = D.counts ?? {};
    const chips = [['all', T('st.md.all'), D.items.length], ...D.categories.map((c) => [c, catName(c), counts[c] ?? 0])].filter(([c, , k]) => c === 'all' || k || c === cat);
    const f = $('#mdFilters'), had = document.activeElement?.id === 'mdQ';
    f.innerHTML = chips.map(([c, label, k]) => `<button data-c="${c}" class="${c === cat ? 'on' : ''}">${esc(label)}<span class="k">${k}</span></button>`).join('')
      + `<input id="mdQ" placeholder="${esc(T('st.md.search'))}" value="${esc(query)}">`;
    f.querySelectorAll('button').forEach((b) => b.onclick = () => { cat = b.dataset.c; store.set('cat', cat); sig = ''; load(); });
    const qi = $('#mdQ');
    qi.oninput = () => { query = qi.value; renderGrid(); };
    if (had) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
  }
  const matches = (it) => {
    if (cat !== 'all' && it.categorie !== cat) return false;
    const q = query.trim().toLowerCase(); if (!q) return true;
    return [it.nom, it.description, it.prompt, ...(it.tags ?? [])].some((x) => String(x ?? '').toLowerCase().includes(q));
  };
  function renderGrid() {
    const g = $('#mdGrid'), list = D.items.filter(matches);
    if (!D.items.length) { g.innerHTML = `<div class="md-empty">${T('st.md.empty', { dir: esc(D.dir) })}</div>`; g.style.display = 'block'; return; }
    g.style.display = '';
    if (!list.length) { g.innerHTML = `<div class="md-empty">${T('st.md.noMatch')}</div>`; return; }
    g.innerHTML = list.map((it) => `<div class="md-it${it.id === sel ? ' sel' : ''}${refs.includes(it.id) ? ' ref' : ''}" data-id="${it.id}" draggable="true" title="${esc(it.nom)}${it.description ? '\n' + esc(it.description) : ''}">
      <div class="md-pic"><img loading="lazy" src="${mini(it)}" alt=""></div>${cat === 'all' ? `<span class="cat">${esc(catName(it.categorie))}</span>` : ''}<div class="nm">${esc(it.nom)}</div></div>`).join('');
    g.querySelectorAll('.md-it').forEach((el) => {
      const id = el.dataset.id;
      el.onclick = (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) toggleRef(id); else { sel = sel === id ? null : id; sig = ''; load(); } };
      el.ondblclick = () => window.open(full(byId(id)), '_blank');
      el.ondragstart = (e) => dragMedia(e, id);
    });
  }
  function dragMedia(e, id) {
    const it = byId(id); if (!it) return;
    e.dataTransfer.setData(MT, id); e.dataTransfer.setData('text/plain', it.nom); e.dataTransfer.effectAllowed = 'copy';
    S.mediaDragging(true);
  }
  document.addEventListener('dragend', () => S.mediaDragging(false));
  function renderCard() {
    const c = $('#mdCard'), it = sel && byId(sel);
    if (!it) { c.classList.remove('on'); c.innerHTML = ''; return; }
    c.classList.add('on');
    const uses = (it.utilisations ?? []).slice(-3).reverse().map((u) => `${esc(u.titre ?? '?')}${u.image != null ? ` · ${T('st.md.frame', { f: u.image })}` : ''}`).join('<br>');
    const size = it.largeur ? `${it.largeur} × ${it.hauteur}` : '';
    c.innerHTML = `<div class="big md-pic" title="${esc(T('st.md.openFull'))}"><img src="${mini(it)}" alt=""></div>
      <div class="info">
        <input id="mdNom" value="${esc(it.nom)}" title="${esc(T('st.md.nameTitle'))}">
        <div class="two"><select id="mdCat">${D.categories.map((k) => `<option value="${k}"${k === it.categorie ? ' selected' : ''}>${esc(catName(k))}</option>`).join('')}</select>
        <input id="mdTags" value="${esc((it.tags ?? []).join(', '))}" placeholder="${esc(T('st.md.tags'))}" title="${esc(T('st.md.tags'))}"></div>
        <div class="small">${[size, it.transparent ? T('st.md.isTransparent') : '', it.source ? T('st.md.src.' + it.source) : ''].filter(Boolean).join(' · ')}${it.description ? `<br>${esc(it.description)}` : ''}${it.prompt ? `<br>${T('st.md.askedFor', { text: esc(it.prompt) })}` : ''}${uses ? `<br>${T('st.md.usedIn')}<br>${uses}` : ''}</div>
        <div class="row">
          <button class="soft" id="mdPlace" title="${esc(T('st.md.placeTitle'))}">${ic('pin')}${T('st.md.place')}</button>
          <button class="soft" id="mdRef" title="${esc(T('st.md.refTitle'))}">${ic('pen')}${refs.includes(it.id) ? T('st.md.unref') : T('st.md.retouch')}</button>
          <span class="grow"></span>
          <button class="soft icon" id="mdShow" title="${esc(T('st.md.showTitle'))}">${ic('folder')}</button>
          <button class="soft icon danger" id="mdDel" title="${esc(T('st.md.delTitle'))}">${ic('trash')}</button>
        </div>
      </div>`;
    c.querySelector('.big').onclick = () => window.open(full(it), '_blank');
    c.querySelector('.big img').draggable = true;
    c.querySelector('.big').draggable = true;
    c.querySelector('.big').ondragstart = (e) => dragMedia(e, it.id);
    const saveField = async (patch) => { const r = await post('/api/medias/update', { id: it.id, ...patch }); if (!r?.ok) S.setSave(T('st.md.failed', { why: r?.why ?? '' }), 'err'); sig = ''; load(); };
    const nom = $('#mdNom'), tags = $('#mdTags');
    nom.onkeydown = tags.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = e.target === nom ? it.nom : (it.tags ?? []).join(', '); e.target.blur(); } };
    nom.onchange = () => { if (nom.value.trim() && nom.value.trim() !== it.nom) saveField({ nom: nom.value.trim() }); };
    tags.onchange = () => saveField({ tags: tags.value });
    $('#mdCat').onchange = (e) => saveField({ categorie: e.target.value });
    $('#mdPlace').onclick = () => S.placeMedia(it.id, null);
    $('#mdRef').onclick = () => { toggleRef(it.id); if (refs.includes(it.id)) openChat(); };
    $('#mdShow').onclick = () => post('/api/medias/reveal', { id: it.id });
    $('#mdDel').onclick = async () => {
      if (!confirm(T('st.md.delConfirm', { name: it.nom }))) return;
      const r = await post('/api/medias/delete', { id: it.id });
      if (r?.ok) { S.setSave(T('st.md.deleted', { name: it.nom }), 'ok'); sel = null; } else S.setSave(T('st.md.failed', { why: r?.why ?? '' }), 'err');
      sig = ''; load();
    };
  }

  // ---------- adding images: the + button, files dropped on the grid, an image pasted in the tab ----------
  async function importFiles(files, { asRef = false } = {}) {
    files = [...files].filter((f) => f && /^image\/(png|jpeg|webp|gif)$/.test(f.type));
    if (!files.length) return;
    S.setSave(T('st.md.importing', { n: files.length }));
    let ok = 0;
    for (const f of files) {
      try {
        const r = await (await fetch('/api/medias/import', { method: 'POST', headers: { 'Content-Type': f.type, 'X-Name': encodeURIComponent(f.name || 'image') }, body: f })).json();
        if (r?.ok) { ok++; if (asRef) refs.push(r.item.id); } else S.setSave(T('st.md.failed', { why: r?.why ?? '' }), 'err');
      } catch (e) { S.setSave(T('st.md.failed', { why: e.message }), 'err'); }
    }
    if (ok) S.setSave(T('st.md.imported', { n: ok }), 'ok');
    sig = ''; chatSig = ''; load();
  }
  $('#mdAdd').onclick = () => $('#mdPick').click();
  $('#mdPick').onchange = (e) => { importFiles(e.target.files); e.target.value = ''; };
  $('#mdOpen').onclick = () => post('/api/medias/reveal', {});
  $('#mdSort').onclick = async () => { const r = await post('/api/medias/sort', {}); if (!r?.ok) S.setSave(T('st.md.failed', { why: r?.why ?? '' }), 'err'); else S.setSave(T('st.md.sorting'), 'ok'); load(); };
  const filesOf = (e) => [...(e.dataTransfer?.files ?? e.clipboardData?.files ?? [])];
  const zone = (el, onDrop) => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('drop'); onDrop(e); });
  };
  zone($('#mdGridWrap'), (e) => { if (!e.dataTransfer.getData(MT)) importFiles(filesOf(e)); });
  zone($('#mdCompose'), (e) => { const id = e.dataTransfer.getData(MT); if (id) addRef(id); else importFiles(filesOf(e), { asRef: true }); });
  tab.addEventListener('paste', (e) => {   // here, a pasted image is for the library (not a new note)
    const files = filesOf(e).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    importFiles(files, { asRef: e.target?.id === 'mdText' });
  });
  tab.addEventListener('keydown', (e) => { if (e.target.matches('input, textarea, select')) e.stopPropagation(); });

  // ---------- the chat ----------
  function addRef(id) { if (!refs.includes(id) && byId(id)) refs.push(id); sig = ''; load(); }
  function toggleRef(id) { refs = refs.includes(id) ? refs.filter((x) => x !== id) : [...refs, id]; sig = ''; load(); }
  function openChat() { if ($('#mdChat').classList.contains('closed')) { $('#mdChat').classList.remove('closed'); store.set('chatClosed', false); } $('#mdText').focus(); }
  function renderRefs() {
    $('#mdRefs').innerHTML = refs.map((id) => { const it = byId(id); return it ? `<span class="chip" data-id="${id}"><img src="${mini(it)}" alt="">${esc(it.nom)}<button title="${esc(T('st.md.unref'))}">${ic('x')}</button></span>` : ''; }).join('');
    $('#mdRefs').querySelectorAll('.chip button').forEach((b) => b.onclick = () => toggleRef(b.parentElement.dataset.id));
  }
  function renderChat() {
    const box = $('#mdMsgs'), msgs = D.chat ?? [], atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const pic = (id) => { const it = byId(id); return it ? `<div class="md-pic" data-id="${id}" draggable="true" title="${esc(it.nom)}"><img src="${mini(it)}" alt=""></div>` : ''; };
    box.innerHTML = (msgs.length ? '' : `<div class="md-msg info">${T('st.md.chatIntro')}</div>`)
      + msgs.map((m) => `<div class="md-msg ${m.role}">${esc(m.text)}${m.images?.length ? `<div class="imgs">${m.images.map(pic).join('')}</div>` : ''}${m.refs?.length ? `<div class="refs">${T('st.md.withRefs', { names: m.refs.map((id) => esc(byId(id)?.nom ?? '?')).join(', ') })}</div>` : ''}</div>`).join('')
      + '<div id="mdWork"></div>';
    box.querySelectorAll('.md-pic[data-id]').forEach((el) => {
      el.onclick = () => { sel = el.dataset.id; cat = 'all'; store.set('cat', cat); sig = ''; load(); };
      el.ondragstart = (e) => dragMedia(e, el.dataset.id);
    });
    if (atBottom || msgs.length > shown) box.scrollTop = box.scrollHeight;
    shown = msgs.length;
    const why = $('#mdWhy');
    why.textContent = D.available?.ok ? '' : T('st.md.unavailable', { why: D.available?.why ?? '' });
    renderWork();
  }
  function renderWork() {
    const w = $('#mdWork'), j = D?.job, running = j?.state === 'running';
    $('#mdSend').style.display = running ? 'none' : '';
    $('#mdStop').style.display = running ? '' : 'none';
    $('#mdSend').disabled = !D?.available?.ok;
    if (!w) return;
    w.classList.toggle('on', running);
    if (running) {
      const s = Math.max(0, Math.round((Date.now() - new Date(j.started).getTime()) / 1000));
      w.innerHTML = `<span class="dot"></span>${esc(T(j.kind === 'sort' ? 'st.md.sortingNow' : 'st.md.working', { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }))}${j.step ? ` · ${esc(j.step)}` : ''}`;
    }
  }
  setInterval(() => { if (D?.job?.state === 'running') renderWork(); }, 1000);
  async function send() {
    const text = $('#mdText').value.trim();
    if (!text) { $('#mdText').focus(); return; }
    $('#mdSend').disabled = true;
    const r = await post('/api/medias/chat', { text, refs, transparent: $('#mdTransp').checked });
    $('#mdSend').disabled = false;
    if (!r?.ok) { S.setSave(T('st.md.failed', { why: r?.why ?? '' }), 'err'); $('#mdWhy').textContent = r?.why ?? ''; return; }
    $('#mdText').value = ''; refs = []; sig = ''; chatSig = '';
    await load();
    const box = $('#mdMsgs'); box.scrollTop = box.scrollHeight;
  }
  $('#mdSend').onclick = send;
  $('#mdText').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  $('#mdStop').onclick = async () => { await post('/api/medias/stop', {}); load(); };
  $('#mdNew').onclick = async () => { if (!confirm(T('st.md.newConfirm'))) return; const r = await post('/api/medias/new-chat', {}); if (!r?.ok) S.setSave(T('st.md.failed', { why: r?.why ?? '' }), 'err'); chatSig = ''; load(); };

  // the studio tells when the tab is shown (it loads more often while it is)
  window.CoulissesMedias = {
    show() { visible = true; load(); },
    hide() { visible = false; schedule(); },
    byId, reload: () => { sig = ''; load(); },
  };
})();
