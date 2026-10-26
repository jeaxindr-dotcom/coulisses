// Disponibilité explicite de l'image de l'aperçu. Une échéance est une erreur,
// jamais une image réputée complète. Les attentes du rendu non attribuées restent
// un diagnostic ; elles ne suspendent pas l'horloge du Player.
export function createReady(opts: {
  root: () => ParentNode | null;
  playing: () => boolean;
  emit: (type: string, extra?: Record<string, unknown>) => void;
  timeoutMs?: number;
}) {
  let buffering = false, loading = false, raf = 0, timer: any = 0, started = 0, reported = '', disposed = false;
  const timeout = opts.timeoutMs ?? 30000;
  const shown = (el: Element) => {
    if (!(el as HTMLElement).getClientRects().length) return false;
    for (let e: Element | null = el, i = 0; e && i < 80; e = e.parentElement, i++) {
      const style = getComputedStyle(e);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return true;
  };
  const status = () => {
    const resources = (window as any).__coulissesReadiness?.snapshot?.() ?? { activePending: 0, legacyPending: [] };
    const extra = { activePending: resources.activePending ?? 0, legacyPending: resources.legacyPending ?? [] };
    const result = (state: string, reason: string | null) => ({ state, reason, verified: state === 'ready', ...extra });
    if (buffering) return result('loading', 'buffering');
    if (extra.activePending) return result('loading', 'resources');
    const root = opts.root(); if (!root) return result('loading', 'root');
    for (const video of Array.from(root.querySelectorAll('video'))) {
      if (!shown(video)) continue;
      if (video.error) return result('error', 'video-error');
      if (video.networkState !== 3 && (video.readyState < 2 || video.seeking)) return result('loading', 'video');
    }
    for (const image of Array.from(root.querySelectorAll('img'))) {
      if (!shown(image)) continue;
      if (!image.complete) return result('loading', 'image');
      if ((image.currentSrc || image.getAttribute('src')) && image.naturalWidth === 0) return result('error', 'image-error');
    }
    if ((document as any).fonts?.status === 'loading') return result('loading', 'font');
    const scene = (window as any).__coulissesSceneReadiness?.();
    if (scene?.lost) return result('error', 'webgl-context-lost');
    if (scene?.pendingDraw) return result('loading', 'webgl-first-draw');
    // Sans propriétaire, impossible de promettre une image complète : un ancien
    // producteur doit migrer vers useDelayRender/useBufferState. Ce signal ne crée
    // aucun delayPlayback et n'empêche donc pas une autre scène de jouer.
    if (extra.legacyPending.length) return result('unverified', 'unowned-render-handles');
    return result('ready', null);
  };
  const failure = (reason: string | null, expired = false) => new Error(expired
    ? `Préparation de l'image expirée après ${Math.round(timeout / 1000)} secondes (${reason ?? 'inconnu'})`
    : `Image indisponible (${reason ?? 'inconnu'})`);
  const sayError = (reason: string | null, expired = false) => {
    const key = `${expired}:${reason}`; if (reported === key) return;
    reported = key;
    opts.emit('ready-error', { reason, error: { message: failure(reason, expired).message, where: 'préparation de l’image', stack: '' } });
  };
  const tick = () => {
    raf = 0; timer = 0; if (disposed) return;
    const current = status(), pending = current.state !== 'ready', elapsed = performance.now() - started;
    if (pending && !loading) { loading = true; opts.emit('loading'); }
    if (!pending && loading) { loading = false; reported = ''; opts.emit('loaded'); }
    if (current.state === 'error') sayError(current.reason);
    else if (pending && elapsed >= timeout) sayError(current.reason, true);
    // Surveillance ralentie après le premier dessin : pas de scan de milliers
    // d'images à 60 Hz durant un chargement long, et aucune fausse notification.
    if (pending) timer = setTimeout(tick, elapsed < 300 ? 50 : 200);
    else if (elapsed < 300) raf = requestAnimationFrame(tick);
  };
  const watch = () => {
    if (disposed) return;
    started = performance.now(); reported = '';
    if (!raf && !timer) raf = requestAnimationFrame(tick);
  };
  const waiters = new Set<{ res: () => void; rej: (e: Error) => void; t: number; armed: boolean }>();
  let pollTimer: any = 0;
  const poll = () => {
    pollTimer = 0; if (disposed) return;
    const current = status(), now = performance.now();
    for (const waiter of [...waiters]) {
      if (!waiter.armed) continue;
      if (current.state === 'ready') { waiters.delete(waiter); waiter.res(); }
      else if (current.state === 'error' || now - waiter.t >= timeout) {
        waiters.delete(waiter); waiter.rej(failure(current.reason, current.state !== 'error'));
      }
    }
    if (waiters.size) pollTimer = setTimeout(poll, 50);
  };
  const onResources = () => { if (!raf && !timer && !disposed) raf = requestAnimationFrame(tick); };
  window.addEventListener('coulisses-readiness', onResources);
  return {
    watch,
    setBuffering: (value: boolean) => { buffering = value; watch(); },
    isLoading: () => loading,
    ready: () => status().state === 'ready',
    why: () => status().reason,
    status,
    when: () => new Promise<void>((res, rej) => {
      if (disposed) { rej(new Error('Aperçu fermé')); return; }
      const waiter = { res, rej, t: performance.now(), armed: false }; waiters.add(waiter);
      requestAnimationFrame(() => requestAnimationFrame(() => { waiter.armed = true; if (!pollTimer) poll(); }));
    }),
    dispose: () => {
      disposed = true; cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(pollTimer);
      window.removeEventListener('coulisses-readiness', onResources);
      for (const waiter of waiters) waiter.rej(new Error('Aperçu fermé')); waiters.clear();
    },
  };
}
