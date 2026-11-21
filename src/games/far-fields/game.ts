// Far Fields: the sun has fallen into an endless night. It lies by Nixchan's feet, about as big as
// her head and nearly out, and wherever it is, it's day: round it, and wherever it's been (light.ts).
// The rest of the land, hills, woods and shores that go on for ever (noise.ts, land.ts, streamed in
// chunks round her), is dark.
//
// She can take it up and carry it, and the day goes along with her and stays behind her as a lit
// path; but it's heavy, so she can't glide or dash with it, nor swim. Or she can set it down, and
// the higher she sets it, the wider its day spreads; then she's free to run and glide out into the
// dark with only an ember of it, which burns down until she's back in the day (and when it goes
// out, she finds herself back by the sun).
//
// Out in the dark lie sparks of the sun (sparks.ts), glowing from far off. Each one makes it bigger
// and its day wider. Overhead hangs the hole it fell from, ringed with gold, with a thread of light
// hanging down from it to a peak (sky.ts). With five sparks, set down on that peak, it goes back up
// into the sky, and it's day everywhere.
import * as THREE from 'three';
import type { GameContext } from '../../lib/nixkit/meta';
import { createChunks } from '../../lib/nixkit/chunks';
import { combineWorlds } from '../../lib/nixkit/world';
import { pick } from '../../lib/nixkit/lang';
import { createLandMaker, SIZE } from './land';
import { height, PEAK } from './noise';
import { createLight, type Stamp } from './light';
import { createSun } from './sun';
import { createNightSky } from './sky';
import { createSparkLook, sparkPlaces, SPARKS_NEEDED } from './sparks';
import { createFieldsUi, type Offer } from './ui';

/** How far round her the land is loaded, and where the haze hides its edge. */
const RADIUS = 250;
const FOG: [number, number] = [90, 240];
const SWIM = { swimIn: -1.35, swimOut: -1.2 };
/** How far round the sun the day reaches while she carries it, and how much more for each spark. */
const CARRY_R = 9;
const CARRY_PER_SPARK = 1.2;
/** Set down, its day reaches this far on flat ground, and this much further for each metre it
 * stands above the land round about; never more than MAX_R (before its sparks). */
