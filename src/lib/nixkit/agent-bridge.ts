import type { AgentMovement } from './agent-input';
export interface AgentObservation {
	position: {
		x: number;
		y: number;
		z: number;
	};
	ready: boolean;
	paused: boolean;
	nearbyAction: string | null;
	dialogue: {
		speaker: string;
		text: string;
		choices: {
			id: string;
			label: string;
		}[];
	} | null;
	clues: string[];
	navigation: {
		forward: {
			x: number;
			z: number;
		};
		right: {
			x: number;
			z: number;
		};
		landmarks: {
			label: string;
			dx: number;
			dz: number;
			distance: number;
		}[];
	};
}
export interface AgentAdapter {
	game: 'third-voice';
	observe: () => AgentObservation;
	canAct: () => boolean;
	canMove?: () => boolean;
	movement: AgentMovement;
	interact: () => boolean;
	choose: (choiceId: string) => boolean;
}
interface Command {
	id: string;
	type: 'observe' | 'move' | 'interact' | 'choose' | 'stop';
	args: Record<string, unknown>;
}
interface Ack {
	id: string;
	ok: boolean;
	error?: string;
}
/** Explicit loopback fragment plus a user click are BOTH required. No window hooks/eval. */
export function pairingSecret(url: URL): string | null {
	if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/nixchan/play/third-voice/')
		return null;
	const key = new URLSearchParams(url.hash.slice(1)).get('nixkit');
	return key && /^[A-Za-z0-9_-]{32,128}$/.test(key) ? key : null;
}
export function validateAgentCommand(value: unknown): Command {
	const c = value as Command;
	if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !['id', 'type', 'args'].includes(k)) || typeof c.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(c.id) || !['observe', 'move', 'interact', 'choose', 'stop'].includes(c.type) || !c.args || typeof c.args !== 'object' || Array.isArray(c.args))
		throw Error('Invalid command');
	const keys = c.type === 'move' ? ['forward', 'right', 'durationMs'] : c.type === 'choose' ? ['choiceId'] : [];
	if (Object.keys(c.args).some(k => !keys.includes(k)))
		throw Error('Unexpected command argument');
	if (c.type === 'choose' && (typeof c.args.choiceId !== 'string' || !c.args.choiceId || c.args.choiceId.length > 128))
		throw Error('Invalid visible choice');
	return c;
}
export function attachAgentBridge(api: AgentAdapter) {
	const url = new URL(location.href), secret = pairingSecret(url);
	if (!secret)
		return { stop: () => { }, dispose: () => { } };
	const fragment = new URLSearchParams(url.hash.slice(1));
	fragment.delete('nixkit');
	url.hash = fragment.toString();
	history.replaceState(history.state, '', url);
	const panel = document.createElement('div'), label = document.createElement('span'), button = document.createElement('button');
	panel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:100000;background:#172333;color:white;padding:12px;border:2px solid #78d6b1;border-radius:10px;max-width:320px;font:14px system-ui';
	label.textContent = 'Local AI control is OFF. ';
	button.textContent = 'Enable local AI control';
	button.type = 'button';
	panel.append(label, button);
	document.body.append(panel);
	let token: string | null = null, active = false, generation = 0, disposed = false;
	const receipts = new Map<string, Ack>();
	const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
	async function post(path: string, body: object, keepalive = false) { const r = await fetch('/__nixkit/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(4000), cache: 'no-store', keepalive }); if (!r.ok)
		throw Error('Local connection rejected'); return r.json(); }
	function stop(reason = 'Stopped locally') {
		generation++;
		active = false;
		api.movement.release();
		const old = token;
		token = null;
		label.textContent = reason + '. ';
		button.textContent = 'Enable local AI control';
		button.disabled = false;
		if (old)
			void post('stop', { token: old }, true).catch(() => { });
	}
	async function execute(raw: unknown, turn: number): Promise<Ack> {
		const c = validateAgentCommand(raw), previous = receipts.get(c.id);
		if (previous)
			return previous;
		let ack: Ack = { id: c.id, ok: true };
		try {
			if (c.type === 'stop') {
				stop('Stopped by agent');
				return ack;
			}
			if (c.type !== 'observe' && (!active || turn !== generation || !api.canAct() || document.hidden))
				throw Error('Game cannot act now');
			if (c.type === 'move') {
				if (api.observe().dialogue !== null || api.canMove?.() === false)
					throw Error('Movement blocked by dialogue or modal');
				api.movement.begin(c.args);
				const until = performance.now() + Number(c.args.durationMs);
				try {
					while (performance.now() < until) {
						if (!active || turn !== generation || document.hidden || !api.canAct() || api.canMove?.() === false || api.observe().dialogue !== null)
							throw Error('Movement interrupted');
						await delay(Math.min(20, Math.max(1, until - performance.now())));
					}
				}
				finally {
					api.movement.release();
				}
			}
			else if (c.type === 'interact') {
				if (!api.interact())
					throw Error('No visible nearby action');
			}
			else if (c.type === 'choose') {
				if (!api.choose(c.args.choiceId as string))
					throw Error('Choice is not currently visible');
			}
		}
		catch (e) {
			ack = { id: c.id, ok: false, error: e instanceof Error ? e.message : 'Action failed' };
		}
		receipts.set(c.id, ack);
		if (receipts.size > 128)
			throw Error('Session command limit; pair again');
		return ack;
	}
	async function poll(turn: number) {
		let ack: Ack | undefined;
		try {
			while (active && turn === generation && token) {
				const current = token;
				const response = await post('poll', { token: current, snapshot: { ...api.observe(), game: api.game }, ...(ack ? { ack } : {}) });
				if (!active || turn !== generation || current !== token)
					return;
				if (response.stopped) {
					stop('Disconnected');
					return;
				}
				ack = undefined;
				if (response.command)
					ack = await execute(response.command, turn);
				await delay(150);
			}
		}
		catch {
			if (turn === generation)
				stop('Connection lost; input released');
		}
	}
	const click = async () => {
		if (active) {
			stop();
			return;
		}
		if (disposed || document.hidden)
			return;
		button.disabled = true;
		const turn = ++generation;
		label.textContent = 'Pairing with local MCP… ';
		try {
			const paired = await post('pair', { secret, game: api.game });
			if (typeof paired.token !== 'string' || paired.token.length < 16 || paired.token.length > 256)
				throw Error('Invalid pairing');
			if (turn !== generation || disposed) {
				void post('stop', { token: paired.token }, true).catch(() => { });
				return;
			}
			token = paired.token;
			receipts.clear();
			active = true;
			button.disabled = false;
			button.textContent = 'STOP local AI control';
			label.textContent = 'PAIRED · local AI may walk and interact. ';
			void poll(turn);
		}
		catch {
			if (turn === generation)
				stop('Pairing failed');
		}
	};
	button.addEventListener('click', click);
	const hidden = () => { if (document.hidden)
		stop('Tab hidden; input released'); };
	const pagehide = () => stop('Page closed');
	const localKey = (e: KeyboardEvent) => { if (active && e.isTrusted)
		stop('Keyboard takeover'); };
	const localPointer = (e: PointerEvent) => { if (active && e.isTrusted && !panel.contains(e.target as Node))
		stop('Pointer takeover'); };
	document.addEventListener('visibilitychange', hidden);
	addEventListener('pagehide', pagehide);
	addEventListener('keydown', localKey, true);
	addEventListener('pointerdown', localPointer, true);
	return { stop, dispose() { disposed = true; stop(); panel.remove(); document.removeEventListener('visibilitychange', hidden); removeEventListener('pagehide', pagehide); removeEventListener('keydown', localKey, true); removeEventListener('pointerdown', localPointer, true); } };
}
