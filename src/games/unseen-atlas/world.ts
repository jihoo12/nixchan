// The Atlas has no skybox asset: the observatory, inlaid floor and constellations are geometry.
import * as THREE from 'three';
import type { Game } from '../../lib/nixkit/game';
import type { Obstacle, World } from '../../lib/nixkit/world';

const TAU = Math.PI * 2;
const DECK_RADIUS = 16.4;
const CHAMBER_COLORS = ['#83e4d4', '#c4a6fb', '#ffca81'] as const;
const STATIONS = [
	{ x: -7.3, z: -2.9, facing: 0.3 },
	{ x: 0, z: -10.6, facing: 0 },
	{ x: 7.3, z: -2.9, facing: -0.3 },
];
const PILLAR_ANGLES = [-2.77, -2.32, -1.87, -1.42, 1.42, 1.87, 2.32, 2.77];
const standing: Obstacle[] = [
	{ x: 0, z: -2, r: 1.08, top: 1.03 },
	...STATIONS.map(({ x, z }) => ({ x, z, r: 0.74, top: 1.2 })),
	...PILLAR_ANGLES.map((a) => ({ x: Math.sin(a) * 15.1, z: Math.cos(a) * 15.1, r: 0.45, top: 3.42 })),
];

export const atlasSpawn = { pos: new THREE.Vector3(0, 0, 7.4), heading: Math.PI };
export const atlasTerrain: World = {
	groundAt: (x, z) => x * x + z * z <= DECK_RADIUS ** 2 ? 0 : -Infinity,
	ceilingAt: () => Infinity,
	nearby: () => standing,
	inside: (x, z) => x * x + z * z < (DECK_RADIUS - 0.4) ** 2,
};

const metal = (color: string, roughness = 0.55, metalness = 0.35) =>
	new THREE.MeshStandardMaterial({ color, roughness, metalness });
const ink = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({
	color, opacity, transparent: opacity < 1, depthWrite: opacity === 1, toneMapped: false,
});
const seeded = (i: number, salt: number) => {
	const k = Math.sin(i * 83.193 + salt * 47.173) * 18273.123;
	return k - Math.floor(k);
};
const Y = new THREE.Vector3(0, 1, 0);
const GEOM_SEGMENTS = 80;

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
	const m = new THREE.Mesh(geometry, material);
	m.position.set(x, y, z);
	parent.add(m);
	return m;
}
function disc(parent: THREE.Object3D, radius: number, depth: number, material: THREE.Material, x: number, y: number, z: number, bottom = radius, segments = GEOM_SEGMENTS) {
	return mesh(parent, new THREE.CylinderGeometry(radius, bottom, depth, segments), material, x, y, z);
}
function hoop(parent: THREE.Object3D, r: number, width: number, material: THREE.Material, x = 0, y = 0, z = 0, horizontal = true) {
	const h = mesh(parent, new THREE.TorusGeometry(r, width, 6, GEOM_SEGMENTS), material, x, y, z);
	if (horizontal) h.rotation.x = Math.PI / 2;
	return h;
}
function strokes(parent: THREE.Object3D, pairs: readonly (readonly [THREE.Vector3, THREE.Vector3])[], width: number, material: THREE.Material) {
	const geometry = new THREE.CylinderGeometry(width, width, 1, 5);
	const batch = new THREE.InstancedMesh(geometry, material, pairs.length);
	const o = new THREE.Object3D(), d = new THREE.Vector3();
	pairs.forEach(([a, b], i) => {
		d.subVectors(b, a);
		o.position.copy(a).addScaledVector(d, 0.5);
		o.scale.set(1, d.length(), 1);
		o.quaternion.setFromUnitVectors(Y, d.normalize());
		o.updateMatrix();
		batch.setMatrixAt(i, o.matrix);
	});
	batch.instanceMatrix.needsUpdate = true;
	parent.add(batch);
	return batch;
}
const polar = (r: number, a: number, y: number, x = 0, z = 0) =>
	new THREE.Vector3(x + Math.sin(a) * r, y, z + Math.cos(a) * r);

