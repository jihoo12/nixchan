// Landmarks: one in each region of 3 × 3 chunks that has land for it, always in the same place, so
// the compass can point to ones that haven't been loaded yet. Each is built into the chunk it
// stands in, well inside its edge, so all of it is in that chunk's world.
import * as THREE from 'three';
import type { Toon } from '../../lib/nixkit/look';
import type { Obstacle } from '../../lib/nixkit/world';
import { pick } from '../../lib/nixkit/lang';
import type { Land } from './land';
import { SIZE } from './land';
import { height, rng } from './noise';

/** How many chunks across a region is. */
export const REGION = 3;
const SPAN = REGION * SIZE;

export type Kind = 'stones' | 'tower' | 'tree' | 'windmill';

export interface Landmark {
	id: string;
	kind: Kind;
	x: number;
	z: number;
	/** The chunk it stands in. */
	cx: number;
	cz: number;
	name: string;
}

const NOUNS: Record<Kind, { en: string; ko: string }> = {
	stones: { en: 'Stone Ring', ko: '돌 고리' },
	tower: { en: 'Watchtower', ko: '망루' },
	tree: { en: 'Elder Tree', ko: '큰 나무' },
	windmill: { en: 'Windmill', ko: '풍차' },
};
const ADJECTIVES = [
	{ en: 'Mossy', ko: '이끼 낀' },
	{ en: 'Quiet', ko: '고요한' },
	{ en: 'Sunny', ko: '볕 드는' },
	{ en: 'Windy', ko: '바람 부는' },
	{ en: 'Old', ko: '오래된' },
	{ en: 'Misty', ko: '안개 낀' },
	{ en: 'Hidden', ko: '숨은' },
	{ en: 'Lonely', ko: '외로운' },
	{ en: 'Bright', ko: '환한' },
	{ en: 'Singing', ko: '노래하는' },
	{ en: 'Sleepy', ko: '졸린' },
	{ en: 'Starlit', ko: '별빛' },
];
const KINDS: Kind[] = ['stones', 'tower', 'tree', 'windmill'];

const cache = new Map<string, Landmark | null>();

/** The landmark in region (rx, rz), if it has one. */
export function landmarkOf(rx: number, rz: number): Landmark | null {
	const id = `${rx},${rz}`;
	if (cache.has(id)) return cache.get(id)!;
	const r = rng(rx, rz, 202);
	let found: Landmark | null = null;
	for (let tries = 0; tries < 16 && !found; tries++) {
		let cx = rx * REGION + Math.floor(r() * REGION);
		let cz = rz * REGION + Math.floor(r() * REGION);
		// Well inside the chunk, so all of it is in the chunk's own world.
		let x = cx * SIZE + 18 + r() * (SIZE - 36);
		let z = cz * SIZE + 18 + r() * (SIZE - 36);
		let kind = KINDS[Math.floor(r() * KINDS.length)];
		// The first she meets, a short walk from home, is a windmill: its wind shows her what the
		// glider can do.
		if (rx === 0 && rz === 0 && tries === 0) [cx, cz, x, z, kind] = [0, 1, 34, 100, 'windmill'];
		const adjective = ADJECTIVES[Math.floor(r() * ADJECTIVES.length)];
		const y = height(x, z);
		if (y < 2.5 || y > 34) continue;
		let steep = 0;
		for (const [dx, dz] of [[7, 0], [-7, 0], [0, 7], [0, -7]]) steep = Math.max(steep, Math.abs(height(x + dx, z + dz) - y));
		if (steep > 4) continue;
		const noun = NOUNS[kind];
		found = { id, kind, x, z, cx, cz, name: pick({ en: `${adjective.en} ${noun.en}`, ko: `${adjective.ko} ${noun.ko}` }) };
	}
	cache.set(id, found);
	return found;
}

/** The region (x, z) is in. */
export const regionOf = (x: number, z: number) => [Math.floor(x / SPAN), Math.floor(z / SPAN)] as const;

/** The landmarks in the regions round (x, z), `rings` regions out. */
export function landmarksAround(x: number, z: number, rings: number) {
	const [rx, rz] = regionOf(x, z);
	const out: Landmark[] = [];
	for (let i = rx - rings; i <= rx + rings; i++)
		for (let j = rz - rings; j <= rz + rings; j++) {
			const l = landmarkOf(i, j);
			if (l) out.push(l);
		}
	return out;
}

/** Where a mote is put by a landmark. */
export interface MoteSpot {
	id: string;
	at: THREE.Vector3;
}

