import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../../lib/nixkit/game';
import type { Obstacle, World } from '../../lib/nixkit/world';

const STAGES = [
	{ x: -4.5, z: 0, color: '#92edce', turn: 0.20 },
	{ x: 4.5, z: -7.4, color: '#c8b7f2', turn: -0.20 },
	{ x: 0, z: -17, color: '#ffd993', turn: 0 },
] as const;
const SIDES = [7, 1.35, -4.3, -9.95, -15.6, -21.25];
const WIDTH = 17.8, FRONT = 10.5, BACK = -23;
const WHARF_FRONT = 32.5;
const WITNESSES = [
	{ id: 'ferryman', x: -5.1, z: 25.4, color: '#7fdec3', coat: '#30686a' },
	{ id: 'keeper', x: 5.2, z: 21, color: '#c4b2f0', coat: '#5b527a' },
	{ id: 'bellkeeper', x: -4.5, z: 14.5, color: '#ebc47e', coat: '#88654a' },
] as const;
export const tribunalWitnesses = WITNESSES.map(({ id, x, z }) => ({ id, pos: new THREE.Vector3(x, 0, z) })) as readonly {
	id: typeof WITNESSES[number]['id']; pos: THREE.Vector3;
}[];
const TAU = Math.PI * 2;
const Y = new THREE.Vector3(0, 1, 0);
export const tribunalSpawn = { pos: new THREE.Vector3(0, 0, 30.1), heading: Math.PI };
export const tribunalStations = STAGES.map(({ x, z }) => new THREE.Vector3(x, 0, z + 2.3)) as [
	THREE.Vector3, THREE.Vector3, THREE.Vector3,
];

const obstacles: readonly Obstacle[] = [
	...STAGES.map(({ x, z }) => ({ x, z, r: 0.88, top: 1.28 })),
	...SIDES.flatMap((z) => [-8.47, 8.47].map((x) => ({ x, z, r: 0.55, top: 5.6 }))),
	...WITNESSES.map(({ x, z }) => ({ x, z: z - 1.37, r: 0.43, top: 1.7 })),
	...[-4.9, 4.9].map((x) => ({ x, z: 11.0, r: 0.55, top: 4.25 })),
	{ x: -7.05, z: 24.38, r: 0.60, top: 1.2 },
	{ x: 6.62, z: 18.32, r: 1.87, top: 4.6 },
	{ x: -6.64, z: 12.69, r: 1.08, top: 6.6 },
];
const onFloor = (x: number, z: number) => Math.abs(x) <= WIDTH / 2 && z >= BACK && z <= WHARF_FRONT;
export const tribunalTerrain: World = {
	groundAt: (x, z) => onFloor(x, z) ? 0 : -Infinity,
	inside: (x, z) => Math.abs(x) < WIDTH / 2 - 0.32 && z > BACK + 0.84 && z < WHARF_FRONT - 0.32,
	ceilingAt: () => Infinity,
	nearby: () => obstacles,
};

const metal = (color: string, roughness = 0.62, metalness = 0.24) =>
	new THREE.MeshStandardMaterial({ color, roughness, metalness });
const ink = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({
	color, opacity, transparent: opacity < 1, depthWrite: opacity === 1, toneMapped: false,
});
function place(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
	const m = new THREE.Mesh(geometry, material);
	m.position.set(x, y, z);
	parent.add(m);
	return m;
}
function box(parent: THREE.Object3D, mat: THREE.Material, dims: readonly [number, number, number], x: number, y: number, z: number) {
	return place(parent, new THREE.BoxGeometry(...dims), mat, x, y, z);
}
function disc(parent: THREE.Object3D, mat: THREE.Material, top: number, bottom: number, h: number, y: number, count = 12) {
	return place(parent, new THREE.CylinderGeometry(top, bottom, h, count), mat, 0, y, 0);
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Stroke = readonly [THREE.Vector3, THREE.Vector3];
function strokes(root: THREE.Object3D, segments: readonly Stroke[], material: THREE.Material, radius: number) {
	const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, 1, 5), material, segments.length);
	const joint = new THREE.Object3D(), d = new THREE.Vector3();
	for (let i = 0; i < segments.length; i++) {
		const [a, b] = segments[i];
		d.subVectors(b, a);
		joint.position.copy(a).addScaledVector(d, 0.5);
		joint.scale.set(1, d.length(), 1);
		joint.quaternion.setFromUnitVectors(Y, d.normalize());
		joint.updateMatrix();
		mesh.setMatrixAt(i, joint.matrix);
	}
	mesh.instanceMatrix.needsUpdate = true;
	root.add(mesh);
	return mesh;
}
function ring(root: THREE.Object3D, r: number, tube: number, mat: THREE.Material, y = 0) {
	return place(root, new THREE.TorusGeometry(r, tube, 6, 56), mat, 0, y, 0);
}
function wheel(r: number, y: number, x = 0, z = 0, count = 32, a = 0, end = TAU) {
	const p = (i: number) => {
		const angle = a + (end - a) * (i / count);
		return v(x + r * Math.sin(angle), y, z + r * Math.cos(angle));
	};
	return Array.from({ length: count }, (_, i) => [p(i), p(i + 1)] as const);
}

