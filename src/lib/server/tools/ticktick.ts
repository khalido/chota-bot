/**
 * TickTick MCP wrapper. Talks to the official hosted MCP at
 * https://mcp.ticktick.com over Streamable HTTP transport — raw fetch +
 * JSON-RPC, no SDK.
 *
 * Setup:
 *   1. TickTick app → Account → MCP → generate API key → paste into .env as
 *      TICKTICK_API_KEY.
 *   2. Set ticktick.filter (or groupId) in chota.config.ts so we only ever
 *      surface family-shared lists, not your private ones.
 *
 * The bot only sees lists matching that filter — your private GTD lists,
 * shopping for-yourself notes, etc. stay invisible.
 */
import { TICKTICK_API_KEY } from '$env/static/private';
import { getConfig } from '$lib/server/config';
import { log, logErr } from '$lib/server/log';
import { sydneyTimeOnDay } from '$lib/time';

const ENDPOINT = 'https://mcp.ticktick.com/';
const PROTOCOL_VERSION = '2025-06-18';

// ────────────────────────────────────────────────────────────────────────────
// Types — matched to actual MCP responses (see scripts/ticktick-explore.mjs)
// ────────────────────────────────────────────────────────────────────────────

export interface Project {
	id: string;
	name: string;
	color: string | null;
	sortOrder: number | null;
	closed: boolean | null;
	groupId: string | null;
	viewMode: string;
	permission: string | null;
	kind: string;
}

export interface Task {
	id: string;
	projectId: string;
	title: string;
	content?: string;
	status: number; // 0 = open, 2 = complete
	priority: number; // 0 none / 1 low / 3 med / 5 high
	dueDate?: string;
	startDate?: string;
	isAllDay?: boolean;
	tags?: string[];
	items?: { id: string; title: string; status: number }[];
}

export interface ProjectWithTasks {
	project: Project;
	tasks: Task[];
	/**
	 * Recently ticked-off tasks (completed within the last `DONE_LOOKBACK_DAYS`
	 * days), newest first. Populated by `getFamilyLists`; `getProjectWithTasks`
	 * and `getList` leave it undefined.
	 */
	done?: CompletedTask[];
	columns: unknown[];
}

/** A ticked-off task — the `done` items that ride alongside a list. */
export interface CompletedTask {
	id: string;
	title: string;
	/** When it was ticked off. */
	completedAt: Date;
}

