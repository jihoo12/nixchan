// Nixkit's engine: the part of a game that isn't the game. It owns the renderer, the scene and the
// camera, keeps them the size of the window, and runs the frame: every frame it asks each system
// (anything with an `update`) to do its bit, in order, then draws.
//
//   const engine = createEngine({ canvas, renderer: (canvas) => new WebGPURenderer({ canvas }) });
//   engine.add({ order: ORDER.world, update(dt, time) { ... } });
//   engine.onUpdate((dt, time) => { ... });          // the game's own rules (ORDER.game)
//   engine.start();
//
// Systems run lowest `order` first, and in the order they were added where two share one, so
// whoever puts a game together decides once what happens before what, rather than writing the
// whole frame out by hand. While the engine is paused, or waiting for something to load
// (`waitFor`), time stands still and only the systems marked `always` run: the camera, the light,
// whatever has to keep moving while the game itself doesn't.
//
// createGame (nixkit/game.ts) is an engine with Nixchan, a sky, a world of parts and a HUD put in
// it. A bigger game can put its own together from the same pieces.
import * as THREE from 'three';

/** Where in the frame a system runs, lowest first. Anything in between is fine too. */
export const ORDER = {
	/** Before anything moves: reading what's been asked for this frame. */
	input: 0,
	/** The world moves: platforms, belts, water. */
	world: 100,
	/** Nixchan moves through it. */
	player: 200,
	/** What she's touching now that she's moved. */
	contact: 250,
	/** The game's own rules (onUpdate). */
	game: 300,
	/** What follows from the rules: faces, effects. */
	effects: 350,
	/** The camera follows her. */
	camera: 400,
	/** The light follows the camera, and anything that has to know where the camera ended up. */
	light: 450,
	/** The HUD, last, once everything it shows has settled. */
	hud: 480,
} as const;

/** Something that takes part in the frame. Every field is optional. */
export interface System {
	/** When in the frame it runs (ORDER), lowest first; ORDER.game without it. */
	order?: number;
	/** Whether it runs even while the engine is paused or still loading (with time stood still). */
	always?: boolean;
	update?(dt: number, time: number): void;
	/** The window changed size (and once at the start). */
	resize?(width: number, height: number): void;
	/** The engine is being taken down. */
	dispose?(): void;
}

/** What the engine needs of a renderer: three's WebGPURenderer and WebGLRenderer both are one. */
export interface Drawer {
	setPixelRatio(ratio: number): void;
	setSize(width: number, height: number, updateStyle?: boolean): void;
	setAnimationLoop(loop: ((time: number) => void) | null): unknown;
	render(scene: THREE.Object3D, camera: THREE.Camera): unknown;
	shadowMap: { enabled: boolean; type: THREE.ShadowMapType | null };
	/** Settles once it can draw (WebGPU waits for the browser to hand over a device). */
	init?(): Promise<unknown>;
	dispose?(): void;
}

export interface EngineOptions<R extends Drawer> {
	canvas: HTMLCanvasElement;
	/** Makes the renderer. Throwing means there's nothing to draw with. */
	renderer: (canvas: HTMLCanvasElement) => R;
	/** The camera's field of view, and its near and far planes. */
	camera?: { fov?: number; near?: number; far?: number };
	/** The most pixels per CSS pixel it draws (1.75 without it: sharp enough, and not too slow). */
	maxPixelRatio?: number;
	/** Whether things cast shadows (yes, unless told otherwise). */
	shadows?: boolean;
	/** The longest a frame is allowed to be, in seconds, so a pause in the browser isn't a leap. */
	maxStep?: number;
	/** There's nothing to draw with (no WebGPU or WebGL 2, or it failed to start). */
	onFail?: () => void;
}

