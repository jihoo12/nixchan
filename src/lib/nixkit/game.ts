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
// What's here came out of Nixchan's island (/island), which uses the same player, camera, controls
// and look: the island's own world is its terrain and sky island (island/features.ts) rather than parts.
//
// It draws with three's WebGPURenderer: WebGPU where the browser has it, WebGL 2 where it doesn't.
// So a game's own shaders are written in TSL (three/tsl), not GLSL: a ShaderMaterial or
// onBeforeCompile doesn't draw here (CONTRIBUTING.md).
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { nodeLook } from './figure-nodes';
import { createFollowCamera } from './camera';
import { createControls, type Orbit } from './controls';
import { createHud } from './hud';
import { createEmotionPlayer, EMOTIONS, type Emotion, type EmoteMenu } from './emotions';
import type { GestureName } from './gestures';
import { makeToon } from './look';
import { createParts } from './parts';
import { aimFirstPerson, createViewMode } from './view-mode';
import { createPlayer, type Player } from './player';
import type { World } from './world';
import type { NixClip } from '../experimental/nix-figure';

export type { NixClip };

const ACTION_GESTURES = {
	hop: 'happy',
	flinch: 'surprised',
	droop: 'sad',
	'fist-pump': 'determined',
	dance: 'dance',
} as const satisfies Record<string, GestureName>;
export type BodyAction = keyof typeof ACTION_GESTURES;

export interface GameOptions {
	canvas: HTMLCanvasElement;
	/** Nixchan's model (assets/nixchan/nixchan-3d.glb). */
	modelUrl: string;
	/** Where she starts, and which way she faces (0 is towards +z). */
	spawn: { pos: THREE.Vector3; heading: number };
	/** A world of its own; without one, she's in the game's world of parts. */
	world?: World;
	/** Whether she can open her glider (she can't, by default: in a world of parts it's cheating). */
	canGlide?: () => boolean;
	/** Whether she can dash. */
	canDash?: () => boolean;
	/** Opt in to an eye-level view (V / HUD button). Third person remains the default. */
	firstPerson?: {
		label?: string;
		lockedLabel?: string;
		eyeHeight?: number;
		/** Temporarily show the avatar for a cutscene without losing the player's preference. */
		forceThirdPerson?: () => boolean;
	};
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
	/** Called when Nixchan can't be loaded (neither WebGPU nor WebGL 2, or the model didn't come). */
	onFail?: (why: 'webgl' | 'model') => void;
}

/** The sky's colours, top to bottom, by day and by night, and the light. */
const SKIES = {
	day: { top: '#7ec8ff', bottom: '#e7f4ff', fog: '#d7ecff', sun: '#fff4dd', sunPower: 2.4, ground: '#9fb3d9', hemi: 1.5 },
	night: { top: '#141433', bottom: '#3b3a73', fog: '#2c2b5c', sun: '#b7c4ff', sunPower: 1.1, ground: '#2a2850', hemi: 0.9 },
};

