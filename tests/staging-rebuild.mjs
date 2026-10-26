// Une vraie différence de JavaScript exécuté, sans changer les gestes testés.
// Observer les mutations évite de manquer une préparation plus courte que le polling CDP.
import fs from 'node:fs';
import crypto from 'node:crypto';

export async function stageRebuild(page, source) {
  const marker = crypto.randomUUID(), original = fs.readFileSync(source);
  const addition = Buffer.from(`\n// Révision temporaire du test de mise en scène.\ndocument.documentElement.dataset.coulissesStagingRevision = ${JSON.stringify(marker)};\n`);
  const changed = Buffer.concat([original, addition]);
  await page.eval(`
    const old = document.querySelector('#code'), api = window.__preview;
    const proof = window.__stagingRebuild = {old, api, oldSrc: old.src, candidate: null, preparedBehind: false, adopted: false};
    const observe = () => {
      const next = document.querySelector('#media iframe.code-next');
      if (next && old.isConnected && document.querySelector('#code') === old && window.__preview === api && getComputedStyle(next).opacity === '0') {
        proof.candidate = next; proof.preparedBehind = true;
      }
      if (proof.candidate && document.querySelector('#code') === proof.candidate && !old.isConnected && window.__preview !== api) proof.adopted = true;
    };
    proof.observer = new MutationObserver(observe);
    proof.observer.observe(document.querySelector('#media'), {childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'class', 'src']});
    return 1;
  `);
  fs.writeFileSync(source, changed);
  return {
    marker,
    async adopted() {
      await page.until(`window.__stagingRebuild?.adopted && document.querySelectorAll('#media iframe').length === 1`, 120000);
      const proof = await page.eval(`const p = window.__stagingRebuild; p.observer.disconnect(); return {preparedBehind: p.preparedBehind, adopted: p.adopted, oldSrc: p.oldSrc, newSrc: document.querySelector('#code').src, frames: document.querySelectorAll('#media iframe').length}`);
      const actual = await page.frameEval('player.html', `return document.documentElement.dataset.coulissesStagingRevision`);
      return {...proof, marker: actual, markerMatches: actual === marker};
    },
    restore() {
      const current = fs.readFileSync(source);
      if (current.equals(changed)) fs.writeFileSync(source, original);
      else if (current.subarray(-addition.length).equals(addition)) fs.writeFileSync(source, current.subarray(0, -addition.length));
      else if (!current.equals(original)) throw new Error(`Le fichier a changé pendant le test : restauration refusée pour préserver les autres modifications (${source}).`);
    },
  };
}
