// The composition failing in the live preview (user report, 16/10/2026: E10 in « Code actuel », the whole picture black
// with a small « ⚠ » — « il faut absolument corriger ça »). The Remotion Player catches an error thrown while a frame is
// drawn, shows its default fallback (« ⚠️ » alone on black) and stays so until the Player is mounted again. Here:
//   - the fallback says the error itself (its message, where in the project's code);
//   - the Player's « error » event goes to the studio (an « error » event: the frame, the message, the stack), which
//     covers the picture with what happened, writes it to revue\preview-errors.log, and offers a note for the agent;
//   - recover(f): the Player mounted again at frame f (the studio does it on the next move, or « Réessayer »).
// Used by player/entry.tsx (an episode of the Theatre) and player/remotion.tsx (any Remotion project).
import React from 'react';

export function createCrash(opts: { emit: (type: string, extra?: Record<string, unknown>) => void; redraw: () => void }) {
  let gen = 0, resumeAt: number | null = null, testCrash = false, crashed: { message: string; stack: string } | null = null;
  const describe = (e: any) => ({ message: String(e?.message ?? e ?? 'erreur'), stack: String(e?.stack ?? '') });
  // where in the project: the names of the functions of the stack (the bundle's file:line says nothing to the agent),
  // React's own machinery left aside — « Stage ← Episode »; the whole stack goes to revue\preview-errors.log
  const INTERNAL = /^(react_stack_bottom_frame|renderWithHooks|updateFunctionComponent|updateMemoComponent|updateSimpleMemoComponent|updateForwardRef|beginWork|runWithFiberInDEV|performUnitOfWork|workLoopSync|workLoopConcurrent\w*|renderRootSync|renderRootConcurrent|recoverFromConcurrentError|performWorkOnRoot\w*|performSyncWorkOnRoot|flushSyncWork\w*|processRootSchedule\w*|mountIndeterminateComponent|callCallback|invokeGuardedCallback\w*|commit\w*|Object\.check|MessagePort\.\w+|performWorkUntilDeadline|Array\.forEach|new Promise|Generator\.next)$/;
  const where = (stack: string) => stack.split('\n').map((l) => /^\s*at\s+(?:async\s+)?([^\s(]+)\s*\(/.exec(l)?.[1]).filter((n): n is string => !!n && !INTERNAL.test(n)).slice(0, 3).join(' ← ');
  const Fallback: React.FC<{ error: Error }> = ({ error }) => {
    const d = describe(error), w = where(d.stack);
    return React.createElement('div', { style: { position: 'absolute', inset: 0, background: '#0b0d14', color: '#e8e8ee', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, textAlign: 'center', font: '15px system-ui, sans-serif' } },
      React.createElement('div', { style: { fontSize: 28, color: '#f0b429' } }, '⚠'),
      React.createElement('div', { style: { maxWidth: '86%', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 14 } }, d.message),
      w ? React.createElement('div', { style: { opacity: 0.6, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 } }, w) : null);
  };
  return {
    get gen() { return gen; },
    get crashed() { return crashed; },
    // the Player's errorFallback
    fallback: ({ error }: { error: Error }) => React.createElement(Fallback, { error }),
    // the Player's « error » event (its detail.error), or an error caught elsewhere
    onError: (e: any, frame: number) => {
      const d = describe(e?.detail?.error ?? e);
      crashed = d;
      opts.emit('error', { error: { ...d, where: where(d.stack) }, at: frame });
    },
    // where to start after a recovery (instead of the page's ?f=)
    takeResume: () => { const f = resumeAt; resumeAt = null; return f; },
    recover: (f: number) => { crashed = null; testCrash = false; resumeAt = Math.max(0, Math.round(f)); gen++; opts.redraw(); },
    // tests: the next frame drawn throws (as a bug of the composition)
    crashNext: () => { testCrash = true; },
    check: () => { if (testCrash) throw new Error('test : plantage volontaire de l\'aperçu (Coulisses)'); },
  };
}
