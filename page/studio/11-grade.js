// The studio's page (studio.html), part 11: « Étalonnage », the grading page (user request, 09/10/2026: « un système
// d'étalonnage, avec plusieurs filtres rangés par type d'émotion à transmettre, et les roues colorimétriques standard »,
// « une page à part, un peu comme DaVinci Resolve », « par scène », « l'agent l'écrit dans le code »).
// The parts of page/studio/ are one script: studio-server.mjs joins them in their order inside one function (/studio.js),
// so they share their names as the one inline script did; hence the two-space indent.
//
// One model of a grade, and ONE maths for it, everywhere (what the user sees is what the render gets):
//   - per channel (R, G, B, each on its own): exposure, temperature / tint, Lift / Gamma / Gain / Offset (the standard
//     wheels, DaVinci's formula), contrast around a pivot -> a table of the channel (an SVG feComponentTransfer);
//   - then saturation (feColorMatrix saturate), shadows / highlights tinted by the luma (split toning), a halo (the
//     highlights blurred and screened); a vignette and a grain laid over the image.
// The preview: that SVG filter on what is behind #cgFx (backdrop-filter): its left edge is the before / after wipe. The
// looks' cards and the scopes (waveform, RGB parade): the same maths in JavaScript, on a frame of the video or of the code.
// The agent gets the exact filter (for the composition's size), the scene's frames, and writes it in the project.

  // ---------- the model ----------
  const CG_WHEELS = ['lift', 'gamma', 'gain', 'offset'];
  // a wheel: h = hue (degrees, 0 red · 120 green · 240 blue), s = strength (0…1), m = master (−1…1: darker / brighter)
  const cgWheel0 = () => ({ h: 0, s: 0, m: 0 });
  // the bars above and under the wheels, as in DaVinci Resolve's Primaries (user request, 09/10/2026): exposure,
  // temperature, tint, contrast, pivot, mid/detail; colour boost, shadows, highlights, saturation, hue, lum mix
  const cgNeutral = () => ({ look: null, amount: 1, lift: cgWheel0(), gamma: cgWheel0(), gain: cgWheel0(), offset: cgWheel0(),
    exposure: 0, contrast: 1, pivot: 0.435, saturation: 1, temperature: 0, tint: 0,
    midDetail: 0, boost: 0, shadows: 0, highlights: 0, hue: 0, lumMix: 1,
    vignette: 0, grain: 0, halo: 0, shH: 30, shS: 0, hiH: 200, hiS: 0 });
  // a grade made before a setting existed (kept in this browser, or waiting in the queue): the setting at its neutral value
  const cgNorm = (g) => (g ? { ...cgNeutral(), ...g } : g);
  const WH = (h, s, m = 0) => ({ h, s, m });
  // the 31 looks to start with, by the emotion they carry (the most used grades: teal & orange, bleach bypass, film
  // emulations, day for night, cyberpunk…) — a look is a grade; its amount mixes it with the neutral one
  const CG_LOOKS = [
    ['warm', 'golden', { temperature: 0.45, gain: WH(40, 0.25), gamma: WH(35, 0.1, 0.05), saturation: 1.1, contrast: 1.05, halo: 0.25, vignette: 0.2 }],
    ['warm', 'vintage', { lift: WH(45, 0.3, 0.25), gain: WH(40, 0.12, -0.1), contrast: 0.85, saturation: 0.8, temperature: 0.2, grain: 0.35, vignette: 0.25 }],
    ['warm', 'portra', { temperature: 0.25, tint: 0.05, contrast: 0.95, saturation: 0.95, gamma: WH(25, 0.1, 0.05), lift: WH(200, 0.06, 0.06), grain: 0.15 }],
    ['warm', 'sepia', { saturation: 0.15, shH: 30, shS: 0.35, hiH: 40, hiS: 0.3, contrast: 0.9, lift: WH(0, 0, 0.08), vignette: 0.35, grain: 0.25 }],
    ['joy', 'pop', { saturation: 1.45, contrast: 1.2, gain: WH(0, 0, 0.05) }],
    ['joy', 'summer', { exposure: 0.25, temperature: 0.2, saturation: 1.2, contrast: 1.05, gain: WH(50, 0.1, 0.08), halo: 0.15 }],
    ['joy', 'pastel', { exposure: 0.3, contrast: 0.75, saturation: 0.8, lift: WH(200, 0.08, 0.2), gain: WH(330, 0.06), tint: -0.05 }],
    ['joy', 'vlog', { contrast: 1.1, saturation: 1.08, temperature: 0.08, gamma: WH(0, 0, 0.03) }],
    ['dream', 'haze', { contrast: 0.75, lift: WH(40, 0.12, 0.25), saturation: 0.85, halo: 0.45, temperature: 0.1 }],
    ['dream', 'fairy', { saturation: 1.15, halo: 0.5, gamma: WH(300, 0.08, 0.05), gain: WH(50, 0.12), shH: 270, shS: 0.15, vignette: 0.25 }],
    ['dream', 'lavender', { gamma: WH(280, 0.15), lift: WH(270, 0.15, 0.1), saturation: 0.9, contrast: 0.9, halo: 0.2 }],
    ['dream', 'glow', { halo: 0.7, temperature: 0.3, gain: WH(45, 0.15, 0.05), contrast: 0.95 }],
    ['sad', 'rain', { temperature: -0.4, saturation: 0.6, contrast: 0.95, lift: WH(210, 0.15, 0.05), gamma: WH(0, 0, -0.05) }],
    ['sad', 'morandi', { saturation: 0.45, contrast: 0.8, lift: WH(0, 0, 0.12), gamma: WH(30, 0.05), tint: 0.03 }],
    ['sad', 'faded', { lift: WH(0, 0, 0.3), contrast: 0.8, saturation: 0.7, gain: WH(0, 0, -0.1), grain: 0.2 }],
    ['sad', 'winter', { temperature: -0.55, tint: 0.05, saturation: 0.7, exposure: 0.1, gain: WH(200, 0.12), contrast: 1.05 }],
    ['tension', 'bleach', { saturation: 0.35, contrast: 1.4, gamma: WH(0, 0, -0.05), gain: WH(0, 0, 0.05), grain: 0.2 }],
    ['tension', 'tealorange', { lift: WH(195, 0.5), gamma: WH(195, 0.1), gain: WH(30, 0.35), saturation: 1.15, contrast: 1.15 }],
    ['tension', 'sickly', { temperature: 0.35, tint: -0.25, gamma: WH(60, 0.25), saturation: 0.9, contrast: 1.15, vignette: 0.3 }],
    ['tension', 'alarm', { gamma: WH(0, 0.25), gain: WH(10, 0.15), lift: WH(350, 0.12, -0.05), contrast: 1.3, saturation: 1.1, vignette: 0.4 }],
    ['night', 'daynight', { exposure: -0.9, temperature: -0.6, saturation: 0.5, contrast: 1.15, gamma: WH(220, 0.2, -0.1), vignette: 0.4 }],
    ['night', 'moody', { exposure: -0.25, contrast: 1.25, saturation: 0.6, lift: WH(200, 0.1, -0.1), gamma: WH(0, 0, -0.08), vignette: 0.45 }],
    ['night', 'tungsten', { lift: WH(185, 0.3, 0.05), gain: WH(35, 0.18), contrast: 1.1, saturation: 0.95, grain: 0.3, halo: 0.2 }],
    ['night', 'moonlight', { temperature: -0.45, exposure: -0.4, gain: WH(210, 0.15, 0.05), saturation: 0.55, contrast: 1.1, halo: 0.3, vignette: 0.3 }],
    ['future', 'neon', { lift: WH(240, 0.3, -0.05), gamma: WH(300, 0.2), gain: WH(185, 0.2), saturation: 1.35, contrast: 1.25, halo: 0.35 }],
    ['future', 'matrix', { tint: -0.45, temperature: -0.1, gamma: WH(120, 0.2), saturation: 0.7, contrast: 1.2, vignette: 0.25 }],
    ['future', 'clinical', { temperature: -0.3, saturation: 0.55, exposure: 0.15, contrast: 1.1, lift: WH(190, 0.08), gain: WH(0, 0, 0.05) }],
    ['classic', 'bw', { saturation: 0, contrast: 1.2, grain: 0.2, vignette: 0.2 }],
    ['classic', 'blackgold', { saturation: 0.25, hiH: 43, hiS: 0.45, contrast: 1.35, lift: WH(0, 0, -0.08), vignette: 0.35 }],
    ['classic', 'hongkong', { tint: -0.15, temperature: 0.15, gamma: WH(150, 0.1), gain: WH(45, 0.15), saturation: 1.1, contrast: 1.05, halo: 0.3, grain: 0.25 }],
    ['classic', 'kodachrome', { saturation: 1.3, contrast: 1.2, gamma: WH(15, 0.08), lift: WH(220, 0.08, -0.03), gain: WH(50, 0.08), temperature: 0.1 }],
  ].map(([emotion, id, p]) => ({ emotion, id, p: { ...cgNeutral(), ...p } }));
  const CG_EMOTIONS = ['warm', 'joy', 'dream', 'sad', 'tension', 'night', 'future', 'classic'];
  const lookById = (id) => CG_LOOKS.find((l) => l.id === id) ?? null;

  // ---------- the maths ----------
  // One pipeline, written twice the same way: as an SVG filter (the preview, and what the agent writes in the project)
  // and on pixels (the cards, the scopes, the images joined to a note). Its steps, in this order:
  //   1. a table per channel: exposure, temperature / tint, Lift / Gamma / Gain / Offset (their colour, and the share of
  //      their master the Lum Mix leaves to R, G, B), contrast around the pivot, shadows / highlights;
  //   2. the masters' other share on the luma only (Lum Mix 100 = all of it, as DaVinci): Y → Y', the same shift on R, G, B;
  //   3. saturation; 4. hue (all the hues turned); 5. colour boost (the dull colours saturated, not the vivid ones);
  //   6. the tinted shadows / highlights; 7. mid/detail (local contrast: the image minus its blur); 8. the glow.
  // a hue's direction in colour, its luma taken away (a wheel pushes towards it without changing the brightness)
  function hueDir(h) {
    const k = (n) => (n + h / 30) % 12, f = (n) => 0.5 - 0.5 * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    const c = [f(0), f(8), f(4)], y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return c.map((v) => v - y);
  }
  const wheelRGB = (w) => hueDir(w.h).map((d) => d * w.s);
  const mixW = (a, b, t) => { const A = wheelRGB(a).map((v) => v * t), B = wheelRGB(b); return { rgb: A.map((v, i) => v + B[i]), m: a.m * t + b.m }; };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // the grade as it acts: its look (at its amount) and the user's own moves on top
  function cgEffective(g) {
    const L = lookById(g?.look)?.p ?? cgNeutral(), t = g?.look ? Math.max(0, Math.min(1, g.amount ?? 1)) : 0, u = cgNorm(g) ?? cgNeutral();
    const lin = (k, n) => n + (L[k] - n) * t;
    const E = {};
    for (const k of CG_WHEELS) E[k] = mixW(L[k], u[k], t);
    E.exposure = lin('exposure', 0) + u.exposure; E.contrast = lin('contrast', 1) * u.contrast; E.pivot = u.pivot ?? 0.435;
    E.saturation = lin('saturation', 1) * u.saturation; E.temperature = lin('temperature', 0) + u.temperature; E.tint = lin('tint', 0) + u.tint;
    E.midDetail = lin('midDetail', 0) + u.midDetail; E.boost = lin('boost', 0) + u.boost; E.hue = lin('hue', 0) + u.hue;
    E.shadows = lin('shadows', 0) + u.shadows; E.highlights = lin('highlights', 0) + u.highlights; E.lumMix = clamp01(u.lumMix);
    E.vignette = Math.min(1, lin('vignette', 0) + u.vignette); E.grain = Math.min(1, lin('grain', 0) + u.grain); E.halo = Math.min(1, lin('halo', 0) + u.halo);
    // the tinted shadows / highlights: the user's if set, else the look's at its amount
    E.sh = u.shS > 0 ? { h: u.shH, s: u.shS } : { h: L.shH, s: L.shS * t };
    E.hi = u.hiS > 0 ? { h: u.hiH, s: u.hiS } : { h: L.hiH, s: L.hiS * t };
    return E;
  }
  // step 1: one channel (0 R · 1 G · 2 B), x in 0…1 -> the channel after the primaries (the table of the SVG filter)
  function cgChannel(E, c, x) {
    const temp = [1 + 0.12 * E.temperature, 1 + 0.01 * E.temperature, 1 - 0.14 * E.temperature][c] * [1 + 0.05 * E.tint, 1 - 0.1 * E.tint, 1 + 0.05 * E.tint][c];
    const rm = 1 - E.lumMix;   // the masters' share on R, G, B (the rest goes to the luma, step 2)
    let v = x * Math.pow(2, E.exposure) * temp;
    const lift = 0.35 * (E.lift.rgb[c] + rm * E.lift.m), gain = Math.pow(2, 0.7 * (E.gain.rgb[c] + rm * E.gain.m)), gam = Math.pow(2, -0.9 * (E.gamma.rgb[c] + rm * E.gamma.m));
    v = gain * (v + lift * (1 - v));
    v = Math.pow(Math.max(0, v), gam);
    v += 0.25 * (E.offset.rgb[c] + rm * E.offset.m);
    v = clamp01((v - E.pivot) * E.contrast + E.pivot);
    // shadows / highlights: the dark tones opened (or crushed), the bright ones pushed (or recovered); monotonic curves
    v += E.shadows * v * (1 - v) * (1 - v) + E.highlights * v * v * (1 - v);
    return clamp01(v);
  }
  // step 2: the masters on the luma: Y -> the shift added to R, G, B
  function cgLumaShift(E, y) {
    const L = E.lumMix, lift = 0.35 * L * E.lift.m, gain = Math.pow(2, 0.7 * L * E.gain.m), gam = Math.pow(2, -0.9 * L * E.gamma.m);
    let v = gain * (y + lift * (1 - y));
    v = Math.pow(Math.max(0, v), gam) + 0.25 * L * E.offset.m;
    return v - y;
  }
  const cgLumaOn = (E) => E.lumMix > 0.001 && CG_WHEELS.some((k) => Math.abs(E[k].m) > 1e-4);
  const N_TABLE = 48;
  const cgTables = (E) => [0, 1, 2].map((c) => Array.from({ length: N_TABLE + 1 }, (_, i) => cgChannel(E, c, i / N_TABLE)));
  const cgLumaTable = (E) => Array.from({ length: N_TABLE + 1 }, (_, i) => clamp01(cgLumaShift(E, i / N_TABLE) / 2 + 0.5));   // signed, as 0.5 ± shift / 2
  // a table read as the SVG filter reads it (linear between its points)
  const cgTab = (t, x) => { const n = t.length - 1, u = clamp01(x) * n, j = Math.min(n - 1, Math.floor(u)); return t[j] + (t[j + 1] - t[j]) * (u - j); };
  // the split toning: shadows weighted (1 − Y)², highlights Y², as signed tints split in what adds and what takes away
  const cgSplit = (E) => { const s = hueDir(E.sh.h).map((d) => d * E.sh.s * 0.6), h = hueDir(E.hi.h).map((d) => d * E.hi.s * 0.6); return { s, h, on: E.sh.s > 0.001 || E.hi.s > 0.001 }; };
  // the saturation and hue matrices of SVG (feColorMatrix saturate / hueRotate, as the browser computes them)
  const satM = (s) => [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
  const hueM = (deg) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
  };
  const LUMA_ROW = '0.2126 0.7152 0.0722 0 0';
  const CHROMA_M = '0.7874 -0.7152 -0.0722 0 0.5  -0.2126 0.2848 -0.0722 0 0.5  -0.2126 -0.7152 0.9278 0 0.5  0 0 0 1 0';   // R − Y + ½, G − Y + ½, B − Y + ½
  const BOOST_K = 0.75;   // the dull colours' weight: 1 − 0.75 × (|R−Y| + |G−Y| + |B−Y|) × 2
  const DETAIL_K = 1.2, DETAIL_BLUR = 0.01, HALO_BLUR = 0.012;   // × the image's width
  const f4 = (v) => (Math.round(v * 10000) / 10000).toString();
  const tv = (arr) => arr.map(f4).join(' ');
  const rgbFuncs = (t3) => `<feFuncR type="table" tableValues="${tv(t3[0])}"/><feFuncG type="table" tableValues="${tv(t3[1])}"/><feFuncB type="table" tableValues="${tv(t3[2])}"/>`;
  // the SVG filter of a grade; width = the width in px of the element it is on (the blurs are in px)
  function cgFilterSvg(id, E, width) {
    const T3 = cgTables(E), S = cgSplit(E);
    const o = [`<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">`,
      `<feComponentTransfer in="SourceGraphic" result="t">${rgbFuncs(T3)}</feComponentTransfer>`];
    let last = 't';
    const step = (s, r) => { o.push(s); last = r; };
    if (cgLumaOn(E)) {   // 2. the masters on the luma
      const Y = cgLumaTable(E);
      o.push(`<feColorMatrix in="${last}" type="matrix" values="${LUMA_ROW} ${LUMA_ROW} ${LUMA_ROW} 0 0 0 1 0" result="ly"/>`,
        `<feComponentTransfer in="ly" result="ld">${rgbFuncs([Y, Y, Y])}</feComponentTransfer>`);
      step(`<feComposite in="${last}" in2="ld" operator="arithmetic" k2="1" k3="2" k4="-1" result="lm"/>`, 'lm');
    }
    step(`<feColorMatrix in="${last}" type="saturate" values="${f4(Math.max(0, E.saturation))}" result="s"/>`, 's');   // 3.
    if (Math.abs(E.hue) > 1e-4) step(`<feColorMatrix in="${last}" type="hueRotate" values="${f4(E.hue * 180)}" result="hr"/>`, 'hr');   // 4.
    if (Math.abs(E.boost) > 1e-4) {   // 5. lerp(image, image more saturated, how dull it is)
      const k = BOOST_K, row = (a, b) => `${a} ${a} ${a} 0 ${b}`;
      o.push(`<feColorMatrix in="${last}" type="matrix" values="${CHROMA_M}" result="bc"/>`,
        `<feComponentTransfer in="bc" result="ba">${rgbFuncs([[1, 0, 1], [1, 0, 1], [1, 0, 1]])}</feComponentTransfer>`,
        `<feColorMatrix in="ba" type="matrix" values="${row(-k, 1)} ${row(-k, 1)} ${row(-k, 1)} 0 0 0 1 0" result="bm"/>`,
        `<feColorMatrix in="ba" type="matrix" values="${row(k, 0)} ${row(k, 0)} ${row(k, 0)} 0 0 0 1 0" result="bn"/>`,
        `<feColorMatrix in="${last}" type="saturate" values="${f4(Math.max(0, 1 + E.boost))}" result="bs"/>`,
        `<feComposite in="${last}" in2="bn" operator="arithmetic" k1="1" result="b1"/>`,
        `<feComposite in="bs" in2="bm" operator="arithmetic" k1="1" result="b2"/>`);
      step('<feComposite in="b1" in2="b2" operator="arithmetic" k2="1" k3="1" result="bo"/>', 'bo');
    }
    if (S.on) {   // 6.
      const ys = Array.from({ length: 17 }, (_, i) => i / 16);
      const P = [0, 1, 2].map((c) => ys.map((y) => Math.max(0, S.s[c]) * (1 - y) * (1 - y) + Math.max(0, S.h[c]) * y * y));
      const Nn = [0, 1, 2].map((c) => ys.map((y) => 1 - (Math.max(0, -S.s[c]) * (1 - y) * (1 - y) + Math.max(0, -S.h[c]) * y * y)));
      o.push(`<feColorMatrix in="${last}" type="matrix" values="${LUMA_ROW} ${LUMA_ROW} ${LUMA_ROW} 0 0 0 1 0" result="y"/>`,
        `<feComponentTransfer in="y" result="p">${rgbFuncs(P)}</feComponentTransfer>`,
        `<feComponentTransfer in="y" result="n">${rgbFuncs(Nn)}</feComponentTransfer>`,
        `<feComposite in="${last}" in2="p" operator="arithmetic" k2="1" k3="1" result="a"/>`);
      step('<feComposite in="a" in2="n" operator="arithmetic" k2="1" k3="1" k4="-1" result="sp"/>', 'sp');
    }
    if (Math.abs(E.midDetail) > 1e-4) {   // 7. (1 + k) × image − k × its blur
      const k = E.midDetail * DETAIL_K;
      o.push(`<feGaussianBlur in="${last}" stdDeviation="${f4(Math.max(0.5, width * DETAIL_BLUR))}" edgeMode="duplicate" result="md"/>`);
      step(`<feComposite in="${last}" in2="md" operator="arithmetic" k2="${f4(1 + k)}" k3="${f4(-k)}" result="dt"/>`, 'dt');
    }
    if (E.halo > 0.001) {   // 8.
      const k = E.halo / 0.4, lf = (C) => `<feFunc${C} type="linear" slope="${f4(k)}" intercept="${f4(-0.6 * k)}"/>`;
      o.push(`<feComponentTransfer in="${last}" result="hl">${lf('R')}${lf('G')}${lf('B')}</feComponentTransfer>`,
        `<feGaussianBlur in="hl" stdDeviation="${f4(Math.max(0.5, width * HALO_BLUR))}" edgeMode="duplicate" result="bl"/>`,
        `<feBlend in="${last}" in2="bl" mode="screen"/>`);
    }
    o.push('</filter>');
    return o.join('');
  }
  // the vignette and the grain, as CSS (the preview's overlays, and what the agent lays over the scene)
  const cgVignetteCss = (v) => (v > 0.001 ? `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${f4(Math.min(0.92, v * 0.85))}) 100%)` : 'none');
  // a blur of an RGB float image (two box passes ≈ a Gaussian of deviation sigma), edges repeated
  function cgBlur(src, w, h, sigma) {
    const rad = Math.max(1, Math.round(sigma * 1.22)), a = Float32Array.from(src), tmp = new Float32Array(src.length);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) for (let x = 0; x < w; x++) { let s = 0; for (let d = -rad; d <= rad; d++) s += a[(y * w + Math.min(w - 1, Math.max(0, x + d))) * 3 + c]; tmp[(y * w + x) * 3 + c] = s / (2 * rad + 1); }
      for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) for (let y = 0; y < h; y++) { let s = 0; for (let d = -rad; d <= rad; d++) s += tmp[(Math.min(h - 1, Math.max(0, y + d)) * w + x) * 3 + c]; a[(y * w + x) * 3 + c] = s / (2 * rad + 1); }
    }
    return a;
  }
  // the same maths on pixels (the looks' cards, the scopes, the images of a note): an RGBA array, w × h -> RGB floats
  function cgPixels(data, w, h, E) {
    const T3 = cgTables(E), S = cgSplit(E), L = T3.map((t) => { const out = new Float32Array(256); for (let i = 0; i < 256; i++) out[i] = cgTab(t, i / 255); return out; });
    const luma = cgLumaOn(E) ? cgLumaTable(E) : null, M = satM(Math.max(0, E.saturation)), Hm = Math.abs(E.hue) > 1e-4 ? hueM(E.hue * 180) : null;
    const boost = Math.abs(E.boost) > 1e-4, Mb = satM(Math.max(0, 1 + E.boost));
    const mat = (m, r, g, b) => [clamp01(m[0] * r + m[1] * g + m[2] * b), clamp01(m[3] * r + m[4] * g + m[5] * b), clamp01(m[6] * r + m[7] * g + m[8] * b)];
    let out = new Float32Array(w * h * 3);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 3) {
      let R = L[0][data[i]], G = L[1][data[i + 1]], B = L[2][data[i + 2]];
      if (luma) { const d = 2 * cgTab(luma, 0.2126 * R + 0.7152 * G + 0.0722 * B) - 1; R = clamp01(R + d); G = clamp01(G + d); B = clamp01(B + d); }
      [R, G, B] = mat(M, R, G, B);
      if (Hm) [R, G, B] = mat(Hm, R, G, B);
      if (boost) {
        const y = 0.2126 * R + 0.7152 * G + 0.0722 * B, sum = Math.abs(clamp01(R - y + 0.5) - 0.5) * 2 + Math.abs(clamp01(G - y + 0.5) - 0.5) * 2 + Math.abs(clamp01(B - y + 0.5) - 0.5) * 2;
        const m = clamp01(1 - BOOST_K * sum), n = clamp01(BOOST_K * sum), [r2, g2, b2] = mat(Mb, R, G, B);
        R = clamp01(R * n + r2 * m); G = clamp01(G * n + g2 * m); B = clamp01(B * n + b2 * m);
      }
      if (S.on) {
        const y = 0.2126 * R + 0.7152 * G + 0.0722 * B, a = (1 - y) * (1 - y), z = y * y;
        R = clamp01(R + S.s[0] * a + S.h[0] * z); G = clamp01(G + S.s[1] * a + S.h[1] * z); B = clamp01(B + S.s[2] * a + S.h[2] * z);
      }
      out[p] = R; out[p + 1] = G; out[p + 2] = B;
    }
    if (Math.abs(E.midDetail) > 1e-4) {   // the image minus its blur
      const k = E.midDetail * DETAIL_K, bl = cgBlur(out, w, h, Math.max(0.5, w * DETAIL_BLUR));
      for (let i = 0; i < out.length; i++) out[i] = clamp01((1 + k) * out[i] - k * bl[i]);
    }
    if (E.halo > 0.001) {   // the highlights, blurred, screened over the image
      const k = E.halo / 0.4, hl = new Float32Array(out.length);
      for (let i = 0; i < out.length; i++) hl[i] = clamp01((out[i] - 0.6) * k);
      const bl = cgBlur(hl, w, h, Math.max(0.5, w * HALO_BLUR));
      for (let i = 0; i < out.length; i++) out[i] = 1 - (1 - out[i]) * (1 - bl[i]);
    }
    if (E.vignette > 0.001) {
      const a = Math.min(0.92, E.vignette * 0.85);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x + 0.5) / w - 0.5, dy = (y + 0.5) / h - 0.5, d = Math.sqrt(dx * dx + dy * dy) / Math.SQRT1_2;
        const m = 1 - a * Math.max(0, Math.min(1, (d - 0.45) / 0.55)), p = (y * w + x) * 3;
        out[p] *= m; out[p + 1] *= m; out[p + 2] *= m;
      }
    }
    return out;
  }

  // ---------- the page's state ----------
  const CG = { on: false, bypass: false, wipe: 1, scope: 'wave', grades: {}, src: null, srcKey: '', applied: '', cards: '', thumbs: {} };
  const cgKeyOf = (sc) => `${sc.from}-${sc.to}`;
  const cgStoreKey = () => 'cg.' + (META?.coulissesFile ?? META?.episode ?? META?.title ?? 'x');
  const cgLoad = () => { CG.grades = Object.fromEntries(Object.entries(store.get(cgStoreKey(), {}) ?? {}).map(([k, g]) => [k, cgNorm(g)])); };
  const cgSave = () => store.set(cgStoreKey(), CG.grades);
  // the scenes: an episode's sets, a project's chapters (its band), else the whole video
  let cgScCache = { k: null, list: [] };
  function cgScenes() {
    const k = [SNAP, LIVE, FRAMES, FPS, DUR];   // the same plan: the same list (asked at every frame)
    if (cgScCache.k && k.every((x, i) => x === cgScCache.k[i])) return cgScCache.list;
    cgScCache = { k, list: cgScenesNow() };
    return cgScCache.list;
  }
  function cgScenesNow() {
    let list = [];
    if (PROJ) {
      const band = (LIVE?.tracks ?? []).find((t) => t.type === 'band' && t.clips?.length);
      list = band ? band.clips.map((c) => ({ name: c.label, from: Math.max(0, Math.floor(c.t0 * FPS)), to: Math.min(FRAMES - 1, Math.ceil(c.t1 * FPS) - 1) })) : [];
    } else {
      const sets = SNAP?.sets ?? LIVE?.sets ?? [];
      list = sets.map((x) => ({ name: x.name, from: Math.max(0, Math.floor(x.inT * FPS)), to: Math.min(FRAMES - 1, Math.ceil(((x.outT ?? DUR) + (x.outT !== null && x.outT !== undefined ? x.outDur ?? 0 : 0)) * FPS) - 1) }))
        .sort((a, b) => a.from - b.from);
      // one after the other: a scene ends where the next one begins
      for (let i = 0; i < list.length - 1; i++) list[i].to = Math.max(list[i].from, Math.min(list[i].to, list[i + 1].from - 1));
    }
    list = list.filter((s) => s.to >= s.from);
    if (!list.length && FRAMES) list = [{ name: T('st.cg.whole'), from: 0, to: FRAMES - 1 }];
    return list.map((s, i) => ({ ...s, key: cgKeyOf(s), i }));
  }
  const cgSceneAt = (f) => cgScenes().find((s) => f >= s.from && f <= s.to) ?? null;
  const cgDraftFor = (key) => drafts().find((n) => n.grade && `${n.grade.from}-${n.grade.to}` === key) ?? null;
  // the grade at a frame: the one being made for its scene, else the one waiting in the queue
  function cgGradeAt(f) {
    const sc = cgSceneAt(f); if (!sc) return null;
    return CG.grades[sc.key] ?? cgDraftFor(sc.key)?.grade?.user ?? null;
  }
  const cgIsNeutral = (g) => !g || JSON.stringify({ ...cgNorm(g), pivot: 0 }) === JSON.stringify({ ...cgNeutral(), pivot: 0 });

  // ---------- the image: the filter on what is behind #cgFx, the vignette, the grain ----------
  const cgFxEl = $('#cgFx'), cgVig = $('#cgVig'), cgGrainCv = $('#cgGrain');
  function cgApply(force = false) {
    const g = CG.bypass ? null : cgGradeAt(curFrame());
    const E = g && !cgIsNeutral(g) ? cgEffective(g) : null;
    const w = Math.round(media.clientWidth || 960);
    const key = E ? JSON.stringify([E, w]) : '';
    media.classList.toggle('graded', !!E);
    cgFxEl.style.left = `${(1 - (CG.on ? CG.wipe : 1)) * 100}%`;
    if (!force && key === CG.applied) return;
    CG.applied = key;
    if (!E) { cgFxEl.style.display = 'none'; return; }
    $('#cgDefs').innerHTML = cgFilterSvg('cg-live', E, w);
    cgFxEl.style.display = 'block';
    cgFxEl.style.backdropFilter = cgFxEl.style.webkitBackdropFilter = 'url(#cg-live)';
    // the vignette and the grain are laid over the whole image: inside #cgFx, shifted back by the wipe
    const shift = (1 - (CG.on ? CG.wipe : 1)) * 100;
    for (const el of [cgVig, cgGrainCv]) { el.style.left = `${-shift / (CG.on ? CG.wipe || 1 : 1)}%`; el.style.width = `${100 / (CG.on ? CG.wipe || 1 : 1)}%`; }
    cgVig.style.background = cgVignetteCss(E.vignette);
    cgGrainCv.style.opacity = String(Math.min(0.5, E.grain * 0.45));
    cgGrainCv.style.display = E.grain > 0.001 ? 'block' : 'none';
  }
  // the grain: a new noise at every frame of the video (still on a still frame)
  let cgGrainF = -1;
  function cgGrainTick() {
    if (cgGrainCv.style.display !== 'block') return;
    const f = curFrame(); if (f === cgGrainF) return; cgGrainF = f;
    const w = 320, h = 180; if (cgGrainCv.width !== w) { cgGrainCv.width = w; cgGrainCv.height = h; }
    const g = cgGrainCv.getContext('2d'), im = g.createImageData(w, h);
    let s = (f * 2654435761) >>> 0;
    for (let i = 0; i < im.data.length; i += 4) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = s >>> 24; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
  }

  // ---------- the source frame (cards, scopes, thumbnails): the video when shown, else a frame of the code ----------
  async function cgSource() {
    const f = curFrame(), w = 480, h = Math.max(1, Math.round(w * CH / CW));
    if (mode === 'video' && v.readyState >= 2) {
      if (v.seeking) return null;   // its picture is still the one before (the cards would show another frame)
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(v, 0, 0, w, h); return { f, w, h, data: g.getImageData(0, 0, w, h).data, from: 'video' };
    }
    const srcKind = mode === 'code' || !META?.render ? 'code' : 'video', key = `${srcKind}-${f}`;
    if (CG.src?.key === key) return CG.src;
    const im = new Image(); im.src = `/api/frame?f=${f}&source=${srcKind}&w=${w}`;
    await im.decode().catch(() => null); if (!im.naturalWidth) return CG.src;
    if (curFrame() !== f) return null;   // the playhead moved meanwhile
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, w, h);
    CG.src = { key, f, w, h, data: g.getImageData(0, 0, w, h).data, from: srcKind };
    return CG.src;
  }
  const toImageData = (px, w, h) => { const d = new ImageData(w, h); for (let i = 0, p = 0; p < px.length; i += 4, p += 3) { d.data[i] = px[p] * 255; d.data[i + 1] = px[p + 1] * 255; d.data[i + 2] = px[p + 2] * 255; d.data[i + 3] = 255; } return d; };

  // ---------- the scopes: the waveform (luma), the RGB parade ----------
  const scopeCv = $('#cgScope');
  function cgDrawScope(src, E) {
    const r = scopeCv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W2 = Math.max(100, Math.round(r.width * dpr)), H2 = Math.max(80, Math.round(r.height * dpr));
    if (scopeCv.width !== W2 || scopeCv.height !== H2) { scopeCv.width = W2; scopeCv.height = H2; }
    const g = scopeCv.getContext('2d'); g.fillStyle = '#05070c'; g.fillRect(0, 0, W2, H2);
    const top = 10 * dpr, bot = H2 - 8 * dpr, rows = Math.round(bot - top), Y = (v2) => Math.round(bot - v2 * (bot - top));
    if (src) {
      const px = E ? cgPixels(src.data, src.w, src.h, E) : (() => { const o = new Float32Array(src.w * src.h * 3); for (let i = 0, p = 0; i < src.data.length; i += 4, p += 3) { o[p] = src.data[i] / 255; o[p + 1] = src.data[i + 1] / 255; o[p + 2] = src.data[i + 2] / 255; } return o; })();
      // the waveform: the luma of each column of the image, from black (bottom) to white (top); the parade: R, G, B side by side
      const lanes = CG.scope === 'parade' ? [[0, [255, 72, 72]], [1, [72, 236, 112]], [2, [92, 142, 255]]] : [[-1, [190, 255, 170]]];
      const gap = lanes.length > 1 ? Math.round(6 * dpr) : 0, laneW = Math.floor((W2 - gap * (lanes.length - 1)) / lanes.length);
      const im = g.getImageData(0, Math.round(top), W2, rows + 1);
      const k = 0.9 * (rows / src.h) * (src.w / laneW);   // the glow of one hit: the same look at any size
      for (const [li, [ch, [cr, cg2, cb]]] of lanes.entries()) {
        const acc = new Float32Array(laneW * (rows + 1)), x0 = li * (laneW + gap);
        for (let x = 0; x < src.w; x++) {
          const a0 = Math.floor((x * laneW) / src.w), a1 = Math.max(a0 + 1, Math.floor(((x + 1) * laneW) / src.w));
          for (let y = 0; y < src.h; y++) {
            const p = (y * src.w + x) * 3, val = ch < 0 ? 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2] : px[p + ch];
            const row = Math.round((1 - Math.max(0, Math.min(1, val))) * rows) * laneW;
            for (let cx = a0; cx < a1 && cx < laneW; cx++) acc[row + cx]++;
          }
        }
        for (let ry = 0; ry <= rows; ry++) for (let cx = 0; cx < laneW; cx++) {
          const n = acc[ry * laneW + cx]; if (!n) continue;
          // the trace's colour, going white where many pixels pile up (as in an editing app's scope; the user's reference)
          const a = 1 - Math.exp(-n * k * 0.14), wt = Math.max(0, a - 0.55) * 150, j = (ry * W2 + x0 + cx) * 4;
          im.data[j] = Math.min(255, im.data[j] + cr * a + wt); im.data[j + 1] = Math.min(255, im.data[j + 1] + cg2 * a + wt); im.data[j + 2] = Math.min(255, im.data[j + 2] + cb * a + wt);
        }
      }
      g.putImageData(im, 0, Math.round(top));
      if (lanes.length > 1) { g.fillStyle = '#0b0e16'; for (let li = 1; li < lanes.length; li++) g.fillRect(li * (laneW + gap) - gap, 0, gap, H2); }
    }
    // the graticule over it: 0, 25, 50, 75, 100 % (in 10-bit values, as in an editing app)
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = `${9 * dpr}px "JetBrains Mono", Consolas, monospace`;
    for (const q of [0, 0.25, 0.5, 0.75, 1]) { g.beginPath(); g.moveTo(0, Y(q) + 0.5); g.lineTo(W2, Y(q) + 0.5); g.stroke(); g.fillText(String(Math.round(q * 1023)), 3 * dpr, Y(q) - 2 * dpr); }
  }
  let cgScopeT = 0, cgScopeBusy = false;
  async function cgScopeNow() {
    if (!CG.on || cgScopeBusy) return;
    cgScopeBusy = true;
    try {
      const src = await cgSource(), g = cgGradeAt(curFrame());
      if (!src) { if (mode === 'video' && v.seeking) cgScopeSoon(150); return; }
      cgDrawScope(src, g && !cgIsNeutral(g) && !CG.bypass ? cgEffective(g) : null);
      $('#cgScopeSrc').textContent = src ? T(src.from === 'video' ? 'st.cg.srcVideo' : 'st.cg.srcCode', { f: src.f }) : '';
      if (src && src.f !== CG.cardsF && M.paused) cgDrawCards(src);
    } finally { cgScopeBusy = false; }
  }
  const cgScopeSoon = (ms = 120) => { if (cgScopeT) return; cgScopeT = setTimeout(() => { cgScopeT = 0; cgScopeNow(); }, ms); };

  // ---------- the looks: cards of the frame shown, graded with each look, by emotion ----------
  function cgRenderLooks() {
    const box = $('#cgLookList'), cur = cgCurrent();
    box.innerHTML = CG_EMOTIONS.map((e) => `<h3>${esc(T('st.cg.emo.' + e))}</h3><div class="cglk">${CG_LOOKS.filter((l) => l.emotion === e).map((l) =>
      `<button class="cgcard${cur?.look === l.id ? ' on' : ''}" data-look="${l.id}" title="${esc(T('st.cg.look.' + l.id))}"><canvas width="160" height="${Math.round(160 * CH / CW)}"></canvas><span>${esc(T('st.cg.look.' + l.id))}</span></button>`).join('')}</div>`).join('');
    box.querySelectorAll('.cgcard').forEach((b) => b.onclick = () => cgEdit((g) => { g.look = g.look === b.dataset.look ? null : b.dataset.look; if (g.look && !(g.amount > 0)) g.amount = 1; }));
    CG.cardsF = -1; cgScopeSoon(10);
  }
  function cgDrawCards(src) {
    CG.cardsF = src.f;
    const c = document.createElement('canvas'); c.width = src.w; c.height = src.h; c.getContext('2d').putImageData(new ImageData(src.data, src.w, src.h), 0, 0);
    const first = document.querySelector('#cgLookList .cgcard canvas'); if (!first) return;
    const w = first.width, h = first.height, s2 = document.createElement('canvas'); s2.width = w; s2.height = h;
    const g2 = s2.getContext('2d', { willReadFrequently: true }); g2.drawImage(c, 0, 0, w, h);
    const d = g2.getImageData(0, 0, w, h).data;
    for (const b of document.querySelectorAll('#cgLookList .cgcard')) {
      const l = lookById(b.dataset.look), cv2 = b.querySelector('canvas');
      const px = cgPixels(d, w, h, cgEffective({ ...cgNeutral(), look: l.id, amount: 1 }));
      cv2.getContext('2d').putImageData(toImageData(px, w, h), 0, 0);
    }
  }

  // ---------- the controls: the bars above and under the wheels, the four wheels, the filters ----------
  const cgCurrent = () => { const sc = cgSceneAt(curFrame()); return sc ? cgNorm(CG.grades[sc.key] ?? cgDraftFor(sc.key)?.grade?.user ?? null) : null; };
  // a change of the scene's grade (it starts from the one waiting in the queue, if any)
  function cgEdit(fn) {
    const sc = cgSceneAt(curFrame()); if (!sc) return;
    const g = cgNorm(CG.grades[sc.key] ?? JSON.parse(JSON.stringify(cgDraftFor(sc.key)?.grade?.user ?? cgNeutral())));
    fn(g); CG.grades[sc.key] = g; cgSave();
    cgApply(); cgSync(); cgScopeSoon();
  }
  // a wheel (DaVinci's): its name, its reset ↺, the ring, the master bar under it, its values (master · R · G · B)
  function wheelEl(k) {
    const el = document.createElement('div'); el.className = 'cgw'; el.dataset.w = k;
    const [wn, ws] = T('st.cg.w.' + k).split(' · ');
    el.innerHTML = `<div class="hd"><span class="t">${esc(wn)}${ws ? `<small>${esc(ws)}</small>` : ''}</span></div>`
      + `<div class="wb"><canvas width="300" height="300"></canvas><button class="rs" title="${esc(T('st.cg.wheelReset'))}" aria-label="${esc(T('st.cg.wheelReset'))}">${ic('reset')}</button></div><div class="roll" title="${esc(T('st.cg.masterTitle'))}"><i></i></div>`
      + `<div class="v"><span class="y"></span><span class="r"></span><span class="g"></span><span class="b"></span></div>`;
    const cv2 = el.querySelector('canvas'), roll = el.querySelector('.roll');
    el.querySelector('.rs').addEventListener('click', () => cgEdit((g) => { g[k] = cgWheel0(); }));
    const setFrom = (e) => {
      const r = cv2.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = -((e.clientY - r.top) / r.height * 2 - 1);
      const a = Math.atan2(y, x) * 180 / Math.PI, s = Math.min(1, Math.hypot(x, y) / 0.86);
      cgEdit((g) => { g[k] = { ...g[k], h: ((a - 103) % 360 + 360) % 360, s: e.shiftKey ? g[k].s : s }; });
    };
    cv2.addEventListener('pointerdown', (e) => { cv2.setPointerCapture(e.pointerId); setFrom(e); const mv = (ev) => setFrom(ev); const up = () => { cv2.removeEventListener('pointermove', mv); cv2.removeEventListener('pointerup', up); }; cv2.addEventListener('pointermove', mv); cv2.addEventListener('pointerup', up); });
    cv2.addEventListener('dblclick', () => cgEdit((g) => { g[k] = { ...g[k], h: 0, s: 0 }; }));
    roll.addEventListener('pointerdown', (e) => {
      roll.setPointerCapture(e.pointerId); const x0 = e.clientX, m0 = cgCurrent()?.[k]?.m ?? 0;
      const mv = (ev) => cgEdit((g) => { g[k] = { ...g[k], m: Math.max(-1, Math.min(1, m0 + (ev.clientX - x0) / 300)) }; });
      const up = () => { roll.removeEventListener('pointermove', mv); roll.removeEventListener('pointerup', up); };
      roll.addEventListener('pointermove', mv); roll.addEventListener('pointerup', up);
    });
    roll.addEventListener('dblclick', () => cgEdit((g) => { g[k] = { ...g[k], m: 0 }; }));
    return el;
  }
  function drawWheel(el, w) {
    const cv2 = el.querySelector('canvas'), g = cv2.getContext('2d'), S2 = cv2.width, R = S2 / 2;
    g.clearRect(0, 0, S2, S2);
    for (let a = 0; a < 360; a += 2) {   // the ring: the hue each direction pushes towards
      const h = ((a - 103) % 360 + 360) % 360, t0 = -(a - 1.5) * Math.PI / 180, t1 = -(a + 1.5) * Math.PI / 180;
      g.beginPath(); g.arc(R, R, R * 0.97, t1, t0); g.arc(R, R, R * 0.86, t0, t1, true); g.closePath(); g.fillStyle = `hsl(${h} 75% 52%)`; g.fill();
    }
    const grd = g.createRadialGradient(R, R, 0, R, R, R * 0.86); grd.addColorStop(0, '#2a2d38'); grd.addColorStop(1, '#151720');
    g.beginPath(); g.arc(R, R, R * 0.86, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(R, R * 0.2); g.lineTo(R, R * 1.8); g.moveTo(R * 0.2, R); g.lineTo(R * 1.8, R); g.stroke();
    const a = (w.h + 103) * Math.PI / 180, x = R + Math.cos(a) * w.s * R * 0.86, y = R - Math.sin(a) * w.s * R * 0.86;
    g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fillStyle = w.s > 0.001 ? `hsl(${w.h} 80% 60%)` : '#f4f5fa'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#0b0d14'; g.stroke();
    const rgb = wheelRGB(w).map((c) => c + w.m), n2 = (c) => dec(c.toFixed(2));
    const [y0, r0, g0, b0] = el.querySelectorAll('.v span');
    y0.textContent = n2(w.m); r0.textContent = n2(rgb[0]); g0.textContent = n2(rgb[1]); b0.textContent = n2(rgb[2]);
    el.classList.toggle('moved', w.s > 0.001 || Math.abs(w.m) > 0.001);
    el.querySelector('.roll i').style.left = `${50 + w.m * 50}%`;
  }
  // the bars above and under the wheels (DaVinci Resolve's Primaries): each shown in its usual units; drag left / right
  // (Maj: finer), click to type a value, double-click = neutral
  const FLD = (key, show, unshow, step, dp, min, max, u) => ({ key, show, unshow, step, dp, min, max, u });
  const x1 = (x) => x, x100 = (x) => x * 100, d100 = (y) => y / 100;
  const CG_TOP = [FLD('exposure', x1, x1, 0.01, 2, -4, 4, 'grey'), FLD('temperature', (x) => x * 2000, (y) => y / 2000, 5, 1, -2000, 2000, 'temp'),
    FLD('tint', x100, d100, 0.25, 2, -100, 100, 'tint'), FLD('contrast', x1, x1, 0.005, 3, 0, 2, 'grey'), FLD('pivot', x1, x1, 0.002, 3, 0, 1, 'grey'),
    FLD('midDetail', x100, d100, 0.25, 2, -100, 100, 'grey')];
  const CG_BOT = [FLD('boost', x100, d100, 0.25, 2, -100, 100, 'rainbow'), FLD('shadows', x100, d100, 0.25, 2, -100, 100, 'grey'), FLD('highlights', x100, d100, 0.25, 2, -100, 100, 'grey'),
    FLD('saturation', (x) => x * 50, (y) => y / 50, 0.25, 2, 0, 100, 'rainbow'), FLD('hue', (x) => 50 + x * 50, (y) => (y - 50) / 50, 0.25, 2, 0, 100, 'rainbow'),
    FLD('lumMix', x100, d100, 0.25, 2, 0, 100, 'grey')];
  const CG_FIELDS = [...CG_TOP, ...CG_BOT];
  const fldShow = (f, x) => dec((+f.show(x)).toFixed(f.dp));
  const fldParse = (f, s) => { const v = parseFloat(String(s).replace(',', '.').replace(/[^\d.+-]/g, '')); return Number.isFinite(v) ? f.unshow(Math.max(f.min, Math.min(f.max, v))) : null; };
  function fieldsHtml(list) {
    return list.map((f) => `<label class="cgf" data-k="${f.key}" title="${esc(T('st.cg.ft.' + f.key))} · ${esc(T('st.cg.fieldHow'))}"><span class="l">${esc(T('st.cg.f.' + f.key))}</span>`
      + `<span class="bx"><input type="text" inputmode="decimal" spellcheck="false" autocomplete="off" data-k="${f.key}"><i class="u ${f.u}"></i></span></label>`).join('');
  }
  function fieldWire(lab) {
    const f = CG_FIELDS.find((x) => x.key === lab.dataset.k), inp = lab.querySelector('input');
    const set = (x) => cgEdit((g) => { g[f.key] = x; });
    let drag = null;
    inp.addEventListener('pointerdown', (e) => {
      if (document.activeElement === inp) return;   // typing: the field's own cursor
      e.preventDefault(); inp.setPointerCapture(e.pointerId);
      drag = { x0: e.clientX, v0: +f.show(cgCurrent()?.[f.key] ?? cgNeutral()[f.key]), moved: false };
    });
    inp.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x0; if (!drag.moved && Math.abs(dx) < 3) return;
      drag.moved = true; lab.classList.add('drag');
      const v = Math.max(f.min, Math.min(f.max, drag.v0 + dx * f.step * (e.shiftKey ? 0.1 : 1)));
      set(f.unshow(Math.round(v / f.step) * f.step));
    });
    inp.addEventListener('pointerup', () => { if (!drag) return; const moved = drag.moved; drag = null; lab.classList.remove('drag'); if (!moved) { inp.focus(); inp.select(); } });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); inp.dataset.cancel = '1'; inp.blur(); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', () => {
      const cancel = inp.dataset.cancel; delete inp.dataset.cancel;
      const x = cancel ? null : fldParse(f, inp.value);
      if (x !== null && Math.abs(x - (cgCurrent()?.[f.key] ?? cgNeutral()[f.key])) > 1e-9) set(x); else cgSync();
    });
    lab.addEventListener('dblclick', (e) => { e.preventDefault(); inp.blur(); set(cgNeutral()[f.key]); });
  }
  const SL = (key, min, max, step, fmt = (x) => dec(x.toFixed(2))) => ({ key, min, max, step, fmt });
  const CG_FX = [SL('vignette', 0, 1, 0.01), SL('grain', 0, 1, 0.01), SL('halo', 0, 1, 0.01), SL('shH', 0, 360, 1, (x) => `${Math.round(x)}°`), SL('shS', 0, 1, 0.01), SL('hiH', 0, 360, 1, (x) => `${Math.round(x)}°`), SL('hiS', 0, 1, 0.01)];
  function slidersHtml(list) {
    return list.map((s) => `<label class="cgs${/H$/.test(s.key) ? ' hue' : ''}"><span class="l">${esc(T('st.cg.s.' + s.key))}</span><input type="range" data-k="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"><span class="n" data-n="${s.key}"></span></label>`).join('');
  }
  function cgBuildPanel() {
    const wb = $('#cgWheels'); wb.innerHTML = ''; for (const k of CG_WHEELS) wb.appendChild(wheelEl(k));
    $('#cgTop').innerHTML = fieldsHtml(CG_TOP); $('#cgBot').innerHTML = fieldsHtml(CG_BOT);
    document.querySelectorAll('#cgTop .cgf, #cgBot .cgf').forEach(fieldWire);
    $('#cgFxCtl').innerHTML = `<h3>${esc(T('st.cg.filters'))}</h3>${slidersHtml(CG_FX)}`;
    for (const inp of document.querySelectorAll('#cgFxCtl input')) {
      inp.addEventListener('input', () => cgEdit((g) => { g[inp.dataset.k] = +inp.value; }));
      inp.addEventListener('dblclick', () => cgEdit((g) => { g[inp.dataset.k] = cgNeutral()[inp.dataset.k]; }));
    }
  }
  // the controls show the grade of the scene under the playhead
  function cgSync() {
    if (!CG.on) return;
    const sc = cgSceneAt(curFrame()), g = cgCurrent() ?? cgNeutral(), d = sc ? cgDraftFor(sc.key) : null, n0 = cgNeutral();
    $('#cgSceneName').textContent = sc ? sc.name : '—';
    $('#cgSceneSub').textContent = sc ? T(CG.grades[sc.key] ? 'st.cg.subEditing' : d ? 'st.cg.subQueued' : 'st.cg.subNone', { a: sc.from, b: sc.to }) : '';
    for (const el of document.querySelectorAll('#cgWheels .cgw')) drawWheel(el, g[el.dataset.w]);
    for (const inp of document.querySelectorAll('#cgTop input, #cgBot input')) {
      const f = CG_FIELDS.find((x) => x.key === inp.dataset.k);
      if (document.activeElement !== inp) inp.value = fldShow(f, g[f.key]);
      inp.closest('.cgf').classList.toggle('moved', Math.abs(g[f.key] - n0[f.key]) > 1e-6);
    }
    for (const inp of document.querySelectorAll('#cgFxCtl input')) {
      if (document.activeElement !== inp) inp.value = g[inp.dataset.k];
      $(`[data-n="${inp.dataset.k}"]`).textContent = CG_FX.find((x) => x.key === inp.dataset.k).fmt(+g[inp.dataset.k]);
    }
    $('#cgAmount').value = Math.round((g.amount ?? 1) * 100); $('#cgAmountV').textContent = `${Math.round((g.amount ?? 1) * 100)}${FR ? ' %' : '%'}`;
    $('#cgAmount').disabled = !g.look;
    document.querySelectorAll('#cgLookList .cgcard').forEach((b) => b.classList.toggle('on', b.dataset.look === g.look));
    const ed = cgEdited().length;
    $('#cgAdd').disabled = !ed;
    $('#cgAdd').querySelector('.t').textContent = ed > 1 ? T('st.cg.addN', { n: ed }) : T('st.cg.add');
    $('#cgBypass').classList.toggle('on', CG.bypass);
    cgRenderScenes();
  }
  let cgScenesKey = '';
  function cgRenderScenes() {
    const list = cgScenes(), cur = cgSceneAt(curFrame());
    const key = JSON.stringify([list.map((s) => s.key), cur?.key, Object.keys(CG.grades), drafts().filter((n) => n.grade).map((n) => n.id + n.grade.lookName)]);
    if (key === cgScenesKey) return; cgScenesKey = key;
    $('#cgSceneN').textContent = String(list.length);
    $('#cgSceneList').innerHTML = list.map((s) => {
      const g = CG.grades[s.key], d = cgDraftFor(s.key), lk = lookById((g ?? d?.grade?.user)?.look);
      const st = g ? T('st.cg.stEditing') : d ? T('st.cg.stQueued') : T('st.cg.stNone');
      return `<button class="cgsc${cur?.key === s.key ? ' on' : ''}" data-k="${s.key}" data-f="${Math.round((s.from + s.to) / 2)}"><img alt="" loading="lazy" src="/api/frame?f=${Math.round((s.from + s.to) / 2)}&source=${META?.render ? 'video' : 'code'}&w=200"><span class="tx"><b>${esc(s.name)}</b><span class="muted">${s.from} → ${s.to}</span><span class="chip ${g ? 'ed' : d ? 'q' : ''}">${esc(lk ? T('st.cg.look.' + lk.id) + ' · ' : '')}${esc(st)}</span></span></button>`;
    }).join('');
    $('#cgSceneList').querySelectorAll('.cgsc').forEach((b) => b.onclick = () => { M.pause(); seekFrame(+b.dataset.f); cgSync(); cgScopeSoon(); });
  }

  // ---------- the actions: before / after, copy to every scene, reset, « Ajouter à la file » ----------
  function cgSetBypass(on) { CG.bypass = on; cgApply(true); cgSync(); cgScopeSoon(); }
  $('#cgBypass').onclick = () => cgSetBypass(!CG.bypass);
  $('#cgReset').onclick = () => { const sc = cgSceneAt(curFrame()); if (!sc) return; delete CG.grades[sc.key]; cgSave(); cgApply(); cgSync(); cgScopeSoon(); };
  $('#cgCopyAll').onclick = () => {
    const g = cgCurrent(); if (!g) return;
    for (const s of cgScenes()) CG.grades[s.key] = JSON.parse(JSON.stringify(g));
    cgSave(); cgApply(); cgSync(); setSave(T('st.cg.copied', { n: cgScenes().length }), 'ok');
  };
  $('#cgAmount').addEventListener('input', (e) => cgEdit((g) => { g.amount = +e.target.value / 100; }));
  // what changed, in words (the note's text)
  function cgWords(g) {
    g = cgNorm(g);
    const o = [], n0 = cgNeutral(), L = lookById(g.look);
    if (L) o.push(T('st.cg.wLook', { name: T('st.cg.look.' + L.id), pct: Math.round((g.amount ?? 1) * 100), emo: T('st.cg.emo.' + L.emotion) }));
    for (const k of CG_WHEELS) if (g[k].s > 0.001 || Math.abs(g[k].m) > 0.001) o.push(T('st.cg.wWheel', { w: T('st.cg.w.' + k), h: Math.round(g[k].h), s: dec(g[k].s.toFixed(2)), m: (g[k].m >= 0 ? '+' : '') + dec(g[k].m.toFixed(2)) }));
    for (const f of CG_FIELDS) if (Math.abs(g[f.key] - n0[f.key]) > 1e-4) o.push(`${T('st.cg.f.' + f.key)} ${fldShow(f, g[f.key])}`);
    for (const s of CG_FX) if (Math.abs(g[s.key] - n0[s.key]) > 1e-4 && !(/H$/.test(s.key) && !(g[s.key.replace(/H$/, 'S')] > 0))) o.push(`${T('st.cg.s.' + s.key)} ${s.fmt(+g[s.key])}`);
    return o.join(FR ? ' ; ' : '; ');
  }
  const cgEdited = () => { const cur = cgSceneAt(curFrame()); return cgScenes().filter((x) => CG.grades[x.key]).sort((a, b) => (b.key === cur?.key) - (a.key === cur?.key) || a.from - b.from); };
  // a frame of the scene, graded with E (the same maths as the preview): a JPEG File; and the same frame as it is
  async function cgStill(f, E, which) {
    const big = new Image(); big.src = `/api/frame?f=${f}&source=${mode === 'code' || !META?.render ? 'code' : 'video'}&w=1280`; await big.decode();
    const c = document.createElement('canvas'); c.width = big.naturalWidth; c.height = big.naturalHeight; const g2 = c.getContext('2d', { willReadFrequently: true }); g2.drawImage(big, 0, 0);
    if (E) { const d = g2.getImageData(0, 0, c.width, c.height); g2.putImageData(toImageData(cgPixels(d.data, c.width, c.height, E), c.width, c.height), 0, 0); }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    return new File([blob], `etalonnage-${which}.jpg`, { type: 'image/jpeg' });
  }
  function cgAddOne(sc, g, f) {
    const existing = cgDraftFor(sc.key);
    if (!existing && queueFull()) return null;
    const E = cgEffective(g), L = lookById(g.look), id = `cg-${sc.from}-${sc.to}`;
    const grade = { scene: sc.name, from: sc.from, to: sc.to, frame: f, own: !cgIsNeutral({ ...g, look: null, amount: 1 }), look: g.look, lookName: L ? T('st.cg.look.' + L.id) : null, emotion: L ? T('st.cg.emo.' + L.emotion) : null, amount: g.amount ?? 1,
      user: JSON.parse(JSON.stringify(g)), eff: JSON.parse(JSON.stringify(E)), size: [CW, CH],
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">${cgFilterSvg(id, E, Math.round(CW))}</svg>`, filterId: id,
      vignette: E.vignette > 0.001 ? cgVignetteCss(E.vignette) : null, grain: E.grain > 0.001 ? +E.grain.toFixed(3) : 0 };
    const text = T('st.cg.noteText', { scene: sc.name, words: cgWords(g) || T('st.cg.none') });
    let n = existing;
    if (n) { n.grade = grade; n.text = text; n.updated = now(); save(); }
    else { n = addNote(sc.from, sc.to, false, { text, grade }); if (!n) return null; }
    delete CG.grades[sc.key]; cgSave();
    return { n, existing: !!existing, f, E };
  }
  // the scene's frame before / after, joined to its note (the agent compares its own render with « après »)
  async function cgAddImages({ n, f, E }) {
    try {
      const before = await upload(await cgStill(f, null, 'avant'), n.id), after = await upload(await cgStill(f, E, 'apres'), n.id);
      const lb = T('st.cg.beforeLabel'), la = T('st.cg.afterLabel'), m = byId(n.id); if (!m) return;
      m.images = (m.images ?? []).filter((x) => x.label !== lb && x.label !== la);
      m.images.push({ file: before, at: now(), label: lb }, { file: after, at: now(), label: la }); save(); renderAll();
    } catch { /* the edit stays without its images */ }
  }
  async function cgAdd() {
    const list = cgEdited(); if (!list.length) return;
    const done = [];
    for (const sc of list) {
      const f = sc.key === cgSceneAt(curFrame())?.key ? curFrame() : Math.round((sc.from + sc.to) / 2);
      const r = cgAddOne(sc, CG.grades[sc.key], f); if (!r) break;
      done.push({ sc, ...r });
    }
    renderAll(); cgApply(true); cgScenesKey = ''; cgStripKey = ''; cgSync();
    const msg = done.length === 1 ? T(done[0].existing ? 'st.cg.updated' : 'st.cg.added', { scene: done[0].sc.name }) : done.length ? T('st.cg.addedN', { n: done.length }) : '';
    if (msg) setSave(msg, 'ok');
    for (const d of done) await cgAddImages(d);
    if (msg) setSave(msg, 'ok');
  }
  $('#cgAdd').onclick = cgAdd;

  // ---------- the wipe: drag the line on the image, before (left) | after (right); double-click: half / whole ----------
  {
    const st = $('#stage'); let wiping = false;
    const handle = document.createElement('div'); handle.id = 'cgWipe';
    handle.innerHTML = `<span class="ln"></span><span class="kn"></span><b class="a">${esc(T('st.cg.before'))}</b><b class="p">${esc(T('st.cg.after'))}</b>`; st.appendChild(handle);
    const place = () => {
      const r = st.getBoundingClientRect(), m = media.getBoundingClientRect();
      handle.style.left = `${m.left - r.left + (1 - CG.wipe) * m.width}px`;
      handle.style.display = CG.on ? 'block' : 'none';
      handle.classList.toggle('split', CG.wipe < 0.999 && CG.wipe > 0.001);
    };
    const at = (e) => { const m = media.getBoundingClientRect(); CG.wipe = 1 - Math.max(0, Math.min(1, (e.clientX - m.left) / m.width)); place(); cgApply(true); };
    handle.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); wiping = true; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', (e) => { if (wiping) at(e); });
    handle.addEventListener('pointerup', () => { wiping = false; });
    handle.addEventListener('dblclick', () => { CG.wipe = CG.wipe < 0.999 ? 1 : 0.5; place(); cgApply(true); });
    new ResizeObserver(place).observe(st);
    window.__cgPlaceWipe = place;
  }

  // ---------- the strip under the image: the scenes, the playhead; click or drag = go there ----------
  const strip = $('#cgStrip');
  let cgStripKey = '';
  function cgPlaceStrip(f) {
    const list = cgScenes(), key = JSON.stringify([list.map((x) => x.key + x.name), FRAMES, Object.keys(CG.grades), drafts().filter((n) => n.grade).map((n) => n.grade.from)]);
    if (key !== cgStripKey) {
      cgStripKey = key;
      strip.querySelector('.scs').innerHTML = list.map((x) => `<span class="${CG.grades[x.key] ? 'ed' : cgDraftFor(x.key) ? 'q' : ''}" style="left:${(x.from / Math.max(1, FRAMES)) * 100}%;width:${((x.to - x.from + 1) / Math.max(1, FRAMES)) * 100}%" title="${esc(x.name)}">${esc(x.name)}</span>`).join('');
    }
    strip.querySelector('.ph').style.left = `${(f / Math.max(1, FRAMES - 1)) * 100}%`;
  }
  {
    let drag = false;
    const go = (e) => { const r = strip.getBoundingClientRect(); M.pause(); seekFrame(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (FRAMES - 1)); };
    strip.addEventListener('pointerdown', (e) => { drag = true; strip.setPointerCapture(e.pointerId); go(e); });
    strip.addEventListener('pointermove', (e) => { if (drag) go(e); });
    strip.addEventListener('pointerup', () => { drag = false; cgSync(); });
  }

  // ---------- the page ----------
  function setPage(p) {
    const on = p === 'grade';
    if (on === CG.on) return;
    if (on && staging) setStaging(false);
    CG.on = on; document.body.classList.toggle('cg', on);
    document.querySelectorAll('#pageSeg button').forEach((b) => b.classList.toggle('on', b.dataset.page === p));
    if (on) { cgLoad(); CG.loaded = true; if (!$('#cgWheels').children.length) cgBuildPanel(); cgRenderLooks(); cgScenesKey = ''; cgStripKey = ''; cgSync(); }
    CG.wipe = 1; window.__cgPlaceWipe?.();
    requestAnimationFrame(() => { fitMedia(); resize(); cgApply(true); cgScopeSoon(60); });
    store.set('page', on ? 'grade' : 'review');
  }
  document.querySelectorAll('#pageSeg button').forEach((b) => b.onclick = () => setPage(b.dataset.page));
  // called by the timeline's tick (part 08) when the frame changes: the grade of the scene shown, the controls, the scopes
  let cgLastScene = '';
  let cgScopeF = -1, cgQT = 0, cgQKey = '';
  function cgTick() {
    if (!CG.loaded && META && FRAMES) {   // the grades being made, kept in this browser per project; the page as it was left
      CG.loaded = true; cgLoad(); cgApply(true);
      if (store.get('page', 'review') === 'grade') setPage('grade');
    }
    cgGrainTick();
    const f = curFrame(), sc = cgSceneAt(f), k = sc?.key ?? '';
    if (mode !== CG.mode) { CG.mode = mode; CG.src = null; CG.cardsF = -1; cgScopeF = -1; }
    const t = performance.now();
    if (t - cgQT > 400) {
      cgQT = t; const q = drafts().filter((n) => n.grade).map((n) => n.id + (n.updated ?? '')).join();
      if (q !== cgQKey) { cgQKey = q; cgApply(); cgScenesKey = ''; cgStripKey = ''; if (CG.on) cgSync(); }
    }
    if (k !== cgLastScene) { cgLastScene = k; cgApply(); if (CG.on) cgSync(); }
    if (CG.on) {
      cgPlaceStrip(f);
      if (f !== cgScopeF && (M.paused || (mode === 'video' && META?.render))) { cgScopeF = f; cgScopeSoon(M.paused ? (mode === 'code' ? 350 : 80) : 250); }
    }
  }
  window.__cgReady = true;
  window.__grade = { setPage, state: () => ({ on: CG.on, bypass: CG.bypass, wipe: CG.wipe, scope: CG.scope, grades: JSON.parse(JSON.stringify(CG.grades)), applied: !!CG.applied, scene: cgSceneAt(curFrame())?.name ?? null, looks: CG_LOOKS.length }),
    edit: (fn) => cgEdit(fn), effective: cgEffective, pixels: cgPixels, filter: cgFilterSvg, scenes: cgScenes, neutral: cgNeutral, lookIds: () => CG_LOOKS.map((l) => l.id) };   // for tests
  $('#cgScopeSeg').querySelectorAll('button').forEach((b) => b.onclick = () => { CG.scope = b.dataset.s; $('#cgScopeSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); cgScopeSoon(10); });
