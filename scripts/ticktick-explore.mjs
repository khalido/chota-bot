#!/usr/bin/env node
/**
 * TickTick MCP exploration — talks to https://mcp.ticktick.com over the
 * Streamable HTTP transport with raw fetch + JSON-RPC. Lists tools, prints
 * their descriptions/schemas, and (optionally) calls a tool.
 *
 * Usage:
 *   node scripts/ticktick-explore.mjs                   # list tools
 *   node scripts/ticktick-explore.mjs call <name> [json args]
 *
 * Reads TICKTICK_API_KEY from .env (no dotenv dep — parses inline).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://mcp.ticktick.com/';
const PROTOCOL_VERSION = '2025-06-18';

await loadEnv(resolve(REPO_ROOT, '.env'));
const TOKEN = process.env.TICKTICK_API_KEY;
if (!TOKEN) {
	console.error('Set TICKTICK_API_KEY in .env');
	process.exit(1);
}

let sessionId = null;
let nextId = 1;

await initialize();
await notifyInitialized();

const [, , verb, ...rest] = process.argv;

if (verb === 'call') {
	const name = rest[0];
	if (!name) {
		console.error('usage: ... call <tool-name> [json-args]');
		process.exit(1);
	}
	const args = rest[1] ? JSON.parse(rest[1]) : {};
	const result = await mcp('tools/call', { name, arguments: args });
	console.log(JSON.stringify(result, null, 2));
} else {
	const { tools = [] } = await mcp('tools/list', {});
	console.log(`# ${tools.length} tools\n`);
	for (const t of tools) {
		console.log(`## ${t.name}`);
		if (t.description) console.log(`\n${t.description}\n`);
		if (t.inputSchema) {
			console.log('```json');
			console.log(JSON.stringify(t.inputSchema, null, 2));
			console.log('```');
		}
		console.log('');
	}
}

// ─────────────────────────────────────────────────────────────────

async function initialize() {
	const result = await mcp('initialize', {
		protocolVersion: PROTOCOL_VERSION,
		capabilities: {},
		clientInfo: { name: 'chota-explore', version: '0.1' }
	});
	if (!result?.protocolVersion) {
		throw new Error('initialize failed: ' + JSON.stringify(result));
	}
}

async function notifyInitialized() {
	// Notification = no id, no response expected.
	await fetch(ENDPOINT, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
	});
}

async function mcp(method, params) {
	const body = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
	const res = await fetch(ENDPOINT, { method: 'POST', headers: headers(), body });
	const sid = res.headers.get('mcp-session-id');
	if (sid) sessionId = sid;

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`MCP ${method} HTTP ${res.status}: ${text.slice(0, 500)}`);
	}

	const ct = res.headers.get('content-type') || '';
	const raw = ct.includes('text/event-stream') ? await parseSse(res) : await res.json();
	if (raw.error) throw new Error(`MCP ${method} error: ${JSON.stringify(raw.error)}`);
	return raw.result;
}

function headers() {
	const h = {
		'content-type': 'application/json',
		accept: 'application/json, text/event-stream',
		authorization: `Bearer ${TOKEN}`
	};
	if (sessionId) h['mcp-session-id'] = sessionId;
	return h;
}

async function parseSse(res) {
	const text = await res.text();
	// Each event is a block of `field: value` lines. We only care about `data:`.
	for (const block of text.split(/\n\n/)) {
		const dataLines = block
			.split('\n')
			.filter((l) => l.startsWith('data:'))
			.map((l) => l.slice(5).trim());
		if (!dataLines.length) continue;
		try {
			return JSON.parse(dataLines.join('\n'));
		} catch {
			// keep scanning
		}
	}
	throw new Error('no JSON data in SSE response: ' + text.slice(0, 200));
}

async function loadEnv(path) {
	let text;
	try {
		text = await readFile(path, 'utf8');
	} catch {
		return;
	}
	for (const line of text.split('\n')) {
		const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
		if (!m) continue;
		const [, k, raw] = m;
		const v = raw.replace(/^["']|["']$/g, '');
		if (!process.env[k]) process.env[k] = v;
	}
}
