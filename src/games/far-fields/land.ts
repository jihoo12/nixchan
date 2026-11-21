// One chunk of land: its ground, worked out from noise.ts, and the trees and boulders on it. The
// ground is a grid of heights; what she stands on is that same grid, triangle for triangle, so her
// feet are always on what's drawn. Heights at a chunk's edge are worked out from the same place as
// its neighbour's, so the land runs on from one to the next without a seam.
import * as THREE from 'three';
import type { ChunkPlace } from '../../lib/nixkit/chunks';
import { createGrid, type Grid } from '../../lib/nixkit/grid';
import type { Toon } from '../../lib/nixkit/look';
import type { Obstacle, World } from '../../lib/nixkit/world';
import { height, noise, rng, woods } from './noise';

/** 0 at `a`, 1 at `b`, smoothly (either way round). */
const smoothRange = (a: number, b: number, t: number) => {
	const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
	return k * k * (3 - 2 * k);
};

/** How many metres across a chunk is, and how many squares of ground it's cut into each way. */
export const SIZE = 64;
const N = 32;
const STEP = SIZE / N;
/** The grid's width with a border of one more height all round (for the slopes at its edge). */
const W = N + 3;

const SAND = new THREE.Color('#ead9a0');
const SEABED = new THREE.Color('#b9b083');
const GRASS = new THREE.Color('#9bd56f');
const MEADOW = new THREE.Color('#c3e27a');
const FOREST = new THREE.Color('#5fae5a');
const ROCK = new THREE.Color('#9b9aa8');
const SNOW = new THREE.Color('#f6f8ff');

/** A column of rising wind, from `base` to `top`, `r` round. */
export interface Lift {
	x: number;
	z: number;
	r: number;
	base: number;
	top: number;
}

export interface Land {
	group: THREE.Group;
	world: World;
	/** What stands in it, to walk round. */
	grid: Grid<Obstacle>;
	/** Columns of wind that lift her glider. */
	lifts: Lift[];
	/** The height of the ground, triangle for triangle as drawn. */
	groundAt(x: number, z: number): number;
	dispose(): void;
}

/** What she stands on where there's an obstacle with a top (a dome or a pad), at (x, z). */
/** How far under her feet something's underside can be and still be under her (her waist). */
const WAIST = 1;
/** How thick a pad is (a step, a deck), for where its underside is. */
export const PAD_DEPTH = 0.36;
const underside = (f: Obstacle) => (f.pad !== undefined ? f.pad - PAD_DEPTH : f.dome ? f.dome.base : -Infinity);

export function obstacleTop(f: Obstacle, x: number, z: number) {
	const d2 = ((x - f.x) ** 2 + (z - f.z) ** 2) / (f.r * f.r);
	if (d2 >= 1) return -Infinity;
	if (f.pad !== undefined) return f.pad;
	if (f.dome) return f.dome.base + f.dome.top * Math.sqrt(1 - d2);
	return -Infinity;
}

/** A flower's parts (stem, petals, middle), as plain triangles, and the colours they come in. */
const FLOWER = (() => {
	const parts = [
		new THREE.CylinderGeometry(0.025, 0.035, 0.42, 4).translate(0, 0.21, 0),
		new THREE.OctahedronGeometry(0.14, 0).scale(1, 0.5, 1).translate(0, 0.45, 0),
		new THREE.OctahedronGeometry(0.06, 0).translate(0, 0.51, 0),
	].map((g) => {
		const flat = g.toNonIndexed();
		flat.computeVertexNormals();
		return { pos: flat.attributes.position.array as Float32Array, nor: flat.attributes.normal.array as Float32Array };
	});
	return { parts, verts: parts.reduce((n, p) => n + p.pos.length / 3, 0) };
})();
const STEM = new THREE.Color('#4f9a44');
const PETALS = ['#fff3a8', '#ffb3c8', '#ffffff', '#b9c8ff', '#ffcf7a'].map((c) => new THREE.Color(c));
const MIDDLE = new THREE.Color('#ffb53d');

