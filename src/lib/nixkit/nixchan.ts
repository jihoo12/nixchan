// Nixchan, put in an engine (nixkit/engine.ts): her figure and how she moves (player.ts), the keys,
// mouse and touch that steer her (controls.ts), the camera that follows her (camera.ts), the
// eye-level view if the game wants one (view-mode.ts), and her faces and gestures (emotions.ts,
// gestures.ts). createGame (game.ts) is this in a world of parts with a sky and a HUD; a game with
// a world of its own (the island's terrain) can put her in that instead.
//
// She takes part in the frame as a few systems: the view first, then her (ORDER.player), her face
// (ORDER.effects), the camera (ORDER.camera) and what the HUD shows of it (ORDER.hud). The engine is
// held until her model has loaded, so nothing in the game runs before she's there.
import * as THREE from 'three';
import type { FigureLook, NixClip } from '../experimental/nix-figure';
import { createFocus, createFollowCamera } from './camera';
import { createControls, createKeyRouter, type Orbit } from './controls';
import { createEmotionPlayer, EMOTIONS, type Emotion, type EmoteMenu } from './emotions';
import { ORDER, type Engine } from './engine';
import type { GestureName } from './gestures';
import type { createHud } from './hud';
import type { Toon } from './look';
import { createPlayer, type Player, type PlayerContext } from './player';
import { aimFirstPerson, createViewMode } from './view-mode';
import type { World } from './world';

const ACTION_GESTURES = {
	hop: 'happy',
	flinch: 'surprised',
	droop: 'sad',
	'fist-pump': 'determined',
	dance: 'dance',
} as const satisfies Record<string, GestureName>;
export type BodyAction = keyof typeof ACTION_GESTURES;

type Hud = ReturnType<typeof createHud>;

export interface FirstPersonOptions {
	label?: string;
	lockedLabel?: string;
	eyeHeight?: number;
	/** Temporarily show the avatar for a cutscene without losing the player's preference. */
	forceThirdPerson?: () => boolean;
}

export interface NixchanOptions {
	/** The canvas the engine draws on: drags on it swing the camera round. */
	canvas: HTMLCanvasElement;
	/** Her model (assets/nixchan/nixchan-3d.glb). */
	modelUrl: string;
	/** Where she starts, and which way she faces (0 is towards +z). */
	spawn: { pos: THREE.Vector3; heading: number };
	/** Where she is: what she stands on, bumps into and swims in. */
	world: World;
	toon: Toon;
	/** How her materials are made: WebGL's without it, nixkit/figure-nodes.ts's on WebGPU. */
	look?: FigureLook;
	/** The on-screen stick, knob and jump (and dash) buttons, for touch. */
	touch: Parameters<typeof createControls>[1];
	/** The HUD, for the eye-level view's button and the reaction menu (needed for either). */
	hud?: Hud;
	/** Where the camera starts round her (behind her, a little above, 9 m back, without it). */
	orbit?: Partial<Orbit>;
	/** The follow camera's field of view, in a landscape window and a portrait one, and its near
	 * plane (48°, 62° and 0.3 m without it). A big world with gently shelving beaches wants the near
	 * plane further out, for the depth buffer's sake. */
	view?: { fov?: [landscape: number, portrait: number]; near?: number };
	canGlide?: () => boolean;
	canDash?: () => boolean;
	/** Opt in to an eye-level view (V / HUD button). Third person remains the default. */
	firstPerson?: FirstPersonOptions;
	/** Opt in to a player reaction menu (B / HUD). Scripted reactions work without it. */
	emotes?: EmoteMenu;
	/** Something for her to be doing instead of walking about, asked every frame; null for her own. */
	clip?: () => NixClip | null;
	/** Keeps her on the spot, facing the angle it gives (null: she's free to move). */
	hold?: (tryingToMove: boolean) => number | null;
	/** Keys that aren't for moving or jumping (lower case). E waves and Q dashes besides, unless
	 * `wave` and `dash` say otherwise. */
	onKey?: (key: string, e: KeyboardEvent) => void;
	/** Whether E waves and Q dashes (both, without these). */
	keys?: { wave?: boolean; dash?: boolean };
	/** The rest of what player.ts can be told: ripples, carrying, the glider, belts, respawning. */
	player?: Pick<PlayerContext, 'ripple' | 'carrying' | 'glider' | 'carriedBy' | 'respawnAt'>;
	/** Her model couldn't be loaded. */
	onModelFail?: (err: unknown) => void;
}

