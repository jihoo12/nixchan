import * as THREE from 'three';
import type { Game } from '../../lib/nixkit/game';
import type { Obstacle, World } from '../../lib/nixkit/world';

const STAGES = [
	{ x: -4.5, z: 0, color: '#92edce', turn: 0.20 },
	{ x: 4.5, z: -7.4, color: '#c8b7f2', turn: -0.20 },
	{ x: 0, z: -17, color: '#ffd993', turn: 0 },
] as const;
const SIDES = [7, 1.35, -4.3, -9.95, -15.6, -21.25];
const WIDTH = 17.8, FRONT = 10.5, BACK = -23;
const TAU = Math.PI * 2;
const Y = new THREE.Vector3(0, 1, 0);
export const tribunalSpawn = { pos: new THREE.Vector3(0, 0, 8), heading: Math.PI };
export const tribunalStations = STAGES.map(({ x, z }) => new THREE.Vector3(x, 0, z + 2.3)) as [
	THREE.Vector3, THREE.Vector3, THREE.Vector3,
];

const obstacles: readonly Obstacle[] = [
	...STAGES.map(({ x, z }) => ({ x, z, r: 0.88, top: 1.28 })),
	...SIDES.flatMap((z) => [-8.47, 8.47].map((x) => ({ x, z, r: 0.55, top: 5.6 }))),
];
const onFloor = (x: number, z: number) => Math.abs(x) <= WIDTH / 2 && z >= BACK && z <= FRONT;
export const tribunalTerrain: World = {
	groundAt: (x, z) => onFloor(x, z) ? 0 : -Infinity,
	inside: (x, z) => Math.abs(x) < WIDTH / 2 - 0.32 && z > BACK + 0.84 && z < FRONT - 0.32,
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
	const locations = [tribunalSpawn.pos, ...tribunalStations];
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

export function createTribunal(game: Game) {
	const root = new THREE.Group();
	game.scene.add(root);
	game.orbit.distance = 7.9;
	game.orbit.pitch = 0.20;
	paintNight(game, root);
	buildHall(root);
	const path = createPath(root);
	const moving = STAGES.map((_, i) => stationArt(root, i));
	const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
	let current = 0, complete = 0;
	const draw = (t: number) => moving.forEach((animate) => animate(t, current, complete, reducedMotion.matches));
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