export function createLandMaker(toon: Toon, bloom?: THREE.Material) {
	const ground = toon({ vertexColors: true });
	const bark = toon({ color: '#8a5a3b' });
	const leaves = toon({ color: '#ffffff' });
	const stone = toon({ color: '#a7a4b4' });
	const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 7).translate(0, 0.5, 0);
	const crownGeo = new THREE.IcosahedronGeometry(1, 1);
	const pineGeo = new THREE.ConeGeometry(1, 2.6, 8).translate(0, 1.3, 0);
	const rockGeo = new THREE.DodecahedronGeometry(1, 0);
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const s = new THREE.Vector3();
	const p = new THREE.Vector3();
	const c = new THREE.Color();
	const UP = new THREE.Vector3(0, 1, 0);

	/** Makes the land of a chunk, with no trees or boulders within `clear`. */
	function make(place: ChunkPlace, clear?: { x: number; z: number; r: number }): Land {
		const { x0, z0, cx, cz } = place;
		// Heights, one more all round than the chunk's own.
		const h = new Float32Array(W * W);
		for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) h[j * W + i] = height(x0 + (i - 1) * STEP, z0 + (j - 1) * STEP);
		const at = (i: number, j: number) => h[(j + 1) * W + (i + 1)];

		const verts = (N + 1) * (N + 1);
		const pos = new Float32Array(verts * 3);
		const nor = new Float32Array(verts * 3);
		const col = new Float32Array(verts * 3);
		const n = new THREE.Vector3();
		for (let j = 0; j <= N; j++)
			for (let i = 0; i <= N; i++) {
				const k = j * (N + 1) + i;
				const y = at(i, j);
				const x = x0 + i * STEP;
				const z = z0 + j * STEP;
				pos.set([x, y, z], k * 3);
				n.set(at(i - 1, j) - at(i + 1, j), 2 * STEP, at(i, j - 1) - at(i, j + 1)).normalize();
				nor.set([n.x, n.y, n.z], k * 3);
				// What it's like: sand by the water, grass (darker in the woods), rock where it's steep
				// or high, and snow on the tops.
				const wiggle = noise(x / 9, z / 9, 9) * 2 - 1;
				if (y < 0.2) c.copy(SEABED).lerp(SAND, Math.max(0, 1 + y / 4));
				else if (y < 0.9 + wiggle * 0.35) c.copy(SAND);
				else {
					c.copy(MEADOW).lerp(GRASS, Math.min(1, (y - 0.9) / 6)).lerp(FOREST, woods(x, z) * 0.85);
					if (n.y < 0.82 || y > 30 + wiggle * 3) c.lerp(ROCK, Math.min(1, Math.max((0.88 - n.y) * 8, (y - 30 - wiggle * 3) / 4)));
					if (y > 40 + wiggle * 4 && n.y > 0.7) c.copy(SNOW);
				}
				c.offsetHSL(0, 0, wiggle * 0.025);
				col.set([c.r, c.g, c.b], k * 3);
			}
		// Each square two triangles, split from (i+1, j) to (i, j+1), as groundAt reads them.
		const index: number[] = [];
		for (let j = 0; j < N; j++)
			for (let i = 0; i < N; i++) {
				const a = j * (N + 1) + i;
				const b = a + 1;
				const cc = a + N + 1;
				const d = cc + 1;
				index.push(a, cc, b, b, cc, d);
			}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
		geo.setIndex(index);
		geo.computeBoundingSphere();
		const mesh = new THREE.Mesh(geo, ground);
		mesh.receiveShadow = true;
		const group = new THREE.Group();
		group.add(mesh);

		const groundAt = (x: number, z: number) => {
			const u = (x - x0) / STEP;
			const v = (z - z0) / STEP;
			if (u < 0 || v < 0 || u > N || v > N) return -Infinity;
			const i = Math.min(N - 1, Math.floor(u));
			const j = Math.min(N - 1, Math.floor(v));
			const fu = u - i;
			const fv = v - j;
			const a = at(i, j);
			const b = at(i + 1, j);
			const cc = at(i, j + 1);
			if (fu + fv <= 1) return a + (b - a) * fu + (cc - a) * fv;
			const d = at(i + 1, j + 1);
			return d + (cc - d) * (1 - fu) + (b - d) * (1 - fv);
		};
		// (Home, where she starts, is kept clear too.)
		const cleared = (x: number, z: number) => Math.hypot(x, z) < 12 || (!!clear && Math.hypot(x - clear.x, z - clear.z) < clear.r);
		const slopeAt = (x: number, z: number) => Math.hypot(groundAt(x + 0.5, z) - groundAt(x - 0.5, z), groundAt(x, z + 0.5) - groundAt(x, z - 0.5));

		// Trees, on a jittered grid, more of them in the woods.
		const grid = createGrid<Obstacle>(8);
		const lifts: Lift[] = [];
		const r = rng(cx, cz, 101);
		type Tree = { x: number; y: number; z: number; size: number; pine: boolean; tint: number };
		const trees: Tree[] = [];
		for (let tz = 3; tz < SIZE; tz += 6)
			for (let tx = 3; tx < SIZE; tx += 6) {
				const x = x0 + tx + (r() - 0.5) * 5;
				const z = z0 + tz + (r() - 0.5) * 5;
				const roll = r();
				const size = 0.8 + r() * 0.7;
				const tint = r();
				const y = groundAt(x, z);
				if (roll > woods(x, z) * 0.5 + 0.025 || cleared(x, z) || y < 1.9 || y > 34 || slopeAt(x, z) > 0.55) continue;
				trees.push({ x, y, z, size, pine: y > 15 || noise(x / 40, z / 40, 7) > 0.68, tint });
			}
		const pines = trees.filter((t) => t.pine).length;
		const trunks = new THREE.InstancedMesh(trunkGeo, bark, Math.max(1, trees.length));
		const rounds = new THREE.InstancedMesh(crownGeo, leaves, Math.max(1, trees.length - pines));
		const cones = new THREE.InstancedMesh(pineGeo, leaves, Math.max(1, pines));
		let ri = 0;
		let pi = 0;
		trees.forEach((t, i) => {
			const trunkH = (t.pine ? 1.6 : 2.4) * t.size;
			m.compose(p.set(t.x, t.y - 0.1, t.z), q.identity(), s.set(t.size, trunkH, t.size));
			trunks.setMatrixAt(i, m);
			if (t.pine) {
				const w = 1.25 * t.size;
				m.compose(p.set(t.x, t.y + trunkH * 0.6, t.z), q.setFromAxisAngle(UP, t.tint * 6), s.set(w, t.size * 1.5, w));
				cones.setMatrixAt(pi, m);
				cones.setColorAt(pi++, c.setHSL(0.36 + t.tint * 0.05, 0.42, 0.3 + t.tint * 0.08));
				const top = t.y + trunkH * 0.6 + 1.6 * t.size;
				const crown = { x: t.x, y: top, z: t.z, r: w * 0.8 };
				const f: Obstacle = { x: t.x, z: t.z, r: 0.28 * t.size, crown };
				grid.insert(f, t.x - w, t.z - w, t.x + w, t.z + w);
			} else {
				const w = 1.7 * t.size;
				const cy = t.y + trunkH + w * 0.6;
				m.compose(p.set(t.x, cy, t.z), q.setFromAxisAngle(UP, t.tint * 6), s.set(w, w * 0.9, w));
				rounds.setMatrixAt(ri, m);
				rounds.setColorAt(ri++, c.setHSL(0.24 + t.tint * 0.09, 0.5, 0.42 + t.tint * 0.1));
				const f: Obstacle = { x: t.x, z: t.z, r: 0.28 * t.size, crown: { x: t.x, y: cy, z: t.z, r: w } };
				grid.insert(f, t.x - w, t.z - w, t.x + w, t.z + w);
			}
		});
		for (const im of [trunks, rounds, cones]) {
			im.count = im === trunks ? trees.length : im === rounds ? ri : pi;
			// They cast shadows on the ground, but don't take them: the sun's shadow map is too coarse
			// for their small faces, and would streak them.
			im.castShadow = true;
			im.computeBoundingSphere();
			if (im.count) group.add(im);
		}

		// Flowers in the grass, that only grow where the day is (bloom's shader sees to that).
		let flowers: THREE.BufferGeometry | null = null;
		if (bloom) {
			const fr = rng(cx, cz, 303);
			const spots: { x: number; y: number; z: number; s: number; c: THREE.Color; turn: number }[] = [];
			for (let k = 0; k < 110; k++) {
				const x = x0 + fr() * SIZE;
				const z = z0 + fr() * SIZE;
				const pick = fr();
				const size = 1.3 + fr() * 1.1;
				const turn = fr() * 6;
				const y = groundAt(x, z);
				// In clumps, on the meadows more than in the woods.
				if (y < 1.1 || y > 38 || slopeAt(x, z) > 0.6 || noise(x / 14, z / 14, 8) < 0.38 + woods(x, z) * 0.12) continue;
				spots.push({ x, y, z, s: size, c: PETALS[Math.floor(noise(x / 30, z / 30, 6) * 4.99 + pick * 0.6) % PETALS.length], turn });
			}
			if (spots.length) {
				const n = spots.length * FLOWER.verts;
				const pos = new Float32Array(n * 3);
				const nor = new Float32Array(n * 3);
				const col = new Float32Array(n * 3);
				const root = new Float32Array(n * 3);
				let v = 0;
				for (const f of spots) {
					const cos = Math.cos(f.turn);
					const sin = Math.sin(f.turn);
					FLOWER.parts.forEach((part, pi) => {
						const tint = pi === 0 ? STEM : pi === 1 ? f.c : MIDDLE;
						for (let i = 0; i < part.pos.length; i += 3, v++) {
							const px = part.pos[i] * f.s;
							const pz = part.pos[i + 2] * f.s;
							pos.set([f.x + px * cos - pz * sin, f.y - 0.05 + part.pos[i + 1] * f.s, f.z + px * sin + pz * cos], v * 3);
							nor.set([part.nor[i] * cos - part.nor[i + 2] * sin, part.nor[i + 1], part.nor[i] * sin + part.nor[i + 2] * cos], v * 3);
							col.set([tint.r, tint.g, tint.b], v * 3);
							root.set([f.x, f.y - 0.1, f.z], v * 3);
						}
					});
				}
				flowers = new THREE.BufferGeometry();
				flowers.setAttribute('position', new THREE.BufferAttribute(pos, 3));
				flowers.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
				flowers.setAttribute('color', new THREE.BufferAttribute(col, 3));
				flowers.setAttribute('root', new THREE.BufferAttribute(root, 3));
				flowers.computeBoundingSphere();
				group.add(new THREE.Mesh(flowers, bloom));
			}
		}

		// A few boulders to climb on.
		const rocks = Math.floor(r() * 3.2);
		for (let i = 0; i < rocks; i++) {
			const x = x0 + 6 + r() * (SIZE - 12);
			const z = z0 + 6 + r() * (SIZE - 12);
			const size = 0.9 + r() * 1.6;
			const y = groundAt(x, z);
			if (y < 0.5 || cleared(x, z)) continue;
			const rock = new THREE.Mesh(rockGeo, stone);
			rock.position.set(x, y + size * 0.25, z);
			rock.scale.set(size * 1.15, size * 0.75, size);
			rock.rotation.y = r() * 6;
			rock.castShadow = true;
			group.add(rock);
			const f: Obstacle = { x, z, r: size * 1.05, dome: { base: y - size * 0.1, top: size * 0.95 } };
			grid.insert(f, x - f.r, z - f.r, x + f.r, z + f.r);
		}

		const world: World = {
			// A step or a rock is under her only if its underside is no higher than her waist (as with
			// parts): so on a stair that winds round more than once, the step a turn above her is over
			// her head, not under her feet.
			groundAt(x, z, y) {
				let g = groundAt(x, z);
				if (g === -Infinity) return g;
				for (const f of grid.at(x, z)) if ((f.dome || f.pad !== undefined) && (y === undefined || underside(f) <= y + WAIST)) g = Math.max(g, obstacleTop(f, x, z));
				return g;
			},
			ceilingAt(x, z, y) {
				let c = Infinity;
				for (const f of grid.at(x, z)) if (f.pad !== undefined && underside(f) > y + WAIST && obstacleTop(f, x, z) > -Infinity) c = Math.min(c, underside(f));
				return c;
			},
			nearby: (x, z) => grid.at(x, z),
			inside: () => true,
			// Strongest in the middle of a column, dying away over the top so she comes out level.
			windLift(x, z, y) {
				for (const l of lifts) {
					const d = Math.hypot(x - l.x, z - l.z);
					if (d > l.r || y < l.base - 1 || y > l.top + 3) continue;
					return 10 * smoothRange(l.r, l.r * 0.45, d) * smoothRange(l.top + 3, l.top - 4, y);
				}
				return 0;
			},
		};

		return {
			group,
			world,
			grid,
			lifts,
			groundAt,
			dispose() {
				geo.dispose();
				flowers?.dispose();
				for (const im of [trunks, rounds, cones]) im.dispose();
			},
		};
	}

	return { make };
}
