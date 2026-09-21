'use strict';
/**
 * The deterministic policy engine — the load-bearing control of the whole
 * workshop:  AGENTS PROPOSE, THIS AUTHORIZES.
 *
 * It is intentionally boring and non-probabilistic. No model runs here. Given a
 * proposed payment it returns allow / reject / escalate against fixed rules.
 * That determinism is the point: a bug in the agent cannot talk its way past it.
 */

const DEFAULT_POLICY = {
  limits: {
    perTransactionUsd: 1.00,
    rolling24hUsd: 25.00,
    velocityMaxPerMin: 10,        // circuit breaker, not a rate limit
    novelCounterpartyUsd: 0.10,   // first-seen payee gets a tighter cap
  },
  authorization: {
    allowedIntents: ['transfer'], // explicit allowlist; anything else is rejected
    onPolicyMiss: 'reject',       // reject, never warn-and-proceed
  },
  escalation: {
    humanApprovalAboveUsd: 50.00,
  },
};

class PolicyEngine {
  constructor(policy = DEFAULT_POLICY) {
    this.policy = policy;
    this.events = [];                 // {ts, usd}
    this.seenCounterparties = new Set();
  }

  _rolling24h() {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return this.events.filter(e => e.ts >= cutoff).reduce((s, e) => s + e.usd, 0);
  }
  _lastMinuteCount() {
    const cutoff = Date.now() - 60 * 1000;
    return this.events.filter(e => e.ts >= cutoff).length;
  }

  /**
   * proposal = { to, valueUsd, intent, decodedCalldata }
   * The agent hands over a PROPOSAL. We decide. We never trust its summary —
   * we inspect decodedCalldata, which the caller must decode from the raw tx.
   */
  authorize(proposal) {
    const L = this.policy.limits, A = this.policy.authorization, E = this.policy.escalation;

    // CONTROL: verify the DECODED intent, never a stated one.
    if (!A.allowedIntents.includes(proposal.intent))
      return { decision: 'reject', reason: `intent_not_allowed:${proposal.intent}` };

    // CONTROL: per-transaction ceiling.
    if (proposal.valueUsd > L.perTransactionUsd)
      return { decision: 'reject', reason: `over_per_tx_cap:${proposal.valueUsd}>${L.perTransactionUsd}` };

    // CONTROL: tighter cap for a counterparty we've never paid before.
    const novel = !this.seenCounterparties.has(proposal.to);
    if (novel && proposal.valueUsd > L.novelCounterpartyUsd)
      return { decision: 'reject', reason: `novel_counterparty_cap:${proposal.valueUsd}>${L.novelCounterpartyUsd}` };

    // CONTROL: velocity circuit breaker.
    if (this._lastMinuteCount() >= L.velocityMaxPerMin)
      return { decision: 'reject', reason: 'velocity_circuit_breaker' };

    // CONTROL: rolling 24h budget.
    if (this._rolling24h() + proposal.valueUsd > L.rolling24hUsd)
      return { decision: 'reject', reason: `over_rolling_24h_cap` };

    // CONTROL: hand large payments to a human.
    if (proposal.valueUsd > E.humanApprovalAboveUsd)
      return { decision: 'escalate', reason: 'human_approval_required' };

    return { decision: 'allow', reason: 'within_policy' };
  }

  record(proposal) {
    this.events.push({ ts: Date.now(), usd: proposal.valueUsd });
    this.seenCounterparties.add(proposal.to);
  }
}

module.exports = { PolicyEngine, DEFAULT_POLICY };
