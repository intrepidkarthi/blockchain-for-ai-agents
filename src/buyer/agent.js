'use strict';
/**
 * The buyer — an agent that hits a 402, pays, and retries.
 * This is the "make the buyer an agent" act of the demo.
 *
 * payAndFetch returns the X-PAYMENT header it used, so the attack scripts can
 * demonstrate what happens when that "bearer token" is captured and replayed.
 */

const { signPayment, encodePayment, requestBindingFor } = require('../lib/x402');

async function payAndFetch(baseURL, account, { bind = true, path = '/research' } = {}) {
  // 1. First request — expect the 402 challenge.
  const challenge = await fetch(baseURL + path);
  if (challenge.status !== 402) {
    return { status: challenge.status, body: await challenge.json(), paymentHeader: null };
  }
  const { accepts } = await challenge.json();
  const requirements = accepts[0];

  // 2. Sign the payment. A CORRECT client binds it to this exact request;
  //    a naive integration omits the binding (bind:false) — see attacks/01.
  const payment = signPayment(account, requirements, {
    requestBinding: bind ? requestBindingFor('GET', path) : null,
  });
  const paymentHeader = encodePayment(payment);

  // 3. Retry with the payment attached.
  const paid = await fetch(baseURL + path, { headers: { 'X-PAYMENT': paymentHeader } });
  return { status: paid.status, body: await paid.json().catch(() => null), paymentHeader };
}

module.exports = { payAndFetch };

if (require.main === module) {
  const { newAccount } = require('../lib/x402');
  (async () => {
    const me = newAccount('buyer');
    const url = process.argv[2] || 'http://localhost:4021';
    const r = await payAndFetch(url, me);
    console.log(`status ${r.status}`);
    console.log(r.body);
  })();
}
