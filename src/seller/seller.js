'use strict';
/**
 * The x402 seller — ONE implementation, two modes.
 *
 *   mode 'vulnerable'  → what a developer ships after the happy-path tutorial.
 *                        Verifies the signature and serves the content. Done.
 *   mode 'secure'      → the same seller after hour two.
 *
 * The diff between the two is the entire security lesson. Every `if (secure)`
 * below maps to one attack in ../attacks and one stage of the kill chain.
 *
 * Native http only — no Express, no deps — so it runs anywhere instantly.
 */

const http = require('node:http');
const {
  makeFacilitator, decodePayment, requestBindingFor, buildRequirements,
} = require('../lib/x402');

const SELLER = '0x000000000000000000000000000000000000f402'; // where funds go
const PRICE = 1000; // 0.001 USDC in 6-decimal base units — a sub-cent API call
const SECRET = 'ALPHA: model says BTC dips 4% in 48h. Position accordingly.';

function makeSeller(mode, { settleShouldFail = false, payTo = SELLER, price = PRICE } = {}) {
  const secure = mode === 'secure';
  const facilitator = makeFacilitator({ settleShouldFail });
  const usedNonces = new Set();          // secure-only: single-use payments
  const stats = { served: 0, settled: 0, leakedBaseUnits: 0 };

  const server = http.createServer(async (req, res) => {
    if (req.url === '/stats') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(stats));
    }
    if (!req.url.startsWith('/research')) { res.statusCode = 404; return res.end('not found'); }

    const requirements = buildRequirements({
      payTo, maxAmountRequired: price, resource: '/research',
    });
    const header = req.headers['x-payment'];

    // ── no payment yet: issue the 402 challenge ──────────────────────────────
    if (!header) {
      res.statusCode = 402;
      res.setHeader('content-type', 'application/json');
      // x402 v2 also mirrors this into a PAYMENT-REQUIRED header; body kept for clarity
      return res.end(JSON.stringify({ x402Version: 2, accepts: [requirements] }));
    }

    // ── payment present: verify it ───────────────────────────────────────────
    let payment;
    try { payment = decodePayment(header); }
    catch { res.statusCode = 400; return res.end('malformed X-PAYMENT'); }

    const v = facilitator.verify(payment, requirements);
    if (!v.ok) { res.statusCode = 402; return res.end(JSON.stringify({ error: v.reason })); }

    // ══ SECURE CONTROL 1 — bind the payment to THIS request ══════════════════
    // Attack blocked: replay against a different resource (../attacks/01).
    if (secure) {
      const expected = requestBindingFor(req.method, '/research');
      if (payment.authorization.requestBinding !== expected) {
        res.statusCode = 402;
        return res.end(JSON.stringify({ error: 'payment_not_bound_to_request' }));
      }
    }

    // ══ SECURE CONTROL 2 — single-use nonce store ════════════════════════════
    // Attack blocked: replay of the SAME bearer header (../attacks/01).
    if (secure) {
      if (usedNonces.has(payment.authorization.nonce)) {
        res.statusCode = 402;
        return res.end(JSON.stringify({ error: 'payment_already_used' }));
      }
    }

    // ══ SECURE CONTROL 3 — settle BEFORE granting ════════════════════════════
    // Attack blocked: verify/settle divergence (../attacks/03).
    // The vulnerable server grants on verification and never waits for money.
    if (secure) {
      const s = await facilitator.settle(payment);
      if (!s.success) {
        res.statusCode = 402;
        return res.end(JSON.stringify({ error: 'settlement_failed', reason: s.reason }));
      }
      usedNonces.add(payment.authorization.nonce);
      stats.settled++;
    } else {
      // VULNERABLE: fire-and-forget. Content is already out the door.
      facilitator.settle(payment).then(s => { if (s.success) stats.settled++; });
    }

    // ── grant access ─────────────────────────────────────────────────────────
    stats.served++;
    stats.leakedBaseUnits = (stats.served - stats.settled) * price;

    // ══ SECURE CONTROL 4 — never let a CDN cache a paid response ══════════════
    // Attack blocked: cache leak (../attacks/02).
    if (secure) res.setHeader('Cache-Control', 'private, no-store');
    // VULNERABLE: no Cache-Control at all → a proxy will happily cache 200+body.

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ answer: SECRET, servedCount: stats.served }));
  });

  server.stats = stats;
  server.facilitator = facilitator;
  return server;
}

module.exports = { makeSeller, SELLER, PRICE };

// allow: node src/seller/seller.js [vulnerable|secure] [port]
if (require.main === module) {
  const mode = process.argv[2] === 'secure' ? 'secure' : 'vulnerable';
  const port = Number(process.argv[3] || 4021);
  makeSeller(mode).listen(port, () =>
    console.log(`x402 seller [${mode}] on http://localhost:${port}/research  (price ${PRICE} base units)`));
}