function installNight(game: Game, root: THREE.Group) {
	const { scene, sky } = game;
	// The same quiet lighting even when the site clock changes; preserve a useful key light on Nixchan.
	const canvas = document.createElement('canvas');
	canvas.width = 4;
	canvas.height = 256;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		const g = ctx.createLinearGradient(0, 0, 0, 256);
		g.addColorStop(0, '#030615');
		g.addColorStop(0.47, '#151932');
		g.addColorStop(0.82, '#2e3152');
		g.addColorStop(1, '#15172e');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 4, 256);
	}
	const bg = new THREE.CanvasTexture(canvas);
	bg.colorSpace = THREE.SRGBColorSpace;
	const fog = new THREE.Fog('#171c39', 36, 100);
	const stop = sky.clock.on(() => {
		scene.background = ctx ? bg : new THREE.Color('#111831');
		scene.fog = fog;
		sky.sun.castShadow = false;
		sky.sun.color.set('#cbd8ff');
		sky.sun.intensity = 2.15;
		sky.hemi.color.set('#b9cff8');
		sky.hemi.groundColor.set('#785476');
		sky.hemi.intensity = 1.38;
	});

	// World-space star sizes instead of GL point sprites, which vary by backend.
	const units = new THREE.Object3D();
	for (let group = 0; group < 3; group++) {
		const material = ink(['#aab8ee', '#f4d8bf', '#bac8fb'][group]);
		material.fog = false;
		const count = [220, 82, 37][group];
		const stars = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, count);
		for (let i = 0; i < count; i++) {
			const n = i + 300 * group;
			const a = seeded(n, 1) * TAU;
			const e = seeded(n, 2) * 1.47 - 0.19;
			const r = 83 + seeded(n, 3) * 16;
			const size = (0.035 + seeded(n, 4) * 0.065) * (1 + group * 0.7);
			units.position.set(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
			units.scale.setScalar(size);
			units.updateMatrix();
			stars.setMatrixAt(i, units.matrix);
		}
		stars.instanceMatrix.needsUpdate = true;
		root.add(stars);
	}

	const moon = new THREE.Group();
	moon.position.set(-29, 19, -63);
	moon.rotation.y = -0.28;
	moon.rotation.z = -0.39;
	root.add(moon);
	const paper = ink('#edd3b1');
	paper.fog = false;
	const shadow = ink('#44415f');
	shadow.fog = false;
	mesh(moon, new THREE.SphereGeometry(3.8, 48, 24), paper);
	mesh(moon, new THREE.SphereGeometry(3.66, 48, 24), shadow, 0.85, 0.45, 0.70);
	const orbitInk = ink('#b9aac7', 0.32);
	orbitInk.fog = false;
	const ring = hoop(moon, 6.0, 0.022, orbitInk, 0, -0.3, 0, false);
	ring.scale.y = 0.54;
	ring.rotation.x = 0.42;

	game.engine.add({ order: Infinity, dispose() { stop(); bg.dispose(); } });
}

function buildDeck(root: THREE.Group) {
	const floor = metal('#283151', 0.87, 0.02);
	const plinth = metal('#131b33');
	const rim = metal('#66698e');
	const brass = ink('#a39bbe');
	const faint = ink('#5d638a');
	const ivory = ink('#e1c29b');
	disc(root, DECK_RADIUS, 0.4, floor, 0, -0.2, 0);
	disc(root, 16.42, 0.1, rim, 0, -0.33, 0);
	disc(root, 16.35, 1.2, plinth, 0, -1.0, 0, 15.1);
	disc(root, 15.12, 0.25, rim, 0, -1.72, 0, 14.9);
	hoop(root, 16.20, 0.046, brass, 0, 0.02);
	hoop(root, 15.74, 0.014, faint, 0, 0.016);
	hoop(root, 13.79, 0.009, faint, 0, 0.014);
	hoop(root, 11.0, 0.011, faint, 0, 0.014);
	hoop(root, 5.25, 0.016, brass, 0, 0.018, -2);
	hoop(root, 4.97, 0.012, faint, 0, 0.015, -2);
	hoop(root, 2.2, 0.016, faint, 0, 0.018, -2);

	const major: [THREE.Vector3, THREE.Vector3][] = [], minor: typeof major = [];
	for (let i = 0; i < 120; i++) {
		const a = i / 120 * TAU;
		const emphasis = i % 10 === 0;
		const edge = emphasis ? 15.11 : 15.47;
		(emphasis ? major : minor).push([polar(edge, a, 0.025), polar(15.68, a, 0.025)]);
	}
	for (let i = 0; i < 6; i++) {
		const a = (i + 0.5) / 6 * TAU;
		const b = a + TAU / 3;
		minor.push([polar(4.98, a, 0.017, 0, -2), polar(4.98, b, 0.017, 0, -2)]);
		minor.push([polar(13, a, 0.017), polar(13, b, 0.017)]);
	}
	for (const { x, z } of STATIONS) {
		const a = Math.atan2(x, z + 2);
		major.push([polar(5.25, a, 0.026, 0, -2), new THREE.Vector3(x, 0.026, z)]);
	}
	strokes(root, major, 0.018, brass);
	strokes(root, minor, 0.011, faint);
	// Compass needle embedded in the entrance side. It points toward the moving apparatus.
	const compass = new THREE.Shape();
	compass.moveTo(0, -1.95);
	compass.lineTo(0.39, 0.36);
	compass.lineTo(0, 0.05);
	compass.lineTo(-0.39, 0.36);
	const arrow = mesh(root, new THREE.ShapeGeometry(compass), ivory, 0, 0.018, 5.78);
	arrow.rotation.x = -Math.PI / 2;
	arrow.rotation.z = Math.PI;
}

