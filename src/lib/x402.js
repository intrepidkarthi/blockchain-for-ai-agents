'use strict';
/**
 * A protocol-faithful, dependency-free model of x402.
 *
 * This implements the SHAPE and SEMANTICS of x402 (the 402 challenge, the
 * X-PAYMENT bearer header, a facilitator with verify() and settle()) without
 * a live chain, a Coinbase CDP key, or testnet funds — so the ATTACKS run
 * deterministically on any laptop, offline, every time.
 *
 * The vulnerabilities demonstrated here (replay, request-unbinding,
 * cache leakage, verify/settle divergence) are HTTP- and protocol-level.
 * They do not depend on the chain, which is exactly why a local model
 * reproduces them faithfully.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TO MAKE IT REAL (the "production" swap, documented in the README):
 *   - Replace mockFacilitator with a real facilitator (verify/settle over
 *     HTTP). The env var is FACILITATOR_URL — NOT X402_FACILITATOR_URL,
 *     which appears nowhere in the canonical repo. (Verified 2026-08-25.)
 *   - Replace the Ed25519 authorization with an EIP-3009
 *     transferWithAuthorization signature (USDC on Base Sepolia).
 *   - Everything else — the 402 flow, the server logic, the attacks, the
 *     policy engine — stays identical. The header NAMES do change in v2;
 *     see the note above encodePayment().
 * ─────────────────────────────────────────────────────────────────────────
 */

const crypto = require('node:crypto');

// ── canonical JSON so signatures are stable regardless of key order ──────────
function canonical(obj) {
  if (Array.isArray(obj)) return '[' + obj.map(canonical).join(',') + ']';
  if (obj && typeof obj === 'object') {
    return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
  }
  return JSON.stringify(obj);
}

// ── mock accounts: real Ed25519 keypairs, address = hash(pubkey) ─────────────
function newAccount(label) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' });
  const address = '0x' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 40);
  return { label, address, publicKey, privateKey };
}

// ── EIP-3009-style authorization: signed transfer intent ─────────────────────
// In real x402 this is transferWithAuthorization. Here it is an Ed25519
// signature over the same fields. `requestBinding` is our teaching hook:
// a SECURE server binds the payment to the specific request; a VULNERABLE
// one does not, which is what makes the bearer header replayable.
function signPayment(from, requirements, { requestBinding = null } = {}) {
  const authorization = {
    scheme: 'exact',
    network: requirements.network,
    asset: requirements.asset,
    from: from.address,
    to: requirements.payTo,
    value: requirements.maxAmountRequired,
    nonce: '0x' + crypto.randomBytes(16).toString('hex'),
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 600,
    // requestBinding is present in a correctly-implemented client; a naive
    // integration omits it. Its presence/absence drives the replay lesson.
    requestBinding,
  };
  const message = Buffer.from(canonical(authorization));
  const signature = crypto.sign(null, message, from.privateKey).toString('base64');
  const pubkey = from.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return { authorization, signature, pubkey };
}

// verify signature is cryptographically valid and pays the right party/amount.
// This is the honest part of a facilitator; it is NOT where the bugs live.
function verifySignature(payment, requirements) {
  const { authorization, signature, pubkey } = payment;
  const key = crypto.createPublicKey({
    key: Buffer.from(pubkey, 'base64'), type: 'spki', format: 'der',
  });
  const derivedAddr = '0x' + crypto.createHash('sha256')
    .update(Buffer.from(pubkey, 'base64')).digest('hex').slice(0, 40);
  const okSig = crypto.verify(null, Buffer.from(canonical(authorization)), key,
    Buffer.from(signature, 'base64'));
  if (!okSig) return { ok: false, reason: 'bad_signature' };
  if (derivedAddr !== authorization.from) return { ok: false, reason: 'signer_mismatch' };
  if (authorization.to !== requirements.payTo) return { ok: false, reason: 'wrong_payee' };
  if (BigInt(authorization.value) < BigInt(requirements.maxAmountRequired))
    return { ok: false, reason: 'underpaid' };
  if (authorization.validBefore < Math.floor(Date.now() / 1000))
    return { ok: false, reason: 'expired' };
  return { ok: true };
}

// ── mock facilitator: verify + settle, mirrors the real /verify /settle API ──
// settleShouldFail lets us stage the verify/settle divergence attack, where a
// server that grants on verification leaks content if settlement later reverts.
function makeFacilitator({ settleShouldFail = false } = {}) {
  const settled = [];
  return {
    verify(payment, requirements) { return verifySignature(payment, requirements); },
    async settle(payment) {
      if (settleShouldFail) return { success: false, reason: 'insufficient_funds_onchain' };
      const txHash = '0x' + crypto.createHash('sha256')
        .update(canonical(payment.authorization)).digest('hex');
      settled.push(txHash);
      return { success: true, txHash };
    },
    settledCount: () => settled.length,
  };
}

// ── header codecs ────────────────────────────────────────────────────────────
// NOTE (verified 2026-08-25): this lab uses X-PAYMENT, which is the *v1-era* name.
// Protocol Version 2 (dated 2025-12-09) renamed the wire headers to:
//     PAYMENT-REQUIRED   server -> client   base64 PaymentRequired
//     PAYMENT-SIGNATURE  client -> server   base64 PaymentPayload
//     PAYMENT-RESPONSE   server -> client   base64 SettlementResponse
// X-PAYMENT is kept deliberately: it is the name most tutorials still show, so it
// is what attendees recognise, and no attack here depends on it. SAY THIS ALOUD in
// the wire walkthrough — the rename is a free lesson in pinning a spec version.
const encodePayment = (p) => Buffer.from(JSON.stringify(p)).toString('base64');
const decodePayment = (h) => JSON.parse(Buffer.from(h, 'base64').toString('utf8'));

// bind a payment to the exact request: method + path + sha256(body)
function requestBindingFor(method, path, body = '') {
  const h = crypto.createHash('sha256').update(body).digest('hex');
  return `${method.toUpperCase()} ${path} ${h}`;
}

function buildRequirements({ payTo, maxAmountRequired, resource,
  asset = 'USDC', network = 'base-sepolia' }) {
  return { scheme: 'exact', network, asset, payTo,
    maxAmountRequired: String(maxAmountRequired), resource };
}

module.exports = {
  canonical, newAccount, signPayment, verifySignature, makeFacilitator,
  encodePayment, decodePayment, requestBindingFor, buildRequirements,
};
