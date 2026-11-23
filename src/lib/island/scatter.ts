// Rocks, trees, bushes and flowers scattered over the island, the same every visit. Rocks go first,
// since she can climb them; then the trees round them. Each kind is one instanced mesh.
import * as THREE from 'three';
import { addFeature, removeFeature, roomy, type Feature } from './features';
import type { Layout } from './layout';
import { colored, palmGeometry, pineGeometry, rockGeometry, roundTreeGeometry, type Toon } from './look';
import { ISLET, naturalSlopeUp, naturalTerrainAt, nearPier, terrainAt } from './terrain';
import { clearOfSettlements } from './settlements';
import { ORE_VEINS, OLD_ORE_HOPPER } from './orefield';
import { TAU, fbm, rng } from '../nixkit/util';

export function scatter(scene: THREE.Scene, toon: Toon, layout: Layout) {
	const { clearOfSceneryBaseline: clearOfPlaces, clearOfStart } = layout;
	const generated: Feature[] = [];
	// Register baseline candidates (even the ones the new lawns will remove), so every later
	// pick consumes the historical random stream. Keep the surviving colliders grounded.
	const baseline = (f: Feature) => { generated.push(f); addFeature(f); };
	const clear = (x: number, z: number, gap: number) =>
		clearOfSettlements(x, z, gap)
		&& ORE_VEINS.every(([vx, , vz]) => Math.hypot(x - vx, z - vz) > 1.1 + gap)
		&& Math.hypot(x - OLD_ORE_HOPPER.x, z - OLD_ORE_HOPPER.z) > .55 + gap;
	const rand = rng(12);
	const randomLand = (radius: number) => {
		const a = rand() * TAU;
		const r = Math.sqrt(rand()) * radius;
		return { x: Math.cos(a) * r, z: Math.sin(a) * r };
	};

	const rocks: { x: number; z: number; r: number; top: number; base: number; rot: number }[] = [];
	const bigRocks: typeof rocks = [];
	for (let tries = 0; tries < 4500 && rocks.length < 100; tries++) {
		const { x, z } = randomLand(93);
		const t = naturalTerrainAt(x, z);
		if (t < -0.4 || nearPier(x, z, 2) || !clearOfStart(x, z, 6) || !clearOfPlaces(x, z, 3)) continue;
		// A handful are big flat-topped ones, each just low enough to jump up onto.
		const big = bigRocks.length < 12 && t > 1.5 && naturalSlopeUp(x, z) > 0.9;
		const r = big ? 1.8 + rand() * 0.6 : 0.5 + rand() * 1.1;
		if (!roomy(x, z, r + 1.5)) continue;
		const top = big ? 1.15 + rand() * 0.15 : r * (0.55 + rand() * 0.25);
		const rock = { x, z, r, top, base: terrainAt(x, z) - 0.12, rot: rand() * TAU };
		rocks.push(rock);
		if (big) bigRocks.push(rock);
		baseline({ x, z, r, dome: { base: rock.base, top } });
	}

	const palms: THREE.Matrix4[] = [];
	const trees: THREE.Matrix4[] = [];
	const pines: THREE.Matrix4[] = [];
	const snowyPines: THREE.Matrix4[] = [];
	const bushes: THREE.Matrix4[] = [];
	const flowers: { m: THREE.Matrix4; c: string }[] = [];
	{
		const q = new THREE.Quaternion();
		const up = new THREE.Vector3(0, 1, 0);
		const place = (x: number, y: number, z: number, s: number, sy = s) =>
			new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, rand() * TAU), new THREE.Vector3(s, sy, s));
		// A tree's trunk and the ball of its leaves, read off where it was placed: `at` is the middle
		// of the leaves and `r` their reach, both in the tree's own (unscaled) units.
		const tree = (m: THREE.Matrix4, trunk: number, at: [number, number, number], r: number) => {
			const s = new THREE.Vector3().setFromMatrixScale(m).x;
			const e = m.elements;
			const c = new THREE.Vector3(...at).applyMatrix4(m);
			baseline({ x: e[12], z: e[14], r: trunk * s, top: c.y, crown: { x: c.x, y: c.y, z: c.z, r: r * s } });
		};
		const PALM = (m: THREE.Matrix4) => tree(m, 0.35, [1.1, 4.6, 0], 2.1);
		const ROUND = (m: THREE.Matrix4) => tree(m, 0.4, [0, 3.6, 0], 1.7);
		const PINE = (m: THREE.Matrix4) => tree(m, 0.3, [0, 2.5, 0], 1.55);
		for (let tries = 0; tries < 20000; tries++) {
			const { x, z } = randomLand(96);
			const g = naturalTerrainAt(x, z);
			if (g < 0.4 || nearPier(x, z, 2.5) || !clearOfStart(x, z, 4.5) || !clearOfPlaces(x, z, 1)) continue;
			const up = naturalSlopeUp(x, z);
			const forest = fbm(x * 0.05 + 40, z * 0.05, 2);
			if (g < 2.4 && palms.length < 100 && rand() < 0.35) {
				if (!roomy(x, z, 2.2)) continue;
				const s = 0.85 + rand() * 0.35;
				const m = place(x, terrainAt(x, z) - 0.1, z, s);
				palms.push(m);
				PALM(m);
			} else if (g >= 2.4 && g < 8.5 && up > 0.78 && forest > -0.05 && trees.length < 270) {
				if (!roomy(x, z, 2.4)) continue;
				const s = 0.8 + rand() * 0.5;
				const m = place(x, terrainAt(x, z) - 0.1, z, s);
				trees.push(m);
				ROUND(m);
			} else if (g >= 8.5 && g < 15.5 && up > 0.72 && pines.length + snowyPines.length < 150) {
				if (!roomy(x, z, 1.8)) continue;
				const s = 0.8 + rand() * 0.45;
				const m = place(x, terrainAt(x, z) - 0.1, z, s);
				(g > 12.5 ? snowyPines : pines).push(m);
				PINE(m);
			}
		}
		for (let tries = 0; tries < 9000 && bushes.length < 250; tries++) {
			const { x, z } = randomLand(93);
			const g = naturalTerrainAt(x, z);
			if (g < 1.6 || g > 12 || nearPier(x, z, 1) || !roomy(x, z, 0.9) || !clearOfPlaces(x, z, 0.5)) continue;
			const s = 0.5 + rand() * 0.5;
			bushes.push(place(x, terrainAt(x, z) - 0.05, z, s, s * 0.7));
		}
		// The islet has a few palms of its own, leaning over the chest, and a couple of bushes.
		for (const [dx, dz, s] of [
			[3.4, -1.6, 1.05],
			[-2.8, 2.6, 0.9],
			[0.6, 4.4, 0.8],
		]) {
			const x = ISLET.x + dx;
			const z = ISLET.z + dz;
			const m = place(x, terrainAt(x, z) - 0.1, z, s);
			palms.push(m);
			PALM(m);
		}
		for (const [dx, dz] of [
			[2.2, 2.0],
			[-3.4, -1.2],
		]) {
			const x = ISLET.x + dx;
			const z = ISLET.z + dz;
			bushes.push(place(x, terrainAt(x, z) - 0.05, z, 0.7, 0.5));
		}
		const petals = ['#ffd84d', '#ff9ec7', '#ffffff', '#b9a6ff'];
		for (let tries = 0; tries < 9000 && flowers.length < 800; tries++) {
			const { x, z } = randomLand(90);
			const g = naturalTerrainAt(x, z);
			if (g < 1.8 || g > 11 || naturalSlopeUp(x, z) < 0.8 || fbm(x * 0.08, z * 0.08 + 70, 2) < 0.05 || !clearOfPlaces(x, z, -1.5)) continue;
			flowers.push({ m: place(x, terrainAt(x, z) + 0.12, z, 0.8 + rand() * 0.5), c: petals[Math.floor(rand() * petals.length)] });
		}
	}

	// Cull only close to the new yards, the lane, or a saved ore anchor; no tree moves
	// to a different shore and no ghost collider survives its removed mesh.
	const keepTree = (x: number, z: number) => clear(x, z, 2.1);
	const keepRock = (x: number, z: number, r: number) => clear(x, z, r + .4);
	for (const f of generated) if (!(f.dome ? keepRock(f.x, f.z, f.r) : keepTree(f.x, f.z))) removeFeature(f);
	const treesAt = (items: THREE.Matrix4[]) => items.filter((m) => keepTree(m.elements[12], m.elements[14]));
	const groundedRocks = rocks.map((r, i) => ({ ...r, originalIndex: i })).filter((r) => keepRock(r.x, r.z, r.r));

	const world = toon({ vertexColors: true });
	const instanced = (geo: THREE.BufferGeometry, items: THREE.Matrix4[], mat: THREE.Material = world, shadow = true) => {
		if (!items.length) return null;
		const mesh = new THREE.InstancedMesh(geo, mat, items.length);
		items.forEach((m, i) => mesh.setMatrixAt(i, m));
		mesh.castShadow = shadow;
		mesh.receiveShadow = true;
		mesh.computeBoundingSphere();
		scene.add(mesh);
		return mesh;
	};
	instanced(palmGeometry(), treesAt(palms));
	instanced(roundTreeGeometry(), treesAt(trees));
	instanced(pineGeometry(false), treesAt(pines));
	instanced(pineGeometry(true), treesAt(snowyPines));
	instanced(colored(new THREE.IcosahedronGeometry(0.8, 1), '#5fae5c'), bushes.filter((m) => clear(m.elements[12], m.elements[14], .65)));
	{
		const rockMesh = instanced(
			rockGeometry(),
			groundedRocks.map((r) => new THREE.Matrix4().compose(new THREE.Vector3(r.x, r.base, r.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot), new THREE.Vector3(r.r, r.top, r.r))),
		);
		const tint = new THREE.Color();
		groundedRocks.forEach((r, i) => rockMesh?.setColorAt(i, tint.set(r.r > 1.7 ? '#b4aed2' : r.originalIndex % 2 ? '#a29cc4' : '#9690b8')));
	}
	{
		const petals = flowers.filter(({ m }) => clear(m.elements[12], m.elements[14], .2));
		const geo = colored(new THREE.OctahedronGeometry(0.13, 0), '#ffffff');
		const mesh = instanced(
			geo,
			petals.map((f) => f.m),
			world,
			false,
		);
		const tint = new THREE.Color();
		petals.forEach((f, i) => mesh?.setColorAt(i, tint.set(f.c)));
	}
}
