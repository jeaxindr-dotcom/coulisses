// The sound of the live preview, never lost for good (user report 19/10/2026: « quand il y a des lags, le son se
// désactive, et impossible à réactiver sans F5 »).
// Remotion's Player mutes itself when its AudioContext cannot start again — the sound device busy or failing while the
// PC lags (its log: « AudioContext resume rejected, muting playback and continuing without audio ») — and stays muted:
// a pause, a play, the volume change nothing, only a reload. Coulisses never mutes the Player of its own, so such a mute
// is taken back here: after 1 s, and while the device still refuses (the Player mutes itself again at its next try),
// after 2, 4, 8 s, then every 10 s. Once unmuted, the Player starts its sound again by itself (its AudioContext resumed
// at the next frame). The page is told: 'sound' { state: 'lost' | 'back' }.
// (mute() of the API — not used by the page today — is a wanted mute: left as it is)
import type { PlayerRef } from '@remotion/player';

export function createSound(emit: (type: string, extra?: Record<string, unknown>) => void) {
  let wanted = false, wait = 1000, lost = false, again: ReturnType<typeof setTimeout> | null = null, calm: ReturnType<typeof setTimeout> | null = null;
  let cur: PlayerRef | null = null;
  const clear = () => { if (again) clearTimeout(again); if (calm) clearTimeout(calm); again = calm = null; };
  const onMute = (e: any) => {
    const r = cur; if (!r) return;
    if (e?.detail?.isMuted) {
      if (wanted) return;
      if (!lost) { lost = true; emit('sound', { state: 'lost' }); }
      if (calm) { clearTimeout(calm); calm = null; }
      if (again) clearTimeout(again);
      again = setTimeout(() => { again = null; if (cur === r && r.isMuted() && !wanted) r.unmute(); }, wait);
      wait = Math.min(10000, wait * 2);
    } else if (lost) {
      // back for good once it stays unmuted 3 s (the device may refuse again at once: the Player mutes itself again)
      if (calm) clearTimeout(calm);
      calm = setTimeout(() => { calm = null; if (cur === r && !r.isMuted()) { lost = false; wait = 1000; emit('sound', { state: 'back' }); } }, 3000);
    }
  };
  return {
    // the Player mounted (again, after an error: a new one)
    attach(r: PlayerRef) {
      cur = r; clear(); wait = 1000; lost = false;
      (r as any).addEventListener('mutechange', onMute);
      if (r.isMuted() && !wanted) r.unmute();
      return () => { (r as any).removeEventListener('mutechange', onMute); if (cur === r) { cur = null; clear(); } };
    },
    mute() { wanted = true; cur?.mute(); },
    unmute() { wanted = false; clear(); wait = 1000; cur?.unmute(); },
    // « Rétablir le son » (the page): unmuted now, whatever happened
    restore() { wanted = false; clear(); wait = 1000; if (cur?.isMuted()) cur.unmute(); return !!cur && !cur.isMuted(); },
    lost: () => lost,
  };
}
