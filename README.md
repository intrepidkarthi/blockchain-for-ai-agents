# Blockchain for AI Agents — workshop repo

**Build an x402 agent-payment flow, then break it, then secure it.**
Zero dependencies. Runs on any laptop with Node ≥ 18. No testnet, no faucet, no API keys.

> This is a **teaching model** of x402 — protocol-faithful in shape and semantics,
> but backed by a local mock facilitator and Ed25519 signatures instead of a live
> chain. That's deliberate: the vulnerabilities demonstrated here are HTTP- and
> protocol-level, so they reproduce faithfully offline and identically every time —
> no flaky testnet in front of 200 people. See **[Going real](#going-real)** for the
> one-file swap to Coinbase CDP + USDC on Base Sepolia.

---

## The workshop

This repo is the hands-on material for **[Hands-On Blockchain for AI Agents](https://www.eventbrite.co.uk/e/hands-on-blockchain-for-ai-agents-tickets-1998534891660)**, a live online workshop run with Packt.

- **When:** Saturday, 3 October 2026 · 9:00–11:00 AM EDT (2 hours, incl. Q&A)
- **Where:** Online
- **Level:** Intermediate–advanced. JavaScript/Node and basic web & API knowledge assumed.
- **Bring:** a laptop with Node.js ≥ 18. **No crypto wallet, tokens, or blockchain background required** — everything runs locally.
- **Includes:** workshop recording, certificate of completion, live Q&A.

| Time (EDT) | | |
|---|---|---|
| 9:00–10:00 | **Build the rail** | The honest landscape (headline numbers vs real ones), the protocol demystified (HTTP 402, payment challenges, settlement), build a paid service and an agent that pays it, expose it as an MCP tool. |
| 10:00–11:00 | **Break it, then secure it** | Attack what you built — replay a payment, pull paid content from a cache, drain a wallet, the confused-deputy problem — then rebuild it behind a deterministic policy engine: spend caps, velocity limits, allowlists, audit trails, kill switches. |

## The demo command

```bash
node run-all.js     # HOUR TWO — build it, break it, secure it (five attacks broken, then blocked by the policy engine)
```

---

## Quick start

```bash
node run-all.js        # the whole "break it, then fix it" arc, one command
```

Output: every attack run against a **vulnerable** seller (works) and a **secure**
seller (blocked), as a summary table.

Run the pieces individually:

```bash
npm run measure            # the opening reality-check demo (live → snapshot fallback)
npm run seller             # start the vulnerable x402 seller on :4021
npm run buyer              # an agent pays the 402 and reads the content
npm run mcp                # expose the paid endpoint as an MCP tool (stdio)

npm run attack:replay      # 1 payment → many grants   (needs a seller running)
npm run attack:cache       # freeloader pulls paid content from a CDN cache
npm run attack:settle      # content served though settlement never happened
npm run attack:deputy      # Bankr/Grok confused-deputy, self-contained
npm run attack:blowout     # agent drains its own budget; policy engine stops it

npm run seller:secure      # the same seller after hour two — re-run the attacks
```

---

## How the repo maps to the two hours

### Hour one — build (the happy path)

| File | Act |
|---|---|
| `src/measure/pull.js` | Cold open: promoted numbers vs real numbers (~100× gap) |
| `src/lib/x402.js` | The protocol: 402 challenge, `X-PAYMENT` header, facilitator verify/settle |
| `src/seller/seller.js` (`vulnerable`) | Put a seller behind a paywall — ~1 file |
| `src/buyer/agent.js` | Make the buyer an agent: hit 402 → pay → retry |
| `src/mcp/paid-tool.js` | Wrap the paid endpoint as an MCP tool for Claude / Cursor |

### Hour two — break it, then govern it

Each attack maps to one **kill-chain stage** and one **real 2026 incident**.

| Attack | Stage | Real anchor |
|---|---|---|
| `01-replay.js` | 3 · how is payment proven | arXiv 2605.11781 — 248 grants from 1 payment (best of 1,000 concurrent, testnet) |
| `02-cache-leak.js` | 3 · how is payment proven | 100% cache-leak on nginx with `proxy_cache` on + no `Cache-Control` (0% with it) |
| `03-verify-settle.js` | 3 · how is payment proven | up to 5.18% revert-grant, simulated honest case / 100% Byzantine |
| `04-confused-deputy.js` | 1 · where did the instruction come from | Bankr / Grok, 4 May 2026, ~$175K |
| `05-budget-blowout.js` | 2 · what may the agent do | JaredFromSubway, 20 Jun 2026, $7.5M |

The fixes live in:

- `src/seller/seller.js` (`secure` mode) — every `if (secure)` block is one control:
  request binding, single-use nonce store, settle-before-grant, `Cache-Control`.
- `src/policy/engine.js` — the load-bearing control: **agents propose, this
  authorizes.** Deterministic caps, velocity breaker, decoded-intent allowlist,
  reject-on-miss. `src/policy/policy.yaml` is the hand-out version.

---

## The one lesson

**Verify the decoded transaction, never the agent's stated intent —
and put a deterministic policy engine between the agent's proposal and the money.**

Every attack in this repo is an instance of forgetting one of those two things.

---

## Going real

Swap the mock for production x402 with no change to the seller logic, the attacks,
or the policy engine:

*Verified against the live spec and npm registry on 2026-08-25.*

1. **Facilitator** — replace `makeFacilitator` in `src/lib/x402.js` with HTTP calls to a
   facilitator's `/verify` and `/settle`. The env var is **`FACILITATOR_URL`** (*not*
   `X402_FACILITATOR_URL` — that name appears nowhere in the canonical repo). The public
   default in the official examples is `https://x402.org/facilitator`.
   - `/verify` and `/settle` both take `{ x402Version: 2, paymentPayload, paymentRequirements }`.
   - `/verify` returns `{ isValid, payer }` or `{ isValid: false, invalidReason, payer }`.
   - `/settle` returns `{ success, payer, transaction, network }`.
2. **Signature** — replace the Ed25519 authorization in `signPayment` with an EIP-3009
   `transferWithAuthorization` (USDC, 6 decimals) signed by the buyer wallet.
3. **Wallet** — replace `newAccount` with a real agent wallet (Coinbase AgentKit, Privy,
   Turnkey, or Crossmint). Pre-fund on **Base Sepolia**.
4. **Network** — the v2 spec uses CAIP-2 chain IDs: `eip155:84532` for Base Sepolia,
   `eip155:8453` for Base.

### The current SDK surface

Canonical repo is **`github.com/x402-foundation/x402`** (Linux Foundation, since Apr 2026);
`coinbase/x402` is now a development fork. Current npm packages — latest **2.23.0**,
published 2026-08-18 — are scoped: `@x402/core`, `@x402/express`, `@x402/evm`, `@x402/svm`,
plus `@x402/fastify`, `@x402/hono`, `@x402/next`, `@x402/fetch`, `@x402/mcp`. The old
unscoped `x402-express` and `@coinbase/x402` still exist on npm but are **not** the current
surface. Python is `x402`; Go is `github.com/x402-foundation/x402/go/v2`.

The **portable** server API is `paymentMiddleware(routes, resourceServer)`:

```ts
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const facilitatorClient = new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL });

app.use(paymentMiddleware(
  { "GET /weather": { accepts: [{ scheme: "exact", price: "$0.001",
      network: "eip155:84532", payTo: evmAddress }], description: "Weather data" } },
  new x402ResourceServer(facilitatorClient).register("eip155:84532", new ExactEvmScheme()),
));
```

`createX402Server()` **does** exist, but it belongs to the **Coinbase CDP SDK**
(`@coinbase/cdp-sdk/x402`) — it is not part of the x402 SDK and is not an Express-route
wrapper. It returns a server object you hand to `paymentMiddlewareFromHTTPServer(server)`,
defaults to the CDP facilitator, and **still requires a CDP API key on the seller side**
(`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`) despite the "no API keys"
marketing. Freemium: 1,000 on-chain transactions/month, then $0.001 each.

### ⚠️ Header names: this repo is deliberately one version behind

This lab uses **`X-PAYMENT`**. The **v2 spec (Protocol Version 2, dated 2025-12-09) does
not use that name** — it defines three headers:

| Header | Direction | Carries |
|---|---|---|
| `PAYMENT-REQUIRED` | server → client | base64 `PaymentRequired` |
| `PAYMENT-SIGNATURE` | client → server | base64 `PaymentPayload` |
| `PAYMENT-RESPONSE` | server → client | base64 `SettlementResponse` |

`X-PAYMENT` is the v1-era name. It is kept here on purpose — it is what most tutorials and
blog posts still show, so it is the name attendees will recognise — but **say this out loud
during the wire walkthrough.** It is a free teaching moment: the header was renamed between
v1 and v2, half the material online is still on the old name, and *that* is why you pin a
spec version instead of copying a snippet. None of the attacks depend on the header's name.

---

## Running the attacks against the secure seller

```bash
# terminal 1
npm run seller:secure
# terminal 2
npm run attack:replay      # → 1 grant, 5 replays rejected
npm run attack:cache       # → cache refuses to store; freeloader gets 402
```

Or just `node run-all.js`, which stands up both sellers and runs everything.

---

MIT.
