// The sound of the live preview, never lost for good — user reports: 19/10/2026 « quand il y a des lags, le son se
// désactive, et impossible à réactiver sans F5 »; 22/10/2026 « quand je rajoute une note et que je relance la vidéo, il
// n'y a plus de son et je suis obligé d'appuyer sur F5 » (the note's words dictated with OpenWhispr, whose Whisper
// « medium » runs on this PC: the PC slowed down for seconds while the video started again).
// Remotion's Player plays every sound through ONE AudioContext of its own, never closed (remotion/audio/use-audio-context):
//   1. it mutes itself when that context cannot start again (its log: « AudioContext resume rejected, muting playback and
//      continuing without audio ») and stays muted: a pause, a play, the volume change nothing. Coulisses never mutes the
//      Player of its own, so such a mute is taken back here: after 1 s, and while the device still refuses (the Player
//      mutes itself again at its next try), after 2, 4, 8 s, then every 10 s;
//   2. a context that the sound device or Chrome broke never plays again — it refuses for good, or stays suspended behind
//      the Player's back, or runs with its clock stopped, or says « error »: only a new one plays (what F5 did). Watched
//      here once a second while the Player plays with its sound (not muted, not buffering, the page shown): a context left
//      suspended is started again once; still nothing 5 s on (or a 4th mute within 20 s, or its « error »): « dead » is
//      said to the page, which makes the preview again — a new frame at the same image, playing if it was, the notes and
//      the staging untouched (page/studio/01-preview.js, soundDead).
// The page is told: 'sound' { state: 'lost' | 'back' | 'dead', why }.
// (mute() of the API — not used by the page today — is a wanted mute: left as it is)
import type { PlayerRef } from '@remotion/player';

// every AudioContext of this frame, from its creation (Remotion's: made when the Player first renders, after this module)
const CTXS: AudioContext[] = [];
let onCtxError: (c: AudioContext) => void = () => {};
{
  const W = window as any, Native = W.AudioContext as (typeof AudioContext) | undefined;
  if (Native && !W.__coulissesAudio) {
    class Tracked extends Native {
      constructor(o?: AudioContextOptions) { super(o); CTXS.push(this); this.addEventListener('error', () => onCtxError(this)); }
    }
    W.AudioContext = Tracked;
  }
  W.__coulissesAudio = CTXS;   // (the tests: tests/sound-watch.mjs)
}
const live = () => { for (let i = CTXS.length - 1; i >= 0; i--) if (CTXS[i].state !== 'closed') return CTXS[i]; return null; };

export function createSound(emit: (type: string, extra?: Record<string, unknown>) => void) {
  let wanted = false, wait = 1000, lost = false, again: ReturnType<typeof setTimeout> | null = null, calm: ReturnType<typeof setTimeout> | null = null;
  let cur: PlayerRef | null = null;
  let fails: number[] = [], deadAt = -1e9;   // the Player's own mutes of the last 20 s; the last « dead » said
  let buffering = false, since = 0, bad = 0, lastT = -1, lastW = 0, resumed = false;
  const clear = () => { if (again) clearTimeout(again); if (calm) clearTimeout(calm); again = calm = null; };
  const dead = (why: string) => {
    const t = performance.now(); if (t - deadAt < 20000) return;   // (the page is making a new preview)
    deadAt = t; bad = 0; fails = []; clear();
    emit('sound', { state: 'dead', why });
  };
  onCtxError = (c) => { if (c === live() && !wanted) dead('error'); };
  const onMute = (e: any) => {
    const r = cur; if (!r) return;
    if (e?.detail?.isMuted) {
      if (wanted) return;
      const t = performance.now(); fails = fails.filter((x) => t - x < 20000); fails.push(t);
      if (fails.length >= 4) { dead('refused'); return; }   // (after 1 + 2 + 4 s of tries: a context that will not play again)
      if (!lost) { lost = true; emit('sound', { state: 'lost' }); }
      if (calm) { clearTimeout(calm); calm = null; }
      if (again) clearTimeout(again);
      again = setTimeout(() => { again = null; if (cur === r && r.isMuted() && !wanted) r.unmute(); }, wait);
      wait = Math.min(10000, wait * 2);
    } else if (lost) {
      // back for good once it stays unmuted 3 s (the device may refuse again at once: the Player mutes itself again)
      if (calm) clearTimeout(calm);
      calm = setTimeout(() => { calm = null; if (cur === r && !r.isMuted()) { lost = false; wait = 1000; fails = []; emit('sound', { state: 'back' }); } }, 3000);
    }
  };
  // the watch, once a second, while the Player plays with its sound
  const watch = () => {
    const r = cur;
    if (!r || wanted || buffering || document.hidden || !r.isPlaying() || r.isMuted()) { bad = 0; lastT = -1; resumed = false; return; }
    const now = performance.now(), c = live();
    if (!c || now - since < 2500) { lastT = -1; return; }   // (starting: the Player resumes its context itself)
    const t = c.currentTime;
    let ok = c.state === 'running';
    if (ok && lastT >= 0 && now - lastW > 800 && t - lastT < 0.3 * (now - lastW) / 1000) ok = false;   // running, its clock stopped
    lastT = t; lastW = now;
    if (ok) { bad = 0; resumed = false; return; }
    bad++;
    if (bad >= 2 && !resumed) { resumed = true; c.resume().catch(() => {}); }   // left suspended behind the Player's back: started again
    if (bad >= 5) dead(c.state === 'running' ? 'stalled' : String(c.state));
  };
  const onPlay = () => { since = performance.now(); bad = 0; lastT = -1; resumed = false; };
  const onWait = () => { buffering = true; }, onGo = () => { buffering = false; since = performance.now(); lastT = -1; };
  return {
    // the Player mounted (again, after an error: a new one)
    attach(r: PlayerRef) {
      cur = r; clear(); wait = 1000; lost = false; fails = []; buffering = false; since = performance.now();
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
    mute() { wanted = true; cur?.mute(); },
    unmute() { wanted = false; clear(); wait = 1000; cur?.unmute(); },
    // « Rétablir le son » (the page): unmuted now, whatever happened (the page then makes the preview again)
    restore() { wanted = false; clear(); wait = 1000; fails = []; if (cur?.isMuted()) cur.unmute(); return !!cur && !cur.isMuted(); },
    lost: () => lost,
    // (the tests) the state of the sound: the contexts of this frame
    contexts: () => CTXS.map((c) => ({ state: c.state, t: +c.currentTime.toFixed(2), rate: c.sampleRate })),
  };
}