function buildSilhouette(root: THREE.Group) {
	const bronze = metal('#555573', 0.63, 0.3);
	const stone = metal('#252d4c', 0.82, 0.12);
	const lamp = ink('#e6bf9c');
	const pins: [THREE.Vector3, THREE.Vector3][] = [];
	const lanternPositions: THREE.Vector3[] = [];
	const span = PILLAR_ANGLES;
	for (const a of span) {
		const p = polar(15.1, a, 0);
		// The profile is readable from either side of the entrance; the spawn view has no foreground railing.
		disc(root, 0.46, 0.3, bronze, p.x, 0.15, p.z, 0.58, 8);
		const shaft = disc(root, 0.15, 2.65, stone, p.x, 1.50, p.z, 0.27, 6);
		shaft.rotation.y = a;
		disc(root, 0.30, 0.17, bronze, p.x, 2.90, p.z, 0.21, 6);
		const tip = p.clone().setY(3.18);
		lanternPositions.push(tip);
		pins.push([p.clone().setY(2.96), p.clone().setY(3.42)]);
	}
	for (let i = 0; i < span.length - 1; i++) {
		if (i === 3) continue;
		const a = polar(15.1, span[i], 1.19), b = polar(15.1, span[i + 1], 1.19);
		const c = a.clone().lerp(b, 0.5);
		c.y = 1.63;
		pins.push([a, c], [c, b]);
		const lowA = a.clone().setY(0.61), lowB = b.clone().setY(0.61);
		pins.push([lowA, lowB]);
	}
	const veil = ink('#a98cb5', 0.54);
	const tracery = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
	for (const layout of [
		[[-26, 7, -42], [-22, 10, -45], [-17, 9.3, -47], [-14, 14.5, -44], [-12, 12.1, -44]],
		[[14, 12.5, -41], [17, 17, -49], [21, 14.4, -46], [25, 18, -49], [27, 14.0, -47]],
	]) {
		const nodes = layout.map(([x, y, z]) => tracery(x, y, z));
		strokes(root, nodes.slice(1).map((p, i) => [nodes[i], p] as const), 0.015, veil);
		const g = new THREE.OctahedronGeometry(0.20);
		for (const n of nodes) mesh(root, g, lamp, n.x, n.y, n.z);
	}
	strokes(root, pins, 0.059, bronze);
	const diamond = new THREE.OctahedronGeometry(0.23);
	for (const s of lanternPositions) mesh(root, diamond, lamp, s.x, s.y, s.z);
}