export function createGame(opts: GameOptions) {
	const { canvas } = opts;
	let renderer: WebGPURenderer;
	const cannotDraw = () => {
		document.documentElement.classList.add('no-3d');
		opts.onFail?.('webgl');
	};
	try {
		// ?webgl on the URL draws with WebGL 2 even where there's WebGPU, to see what that looks like.
		renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: new URLSearchParams(location.search).has('webgl') });
	} catch {
		cannotDraw();
		return null;
	}
	// Settles once it's ready to draw; on WebGPU that's after the browser hands over a device.
	const drawing = renderer.init().then(
		() => true,
		() => {
			cannotDraw();
			return false;
		},
	);
	renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 1200);
	const toon = makeToon();
	const hud = createHud();

	// ---------- sky and light ----------

	const hemi = new THREE.HemisphereLight('#ffffff', '#9fb3d9', 1.5);
	const sun = new THREE.DirectionalLight('#fff4dd', 2.4);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	const S = 30;
	Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 140 });
	sun.shadow.bias = -0.0005;
	scene.add(hemi, sun, sun.target);
	const skyCanvas = document.createElement('canvas');
	skyCanvas.width = 2;
	skyCanvas.height = 256;
	const skyTexture = new THREE.CanvasTexture(skyCanvas);
	skyTexture.colorSpace = THREE.SRGBColorSpace;
	scene.background = skyTexture;
	scene.fog = new THREE.Fog('#d7ecff', 60, 260);
	const paintSky = () => {
		const sky = document.documentElement.dataset.time === 'night' ? SKIES.night : SKIES.day;
		const ctx = skyCanvas.getContext('2d')!;
		const g = ctx.createLinearGradient(0, 0, 0, 256);
		g.addColorStop(0, sky.top);
		g.addColorStop(1, sky.bottom);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 2, 256);
		skyTexture.needsUpdate = true;
		(scene.fog as THREE.Fog).color.set(sky.fog);
		sun.color.set(sky.sun);
		sun.intensity = sky.sunPower;
		hemi.groundColor.set(sky.ground);
		hemi.intensity = sky.hemi;
	};
	paintSky();
	addEventListener('site-time', paintSky);

	// ---------- the world, and Nixchan ----------

	const parts = createParts(scene, toon);
	const world = opts.world ?? parts.world;
	parts.setSpawn(opts.spawn.pos, opts.spawn.heading);

	const orbit: Orbit = { yaw: opts.spawn.heading + Math.PI, pitch: 0.32, distance: 9 };
	const view = createViewMode();
	const first = opts.firstPerson;
	const viewLocked = () => !!first?.forceThirdPerson?.();
	const isFirstPerson = () => view.resolve(viewLocked());
	let eyePitch = 0;
	let resumeYaw: number | undefined;
	const toggleView = () => view.toggle(viewLocked());
	const viewButton = first && hud.button(first.label ?? 'First person', toggleView);
	let shownView: boolean | undefined;
	let shownLock: boolean | undefined;
	const syncView = () => {
		if (!viewButton) return false;
		const locked = viewLocked();
		const active = view.resolve(locked);
		if (locked && view.active && resumeYaw === undefined) resumeYaw = orbit.yaw;
		if (!locked && resumeYaw !== undefined) {
			orbit.yaw = resumeYaw;
			resumeYaw = undefined;
		}
		if (shownView !== active) {
			viewButton.setAttribute('aria-pressed', String(active));
			shownView = active;
		}
		if (shownLock !== locked) {
			viewButton.disabled = locked;
			viewButton.title = locked ? (first?.lockedLabel ?? 'Third-person scene') : 'V';
			shownLock = locked;
		}
		return active;
	};
	if (viewButton) {
		viewButton.setAttribute('aria-keyshortcuts', 'V');
		viewButton.setAttribute('aria-pressed', 'false');
		viewButton.title = 'V';
	}
	const motion = matchMedia('(prefers-reduced-motion: reduce)');
	const emotions = createEmotionPlayer((name, strength) => player.figure.setEmotion(name, strength), () => motion.matches);
	const react = (name: Emotion, faceOnlySeconds = 2.4, gesture: GestureName = name) => {
		if (!ready || paused || !EMOTIONS.includes(name)) return false;
		const duration = player.playGesture(gesture);
		if (duration) emotions.clear(); // Begin the new face with the new body pose.
		else player.clearGesture(); // A face-only fallback replaces the previous reaction too.
		emotions.play(name, duration || faceOnlySeconds);
		return duration > 0;
	};
	const menu = opts.emotes;
	const canChooseEmote = () => ready && !paused && !isFirstPerson();
	const emoteMenu = menu && hud.emotes(menu, (name) => {
		if (!canChooseEmote()) return;
		if (menu.gestures) react(name, 3.6);
		else emotions.play(name, 3.6);
	}, menu.gestures && menu.danceLabel ? () => {
		if (canChooseEmote()) react('happy', 3.6, 'dance');
	} : undefined);
	emoteMenu?.setVisible(false);
	const controls = createControls(canvas, hud.touch, orbit, {
		intercept(key, e) {
			if (first && key === 'v') {
				if (!e.repeat) toggleView();
				return true;
			}
			if (emoteMenu && key === 'b') {
				if (!e.repeat && !paused && !isFirstPerson()) emoteMenu.toggle(true);
				return true;
			}
			return false;
		},
		adjustLook(dx, dy) {
			if (!isFirstPerson()) return false;
			orbit.yaw -= dx * 0.006;
			eyePitch = THREE.MathUtils.clamp(eyePitch + dy * 0.004, -1.20, 1.20);
			return true;
		},
		blockZoom: isFirstPerson,
		command(key, e) {
			if (e.repeat) return;
			if (key === 'q') controls.state.dashQueued = true;
			else if (key === 'e') controls.state.waveQueued = true;
			opts.onKey?.(key, e);
		},
		release() {},
		blur() {},
	});

	const player: Player = createPlayer({
		world,
		scene,
		toon,
		modelUrl: opts.modelUrl,
		look: nodeLook,
		start: opts.spawn.pos.clone(),
		heading: opts.spawn.heading,
		controls,
		orbit,
		hold: opts.hold ?? (() => null),
		clip: opts.clip ?? (() => null),
		canGlide: opts.canGlide ?? (() => false),
		canDash: opts.canDash,
		canGesture: () => !paused && !isFirstPerson() && !motion.matches,
		respawnAt: () => parts.spawn,
		carriedBy: (x, z, y) => parts.carriedBy(x, z, y),
	});
	parts.onKill(() => {
		hud.flash();
		player.respawn();
		orbit.yaw = parts.spawn.heading + Math.PI;
	});
	const follow = createFollowCamera(camera, orbit, opts.spawn.pos, world);

	let ready = false;
	const loaded = player.figure.ready.then(
		() => {
			ready = true;
			player.figure.group.traverse((o) => (o.castShadow = true));
		},
		(err) => {
			opts.onFail?.('model');
			throw err;
		},
	);

	// ---------- the loop ----------

	const updates: ((dt: number, time: number) => void)[] = [];
	let framedInFirstPerson = false;
	const frameView = (active: boolean) => {
		framedInFirstPerson = active;
		const portrait = innerWidth < innerHeight;
		camera.fov = active ? (portrait ? 76 : 64) : (portrait ? 62 : 48);
		camera.near = active ? 0.08 : 0.3;
		camera.updateProjectionMatrix();
	};
	const resize = () => {
		renderer.setSize(innerWidth, innerHeight, false);
		camera.aspect = innerWidth / innerHeight;
		frameView(isFirstPerson());
	};
	let time = 0;
	let paused = false;

	return {
		renderer,
		scene,
		camera,
		toon,
		hud,
		controls,
		orbit,
		/** The currently effective view. It can temporarily differ from the selected view. */
		get firstPerson() {
			return isFirstPerson();
		},
		/** A body-only gesture. True if accepted; never queues or changes the face. */
		action(name: BodyAction) {
			if (!ready || paused || !Object.hasOwn(ACTION_GESTURES, name)) return false;
			return player.playGesture(ACTION_GESTURES[name]) > 0;
		},
		/** A matching face and body reaction, without a menu. True if the body cue was accepted. */
		react(name: Emotion) {
			return react(name);
		},
		/** A timed face reaction, independent of the body animation. A newer cue replaces it. */
		emote(name: Emotion, seconds?: number) {
			emotions.play(name, seconds);
		},
		clearEmote() {
			emotions.clear();
		},
		player,
		parts,
		world,
		/** Settles once Nixchan's here (her model has loaded). */
		loaded,
		/** Whether it's drawing with WebGPU (or else WebGL 2), once `drawing` has settled. */
		get webgpu() {
			return !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
		},
		/** Settles with whether it can draw at all. */
		drawing,
		get ready() {
			return ready;
		},
		get time() {
			return time;
		},
		/** Stops (or starts again) everything moving: her, the parts, the game's own updates. */
		set paused(p: boolean) {
			paused = p;
			if (p) {
				controls.clearKeys();
				player.clearGesture();
			}
		},
		get paused() {
			return paused;
		},
		/** Something for the game to do every frame, after the parts have moved and she has. */
		onUpdate(fn: (dt: number, time: number) => void) {
			updates.push(fn);
		},
		/** Puts her somewhere at once (and makes it where she comes back to). The camera swings round
		 * behind her, or to `cameraYaw` (heading itself has it in front of her, looking back at her). */
		teleport(pos: THREE.Vector3, heading: number, cameraYaw = heading + Math.PI) {
			parts.setSpawn(pos, heading);
			player.respawn();
			orbit.yaw = cameraYaw;
		},
		async start() {
			resize();
			addEventListener('resize', resize);
			if (!(await drawing)) return;
			// ?fps on the URL shows how many frames a second it's drawing, and with what.
			const meter = new URLSearchParams(location.search).has('fps') ? fpsMeter(this.webgpu) : null;
			let last = performance.now();
			renderer.setAnimationLoop((now) => {
				const dt = Math.min(0.05, (now - last) / 1000);
				last = now;
				meter?.(now);
				syncView(); // capture pre-cutscene yaw before game hooks can change it
				if (ready && !paused) {
					time += dt;
					parts.move(dt, time);
					player.update(dt, time);
					parts.touch(player, dt, time);
					for (const fn of updates) fn(dt, time);
					emotions.tick(dt);
				}
				follow.update(dt, player, null);
				// The sun's shadows follow her about.
				const p = player.pos;
				sun.position.set(p.x + 24, p.y + 50, p.z + 16);
				sun.target.position.copy(p);
				const atEye = syncView();
				emoteMenu?.setVisible(ready && !paused && !atEye);
				if (atEye !== framedInFirstPerson) frameView(atEye);
				if (!atEye) {
					renderer.render(scene, camera);
				} else {
					aimFirstPerson(camera, p, orbit.yaw, eyePitch, first?.eyeHeight);
					// Hide the body and glider only while drawing. Animation and bone world poses
					// are still available to the game and don't reset when the view switches back.
					const wasVisible = player.root.visible;
					player.root.visible = false;
					try { renderer.render(scene, camera); }
					finally { player.root.visible = wasVisible; }
				}
			});
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