// Pack the architecture by material and vertex layout, but leave translucent layers,
// animated groups and existing instanced batches alone.
function packStone(district: THREE.Group, exceptions: readonly THREE.Object3D[] = []) {
	const inMotion = new Set<THREE.Object3D>();
	for (const obj of exceptions) obj.traverse(child => inMotion.add(child));
	const pools = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
	district.updateWorldMatrix(true, true);
	const before = new THREE.Matrix4().copy(district.matrixWorld).invert();
	district.traverse(child => {
		if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || inMotion.has(child) || Array.isArray(child.material) || child.material.transparent) return;
		const geometry: THREE.BufferGeometry = child.geometry;
		const layout = Object.entries(geometry.attributes).map(([name, a]) => `${name}:${a.itemSize}:${a.array.constructor.name}`).sort().join('/');
		const key = `${child.material.id}|${geometry.index !== null}|${layout}`;
		if (pools.has(key)) pools.get(key)!.push(child);
		else pools.set(key, [child]);
	});
	const old = new Set<THREE.BufferGeometry>();
	const transform = new THREE.Matrix4();
	for (const parts of pools.values()) {
		if (parts.length < 2) continue;
		const copies = parts.map(part => part.geometry.clone().applyMatrix4(transform.multiplyMatrices(before, part.matrixWorld)));
		const combined = mergeGeometries(copies);
		for (const geo of copies) geo.dispose();
		if (!combined) continue;
		for (const part of parts) {
			old.add(part.geometry);
			part.removeFromParent();
		}
		district.add(new THREE.Mesh(combined, parts[0].material));
	}
	district.traverse(child => { if (child instanceof THREE.Mesh) old.delete(child.geometry); });
	for (const retired of old) retired.dispose();
}

function paintNight(game: Game, root: THREE.Group) {
	const { scene, sky } = game;
	const backdrop = document.createElement('canvas');
	backdrop.width = 2;
	backdrop.height = 256;
	const ctx = backdrop.getContext('2d');
	if (ctx) {
		const wash = ctx.createLinearGradient(0, 0, 0, 256);
		wash.addColorStop(0, '#090e21');
		wash.addColorStop(0.44, '#20253d');
		wash.addColorStop(0.77, '#46516a');
		wash.addColorStop(1, '#151f35');
		ctx.fillStyle = wash;
		ctx.fillRect(0, 0, 2, 256);
	}
	const texture = new THREE.CanvasTexture(backdrop);
	texture.colorSpace = THREE.SRGBColorSpace;
	const matte = new THREE.Color('#1d2a44');
	const fog = new THREE.Fog('#202941', 44, 108);
	const unsubscribe = sky.clock.on(() => {
		scene.background = ctx ? texture : matte;
		scene.fog = fog;
		sky.sun.castShadow = false;
		sky.sun.color.set('#e8dbd0');
		sky.sun.intensity = 2.25;
		sky.hemi.color.set('#cbd9f9');
		sky.hemi.groundColor.set('#5e647f');
		sky.hemi.intensity = 1.65;
	});
	game.engine.add({ order: Infinity, dispose() { unsubscribe(); texture.dispose(); } });

	// Two carefully spaced lines of horizon silhouettes suggest a world beyond the courtroom.
	const shadow = ink('#171e36');
	shadow.fog = false;
	const haze = ink('#27344f');
	haze.fog = false;
	for (const [row, mat] of [shadow, haze].entries()) {
		const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(), mat, 12);
		const dummy = new THREE.Object3D();
		for (let i = 0; i < 12; i++) {
			const h = 1.45 + Math.abs(Math.sin(i * 6.27 + row * 2.1)) * 4.35 + (i % 3) * 1.1;
			dummy.position.set((i - 5.5) * 8.8 + row * 3.1, h / 2 - 3.8, -67 - row * 14);
			dummy.scale.set(6 + (i % 3) * 2.1, h, 4);
			dummy.updateMatrix();
			towers.setMatrixAt(i, dummy.matrix);
		}
		towers.instanceMatrix.needsUpdate = true;
		root.add(towers);
	}
	const moonMat = ink('#dac9ae');
	moonMat.fog = false;
	place(root, new THREE.SphereGeometry(2.2, 36, 18), moonMat, -24, 16.7, -65);
}

