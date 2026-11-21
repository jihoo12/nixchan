// Far Fields: Nixchan wanders a world without an edge. Hills, woods, shores and snowy peaks go on
// for ever (noise.ts), streamed in 64 m chunks round her by nixkit/chunks.ts (land.ts). Motes of
// light are scattered about to find, and in every region there's a landmark (landmarks.ts): a ring
// of standing stones, a watchtower to climb, an elder tree, or a windmill whose wind carries her
// glider up to a mote high in the sky. The compass points to the nearest she hasn't found yet.
//
// What she's found, and where she was, are remembered. H takes her home.
import * as THREE from 'three';
import type { GameContext } from '../../lib/nixkit/meta';
import { createChunks } from '../../lib/nixkit/chunks';
import { combineWorlds } from '../../lib/nixkit/world';
import { josa, pick } from '../../lib/nixkit/lang';
import { createLandMaker, SIZE } from './land';
import { createLandmarkMaker, landmarkOf, landmarksAround, regionOf, REGION, type Landmark } from './landmarks';
import { height, rng } from './noise';

/** How far round her the land is loaded, and where the fog hides its edge. */
const RADIUS = 250;
const FOG: [number, number] = [70, 230];
/** How close she has to come to a landmark to have found it. */
const FIND = 13;
/** How likely a chunk is to have a mote lying about in it. */
const MOTE_CHANCE = 0.45;
const SWIM = { swimIn: -1.35, swimOut: -1.2 };

interface Mote {
	id: string;
	mesh: THREE.Mesh;
	base: number;
	spin: number;
}

