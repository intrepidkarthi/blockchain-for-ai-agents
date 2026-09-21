'use strict';
/**
 * measure/pull.js — the opening demo made runnable.
 *
 * The single most credible thing you can do in the first ten minutes is show,
 * live, that the promoted numbers and the real numbers disagree by more than an
 * order of magnitude — and that the sources disagree with EACH OTHER. This
 * script pulls the live series, falls back to the bundled snapshot, and prints
 * the contrast the workshop opens on.
 *
 *   node src/measure/pull.js
 *
 * Every derived figure below is COMPUTED from the series, not hardcoded, so it
 * cannot drift out of sync with the data the way a pasted percentage does.
 */

const snapshot = require('./snapshot.json');

const LIVE_URL = 'https://agenteconomy.to/data.json';

async function tryLive(url, ms = 6000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.x402 || !Array.isArray(j.x402.monthly)) return null;
    return j;
  } catch { return null; }
}

// Always pass an explicit locale. Without it Node uses the HOST locale, which
// renders 168016314 as "16,80,16,314" on an India-configured machine — a
// genuinely confusing thing to put on screen in front of a global cohort.
const n = (v) => Number(v).toLocaleString('en-US');
const usd = (v) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function shape(live) {
  if (!live) {
    return {
      src: `SNAPSHOT (${snapshot.asOf})`,
      ...snapshot.x402,
      erc8004RegisteredAgents: snapshot.erc8004.registeredAgents,
      ctx: snapshot.context,
    };
  }

  const m = live.x402.monthly;
  const peak = m.reduce((a, b) => (b.vol > a.vol ? b : a), m[0]);
  const now = m[m.length - 1];
  return {
    src: `LIVE (agenteconomy.to, ${String(live.updatedAt).slice(0, 10)})`,
    lifetimeSettlementUsd: live.x402.totalVolume,
    lifetimeTransactions: live.x402.totalTxs,
    facilitatorsTracked: live.x402.facilitatorsTracked,
    chainsTracked: live.x402.chainsTracked,
    peak, now,
    erc8004RegisteredAgents: live.erc8004Registry && live.erc8004Registry.totalAgents,
    ctx: snapshot.context,
  };
}

async function main() {
  const live = await tryLive(LIVE_URL);
  const d = shape(live);

  const peak = d.peak || snapshot.x402.peakMonth;
  const now = d.now || snapshot.x402.currentMonth;

  // Derived, not asserted.
  const avgPeak = peak.vol / peak.txs;
  const avgNow = now.vol / now.txs;
  const dropFromPeakPct = (1 - now.vol / peak.vol) * 100;

  console.log(`\n  ${bold('x402 reality check')} — source: ${d.src}\n`);
  console.log(`  Lifetime settlement (since May 2025)   ${usd(d.lifetimeSettlementUsd)}`);
  console.log(`  Lifetime transactions                  ${n(d.lifetimeTransactions)}`);
  console.log(`  Facilitators / chains tracked          ${d.facilitatorsTracked} / ${d.chainsTracked}`);
  console.log('');
  console.log(`  Monthly settlement at peak (${peak.month})    ${usd(peak.vol)}  across ${n(peak.txs)} tx`);
  console.log(`  Monthly settlement now      (${now.month})    ${usd(now.vol)}  across ${n(now.txs)} tx`);
  console.log(`  ${bold(`Volume down ${dropFromPeakPct.toFixed(1)}% from peak — while transaction COUNT held up.`)}`);
  console.log(`  Average payment  peak → now            $${avgPeak.toFixed(3)} → $${avgNow.toFixed(3)}`);
  console.log(dim('  (falling value per transaction with flat counts is the signature of'));
  console.log(dim('   dust and farming replacing commerce)'));

  // ── the measurement spread: the real point of this demo ────────────────────
  const s = snapshot.measurementSpread30d;
  console.log(`\n  ${bold('Same protocol, same 30-day window, four sources:')}`);
  console.log(`    x402.org headline banner            ${usd(s.officialSiteUsd)}   ${dim(`(frozen since ${s.officialSiteFrozenAt})`)}`);
  console.log(`    Allium                              ${usd(s.alliumUsd)}`);
  console.log(`    Artemis, self-dealing filtered      ${usd(s.artemisAdjustedUsd)}   ${dim(`(${s.artemisNote})`)}`);
  console.log(`    Listed-service marketplace GMV      ${usd(s.marketplaceGmvUsd)}   ${dim(`(${s.marketplaceSource}, ${s.marketplaceAsOf})`)}`);
  console.log(`  ${bold(`Official headline is ${(s.officialSiteUsd / s.artemisAdjustedUsd).toFixed(0)}x the filtered figure, `
    + `and ${(s.officialSiteUsd / s.marketplaceGmvUsd).toFixed(0)}x actual marketplace GMV.`)}`);

  // ── contrast ──────────────────────────────────────────────────────────────
  const L = d.ctx.lightningAllNetworkMonthlyUsdNov2025;
  console.log(`\n  For contrast — the ${bold('entire Bitcoin Lightning Network')}, Nov 2025 monthly: ${usd(L)}`);
  console.log(`  ${dim(`(~${(L / d.lifetimeSettlementUsd).toFixed(0)}x x402's LIFETIME settlement, with no "agent economy" narrative.`)}`);
  console.log(`  ${dim(` Caveat to say out loud: that is ALL Lightning payments at ~$${d.ctx.lightningAvgTxUsdNov2025} average —`)}`);
  console.log(`  ${dim(' exchange and merchant flow, NOT L402 machine micropayments, which are not broken out.)')}`);

  if (d.erc8004RegisteredAgents) {
    console.log(`\n  ERC-8004 registered agents             ${n(d.erc8004RegisteredAgents)}`);
    console.log(dim(`   …of the first 10,000 audited, ${snapshot.erc8004.operationalOfFirst10k} were fully operational (arXiv 2606.12128)`));
    console.log(dim(`   …median cost to move an agent's reputation past the trust threshold on Base: `
      + `$${snapshot.erc8004.medianReputationManipulationUsdBase} (arXiv 2606.26028)`));
  }

  if (!live) {
    console.log('\n  ' + dim('Live fetch unavailable; showing bundled snapshot. Re-run on the venue network.'));
  }
  console.log('');
}

main();