export function createNixchan(engine: Engine, opts: NixchanOptions) {
	const { camera } = engine;
	const hud = opts.hud;
	const orbit: Orbit = { yaw: opts.spawn.heading + Math.PI, pitch: 0.32, distance: 9, ...opts.orbit };
	const focus = createFocus();
	const keys = createKeyRouter();

	// ---------- the eye-level view ----------

	const view = createViewMode();
	const first = opts.firstPerson;
	const viewLocked = () => !!first?.forceThirdPerson?.();
	const isFirstPerson = () => view.resolve(viewLocked());
	let eyePitch = 0;
	let resumeYaw: number | undefined;
	const toggleView = () => view.toggle(viewLocked());
	const viewButton = first && hud?.button(first.label ?? 'First person', toggleView);
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

	// ---------- faces and gestures ----------

	let ready = false;
	const live = () => ready && !engine.paused;
	const motion = matchMedia('(prefers-reduced-motion: reduce)');
	const emotions = createEmotionPlayer((name, strength) => player.figure.setEmotion(name, strength), () => motion.matches);
	const react = (name: Emotion, faceOnlySeconds = 2.4, gesture: GestureName = name) => {
		if (!live() || !EMOTIONS.includes(name)) return false;
		const duration = player.playGesture(gesture);
		if (duration) emotions.clear(); // Begin the new face with the new body pose.
		else player.clearGesture(); // A face-only fallback replaces the previous reaction too.
		emotions.play(name, duration || faceOnlySeconds);
		return duration > 0;
	};
	const menu = opts.emotes;
	const canChooseEmote = () => live() && !isFirstPerson();
	const emoteMenu = menu && hud?.emotes(menu, (name) => {
		if (!canChooseEmote()) return;
		if (menu.gestures) react(name, 3.6);
		else emotions.play(name, 3.6);
	}, menu.gestures && menu.danceLabel ? () => {
		if (canChooseEmote()) react('happy', 3.6, 'dance');
	} : undefined);
	emoteMenu?.setVisible(false);

	// ---------- keys, and her ----------

	keys.intercept((key, e) => {
		if (first && key === 'v') {
			if (!e.repeat) toggleView();
			return true;
		}
		if (emoteMenu && key === 'b') {
			if (!e.repeat && !engine.paused && !isFirstPerson()) emoteMenu.toggle(true);
			return true;
		}
		return false;
	});
	keys.look((dx, dy) => {
		if (!isFirstPerson()) return false;
		orbit.yaw -= dx * 0.006;
		eyePitch = THREE.MathUtils.clamp(eyePitch + dy * 0.004, -1.2, 1.2);
		return true;
	});
	keys.blockZoom(isFirstPerson);
	const wave = opts.keys?.wave !== false;
	const dash = opts.keys?.dash !== false;
	keys.command((key, e) => {
		if (e.repeat) return;
		if (dash && key === 'q') controls.state.dashQueued = true;
		else if (wave && key === 'e') controls.state.waveQueued = true;
		opts.onKey?.(key, e);
	});
	const controls = createControls(opts.canvas, opts.touch, orbit, keys.route);

	const player: Player = createPlayer({
		world: opts.world,
		scene: engine.scene,
		toon: opts.toon,
		modelUrl: opts.modelUrl,
		look: opts.look,
		start: opts.spawn.pos.clone(),
		heading: opts.spawn.heading,
		controls,
		orbit,
		hold: opts.hold ?? (() => null),
		clip: opts.clip ?? (() => null),
		canGlide: opts.canGlide ?? (() => false),
		canDash: opts.canDash,
		canGesture: () => !engine.paused && !isFirstPerson() && !motion.matches,
		...opts.player,
	});
	const follow = createFollowCamera(camera, orbit, opts.spawn.pos, opts.world);

	const loaded = player.figure.ready.then(
		() => {
			ready = true;
			player.figure.group.traverse((o) => (o.castShadow = true));
		},
		(err) => {
			opts.onModelFail?.(err);
			throw err;
		},
	);
	// Nothing in the game runs until she's here (and, if she never comes, nothing does).
	engine.waitFor(new Promise<void>((resolve) => void loaded.then(resolve, () => {})));

	// ---------- her part in the frame ----------

	let framedInFirstPerson = false;
	const frameView = (active: boolean) => {
		framedInFirstPerson = active;
		const portrait = engine.size.width < engine.size.height;
		const [landscape, upright] = opts.view?.fov ?? [48, 62];
		camera.fov = active ? (portrait ? 76 : 64) : portrait ? upright : landscape;
		camera.near = active ? 0.08 : (opts.view?.near ?? 0.3);
		camera.updateProjectionMatrix();
	};
	// Before anything else: catch the yaw from before a cutscene, before the game can change it.
	engine.add({ order: ORDER.input - 100, always: true, update: syncView, resize: () => frameView(isFirstPerson()) });
	engine.add({ order: ORDER.player, update: (dt, time) => player.update(dt, time) });
	engine.add({ order: ORDER.effects, update: (dt) => emotions.tick(dt) });
	engine.add({ order: ORDER.camera, always: true, update: (dt) => follow.update(dt, player, focus.current()) });
	let atEye = false;
	engine.add({
		order: ORDER.hud,
		always: true,
		update() {
			atEye = syncView();
			emoteMenu?.setVisible(ready && !engine.paused && !atEye);
			if (atEye !== framedInFirstPerson) frameView(atEye);
		},
	});
	engine.setDraw(() => {
		if (!atEye) {
			engine.renderer.render(engine.scene, camera);
			return;
		}
		aimFirstPerson(camera, player.pos, orbit.yaw, eyePitch, first?.eyeHeight);
		// Hide the body and glider only while drawing. Animation and bone world poses are still
		// available to the game and don't reset when the view switches back.
		const wasVisible = player.root.visible;
		player.root.visible = false;
		try {
			engine.renderer.render(engine.scene, camera);
		} finally {
			player.root.visible = wasVisible;
		}
	});

	return {
		player,
		controls,
		orbit,
		/** Who the camera frames her with: `focus.add(() => talking ? { x, z, facing } : null)`. */
		focus,
		/** What keys do: `keys.intercept(fn, priority)`, `keys.command(fn)`, and the rest. */
		keys,
		/** Settles once she's here (her model has loaded). */
		loaded,
		get ready() {
			return ready;
		},
		/** The currently effective view. It can temporarily differ from the selected view. */
		get firstPerson() {
			return isFirstPerson();
		},
		/** A body-only gesture. True if accepted; never queues or changes the face. */
		action(name: BodyAction) {
			if (!live() || !Object.hasOwn(ACTION_GESTURES, name)) return false;
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
		/** Lets go of every key and stops any gesture (as when the game pauses). */
		halt() {
			controls.clearKeys();
			player.clearGesture();
		},
	};
}

export type Nixchan = ReturnType<typeof createNixchan>;
