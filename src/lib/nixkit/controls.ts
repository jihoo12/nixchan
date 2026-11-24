// Keyboard, mouse and touch. Movement keys and the on-screen stick become a direction to walk; a
// drag (or a finger on the right of the screen) swings the camera round; the wheel zooms. Every
// other key is handed to the game through `route`, which decides what it means right now.
import * as THREE from 'three';
import { clamp } from './util';

/** Where the camera sits round her: which way round, how high up, how far back. */
export interface Orbit {
	yaw: number;
	pitch: number;
	distance: number;
}

export interface KeyRoute {
	/** Gets the first say on every key press, before movement: returns true if it took the key
	 * (as a conversation or an open menu does), so nothing else happens. */
	intercept(key: string, e: KeyboardEvent): boolean;
	/** A mode can handle a look drag instead of changing the third-person orbit pitch. */
	adjustLook?(dx: number, dy: number): boolean;
	/** An eye-level camera has no orbit distance to zoom. */
	blockZoom?(): boolean;
	/** Any key that isn't for moving or jumping. */
	command(key: string, e: KeyboardEvent): void;
	release(key: string): void;
	blur(): void;
}

/** A KeyRoute put together from layers, so each part of a game says what it does with keys on its
 * own instead of one function knowing them all. Interceptors are asked highest `priority` first (in
 * the order they were added where two share one) and the first to take a key has it; every
 * command handler hears every key that isn't for moving. Each `add` returns what removes it. */
export function createKeyRouter() {
	type Intercept = (key: string, e: KeyboardEvent) => boolean | void;
	let intercepts: { fn: Intercept; priority: number; n: number }[] = [];
	let added = 0;
	const commands: ((key: string, e: KeyboardEvent) => void)[] = [];
	const releases: ((key: string) => void)[] = [];
	const blurs: (() => void)[] = [];
	const looks: ((dx: number, dy: number) => boolean)[] = [];
	const zoomBlocks: (() => boolean)[] = [];
	const adder = <T>(list: T[]) => (fn: T) => {
		list.push(fn);
		return () => {
			const i = list.indexOf(fn);
			if (i >= 0) list.splice(i, 1);
		};
	};
	const route: KeyRoute = {
		intercept: (key, e) => intercepts.some(({ fn }) => fn(key, e) === true),
		adjustLook: (dx, dy) => looks.some((fn) => fn(dx, dy)),
		blockZoom: () => zoomBlocks.some((fn) => fn()),
		command: (key, e) => {
			for (const fn of [...commands]) fn(key, e);
		},
		release: (key) => {
			for (const fn of [...releases]) fn(key);
		},
		blur: () => {
			for (const fn of [...blurs]) fn();
		},
	};
	return {
		route,
		/** Gets a say on every key before movement does; returning true takes the key. */
		intercept(fn: Intercept, priority = 0) {
			const entry = { fn, priority, n: added++ };
			intercepts = [...intercepts, entry].sort((a, b) => b.priority - a.priority || a.n - b.n);
			return () => {
				intercepts = intercepts.filter((x) => x !== entry);
			};
		},
		/** Hears every key that isn't for moving or jumping (and that nothing intercepted). */
		command: adder(commands),
		/** Hears every key let go of. */
		release: adder(releases),
		/** Hears the window losing focus. */
		blur: adder(blurs),
		/** Can take a look drag (returning true) instead of the orbit's pitch changing. */
		look: adder(looks),
		/** Stops the wheel zooming while it says so. */
		blockZoom: adder(zoomBlocks),
	};
}

export type KeyRouter = ReturnType<typeof createKeyRouter>;

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];

