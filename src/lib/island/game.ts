// Nixchan's island: a little toon island in the sea for the 3D Nixchan to roam freely. There's no
// goal and no clock: just places to come across (a lighthouse, a campfire, standing stones, a flag on
// the summit, an islet out at sea, an island floating in the sky), a map that fills in as she
// explores, a glider for jumping off high ground, fish to catch, a garden to grow, and Pebble at the
// market stand.
//
// This file only puts the island together: each part is a system in Nixkit's engine
// (nixkit/engine.ts), and Nixchan, her controls and the camera are Nixkit's (nixkit/nixchan.ts).
// Each part of the island lives in its own module:
//   terrain, features  the ground and what stands on it (all movement asks is "how high is it here?")
//   layout, scatter    where the places, rocks and trees go
//   sky, water, theme  light, sea and day/night (parts that change colour register with the theme)
//   landmarks          the pier, lighthouse, campfire and the rest
//   skyisle            the island in the sky, and the Windspout's wind up to it
//   interact           what E does here (sources register offers; nixkit/interact.ts)
//   explore, menu      places found, the maps, and the menu over the game
//   fishing, farm, npc, inventory   the things to do
//   talk               the conversation box and speech bubble Pebble and Hollis share
//   owl                Hollis, hidden under Cloudrest, who teaches her to dash
//   forge              the smithy: ore to mine, ingots to smelt, tools to make better
//   machines           sprinklers and Sprocket, made at the forge, looking after the garden
//   rift               the grey rift at the standing stones, through to /monochrome
//   lantern            the Grey Lantern, made at the forge, at her shoulder after dark
//   blocks             stone blocks, made at the forge, that she builds with out on the island
//   power              windmills, made at the forge, the drills they power on the ore veins, and
//                      belts that carry the ore (and the power) to a hopper by the forge
//   save               every key the island keeps in localStorage
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { nodeLook } from '../nixkit/figure-nodes';
import { STONE_BLOCK, blockGround, createBlocks } from './blocks';
import { createEngine, ORDER } from '../nixkit/engine';
import { createHands } from '../nixkit/hands';
import { createNixchan } from '../nixkit/nixchan';
import { createExplore } from './explore';
import { createFarm } from './farm';
import { addFeature, groundAt, islandWorld, nearby, removeFeature, roomy } from './features';
import { ASHEN_ORE, ORE, createForge, type Upgrade } from './forge';
import { MAX_SPRINKLERS, createMachines } from './machines';
import { createFishing, SPECIES } from './fishing';
import { createInteractions } from '../nixkit/interact';
import { createInventory } from './inventory';
import { buildLandmarks, buildPier } from './landmarks';
import { createCampfireRest } from './campfire-rest';
import { createBuildAim } from './build-aim';
import { BUILD_ITEMS, createBuildMode, type BuildItem } from './build-mode';
import { pick } from './lang';
import { createLookout } from './lookout';
import { createLookoutCamera } from './lookout-camera';
import { planIsland } from './layout';
import { buildSettlementScene } from './settlement-scene';
import { FORGE_SITE, GARDEN_SITE, HOUSE_SITE, MARKET_SITE, SETTLEMENT_PATH, VILLAGE_GREEN } from './settlements';
import { makeToon } from './look';
import { createMenu } from './menu';
import { createNpc } from './npc';
import { canDash, createOwl } from './owl';
import { createFourthWall } from './fourthwall';
import { createHouse } from './house';
import { createTortoise } from './tortoise';
import { MAX_BELTS, MAX_ORE_HOPPERS, MAX_WINDMILLS, ORE_HOPPER, REACH, beltCarry, createPower } from './power';
import { createLantern } from './lantern';
import { createIslandRift, riftArrival } from './rift';
import { loadJSON, saveJSON } from './save';
import { scatter } from './scatter';
import { createSkyIsle, skyWaterAt } from './skyisle';
import { createSky } from './sky';
import { createTalk } from './talk';
import { ISLET, PIER_DIR, deckAt, terrainAt, terrainMesh } from './terrain';
import { createTheme, isNight } from './theme';
import { createWater } from './water';
import { islandQuality } from './quality';
import { connectIsland } from './together';
import { to as inSite } from '../base';