function buildArmillary(root: THREE.Group) {
	const hub = new THREE.Group();
	hub.position.z = -2;
	root.add(hub);

	const dark = metal('#2d354d', 0.84, 0.08);
	const brass = metal('#d0a77f', 0.42, 0.39);
	const etch = ink('#e2c299');
	const lens = ink('#83e4d4');
	const lensHalo = ink('#83e4d4', 0.19);
	const spindle = new THREE.Group();
	spindle.position.y = 3.58;
	hub.add(spindle);

	disc(hub, 1.55, 0.19, dark, 0, 0.095, 0, 1.72, 12);
	disc(hub, 1.29, 0.12, brass, 0, 0.24, 0, 1.46, 12);
	disc(hub, 0.80, 0.59, dark, 0, 0.595, 0, 1.05, 8);
	disc(hub, 1.03, 0.09, brass, 0, 0.932, 0, 0.77, 8);
	disc(hub, 0.64, 0.12, dark, 0, 1.03, 0, 0.95, 8);
	hoop(hub, 0.51, 0.026, etch, 0, 1.10);
	hoop(hub, 1.86, 0.028, brass, 0, 0.026);

	const frame = hoop(spindle, 2.32, 0.059, brass, 0, 0, 0, false);
	frame.rotation.y = -0.2;
	const seam = hoop(spindle, 2.43, 0.020, etch, 0, 0, 0, false);
	seam.rotation.copy(frame.rotation);
	const bands = [
		hoop(spindle, 1.98, 0.037, brass, 0, 0, 0, false),
		hoop(spindle, 1.57, 0.027, etch, 0, 0, 0, false),
		hoop(spindle, 1.29, 0.019, lens, 0, 0, 0, false),
	];
	const globe = mesh(spindle, new THREE.IcosahedronGeometry(0.56, 0), lens);
	const halo = mesh(spindle, new THREE.IcosahedronGeometry(0.82, 1), lensHalo);
	const ribs: [THREE.Vector3, THREE.Vector3][] = [];
	for (let i = 0; i < 72; i++) {
		const a = i / 72 * TAU;
		const r = i % 6 === 0 ? 2.20 : 2.27;
		ribs.push([
			new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.016),
			new THREE.Vector3(Math.cos(a) * 2.34, Math.sin(a) * 2.34, 0.016),
		]);
	}
	strokes(frame, ribs, 0.013, etch);

	// Three differently tilted rings both echo the board's operations and track the active instrument.
	return (time: number, chapter: number, solved: boolean, links: number, staticMotion: boolean) => {
		const t = staticMotion ? 0 : time;
		bands[0].rotation.set(1.08, 0.28 + t * 0.18, 0.2);
		bands[1].rotation.set(0.24 - t * 0.13, 0.79, 0.86);
		bands[2].rotation.set(-0.6, -0.32 + t * 0.25, 1.1);
		globe.rotation.set(0.23 + t * 0.19, 0.65 + t * 0.23, -0.34);
		halo.rotation.copy(globe.rotation);
		const activity = Math.min(Math.max(links, 0), 16) / 16;
		globe.scale.setScalar(1 + activity * 0.18 + (solved ? 0.18 : 0));
		halo.scale.setScalar(1 + 0.09 * Math.sin(t * 1.75) + activity * 0.23);
		lensHalo.opacity = solved ? 0.32 : 0.12 + activity * 0.12;
		lens.color.set(CHAMBER_COLORS[chapter]);
		lensHalo.color.copy(lens.color);
	};
}

function buildStations(root: THREE.Group) {
	const base = metal('#394260');
	const bronze = metal('#a68b7b', 0.5, 0.4);
	const dim = new THREE.Color('#64607e');
	const rhombus = new THREE.OctahedronGeometry(0.31);
	return STATIONS.map(({ x, z, facing }, i) => {
		const station = new THREE.Group();
		station.position.set(x, 0, z);
		station.rotation.y = facing;
		root.add(station);
		const live = ink(CHAMBER_COLORS[i]);
		const aura = ink(CHAMBER_COLORS[i], 0.18);
		disc(station, 1.03, 0.12, base, 0, 0.06, 0, 1.14, 8);
		disc(station, 0.73, 0.12, bronze, 0, 0.18, 0, 0.82, 8);
		disc(station, 0.51, 0.71, base, 0, 0.59, 0, 0.62, 8);
		disc(station, 0.68, 0.11, bronze, 0, 1.00, 0, 0.50, 8);
		hoop(station, 0.58, 0.018, live, 0, 1.06);
		hoop(station, 1.25, 0.022, live, 0, 0.023);
		hoop(station, 0.66, 0.022, bronze, 0, 1.77, 0, false);
		const gem = mesh(station, rhombus, live, 0, 1.77, 0);
		const glow = mesh(station, rhombus, aura, 0, 1.77, 0);
		glow.scale.setScalar(1.62);
		for (let pip = 0; pip <= i; pip++) {
			const mark = mesh(station, rhombus, live, (pip - i * 0.5) * 0.26, 0.52, 0.6);
			mark.scale.setScalar(0.21);
		}
		const color = new THREE.Color(CHAMBER_COLORS[i]);
		return (time: number, chapter: number, solved: boolean, still: boolean) => {
			const active = i === chapter, cleared = i < chapter || (active && solved);
			const t = still ? 0 : time;
			const amount = cleared || active ? 1 : 0.12;
			live.color.copy(dim).lerp(color, amount);
			aura.opacity = cleared ? 0.22 : active ? 0.15 + Math.sin(t * 1.9) * 0.035 : 0;
			glow.visible = active || cleared;
			gem.rotation.y = 0.38 + t * (active ? 0.55 : 0.12);
			glow.rotation.copy(gem.rotation);
			gem.position.y = glow.position.y = 1.77 + (active ? Math.sin(t * 1.8) * 0.1 : 0);
		};
	});
}

