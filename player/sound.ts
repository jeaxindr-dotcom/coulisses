// Surveillance du contexte audio réellement détenu par le Player, lié depuis sa composition.
// Un refus de reprise peut rendre le Player muet : reprise progressive après 1, 2, 4, 8 puis 10 s.
// Pendant la lecture audible, hors tampon et onglet masqué, un contexte fermé, suspendu durablement
// ou dont l'horloge reste figée produit sound/dead. La page décide ensuite de la récupération.
// Les sons HTML natifs et les contextes des composants tiers ne sont pas surveillés ici.
// mute() indique un silence voulu ; il ne doit jamais déclencher cette récupération.
import { useContext, useEffect } from 'react';
import type { PlayerRef } from '@remotion/player';
import { Internals } from 'remotion';

// Le contexte appartient au Player : aucune substitution globale d'AudioContext.
// Un contexte tiers ou un Player démonté ne doit pas relancer l'aperçu courant.
type ContextBinding = { bindContext: (context: AudioContext | null) => () => void };
type BufferingPlayer = PlayerRef & { isBuffering?: () => boolean };
export function SoundContext({ sound }: { sound: ContextBinding }) {
  const shared = useContext(Internals.SharedAudioContext);
  useEffect(() => sound.bindContext(shared?.audioContext ?? null), [sound, shared?.audioContext]);
  return null;
}

export function createSound(emit: (type: string, extra?: Record<string, unknown>) => void) {
  let wanted = false, wait = 1000, lost = false, again: ReturnType<typeof setTimeout> | null = null, calm: ReturnType<typeof setTimeout> | null = null;
  let cur: BufferingPlayer | null = null;
  let context: AudioContext | null = null, releaseContext: (() => void) | null = null, binding: object | null = null;
  let fails: number[] = [], deadAt = -1e9;   // refus des 20 dernières secondes, puis dernier signal de panne
  let buffering = false, since = 0, bad = 0, lastT = -1, lastW = 0, resumed = false;
  const clear = () => { if (again) clearTimeout(again); if (calm) clearTimeout(calm); again = calm = null; };
  const resetWatch = () => { since = performance.now(); bad = 0; lastT = -1; lastW = 0; resumed = false; };
  const active = () => !!cur && !wanted && !buffering && !cur.isBuffering?.() && !document.hidden && cur.isPlaying() && !cur.isMuted();
  const dead = (why: string) => {
    const t = performance.now(); if (t - deadAt < 20000) return;   // laisser aboutir la récupération en cours
    deadAt = t; bad = 0; fails = []; clear();
    emit('sound', { state: 'dead', why });
  };
  const onMute = (e: any) => {
    const r = cur; if (!r) return;
    if (e?.detail?.isMuted) {
      if (wanted) return;
      const t = performance.now(); fails = fails.filter((x) => t - x < 20000); fails.push(t);
      if (fails.length >= 4) { dead('refused'); return; }
      if (!lost) { lost = true; emit('sound', { state: 'lost' }); }
      if (calm) { clearTimeout(calm); calm = null; }
      if (again) clearTimeout(again);
      again = setTimeout(() => { again = null; if (cur === r && r.isMuted() && !wanted) r.unmute(); }, wait);
      wait = Math.min(10000, wait * 2);
    } else if (lost) {
      // Confirmer le retour après trois secondes sans nouvelle coupure automatique.
      if (calm) clearTimeout(calm);
      calm = setTimeout(() => { calm = null; if (cur === r && !r.isMuted()) { lost = false; wait = 1000; fails = []; emit('sound', { state: 'back' }); } }, 3000);
    }
  };
  // Contrôle chaque seconde, uniquement pendant la lecture audible.
  const watch = () => {
    if (!active()) { bad = 0; lastT = -1; resumed = false; return; }
    const now = performance.now(), c = context;
    if (!c || now - since < 2500) { lastT = -1; return; }   // laisser le Player reprendre son propre contexte
    if (c.state === 'closed') { dead('closed'); return; }
    const t = c.currentTime;
    let ok = c.state === 'running';
    if (ok && lastT >= 0 && now - lastW > 800 && t - lastT < 0.3 * (now - lastW) / 1000) ok = false;
    lastT = t; lastW = now;
    if (ok) { bad = 0; resumed = false; return; }
    bad++;
    if (bad >= 2 && !resumed) {
      resumed = true;
      try { Promise.resolve(c.resume()).catch(() => {}); } catch { /* refus : diagnostic au contrôle suivant */ }
    }
    if (bad >= 5) dead(c.state === 'running' ? 'stalled' : String(c.state));
  };
  const onPlay = resetWatch;
  const onWait = () => { buffering = true; resetWatch(); }, onGo = () => { buffering = false; resetWatch(); };
  return {
    bindContext(c: AudioContext | null) {
      releaseContext?.();
      const token = {}; binding = token; context = c;
      resetWatch(); deadAt = -Infinity;
      // Diagnostic des tests : exactement le contexte lié, jamais tous ceux de la page.
      (window as any).__coulissesAudio = c ? [c] : [];
      const onError = () => { if (binding === token && context === c && active()) dead('error'); };
      c?.addEventListener('error', onError);
      const release = () => {
        c?.removeEventListener('error', onError);
        if (binding !== token) return;
        context = null; binding = null; releaseContext = null;
        (window as any).__coulissesAudio = [];
        resetWatch();
      };
      releaseContext = release;
      // Un effet React peut être repris avec le même contexte : ne pas fermer ici celui détenu par Remotion.
      return release;
    },
    // Lier le Player monté ; après une erreur, le nouveau remplace l'ancien.
    attach(r: BufferingPlayer) {
      cur = r; clear(); wait = 1000; lost = false; fails = []; buffering = !!r.isBuffering?.(); resetWatch();
      const R = r as any;
      R.addEventListener('mutechange', onMute); R.addEventListener('play', onPlay); R.addEventListener('waiting', onWait); R.addEventListener('resume', onGo);
      const tick = setInterval(watch, 1000);
      if (r.isMuted() && !wanted) r.unmute();
      return () => {
        clearInterval(tick);
        R.removeEventListener('mutechange', onMute); R.removeEventListener('play', onPlay); R.removeEventListener('waiting', onWait); R.removeEventListener('resume', onGo);
        if (cur === r) { cur = null; clear(); }
      };
    },
    mute() { wanted = true; clear(); cur?.mute(); },
    unmute() { wanted = false; clear(); wait = 1000; resetWatch(); cur?.unmute(); },
    // Destruction définitive de l'iframe uniquement, jamais le nettoyage d'un effet React.
    async dispose() {
      wanted = true; clear(); cur?.pause(); cur = null;
      const owned = context;
      releaseContext?.();
      if (owned && owned.state !== 'closed') {
        try { await owned.close(); } catch { /* contexte déjà arrêté par le navigateur */ }
      }
    },
    // Action explicite « Rétablir le son » de la page.
    restore() { wanted = false; clear(); wait = 1000; fails = []; resetWatch(); if (cur?.isMuted()) cur.unmute(); return !!cur && !cur.isMuted(); },
    lost: () => lost,
    // Diagnostic : le seul contexte lié au Player courant.
    contexts: () => context ? [{ state: context.state, t: +context.currentTime.toFixed(2), rate: context.sampleRate }] : [],
  };
}
