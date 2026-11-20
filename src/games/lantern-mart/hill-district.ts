// Cedar Hill: a quiet destination at the far end of Lantern Town.
// Geometry follows townGround; the centre promenade remains open all the way to z108.
import * as THREE from 'three';
import { townGround, type TownBlock } from './town-layout';

type Paint = 'timber' | 'stone' | 'roof' | 'brass' | 'paper' | 'glow';
type Box = { x: number; y: number; z: number; w: number; h: number; d: number; color: string };
type Tree = { x: number; y: number; z: number; radius: number; height: number; color: string };

export function buildHillDistrict(scene: THREE.Scene): TownBlock[] {
	const district = new THREE.Group();
	district.name = 'Cedar Hill · reading terraces and lantern observatory';
	scene.add(district);
	const solids: TownBlock[] = [];
	const batches: Record<Paint, Box[]> = { timber: [], stone: [], roof: [], brass: [], paper: [], glow: [] };
	const crowns: Tree[] = [];
	const box = (paint: Paint, color: string, x: number, y: number, z: number, w: number, h: number, d: number, solid = true) => {
		batches[paint].push({ x, y, z, w, h, d, color });
		if (solid) solids.push({ x, z, w, d, bottom: y - h / 2, top: y + h / 2 });
	};
	const standing = (paint: Paint, color: string, x: number, z: number, w: number, h: number, d: number) => {
		const floor = Math.min(townGround(x, z - d / 2), townGround(x, z + d / 2));
		// Let the bottom disappear into the slope rather than leaving a floating foundation.
		box(paint, color, x, floor + h / 2 - 0.06, z, w, h + 0.12, d);
	};

	// Branching gravel walks conform to the existing terrain. They add no second heightfield.
	function walk(points: readonly (readonly [number, number])[], width: number) {
		const vertices: number[] = [];
		for (let s = 1; s < points.length; s++) {
			const a = points[s - 1], b = points[s];
			const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
			const count = Math.max(1, Math.ceil(length / 0.4));
			const nx = -dz / length * width / 2, nz = dx / length * width / 2;
			for (let i = 0; i < count; i++) {
				const ax = a[0] + dx * i / count, az = a[1] + dz * i / count;
				const bx = a[0] + dx * (i + 1) / count, bz = a[1] + dz * (i + 1) / count;
				for (const [x, z] of [[ax + nx, az + nz], [bx + nx, bz + nz], [ax - nx, az - nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]]) {
					vertices.push(x, townGround(x, z) + 0.035, z);
				}
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
		geometry.computeVertexNormals();
		const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#b5ad98', roughness: 1, side: THREE.DoubleSide }));
		mesh.name = 'Ground-following side walk';
		mesh.receiveShadow = true;
		district.add(mesh);
	}
	walk([[-3.6, 80], [-10, 83], [-14, 87], [-14, 92], [-9, 97], [-3.6, 101]], 1.8);
	walk([[3.6, 90], [10, 93], [15, 97], [15, 102], [9, 106], [3.6, 108]], 1.8);

	// Small shallow paving strips read as terraces, without an unwalkable retaining wall.
	function terrace(x: number, z: number, width: number, depth: number) {
		const rows = Math.ceil(depth / 0.5);
		for (let i = 0; i < rows; i++) {
			const zz = z - depth / 2 + (i + 0.5) * depth / rows;
			const d = depth / rows - 0.025;
			const top = townGround(x, zz + d / 2) + 0.045;
			const bottom = townGround(x, zz - d / 2) - 0.08;
			// Decorative paving only: townGround supplies the walkable floor, so a low slab
			// must not enter the wall-only collision pass and fence off its own terrace.
			box('stone', i % 2 ? '#b7afa0' : '#c8c0ac', x, (top + bottom) / 2, zz, width, top - bottom, d, false);
		}
	}
	terrace(-14, 88.5, 8, 6);
	terrace(15, 99.2, 8, 6);
	// Two side aprons leave the original central road entirely untouched.
	terrace(-6.4, 107.5, 4.2, 5);
	terrace(6.4, 107.5, 4.2, 5);

	function bench(x: number, z: number, width = 2.8) {
		const g = townGround(x, z + 0.38) + 0.08;
		for (const dx of [-width * 0.35, width * 0.35]) {
			box('brass', '#434e4b', x + dx, g + 0.23, z, 0.14, 0.46, 0.66);
		}
		box('timber', '#936b4c', x, g + 0.49, z, width, 0.16, 0.7);
		box('timber', '#a77c54', x, g + 0.98, z + 0.31, width, 0.65, 0.12);
	}
	bench(-16.8, 87.4, 2.3);
	bench(-11.2, 90, 2.3);
	bench(17.5, 98, 2.7);
	bench(-6.3, 108.3, 3.0);
	bench(6.3, 108.3, 3.0);

	// A sheltered exchange shelf. Individual coloured spines are non-solid decoration,
	// with one exact visible back box and shelf boards supplying the collision boundary.
	const shelfX = -17.2, shelfZ = 90.9, shelfY = townGround(shelfX, shelfZ) + 0.12;
	box('timber', '#574e43', shelfX, shelfY + 0.82, shelfZ, 2.2, 1.64, 0.16);
	for (const dx of [-1.02, 1.02]) box('timber', '#6b5946', shelfX + dx, shelfY + 0.82, shelfZ - 0.22, 0.16, 1.64, 0.6);
	for (const height of [0.12, 0.82, 1.54]) box('timber', '#ad8b60', shelfX, shelfY + height, shelfZ - 0.22, 2.2, 0.12, 0.6);
	const bookColors = ['#b16957', '#6e8490', '#bfaa73', '#71947e', '#8d7194'];
	for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) {
		const h = 0.34 + ((i + row * 3) % 3) * 0.07;
		box('paper', bookColors[(i + row) % bookColors.length], shelfX - 0.83 + i * 0.23, shelfY + 0.2 + row * 0.7 + h / 2, shelfZ - 0.25, 0.17, h, 0.3, false);
	}
	box('roof', '#58675f', shelfX, shelfY + 1.71, shelfZ - 0.2, 2.5, 0.17, 0.95);

	// Memory stones and a low flower bed give the other branch a different destination.
	for (let i = 0; i < 3; i++) {
		const x = 12.3 + i * 2.0, z = 101.2;
		standing('stone', ['#777e76', '#899087', '#707e7a'][i], x, z, 0.85, 1.1 + (i === 1 ? 0.4 : 0), 0.5);
		const y = townGround(x, z) + 0.8;
		// A simple gold inset, not invented unreadable writing.
		box('brass', '#c8b278', x, y, z - 0.26, 0.42, 0.08, 0.025, false);
	}
	standing('stone', '#77786b', 18.5, 100.6, 0.6, 0.35, 2.6);
	for (let i = 0; i < 7; i++) {
		const z = 99.5 + i * 0.33, g = townGround(18.5, z);
		box('paper', i % 2 ? '#c4a9bb' : '#e3cf9d', 18.5, g + 0.49, z, 0.22, 0.19, 0.22, false);
	}

	// Repeated warm lanterns draw the eye up the slope, never into the walking corridor.
	function lantern(x: number, z: number, tall = 1.9) {
		const g = townGround(x, z);
		box('timber', '#514c42', x, g + tall / 2, z, 0.14, tall, 0.14);
		box('brass', '#61553d', x, g + tall + 0.11, z, 0.53, 0.12, 0.53);
		box('glow', '#ffd792', x, g + tall + 0.42, z, 0.36, 0.52, 0.36);
		box('roof', '#4a655d', x, g + tall + 0.76, z, 0.64, 0.16, 0.64);
	}
	for (const z of [74, 82, 91, 99]) for (const side of [-1, 1]) lantern(side * 4.8, z);
	lantern(-10.2, 85.6, 1.4);
	lantern(-16.8, 94, 1.4);
	lantern(11.2, 95.5, 1.4);
	lantern(18.2, 103, 1.4);

	// Open-sided lookout pavilion: all posts at x ±5.2. The roof is safely above even
	// the uphill end, so the central route can continue straight to the viewpoint.
	const pavilionTop = townGround(0, 112) + 4.4;
	for (const x of [-5.2, 5.2]) for (const z of [103.8, 111]) {
		const g = townGround(x, z) - 0.06;
		box('timber', '#66543f', x, (g + pavilionTop) / 2, z, 0.34, pavilionTop - g, 0.34);
		box('brass', '#b69c61', x, pavilionTop - 0.7, z, 0.42, 0.12, 0.42);
	}
	box('timber', '#856c4e', 0, pavilionTop, 103.8, 10.8, 0.24, 0.32);
	box('timber', '#856c4e', 0, pavilionTop, 111, 10.8, 0.24, 0.32);
	// Stacked horizontal eaves have exact box collisions and a readable tiered silhouette.
	box('roof', '#40675e', 0, pavilionTop + 0.32, 107.4, 12, 0.4, 9.0);
	box('roof', '#4e7b6d', 0, pavilionTop + 0.7, 107.4, 10.4, 0.38, 7.5);
	box('roof', '#6a9580', 0, pavilionTop + 1.03, 107.4, 8.8, 0.28, 5.9);
	box('brass', '#bca36b', 0, pavilionTop + 1.25, 107.4, 0.26, 0.24, 5.8);
	for (const x of [-5.2, 5.2]) {
		box('brass', '#9e8858', x, pavilionTop - 0.6, 104.5, 0.05, 1.1, 0.05);
		box('glow', '#ffe0a0', x, pavilionTop - 1.35, 104.5, 0.65, 0.72, 0.65);
		box('roof', '#375f55', x, pavilionTop - 0.96, 104.5, 0.85, 0.13, 0.85);
	}

	// Small bell tower next to the lookout; its open front is reached from the east walk.
	const bellX = 9.4, bellZ = 108.9, bellGround = townGround(bellX, bellZ);
	for (const x of [bellX - 1.15, bellX + 1.15]) box('timber', '#70573c', x, bellGround + 2.2, bellZ, 0.24, 4.4, 0.3);
	box('timber', '#8d7050', bellX, bellGround + 4.35, bellZ, 2.9, 0.3, 0.55);
	box('roof', '#456e5b', bellX, bellGround + 4.65, bellZ, 3.3, 0.28, 1.45);
	box('brass', '#9f8b57', bellX, bellGround + 3.4, bellZ, 1.05, 1.3, 0.9);
	box('brass', '#b8a16a', bellX, bellGround + 2.77, bellZ, 1.35, 0.16, 1.15);
	box('timber', '#ae9270', bellX, bellGround + 1.7, bellZ - 0.15, 0.065, 1.85, 0.065);

	// Dense outer grove, sparse inner accents. Deterministic placement, never random per visit.
	const treeSpots: [number, number, number][] = [];
	for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 10; i++) {
		treeSpots.push([side * (25.5 + (i % 3) * 3.5), 73 + i * 4.05, 6.2 + (i % 4) * 0.75]);
	}
	treeSpots.push([-20.5, 77, 7.8], [19.5, 79, 7.1], [-21, 98, 8.3], [22, 92, 8], [-16.5, 105, 7.3], [18, 109, 8.6]);
	for (const [x, z, h] of treeSpots) {
		const g = townGround(x, z);
		box('timber', '#685d49', x, g + h * 0.32, z, 0.42, h * 0.64, 0.42);
		for (let tier = 0; tier < 3; tier++) crowns.push({ x, y: g + h * (0.49 + tier * 0.17), z, radius: h * (0.24 - tier * 0.045), height: h * 0.52, color: tier === 0 ? '#355f50' : tier === 1 ? '#447561' : '#58856b' });
	}

	const cube = new THREE.BoxGeometry(1, 1, 1);
	const brush = new THREE.Object3D(), color = new THREE.Color();
	for (const [paint, boxes] of Object.entries(batches) as [Paint, Box[]][]) {
		if (!boxes.length) continue;
		const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: paint === 'brass' ? 0.5 : 0.88, metalness: paint === 'brass' ? 0.35 : 0, ...(paint === 'glow' ? { emissive: '#ffca73', emissiveIntensity: 0.8 } : {}) });
		const mesh = new THREE.InstancedMesh(cube, material, boxes.length);
		mesh.name = `Cedar Hill ${paint}`;
		mesh.castShadow = paint !== 'glow';
		mesh.receiveShadow = true;
		boxes.forEach((b, i) => {
			brush.position.set(b.x, b.y, b.z); brush.rotation.set(0, 0, 0); brush.scale.set(b.w, b.h, b.d); brush.updateMatrix();
			mesh.setMatrixAt(i, brush.matrix); mesh.setColorAt(i, color.set(b.color));
		});
		mesh.computeBoundingSphere();
		district.add(mesh);
	}
	const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), crowns.length);
	foliage.name = 'Cedar Hill layered evergreen crowns';
	foliage.castShadow = true;
	foliage.receiveShadow = true;
	crowns.forEach((tree, i) => {
		brush.position.set(tree.x, tree.y, tree.z); brush.rotation.set(0, (i % 7) * 0.37, 0); brush.scale.set(tree.radius, tree.height, tree.radius); brush.updateMatrix();
		foliage.setMatrixAt(i, brush.matrix); foliage.setColorAt(i, color.set(tree.color));
	});
	foliage.computeBoundingSphere();
	district.add(foliage);
	return solids;
}
