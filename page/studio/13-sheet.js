// The studio's page (studio.html), part 13: « Planche », the whole video as a board of stills (user request,
// 16/10/2026, from HyperFrames Studio's storyboards « a board of stills »: « mets tout »). Over the image, its area only
// (the transport and the timeline stay): one still at every cut (« Coupes »: the edit points of part 08, to check the
// cuts at a glance), or every 2, 5, 10, 30 s; each with its time, its scene, the notes there; the playhead's one ringed.
// A click goes there and closes the board; T or « Affichage › Planche » opens and closes it; Échap closes it.
// The stills are the rendered MP4's (/api/frame, its own cache): a project with no video yet has no board (a still of
// the code is a render of its own, seconds each).
  let sheetOn = false;
  const sheetModeKey = () => `coulisses.sheet.${META?.coulisses ?? META?.root ?? META?.title ?? ''}`;
  const SHEET_STEPS = [2, 5, 10, 30];
  function sheetFrames(mode) {
    if (mode === 'cuts') return editPoints().filter((f) => f < FRAMES - 1);
    const step = Math.max(1, Math.round(+mode * FPS)), out = [];
    for (let f = 0; f < FRAMES; f += step) out.push(f);
    return out;
  }
  // the default: the cuts when there are a few, else the interval giving 40 to 150 stills
  function sheetMode() {
    let m = null; try { m = localStorage.getItem(sheetModeKey()); } catch { /* */ }
    if (m === 'cuts' || SHEET_STEPS.includes(+m)) return m;
    const cuts = editPoints().length;
    if (cuts >= 4 && cuts <= 300) return 'cuts';
    const d = FRAMES / FPS; return String(SHEET_STEPS.find((s) => d / s <= 150) ?? 30);
  }
  function renderSheet() {
    const el = $('#sheet'); if (!el) return;
    const video = STATUS?.video ?? META?.render;
    const mode = sheetMode(), frames = video ? sheetFrames(mode) : [];
    const modes = [['cuts', T('st.sheet.cuts')], ...SHEET_STEPS.filter((s) => FRAMES / FPS / s <= 600).map((s) => [String(s), T('st.sheet.every', { s })])];
    const cur = curFrame(), w = CH / CW > 1.2 ? 220 : 360, sorted = notes;
    const tiles = frames.map((f, i) => {
      const next = frames[i + 1] ?? FRAMES, here = cur >= f && cur < next;
      const c = contextAt(f), n = sorted.filter((x) => x.frame >= f && x.frame < next).length;
      return `<button class="tile${here ? ' here' : ''}" data-f="${f}" title="${esc(T('st.sheet.go', { t: fmt(f / FPS) }))}">
        <span class="img"><img loading="lazy" decoding="async" alt="" style="aspect-ratio:${CW}/${CH}" src="/api/frame?f=${f}&w=${w}&source=video"></span>
        <span class="meta"><b>${fmt(f / FPS)}</b>${c.scene ? `<span class="sc">${esc(c.scene)}</span>` : ''}${n ? `<span class="nb" title="${esc(T('st.sheet.notes', { n }))}">${n}</span>` : ''}</span></button>`;
    }).join('');
    el.innerHTML = `<div class="sbar"><b>${T('st.sheet.title')}</b><span class="muted">${video ? T('st.sheet.n', { n: frames.length }) : ''}</span><span class="grow"></span>
      <span class="seg">${modes.map(([m, l]) => `<button data-m="${m}" class="${m === mode ? 'on' : ''}">${l}</button>`).join('')}</span>
      <button class="soft icon" id="sheetX" title="${esc(T('st.sheet.close'))}">${ic('x')}</button></div>
      ${video ? `<div class="grid${CH / CW > 1.2 ? ' tall' : ''}">${tiles}</div>` : `<div class="empty">${T('st.sheet.noVideo')}</div>`}`;
    el.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { try { localStorage.setItem(sheetModeKey(), b.dataset.m); } catch { /* */ } renderSheet(); }));
    $('#sheetX').addEventListener('click', () => toggleSheet(false));
    el.querySelectorAll('.tile').forEach((b) => b.addEventListener('click', () => { M.pause(); seekFrame(+b.dataset.f); toggleSheet(false); }));
    el.querySelector('.tile.here')?.scrollIntoView({ block: 'center' });
  }
  function toggleSheet(on = !sheetOn) {
    sheetOn = !!on;
    $('#sheet')?.classList.toggle('on', sheetOn);
    $('#bSheet')?.classList.toggle('on', sheetOn);
    if (sheetOn) { M.pause(); renderSheet(); }
  }