export function createControls(
	canvas: HTMLCanvasElement,
	ui: { stick: HTMLElement | null; knob: HTMLElement | null; jump: HTMLButtonElement | null; dash?: HTMLButtonElement | null },
	orbit: Orbit,
	route: KeyRoute,
) {
	const keys = new Set<string>();
	const stick = new THREE.Vector2();
	const state = { jumpQueued: false, waveQueued: false, dashQueued: false };

	addEventListener('keydown', (e) => {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const target = e.target instanceof Element ? e.target : null;
		if (target?.closest('input, textarea, select, [contenteditable]')) return;
		const key = e.key.toLowerCase();
		if (route.intercept(key, e)) return;
		if (MOVE_KEYS.includes(key)) {
			keys.add(key);
			if (key.startsWith('arrow')) e.preventDefault();
		} else if (key === ' ') {
			if (target?.closest('a, button')) return;
			e.preventDefault();
			state.jumpQueued = true;
		} else {
			route.command(key, e);
		}
	});
	addEventListener('keyup', (e) => {
		const key = e.key.toLowerCase();
		keys.delete(key);
		route.release(key);
	});
	// Keep one thumb per control. A third finger must not steal movement/camera
	// or stop the other thumb when lifted.
	const pointers = new Map<number, { kind: 'stick' | 'look'; x: number; y: number; ox: number; oy: number }>();
	let stickOwner: number | undefined;
	let lookOwner: number | undefined;
	const resetStick = () => {
		stickOwner = undefined;
		stick.set(0, 0);
		if (ui.stick) ui.stick.hidden = true;
		if (ui.knob) ui.knob.style.transform = '';
	};
	const resetInputs = () => {
		keys.clear();
		state.jumpQueued = state.dashQueued = state.waveQueued = false;
		for (const id of pointers.keys()) {
			if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
		}
		pointers.clear();
		lookOwner = undefined;
		resetStick();
	};
	const blur = () => {
		resetInputs();
		route.blur();
	};
	addEventListener('blur', blur);
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) blur();
	});
	canvas.addEventListener('pointerdown', (e) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const rect = canvas.getBoundingClientRect();
		const kind = e.pointerType !== 'mouse' && e.clientX - rect.left < rect.width * 0.45 ? 'stick' : 'look';
		if ((kind === 'stick' ? stickOwner : lookOwner) !== undefined) return;
		canvas.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { kind, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
		if (kind === 'stick') {
			stickOwner = e.pointerId;
			if (ui.stick) {
				ui.stick.hidden = false;
				ui.stick.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
			}
		} else lookOwner = e.pointerId;
	});
	canvas.addEventListener('pointermove', (e) => {
		const p = pointers.get(e.pointerId);
		if (!p) return;
		if (p.kind === 'look') {
			const dx = e.clientX - p.x;
			const dy = e.clientY - p.y;
			if (!route.adjustLook?.(dx, dy)) {
				orbit.yaw -= dx * 0.006;
				orbit.pitch = clamp(orbit.pitch + dy * 0.004, -0.3, 1.2);
			}
		} else {
			stick.set(e.clientX - p.ox, e.clientY - p.oy);
			if (stick.length() > 60) stick.setLength(60);
			if (ui.knob) ui.knob.style.transform = `translate(${stick.x}px, ${stick.y}px)`;
			stick.divideScalar(60);
		}
		p.x = e.clientX;
		p.y = e.clientY;
	});
	const release = (e: PointerEvent) => {
		const p = pointers.get(e.pointerId);
		pointers.delete(e.pointerId);
		if (p?.kind === 'stick') resetStick();
		if (p?.kind === 'look') lookOwner = undefined;
	};
	for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
		canvas.addEventListener(event, release);
	canvas.addEventListener(
		'wheel',
		(e) => {
			e.preventDefault();
			if (route.blockZoom?.()) return;
			orbit.distance = clamp(orbit.distance * Math.exp(e.deltaY * 0.0012), 3.5, 26);
		},
		{ passive: false },
	);
	ui.jump?.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		state.jumpQueued = true;
	});
	ui.dash?.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		state.dashQueued = true;
	});

	return {
		/** Jump, wave and dash are queued by a press and taken (cleared) by whoever acts on them. */
		state,
		/** Lets go of held movement/queued actions when a menu opens over the game. */
		clearKeys: resetInputs,
		/** Which way she's asked to go, relative to the camera, and whether to run. */
		move() {
			const held = (...names: string[]) => (names.some((n) => keys.has(n)) ? 1 : 0);
			let forward = held('w', 'arrowup') - held('s', 'arrowdown');
			let right = held('d', 'arrowright') - held('a', 'arrowleft');
			let running = keys.has('shift');
			if (stick.lengthSq() > 0.01) {
				forward = -stick.y;
				right = stick.x;
				running = stick.length() > 0.85;
			}
			return { forward, right, running };
		},
	};
}

export type Controls = ReturnType<typeof createControls>;
