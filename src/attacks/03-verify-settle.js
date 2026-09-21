'use strict';
/**
 * ATTACK 3 — VERIFY / SETTLE DIVERGENCE  ·  kill-chain stage 3
 *
 * Real-world anchor: the arXiv study reports a revert-grant probability of UP TO
 * 5.18% with honest facilitators and 100% against a Byzantine one. The 5.18% is
 * a SIMULATED local-chain sweep with an injected 5% reorg probability, not a
 * production measurement — present it as an upper bound. A server that
 * grants access on VERIFICATION (the signature looks good) rather than on
 * SETTLEMENT (the money actually moved) serves content for free whenever
 * settlement later reverts — insufficient funds, a nonce race, a hostile
 * facilitator.
 *
 * Demo: force settlement to fail after verification succeeds. The vulnerable
 * seller has already shipped the content; the secure seller waited.
 */

const { makeSeller } = require('../seller/seller');
const { payAndFetch } = require('../buyer/agent');
const { newAccount } = require('../lib/x402');

async function runOne(mode) {
  // A seller whose facilitator VERIFIES fine but always fails to SETTLE.
  const server = makeSeller(mode, { settleShouldFail: true });
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;

  const buyer = newAccount('buyer');
  const r = await payAndFetch(url, buyer, { bind: true });
  // let the vulnerable server's fire-and-forget settle() resolve
  await new Promise(r => setTimeout(r, 20));

  const got = r.status === 200;
  const stats = { ...server.stats };
  server.close();
  return { mode, status: r.status, servedContent: got, settled: stats.settled };
}

async function run() {
  const vuln = await runOne('vulnerable');
  const secure = await runOne('secure');
  const succeeded = vuln.servedContent && vuln.settled === 0;
  return {
    attack: 'verify-settle-divergence',
    vulnerable: vuln, secure,
    succeeded,
    verdict: succeeded
      ? `BROKEN — vulnerable seller served content with 0 settlements (free). Secure seller returned ${secure.status}.`
      : `unexpected — check facilitator wiring`,
  };
}

module.exports = { run };

if (require.main === module) run().then(r => console.log(JSON.stringify(r, null, 2)));