const colors = {
	dark: '#232b43', tileA: '#343a53', tileB: '#3e475e',
	column: '#434b68', teal: '#395c64', gold: '#bca476', line: '#a6afcb',
};
function buildHall(root: THREE.Group) {
	const base = metal(colors.dark, 0.88, 0.08), jade = metal(colors.teal, 0.56, 0.22);
	const marble = metal(colors.column, 0.84, 0.07), gold = metal(colors.gold, 0.48, 0.39);
	const line = ink('#9a876f');
	const floorDark = (FRONT + BACK) / 2;
	box(root, base, [WIDTH + 0.75, 1.24, FRONT - BACK + 0.75], 0, -0.68, floorDark);
	box(root, gold, [WIDTH + 0.40, 0.10, FRONT - BACK + 0.40], 0, -0.26, floorDark);

	// Two batched marble tones with staggered sheen; seams stay shallow enough not to read as holes.
	for (let offset = 0; offset < 2; offset++) {
		const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(WIDTH / 8 - 0.026, 0.16, (FRONT - BACK) / 16 - 0.026), metal(offset === 0 ? colors.tileA : colors.tileB, 0.78, 0.09), 64);
		const dummy = new THREE.Object3D();
		let n = 0;
		for (let row = 0; row < 16; row++) for (let col = 0; col < 8; col++) {
			if (((row + col) & 1) !== offset) continue;
			dummy.position.set((col - 3.5) * (WIDTH / 8), -0.08, BACK + (row + 0.5) * (FRONT - BACK) / 16);
			dummy.updateMatrix();
			tiles.setMatrixAt(n++, dummy.matrix);
		}
		tiles.instanceMatrix.needsUpdate = true;
		root.add(tiles);
	}

	const trim: Stroke[] = [];
	for (const x of [-8.16, -7.97, 7.97, 8.16]) trim.push([v(x, 0.013, FRONT - 0.31), v(x, 0.013, BACK + 0.36)]);
	for (const z of [FRONT - 0.31, FRONT - 0.52, BACK + 0.36, BACK + 0.55]) trim.push([v(-8.16, 0.013, z), v(8.16, 0.013, z)]);
	strokes(root, trim, line, 0.012);

	const sculpt = new THREE.OctahedronGeometry(0.24);
	const lantern = ink('#f7d59b');
	for (const side of [-1, 1]) {
		for (const z of SIDES) {
			const support = new THREE.Group();
			support.position.set(side * 8.47, 0, z);
			root.add(support);
			box(support, marble, [1.13, 0.22, 1.13], 0, 0.11, 0);
			disc(support, gold, 0.46, 0.49, 0.10, 0.28, 8);
			disc(support, jade, 0.32, 0.39, 4.58, 2.61, 12);
			disc(support, gold, 0.39, 0.33, 0.12, 4.93, 8);
			box(support, marble, [0.96, 0.24, 0.96], 0, 5.09, 0);
			box(support, gold, [0.95, 0.07, 0.95], 0, 5.25, 0);
			box(support, jade, [0.14, 0.12, 0.39], -side * 0.39, 2.47, 0);
			place(support, sculpt, lantern, -side * 0.56, 2.67, 0);
		}
		box(root, marble, [0.49, 0.36, 29.4], side * 8.47, 5.44, -7.12);
		box(root, gold, [0.75, 0.075, 29.43], side * 8.47, 5.22, -7.12);
		// A low wall makes the platform limits legible without obscuring the skyline.
		box(root, base, [0.37, 0.48, 29], side * 8.66, 0.24, -7.15);
		box(root, jade, [0.49, 0.11, 29.1], side * 8.66, 0.49, -7.15);
	}
	box(root, base, [WIDTH, 0.55, 0.5], 0, 0.26, BACK + 0.22);
	box(root, gold, [WIDTH, 0.055, 0.47], 0, 0.55, BACK + 0.22);

	// Open arch of the final court. The recess permits a readable silhouette from spawn.
	const shell = new THREE.Shape();
	shell.moveTo(-3.27, 0); shell.lineTo(3.27, 0); shell.lineTo(3.27, 4.26);
	shell.quadraticCurveTo(3.21, 6.36, 0, 7.43);
	shell.quadraticCurveTo(-3.21, 6.36, -3.27, 4.26);
	shell.closePath();
	const aperture = new THREE.Path();
	aperture.moveTo(-2.84, 0.32); aperture.lineTo(-2.84, 4.04);
	aperture.quadraticCurveTo(-2.79, 5.91, 0, 6.91);
	aperture.quadraticCurveTo(2.79, 5.91, 2.84, 4.04);
	aperture.lineTo(2.84, 0.32); aperture.closePath();
	shell.holes.push(aperture);
	place(root, new THREE.ExtrudeGeometry(shell, { depth: 0.34, bevelEnabled: false, curveSegments: 18 }), gold, 0, 0, -22.32);
	const screen = new THREE.Shape();
	screen.moveTo(-2.79, 0.27); screen.lineTo(2.79, 0.27); screen.lineTo(2.79, 4.02);
	screen.quadraticCurveTo(2.79, 5.9, 0, 6.86); screen.quadraticCurveTo(-2.79, 5.9, -2.79, 4.02);
	screen.closePath();
	// Painted only from the front so an orbit from outside the room does not blank the screen.
	place(root, new THREE.ShapeGeometry(screen, 18), ink('#2e3e55'), 0, 0, -22.2);
	const seal = ring(root, 1.52, 0.029, ink('#b2a17f'), 3.84);
	seal.position.z = -22.13;
	const inner = ring(root, 1.32, 0.015, ink('#7187a0'), 3.84);
	inner.position.z = -22.08;
	const ruled: Stroke[] = [];
	for (let i = -3; i <= 3; i++) {
		const x = i * 0.31, r = 0.76 - Math.abs(i) * 0.12;
		ruled.push([v(x, 3.84 - r, -22.05), v(x, 3.84 + r, -22.05)]);
	}
	strokes(root, ruled, ink('#b4d4cf'), 0.025);
}

