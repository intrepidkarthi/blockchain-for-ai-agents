'use strict';
/**
 * A paid tool exposed over MCP — the "make the buyer an agent" act.
 *
 * This is a minimal, dependency-free MCP stdio server (newline-delimited
 * JSON-RPC 2.0). Point Claude Desktop / Cursor / Codex at it and the model can
 * call `get_market_alpha`; under the hood the tool hits a 402, pays, and
 * returns the content — the agent never sees the payment plumbing.
 *
 * Config (Claude Desktop mcpServers entry):
 *   { "command": "node", "args": ["src/mcp/paid-tool.js"],
 *     "env": { "SELLER_URL": "http://localhost:4021" } }
 *
 * For the REAL version, swap the buyer's mock signer for an agent wallet
 * (Coinbase AgentKit / a CDP wallet) — the MCP surface stays identical.
 */

const readline = require('node:readline');
const { payAndFetch } = require('../buyer/agent');
const { newAccount } = require('../lib/x402');

const SELLER_URL = process.env.SELLER_URL || 'http://localhost:4021';
const wallet = newAccount('mcp-agent-wallet');

const TOOL = {
  name: 'get_market_alpha',
  description: 'Fetch the paid market-alpha signal. Costs a sub-cent x402 micropayment, handled automatically.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

async function handle(req) {
  const { id, method, params } = req;
  switch (method) {
    case 'initialize':
      return send({ jsonrpc: '2.0', id, result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'x402-paid-tool', version: '1.0.0' },
      }});
    case 'tools/list':
      return send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
    case 'tools/call': {
      if (params?.name !== TOOL.name)
        return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown tool' } });
      try {
        const r = await payAndFetch(SELLER_URL, wallet, { bind: true });
        const text = r.status === 200
          ? `paid ✓ (status ${r.status}) → ${r.body.answer}`
          : `payment failed (status ${r.status})`;
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      } catch (e) {
        return send({ jsonrpc: '2.0', id, result: {
          content: [{ type: 'text', text: `error reaching seller at ${SELLER_URL}: ${e.message}` }],
          isError: true } });
      }
    }
    default:
      if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found' } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let req; try { req = JSON.parse(line); } catch { return; }
  handle(req);
});