const GROUND_R = 16;
const PER_METRE = 2;
const MAX_R = 64;
/** How much wider its day is for each spark. */
const SPARK_WIDENS = 0.1;
/** How far the lit path behind her reaches each side (of the day round her). */
const TRAIL = 0.75;
/** How long her ember lasts in the dark, in seconds, and how far round her it lights. */
const EMBER_LASTS = 45;
const EMBER_R: [number, number] = [2.2, 6.5];
/** How near she must be to the sun to take it up. */
const REACH = 2.4;
/** How near the peak's top it must be set down to go back up (and how far below the top). */
const TOP_REACH = 24;
const TOP_BELOW = 12;
const SUN_HOME = new THREE.Vector3(1.8, 0, 3.4);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export default function start({ createGame, store }: GameContext) {
	// ---------- what's remembered ----------
	const savedSun = store.get('sun') as { x?: unknown; z?: unknown; carried?: unknown } | undefined;
	let carried = savedSun?.carried === true;
	const sunAt = new THREE.Vector3(finite(savedSun?.x) ? savedSun.x : SUN_HOME.x, 0, finite(savedSun?.z) ? savedSun.z : SUN_HOME.z);
	const stamps: Stamp[] = (Array.isArray(store.get('stamps')) ? (store.get('stamps') as unknown[]) : []).filter(
		(s): s is Stamp => Array.isArray(s) && s.length === 3 && s.every(finite),
	);
	const sparksTaken = new Set<number>((Array.isArray(store.get('sparks')) ? (store.get('sparks') as unknown[]) : []).filter((n): n is number => Number.isInteger(n)));
	let woke = store.get('woke') === true;
	let done = store.get('done') === true;
	const saved = store.get('where') as [number, number] | undefined;
	const startAt = Array.isArray(saved) && saved.length === 2 && saved.every(finite) ? new THREE.Vector3(saved[0], Math.max(0, height(saved[0], saved[1])), saved[1]) : new THREE.Vector3(0, height(0, 0), 0);
	/** Whether the sun's going back up into the sky (the end), and how much of her ember is left. */
	let rising = false;
	let ember = 1;
	const saveSun = () => store.set('sun', { x: Math.round(sunAt.x * 10) / 10, z: Math.round(sunAt.z * 10) / 10, carried });

	// ---------- day and night ----------
	const light = createLight(FOG);
	for (const s of stamps) light.stamp(s, true);
	let stampsDirty = false;
	/** Remembers a place the sun has lit, unless somewhere lit already has it covered. */
	function remember(s: Stamp) {
		for (let i = stamps.length - 1; i >= Math.max(0, stamps.length - 40); i--) {
			const o = stamps[i];
			if (Math.hypot(o[0] - s[0], o[1] - s[1]) + s[2] <= o[2] + 0.5) return;
		}
		s = [Math.round(s[0] * 10) / 10, Math.round(s[1] * 10) / 10, Math.round(s[2] * 10) / 10];
		stamps.push(s);
		light.stamp(s);
		stampsDirty = true;
	}

	// ---------- the land ----------
	let makeLand: ReturnType<typeof createLandMaker>['make'];
	const chunks = createChunks({
		size: SIZE,
		radius: RADIUS,
		sea: SWIM,
		load(place) {
			const land = makeLand(place);
			return { object: land.group, world: land.world, dispose: () => land.dispose() };
		},
	});

	// ---------- the game ----------
	const game = createGame({
		spawn: { pos: startAt, heading: 0 },
		world: (parts) => combineWorlds(chunks.world, parts.world),
		canGlide: () => !carried,
		canDash: () => !carried,
		carrying: () => carried && !rising,
		emotes: {},
		onInteract: () => {
			if (!offer?.go) return false;
			const go = offer.go;
			offer = null;
			go();
			return true;
		},
	});
	if (!game) return;
	const { hud, toon, scene, camera, player } = game;
	(scene as THREE.Scene & { fogNode?: unknown }).fogNode = light.fogNode;
	const ramp = toon().gradientMap!;
	makeLand = createLandMaker(toon, light.bloomMaterial(ramp)).make;
	chunks.attach(game.engine, () => player.pos);

	// The light in the day is always the day's, whatever the time is where she's playing.
	const daylight = () => {
		game.sky.sun.color.set('#fff1d6');
		game.sky.sun.intensity = 2.3;
		game.sky.hemi.color.set('#ffffff');
		game.sky.hemi.groundColor.set('#9fb3d9');
		game.sky.hemi.intensity = 1.45;
	};
	game.sky.clock.on(daylight);
	daylight();

	const peakTop = new THREE.Vector3(PEAK.x, height(PEAK.x, PEAK.z), PEAK.z);
	const sky = createNightSky(scene, peakTop);

	// The sea: one sheet at y = 0 that goes along under her.
	const sea = new THREE.Mesh(new THREE.PlaneGeometry(RADIUS * 4, RADIUS * 4).rotateX(-Math.PI / 2), toon({ color: '#5fb3e8', transparent: true, opacity: 0.82 }));
	sea.position.y = -0.05;
	sea.receiveShadow = true;
	scene.add(sea);

	// ---------- the sun ----------
	const sun = createSun();
	scene.add(sun.root);
	const groundAt = (x: number, z: number) => Math.max(0, game.world.groundAt(x, z, 999) > -Infinity ? game.world.groundAt(x, z, 999) : height(x, z));
	/** How far its day reaches where it is now. */
	const sparkWidth = () => 1 + sparksTaken.size * SPARK_WIDENS;
	const carryR = () => CARRY_R + sparksTaken.size * CARRY_PER_SPARK;
	function groundR(x: number, z: number) {
		// How far it stands above the land round about.
		const y = height(x, z);
		let round = 0;
		for (let a = 0; a < 16; a++) round += Math.max(0, height(x + Math.cos(a * 0.39) * 45, z + Math.sin(a * 0.39) * 45));
		const above = Math.max(0, y - round / 16);
		return Math.min(MAX_R, GROUND_R + above * PER_METRE) * sparkWidth();
	}
	/** The day round it, on its way to `want` (it spreads out, or draws in). */
	let reach = woke ? (carried ? carryR() : groundR(sunAt.x, sunAt.z)) : 3.5;
	let want = reach;
	sun.setSize(1 + sparksTaken.size * 0.08);
	sun.root.visible = !done;
	if (!carried) sunAt.y = height(sunAt.x, sunAt.z);

	const lastDry = new THREE.Vector3().copy(sunAt);
	let trailFrom = new THREE.Vector3().copy(sunAt);

	function takeUp() {
		carried = true;
		want = carryR();
		trailFrom.copy(sunAt);
		saveSun();
		if (!woke) {
			woke = true;
			store.set('woke', true);
			game!.react('surprised');
			hud.banner(pick({ en: 'It’s warm', ko: '따뜻해요' }), pick({ en: 'Set it down up high, and its day spreads wider (E)', ko: '높은 곳에 내려놓을수록 빛이 넓게 퍼져요 (E)' }));
		}
	}

	function setDown(at: THREE.Vector3) {
		carried = false;
		sunAt.set(at.x, groundAt(at.x, at.z), at.z);
		want = groundR(sunAt.x, sunAt.z);
		remember([sunAt.x, sunAt.z, want * 0.92]);
		saveSun();
		hud.flash();
		// On the peak, under the ring: it goes back up, if it's strong enough.
		if (Math.hypot(sunAt.x - PEAK.x, sunAt.z - PEAK.z) < TOP_REACH && sunAt.y > peakTop.y - TOP_BELOW) {
			if (sparksTaken.size >= SPARKS_NEEDED) return rise();
			hud.banner(
				pick({ en: 'It tries to rise…', ko: '해가 떠오르려다…' }),
				pick({ en: `…and sinks back. It needs more sparks (✦ ${sparksTaken.size}/${SPARKS_NEEDED})`, ko: `…다시 내려앉았어요. 조각이 더 필요해요 (✦ ${sparksTaken.size}/${SPARKS_NEEDED})` }),
			);
			game!.react('sad');
			bounce = 1;
		}
	}
	let bounce = 0;

	// ---------- going back up ----------
	let risen = 0;
	const riseFrom = new THREE.Vector3();
	const above = new THREE.Vector3();
	function rise() {
		rising = true;
		risen = 0;
		riseFrom.copy(sun.root.position);
		game!.react('happy');
		hud.banner(pick({ en: 'It’s rising', ko: '해가 떠올라요' }), '');
	}
	function risenAll() {
		rising = false;
		done = true;
		store.set('done', true);
		sun.root.visible = false;
		showTally();
		hud.banner(pick({ en: 'Morning', ko: '아침이에요' }), pick({ en: 'The fields go on for ever. Go and see them', ko: '들판은 끝없이 이어져요. 마음껏 둘러보세요' }));
		game!.react('happy');
	}
	const setDay = (d: number) => {
		light.uniforms.day.value = d;
		sky.setDay(d);
	};
	setDay(done ? 1 : 0);

	// ---------- sparks ----------
	const sparkLook = createSparkLook();
	const sparks = sparkPlaces()
		.filter((s) => !sparksTaken.has(s.id))
		.map((s) => {
			const look = sparkLook(s.at);
			look.group.visible = !done;
			scene.add(look.group);
			return { ...s, look };
		});
	const tally = hud.stat('');
	const showTally = () => tally.set(done ? '☀' : `✦ ${sparksTaken.size}/${SPARKS_NEEDED}`);
	showTally();
	function takeSpark(s: (typeof sparks)[number]) {
		sparks.splice(sparks.indexOf(s), 1);
		s.look.group.removeFromParent();
		sparksTaken.add(s.id);
		store.set('sparks', [...sparksTaken]);
		sun.setSize(1 + sparksTaken.size * 0.08);
		want = carried ? carryR() : groundR(sunAt.x, sunAt.z);
		if (!carried) remember([sunAt.x, sunAt.z, want * 0.92]);
		ember = 1;
		showTally();
		hud.flash();
		game!.react('happy');
		const n = sparksTaken.size;
		if (n === SPARKS_NEEDED)
			hud.banner(pick({ en: `✦ ${n} sparks`, ko: `해의 조각 ✦ ${n}` }), pick({ en: 'It’s strong enough now. Take it up the peak under the ring', ko: '이제 충분히 강해요. 빛 고리 아래 봉우리로 데려가세요' }));
		else hud.banner(pick({ en: `✦ ${n}/${SPARKS_NEEDED}`, ko: `해의 조각 ✦ ${n}/${SPARKS_NEEDED}` }), pick({ en: 'Far off, the sun grows warmer', ko: '멀리서 해가 조금 더 따뜻해졌어요' }));
	}

	// ---------- what she can do here ----------
	const ui = createFieldsUi(() => game.interact());
	let offer: Offer | null = null;
	const ahead = new THREE.Vector3();
	function whatsOnOffer(): Offer | null {
		if (done || rising) return null;
		const p = player.pos;
		if (carried) {
			if (!player.grounded) return null;
			ahead.set(p.x + Math.sin(player.heading) * 0.9, 0, p.z + Math.cos(player.heading) * 0.9);
			if (groundAt(ahead.x, ahead.z) < 0.4) return { label: pick({ en: 'Not in the water', ko: '물에는 내려놓을 수 없어요' }) };
			return { label: pick({ en: 'Set the sun down', ko: '해 내려놓기' }), go: () => setDown(ahead.clone()) };
		}
		if (Math.hypot(sunAt.x - p.x, sunAt.z - p.z) < REACH && Math.abs(sunAt.y - p.y) < 2.5) return { label: pick({ en: 'Take up the sun', ko: '해 업기' }), go: takeUp };
		return null;
	}

	// ---------- the ember ----------
	function emberOut() {
		ember = 1;
		const back = new THREE.Vector3(sunAt.x - 1.6, 0, sunAt.z - 1.6);
		back.y = groundAt(back.x, back.z);
		game!.engine.waitFor(chunks.settle(back.x, back.z));
		game!.teleport(back, Math.atan2(sunAt.x - back.x, sunAt.z - back.z));
		hud.flash();
		hud.toast(pick({ en: 'The ember went out… back by the sun', ko: '불씨가 꺼져서 해 곁으로 돌아왔어요' }));
	}
	const dayAt = (x: number, z: number) => {
		const d = Math.hypot(x - sunAt.x, z - sunAt.z);
		return Math.max(light.at(x, z), d < reach * 0.8 ? 1 : 0);
	};

	// ---------- every frame ----------
	let saveIn = 3;
	let stampsIn = 2;
	game.onUpdate((dt, time) => {
		const p = player.pos;

		// The day round the sun spreads out to where it's going to be, or draws in.
		reach += (want - reach) * Math.min(1, dt * (want > reach ? 0.9 : 3));

		// Where the sun is: in her arms, on the ground, or going back up into the sky.
		if (rising) {
			// It lifts off slowly over her head, then goes up into the ring, and the day comes; the
			// camera draws back and looks up to watch it go.
			risen = Math.min(1, risen + dt / 10);
			const lift = Math.min(1, risen / 0.35);
			const fly = Math.max(0, (risen - 0.35) / 0.65);
			const t = fly * fly * (3 - 2 * fly);
			above.copy(riseFrom).setY(riseFrom.y + 7 * lift * lift * (3 - 2 * lift));
			sun.root.position.lerpVectors(above, sky.ringAt, t);
			sun.setSize(1 + sparksTaken.size * 0.08 + lift * 1.5 + t * 30);
			setDay(Math.min(1, Math.max(0, (risen - 0.3) / 0.6)));
			game.orbit.pitch += (-0.32 - game.orbit.pitch) * Math.min(1, dt * 1.5);
			game.orbit.distance += (8.5 - game.orbit.distance) * Math.min(1, dt * 1.5);
			if (risen >= 1) risenAll();
		} else if (carried) {
			sunAt.set(p.x + Math.sin(player.heading) * 0.48, p.y + 1.05, p.z + Math.cos(player.heading) * 0.48);
			sun.root.position.copy(sunAt);
			sun.lamp.intensity = 6;
			if (player.grounded && groundAt(p.x, p.z) > 0.4) lastDry.copy(p);
			// It won't go in the water: she leaves it on the shore.
			if (player.swimming) {
				setDown(lastDry.clone());
				hud.toast(pick({ en: 'The sun won’t go in the water', ko: '해는 물에 들어가지 않아요' }));
			}
			// And the day it brings stays behind it.
			if (Math.hypot(sunAt.x - trailFrom.x, sunAt.z - trailFrom.z) > 3) {
				remember([sunAt.x, sunAt.z, reach * TRAIL]);
				trailFrom.copy(sunAt);
			}
		} else {
			bounce = Math.max(0, bounce - dt * 0.8);
			const hop = Math.sin(bounce * Math.PI) * 3.5;
			sun.root.position.set(sunAt.x, sunAt.y + 0.6 + Math.sin(time * 1.4) * 0.08 + hop, sunAt.z);
			sun.lamp.intensity = woke ? 14 : 4;
		}
		sun.update(dt, time);
		light.uniforms.sun.value.copy(sun.root.position);
		light.uniforms.sunR.value = done ? 0 : reach;
		light.update(dt);

		// Her ember: whole in the day, burning down in the dark.
		const inDay = done || carried || dayAt(p.x, p.z) > 0.5;
		if (inDay) ember = Math.min(1, ember + dt * 0.6);
		else if (woke && !rising) ember -= dt / EMBER_LASTS;
		if (ember <= 0) emberOut();
		light.uniforms.nix.value.copy(p);
		light.uniforms.emberR.value = EMBER_R[0] + (EMBER_R[1] - EMBER_R[0]) * Math.max(0, ember);
		ui.ember(inDay ? 1 : ember);

		// Sparks: they turn and glow, and she takes them when she comes to them.
		for (const s of [...sparks]) {
			s.look.update(time + s.id);
			if (!done && Math.hypot(s.at.x - p.x, s.at.z - p.z) < 1.7 && Math.abs(s.at.y - (p.y + 0.9)) < 2) takeSpark(s);
		}

		offer = whatsOnOffer();
		ui.offer(offer);

		sky.update(camera, p, time);
		sea.position.x = Math.round(p.x / 32) * 32;
		sea.position.z = Math.round(p.z / 32) * 32;

		// Where she is (and the sun, if she has it) and where it's been, now and then.
		saveIn -= dt;
		if (saveIn <= 0 && player.grounded) {
			saveIn = 3;
			store.set('where', [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]);
			if (carried) saveSun();
		}
		stampsIn -= dt;
		if (stampsIn <= 0 && stampsDirty) {
			stampsIn = 2;
			stampsDirty = false;
			store.set('stamps', stamps);
		}
	});

	game.loaded.then(() => {
		if (done) hud.banner('Far Fields', pick({ en: 'Morning, for ever', ko: '끝없는 아침' }));
		else if (!woke) hud.banner('Far Fields', pick({ en: 'The sun has fallen. It’s by your feet — take it up (E)', ko: '해가 떨어졌어요. 발밑에 있어요 — 업어 보세요 (E)' }));
		else hud.banner('Far Fields', pick({ en: `✦ ${sparksTaken.size}/${SPARKS_NEEDED} — the ring in the sky is where it fell from`, ko: `✦ ${sparksTaken.size}/${SPARKS_NEEDED} — 하늘의 빛 고리가 해가 떨어진 곳이에요` }));
	}, () => {});
	game.start();
}
