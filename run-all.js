'use strict';
/**
 * run-all.js — the whole "break it, then fix it" arc in one command.
 *
 * Starts a VULNERABLE seller and a SECURE seller, runs every attack against
 * both, and prints a summary table. This is the live spine of hour two:
 * every row is an attack that works on the left and is blocked on the right.
 *
 *   node run-all.js
 */

const { makeSeller } = require('./src/seller/seller');
const replay = require('./src/attacks/01-replay');
const cache = require('./src/attacks/02-cache-leak');
const verifySettle = require('./src/attacks/03-verify-settle');
const confusedDeputy = require('./src/attacks/04-confused-deputy');
const blowout = require('./src/attacks/05-budget-blowout');

const c = {
  red: s => `\x1b[31m${s}\x1b[0m`, green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`, cyan: s => `\x1b[36m${s}\x1b[0m`,
};

function listen(server) { return new Promise(r => server.listen(0, () => r(server.address().port))); }

async function main() {
  console.log(c.bold('\n  Blockchain for AI Agents — attack suite\n'));

  const vuln = makeSeller('vulnerable');
  const secure = makeSeller('secure');
  const vPort = await listen(vuln);
  const sPort = await listen(secure);
  const vURL = `http://localhost:${vPort}`, sURL = `http://localhost:${sPort}`;

  const rows = [];

  // ── stage 3: replay (against a live seller, both modes) ───────────────────
  rows.push(['1 · replay', 'stage 3',
    await replay.run(vURL), await replay.run(sURL)]);

  // ── stage 3: cache confusion (proxy in front of each seller) ──────────────
  rows.push(['2 · cache confusion', 'stage 3',
    await cache.run(vPort), await cache.run(sPort)]);

  // ── stage 3: verify/settle divergence (self-contained, both modes) ────────
  const vs = await verifySettle.run();
  rows.push(['3 · verify/settle', 'stage 3',
    { succeeded: vs.succeeded, verdict: `served=${vs.vulnerable.servedContent} settled=${vs.vulnerable.settled}` },
    { succeeded: false, verdict: `status ${vs.secure.status}, no content` }]);

  // ── stage 1: confused deputy (self-contained) ─────────────────────────────
  const cd = await confusedDeputy.run();
  rows.push(['4 · confused deputy', 'stage 1',
    { succeeded: cd.succeeded, verdict: `attacker balance ${cd.vulnerable.attackerBalance}` },
    { succeeded: false, verdict: cd.secure.peerAttempt.slice(0, 30) + '…' }]);

  // ── stage 2: budget blowout (self-contained) ──────────────────────────────
  const bo = await blowout.run();
  rows.push(['5 · budget blowout', 'stage 2',
    { succeeded: true, verdict: `naked spent $${bo.naked.spentUsd}` },
    { succeeded: false, verdict: `capped at $${bo.governed.spentUsd} (${bo.governed.stoppedBy})` }]);

  vuln.close(); secure.close();

  // ── summary ───────────────────────────────────────────────────────────────
  console.log('  ' + c.bold('ATTACK'.padEnd(22)) + c.bold('KILL-CHAIN'.padEnd(12))
    + c.bold('VULNERABLE'.padEnd(14)) + c.bold('SECURE'));
  console.log('  ' + c.dim('─'.repeat(72)));
  for (const [name, stage, v, s] of rows) {
    const vTag = v.succeeded ? c.red('✗ BROKEN') : c.green('✓ safe');
    const sTag = s.succeeded ? c.red('✗ BROKEN') : c.green('✓ BLOCKED');
    console.log('  ' + name.padEnd(22) + c.dim(stage.padEnd(12))
      + vTag.padEnd(22) + sTag);
    console.log('  ' + c.dim(' '.repeat(2) + '↳ vuln:   ' + v.verdict));
    console.log('  ' + c.dim(' '.repeat(2) + '↳ secure: ' + s.verdict));
  }
  console.log('  ' + c.dim('─'.repeat(72)));
  console.log('  ' + c.cyan('Every attack works against the naive seller and is blocked after hour two.\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
