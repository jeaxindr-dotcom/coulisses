// The studio's page (studio.html), part 00: the page's helpers and texts, the line icons, the panels (sizes, the image fitted in its area).
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
  const $ = (s) => document.querySelector(s);
  // the texts of the page, in the user's language: window.T(key, values), given by studio-server.mjs (lib/i18n.mjs, « st.* »)
  const I18N = window.__I18N ?? { lang: 'fr', dict: {} }, LANG = I18N.lang, FR = LANG === 'fr', T = window.T ?? ((k) => k);
  // numbers and dates: French keeps the formats it always had (decimal comma, the browser's own date formats)
  const dec = (x) => (FR ? String(x).replace('.', ',') : String(x));
  const hm5 = (d) => (FR ? d.toLocaleTimeString() : d.toLocaleTimeString('en-GB')).slice(0, 5);
  const v = $('#v'), cv = $('#tl'), tip = $('#tip'), ov = $('#ov'), media = $('#media');
  let codeEl = $('#code');   // the live preview's frame (a new version of the code comes in a new one, then takes its place)
  let META = null, SNAP = null, LIVE = null, FPS = 30, FRAMES = 0, DUR = 0, MAXQ = 10;
  let CW = 1920, CH = 1080;                    // the frame's pixels (1920×1080 for an episode; a project: its video's): every mark is stored in these
  let PROJ = false;                            // an imported project (AItelier run, any video), not a Brambleshire episode
  let notes = [], sel = null, loopId = null, stopAt = null, rangeStart = null;
  let REPLIES = { notes: {} };
  let STATUS = { lots: [], agent: {}, code: {}, timeline: {} };
  const pending = {};
  let view = { a: 0, b: 1 };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = {};
  const uid = () => Math.random().toString(36).slice(2, 10);
  const now = () => new Date().toISOString();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get: (k, d) => { try { const x = localStorage.getItem('studio.' + k); return x === null ? d : JSON.parse(x); } catch { return d; } },
    set: (k, x) => { try { localStorage.setItem('studio.' + k, JSON.stringify(x)); } catch { /* private window */ } } };

  // ---------- line icons (after Lucide, ISC licence) ----------
  const ICONS = {
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    pointer: '<path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"/>',
    pen: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
    comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    range: '<path d="M8 4H5v16h3"/><path d="M16 4h3v16h-3"/><path d="M9 12h6"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 12h18M3 7.5h4M3 16.5h4M17 7.5h4M17 16.5h4"/>',
    play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    fit: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    volume: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.59A1.4 1.4 0 0 1 5.42 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.42a1.4 1.4 0 0 1 1 .41l3.38 3.39a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
    send: '<path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    goto: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    question: '<path d="M8.6 8.6a3.5 3.5 0 0 1 6.8 1.2c0 2.3-3.4 3.2-3.4 3.2"/><path d="M12 17.5h.01"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    pin: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6"/>',
    stroke: '<path d="M4 17c3-6 7 2 10-3s4-6 6-4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    start: '<path d="M6 4v16"/><path d="M18 12H10m4-4-4 4 4 4"/>', end: '<path d="M18 4v16"/><path d="M6 12h8m-4-4 4 4-4 4"/>',
    point: '<path d="M12 4v16"/><circle cx="12" cy="12" r="3"/>',
    move: '<path d="M12 2v20M2 12h20"/><path d="m15 19-3 3-3-3M19 9l3 3-3 3M5 9l-3 3 3 3M9 5l3-3 3 3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  };
  const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  document.querySelectorAll('i[data-ic]').forEach((el) => { el.outerHTML = ic(el.dataset.ic); });

  // ---------- panels: sizes (dragged splitters, remembered), image fitted in its area ----------
  const root = document.documentElement;
  const applySizes = () => { root.style.setProperty('--side', store.get('side', 420) + 'px'); root.style.setProperty('--tlh', store.get('tlh', 330) + 'px'); };
  applySizes();
  function splitter(el, axis) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('drag');
      const move = (ev) => {
        if (axis === 'x') store.set('side', Math.round(Math.max(320, Math.min(window.innerWidth - 500, window.innerWidth - ev.clientX))));
        else store.set('tlh', Math.round(Math.max(150, Math.min(window.innerHeight - 260, window.innerHeight - ev.clientY))));
        applySizes(); fitMedia(); resize();
      };
      const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    });
  }
  splitter($('#splitV'), 'x'); splitter($('#splitH'), 'y');
  function fitMedia() {
    const box = $('#stagewrap').getBoundingClientRect(), w = Math.max(160, box.width - 32), h = Math.max(90, box.height - 28);
    const R = CW / CH, W0 = Math.floor(Math.min(w, h * R)), H0 = Math.floor(W0 / R);
    v.style.width = W0 + 'px'; v.style.height = H0 + 'px';
    drawOv();
  }
  new ResizeObserver(() => { fitMedia(); }).observe($('#stagewrap'));
  let tab = store.get('tab', 'queue');
  function setTab(t) {
    tab = t; store.set('tab', t);
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelector(`#tabs button[data-tab="${t}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + t));
    if (t === 'insp') renderInspector(true);
    if (t === 'lots') renderLots();
    if (t === 'scene') renderScene();
    if (t === 'medias') window.CoulissesMedias?.show(); else window.CoulissesMedias?.hide();
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => setTab(b.dataset.tab));
  $('#helpBtn').onclick = () => window.Shortcuts?.open();   // Aide › Raccourcis clavier (shortcuts.js)
  // « Langue · Language » (Édition › Préférences): the user's choice for the whole app (settings.json, via
  // the server); the notes are saved first, and the page comes back in the new language on the same frame
  async function setLanguage(l) {
    if (l === LANG) return true;
    await flushNow();
    const r = await fetch('/api/lang', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: l }) }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return false;
    location.hash = `f=${curFrame()}`; location.reload();
    return true;
  }
  // the « … » menu of a card
  const menu = $('#menu');
  function openMenu(anchor, items) {
    menu.innerHTML = '';
    for (const it of items) {
      if (it === '-') { menu.appendChild(document.createElement('hr')); continue; }
      const b = document.createElement('button'); b.innerHTML = `${ic(it.icon)}${esc(it.label)}`; if (it.danger) b.classList.add('danger');
      b.onclick = () => { closeMenu(); it.run(); }; menu.appendChild(b);
    }
    menu.classList.add('open');
    const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) + 'px';
    menu.style.top = (r.bottom + mh + 6 > window.innerHeight ? r.top - mh - 6 : r.bottom + 6) + 'px';
  }
  const closeMenu = () => menu.classList.remove('open');
  document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && !e.target.closest('.more')) closeMenu(); });

