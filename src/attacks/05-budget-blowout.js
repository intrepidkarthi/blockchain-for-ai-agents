'use strict';
/**
 * ATTACK 5 — BUDGET BLOWOUT  ·  kill-chain stage 2 ("what may the agent do?")
 *
 * Not an external attacker — the agent attacks your wallet by doing exactly
 * what it was told, forever. This is the JaredFromSubway lesson ($7.5M, 20 Jun
 * 2026, no AI, no key theft) generalized: an autonomous agent optimizing a goal
 * will keep spending as long as something keeps granting. The server has no
 * reason to stop it. The ONLY thing that stops it is a policy engine between
 * the agent's proposal and the money.
 *
 * Demo: the same research loop, run twice — once naked, once behind the engine.
 */

const { PolicyEngine } = require('../policy/engine');

// A "research loop" agent: it keeps hitting the same paid research API, finding
// one more query worth running. Honest budget for the task was $1.50. Left
// alone it will run $0.50 x 40 = $20.
const VENDOR = '0xresearch-api';
function researchLoop(queries = 40, pricePerQuery = 0.50, authorize) {
  let spent = 0, bought = 0, stopped = null;
  for (let i = 0; i < queries; i++) {
    const proposal = {
      to: VENDOR,
      valueUsd: pricePerQuery,
      intent: 'transfer',
      decodedCalldata: `transfer ${pricePerQuery} USDC to research-api`,
    };
    const decision = authorize(proposal);
    if (decision.decision === 'allow') { spent += pricePerQuery; bought++; decision.record?.(); }
    else { stopped = decision.reason; break; }
  }
  return { spent: Number(spent.toFixed(2)), bought, stopped };
}

async function run() {
  // ── naked: no policy. Every proposal is "allowed". ────────────────────────
  const naked = researchLoop(40, 0.50, () => ({ decision: 'allow' }));

  // ── governed: the same loop behind the deterministic engine. ──────────────
  // A per-task budget of $1.50 with a $0.50 per-transaction ceiling.
  const engine = new PolicyEngine({
    limits: { perTransactionUsd: 0.50, rolling24hUsd: 1.50,
      velocityMaxPerMin: 100, novelCounterpartyUsd: 0.50 },
    authorization: { allowedIntents: ['transfer'], onPolicyMiss: 'reject' },
    escalation: { humanApprovalAboveUsd: 50.00 },
  });
  const governed = researchLoop(40, 0.50, (p) => {
    const d = engine.authorize(p);
    return { ...d, record: () => engine.record(p) };
  });

  const succeeded = naked.spent > governed.spent;
  return {
    attack: 'budget-blowout',
    intendedTaskBudgetUsd: 1.50,
    naked: { spentUsd: naked.spent, purchases: naked.bought, note: 'ran to completion, unchecked' },
    governed: { spentUsd: governed.spent, purchases: governed.bought, stoppedBy: governed.stopped },
    succeeded,
    verdict: `Naked agent spent $${naked.spent} (${Math.round(naked.spent/1.50)}x the $1.50 task budget). `
      + `Governed agent spent $${governed.spent} across ${governed.bought} calls, then stopped: "${governed.stopped}".`,
  };
}

module.exports = { run };

if (require.main === module) run().then(r => console.log(JSON.stringify(r, null, 2)));