function stationArt(root: THREE.Group, i: number) {
	const { x, z, color, turn } = STAGES[i];
	const station = new THREE.Group();
	station.position.set(x, 0, z);
	station.rotation.y = turn;
	root.add(station);
	const gold = metal('#b8a77f', 0.49, 0.32), stone = metal(['#395f63', '#565474', '#635863'][i], 0.64, 0.11);
	const mark = ink(color);
	const glass = ink(color, 0.19);
	const lit = new THREE.Color(color), dim = new THREE.Color('#7f8297');

	disc(station, stone, 1.14, 1.22, 0.11, 0.055, 10);
	disc(station, gold, 0.99, 1.12, 0.08, 0.147, 10);
	disc(station, stone, 0.63, 0.82, 0.65, 0.51, 10);
	disc(station, gold, 0.79, 0.71, 0.09, 0.875, 10);
	const podium = box(station, stone, [1.5, 0.17, 0.97], 0, 1.00, 0.10);
	podium.rotation.x = -0.19;
	const tablet = box(station, gold, [1.43, 0.055, 0.88], 0, 1.085, 0.085);
	tablet.rotation.x = -0.19;
	const tabletInk = box(station, ink('#33465b'), [1.19, 0.03, 0.66], 0, 1.12, 0.075);
	tabletInk.rotation.x = -0.19;
	for (let n = 0; n <= i; n++) {
		const engraved = box(station, mark, [0.075, 0.15, 0.061], (n - i * 0.5) * 0.18, 0.61, 0.727);
		engraved.rotation.z = Math.PI / 4;
	}
	const ornament = new THREE.Group();
	ornament.position.y = 2.13;
	station.add(ornament);
	const litFrame = ring(ornament, 0.79, 0.026, gold);
	const liveFrame = ring(ornament, 0.72, 0.013, mark);
	const charmShape = new THREE.OctahedronGeometry(0.30, 0);
	const charm = place(ornament, charmShape, mark);
	const halo = place(ornament, charmShape, glass);
	halo.scale.setScalar(1.44);
	if (i === 0) {
		charm.scale.set(0.61, 1.25, 0.89);  // witness: one vertical reed
		halo.scale.set(0.98, 1.8, 1.25);
	} else if (i === 1) {
		charm.scale.set(0.63, 0.85, 0.64);  // counterwitness: two opposing pieces
		charm.position.x = -0.22;
		const twin = place(ornament, charmShape, mark, 0.22, 0, 0);
		twin.scale.copy(charm.scale);
	} else {
		charm.scale.set(1.23, 1.23, 0.71);  // ruling: one joined diamond
		ornament.scale.setScalar(1.29);
		ring(ornament, 0.90, 0.016, gold);
	}

	const etched: Stroke[] = [...wheel(1.35, 0.023, 0, 0, 36), ...wheel(1.55, 0.021, 0, 0, 36)];
	for (let q = 0; q < 12; q++) {
		const a = q / 12 * TAU;
		const p = (r: number) => v(r * Math.cos(a), 0.024, r * Math.sin(a));
		etched.push([p(1.39), p(1.51)]);
	}
	strokes(station, etched, mark, 0.009);
	return (t: number, stage: number, completed: number, reduce: boolean) => {
		const isCurrent = stage === i, done = completed > i;
		const clock = reduce ? 0 : t;
		mark.color.copy(dim).lerp(lit, done || isCurrent ? 1 : 0.24);
		liveFrame.rotation.y = 0.25 * Math.sin(clock * (isCurrent ? 0.72 : 0.29) + i);
		litFrame.rotation.y = -liveFrame.rotation.y * 0.49;
		charm.rotation.y = clock * (isCurrent ? 0.75 : 0.22) + i * 0.25;
		ornament.position.y = 2.13 + (isCurrent ? 0.086 * Math.sin(clock * 1.38) : 0);
		glass.opacity = done ? 0.20 : isCurrent ? 0.15 + 0.035 * Math.sin(clock * 1.93) : 0.04;
	};
}

