// A frame of the live preview is shown as the frame only once it is complete (fiche du 10/10/2026, long04: stepping over
// a chapter junction, the preview showed the next chapter's page before its videos were loaded and sought — a grey board
// the render never has — and notes went to the agent for a defect that was not in the video). The Player shows a frame
// at once; a render waits for its media (delayRender). So after a seek with the playback paused, the page's VISIBLE media
// are watched: while one is not ready — a <video> not loaded at its frame yet or still seeking, an <img> loading, a font
// loading, the Player buffering — the preview says « loading » (the studio covers the image and says so), then « loaded ».
// Used by player/remotion.tsx, player/entry.tsx and, its types stripped by the server (/hf-ready.js), player/hf-player.js.
export function createReady(opts: { root: () => ParentNode | null; playing: () => boolean; emit: (type: string) => void }) {
  let buffering = false, loading = false, raf = 0, t0 = 0;
  // drawn on the image: not hidden, not transparent (a premounted Sequence is at opacity 0), not without a box
  const shown = (el: Element) => {
    if (!(el as HTMLElement).getClientRects().length) return false;
    for (let e: Element | null = el, i = 0; e && i < 60; e = e.parentElement, i++) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    }
    return true;
  };
  const why = (): string | null => {
    if (buffering) return 'buffering';
    const r = opts.root(); if (!r) return null;
    for (const v of Array.from(r.querySelectorAll('video'))) if ((v.readyState < 2 || v.seeking) && shown(v)) return 'video';
    for (const im of Array.from(r.querySelectorAll('img'))) if (!im.complete && shown(im)) return 'image';
    if ((document as any).fonts?.status === 'loading') return 'font';
    return null;
  };
  // watched for a moment even when complete at once: the media of a page that mounts a little later are seen too
  const tick = () => {
    raf = 0;
    const w = opts.playing() ? null : why(), el = performance.now() - t0;
    if (w && !loading) { loading = true; opts.emit('loading'); }
    if (!w && loading) { loading = false; opts.emit('loaded'); }
    if ((w && el < 30000) || (!w && el < 300)) raf = requestAnimationFrame(tick);
    else if (loading) { loading = false; opts.emit('loaded'); }   // never stuck
  };
  const watch = () => { t0 = performance.now(); if (!raf) raf = requestAnimationFrame(tick); };
  return {
    watch,
    setBuffering: (b: boolean) => { buffering = b; watch(); },
    isLoading: () => loading,
    ready: () => !why(),
    why,
    // the frame complete (a pick, a capture, the « after » image of a staging), at most 30 s
    // (two frames first: the Player has drawn the frame asked, its new media are in the page)
    when: () => new Promise<void>((res) => { const t = performance.now(); const go = () => (!why() || performance.now() - t > 30000 ? res() : requestAnimationFrame(go)); requestAnimationFrame(() => requestAnimationFrame(go)); }),
  };
}
