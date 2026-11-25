// Server-backed progress shared across devices in this private Sites copy.
import { lang } from './lang';

export const SAVE_KEYS = {
	bag: 'island-bag',
	garden: 'island-garden',
	fishBook: 'island-fish',
	pebbleMet: 'island-pebble',
	places: 'island-places',
	// v2: the island grew, so maps drawn of the old one no longer line up.
	map: 'island-map-v2',
	helpSeen: 'island-help-seen',
	skyChest: 'island-sky-chest',
	skyCrystals: 'island-sky-crystals',
	forge: 'island-forge',
	ore: 'island-ore',
	machines: 'island-machines',
	// The stone blocks she's built with: each column as [cell x, cell z, how many].
	blocks: 'island-blocks',
	// Windmills (where each stands) and drills (which vein, and what's in its bin).
	power: 'island-power',
	// Hollis, the owl under Cloudrest: '' (not found yet), 'met', or 'taught' (Nixchan can dash).
	owl: 'island-owl',
	// Hollis's feather, picked up at the sky gate on /experimental ('1').
	feather: 'island-feather',
	// Parmen, the tortoise on the islet: '' (not met), 'met', or 'through' (she's knocked her way out
	// through the screen, back to /experimental).
	tortoise: 'island-tortoise',
	// What Nixchan's wearing (experimental/outfit.ts), changed at the wardrobe in her house and worn
	// everywhere her figure shows up: { hoodie, hat, hatColour }.
	outfit: 'nixchan-outfit',
	// Her house: '' until she's first found it, then '1'.
	house: 'island-house',
	// The grey place through the rift (/monochrome): the colour shards she's found there, and the
	// snowflakes she's left to find her way.
	monoShards: 'monochrome-shards',
	monoMarks: 'monochrome-marks',
	monoHelpSeen: 'monochrome-help-seen',
	// Ashen ore: when each rock in the grey place was last chipped, and how much she's carrying
	// that hasn't reached the island's bag yet (it goes in when she's back through the rift).
	monoVeins: 'monochrome-veins',
	monoCarried: 'monochrome-carried',
	// Ashen lily seeds found in the ore there, likewise waiting to reach the bag.
	monoSeeds: 'monochrome-seeds',
} as const;

export type SaveKey = keyof typeof SAVE_KEYS;

// Sites is the only backing store in this copy. In-memory data is hydrated before
// constructing the world; no browser fallback or writes to the original island.
type Snapshot = Record<string, string>;
let values: Snapshot = Object.create(null);
let scope = '';
let version = 0, epoch = 0, savedEpoch = 0;
let active = false, conflict = false;
let loading: Promise<boolean> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | undefined;
let pending: { body: string; epoch: number } | undefined;
let notice: HTMLElement | undefined;
const SAVE_LIMIT = 524288;
function status(message: string, ko: string) {
	if (!notice) {
		notice = document.createElement('p');
		notice.setAttribute('role', 'status');
		notice.style.cssText = 'position:fixed;z-index:100;inset: auto max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));margin:0 auto;width:max-content;max-width:calc(100% - 32px);padding:8px 12px;background:#301b35;color:white;border-radius:12px;pointer-events:none;line-height:1.35;';
		document.body.append(notice);
	}
	notice.textContent = lang === 'ko' ? ko : message;
	notice.hidden = !message;
}
export const loadText = (key: SaveKey) => values[key] ?? null;
export function loadJSON(key: SaveKey): unknown {
	try { return JSON.parse(values[key]); } catch { return undefined; }
}
function schedule(ms: number) {
	if (timer !== undefined || conflict) return;
	timer = setTimeout(() => { timer = undefined; void flush(); }, ms);
}
export function saveText(key: SaveKey, value: string) {
	if (!active || values[key] === value) return;
	values[key] = value;
	epoch++;
	schedule(1200);
}
export const saveJSON = (key: SaveKey, value: unknown) => saveText(key, JSON.stringify(value));

function flush(keepalive = false): Promise<void> {
	if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
	if (inflight) return inflight;
	if (!active || conflict || savedEpoch === epoch) return Promise.resolve();
	if (!pending) pending = { body: JSON.stringify({ scope, version, writeId: crypto.randomUUID(), values }), epoch };
	const write = pending;
	const bytes = new TextEncoder().encode(write.body).length;
	if (bytes > SAVE_LIMIT) {
		pending = undefined;
		status('Save is too large and has not been stored.', '저장 용량을 초과해 이번 진행을 저장하지 못했어요.');
		return Promise.resolve();
	}
	if (keepalive && bytes>60000) return Promise.resolve();
	let retry = 1200;
	inflight = (async () => {
		try {
			const res = await fetch('/together-api/save', { method:'PUT', headers: { 'Content-Type':'application/json' },
				body:write.body, keepalive, signal:keepalive ? undefined : AbortSignal.timeout(7000) });
			if (res.status === 409) {
				conflict = true;
				status('The account or server save changed. This tab cannot overwrite it. Reload to continue from the server.',
					'계정 또는 서버 저장이 바뀌었어요. 이 탭은 기록을 덮어쓰지 않아요. 새로고침해 서버 기록에서 계속하세요.');
				return;
			}
			if (!res.ok) throw Error('Save unavailable');
			const next = await res.json();
			if (next.version !== version+1) throw Error('Unexpected save version');
			version = next.version;
			savedEpoch = write.epoch;
			pending = undefined;
			status('', '');
		} catch {
			retry = 5000;
			status('Not saved yet. Retrying…', '아직 저장되지 않았어요. 다시 연결하는 중…');
		}
	})().finally(() => {
		inflight = undefined;
		if (!keepalive && savedEpoch !== epoch) schedule(retry);
	});
	return inflight;
}

export function loadServerSave(): Promise<boolean> {
	return loading ??= (async () => {
		try {
			const res = await fetch('/together-api/save', { cache:'no-store', signal:AbortSignal.timeout(7000) });
			if (!res.ok) throw Error('Cannot read save');
			const data = await res.json();
			if (typeof data.scope !== 'string' || !Number.isSafeInteger(data.version) || data.version < 0 || !data.values || typeof data.values !== 'object') throw Error('Invalid save');
			for (const k of Object.keys(SAVE_KEYS)) if (typeof data.values[k] === 'string') values[k] = data.values[k];
			scope = data.scope;
			version = data.version;
			active = true;
		} catch {
			status('Could not load the server save. Reload to retry; no progress was overwritten.',
				'서버 저장을 불러오지 못했어요. 새로고침해서 다시 시도하세요. 기존 기록은 덮어쓰지 않았어요.');
			const node = document.querySelector('[data-loading]');
			if (node) node.textContent = lang === 'ko' ? '서버에 연결할 수 없어요.' : 'Could not connect to the island.';
			return false;
		}
		document.addEventListener('visibilitychange', () => { if (document.hidden) void flush(); });
		window.addEventListener('pagehide', () => { void flush(true); });
		window.addEventListener('online', () => { void flush(); });
		window.addEventListener('pageshow', e => { if (e.persisted && savedEpoch === epoch) location.reload(); });
		return true;
	})();
}

/** Finish pending writes before switching rooms in the game itself. */
export async function saveAndGo(path: string) {
	await flush();
	if (!conflict && savedEpoch !== epoch && !pending) await flush();
	if (conflict || savedEpoch !== epoch) return false;
	location.assign(path);
	return true;
}
