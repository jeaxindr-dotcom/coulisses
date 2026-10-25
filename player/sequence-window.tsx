// The live preview only (lib/player-build.mjs gives this module to every « import … from 'remotion' » of its bundle):
// every export of Remotion as it is, but a <Sequence layout="none"> far from the frame shown is not mounted at all
// (user report 18/10/2026, « la lecture remotion sur cet épisode long est lente et laggy »: E11's 1601 sequences — a
// sound each: every line, every sound effect, every music cue — were all rendered again at every frame, 6 of them
// playing). Remotion itself shows a sequence's children only inside its range (and its premountFor / postmountFor):
// mounted from a little before (2 s, or its premount + 1 s) to a little after, it plays exactly as before. Visual
// sequences (any other layout) are left as they are. The renders never go through this module.
import React, { forwardRef } from 'react';
// @ts-ignore resolved by lib/player-build.mjs: the project's own remotion package
import * as R from '@coulisses-remotion';
// @ts-ignore
export * from '@coulisses-remotion';

const Real: any = (R as any).Sequence;
const PRE = 60, POST = 30;   // frames: 2 s before, 1 s after
const Windowed = forwardRef<any, any>(function WindowedSequence(props, ref) {
  const f: number = (R as any).useCurrentFrame();
  const from = Number.isFinite(props.from) ? props.from : 0, dur = Number.isFinite(props.durationInFrames) ? props.durationInFrames : Infinity;
  // (as Remotion's own span of a sequence: a loop never ends, a playbackRate stretches it)
  const span = props.loop ? Infinity : dur / (props.playbackRate > 0 ? props.playbackRate : 1);
  if (f < from - PRE || f >= from + span + POST) return null;
  return <Real {...props} ref={ref} />;
});
// A visual sequence (any other layout) premounted 3 s ahead unless the project set its own premount/postmount (user
// request 25/10/2026: « il y a pas moyen d'avoir une lecture fluide dès le début ? » — a scene that loads its assets when it
// mounts, a Theatre stage, a bakery saynète of the lessons, was mounted only when the playback reached it: a wait each
// time, player/assets-wait.tsx). Its children mounted hidden, at the sequence's first frame, from 3 s before: its assets
// load while the scene before plays. A render never premounts (Remotion: only the Player does); COULISSES_PREMOUNT=0 (the
// studio's environment, lib/player-build.mjs) turns it off.
// Told to player/assets-wait.tsx: the sequences premounting now (their absolute start frame) and when a visible one last
// mounted — a load begun while only premounting is waited for once the playback reaches its sequence.
declare const __COULISSES_PREMOUNT__: number | undefined;
const PREMOUNT_S = typeof __COULISSES_PREMOUNT__ === 'number' ? __COULISSES_PREMOUNT__ : 3;
const PM: Map<object, number> = ((window as any).__coulissesPremounting ??= new Map());
const Visual = forwardRef<any, any>(function VisualSequence(props, ref) {
  const { fps } = (R as any).useVideoConfig();
  const parent: any = React.useContext((R as any).Internals.SequenceContext);
  const f: number = (R as any).useCurrentFrame();
  const token = React.useRef<object>({}).current;
  const own = props.premountFor != null || props.postmountFor != null;
  const pre = own ? (props.premountFor ?? 0) : Math.round(PREMOUNT_S * fps);
  const from = Number.isFinite(props.from) ? props.from : 0;
  const ahead = pre > 0 && f < from && f >= from - pre;
  if (ahead) PM.set(token, (parent ? parent.cumulatedFrom + parent.relativeFrom : 0) + from); else PM.delete(token);
  React.useState(() => { if (!ahead) (window as any).__coulissesActiveMountAt = performance.now(); return 0; });   // (mounted visible: a seek, a cut)
  React.useEffect(() => () => { PM.delete(token); }, []);
  return <Real {...props} {...(own || pre <= 0 ? {} : { premountFor: pre })} ref={ref} />;
});
export const Sequence = forwardRef<any, any>(function Sequence(props, ref) {
  return props.layout === 'none' ? <Windowed {...props} ref={ref} /> : <Visual {...props} ref={ref} />;
});
