// The studio's page (studio.html), part 12: the safe zones on the image (user request, 16/10/2026, from HyperFrames
// Studio's « ruler and safe-margin toggles »: « mets tout, check comment bien le marier à l'interface »).
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
//   - a vertical video (9:16, a Short): what YouTube Shorts' own interface covers — the search bar at the top (180 px of
//     1920), the title, the channel and the music at the bottom (390), the buttons on the right (120), a margin on the
//     left (60): the 900 × 1350 px left free, the most quoted safe zone of 2026;
//   - any other: the « action » (93 %) and « title » (90 %) frames of television (SMPTE);
//   - always: the thirds, faint (the framing).
// A layer over the picture that never takes a click (the drawing tools stay under the hand), never in a capture (the
// images of a batch are cut from the video by the server). S or « Affichage › Zones de sécurité »; kept per project.
  const safeKey = () => `coulisses.safe.${META?.coulisses ?? META?.root ?? META?.title ?? ''}`;
  let safeOn = false;
  function safeZones() {
    const W = CW, H = CH, svg = (inner) => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
    const fs = Math.round(H / W > 1.5 ? H * 0.024 : W * 0.018), lab = (x, y, t, a = 'middle') => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="${fs}">${esc(t)}</text>`;
    const thirds = `<g class="thirds"><path d="M${W / 3} 0V${H}M${(2 * W) / 3} 0V${H}M0 ${H / 3}H${W}M0 ${(2 * H) / 3}H${W}"/></g>`;
    if (H / W > 1.5) {   // a Short: YouTube's interface
      const k = H / 1920, top = 180 * k, bot = 390 * k, left = 60 * (W / 1080), right = 120 * (W / 1080);
      const band = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
      return svg(`${thirds}<g class="bands">${band(0, 0, W, top)}${band(0, H - bot, W, bot)}${band(W - right, top, right, H - top - bot)}${band(0, top, left, H - top - bot)}</g>
        <rect class="safe" x="${left}" y="${top}" width="${W - left - right}" height="${H - top - bot}"/>
        <g class="labs">${lab(W / 2, top / 2 + fs * 0.35, T('st.safe.shTop'))}${lab(W / 2, H - bot / 2 + fs * 0.35, T('st.safe.shBottom'))}${`<text x="${W - right / 2}" y="${H / 2}" text-anchor="middle" font-size="${fs}" transform="rotate(90 ${W - right / 2} ${H / 2})">${esc(T('st.safe.shRight'))}</text>`}</g>`);
    }
    // the action frame's label at its bottom left, the title frame's at its top left: never one on the other
    const r = (p, cls, t, atTop) => { const mx = W * p, my = H * p; return `<rect class="${cls}" x="${mx}" y="${my}" width="${W - 2 * mx}" height="${H - 2 * my}"/>${lab(mx + fs * 0.5, atTop ? my + fs * 1.2 : H - my - fs * 0.45, t, 'start')}`; };
    return svg(`${thirds}<g class="labs">${r(0.035, 'action', T('st.safe.action'), false)}${r(0.05, 'title', T('st.safe.title'), true)}</g>`);
  }
  function drawSafe() {
    const el = $('#safeOv'); if (!el) return;
    el.classList.toggle('on', safeOn);
    el.innerHTML = safeOn ? safeZones() : '';
    $('#bSafe')?.classList.toggle('on', safeOn);
  }
  function toggleSafe(on = !safeOn) {
    safeOn = !!on;
    try { localStorage.setItem(safeKey(), safeOn ? '1' : '0'); } catch { /* private window */ }
    drawSafe();
    setSave(T(safeOn ? (CH / CW > 1.5 ? 'st.safe.onShorts' : 'st.safe.onWide') : 'st.safe.off'), 'ok');
  }
  // at the start (part 10 calls it once the frame's size is known): the choice of this project
  function initSafe() {
    try { safeOn = localStorage.getItem(safeKey()) === '1'; } catch { safeOn = false; }
    $('#bSafe')?.addEventListener('click', () => toggleSafe());
    $('#bSheet')?.addEventListener('click', () => toggleSheet());   // « Planche » (part 13)
    drawSafe();
  }
  // the « Affichage » menu (part 09): the tools to look at the video
  function viewMenu() {
    return [
      { id: 'safeZones', label: () => T(safeOn ? 'menu.safeOff' : 'menu.safeOn'), key: () => SC.show('safeZones'), run: () => toggleSafe() },
      { id: 'sheet', label: () => T(sheetOn ? 'menu.sheetOff' : 'menu.sheetOn'), key: () => SC.show('sheet'), run: () => toggleSheet() },
    ];
  }
