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
  const pre = Math.max(PRE, (props.premountFor ?? 0) + 30), post = Math.max(POST, (props.postmountFor ?? 0) + 30);
  if (f < from - pre || f >= from + dur + post) return null;
  return <Real {...props} ref={ref} />;
});
export const Sequence = forwardRef<any, any>(function Sequence(props, ref) {
  return props.layout === 'none' ? <Windowed {...props} ref={ref} /> : <Real {...props} ref={ref} />;
});