export default function start({ createGame, store }: GameContext) {
	const motesTaken = new Set<string>(Array.isArray(store.get('motes')) ? (store.get('motes') as string[]) : []);
	const found = new Set<string>(Array.isArray(store.get('found')) ? (store.get('found') as string[]) : []);
	const saved = store.get('at') as [number, number] | undefined;
	const home = new THREE.Vector3(0, height(0, 0), 0);
	const startAt = Array.isArray(saved) && saved.length === 2 && saved.every(Number.isFinite) ? new THREE.Vector3(saved[0], Math.max(0, height(saved[0], saved[1])), saved[1]) : home.clone();

	// The motes lying about in the loaded chunks.
	const motes = new Set<Mote>();
	let makeLand: ReturnType<typeof createLandMaker>['make'];
	let makeLandmark: ReturnType<typeof createLandmarkMaker>['build'];
	let moteGeo: THREE.BufferGeometry;
	let moteMat: THREE.Material;

	const chunks = createChunks({
		size: SIZE,
		radius: RADIUS,
		sea: SWIM,
		load(place) {
			// The landmark, if this chunk is where its region's stands, with room cleared for it.
			const there = landmarkOf(Math.floor(place.cx / REGION), Math.floor(place.cz / REGION));
			const l = there && there.cx === place.cx && there.cz === place.cz ? there : null;
			const land = makeLand(place, l ? { x: l.x, z: l.z, r: 14 } : undefined);
			const updates: ((dt: number, time: number) => void)[] = [];
			const spots: { id: string; at: THREE.Vector3 }[] = [];
			if (l) {
				const built = makeLandmark(l, land);
				spots.push(...built.motes);
				if (built.update) updates.push(built.update);
			}
			// Now and then a mote lying in the grass (not in the sea, and not on top of a landmark).
			const r = rng(place.cx, place.cz, 404);
			if (r() < MOTE_CHANCE) {
				const x = place.x0 + 6 + r() * (SIZE - 12);
				const z = place.z0 + 6 + r() * (SIZE - 12);
				const y = land.world.groundAt(x, z);
				if (y > 0.6 && !(l && Math.hypot(x - l.x, z - l.z) < 12)) spots.push({ id: `m${place.cx},${place.cz}`, at: new THREE.Vector3(x, y + 1, z) });
			}
			const mine: Mote[] = [];
			for (const s of spots) {
				if (motesTaken.has(s.id)) continue;
				const mesh = new THREE.Mesh(moteGeo, moteMat);
				mesh.position.copy(s.at);
				mesh.castShadow = true;
				land.group.add(mesh);
				const m = { id: s.id, mesh, base: s.at.y, spin: r() * 6 };
				mine.push(m);
				motes.add(m);
			}
			return {
				object: land.group,
				world: land.world,
				update: updates.length ? (dt, time) => updates.forEach((u) => u(dt, time)) : undefined,
				dispose() {
					for (const m of mine) motes.delete(m);
					land.dispose();
				},
			};
		},
	});

	const game = createGame({
		spawn: { pos: startAt, heading: 0 },
		world: (parts) => combineWorlds(chunks.world, parts.world),
		canGlide: () => true,
		canDash: () => true,
		emotes: {},
		onKey(key) {
			if (key === 'h') goHome();
		},
	});
	if (!game) return;
	const { hud, toon, scene, camera, player } = game;
	makeLand = createLandMaker(toon).make;
	makeLandmark = createLandmarkMaker(toon).build;
	moteGeo = new THREE.OctahedronGeometry(0.38, 0);
	moteMat = toon({ color: '#ffe36b', emissive: new THREE.Color('#ffd84d').multiplyScalar(0.55) });
	game.sky.fog.near = FOG[0];
	game.sky.fog.far = FOG[1];
	chunks.attach(game.engine, () => player.pos);

	// The sea: one sheet at y = 0 that goes along under her.
	const sea = new THREE.Mesh(new THREE.PlaneGeometry(RADIUS * 4, RADIUS * 4).rotateX(-Math.PI / 2), toon({ color: '#5fb3e8', transparent: true, opacity: 0.82 }));
	sea.position.y = -0.05;
	sea.receiveShadow = true;
	scene.add(sea);

	const moteStat = hud.stat('');
	const foundStat = hud.stat('');
	const compass = hud.stat('');
	const showCounts = () => {
		moteStat.set(`✦ ${motesTaken.size}`);
		foundStat.set(`⌂ ${found.size}`);
	};
	showCounts();

	function goHome() {
		if (!game!.ready || game!.paused) return;
		game!.engine.waitFor(chunks.settle(home.x, home.z));
		game!.teleport(home, 0);
		hud.toast(pick({ en: 'Home again', ko: '집으로 돌아왔어요' }));
	}

	// The landmark the compass points to: the nearest she hasn't found, looked for afresh now and
	// then (it's a little work), and how to point at it from where the camera's looking.
	let target: Landmark | null = null;
	let lookedFor = Infinity;
	const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
	const view = new THREE.Vector3();
	const findTarget = () => {
		let best: Landmark | null = null;
		let bestD = Infinity;
		for (const l of landmarksAround(player.pos.x, player.pos.z, 3)) {
			if (found.has(l.id)) continue;
			const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
			if (d < bestD) {
				bestD = d;
				best = l;
			}
		}
		target = best;
	};
	findTarget();

	let saveIn = 3;
	const region = { x: NaN, z: NaN };
	game.onUpdate((dt) => {
		const p = player.pos;
		// Motes: they turn and bob, and she picks up any she comes near.
		for (const m of motes) {
			m.spin += dt * 2;
			m.mesh.rotation.y = m.spin;
			m.mesh.position.y = m.base + Math.sin(m.spin * 1.3) * 0.15;
			const dy = m.mesh.position.y - (p.y + 0.8);
			if (Math.hypot(m.mesh.position.x - p.x, m.mesh.position.z - p.z) < 1.5 && Math.abs(dy) < 2.1) {
				motes.delete(m);
				m.mesh.removeFromParent();
				motesTaken.add(m.id);
				store.set('motes', [...motesTaken]);
				showCounts();
				hud.flash();
				if (motesTaken.size % 10 === 0) {
					hud.banner(`✦ ${motesTaken.size}`, pick({ en: 'motes of light found', ko: '빛 조각을 모았어요' }));
					game.react('happy');
				} else hud.toast(pick({ en: 'A mote of light ✦', ko: '빛 조각을 찾았어요 ✦' }));
			}
		}

		// Landmarks: found once she's close.
		const [rx, rz] = regionOf(p.x, p.z);
		lookedFor += dt;
		if (rx !== region.x || rz !== region.z || lookedFor > 2) {
			region.x = rx;
			region.z = rz;
			lookedFor = 0;
			findTarget();
		}
		for (const l of landmarksAround(p.x, p.z, 1)) {
			if (found.has(l.id) || Math.hypot(l.x - p.x, l.z - p.z) > FIND) continue;
			found.add(l.id);
			store.set('found', [...found]);
			showCounts();
			hud.banner(l.name, pick({ en: 'Found a landmark', ko: '새로운 곳을 발견했어요' }));
			game.react('surprised');
			findTarget();
		}

		// The compass.
		if (target) {
			camera.getWorldDirection(view);
			const toward = Math.atan2(target.x - p.x, target.z - p.z) - Math.atan2(view.x, view.z);
			const k = (((Math.round(-toward / (Math.PI / 4)) % 8) + 8) % 8);
			const d = Math.hypot(target.x - p.x, target.z - p.z);
			compass.set(`${ARROWS[k]} ${d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}`);
		} else compass.set(pick({ en: '✓ all near found', ko: '✓ 근처를 다 찾았어요' }));

		// The sea goes along under her.
		sea.position.x = Math.round(p.x / 32) * 32;
		sea.position.z = Math.round(p.z / 32) * 32;

		// Where she is, now and then, to come back to next time.
		saveIn -= dt;
		if (saveIn <= 0 && player.grounded) {
			saveIn = 3;
			store.set('at', [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]);
		}
	});

	game.loaded.then(() => {
		if (found.size || motesTaken.size) {
			hud.banner('Far Fields', pick({ en: `✦ ${motesTaken.size} · ⌂ ${found.size} — welcome back`, ko: `✦ ${motesTaken.size} · ⌂ ${found.size} — 다시 왔네요` }));
		} else {
			const near = target as Landmark | null;
			hud.banner('Far Fields', near
				? pick({ en: `Follow the compass to the ${near.name}`, ko: `나침반을 따라 ${josa(near.name, '을', '를')} 찾아가 봐요` })
				: pick({ en: 'Wander, and find motes of light', ko: '돌아다니며 빛 조각을 찾아봐요' }));
		}
	}, () => {});
	game.start();
}