function createPath(root: THREE.Group) {
	const locations = [v(0, 0, 8), ...tribunalStations];
	const points = locations.map((p) => p.clone().setY(0.022));
	const bands: Array<THREE.MeshBasicMaterial> = [];
	for (let i = 0; i < locations.length - 1; i++) {
		const a = points[i], b = points[i + 1];
		// The last path gives the second lectern's base a wide berth.
		const route = new THREE.CatmullRomCurve3(i === 2 ? [a, v(2.5, 0.022, -6.25), b] : [a, b]);
		const cross = (d: THREE.Vector3) => v(-d.z, 0, d.x);
		const traces: Stroke[] = [];
		for (const side of [-1, 1]) {
			let previous = a.clone().addScaledVector(cross(route.getTangentAt(0)), side * 0.55);
			for (let n = 1; n <= 20; n++) {
				const t = n / 20;
				const next = route.getPointAt(t).addScaledVector(cross(route.getTangentAt(t)), side * 0.55);
				traces.push([previous, next]);
				previous = next;
			}
		}
		for (let n = 0; n < 4; n++) {
			const t = 0.18 + n * 0.18;
			const c = route.getPointAt(t), d = route.getTangentAt(t), orthogonal = cross(d);
			const tip = c.clone().addScaledVector(d, 0.28);
			const tail = c.clone().addScaledVector(d, -0.14);
			traces.push([tail.clone().addScaledVector(orthogonal, -0.22), tip], [tail.clone().addScaledVector(orthogonal, 0.22), tip]);
		}
		const at = points[i + 1];
		traces.push(...wheel(0.44, 0.023, at.x, at.z, 24));
		const mat = ink('#717d94');
		bands.push(mat);
		strokes(root, traces, mat, 0.015);
	}
	const done = new THREE.Color('#cbb583');
	const quiet = new THREE.Color('#65718b');
	const colors = STAGES.map((stage) => new THREE.Color(stage.color));
	return (current: number, completed: number) => bands.forEach((mat, i) => mat.color.copy(i < completed ? done : current === i ? colors[i] : quiet));
}