export async function startIsland() {
	const canvas = document.querySelector<HTMLCanvasElement>('[data-stage]');
	if (!canvas) return;
	const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
	const ui = {
		loading: $('[data-loading]'),
		atlas: $('[data-atlas]'),
		atlasClose: $<HTMLButtonElement>('[data-atlas-close]'),
		bag: $('[data-bag]'),
		bagDetail: $('[data-bag-detail]'),
		bagSummary: $('[data-bag-summary]'),
		stick: $('[data-stick]'),
		knob: $('[data-knob]'),
		jump: $<HTMLButtonElement>('[data-jump]'),
		dash: $<HTMLButtonElement>('[data-dash]'),
	};

	// Drawn with three's WebGPURenderer, as Nixkit's games are: WebGPU where the browser has it, WebGL
	// 2 where it doesn't (or with ?webgl on the URL, to see what that looks like). So the island's own
	// shaders are TSL (sky.ts, water.ts, skyisle.ts, monochrome/rift.ts). The frame is Nixkit's
	// engine's (nixkit/engine.ts): each part of the island below is a system in it.
	const params = new URLSearchParams(location.search);
	const quality = islandQuality(
		matchMedia('(pointer: coarse)').matches,
		matchMedia('(max-width: 900px), (max-height: 550px)').matches,
		params.get('quality'),
	);
	const engine = createEngine({
		canvas,
		maxPixelRatio: quality.maxPixelRatio,
		renderer: (c) => new WebGPURenderer({ canvas: c, antialias: quality.antialias, forceWebGL: params.has('webgl') }),
		// The near plane sits a little way out: the camera never comes closer than that, and it buys the
		// depth buffer enough precision that the gently shelving beaches don't flicker against the sea.
		camera: { fov: 45, near: 0.5, far: 2000 },
		onFail: () => {
			if (ui.loading) ui.loading.textContent = 'The island needs WebGPU or WebGL 2, which this browser has turned off.';
		},
	});
	if (!engine) return;
	const { renderer, scene, camera } = engine;
	const motion = matchMedia('(prefers-reduced-motion: reduce)');
	const lookoutCamera = createLookoutCamera(camera, { reduced: () => motion.matches });
	const toon = makeToon();
	const theme = createTheme();

	// ---------- the world ----------

	const sky = createSky(scene, toon, theme);
	scene.add(terrainMesh(toon({ vertexColors: true })));
	const water = createWater(scene, sky.fog, theme);
	buildPier(scene, toon, theme);
	const layout = planIsland();
	scatter(scene, toon, layout);
	buildSettlementScene(scene, toon, { paths: [{ points: SETTLEMENT_PATH, width: 2.3 }], green: VILLAGE_GREEN });

	// ---------- Nixchan, and how she's steered ----------

	// She starts with her back to the sea, looking inland, with the pier off to one side; or, back
	// from the grey place, stepping out of the rift at the standing stones.
	let heading = Math.atan2(-PIER_DIR.x, -PIER_DIR.z) + 0.55;
	const fromRift = params.get('from') === 'rift';
	if (fromRift) {
		const out = riftArrival(layout.STONES);
		layout.START.copy(out.pos);
		heading = out.heading;
		params.delete('from');
		history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
	}
	// Her arms hold one thing at a time: whatever she's just taken up, the rest are put away.
	const hands = createHands([
		{ holding: () => machines.carrying, stop: () => machines.stop() },
		{ holding: () => power.carrying, stop: () => power.stop() },
		{ holding: () => blocks.on && inventory.has(STONE_BLOCK), stop: () => blocks.stop() },
	]);
	// Nixchan, her controls and the camera that follows her (nixkit/nixchan.ts), on the island's
	// terrain. E and Q are the island's own (below), so they don't wave or dash by themselves.
	let campfireRest: ReturnType<typeof createCampfireRest> | null = null;
	const nix = createNixchan(engine, {
		canvas,
		modelUrl: canvas.dataset.model ?? '',
		spawn: { pos: layout.START, heading },
		world: islandWorld,
		active: () => !campfireRest?.active,
		toon,
		look: nodeLook,
		touch: ui,
		// (From the rift, the camera starts off to one side, so the rift isn't in the way.)
		orbit: { yaw: heading + Math.PI + (fromRift ? 0.9 : 0) },
		view: { fov: [45, 60], near: 0.5 },
		keys: { wave: false, dash: false },
		canGlide: () => true,
		canDash,
		hold(tryingToMove) {
			// Chatting with Pebble or tending the garden keeps her on the spot, facing it, until done.
			let held: number | null = null;
			if (npc.talking) held = npc.facing;
			if (owl?.talking) held = owl.facing;
			if (tortoise.talking) held = tortoise.facing;
			// Breaking the fourth wall, she turns to face whoever's watching.
			if (wall.breaking) return towardCamera();
			if (lookoutCamera.active) return landmarks.lookout.yaw;
			if (farm.busy) held = farm.facing;
			if (forge.busy) held = forge.facing;
			if (house.dressing) held = house.facing;
			// So does fishing, but walking off (or jumping) puts the rod away, unless a fish is on the line.
			if (fishing.active) {
				if (held === null && tryingToMove && !fishing.hooked) fishing.interrupt();
				if (fishing.active) held = fishing.facing;
			}
			return held;
		},
		clip: () => forge.clip ?? farm.clip ?? fishing.clip,
		player: {
			ripple: water.ripple,
			carrying: hands.holding,
			// A belt with power carries her along it.
			carriedBy: beltCarry,
			// Remade at the forge, the glider flies faster and sinks slower; the prism glider most of all.
			glider: () => (forge.has('prism') ? { speed: 12, sink: 1.1 } : forge.has('glider') ? { speed: 10.5, sink: 1.4 } : { speed: 8.5, sink: 2.3 }),
		},
		onModelFail: () => {
			if (ui.loading) ui.loading.textContent = "Nixchan couldn't make it to the island just now. Try reloading?";
		},
	});
	const { player, controls, orbit, keys } = nix;
	const { figure, pos } = player;
	const buildAim = createBuildAim({
		canvas, camera, player: pos, nearby,
		ground: (x, z) => Math.max(groundAt(x, z), 0),
		solidFloor: (x, z) => Math.max(terrainAt(x, z), deckAt(x, z)),
	});
	let ready = false;
	nix.loaded.then(
		() => {
			ready = true;
			ui.loading?.setAttribute('hidden', '');
		},
		() => {},
	);

	// What keys do, in layers (nixkit/controls.ts): whatever has her attention gets them first.
	// Knocking on the screen, nothing else does anything.
	keys.intercept((key, e) => {
		if (!wall.breaking) return false;
		e.preventDefault();
		return true;
	}, 100);
	// (Talking with Pebble, Hollis or Parmen, the keys work the conversation: talk.keysFor, at 90.)
	// With the menu open, only the keys that work the menu do anything.
	keys.intercept((key) => menu.isOpen && !['m', 'i', 'h', '?', 'escape'].includes(key), 80);
	keys.intercept((key) => (farm.shopOpen || forge.dialogOpen) && key !== 'escape', 70);
	// At the wardrobe, the panel's buttons are what's working; Esc (or E) puts it away.
	keys.intercept((key) => {
		if (!house.dressing) return false;
		if (key === 'escape' || key === 'e') house.close();
		return true;
	}, 60);
	keys.command((key, e) => {
		if (e.repeat) return;
		if (key === 'escape') {
			if (!menu.isOpen && !farm.shopOpen && !forge.dialogOpen) building?.finish();
			menu.close();
			farm.closeShop();
			forge.closeDialog();
		} else if (key === 'e') {
			const didAct = interactions.press();
			if (!building?.busy && !didAct) controls.state.waveQueued = true;
		} else if (key === 'b') building?.togglePicker();
		else if (key === 'q') {
			if (building?.busy) building.remove();
			else controls.state.dashQueued = true;
		} else if (key === 'f' && !building?.busy) fishing.press();
		else if (building?.pickerOpen && /^[1-6]$/.test(key)) building.select(BUILD_ITEMS[Number(key) - 1]);
		else if (key === 'm') menu.toggle('map');
		else if (key === 'i') menu.toggle('bag');
		else if (key === 'h' || key === '?') menu.toggle('help');
	});
	keys.release((key) => {
		if (key === 'f') fishing.release();
	});
	keys.blur(() => fishing.release());
	const landmarks = buildLandmarks(scene, toon, theme, layout, pos);
	const towardCamera = () => Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
	const talk = createTalk(camera);
	talk.keysFor(keys, 90);

	// ---------- things to do ----------

	let building: ReturnType<typeof createBuildMode> | undefined;
	const interactions = createInteractions({ override: () => building?.offer() });
	const campfire = campfireRest = createCampfireRest({
		world: islandWorld, terrain: terrainAt, seats: landmarks.campfireSeats, player,
		reduced: () => motion.matches,
		available: () => ready && !engine.paused && !lookoutCamera.active && !building?.busy && !fishing.active && !farm.busy && !farm.shopOpen
			&& !forge.busy && !forge.dialogOpen && !talk.talking && !menu.isOpen && !house.dressing
			&& !hands.holding() && !blocks.on && !power.laying && !wall.breaking && !skyIsle.aboard
			&& Math.hypot(player.vel.x, player.vel.z) < 2.25,
	});
	interactions.add(campfire.offer);
	keys.intercept((key, e) => {
		if (!campfire.active || !['e', 'f', 'b', 'q'].includes(key) || e.altKey || e.ctrlKey || e.metaKey) return false;
		if (key === 'e' && !e.repeat && !e.shiftKey && !engine.paused)
			campfire.stand();
		e.preventDefault();
		return true;
	}, 62);
	engine.add({
		order: ORDER.player + 1,
		update(dt, time) {
			if (!campfire.active) return;
			const move = controls.move();
			const stand = !!(controls.state.jumpQueued || move.forward || move.right);
			controls.state.jumpQueued = controls.state.dashQueued = controls.state.waveQueued = false;
			campfire.update(dt, time, stand);
		},
	});

	// Look through the real landscape without moving or saving a new player position.
	const lookout = createLookout({
		site: landmarks.lookout, camera: lookoutCamera, pos,
		canLook: () => ready && engine.running && player.grounded && !player.swimming && !player.dashing
			&& !campfire.active && !building?.busy && !fishing.active && !farm.busy && !farm.shopOpen && !forge.busy
			&& !forge.dialogOpen && !talk.talking && !menu.isOpen && !house.dressing && !wall.breaking
			&& !hands.holding() && !blocks.on && !power.laying && !skyIsle.aboard
			&& Math.hypot(player.vel.x, player.vel.z) < 2.25,
		halt: () => {
			nix.halt();
			player.vel.set(0, 0, 0);
			controls.state.jumpQueued = controls.state.dashQueued = controls.state.waveQueued = false;
		},
	});
	interactions.add(lookout.offer);
	keys.intercept(lookout.key, 95);
	engine.add({ order: ORDER.camera + 10, always: true, update: lookout.update });

	// Her bag: fish, seeds, crops and her watering can.
	const inventory = createInventory({
		slots: 24,
		grid: ui.bag,
		detail: ui.bagDetail,
		summary: ui.bagSummary,
		note: () => `${farm.coins} coins`,
	});
	for (const s of SPECIES)
		inventory.register({
			id: `fish-${s.id}`,
			name: s.name,
			kind: 'fish',
			description: s.blurb,
			color: s.body,
			sell: s.price,
			icon: () => fishing.iconFor(s.id),
			actions: [
				{
					label: 'Let one go',
					run: (id) => {
						if (inventory.remove(id)) fishing.toast(`The ${s.name} swims off.`);
					},
				},
			],
		});

	const fishing = createFishing({
		renderer,
		scene,
		camera,
		figure,
		root: player.root,
		modelUrl: canvas.dataset.fishModel ?? '',
		toon,
		// Up on Cloudrest it's the lake she fishes in; down here, the sea.
		waterAt: (x, z) => (skyIsle.aboard ? skyWaterAt(x, z, pos.y) : groundAt(x, z) < -0.5 ? 0 : null),
		ripple: water.ripple,
		pos,
		canStand: () => ready && !building?.busy && player.grounded && !player.swimming && !blocks.on && !farm.busy && !farm.shopOpen && !forge.busy && !forge.dialogOpen && !talk.talking && Math.hypot(player.vel.x, player.vel.z) < 0.6,
		rod: () => (forge.has('rod') ? { lo: 0.15, hi: 0.9, speed: 1.45 } : { lo: 0.25, hi: 0.85, speed: 1 }),
		heading: () => player.heading,
		towardCamera,
		waters: (x, z) => ({
			deep: groundAt(x, z) < -3.5,
			islet: Math.hypot(x - ISLET.x, z - ISLET.z) < 48,
			pier: deckAt(pos.x, pos.z) > -Infinity,
			sky: skyIsle.aboard,
		}),
		onCatch: (s) => inventory.add(`fish-${s.id}`),
		onIcons: () => inventory.render(),
	});

	const farm = createFarm({
		renderer,
		scene,
		figure,
		toon,
		inventory,
		modelUrl: canvas.dataset.farmModel ?? '',
		centre: GARDEN_SITE,
		angle: GARDEN_SITE.yaw,
		market: MARKET_SITE,
		groundAt,
		addFeature,
		pos,
		towardCamera,
		canAct: () => ready && player.grounded && !player.swimming && !fishing.active && !menu.isOpen && !talk.talking && !forge.busy && !forge.dialogOpen,
		toast: (text) => fishing.toast(text),
		keeper: { name: 'Pebble', talk: () => npc.open() },
		onTrade: () => npc.cheer(),
		canHolds: () => (forge.has('can') ? 12 : 5),
		powerReach: REACH,
	});

	// The forge in the cottage’s side yard: ore to mine in the hills (E), and the anvil to make things at.
	const forge = createForge({
		renderer,
		scene,
		toon,
		theme,
		figure,
		inventory,
		modelUrl: canvas.dataset.forgeModel ?? '',
		site: FORGE_SITE,
		places: layout.places,
		addFeature,
		pos,
		canAct: () => ready && player.grounded && !player.swimming && !fishing.active && !farm.busy && !farm.shopOpen && !menu.isOpen && !talk.talking,
		toast: (text) => fishing.toast(text),
		onUpgrade: (id) => showUpgrade(id),
		more: (item) =>
			item === 'sprinkler'
				? machines.sprinklers() < MAX_SPRINKLERS
				: item === 'windmill'
					? power.windmills() < MAX_WINDMILLS
					: item === 'drill'
						? power.drills() < power.veinCount
						: item === 'belt'
							? power.belts() < MAX_BELTS
							: item === ORE_HOPPER
								? power.hoppers() + inventory.count(ORE_HOPPER) < MAX_ORE_HOPPERS
								: true,
		drilled: (vein) => power.drilled(vein),
	});
	/** What an upgrade looks like on her: a steel can, a sky-blue reel, a sky-blue (or rainbow)
	 * glider, a lantern at her shoulder. (The Rift Compass is for the grey place, which reads it there.) */
	const showUpgrade = (id: Upgrade) => {
		if (id === 'can') figure.tint('Can', '#c9d3e8');
		if (id === 'rod') figure.tint('Reel', '#9fe3ff');
		if (id === 'glider' && !forge.has('prism')) player.paintGlider('#9fe3ff', '#fdfbff');
		if (id === 'prism') player.paintGlider('#ff7aa8', '#ffb36b', '#ffd84d', '#8fe08a', '#6fd0ff', '#b48cff');
		if (id === 'helper') machines.helperArrived();
		if (id === 'lantern') lantern.show();
	};
	const lantern = createLantern({ scene, toon, theme, pos, turn: () => player.turn });

	// The cottage faces the garden across the homestead, with a working wardrobe on the porch.
	const house = createHouse({
		scene,
		toon,
		figure,
		modelUrl: canvas.dataset.houseModel ?? '',
		site: HOUSE_SITE,
		places: layout.places,
		addFeature,
		pos,
		canAct: () => ready && player.grounded && !player.swimming && !fishing.active && !farm.busy && !farm.shopOpen && !forge.busy && !forge.dialogOpen && !menu.isOpen && !talk.talking,
		toast: (text) => fishing.toast(text),
	});
	interactions.add(house.offer);
	// Back out of the house (/home): on the porch, just out of the door, facing out, with the camera
	// out in front of her (and a little to one side), looking back at her and the house.
	if (new URLSearchParams(location.search).get('from') === 'home') {
		pos.set(house.doorStep.x, house.doorStep.y, house.doorStep.z);
		player.face(house.outward);
		orbit.yaw = house.outward + 0.6;
		params.delete('from');
		history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
	}

	// The garden's machines: sprinklers where four plots meet, and Sprocket by the harvest crate.
	const machines = createMachines({
		inventory,
		garden: farm.garden,
		groundAt,
		addFeature,
		removeFeature,
		scene,
		pos,
		canAct: () => ready && player.grounded && !player.swimming && !fishing.active && !farm.busy && !farm.shopOpen && !forge.busy && !forge.dialogOpen && !menu.isOpen && !talk.talking,
		toast: (text) => fishing.toast(text),
		figure,
		swimming: () => player.swimming,
		selectBuild: () => fromBag('sprinkler'),
		aim: buildAim.sample,
	});
	// Stone blocks to build with: anywhere out on the island but the places that are kept clear.
	const keptClear = layout.places.filter((p) => ['lighthouse', 'camp', 'stones', 'garden', 'house', 'village', 'forge', 'windspout'].includes(p.id));
	const blocks = createBlocks({
		scene,
		toon,
		inventory,
		figure,
		pos,
		canAct: () =>
			ready && player.grounded && !player.swimming && !skyIsle.aboard && !machines.carrying && !fishing.active && !farm.busy && !farm.shopOpen && !forge.busy && !forge.dialogOpen && !menu.isOpen && !talk.talking,
		open: (x, z) => roomy(x, z, 0.7) && !power.beltAt(x, z) && keptClear.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + 1),
		toast: (text) => fishing.toast(text),
		selectBuild: () => fromBag(STONE_BLOCK),
		aim: buildAim,
	});
	// Windmills up in the hills, and the drills they power on the ore veins.
	const power = createPower({
		renderer,
		scene,
		toon,
		inventory,
		figure,
		modelUrl: canvas.dataset.powerModel ?? '',
		ore: { id: ORE, color: '#c0703f' },
		veins: forge.veinSource,
		hopper: forge.hopperSpot,
		groundAt,
		addFeature,
		removeFeature,
		pos,
		canAct: () =>
			ready && player.grounded && !player.swimming && !skyIsle.aboard && !fishing.active && !farm.busy && !farm.shopOpen && !forge.busy && !forge.dialogOpen && !menu.isOpen && !talk.talking,
		canCarry: () => !player.swimming && !skyIsle.aboard,
		// Clear of trees and rocks, of her blocks, and of the places that are kept clear.
		open: (x, z) =>
			roomy(x, z, 1) &&
			[[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].every(([dx, dz]) => blockGround(x + dx, z + dz) === -Infinity) &&
			keptClear.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + 2),
		// Belts may run up to the forge (its hopper is there), but not through the other kept places.
		openForBelt: (x, z) =>
			roomy(x, z, 0.25) && blockGround(x, z) === -Infinity && keptClear.every((p) => p.id === 'forge' || Math.hypot(p.x - x, p.z - z) > p.r + 0.5),
		toast: (text) => fishing.toast(text),
		closeMenu: () => menu.close(),
		selectBuild: fromBag,
		aim: buildAim.sample,
	});
	for (const id of ['can', 'rod', 'glider', 'helper', 'lantern', 'prism'] as const) if (forge.has(id)) showUpgrade(id);
	farm.setMachines(machines.machines);
	// Gearblooms grow only where there's power.
	farm.setPower(power.poweredAt);
	// One controller owns all construction. An invalid placement is still an exclusive
	// offer, rather than letting E fall through to the shop, bed, campfire or normal wave.
	function fromBag(item: BuildItem) {
		menu.close();
		return building?.select(item) ?? false;
	}
	const canBuild = () => ready && engine.running && player.grounded && !player.swimming
		&& !skyIsle.aboard && !campfire.active && !lookoutCamera.active && !wall.breaking && !house.dressing
		&& !fishing.active && !farm.busy && !farm.shopOpen && !forge.busy && !forge.dialogOpen
		&& !menu.isOpen && !talk.talking;
	building = createBuildMode({
		canBuild,
		putAway: () => { blocks.stop(); machines.stop(); power.stop(); },
		choose(item) {
			if (item === STONE_BLOCK) blocks.start();
			else if (item === 'sprinkler') machines.start();
			else power.select(item);
		},
		placement(item) {
			if (item === STONE_BLOCK) return blocks.offer();
			if (item === 'sprinkler') return machines.buildOffer();
			return power.buildOffer();
		},
		take(item) {
			if (item === STONE_BLOCK) blocks.take();
			else if (item === 'sprinkler') machines.take();
			else power.takeBuild(item);
		},
	});
	const buildToggle = $<HTMLButtonElement>('[data-build-toggle]');
	const buildPanel = $('[data-build-picker]');
	const buildActive = $('[data-build-active]');
	const buildSelection = $('[data-build-selection]');
	const buildRemove = $<HTMLButtonElement>('[data-build-remove]');
	const buildDone = $<HTMLButtonElement>('[data-build-done]');
	const buildStatus = $('[data-build-status]');
	const buildButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-build-item]')];
	const refreshBuild = () => {
		const open = !!building?.pickerOpen;
		const selected = building?.selected;
		const showActive = !!selected && !open && !menu.isOpen;
		if (buildToggle?.getAttribute('aria-expanded') !== String(open)) buildToggle?.setAttribute('aria-expanded', String(open));
		if (buildPanel) buildPanel.hidden = !open;
		if (buildActive) buildActive.hidden = !showActive;
		document.body.classList.toggle('building', !!building?.busy);
		if (buildRemove) buildRemove.disabled = !showActive || !canBuild();
		if (showActive && selected && buildSelection) {
			const button = buildButtons.find((entry) => entry.dataset.buildItem === selected);
			const name = button?.querySelector('[data-build-ko]')?.textContent ?? inventory.def(selected)?.name ?? selected;
			const label = `${name} · ${inventory.count(selected)}`;
			if (buildSelection.textContent !== label) buildSelection.textContent = label;
		}
		if (buildStatus) {
			const line = open ? pick({ en: 'Choose a piece', ko: '설치할 물건을 고르세요' })
				: showActive ? pick({ en: 'Placement active', ko: '설치 중' })
					: '';
			if (buildStatus.textContent !== line) buildStatus.textContent = line;
		}
		if (!open) return;
		for (const button of buildButtons) {
			const id = button.dataset.buildItem as BuildItem;
			const pressed = String(selected === id);
			if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
			const count = button.querySelector('[data-build-count]');
			const number = String(inventory.count(id));
			if (count && count.textContent !== number) count.textContent = number;
		}
	};
	buildToggle?.addEventListener('click', () => { building?.togglePicker(); refreshBuild(); });
	$('[data-build-close]')?.addEventListener('click', () => { building?.closePicker(); refreshBuild(); buildToggle?.focus(); });
	buildRemove?.addEventListener('click', () => building?.remove());
	buildDone?.addEventListener('click', () => { building?.finish(); refreshBuild(); buildToggle?.focus(); });
	for (const button of buildButtons) button.addEventListener('click', () => {
		const id = button.dataset.buildItem as BuildItem;
		if (!BUILD_ITEMS.includes(id) || !building?.select(id)) return;
		refreshBuild();
		buildToggle?.focus({ preventScroll: true });
	});

	interactions.add(power.offer); // Collect ore normally; installing and taking machines is Build-only.
	interactions.add(forge.offer);
	interactions.add(machines.offer);
	interactions.add(farm.offer);

	// Cloudrest, up in the sky: crystals to gather (E), and a chest at the top of the spire.
	const skyIsle = createSkyIsle({ scene, toon, theme, inventory, pos, addFeature, modelUrl: canvas.dataset.skyModel ?? '', toast: (text) => fishing.toast(text) });
	interactions.add(skyIsle.offer);

	// The rift at the standing stones, open on a night after she's been to the top of Cloudrest.
	const rift = createIslandRift({
		scene,
		theme,
		stones: layout.STONES,
		pos,
		canAct: () => ready && player.grounded && !player.swimming && !fishing.active && !farm.busy && !forge.busy && !menu.isOpen && !talk.talking,
	});
	interactions.add(rift.offer);

	// Hollis, on a ledge of one of the crags under Cloudrest.
	const touch = matchMedia('(pointer: coarse)').matches;
	const showDash = () => {
		if (ui.dash) ui.dash.hidden = false;
		for (const el of document.querySelectorAll<HTMLElement>('[data-dash-help]')) el.hidden = false;
	};
	if (canDash()) showDash();
	const owl = createOwl({
		scene,
		toon,
		crags: skyIsle.crags,
		addFeature,
		pos,
		talk,
		night: isNight,
		canAct: () => ready && player.grounded && !fishing.active && !menu.isOpen && !talk.talking,
		toast: (text) => fishing.toast(text),
		arrive: () => explore.announce('Under the Rock', owl?.met ? null : 'Somebody lives here'),
		learned: () => {
			showDash();
			fishing.toast(touch ? 'Nixchan can dash! Tap » to dart ahead.' : 'Nixchan can dash! Press Q to dart ahead.');
		},
	});
	if (owl) interactions.add(owl.offer);

	// Parmen, the tortoise on the islet, who talks her into knocking on the screen: the island's
	// way back out to the 3D home.
	const overHer = new THREE.Vector3();
	const wall = createFourthWall({
		renderer,
		scene,
		camera,
		to: inSite('/experimental/?from=island'),
		say: (text) => talk.bubble(text, overHer.set(pos.x, pos.y + 2.3, pos.z), 3),
		knock: () => (controls.state.waveQueued = true),
	});
	const tortoise = createTortoise({
		scene,
		toon,
		modelUrl: canvas.dataset.tortoiseModel ?? '',
		groundAt,
		addFeature,
		pos,
		talk,
		night: isNight,
		canAct: () => ready && player.grounded && !player.swimming && !fishing.active && !menu.isOpen && !talk.talking && !wall.breaking,
		breakWall: () => {
			// The camera settles where it is, a little lower and closer, for her to look out of.
			orbit.yaw = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
			orbit.pitch = 0.18;
			orbit.distance = Math.min(orbit.distance, 6);
			wall.go();
		},
	});
	interactions.add(tortoise.offer);

	// Pebble, who keeps the stand, behind its counter.
	const npc = createNpc({
		scene,
		camera,
		toon,
		modelUrl: canvas.dataset.otterModel ?? '',
		spot: farm.keeperSpot,
		groundAt,
		pos,
		talk,
		openShop: () => farm.openShop(),
		facts: () => {
			const sellable = { count: 0, value: 0, name: null as string | null };
			let seeds = 0;
			for (const [id, n] of inventory.entries()) {
				const def = inventory.def(id);
				if (def?.sell) {
					sellable.count += n;
					sellable.value += def.sell * n;
					sellable.name ??= def.name;
				}
				if (def?.kind === 'seed') seeds += n;
			}
			return {
				night: isNight(),
				caughtKinds: fishing.caughtKinds(),
				fishKinds: SPECIES.length,
				hasCaught: fishing.hasCaught,
				found: explore.found,
				sellable,
				seeds,
				garden: farm.summary(),
				forged: forge.has,
				sprinklers: machines.sprinklers(),
				owlMet: owl?.met ?? false,
			};
		},
	});
	addFeature({ x: farm.keeperSpot.x, z: farm.keeperSpot.z, r: 0.4 });
	inventory.render();

	// Ashen ore she carried back from the grey place goes into her bag (as much as there's room
	// for; the rest waits until there is).
	const carried = loadJSON('monoCarried');
	let broughtHome = 0;
	if (typeof carried === 'number' && carried > 0) {
		let left = Math.floor(carried);
		while (left > 0 && inventory.add(ASHEN_ORE)) {
			left--;
			broughtHome++;
		}
		saveJSON('monoCarried', left);
		inventory.render();
	}
	// And any ashen lily seeds she found in the ore.
	const seeds = loadJSON('monoSeeds');
	if (typeof seeds === 'number' && seeds > 0) {
		let left = Math.floor(seeds);
		while (left > 0 && inventory.add('seed-ashen')) left--;
		saveJSON('monoSeeds', left);
		inventory.render();
	}

	// ---------- exploring, and the menu ----------

	const explore = createExplore(
		{
			banner: $('[data-banner]'),
			bannerName: $('[data-banner-name]'),
			bannerNote: $('[data-banner-note]'),
			map: $<HTMLCanvasElement>('[data-map]'),
			atlasMap: $<HTMLCanvasElement>('[data-atlas-map]'),
			atlasCount: $('[data-atlas-count]'),
		},
		layout.places,
	);
	const menu = createMenu({
		root: ui.atlas,
		close: ui.atlasClose,
		onOpen: () => {
			building?.closePicker();
			refreshBuild();
			controls.clearKeys();
			fishing.release();
		},
		onShow: (tab) => {
			if (tab !== 'map') return;
			explore.sizeAtlas();
			explore.drawAtlas(pos, player.turn);
		},
	});
	$('[data-map-open]')?.addEventListener('click', () => menu.open('map'));

	theme.start();
	// For trying things out in development: where she is, and Hollis's ledge.
	if (import.meta.env.DEV) Object.assign(window, { island: { engine, nix, pos, player, owl, orbit, blocks, inventory, house, layout, npc, skyIsle, rift, theme, renderer, scene, camera, groundAt } });

	// Who the camera frames her with: whoever she's talking to, or what she's working at.
	const { focus } = nix;
	focus.add(() => (npc.talking ? { ...npc.spot, facing: npc.facing } : null));
	focus.add(() => (owl?.talking ? { ...owl.spot, facing: owl.facing } : null));
	focus.add(() => (tortoise.talking ? { ...tortoise.spot, facing: tortoise.facing } : null));
	focus.add(() => house.framing);
	focus.add(() => forge.framing);

	// ---------- the frame ----------
	// In the engine's order (nixkit/engine.ts): she moves (ORDER.player), then the island's rules, then
	// what moves whether or not she's here yet, the camera (ORDER.camera), the sky and sea round it
	// (ORDER.light), and the maps.

	engine.add({
		resize() {
			explore.sizeMinimap();
			if (menu.isOpen) explore.sizeAtlas();
		},
	});

	let greeted = false;
	engine.add({
		order: ORDER.game,
		update(dt, time) {
			if (!greeted) {
				greeted = true;
				explore.announce("Nixchan's Island", fromRift ? 'Back where there\u2019s colour' : 'Go wherever you like');
				if (broughtHome) fishing.toast(`${broughtHome} ashen ore, carried home from the grey place.`);
				if (menu.firstVisit) menu.open('help');
			}
			fishing.update(dt, time);
			farm.update(dt);
			machines.update(dt, time);
			power.update(dt, time);
			npc.update(dt);
			owl?.update(dt, time);
			tortoise.update(dt);
			talk.update(dt);
			hands.update();
			if (building?.busy && (player.swimming || skyIsle.aboard)) building.finish();
			blocks.update(time);
			refreshBuild();
			interactions.update();
		},
	});
	engine.add({
		order: ORDER.effects + 10,
		always: true,
		update(dt, time) {
			landmarks.update(time, dt);
			skyIsle.update(time, dt);
			rift.update(time, dt);
			lantern.update(time, dt);
			forge.update(time, dt);
			house.update(dt);
		},
	});
	engine.add({
		order: ORDER.light,
		always: true,
		update(dt, time) {
			sky.update(time, camera, pos);
			water.update(time, dt);
		},
	});
	let mapClock = 0;
	engine.add({
		order: ORDER.hud,
		update(dt) {
			mapClock -= dt;
			if (mapClock > 0) return;
			mapClock = 0.1;
			explore.update(pos, player.turn);
			if (menu.isOpen && menu.tab === 'map') explore.drawAtlas(pos, player.turn);
		},
	});

	const coOp = $<HTMLButtonElement>('[data-coop]');
	const coOpStatus = $('[data-coop-status]');
	if (coOp && coOpStatus) engine.add({ always:true, order:ORDER.effects,
		update:connectIsland(scene,canvas.dataset.model ?? '', () => {
			if (!ready) return null;
			const speed=Math.hypot(player.vel.x,player.vel.z);
			return { x:pos.x, y:pos.y, z:pos.z, yaw:Math.atan2(Math.sin(player.turn),Math.cos(player.turn)),
				pose:player.swimming ? (speed>.3?'Swim':'Tread') : speed>3?'Run':speed>.25?'Walk':'Idle' };
		},coOp,coOpStatus),
	});
	await engine.start();
}
