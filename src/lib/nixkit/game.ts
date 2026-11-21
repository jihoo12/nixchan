// Nixkit: a little kit for making games with Nixchan in them. `createGame` sets up everything a game
// has in common (the renderer and the light, Nixchan herself and how she's steered, the camera
// that follows her, the touch controls and the HUD), and a world of parts for her to run about on.
// The game itself is what it adds: parts, pickups, and whatever it wants to do each frame.
//
//   const game = createGame({ canvas, modelUrl, spawn: { pos: new THREE.Vector3(0, 0.5, 0), heading: 0 } });
//   game.parts.add({ at: [0, 0, 0], size: [10, 1, 10] });
//   game.parts.add({ at: [0, 1, 9], size: [3, 1, 3], move: { by: [5, 0, 0], period: 3 } });
//   game.onUpdate((dt, time) => { ... });
//   game.start();
//
// It's put together from Nixkit's pieces: an engine (engine.ts) that runs the frame, a sky and light
// (environment.ts), a world of parts (parts.ts), the HUD (hud.ts), and Nixchan herself (nixchan.ts).
// A game that needs something these don't do can add a system of its own to `game.engine`, or put
// its own together from the same pieces, with a world of its own (as the island's terrain is, island/features.ts).
//
// It draws with three's WebGPURenderer: WebGPU where the browser has it, WebGL 2 where it doesn't.
// So a game's own shaders are written in TSL (three/tsl), not GLSL: a ShaderMaterial or
// onBeforeCompile doesn't draw here (CONTRIBUTING.md).
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { nodeLook } from './figure-nodes';
import { createEngine, ORDER } from './engine';
import { createSkyLight } from './environment';
import { createHud } from './hud';
import type { EmoteMenu } from './emotions';
import { makeToon } from './look';
import { createNixchan, type BodyAction, type FirstPersonOptions } from './nixchan';
import { createParts, type Parts } from './parts';
import { createChairs, type ChairOptions } from './chairs';
import type { World } from './world';
import type { NixClip } from '../experimental/nix-figure';

export type { NixClip, BodyAction, ChairOptions };

export interface GameOptions {
	canvas: HTMLCanvasElement;
	/** Nixchan's model (assets/nixchan/nixchan-3d.glb). */
	modelUrl: string;
	/** Where she starts, and which way she faces (0 is towards +z). */
	spawn: { pos: THREE.Vector3; heading: number };
	/** A world of its own; without one, she's in the game's world of parts. Given as a function,
	 * it's handed the parts to put in it too (`(parts) => combineWorlds(chunks.world, parts.world)`). */
	world?: World | ((parts: Parts) => World);
	/** Whether she can open her glider (she can't, by default: in a world of parts it's cheating). */
	canGlide?: () => boolean;
	/** Whether she can dash. */
	canDash?: () => boolean;
	/** Whether she has something in her arms: she walks with it held out. */
	carrying?: () => boolean;
	/** Opt in to an eye-level view (V / HUD button). Third person remains the default. */
	firstPerson?: FirstPersonOptions;
	/** Opt in to a player reaction menu (B / HUD). Scripted reactions work without it. */
	emotes?: EmoteMenu;
	/** Something for her to be doing instead of walking about (a clip: 'Shot', 'Slam', 'Summon',
	 * 'Dash', 'Cast', 'Wave' …), asked every frame; null for her own. */
	clip?: () => NixClip | null;
	/** Keeps her on the spot, facing the angle it gives (null: she's free to move). Told whether
	 * she's trying to move, which may be enough to let her go. */
	hold?: (tryingToMove: boolean) => number | null;
	/** Keys that aren't for moving or jumping (lower case), for the game to use. */
	onKey?: (key: string, e: KeyboardEvent) => void;
	/** A game's own primary action (e.g. train doors). True consumes E or the action button. */
	onInteract?: () => boolean;
	chairs?: {
		/** Don't offer a new seat while another activity owns the player. */
		available?: () => boolean;
		/** Use the game's existing prompt instead of Nixkit's button. */
		prompt?: 'custom';
	};
	/** Called when Nixchan can't be loaded (neither WebGPU nor WebGL 2, or the model didn't come). */
	onFail?: (why: 'webgl' | 'model') => void;
}