// South of the tribunal, evidence has an address: the wharf, archive, and bell stair.
function buildWeir(root: THREE.Group) {
	const village = new THREE.Group();
	village.name = 'East Weir village';
	root.add(village);
	const slate = metal('#404b61', 0.86, 0.06);
	const masonry = metal('#4e5268', 0.73, 0.09);
	const grout = metal('#252e46', 0.88, 0.02);
	const teal = metal('#416976', 0.76, 0.1);
	const walnut = metal('#5e4e49', 0.88, 0.02);
	const bronze = metal('#b29a71', 0.52, 0.40);
	const gold = ink('#c8a977');
	const lantern = ink('#f1d2a1');
	const amberGlass = ink('#e7b383', 0.17);
	const stoneHouse = metal('#4c5c70', 0.80, 0.05);
	const moonlit = ink('#556f8f', 0.29);
	const midZ = (FRONT + WHARF_FRONT) * 0.5;
	const span = WHARF_FRONT - FRONT;
	box(village, slate, [WIDTH + 0.4, 0.71, span], 0, -0.43, midZ);
	box(village, grout, [WIDTH, 0.13, span + 0.015], 0, -0.067, midZ);
	function batchBoxes(geometry: THREE.BufferGeometry, material: THREE.Material, locations: readonly THREE.Vector3[]) {
		const crowd = new THREE.InstancedMesh(geometry, material, locations.length);
		const transform = new THREE.Matrix4();
		for (let i = 0; i < locations.length; i++) {
			transform.makeTranslation(locations[i].x, locations[i].y, locations[i].z);
			crowd.setMatrixAt(i, transform);
		}
		crowd.instanceMatrix.needsUpdate = true;
		village.add(crowd);
		return crowd;
	}
	for (let phase = 0; phase < 3; phase++) {
		const stones: THREE.Vector3[] = [];
		for (let row = 0; row < 14; row++) for (let col = 0; col < 11; col++) {
			if ((row * 2 + col + (row % 3 === 0 ? 1 : 0)) % 3 === phase) {
				stones.push(v((col - 5) * (WIDTH / 11), -0.05, FRONT + (row + 0.5) * span / 14));
			}
		}
		batchBoxes(new THREE.BoxGeometry(WIDTH / 11 - 0.025, 0.10, span / 14 - 0.025), metal(['#383e54', '#3c455a', '#41495d'][phase], 0.89, 0.05), stones);
	}
	// A low stone lip and amber route lines read as walkable boundaries, not invisible walls.
	for (const x of [-8.76, 8.76]) {
		box(village, slate, [0.30, 0.34, span], x, 0.16, midZ);
		box(village, bronze, [0.33, 0.045, span], x, 0.35, midZ);
	}
	box(village, slate, [WIDTH, 0.41, 0.35], 0, 0.19, WHARF_FRONT - 0.05);
	box(village, bronze, [WIDTH, 0.05, 0.38], 0, 0.41, WHARF_FRONT - 0.05);

	const promenade: Stroke[] = [];
	const path = new THREE.CatmullRomCurve3([
		v(0, 0.022, 30.1), v(-4.7, 0.022, 26.7), v(-2.7, 0.022, 22.75),
		v(4.4, 0.022, 21.6), v(2.1, 0.022, 17),
		v(-3.4, 0.022, 14.8), v(-2.1, 0.022, 11.2), v(0, 0.022, 8.8),
	]);
	let previous = path.getPointAt(0);
	for (let j = 1; j <= 62; j++) {
		const next = path.getPointAt(j / 62);
		promenade.push([previous, next]);
		previous = next;
	}
	// The second branch makes the square a loop, not a forced hiking trail.
	let pivot = v(0, 0.020, 30.1);
	for (const next of [v(2.12, 0.020, 28.6), v(2.32, 0.020, 25.2), v(4.4, 0.020, 21.6)]) {
		promenade.push([pivot, next]); pivot = next;
	}
	strokes(village, promenade, ink('#a39580'), 0.014);
	for (const { x, z, color } of WITNESSES) {
		strokes(village, wheel(0.43, 0.025, x, z, 28), ink(color), 0.017);
	}
	const postSet = [-7.95, 7.90].flatMap(x => [12.75, 17.8, 23.45, 29.25].map(z => v(x, 0.62, z)));
	batchBoxes(new THREE.CylinderGeometry(0.064, 0.112, 1.23, 8), bronze, postSet);
	batchBoxes(new THREE.BoxGeometry(0.25, 0.30, 0.25), lantern, postSet.map(p => p.clone().setY(1.37)));
	batchBoxes(new THREE.ConeGeometry(0.24, 0.19, 4), teal, postSet.map(p => p.clone().setY(1.61)));
	batchBoxes(new THREE.BoxGeometry(0.48, 0.48, 0.48), amberGlass, postSet.map(p => p.clone().setY(1.39)));

	// Westbank docks have flat dark water, long broken reflections and a clinker boat.
	const water = ink('#263d58');
	box(village, water, [30, 0.12, 47], -23.85, -0.54, 20);
	box(village, water, [21, 0.12, 21], -3, -0.54, 42.9);
	box(village, ink('#1b3045'), [5.0, 0.4, 36], -20.0, -0.45, 18.0);
	const reflections: Stroke[] = [];
	for (let j = 0; j < 36; j++) {
		const x = -9.1 - (j % 6) * 1.0 - Math.sin(j * 1.3) * 0.2;
		const z = 11.3 + Math.floor(j / 6) * 3.1 + Math.sin(j * 2.37) * 1.36;
		reflections.push([v(x, -0.47, z), v(x - 0.21 - ((j * 7) % 5) * 0.14, -0.47, z + 0.01)]);
	}
	strokes(village, reflections, moonlit, 0.012);
	const pontoon: THREE.Vector3[] = [];
	for (let j = 0; j < 12; j++) pontoon.push(v(-9.73, -0.11, 23.6 + j * 0.242));
	batchBoxes(new THREE.BoxGeometry(2.03, 0.13, 0.224), walnut, pontoon);
	const railing = [v(-10.55, 0.18, 23.65), v(-10.55, 0.18, 26.20)];
	batchBoxes(new THREE.CylinderGeometry(0.11, 0.14, 1.34, 7), walnut, railing);
	strokes(village, [[v(-10.55, 0.64, 23.65), v(-10.55, 0.64, 26.2)]], bronze, 0.037);

	const hull = new THREE.Shape();
	hull.moveTo(0, -2.25);
	hull.quadraticCurveTo(0.77, -0.85, 0.70, 1.08);
	hull.quadraticCurveTo(0.64, 1.51, 0, 1.64);
	hull.quadraticCurveTo(-0.64, 1.51, -0.70, 1.08);
	hull.quadraticCurveTo(-0.77, -0.85, 0, -2.25);
	const boat = new THREE.Group();
	boat.position.set(-11.53, -0.42, 26);
	boat.rotation.y = 0.21;
	village.add(boat);
	place(boat, new THREE.ExtrudeGeometry(hull, { depth: 0.38, bevelEnabled: false }), walnut).rotation.x = -Math.PI / 2;
	place(boat, new THREE.ShapeGeometry(hull), ink('#283b4b'), 0, 0.386, 0).rotation.x = -Math.PI / 2;
	box(boat, walnut, [1.13, 0.075, 0.33], 0, 0.42, 0.34);
	box(boat, walnut, [0.76, 0.07, 0.26], 0, 0.42, -1.04);
	strokes(boat, [[v(-0.85, 0.47, 0.79), v(0.73, 0.53, -0.94)]], bronze, 0.035);

	// Dock scales, archive window and bell are individual navigational silhouettes.
	const crates = [v(-7.1, 0.31, 24.38), v(-7.35, 0.82, 24.45), v(-7.66, 0.25, 25.35)];
	batchBoxes(new THREE.BoxGeometry(0.61, 0.57, 0.57), walnut, crates);
	for (const p of crates) box(village, bronze, [0.63, 0.06, 0.59], p.x, p.y + 0.18, p.z);

	const archive = new THREE.Group();
	archive.position.set(6.62, 0, 18.32);
	village.add(archive);
	box(archive, stoneHouse, [3.05, 2.95, 2.75], 0, 1.48, 0);
	box(archive, bronze, [3.25, 0.11, 2.91], 0, 2.98, 0);
	box(archive, slate, [3.14, 0.20, 2.83], 0, 0.21, 0);
	for (const side of [-1, 1]) {
		const pitch = box(archive, teal, [1.94, 0.17, 3.37], side * 0.83, 3.48, 0);
		pitch.rotation.z = -side * 0.44;
		strokes(archive, [[v(side * 1.65, 3.13, 1.65), v(0, 3.93, 1.65)]], bronze, 0.041);
	}
	// Two wide parchment panes, each with only one mullion.
	for (const offset of [-0.77, 0.77]) {
		box(archive, bronze, [0.90, 1.06, 0.085], offset, 1.69, 1.399);
		box(archive, ink('#baa588'), [0.74, 0.9, 0.026], offset, 1.69, 1.46);
		box(archive, walnut, [0.05, 0.89, 0.041], offset, 1.69, 1.49);
	}
	const scroll = ring(archive, 0.23, 0.018, gold, 2.54);
	scroll.position.z = 1.42;
	strokes(archive, [[v(-0.11, 2.54, 1.46), v(0.11, 2.54, 1.46)]], gold, 0.022);

	const tower = new THREE.Group();
	tower.position.set(-6.64, 0, 12.69);
	village.add(tower);
	disc(tower, slate, 0.99, 1.1, 0.23, 0.115, 8);
	disc(tower, masonry, 0.73, 0.83, 3.29, 1.87, 8);
	disc(tower, bronze, 0.94, 0.77, 0.14, 3.55, 8);
	disc(tower, slate, 0.97, 0.85, 0.14, 3.68, 8);
	const pillars: Stroke[] = [];
	for (const dx of [-0.66, 0.66]) for (const dz of [-0.61, 0.61]) pillars.push([v(dx, 3.69, dz), v(dx, 4.91, dz)]);
	strokes(tower, pillars, bronze, 0.075);
	disc(tower, teal, 0.03, 1.18, 1.42, 5.53, 8);
	disc(tower, bronze, 0.10, 0.11, 0.28, 6.32, 8);
	const bell = new THREE.Group();
	bell.position.y = 4.76;
	tower.add(bell);
	disc(bell, bronze, 0.18, 0.36, 0.57, -0.29);
	disc(bell, gold, 0.35, 0.44, 0.08, -0.61);
	place(bell, new THREE.SphereGeometry(0.076, 10, 8), bronze, 0, -0.74, 0);
	const signal = place(tower, new THREE.OctahedronGeometry(0.16), ink('#ffdda3'), 0, 6.62, 0);
	const signalHalo = place(tower, new THREE.OctahedronGeometry(0.28), ink('#ffcb83', 0.14), 0, 6.62, 0);
	const dial = ring(tower, 0.32, 0.027, gold, 2.72);
	dial.position.z = 0.73;
	strokes(tower, [[v(0, 2.72, 0.76), v(0.08, 2.92, 0.76)], [v(0, 2.72, 0.76), v(-0.17, 2.64, 0.76)]], gold, 0.025);

	// The court threshold is a low open gate rather than a loading transition.
	for (const x of [-4.9, 4.9]) {
		box(village, slate, [1.12, 0.25, 0.88], x, 0.12, 11.0);
		box(village, teal, [0.66, 3.83, 0.54], x, 2.05, 11.0);
		box(village, bronze, [0.80, 0.15, 0.72], x, 4.03, 11.0);
	}
	box(village, slate, [10.65, 0.40, 0.57], 0, 4.12, 11.0);
	box(village, teal, [11.03, 0.18, 0.73], 0, 4.37, 11.0);
	box(village, bronze, [10.11, 0.06, 0.05], 0, 4.26, 11.31);
	const gateSeal = place(village, new THREE.OctahedronGeometry(0.37), gold, 0, 3.83, 11.31);
	gateSeal.scale.set(1.55, 0.61, 0.39);
	const actorGroups: THREE.Group[] = [];
	const figures = WITNESSES.map((_, i) => buildWitness(i));
	packStone(village, [boat, bell, signal, signalHalo, ...actorGroups]);
	return (t: number, still: boolean, complete: number) => {
		const time = still ? 0 : t;
		signal.visible = signalHalo.visible = complete >= 2;
		signal.rotation.y = signalHalo.rotation.y = time * 0.28;
		boat.position.y = -0.42 + 0.011 * Math.sin(time * 1.4);
		boat.rotation.z = 0.02 * Math.sin(time * 1.15);
		bell.rotation.z = 0.05 * Math.sin(time * 0.93);
		for (const idle of figures) idle(time);
	};

	function buildWitness(index: number) {
		const w = WITNESSES[index];
		const body = new THREE.Group();
		body.name = w.id;
		body.position.set(w.x, 0, w.z - 1.37);
		body.rotation.y = [-0.19, 0.27, 0.20][index];
		village.add(body);
		actorGroups.push(body);
		const skin = metal(['#bd937a', '#c3978b', '#c28c69'][index], 0.88, 0.02);
		const coat = metal(w.coat, 0.85, 0.02);
		const edging = metal(w.color, 0.76, 0.03);
		const dark = ink('#263046');
		const face = new THREE.Group();
		face.position.y = 1.31;
		body.add(face);
		const orb = new THREE.SphereGeometry(1, 16, 10);
		const doll = (parent: THREE.Object3D, mat: THREE.Material, sizes: readonly [number, number, number], x: number, y: number, z: number) => {
			const m = place(parent, orb, mat, x, y, z);
			m.scale.set(...sizes);
			return m;
		};
		// Shared rounded proportions, silhouette and accessory vary by witness.
		for (const x of [-0.13, 0.13]) doll(body, dark, [0.108, 0.099, 0.17], x, 0.11, 0.055);
		disc(body, coat, 0.26, 0.39, 0.78, 0.56);
		disc(body, edging, 0.386, 0.401, 0.05, 0.18);
		for (const sign of [-1, 1]) {
			const sleeve = doll(body, coat, [0.13, 0.29, 0.125], sign * 0.30, 0.69, 0.06);
			sleeve.rotation.z = sign * 0.19;
			doll(body, skin, [0.085, 0.10, 0.09], sign * 0.34, 0.49, 0.105);
		}
		disc(body, edging, 0.24, 0.27, 0.16, 0.94);
		doll(face, skin, [0.276, 0.30, 0.245], 0, -0.092, 0.02);
		for (const x of [-0.09, 0.09]) doll(face, dark, [0.023, 0.032, 0.017], x, -0.11, 0.242);
		if (index === 0) {
			disc(face, walnut, 0.28, 0.40, 0.075, 0.082);
			disc(face, edging, 0.19, 0.28, 0.21, 0.207, 10);
			disc(face, coat, 0.253, 0.274, 0.042, 0.128);
			strokes(body, [[v(-0.35, 0.02, 0.17), v(-0.42, 1.19, 0.10)]], walnut, 0.037);
		} else if (index === 1) {
			doll(face, coat, [0.303, 0.333, 0.24], 0, -0.01, -0.075);
			const book = box(body, ink('#bca9cc'), [0.40, 0.27, 0.075], 0.14, 0.55, 0.31);
			book.rotation.z = 0.18;
			box(body, bronze, [0.046, 0.24, 0.091], 0.044, 0.54, 0.315).rotation.z = 0.18;
		} else {
			disc(face, coat, 0.29, 0.32, 0.17, 0.118);
			disc(face, edging, 0.27, 0.32, 0.055, 0.048);
			place(face, new THREE.OctahedronGeometry(0.053), gold, 0, 0.109, 0.31);
			const medallion = ring(body, 0.086, 0.018, edging, 0.71);
			medallion.position.z = 0.269;
		}
		return (time: number) => { face.rotation.z = 0.023 * Math.sin(time * 0.9 + index); };
	}
}