export function createLandmarkMaker(toon: Toon) {
	const stone = toon({ color: '#b9b5c6' });
	const darkStone = toon({ color: '#8e8aa0' });
	const wood = toon({ color: '#9b6a45' });
	const plaster = toon({ color: '#fff6e6' });
	const roof = toon({ color: '#d0675a' });
	const leaves = toon({ color: '#6cbf5c' });
	const sail = toon({ color: '#fffaf0', side: THREE.DoubleSide });
	const petal = toon({ color: '#ffffff', emissive: new THREE.Color('#ffffff').multiplyScalar(0.35) });
	const box = new THREE.BoxGeometry(1, 1, 1);
	const cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
	const ball = new THREE.IcosahedronGeometry(1, 1);
	const cone = new THREE.ConeGeometry(1, 1, 18);
	const petalGeo = new THREE.OctahedronGeometry(0.26, 0);

	const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
		const m = new THREE.Mesh(geo, mat);
		m.position.set(x, y, z);
		m.scale.set(sx, sy, sz);
		m.castShadow = true;
		return m;
	};
	const add = (land: Land, f: Obstacle, reach = f.crown?.r ?? f.r) => land.grid.insert(f, f.x - reach, f.z - reach, f.x + reach, f.z + reach);
	/** The lowest ground within `r` of (x, z), so nothing stands on stilts. */
	const lowest = (land: Land, x: number, z: number, r: number) => {
		let y = land.groundAt(x, z);
		for (let a = 0; a < 8; a++) y = Math.min(y, land.groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
		return y;
	};

	/** Builds `l` into `land`. Gives back where its motes go, and what to do each frame. */
	function build(l: Landmark, land: Land): { motes: MoteSpot[]; update?: (dt: number, time: number) => void } {
		const g = new THREE.Group();
		land.group.add(g);
		const { x, z } = l;
		const r = rng(l.cx, l.cz, 303);
		const motes: MoteSpot[] = [];

		if (l.kind === 'stones') {
			const base = lowest(land, x, z, 7.5);
			for (let i = 0; i < 8; i++) {
				const a = (i / 8) * Math.PI * 2 + r() * 0.2;
				const sx = x + Math.cos(a) * 7;
				const sz = z + Math.sin(a) * 7;
				const h = 3 + r() * 1.4;
				const y0 = lowest(land, sx, sz, 0.8);
				const s = mesh(box, i % 2 ? stone : darkStone, sx, y0 + h / 2 - 0.3, sz, 1.2, h, 0.75);
				s.rotation.set((r() - 0.5) * 0.12, -a, (r() - 0.5) * 0.12);
				g.add(s);
				// (The ball is for the camera, so it doesn't sit inside a stone; she glides round it too.)
				add(land, { x: sx, z: sz, r: 0.75, top: y0 + h - 0.3, crown: { x: sx, y: y0 + h / 2, z: sz, r: 1 } });
			}
			// The altar in the middle, and a mote on it.
			const top = land.groundAt(x, z) + 0.7;
			g.add(mesh(cyl, stone, x, (top + base - 0.4) / 2, z, 1.4, top - base + 0.4, 1.4));
			add(land, { x, z, r: 1.45, pad: top });
			motes.push({ id: `${l.id}:altar`, at: new THREE.Vector3(x, top + 1.1, z) });
			return { motes };
		}

		if (l.kind === 'tower') {
			const base = lowest(land, x, z, 5) - 0.4;
			const H = 15;
			const deck = base + H + 0.3;
			g.add(mesh(cyl, stone, x, base + H / 2, z, 3.2, H, 3.2));
			g.add(mesh(cyl, darkStone, x, base + H, z, 3.95, 0.6, 3.95));
			for (let i = 0; i < 12; i++) {
				const a = (i / 12) * Math.PI * 2;
				const c = mesh(box, darkStone, x + Math.cos(a) * 3.65, deck + 0.4, z + Math.sin(a) * 3.65, 0.9, 0.8, 0.5);
				c.rotation.y = -a + Math.PI / 2;
				g.add(c);
			}
			// The tower she walks round, and the deck on top she stands on.
			add(land, { x, z, r: 3.4, top: deck });
			add(land, { x, z, r: 3.95, pad: deck });
			// Steps round the outside, all the way up.
			const steps = Math.ceil((deck - land.groundAt(x + 4.8, z)) / 0.5);
			const rise = (deck - land.groundAt(x + 4.8, z)) / steps;
			const start = land.groundAt(x + 4.8, z);
			for (let k = 1; k <= steps; k++) {
				const a = k * 0.33;
				const sx = x + Math.cos(a) * 4.8;
				const sz = z + Math.sin(a) * 4.8;
				const top = start + k * rise;
				const s = mesh(box, wood, sx, top - 0.18, sz, 3.2, 0.36, 1.1);
				s.rotation.y = -a;
				g.add(s);
				add(land, { x: sx, z: sz, r: 0.95, pad: top });
			}
			motes.push({ id: `${l.id}:deck`, at: new THREE.Vector3(x, deck + 1.1, z) });
			return { motes };
		}

		if (l.kind === 'tree') {
			const base = lowest(land, x, z, 2) - 0.3;
			g.add(mesh(cyl, wood, x, base + 5.5, z, 1.5, 11, 1.5));
			const crowns: THREE.Mesh[] = [];
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2 + r();
				const d = i === 0 ? 0 : 3.6;
				const s = 3.6 + r() * 1.6;
				const c = mesh(ball, leaves, x + Math.cos(a) * d, base + 12 + r() * 2.5 + (i === 0 ? 2 : 0), z + Math.sin(a) * d, s, s * 0.85, s);
				crowns.push(c);
				g.add(c);
			}
			add(land, { x, z, r: 1.6, crown: { x, y: base + 13, z, r: 7 } }, 8);
			// A mote resting among the roots.
			const a = r() * Math.PI * 2;
			motes.push({ id: `${l.id}:roots`, at: new THREE.Vector3(x + Math.cos(a) * 2.6, land.groundAt(x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6) + 0.9, z + Math.sin(a) * 2.6) });
			return {
				motes,
				update: (_dt, time) => {
					crowns.forEach((c, i) => (c.rotation.z = Math.sin(time * 0.6 + i) * 0.025));
				},
			};
		}

		// A windmill, and a column of wind beside it that carries a glider up to a mote high above.
		const base = lowest(land, x, z, 2.5) - 0.3;
		g.add(mesh(cyl, plaster, x, base + 4, z, 2.1, 8, 2.1));
		g.add(mesh(cone, roof, x, base + 9.2, z, 2.6, 2.4, 2.6));
		const facing = r() * Math.PI * 2;
		const hub = new THREE.Group();
		hub.position.set(x + Math.sin(facing) * 2.4, base + 7, z + Math.cos(facing) * 2.4);
		hub.rotation.y = facing;
		const blades = new THREE.Group();
		hub.add(blades);
		for (let i = 0; i < 4; i++) {
			const arm = new THREE.Group();
			arm.rotation.z = (i / 4) * Math.PI * 2;
			arm.add(mesh(box, wood, 0, 2.6, 0, 0.2, 5.2, 0.15));
			arm.add(mesh(box, sail, 0.55, 3, 0.05, 0.9, 3.8, 0.04));
			blades.add(arm);
		}
		blades.add(mesh(cyl, wood, 0, 0, 0, 0.35, 0.5, 0.35).rotateX(Math.PI / 2));
		g.add(hub);
		add(land, { x, z, r: 2.3, top: base + 9 });

		const side = facing + Math.PI / 2;
		const wx = x + Math.sin(side) * 7;
		const wz = z + Math.cos(side) * 7;
		const ground = land.groundAt(wx, wz);
		const lift = { x: wx, z: wz, r: 4.5, base: ground, top: ground + 34 };
		land.lifts.push(lift);
		// Petals turning up the column, to show where it is.
		const PETALS = 70;
		const petals = new THREE.InstancedMesh(petalGeo, petal, PETALS);
		// (They move all over the column, so they're never left out for being off screen.)
		petals.frustumCulled = false;
		const seeds = Array.from({ length: PETALS }, () => [r(), r(), r()]);
		const m4 = new THREE.Matrix4();
		const v = new THREE.Vector3();
		g.add(petals);
		motes.push({ id: `${l.id}:wind`, at: new THREE.Vector3(wx, lift.top + 2.2, wz) });
		return {
			motes,
			update: (dt, time) => {
				blades.rotation.z += dt * 0.9;
				for (let i = 0; i < PETALS; i++) {
					const [a, b, c] = seeds[i];
					const t = (time * (0.06 + c * 0.04) + b) % 1;
					const ang = a * Math.PI * 2 + time * (1.2 + c);
					const rad = lift.r * (0.3 + 0.6 * a);
					v.set(wx + Math.cos(ang) * rad, lift.base + t * (lift.top - lift.base + 2), wz + Math.sin(ang) * rad);
					m4.makeTranslation(v.x, v.y, v.z);
					petals.setMatrixAt(i, m4);
				}
				petals.instanceMatrix.needsUpdate = true;
			},
		};
	}

	return { build };
}