function buildLattice(root: THREE.Group) {
	const origin = new THREE.Vector3(0, 3.58, -2);
	const start = new THREE.Vector3(), end = new THREE.Vector3(), d = new THREE.Vector3();
	const cut = new THREE.CylinderGeometry(0.020, 0.039, 1, 5);
	const spine = new THREE.CylinderGeometry(0.006, 0.014, 1, 5);
	return STATIONS.map(({ x, z }, i) => {
		const halo = ink(CHAMBER_COLORS[i], 0.18), filament = ink(CHAMBER_COLORS[i], 0.66);
		const broad = mesh(root, cut, halo), core = mesh(root, spine, filament);
		const point = new THREE.Vector3(x, 1.77, z);
		return (chapter: number, solved: boolean, links: number) => {
			const active = i === chapter;
			const cleared = i < chapter || (active && solved);
			const progress = cleared ? 1 : active ? Math.min(0.9, links * 0.1125) : 0;
			broad.visible = core.visible = progress > 0;
			if (!broad.visible) return;
			start.copy(origin);
			end.lerpVectors(origin, point, progress);
			d.subVectors(end, start);
			broad.position.copy(start).addScaledVector(d, 0.5);
			broad.scale.y = d.length();
			broad.quaternion.setFromUnitVectors(Y, d.normalize());
			core.position.copy(broad.position);
			core.scale.copy(broad.scale);
			core.quaternion.copy(broad.quaternion);
			halo.opacity = cleared ? 0.18 : 0.10;
			filament.opacity = cleared ? 0.52 : 0.34;
		};
	});
}

export function buildAtlasWorld(game: Game) {
	const root = new THREE.Group();
	game.scene.add(root);
	game.orbit.distance = 8.0;
	game.orbit.pitch = 0.21;
	const reduce = matchMedia('(prefers-reduced-motion: reduce)');
	let chapter = 0, solved = false, links = 0;
	installNight(game, root);
	buildDeck(root);
	buildSilhouette(root);
	const moveArmillary = buildArmillary(root);
	const stations = buildStations(root);
	const lattice = buildLattice(root);
	function drawProgress(time: number) {
		moveArmillary(time, chapter, solved, links, reduce.matches);
		for (const light of stations) light(time, chapter, solved, reduce.matches);
	}
	drawProgress(0);
	for (const beam of lattice) beam(chapter, solved, links);
	game.onUpdate((_dt, time) => drawProgress(time));
	game.engine.add({
		order: Infinity,
		dispose() {
			const shapes = new Set<THREE.BufferGeometry>();
			const materials = new Set<THREE.Material>();
			root.traverse((o) => {
				if (!(o instanceof THREE.Mesh)) return;
				shapes.add(o.geometry);
				for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
				if (o instanceof THREE.InstancedMesh) o.dispose();
			});
			for (const shape of shapes) shape.dispose();
			for (const material of materials) material.dispose();
			root.removeFromParent();
		},
	});
	return (activeChapter: number, isSolved: boolean, activeLinks: number) => {
		chapter = THREE.MathUtils.clamp(Math.trunc(activeChapter), 0, STATIONS.length - 1);
		solved = isSolved;
		links = activeLinks;
		for (const beam of lattice) beam(chapter, solved, links);
	};
}
