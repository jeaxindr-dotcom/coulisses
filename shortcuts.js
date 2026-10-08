// The keyboard shortcuts of Coulisses: one list for the home screen and every studio (user request, 08/10/2026: « dans
// Aide, créer un menu qui montre les raccourcis, et aussi qu'on peut les régler »). Each action has its default keys; the
// user's own (settings.json « shortcuts », through GET/PUT /api/shortcuts, lib/shortcuts.mjs) replace them, for the
// whole app. Served at /shortcuts.js by hub-server.mjs and studio-server.mjs, after menubar.js; labels from window.T
// (lib/i18n.mjs « menu.sc.* »).
//   Shortcuts.is(e, id)       does this key press run the action `id`?
//   Shortcuts.keys(id)        its keys now (['Ctrl+Z']) · Shortcuts.show(id) the first one, written for a menu (« Ctrl+Z »)
//   Shortcuts.open()          the « Raccourcis clavier » window (Aide, F1): every action, its keys; click a key to change it
//   Shortcuts.ready           a promise: the user's keys are loaded · Shortcuts.combo(e) the key press as 'Ctrl+Shift+Z'
// A key is written 'Ctrl+Alt+Shift+K': Ctrl, Alt, Shift in that order, then the key (a letter in capitals, 'Space',
// 'ArrowLeft', 'Delete', 'F1', 'Plus' for « + »…). Shift is kept with a letter or a named key, not with a sign (« . » is
// Shift on some keyboards). The staging actions (stage: true) win while staging is on, as before (R = scale there).
(() => {
  const T = (k, v) => (typeof window.T === 'function' ? window.T(k, v) : k);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // g: the group of the window · hub: it also works on the home screen · stage: only while staging
  const ACTIONS = [
    { g: 'common', id: 'undo', keys: ['Ctrl+Z'], hub: true },
    { g: 'common', id: 'redo', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], hub: true },
    { g: 'common', id: 'save', keys: ['Ctrl+S'] },
    { g: 'common', id: 'send', keys: ['Ctrl+Enter'] },
    { g: 'common', id: 'open', keys: ['Ctrl+O'], hub: true },
    { g: 'common', id: 'newProject', keys: ['Ctrl+N'], hub: true },
    { g: 'common', id: 'help', keys: ['F1'], hub: true },
    { g: 'play', id: 'play', keys: ['Space'] },
    { g: 'play', id: 'frameBack', keys: ['ArrowLeft', ','] },
    { g: 'play', id: 'frameFwd', keys: ['ArrowRight', '.'] },
    { g: 'play', id: 'secBack', keys: ['Shift+ArrowLeft'] },
    { g: 'play', id: 'secFwd', keys: ['Shift+ArrowRight'] },
    { g: 'play', id: 'toStart', keys: ['Home'] },
    { g: 'play', id: 'toEnd', keys: ['End'] },
    { g: 'image', id: 'toolSelect', keys: ['V'] },
    { g: 'image', id: 'toolDraw', keys: ['D'] },
    { g: 'image', id: 'toolComment', keys: ['C'] },
    { g: 'image', id: 'ask', keys: ['A'] },
    { g: 'image', id: 'source', keys: ['P'] },
    { g: 'notes', id: 'note', keys: ['N'] },
    { g: 'notes', id: 'range', keys: ['R'] },
    { g: 'notes', id: 'setIn', keys: ['I'] },
    { g: 'notes', id: 'setOut', keys: ['O'] },
    { g: 'notes', id: 'loop', keys: ['L'] },
    { g: 'notes', id: 'deleteNote', keys: ['Delete', 'Backspace'] },
    { g: 'timeline', id: 'zoomIn', keys: ['Plus', '='] },
    { g: 'timeline', id: 'zoomOut', keys: ['-'] },
    { g: 'stage', id: 'staging', keys: ['M'] },
    { g: 'stage', id: 'modeMove', keys: ['W'], stage: true },
    { g: 'stage', id: 'modeRotate', keys: ['E'], stage: true },
    { g: 'stage', id: 'modeScale', keys: ['R'], stage: true },
  ];
  const BY = new Map(ACTIONS.map((a) => [a.id, a]));
  const GROUPS = ['common', 'play', 'image', 'notes', 'timeline', 'stage'];
  // keys that stay where they are: the menu bar's, the dialogs', the text fields' and the ones the browser keeps for itself
  const RESERVED = new Set(['Escape', 'Tab', 'Shift+Tab', 'Enter', 'F10', 'F5', 'F11', 'F12', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+W', 'Ctrl+T',
    'Ctrl+R', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Tab', 'Ctrl+Shift+Tab']);
  // in staging, the arrows and Page↑/↓ push the chosen object (with Shift or Alt too): not for a staging action
  const NUDGE = /^(Shift\+|Alt\+)?(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|PageUp|PageDown)$/;
  let OVER = {};   // id → keys, only the ones the user changed

  const keys = (id) => (Object.prototype.hasOwnProperty.call(OVER, id) ? OVER[id] : BY.get(id)?.keys ?? []);
  function combo(e) {
    let k = e.key;
    if (!k || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified'].includes(k)) return null;
    if (k === ' ' || k === 'Spacebar') k = 'Space';
    if (k === '+') k = 'Plus';
    if (k.length === 1 && /^Key[A-Z]$/.test(e.code ?? '') && !/^[a-z]$/i.test(k) && (e.ctrlKey || e.metaKey || e.altKey)) k = e.code.slice(3);   // Ctrl+letter on another alphabet
    if (k.length === 1) k = k.toUpperCase();
    const sign = k.length === 1 && !/^[A-Z0-9]$/.test(k);
    const m = [];
    if (e.ctrlKey || e.metaKey) m.push('Ctrl');
    if (e.altKey) m.push('Alt');
    if (e.shiftKey && !sign) m.push('Shift');
    return [...m, k].join('+');
  }
  const is = (e, id) => { const c = combo(e); return !!c && keys(id).includes(c); };
  // a key, written for people: « Ctrl+Maj+Z », « Espace », « ← »
  const NAMES = { Space: 'menu.sc.k.space', Delete: 'menu.sc.k.delete', Backspace: 'menu.sc.k.backspace', Home: 'menu.sc.k.home', End: 'menu.sc.k.end',
    PageUp: 'menu.sc.k.pgup', PageDown: 'menu.sc.k.pgdn', Enter: 'menu.sc.k.enter', Escape: 'menu.sc.k.esc', Shift: 'menu.sc.k.shift', Insert: 'menu.sc.k.insert' };
  const SIGNS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Plus: '+' };
  const part = (p) => SIGNS[p] ?? (NAMES[p] ? T(NAMES[p]) : p);
  const pretty = (c) => String(c).split('+').map(part).join('+');
  const show = (id) => (keys(id)[0] ? pretty(keys(id)[0]) : '');
  const kbd = (c) => String(c).split('+').map((p) => `<kbd>${esc(part(p))}</kbd>`).join('+');

  async function load() {
    try { const r = await (await fetch('/api/shortcuts', { cache: 'no-store' })).json(); OVER = clean(r?.shortcuts); } catch { /* the defaults */ }
  }
  function clean(o) {
    const out = {};
    for (const [id, ks] of Object.entries(o && typeof o === 'object' ? o : {})) if (BY.has(id) && Array.isArray(ks)) out[id] = ks.filter((k) => typeof k === 'string' && k.length <= 40).slice(0, 4);
    return out;
  }
  async function store() {
    try {
      const r = await fetch('/api/shortcuts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shortcuts: OVER }) });
      return (await r.json())?.ok === true;
    } catch { return false; }
  }
  function setKeys(id, ks) {
    const def = BY.get(id).keys, same = ks.length === def.length && ks.every((k, i) => k === def[i]);
    if (same) delete OVER[id]; else OVER[id] = ks;
  }
  // who else has this key, in the same layer (staging or not)
  const clash = (id, c) => ACTIONS.find((a) => a.id !== id && !!a.stage === !!BY.get(id).stage && keys(a.id).includes(c));
  const label = (id) => T('menu.sc.a.' + id);

  // ---- the window: Aide › Raccourcis clavier (F1) ----
  const css = `
  .sc-dlg .box { width: min(820px, 94vw); height: 86vh; }
  .sc-dlg .body { display: flex; flex-direction: column; gap: 6px; overflow: hidden; flex: 1; }
  .sc-dlg .sc-list { flex: 1; min-height: 0; overflow: auto; padding-right: 4px; }
  .sc-top { display: flex; gap: 10px; align-items: center; }
  .sc-top input { flex: 1; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(0, 0, 0, 0.25); color: #f4f5fa; font: 13px "Inter", "Segoe UI", system-ui, sans-serif; outline: none; }
  .sc-top input:focus { border-color: rgba(201, 242, 107, 0.6); }
  .sc-note { margin: 0; font-size: 12.5px; }
  .sc-msg { min-height: 18px; font-size: 12.5px; color: #c9f26b; } .sc-msg.err { color: #ff8a7a; }
  .sc-list h3 { margin: 14px 0 4px; font: 600 11px "Outfit", "Segoe UI", system-ui, sans-serif; text-transform: uppercase; letter-spacing: .1em; color: #c9f26b; }
  .sc-list h3:first-child { margin-top: 2px; }
  .sc-row { display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 2px 8px; border-radius: 10px; }
  .sc-row:hover { background: rgba(255, 255, 255, 0.04); }
  .sc-row .sc-l { flex: 1; min-width: 0; color: #f4f5fa; }
  .sc-row .sc-k { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .mb-dlg .sc-row button { height: 26px; padding: 0 10px; font: 600 12px "JetBrains Mono", "Cascadia Mono", Consolas, monospace; border-radius: 8px; }
  .mb-dlg .sc-row button.sc-key { background: rgba(255, 255, 255, 0.08); }
  .mb-dlg .sc-row button.sc-key .x { margin-left: 8px; color: #8a8fa6; font-weight: 400; }
  .mb-dlg .sc-row button.sc-key .x:hover { color: #ff8a7a; }
  .mb-dlg .sc-row button.sc-add, .mb-dlg .sc-row button.sc-reset { padding: 0 9px; color: #aeb2c4; font-family: "Inter", "Segoe UI", system-ui, sans-serif; }
  .mb-dlg .sc-row button.rec { background: rgba(201, 242, 107, 0.18); border-color: rgba(201, 242, 107, 0.7); color: #f4f5fa; }
  .sc-row .sc-none { color: #5f647a; font-size: 12px; }
  .sc-row.changed .sc-l::after { content: " •"; color: #c9f26b; }
  .sc-fx { margin: 4px 8px 2px; font-size: 12px; color: #8a8fa6; }
  .sc-fx kbd, .sc-note kbd { display: inline-block; min-width: 16px; padding: 0 5px; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.06); color: #f4f5fa; font: 600 11px "JetBrains Mono", Consolas, monospace; text-align: center; }`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  let dlg = null, rec = null, find = '';
  function open() {
    if (!window.MenuBar) return null;
    rec = null; find = '';
    dlg = window.MenuBar.dialog({
      title: T('menu.sc.title'),
      html: `<div class="sc-top"><input class="sc-find" type="search" placeholder="${esc(T('menu.sc.find'))}" aria-label="${esc(T('menu.sc.find'))}"></div>
        <p class="sc-note">${T('menu.sc.note')}</p><div class="sc-msg" aria-live="polite"></div><div class="sc-list"></div>`,
      buttons: [{ label: T('menu.sc.resetAll'), run: async () => { if (!Object.keys(OVER).length) { say(T('menu.sc.nothing')); return false; } OVER = {}; const ok = await store(); say(ok ? T('menu.sc.resetDone') : T('menu.sc.saveFailed'), !ok); draw(); changed(); return false; } },
        { label: T('menu.dlg.close'), primary: true }],
      onClose: () => { dlg = null; rec = null; },
    });
    dlg.classList.add('sc-dlg');
    // the bar gives this window the keys first (menubar.js « __onKey »): while a key is being recorded, it is that key
    dlg.__onKey = (e) => { if (!rec) return false; e.preventDefault(); record(e); return true; };
    const f = dlg.querySelector('.sc-find');
    f.addEventListener('input', () => { find = f.value.trim().toLowerCase(); draw(); });
    draw();
    return dlg;
  }
  const say = (t, err = false) => { const m = dlg?.querySelector('.sc-msg'); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } };
  const fixedLine = (g) => {
    const v = { undo: kbd(keys('undo')[0] ?? 'Ctrl+Z') };
    const t = T('menu.sc.fx.' + g, v);
    return t && t !== 'menu.sc.fx.' + g ? `<p class="sc-fx">${t}</p>` : '';
  };
  function draw() {
    const list = dlg?.querySelector('.sc-list'); if (!list) return;
    const match = (a) => !find || label(a.id).toLowerCase().includes(find) || keys(a.id).some((k) => pretty(k).toLowerCase().includes(find) || k.toLowerCase().includes(find));
    let html = '';
    for (const g of GROUPS) {
      const rows = ACTIONS.filter((a) => a.g === g && match(a));
      if (!rows.length && find) continue;
      html += `<h3>${esc(T('menu.sc.g.' + g))}</h3>`;
      for (const a of rows) {
        const ks = keys(a.id), mod = Object.prototype.hasOwnProperty.call(OVER, a.id);
        const chips = ks.map((k, i) => `<button class="sc-key${rec?.id === a.id && rec.i === i ? ' rec' : ''}" data-i="${i}" title="${esc(T('menu.sc.change'))}">${rec?.id === a.id && rec.i === i ? esc(T('menu.sc.press')) : esc(pretty(k))}<span class="x" data-x="${i}" title="${esc(T('menu.sc.remove'))}">×</span></button>`).join('');
        const adding = rec?.id === a.id && rec.i === -1;
        html += `<div class="sc-row${mod ? ' changed' : ''}" data-id="${a.id}"><span class="sc-l">${esc(label(a.id))}</span><span class="sc-k">${chips || (adding ? '' : `<span class="sc-none">${esc(T('menu.sc.none'))}</span>`)}`
          + `<button class="sc-add${adding ? ' rec' : ''}" title="${esc(T('menu.sc.add'))}">${adding ? esc(T('menu.sc.press')) : '+'}</button>`
          + (mod ? `<button class="sc-reset" title="${esc(T('menu.sc.reset', { keys: BY.get(a.id).keys.map(pretty).join(', ') || T('menu.sc.none') }))}">↺</button>` : '') + '</span></div>';
      }
      if (!find) html += fixedLine(g);
    }
    if (!find) html += `<h3>${esc(T('menu.sc.g.other'))}</h3>${fixedLine('other')}`;
    list.innerHTML = html;
    list.querySelectorAll('.sc-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelectorAll('.sc-key').forEach((b) => b.addEventListener('click', (e) => {
        const x = e.target.closest('[data-x]');
        if (x) { const gone = keys(id)[+x.dataset.x] ?? ''; setKeys(id, keys(id).filter((_, i) => i !== +x.dataset.x)); rec = null; save(T('menu.sc.removed', { key: pretty(gone), what: label(id) })); return; }
        rec = { id, i: +b.dataset.i }; say(T('menu.sc.pressFor', { what: label(id) })); draw();
      }));
      row.querySelector('.sc-add').addEventListener('click', () => { rec = { id, i: -1 }; say(T('menu.sc.pressFor', { what: label(id) })); draw(); });
      row.querySelector('.sc-reset')?.addEventListener('click', () => { delete OVER[id]; rec = null; save(T('menu.sc.resetOne', { what: label(id) })); });
    });
  }
  async function save(msg) {
    draw();
    const ok = await store();
    say(ok ? msg : T('menu.sc.saveFailed'), !ok);
    changed();
  }
  function record(e) {
    if (e.key === 'Escape') { rec = null; say(T('menu.sc.cancelled')); draw(); return; }
    const c = combo(e); if (!c) return;   // a modifier alone: wait for the key
    const { id, i } = rec, a = BY.get(id);
    if (RESERVED.has(c)) { say(T('menu.sc.reserved', { key: pretty(c) }), true); return; }
    if (a.stage && NUDGE.test(c)) { say(T('menu.sc.nudge', { key: pretty(c) }), true); return; }
    const ks = [...keys(id)];
    if (ks.includes(c) && ks.indexOf(c) !== i) { rec = null; say(T('menu.sc.already', { key: pretty(c) })); draw(); return; }
    let msg = T('menu.sc.set', { key: pretty(c), what: label(id) });
    const other = clash(id, c);
    if (other) { setKeys(other.id, keys(other.id).filter((k) => k !== c)); msg += ' ' + T('menu.sc.taken', { what: label(other.id) }); }
    if (i === -1) ks.push(c); else ks[i] = c;
    setKeys(id, ks.slice(0, 4)); rec = null;
    save(msg);
  }
  const listeners = new Set();
  const changed = () => { for (const f of listeners) try { f(); } catch { /* */ } };

  const ready = load();
  // another window (the home screen, another studio) may have changed them: read again when this one comes back
  window.addEventListener('focus', () => { if (!dlg) load(); });
  window.Shortcuts = { is, keys, show, pretty, combo, open, ready, actions: () => ACTIONS.map((a) => ({ ...a, now: keys(a.id) })), onChange: (f) => { listeners.add(f); return () => listeners.delete(f); }, reload: load };
})();