export function createGame(opts: GameOptions) {
	const built = createEngine({
		canvas: opts.canvas,
		// ?webgl on the URL draws with WebGL 2 even where there's WebGPU, to see what that looks like.
		renderer: (canvas) => new WebGPURenderer({ canvas, antialias: true, forceWebGL: new URLSearchParams(location.search).has('webgl') }),
		onFail: () => opts.onFail?.('webgl'),
	});
	if (!built) return null;
	const engine = built;
	const { renderer, scene, camera } = engine;
	const toon = makeToon();
	const hud = createHud();

	// The world: parts, unless the game brings its own. They move before she does, and what she's
	// touching is worked out once she has.
	const parts = createParts(scene, toon);
	const world = typeof opts.world === 'function' ? opts.world(parts) : opts.world ?? parts.world;
	const chairs = createChairs({ world, player: () => player, available: opts.chairs?.available });
	const characterWorld: World = {
		...world,
		collide(p, r, v) {
			if (!chairs.seated) world.collide?.(p, r, v);
		},
	};
	function interact() {
		if (!nix.ready || engine.paused) return false;
		if (chairs.seated) return chairs.interact();
		return !!opts.onInteract?.() || chairs.interact();
	}
	function chairAction() {
		return nix.ready && !engine.paused ? chairs.action() : null;
	}
	const firstPerson = opts.firstPerson;
	parts.setSpawn(opts.spawn.pos, opts.spawn.heading);
	engine.add({ order: ORDER.world, update: (dt, time) => parts.move(dt, time) });

	const nix = createNixchan(engine, {
		canvas: opts.canvas,
		modelUrl: opts.modelUrl,
		spawn: opts.spawn,
		world: characterWorld,
		toon,
		look: nodeLook,
		touch: hud.touch,
		hud,
		canGlide: opts.canGlide,
		canDash: opts.canDash,
		firstPerson: firstPerson && {
			...firstPerson,
			get eyeHeight() { return chairs.seated ? chairs.lift + .72 : firstPerson.eyeHeight; },
		},
		emotes: opts.emotes,
		clip: () => chairs.seated ? 'Sit' : opts.clip?.() ?? null,
		hold: (trying) => chairs.heading ?? opts.hold?.(trying) ?? null,
		onKey(key, e) {
			if (key === 'e' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
				!(e.target instanceof HTMLElement && e.target.closest('button,a,input,select,textarea,[contenteditable]')) &&
				interact()) {
				controls.state.waveQueued = false;
				e.preventDefault();
				return;
			}
			opts.onKey?.(key, e);
		},
		player: {
			respawnAt: () => parts.spawn,
			carriedBy: (x, z, y) => parts.carriedBy(x, z, y),
			carrying: opts.carrying,
		},
		onModelFail: () => opts.onFail?.('model'),
	});
	const { player, controls, orbit } = nix;
	let chairButton: HTMLButtonElement | undefined;
	let previousLift: number | null = null;
	engine.add({ order: ORDER.player - 1, update: () => chairs.pin() });
	engine.add({ order: ORDER.player + 1, update() {
		if (chairs.seated) {
			// The world may have pushed her out of an obstacle making up the seat.
			chairs.pin();
			previousLift ??= player.figure.group.position.y;
			player.figure.group.position.y = chairs.lift;
		} else if (previousLift !== null) {
			player.figure.group.position.y = previousLift;
			previousLift = null;
		}
	} });
	engine.add({ order: ORDER.hud, always: true, update() {
		if (!chairButton) return;
		const action = chairAction();
		chairButton.hidden = action === null;
		if (action) {
			const ko = document.documentElement.lang.startsWith('ko');
			const label = action === 'sit' ? (ko ? '앉기' : 'Sit down') : (ko ? '일어나기' : 'Stand up');
			if (chairButton.textContent !== label) chairButton.textContent = label;
		}
	} });
	engine.add({ order: ORDER.contact, update: (dt, time) => parts.touch(player, dt, time) });
	parts.onKill(() => {
		chairs.reset();
		hud.flash();
		player.respawn();
		orbit.yaw = parts.spawn.heading + Math.PI;
	});
	const sky = createSkyLight(engine, { follow: () => player.pos });

	return {
		/** What runs the frame: `engine.add({ order, update })` puts a system of the game's own in it. */
		engine,
		renderer,
		scene,
		camera,
		toon,
		hud,
		controls,
		orbit,
		/** The sun, the hemisphere light and the fog. */
		sky,
		/** Who the camera frames her with (someone she's talking to): `focus.add(() => ...)`. */
		focus: nix.focus,
		/** What keys do, in layers: `keys.intercept(fn, priority)`, `keys.command(fn)`. */
		keys: nix.keys,
		/** The currently effective view. It can temporarily differ from the selected view. */
		get firstPerson() {
			return nix.firstPerson;
		},
		/** A body-only gesture. True if accepted; never queues or changes the face. */
		action: nix.action,
		/** A matching face and body reaction, without a menu. True if the body cue was accepted. */
		react: nix.react,
		/** A timed face reaction, independent of the body animation. A newer cue replaces it. */
		emote: nix.emote,
		clearEmote: nix.clearEmote,
		player,
		parts,
		world,
		/** Register the sitting point of a fixed chair or bench; its art stays yours. */
		addChair(options: ChairOptions) {
			chairs.add(options);
			if (!chairButton && opts.chairs?.prompt !== 'custom') {
				const button = document.createElement('button');
				button.type = 'button';
				button.hidden = true;
				button.setAttribute('aria-keyshortcuts', 'E');
				button.style.cssText = 'position:fixed;z-index:21;bottom:max(24px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);min-height:44px;padding:8px 16px;border-radius:99px;border:1px solid #b7a9c5;color:#fff;background:#1b2032ef;font:600 14px system-ui;cursor:pointer;touch-action:manipulation';
				button.addEventListener('click', () => chairAction() && interact());
				document.body.append(button);
				chairButton = button;
			}
		},
		chairAction,
		interact,
		get chairSeated() { return chairs.seated; },
		get chairLift() { return chairs.lift; },
		/** Settles once Nixchan's here (her model has loaded). */
		loaded: nix.loaded,
		/** Whether it's drawing with WebGPU (or else WebGL 2), once `drawing` has settled. */
		get webgpu() {
			return !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
		},
		/** Settles with whether it can draw at all. */
		drawing: engine.drawing,
		get ready() {
			return nix.ready;
		},
		get time() {
			return engine.time;
		},
		/** Stops (or starts again) everything moving: her, the parts, the game's own updates. */
		set paused(p: boolean) {
			engine.paused = p;
			if (p) nix.halt();
		},
		get paused() {
			return engine.paused;
		},
		/** Something for the game to do every frame, after the parts have moved and she has. */
		onUpdate(fn: (dt: number, time: number) => void) {
			engine.onUpdate(fn);
		},
		/** Puts her somewhere at once (and makes it where she comes back to). The camera swings round
		 * behind her, or to `cameraYaw` (heading itself has it in front of her, looking back at her). */
		teleport(pos: THREE.Vector3, heading: number, cameraYaw = heading + Math.PI) {
			chairs.reset();
			parts.setSpawn(pos, heading);
			player.respawn();
			orbit.yaw = cameraYaw;
		},
		async start() {
			// ?fps on the URL shows how many frames a second it's drawing, and with what.
			if (new URLSearchParams(location.search).has('fps')) {
				void engine.drawing.then((ok) => {
					if (!ok) return;
					const meter = fpsMeter(!!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend);
					engine.add({ always: true, order: Infinity, update: () => meter(performance.now()) });
				});
			}
			await engine.start();
		},
	};
}

export type Game = NonNullable<ReturnType<typeof createGame>>;

/** A little readout in the corner: frames a second, over the last half second. */
function fpsMeter(webgpu: boolean) {
	const el = document.createElement('div');
	el.style.cssText = 'position:fixed;left:8px;bottom:48px;z-index:9;padding:3px 8px;border-radius:6px;background:rgba(20,18,50,.75);color:#fff;font:700 12px ui-monospace,monospace;pointer-events:none';
	document.body.append(el);
	let frames = 0;
	let since = performance.now();
	return (now: number) => {
		frames++;
		if (now - since < 500) return;
		el.textContent = `${Math.round((frames * 1000) / (now - since))} fps · ${webgpu ? 'WebGPU' : 'WebGL 2'}`;
		frames = 0;
		since = now;
	};
}
