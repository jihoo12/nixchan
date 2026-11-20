// Original night-market and riverfront geometry. Water and piers stop outside the playable bank.
import * as THREE from 'three';
import type { TownBlock } from './town-layout';

export function buildRiverDistrict(scene: THREE.Scene): TownBlock[] {
	const root = new THREE.Group();
	root.name = 'Lantern Town • Moonwater Quay';
	scene.add(root);
	const blocks: TownBlock[] = [];
	const standard = (color: string, roughness = .88) => new THREE.MeshStandardMaterial({ color, roughness });
	const lit = (color: string, emissive: string, intensity: number) =>
		new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: .62 });
	const stone = standard('#363b54'), rim = standard('#6b7084'), paving = standard('#42475e');
	const accent = standard('#58637b'), wood = standard('#573d46'), timber = standard('#8b6359');
	const metal = standard('#263342'), blue = standard('#284960');
	const lamp = lit('#ffd798', '#f6a036', .95), ivory = lit('#ffedbb', '#edb95c', .48);
	const aqua = lit('#8fcad0', '#4ea5b4', .42);
	const grass = standard('#3f5b54'), foliage = standard('#456e67');
	const clay = standard('#9a5e59'), indigo = standard('#535c89'), violet = standard('#775976');
	const olive = standard('#6e7d56'), red = standard('#a04e5d'), pink = standard('#bd7885');
	const cream = standard('#cead85'), tile = standard('#33566d');
	const gleam = new THREE.MeshBasicMaterial({ color: '#678da4', transparent: true, opacity: .31, depthWrite: false });
	const goldRipple = new THREE.MeshBasicMaterial({ color: '#d49a61', transparent: true, opacity: .46, depthWrite: false });

	const unitBox = new THREE.BoxGeometry(1, 1, 1);
	const oct = new THREE.CylinderGeometry(.5, .5, 1, 8);
	const taper = new THREE.CylinderGeometry(.35, .5, 1, 8);
	const cone = new THREE.ConeGeometry(.5, 1, 8);
	const blob = new THREE.IcosahedronGeometry(.5, 1);
	const canvas = new Map<THREE.BufferGeometry, Map<THREE.Material, THREE.Matrix4[]>>();
	const o = new THREE.Object3D();
	const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number,
		w: number, h: number, d: number, yaw = 0, pitch = 0, roll = 0) => {
		let mats = canvas.get(g);
		if (!mats) canvas.set(g, mats = new Map());
		let entries = mats.get(m);
		if (!entries) mats.set(m, entries = []);
		o.position.set(x, y, z); o.rotation.set(pitch, yaw, roll); o.scale.set(w, h, d);
		o.updateMatrix(); entries.push(o.matrix.clone());
	};
	const box = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, pitch = 0, roll = 0) =>
		add(unitBox, m, x, y, z, w, h, d, yaw, pitch, roll);
	const block = (x: number, z: number, w: number, d: number, bottom: number, top: number) =>
		blocks.push({ x, z, w, d, bottom, top });

	// Slate approach strips are above the base just enough to avoid flicker. No walkway boxes.
	for (const z of [32, 58]) {
		box(paving, -27.5, .024, z, 37, .036, 4.2);
		for (const dz of [-2.08, 2.08]) box(rim, -27.5, .051, z + dz, 37, .025, .1);
		for (let x = -45; x < -10; x += 2.1) box(accent, x, .045, z, .035, .008, 4);
	}
	box(paving, -44, .049, 44.5, 4.7, .021, 51);
	for (const x of [-46.28, -41.72]) box(rim, x, .069, 44.5, .1, .016, 51);
	for (let z = 20; z < 70; z += 1.9) box(accent, -44, .063, z, 4.45, .006, .032);
	box(tile, -50.1, .026, 44.5, 8.15, .035, 51);
	for (let z = 20; z < 70; z += 1.3) box(paving, -50.2, .048, z, 7.72, .008, .024);

	// A river BELOW the bank, fully outside x=-56. Reflections are tapering static dashes, not shaders.
	box(standard('#203951', .33), -75, -.44, 47, 38, .07, 69);
	box(blue, -55.7, -.22, 47, .52, .52, 58);
	let seed = 2507;
	const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
	for (let i = 0; i < 110; i++)
		box(gleam, -57.5 - rand() * 21, -.397, 15 + rand() * 63, .34 + rand() * 1.63, .006, .025 + rand() * .038);
	for (const z of [32, 58]) for (let i = 0; i < 17; i++)
		box(goldRipple, -57.3 - i * .36, -.391, z + (rand() - .5) * (.5 + i * .09), .45 + rand() * .75, .004, .045 + rand() * .05);

	const lantern = (x: number, y: number, z: number, size = 1) => {
		add(oct, lamp, x, y, z, .38 * size, .49 * size, .38 * size, Math.PI / 8);
		add(taper, metal, x, y + .29 * size, z, .5 * size, .13 * size, .5 * size);
		add(oct, timber, x, y - .27 * size, z, .4 * size, .08 * size, .4 * size);
	};
	// Rail and viewing bays. Low posts leave the river visible without allowing walk-off.
	// Shore railing has a wide opening shared by the two bridge landings.
	for (let z = 20; z <= 70; z += 2.7) {
		if (z > 54.15 && z < 64.8) continue;
		box(stone, -54.75, .53, z, .27, 1.06, .27);
		box(rim, -54.75, 1.08, z, .36, .13, .36);
		if (Math.round((z - 20) / 2.7) % 4 === 0) lantern(-54.75, 1.43, z, .68);
	}
	for (const [from,to] of [[19.82,54.15],[64.8,69.18]]) {
		for (const y of [.42, .78]) box(metal, -54.75, y, (from+to)/2, .11, .09, to-from);
		block(-54.75, (from+to)/2, .36, to-from, 0, 1.145);
	}
	// Decorative cantilevered dock ends over the river, not a route through the railing.
	for (const z of [32]) {
		for (let i = 0; i < 11; i++) box(i % 3 ? timber : wood, -60.6 + i * .37, -.16 + Math.sin(i / 10 * Math.PI) * .23, z, .35, .12, 2.55);
		for (const dz of [-1.28, 1.28]) {
			for (let i = 0; i < 4; i++) {
				const x = -60.74 + i * 1.25;
				box(wood, x, .22, z + dz, .15, 1.17, .15);
				if (i === 0 || i === 2) lantern(x, .94, z + dz, .67);
			}
			box(timber, -58.86, .61, z + dz, 3.92, .084, .105);
		}
	}

	// The octagonal beacon is a recognisable skyline landmark from the shops and from both walks.
	const bx = -51.5, bz = 33.6;
	add(oct, rim, bx, .19, bz, 3.25, .38, 3.25);
	add(taper, stone, bx, .64, bz, 2.35, .54, 2.35);
	add(taper, indigo, bx, 2.65, bz, 1.72, 3.55, 1.72);
	for (const y of [1.4, 2.5, 3.6, 4.42]) add(oct, rim, bx, y, bz, 1.58 - (y - 1.4) * .062, .105, 1.58 - (y - 1.4) * .062);
	add(oct, metal, bx, 4.56, bz, 2.5, .23, 2.5);
	add(oct, lamp, bx, 5.08, bz, 1.58, .84, 1.58, Math.PI / 8);
	for (let i = 0; i < 8; i++) {
		const a = i * Math.PI / 4;
		box(metal, bx + Math.cos(a) * .79, 5.05, bz + Math.sin(a) * .79, .09, 1.1, .09);
	}
	add(cone, tile, bx, 5.76, bz, 2.35, .85, 2.35, Math.PI / 8);
	add(blob, ivory, bx, 6.29, bz, .39, .48, .39);
	block(bx, bz, 3.25, 3.25, 0, .38);
	block(bx, bz, 2.35, 2.35, .38, 4.56);
	const glow = new THREE.PointLight('#ffbb68', 23, 14, 2);
	glow.position.set(bx, 5.29, bz); root.add(glow);

	// Stall row, with low counters, striped awnings and individually arranged trays.
	const stall = (x: number, z: number, awning: THREE.Material, sign: THREE.Material, north: boolean, n: number) => {
		const dir = north ? -1 : 1;
		box(stone, x, .11, z, 4.15, .22, 2.82);
		box(blue, x, 1.25, z - dir * 1.21, 3.8, 2.3, .16);
		box(wood, x, .58, z + dir * .62, 3.8, .76, .62);
		box(timber, x, 1.02, z + dir * .62, 4, .14, .86);
		for (const dx of [-1.88, 1.88]) for (const dz of [-1.24, 1.24])
			box(timber, x + dx, 1.33, z + dz, .17, 2.48, .18);
		for (let i = 0; i < 10; i++) {
			const xx = x - 1.94 + i * .43;
			box(i % 2 ? awning : cream, xx, 2.52, z, .43, .095, 3.31, 0, dir * .16);
			box(i % 2 ? awning : cream, xx, 2.19, z + dir * 1.62, .43, .25, .085);
		}
		box(wood, x, 1.88, z + dir * 1.05, 1.51, .43, .1);
		for (let i = -1; i <= 1; i++) add(blob, sign, x + i * .34, 1.89, z + dir * 1.13, .22, .23, .12, i * .2);
		lantern(x - 1.63, 1.83, z + dir * 1.31, .65);
		lantern(x + 1.63, 1.83, z + dir * 1.31, .65);
		for (let i = 0; i < 4; i++) {
			const xx = x - 1.42 + i * .92;
			box(i % 2 ? cream : clay, xx, 1.133, z + dir * .62, .68, .12, .49);
			for (let j = 0; j < 3; j++) add(blob, [pink, olive, ivory, aqua][(i + n) % 4],
				xx + (j - 1) * .159, 1.254 + (j === 1 ? .024 : 0), z + dir * (.59 + (j % 2) * .11), .18, .17, .18);
		}
		block(x, z, 4.15, 2.82, 0, 2.5);
	};
	for (let i = 0; i < 4; i++) {
		const x = -37.4 + i * 6.45;
		stall(x, 41.4, [red, indigo, olive, violet][i], i % 2 ? aqua : lamp, false, i);
		stall(x, 50.2, [olive, red, violet, indigo][i], i % 2 ? lamp : aqua, true, i + 1);
	}
	// Lantern posts line the promenade; larger gaps leave all cross streets open.
	for (const z of [22, 27, 38, 46, 53, 66.2, 69]) {
		box(metal, -46.9, 1.28, z, .14, 2.56, .14);
		box(timber, -46.55, 2.51, z, .85, .12, .13);
		lantern(-46.22, 2.28, z, .76);
		block(-46.9, z, .24, .24, 0, 2.56);
	}
	for (const z of [25.45, 43.5, 68.1]) {
		box(stone, -50.1, .29, z, 2.35, .58, 1.36);
		box(rim, -50.1, .57, z, 2.51, .13, 1.49);
		for (let i = 0; i < 5; i++) add(blob, i % 2 ? foliage : grass,
			-51 + .45 * i, .86, z + (rand() - .5) * .31, .76, .61 + .26 * rand(), .77);
		block(-50.1, z, 2.51, 1.49, 0, .64);
	}

	// Roofs, railings, paving and all repeated details use one draw per material/primitive pair.
	for (const [geometry, materials] of canvas) for (const [material, entries] of materials) {
		const batch = new THREE.InstancedMesh(geometry, material, entries.length);
		entries.forEach((m, i) => batch.setMatrixAt(i, m));
		batch.instanceMatrix.needsUpdate = true; root.add(batch);
	}
	return blocks;
}
