// The settlement's low, walk-through surfaces: a worn approach and a small
// village-green apron. These are scenery, not colliders or claims on the land.
import * as THREE from 'three';
import type { Toon } from './look';
import { HALF, STEP, terrainAt } from './terrain';
import { SETTLEMENT_PATH, VILLAGE_GREEN } from './settlements';

export type GroundPoint = { x: number; z: number };
export type SettlementScenery = {
	/** World-space waypoints; width is the full worn width in metres. */
	paths: readonly { points: readonly GroundPoint[]; width?: number }[];
	green: GroundPoint & { yaw?: number; width?: number; depth?: number };
};
type Sample = GroundPoint & { t: number };
type ColorAt = (x: number, z: number, t: number) => THREE.Color;
const cap = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function clip(poly: Sample[], a: number, b: number, c: number) {
	if (!poly.length) return poly;
	const out: Sample[] = [];
	let p = poly[poly.length - 1], dp = a * p.x + b * p.z + c;
	for (const q of poly) {
		const dq = a * q.x + b * q.z + c;
		if ((dp >= 0) !== (dq >= 0)) {
			const w = dp / (dp - dq);
			out.push({ x: p.x + (q.x - p.x) * w, z: p.z + (q.z - p.z) * w, t: p.t + (q.t - p.t) * w });
		}
		if (dq >= 0) out.push(q);
		p = q; dp = dq;
	}
	return out;
}

function surfaces(toon: Toon, name: string) {
	const positions: number[] = [], colors: number[] = [];
	const cell = (p: number) => Math.floor((p + HALF) / STEP);
	const emit = (p: Sample, height: number, paint: ColorAt) => {
		positions.push(p.x, terrainAt(p.x, p.z) + height, p.z);
		const c = paint(p.x, p.z, p.t);
		colors.push(c.r, c.g, c.b);
	};
	function stamp(poly: Sample[], height: number, paint: ColorAt) {
		// Match terrainAt's two triangles in each height-field cell exactly.
		// A single quad bent across a grid diagonal would visibly cut into it.
		const x0 = cell(Math.min(...poly.map(p => p.x))), x1 = cell(Math.max(...poly.map(p => p.x)));
		const z0 = cell(Math.min(...poly.map(p => p.z))), z1 = cell(Math.max(...poly.map(p => p.z)));
		for (let i = x0; i <= x1; ++i) for (let j = z0; j <= z1; ++j) {
			const x = i * STEP - HALF, z = j * STEP - HALF;
			const box = clip(clip(clip(clip(poly, 1, 0, -x), -1, 0, x + STEP), 0, 1, -z), 0, -1, z + STEP);
			if (box.length < 3) continue;
			const diagonal = x + z + STEP;
			for (const side of [-1, 1]) {
				const half = clip(box, side, side, -side * diagonal);
				const a = half[0];
				for (let k = 2; k < half.length; ++k) {
					const b = half[k - 1], c = half[k];
					const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
					if (Math.abs(cross) < 1e-8) continue;
					emit(a, height, paint); emit(cross > 0 ? c : b, height, paint); emit(cross > 0 ? b : c, height, paint);
				}
			}
		}
	}
	function finish(group: THREE.Group) {
		if (!positions.length) return;
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		geo.computeVertexNormals();
		const mesh = new THREE.Mesh(geo, toon({ vertexColors: true }));
		mesh.name = name;
		mesh.receiveShadow = true;
		group.add(mesh);
	}
	return { stamp, finish };
}

const earth = new THREE.Color('#c6a681'), edge = new THREE.Color('#a2b37e'), thin = new THREE.Color('#98ba7b');
const apron = new THREE.Color('#b69a80'), apronEdge = new THREE.Color('#a0af7d');
const stones = ['#bba693', '#c9b5a1', '#aa9690', '#c3aa97', '#b6aaa8'].map(x => new THREE.Color(x));
const chalk = new THREE.Color('#dbbea3');
const tint = new THREE.Color();
const grain = (x: number, z: number) => Math.sin(x * 1.51 + z * .72) * .028
	+ Math.cos(x * .51 - z * 1.37) * .033 + Math.sin(x * 5.2 + z * 4.1) * .021;

const islandSettlement: SettlementScenery = {
	paths: [{points: SETTLEMENT_PATH, width: 2.30}],
	green: VILLAGE_GREEN,
};

