// Stand-in for the real render steps (lib/render.mjs › recipe), for tests/render.mjs on a SANDBOX copy:
//   STUDIO_RENDER_RECIPE=tests/fake-render.mjs node studio-cli.mjs render E03 <lot> --episodes <sandbox>
// Same kind of output as the five checks, Remotion and finish-render.sh, in a few seconds. The « new render » is the
// sandbox's own video remuxed into a NEW file renamed over it: the hard link to the real episode's video is replaced,
// never written through. Knobs: FAKE_FAIL=<check key> (that check fails), FAKE_RENDER_FAIL=1 (the render fails as Remotion
// does, an error inside the composition), FAKE_FRAMES (120), FAKE_MS (per frame, 40).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t } from '../lib/i18n.mjs';

const STEP = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-steps.mjs');
// the same labels as the real checks (lib/render.mjs): « Profondeur », « Visages masqués »… in French
const LABELS = Object.fromEntries(['depth', 'faces', 'backdrop', 'music', 'motion'].map((k) => [k, t(`rnd.check.${k}`)]));
export default (p) => {
  const n = (...a) => [process.execPath, STEP, ...a];
  const fail = process.env.FAKE_FAIL ?? '';
  return {
    checks: Object.entries(LABELS).map(([key, label]) => ({ key, label, run: [n('check', key, fail === key ? 'fail' : 'ok')], ok: /PASS/ })),
    render: { run: [n('render', process.env.FAKE_FRAMES ?? '120', process.env.FAKE_MS ?? '40')] },
    finish: { run: [n('finish', p.REVUE, p.folder)] },
  };
};