export function createTribunal(game: Game) {
	const root = new THREE.Group();
	game.scene.add(root);
	game.orbit.distance = 7.9;
	game.orbit.pitch = 0.20;
	paintNight(game, root);
	const hall = new THREE.Group();
	root.add(hall);
	buildHall(hall);
	packStone(hall);
	const theVillage = buildWeir(root);
	const path = createPath(root);
	const moving = STAGES.map((_, i) => stationArt(root, i));
	const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
	let current = 0, complete = 0;
	const draw = (t: number) => {
		moving.forEach((animate) => animate(t, current, complete, reducedMotion.matches));
		theVillage(t, reducedMotion.matches, complete);
	};
	path(current, complete);
	draw(0);
	game.onUpdate((_dt, time) => draw(time));
	game.engine.add({
		order: Infinity,
		dispose() {
			const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
			root.traverse((o) => {
				if (!(o instanceof THREE.Mesh)) return;
				geometries.add(o.geometry);
				for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material);
				if (o instanceof THREE.InstancedMesh) o.dispose();
			});
			for (const geometry of geometries) geometry.dispose();
			for (const material of materials) material.dispose();
			root.removeFromParent();
		},
	});
	return (activeStation: number, completedCount: number) => {
		current = Math.max(-1, Math.min(STAGES.length - 1, activeStation));
		complete = Math.max(0, Math.min(STAGES.length, completedCount));
		path(current, complete);
		draw(game.time);
	};
}