export function buildSettlementScene(scene: THREE.Scene, toon: Toon, { paths, green }: SettlementScenery = islandSettlement) {
	const group = new THREE.Group();
	group.name = 'Settlement • paths and open green';
	const trail = surfaces(toon, 'Settlement • worn gravel trail');
	const stone = surfaces(toon, 'Settlement • flush village pavers');
	const paintTrail: ColorAt = (x, z, t) => tint.copy(earth)
		.lerp(edge, cap((t - .62) / .28, 0, 1)).lerp(thin, cap((t - .89) / .11, 0, 1))
		.multiplyScalar(1 + grain(x, z));

	for (let n = 0; n < paths.length; ++n) {
		const path = paths[n];
		const points = path.points.filter((p, k, seq) => k === 0 || Math.hypot(p.x - seq[k - 1].x, p.z - seq[k - 1].z) > .02);
		if (points.length < 2) continue;
		const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
		const length = curve.getLength(), count = Math.max(2, Math.ceil(length / .48));
		const bands = [-1, -.88, -.63, 0, .63, .88, 1];
		const section = (i: number) => {
			const u = i / count, p = curve.getPointAt(u), dir = curve.getTangentAt(u);
			// A rounded pinch at the trail ends avoids a machine-cut strip in the grass.
			const tip = cap(Math.min(i, count - i) * length / count / 1.6, 0, 1);
			const taper = Math.max(.018, Math.sqrt(tip * (2 - tip)));
			const width = (path.width ?? 2.30) * .5 * taper * (1 + .075 * Math.sin(u * length * .83 + n));
			return bands.map(b => ({ x: p.x + dir.z*b*width, z: p.z - dir.x*b*width, t: Math.abs(b) }));
		};
		let a = section(0);
		for (let i = 1; i <= count; ++i) {
			const b = section(i);
			for (let j = 1; j < bands.length; ++j) trail.stamp([a[j - 1], a[j], b[j], b[j - 1]], .016 + n * .002, paintTrail);
			a = b;
		}
	}

	const yaw = green.yaw ?? 0, sin = Math.sin(yaw), cos = Math.cos(yaw);
	const p = (x: number, z: number, t = 0): Sample => ({ x: green.x + x*cos + z*sin, z: green.z - x*sin + z*cos, t });
	const rx = (green.width ?? 8.20) / 2, rz = (green.depth ?? 6.00) / 2;
	const squareRound = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v));
	const rim = Array.from({ length: 28 }, (_, i) => {
		const a = 2 * Math.PI * i / 28;
		return [squareRound(Math.cos(a)) * rx, squareRound(Math.sin(a)) * rz];
	});
	const paintApron: ColorAt = (x, z, t) => tint.copy(apron).lerp(apronEdge, t * t * .74).multiplyScalar(1 + grain(x, z) * .8);
	// Thin feathered apron keeps the middle open and the edges low-contrast.
	for (let i = 0; i < rim.length; ++i) {
		const [x1, z1] = rim[i], [x2, z2] = rim[(i + 1) % rim.length];
		const i1 = p(x1 * .82,z1 * .82), i2 = p(x2 * .82,z2 * .82);
		trail.stamp([p(0,0),i1,i2], .024, paintApron);
		trail.stamp([i1,p(x1,z1,1),p(x2,z2,1),i2], .024, paintApron);
	}

	function paver(x: number, z: number, w: number, d: number, turn: number, color: THREE.Color, level = .039) {
		const c = Math.min(w, d) * .23, a = Math.cos(turn), b = Math.sin(turn);
		const poly = [
			[-w/2+c,-d/2],[w/2-c,-d/2],[w/2,-d/2+c],[w/2,d/2-c],
			[w/2-c,d/2],[-w/2+c,d/2],[-w/2,d/2-c],[-w/2,-d/2+c],
		].map(([u,v]) => p(x + a*u - b*v,z + b*u + a*v));
		stone.stamp(poly, level, (u,v) => tint.copy(color).multiplyScalar(1+grain(u,v)*.4));
	}
	// Low-set corner markers suggest a cared-for green without putting a wall
	// around it. The wide openings leave the middle available for play.
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let j = 0; j < 4; ++j) {
		const a = .27 + j * .16;
		paver(sx*(rx-.44)*Math.cos(a),sz*(rz-.43)*Math.sin(a),.43,.30,
			sx*sz*(Math.PI/2+a),stones[(j+(sx>0?2:0)+(sz>0?1:0))%stones.length]);
	}
	// An understated, flush six-point stone imprint marks the court center.
	paver(0,0,.42,.42,Math.PI/6,chalk,.042);
	for (let j = 0; j < 6; ++j) {
		const a = j*Math.PI/3;
		paver(Math.cos(a)*.46,Math.sin(a)*.46,.37,.14,a,stones[(j+2)%stones.length],.040);
		paver(Math.cos(a)*.76,Math.sin(a)*.76,.19,.15,a+.2,chalk,.039);
	}
	trail.finish(group);
	stone.finish(group);
	scene.add(group);
	return group;
}