/** A row from the `list_completed_tasks_by_date` MCP tool (only the fields we use). */
interface RawCompletedTask {
	id: string;
	projectId: string;
	title: string;
	completedTime?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// In-memory cache. Avoids hammering MCP on every page render. 60s fresh; on
// upstream failure we fall back to up to 1h-stale data rather than showing
// nothing — TickTick's hosted MCP times out fairly often, and a slightly-old
// shopping list beats an empty card. `ticktick-refresh` job warms it.
// ────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;
const STALE_OK_MS = 60 * 60_000;
const projectsCache: { data: Project[]; at: number } = { data: [], at: 0 };
const projectDataCache = new Map<string, { data: ProjectWithTasks; at: number }>();
// One batched entry: completed tasks across all configured projects, grouped by projectId.
const completedCache: { data: Map<string, CompletedTask[]>; at: number } = { data: new Map(), at: 0 };

function fresh<T>(entry: { data: T; at: number } | undefined): T | null {
	if (!entry || entry.at === 0 || Date.now() - entry.at > CACHE_TTL_MS) return null;
	return entry.data;
}

function staleOk<T>(entry: { data: T; at: number } | undefined): T | null {
	if (!entry || entry.at === 0 || Date.now() - entry.at > STALE_OK_MS) return null;
	return entry.data;
}


// ────────────────────────────────────────────────────────────────────────────
// Public — high-level helpers used by routes/components
// ────────────────────────────────────────────────────────────────────────────

/**
 * One-shot fetch: every configured list with its undone `tasks` and its
 * recently-`done` items. Cached. Use this from page-server-load functions
 * instead of N separate calls.
 */
export async function getFamilyLists(): Promise<ProjectWithTasks[]> {
	const projects = await listFamilyProjects();
	const [withTasks, doneByProject] = await Promise.all([
		Promise.all(projects.map((p) => getProjectWithTasks(p.id))),
		getCompletedByProject(projects.map((p) => p.id))
	]);
	return withTasks.map((pw) => ({ ...pw, done: doneByProject.get(pw.project.id) ?? [] }));
}

/** Force-refresh. Job calls this. */
export async function refreshFamilyLists(): Promise<ProjectWithTasks[]> {
	projectsCache.at = 0;
	projectDataCache.clear();
	completedCache.at = 0;
	return getFamilyLists();
}

/**
 * How far back a list's `done` items reach, in days. `1` = today + yesterday.
 * Bump to 2/3 if the family wants a longer "recently ticked off" tail.
 */
const DONE_LOOKBACK_DAYS = 1;

/**
 * Completed tasks for `projectIds`, grouped by project, newest-completed first
 * — from `DONE_LOOKBACK_DAYS` days ago (Sydney midnight) to now. One batched
 * MCP call for every list. Cached 60s (1h stale-ok). `done` is a nice-to-have,
 * so a failure with no stale degrades to an empty map — it never sinks the
 * list fetch.
 */
async function getCompletedByProject(projectIds: string[]): Promise<Map<string, CompletedTask[]>> {
	if (projectIds.length === 0) return new Map();
	const cachedHit = fresh(completedCache);
	if (cachedHit) return cachedHit;

	const end = new Date();
	const start = sydneyTimeOnDay('00:00', new Date(end.getTime() - DONE_LOOKBACK_DAYS * 86_400_000));
	try {
		const raw = await callTool<RawCompletedTask[]>(
			'list_completed_tasks_by_date',
			{ search: { projectIds, startDate: start.toISOString(), endDate: end.toISOString() } },
			{ fromContent: true }
		);
		const byProject = new Map<string, CompletedTask[]>();
		for (const t of raw) {
			if (!t.completedTime) continue;
			const task = { id: t.id, title: t.title, completedAt: new Date(t.completedTime) };
			byProject.set(t.projectId, [...(byProject.get(t.projectId) ?? []), task]);
		}
		for (const tasks of byProject.values()) {
			tasks.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
		}
		completedCache.data = byProject;
		completedCache.at = Date.now();
		return byProject;
	} catch (err) {
		const stale = staleOk(completedCache);
		if (stale) {
			log('ticktick', `list_completed_tasks_by_date failed (${errText(err)}) — serving stale`);
			return stale;
		}
		log('ticktick', `list_completed_tasks_by_date failed (${errText(err)}) — no done items this round`);
		return new Map();
	}
}

/**
 * Lists visible to the bot — those mapped in `chota.config.ts >
 * ticktick.lists`. Order matches the config insertion order. Returns the
 * configured lists that were actually found in TickTick; missing ones are
 * dropped silently (use `listConfiguredVsActual()` to debug).
 */
export async function listFamilyProjects(): Promise<Project[]> {
	const cfg = listsConfig();
	if (Object.keys(cfg).length === 0) {
		log('ticktick', 'no lists in chota.config.ts > ticktick.lists — returning []');
		return [];
	}
	const byName = await projectsByCleanName();
	return Object.values(cfg)
		.map((external) => byName.get(matchKey(external)))
		.filter((p): p is Project => p !== undefined);
}

/**
 * Diagnostic for /admin: returns each configured mapping plus whether the
 * external list was found in TickTick.
 */
export async function listConfiguredVsActual(): Promise<
	{ internal: string; external: string; project: Project | null }[]
> {
	const cfg = listsConfig();
	const byName = await projectsByCleanName();
	return Object.entries(cfg).map(([internal, external]) => ({
		internal,
		external,
		project: byName.get(matchKey(external)) ?? null
	}));
}

/**
 * Look up a list by its stable internal name (e.g. 'shopping') and return
 * the project + its undone tasks. Returns null if the internal name isn't
 * configured OR the configured external name isn't found in TickTick.
 *
 *   getList('shopping')  → "Shopping"
 *   getList('watch')     → "Watch"
 */
export async function getList(internalName: string): Promise<ProjectWithTasks | null> {
	const cfg = listsConfig();
	const external = cfg[internalName];
	if (!external) {
		log('ticktick', `getList("${internalName}"): no mapping in config`);
		return null;
	}
	const project = (await projectsByCleanName()).get(matchKey(external));
	if (!project) {
		log('ticktick', `getList("${internalName}"): "${external}" not found in TickTick`);
		return null;
	}
	return getProjectWithTasks(project.id);
}

/**
 * Index of projects by a "match key" — the name with any leading emoji/symbols
 * stripped, lowercased. TickTick glues the list's emoji icon onto the name
 * (e.g. "🛒Shopping"), so a plain `name === "Shopping"` compare misses; this
 * lets `chota.config.ts` keep clean names like `shopping: 'Shopping'`.
 */
async function projectsByCleanName(): Promise<Map<string, Project>> {
	const all = await listProjects();
	return new Map(all.map((p) => [matchKey(p.name), p]));
}

/** Strip a leading emoji/symbol prefix TickTick glues onto list names ("🛒Shopping" → "Shopping"). */
export function cleanListName(name: string): string {
	return name.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function matchKey(name: string): string {
	return cleanListName(name).toLowerCase();
}

/** Add a task to a configured list, addressed by internal name. */
export async function addToList(
	internalName: string,
	title: string,
	extras: { content?: string; priority?: 0 | 1 | 3 | 5; dueDate?: string } = {}
): Promise<Task> {
	const list = await getList(internalName);
	if (!list) throw new Error(`Cannot add to "${internalName}" — no such configured list`);
	return callTool<Task>('create_task', { project_id: list.project.id, title, ...extras });
}

function listsConfig(): Record<string, string> {
	return getConfig().ticktick?.lists ?? {};
}

// ────────────────────────────────────────────────────────────────────────────
// Public — thin wrappers around individual MCP tools
// ────────────────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
	const cached = fresh(projectsCache);
	if (cached) return cached;
	try {
		const r = await callTool<{ result: Project[] }>('list_projects', {});
		const data = r.result ?? [];
		projectsCache.data = data;
		projectsCache.at = Date.now();
		return data;
	} catch (err) {
		const stale = staleOk(projectsCache);
		if (stale) {
			log('ticktick', `list_projects failed (${errText(err)}) — serving stale cache`);
			return stale;
		}
		throw err;
	}
}

export async function getProjectWithTasks(projectId: string): Promise<ProjectWithTasks> {
	const cached = fresh(projectDataCache.get(projectId));
	if (cached) return cached;
	try {
		const data = await callTool<ProjectWithTasks>('get_project_with_undone_tasks', {
			project_id: projectId
		});
		projectDataCache.set(projectId, { data, at: Date.now() });
		return data;
	} catch (err) {
		const stale = staleOk(projectDataCache.get(projectId));
		if (stale) {
			log('ticktick', `get_project_with_undone_tasks(${projectId}) failed (${errText(err)}) — serving stale cache`);
			return stale;
		}
		throw err;
	}
}

export async function completeTask(projectId: string, taskId: string): Promise<unknown> {
	return callTool('complete_task', { project_id: projectId, task_id: taskId });
}

/**
 * Health probe — does an uncached `list_projects` round-trip and reports
 * timing + outcome. Use it from /admin (or a script) to spot-check how the
 * hosted MCP is behaving. Never throws.
 */
export async function pingTickTick(): Promise<{
	ok: boolean;
	ms: number;
	projects?: number;
	names?: string[];
	error?: string;
}> {
	const start = Date.now();
	try {
		const r = await callTool<{ result: Project[] }>('list_projects', {});
		const names = (r.result ?? []).map((p) => p.name);
		return { ok: true, ms: Date.now() - start, projects: names.length, names };
	} catch (err) {
		return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
	}
}

// ────────────────────────────────────────────────────────────────────────────
// MCP transport — Streamable HTTP, raw fetch + JSON-RPC.
// Sessions: one per process; re-init if the server forgets us.
// ────────────────────────────────────────────────────────────────────────────

let sessionId: string | null = null;
let initPromise: Promise<void> | null = null;
let nextId = 1;

async function ensureInitialized(): Promise<void> {
	if (sessionId) return;
	if (!initPromise) initPromise = doInitialize();
	return initPromise;
}

async function doInitialize() {
	if (!TICKTICK_API_KEY) {
		throw new Error('Set TICKTICK_API_KEY in .env (TickTick app → Account → MCP).');
	}
	const result = await rawCall('initialize', {
		protocolVersion: PROTOCOL_VERSION,
		capabilities: {},
		clientInfo: { name: 'chota', version: '0.1' }
	});
	if (!(result as { protocolVersion?: string })?.protocolVersion) {
		throw new Error('TickTick MCP initialize failed');
	}
	// Notification — fire-and-forget, no response expected.
	await fetch(ENDPOINT, {
		method: 'POST',
		headers: requestHeaders(),
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
	}).catch((err) => logErr('ticktick', 'initialized notification failed:', err));
	log('ticktick', 'session ready');
}

async function callTool<T = unknown>(
	name: string,
	args: Record<string, unknown> = {},
	opts: { fromContent?: boolean } = {}
): Promise<T> {
	await ensureInitialized();
	try {
		return await invokeTool<T>(name, args, opts.fromContent ?? false);
	} catch (err) {
		// If session expired, reset and retry once.
		if (isSessionError(err)) {
			log('ticktick', 'session expired, reinitializing');
			sessionId = null;
			initPromise = null;
			await ensureInitialized();
			return invokeTool<T>(name, args, opts.fromContent ?? false);
		}
		throw err;
	}
}

async function invokeTool<T>(
	name: string,
	args: Record<string, unknown>,
	fromContent: boolean
): Promise<T> {
	const result = (await rawCall('tools/call', { name, arguments: args })) as {
		structuredContent?: T;
		content?: { type: string; text: string }[];
		isError?: boolean;
	};
	if (result.isError) {
		const text = result.content?.[0]?.text ?? '(no detail)';
		throw new Error(`TickTick tool ${name} error: ${text}`);
	}
	// Most tools answer in `structuredContent`; a few (e.g. the completed-tasks
	// search) instead return one JSON object per `content` text block.
	if (fromContent) {
		return (result.content ?? [])
			.filter((c) => c.type === 'text')
			.map((c) => JSON.parse(c.text)) as T;
	}
	return result.structuredContent as T;
}

const REQUEST_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 500;

async function rawCall(method: string, params: unknown): Promise<unknown> {
	const body = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });

	const attempt = async (): Promise<unknown> => {
		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: requestHeaders(),
			body,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});

		const sid = res.headers.get('mcp-session-id');
		if (sid) sessionId = sid;

		if (!res.ok) {
			const text = await res.text().catch(() => '');
			const err = new Error(`TickTick MCP ${method} HTTP ${res.status}: ${text.slice(0, 300)}`);
			(err as { retryable?: boolean }).retryable = res.status >= 500;
			throw err;
		}

		const ct = res.headers.get('content-type') || '';
		const envelope = ct.includes('text/event-stream') ? await parseSse(res) : await res.json();
		if (envelope.error) {
			const e = envelope.error as { message?: string; code?: number };
			throw new Error(`TickTick MCP ${method} error ${e.code}: ${e.message}`);
		}
		return envelope.result;
	};

	// One cheap retry — the hosted MCP throws transient `fetch failed` /
	// timeouts fairly often. Protocol errors (JSON-RPC error, 4xx) don't retry.
	try {
		return await attempt();
	} catch (err) {
		if (!isTransient(err)) throw err;
		log('ticktick', `${method} transient failure (${errText(err)}) — retrying once`);
		await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
		return attempt();
	}
}

function errText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function isTransient(err: unknown): boolean {
	if ((err as { retryable?: boolean })?.retryable) return true;
	const m = errText(err).toLowerCase();
	return /fetch failed|aborted|timeout|timed ?out|econnreset|socket hang|network|enotfound|eai_again/.test(m);
}

function requestHeaders(): Record<string, string> {
	const h: Record<string, string> = {
		'content-type': 'application/json',
		accept: 'application/json, text/event-stream',
		authorization: `Bearer ${TICKTICK_API_KEY}`
	};
	if (sessionId) h['mcp-session-id'] = sessionId;
	return h;
}

async function parseSse(res: Response): Promise<{ result?: unknown; error?: unknown }> {
	const text = await res.text();
	for (const block of text.split(/\n\n/)) {
		const data = block
			.split('\n')
			.filter((l) => l.startsWith('data:'))
			.map((l) => l.slice(5).trim())
			.join('\n');
		if (!data) continue;
		try {
			return JSON.parse(data);
		} catch {
			continue;
		}
	}
	throw new Error(`No JSON in SSE response: ${text.slice(0, 200)}`);
}

function isSessionError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /session/i.test(msg) && (/not.?found/i.test(msg) || /expired/i.test(msg));
}
