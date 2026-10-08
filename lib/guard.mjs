// Only Coulisses itself may call a Coulisses server (code review, 08/10/2026: no check of where a request comes from —
// any web page open in the browser could POST to 127.0.0.1:417x: scan the disk, read the notes, run npm install; and a
// DNS-rebinding site, whose name points at 127.0.0.1, could even read the answers).
// A request passes when:
//   - its Host is this machine's loopback (127.0.0.1, localhost, [::1], any port): a rebinding site's own name fails;
//   - the browser, when it says where the request comes from, says it comes from such a page too: an Origin of the
//     loopback (the home screen and the studios call each other across ports), and « cross-site » only from a page of
//     the loopback (a page opened as localhost and one as 127.0.0.1 are two sites for the browser, one app — the studios
//     announce 127.0.0.1 like the home screen; a link or an <img> of another site has another Referer, or none).
// Tools without a browser (studio-cli.mjs, the tests' fetch, curl) send neither Origin nor Sec-Fetch-Site: they pass.
const LOOP = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const loopUrl = (s) => { try { const u = new URL(s); return /^https?:$/.test(u.protocol) && LOOP.test(u.host); } catch { return false; } };
export function fromApp(req) {
  if (!LOOP.test(String(req.headers.host ?? ''))) return false;
  const origin = req.headers.origin;
  if (origin !== undefined) return loopUrl(origin);   // « null » (a sandboxed frame, a file) fails too
  if (req.headers['sec-fetch-site'] === 'cross-site') return loopUrl(req.headers.referer ?? '');
  return true;
}
// the answer to a request that does not pass
export function refuse(res) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Coulisses: request refused (it does not come from Coulisses)');
}