export function createEngine<R extends Drawer>(opts: EngineOptions<R>) {
	const { canvas } = opts;
	let renderer: R;
	const cannotDraw = () => {
		document.documentElement.classList.add('no-3d');
		opts.onFail?.();
	};
	try {
		renderer = opts.renderer(canvas);
	} catch {
		cannotDraw();
		return null;
	}
	const drawing: Promise<boolean> = (renderer.init?.() ?? Promise.resolve()).then(
		() => true,
		() => {
			cannotDraw();
			return false;
		},
	);
	const view = typeof window === 'undefined' ? null : window;
	renderer.setPixelRatio(Math.min(view?.devicePixelRatio ?? 1, opts.maxPixelRatio ?? 1.75));
	if (opts.shadows !== false) {
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFShadowMap;
	}

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(opts.camera?.fov ?? 45, 1, opts.camera?.near ?? 0.3, opts.camera?.far ?? 1200);
	const maxStep = opts.maxStep ?? 0.05;

	// Kept sorted by order; a system added mid-frame joins from the next one.
	let systems: { s: System; order: number; n: number }[] = [];
	let added = 0;
	const add = (s: System) => {
		const entry = { s, order: s.order ?? ORDER.game, n: added++ };
		systems = [...systems, entry].sort((a, b) => a.order - b.order || a.n - b.n);
		if (started) s.resize?.(size.width, size.height);
		return () => {
			systems = systems.filter((e) => e !== entry);
		};
	};

	let draw = () => {
		renderer.render(scene, camera);
	};
	let time = 0;
	let paused = false;
	let waiting = 0;
	let started = false;
	let stopped = false;
	const size = { width: 0, height: 0 };

	const resize = () => {
		size.width = view?.innerWidth ?? 1;
		size.height = view?.innerHeight ?? 1;
		renderer.setSize(size.width, size.height, false);
		camera.aspect = size.width / size.height;
		camera.updateProjectionMatrix();
		for (const { s } of systems) s.resize?.(size.width, size.height);
	};

	/** One frame, `dt` seconds long. */
	const step = (dt: number) => {
		dt = Math.min(maxStep, Math.max(0, dt));
		const running = !paused && waiting === 0;
		if (running) time += dt;
		for (const { s } of systems) if (running || s.always) s.update?.(dt, time);
		draw();
	};

	return {
		renderer,
		scene,
		camera,
		/** Settles with whether it can draw at all. */
		drawing,
		/** The game's time, in seconds: it stands still while paused or loading. */
		get time() {
			return time;
		},
		/** The window's size, as last seen. */
		size: size as Readonly<typeof size>,
		/** Stops (or starts again) everything that isn't `always`, and time with it. */
		get paused() {
			return paused;
		},
		set paused(p: boolean) {
			paused = p;
		},
		/** Whether the game is running: not paused, and nothing it's waiting for still loading. */
		get running() {
			return !paused && waiting === 0;
		},
		/** Holds the game (as `paused` does) until this settles, either way. */
		waitFor(p: Promise<unknown>) {
			waiting++;
			const done = () => {
				waiting--;
			};
			p.then(done, done);
			return p;
		},
		/** Puts a system in the frame. Returns what takes it out again. */
		add,
		/** Something for the game to do every frame, after she's moved (or at `order`). */
		onUpdate(fn: (dt: number, time: number) => void, order: number = ORDER.game) {
			return add({ order, update: fn });
		},
		/** How each frame is drawn (renderer.render(scene, camera) unless changed), for a game that
		 * draws in more than one go or hides something while it does. */
		setDraw(fn: () => void) {
			draw = fn;
		},
		/** Runs one frame by hand, `dt` seconds long (as the loop does): for tests, and for stepping
		 * through a moment in development. */
		step,
		/** Sizes everything to the window, and starts the loop once it can draw. */
		async start() {
			if (started) return;
			started = true;
			resize();
			view?.addEventListener('resize', resize);
			if (!(await drawing) || stopped) return;
			let last = performance.now();
			renderer.setAnimationLoop((now) => {
				const dt = (now - last) / 1000;
				last = now;
				step(dt);
			});
		},
		/** Stops the loop and takes everything down. */
		dispose() {
			stopped = true;
			renderer.setAnimationLoop(null);
			view?.removeEventListener('resize', resize);
			for (const { s } of systems) s.dispose?.();
			systems = [];
			renderer.dispose?.();
		},
	};
}

export type Engine<R extends Drawer = Drawer> = NonNullable<ReturnType<typeof createEngine<R>>>;
