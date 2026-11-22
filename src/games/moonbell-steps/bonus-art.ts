import * as THREE from 'three';
import type { Game } from '../../lib/nixkit/game';
import type { Part } from '../../lib/nixkit/parts';
import { BONUS_FINISH, BONUS_STEPS } from './bonus';
import { FINISH, SLAB_HEIGHT, STEPS } from './course';

export const BONUS_COLORS = ['#a78ad8', '#b096df', '#8caee2', '#b091cb', '#f6bf8c'];

export function dressBonus(game: Game, platforms: readonly Part[]) {
	const { scene, toon } = game;
	const obsidian = toon({ color: '#4b3d6d' });
	const brass = toon({ color: '#82679e' });
	const warm = new THREE.MeshBasicMaterial({ color: '#ffe2b0' });
	const violet = new THREE.MeshBasicMaterial({ color: '#d7bcff' });
	const rim = new THREE.TorusGeometry(1, .015, 7, 44).rotateX(-Math.PI / 2);
	const stone = new THREE.CylinderGeometry(.90, .38, 1, 10);
	const crystal = new THREE.OctahedronGeometry(1);
	const pole = new THREE.CylinderGeometry(.115, .195, 1, 8);
	const shape = new THREE.Shape();
	shape.moveTo(0, -.86);
	shape.lineTo(.43, -.29);
	shape.lineTo(.14, -.32);
	shape.lineTo(.14, .41);
	shape.lineTo(-.14, .41);
	shape.lineTo(-.14, -.32);
	shape.lineTo(-.43, -.29);
	shape.closePath();
	const arrow = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
	function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(x, y, z);
		mesh.scale.set(sx, sy, sz);
		parent.add(mesh);
		return mesh;
	}

	const checkpoints: THREE.MeshBasicMaterial[] = [];
	const instructionMarks: THREE.Mesh[] = [];
	for (const [i, s] of BONUS_STEPS.entries()) {
		const part = platforms[i].mesh;
		const r = s.diameter / 2;
		const terrace = r > 2;
		const depth = terrace ? 2.15 : .89;
		add(part, stone, obsidian, 0, -SLAB_HEIGHT / 2 - depth / 2, 0, r, depth, r);
		add(part, rim, i === BONUS_FINISH ? warm : violet, 0, SLAB_HEIGHT / 2 + .014, 0, r * .91, 1, r * .91);
		if (i !== BONUS_FINISH) {
			const scale = terrace ? .95 : .67;
			instructionMarks[i] = add(part, arrow, warm, 0, SLAB_HEIGHT / 2 + .023, 0, scale, 1, scale);
		}
		if (s.move) {
			const [mx,,mz] = s.move.by;
			const run = Math.hypot(mx, mz), heading = Math.atan2(mx, mz);
			const metal = new THREE.BoxGeometry(.046, .086, run + 1.9);
			for (const lane of [-.32, .32]) {
				add(scene, metal, brass, s.x + mx / 2 + Math.cos(heading) * lane, s.y - 1.0,
					s.z + mz / 2 - Math.sin(heading) * lane).rotation.y = heading;
			}
			for (const t of [-.53, 1.53]) {
				add(scene, crystal, violet, s.x + mx * t, s.y - .66, s.z + mz * t, .09, .24, .09);
			}
		}
		if (s.checkpoint) {
			const glow = new THREE.MeshBasicMaterial({ color: '#ffd299' });
			checkpoints[s.checkpoint - 1] = glow;
			const a = Math.atan2(s.x + 3.2, s.z - 24), bx = Math.sin(a) * (r - .53), bz = Math.cos(a) * (r - .53);
			add(part, pole, brass, bx, SLAB_HEIGHT / 2 + .83, bz, 1, 1.66, 1);
			add(part, crystal, glow, bx, SLAB_HEIGHT / 2 + 1.92, bz, .27, .46, .27);
			add(part, rim, glow, bx, SLAB_HEIGHT / 2 + 1.89, bz, .49, 1, .49).rotation.z = .47;
		}
	}

	// A second, differently colored inlay leaves the summit through the belfry.
	const entry = STEPS[FINISH], next = BONUS_STEPS[0];
	const entryAngle = Math.atan2(next.x - entry.x, next.z - entry.z);
	add(scene, arrow, violet, entry.x + Math.sin(entryAngle) * 1.57, entry.y + .024, entry.z + Math.cos(entryAngle) * 1.57,
		.8, 1, .8).rotation.y = entryAngle;

	const end = BONUS_STEPS[BONUS_FINISH];
	const plinthZ = end.z - 1.55;
	const orrery = new THREE.Group();
	orrery.position.set(end.x, end.y + 1.88, plinthZ);
	scene.add(orrery);
	add(scene, pole, brass, end.x, end.y + .62, plinthZ, 3.1, 1.24, 3.1);
	add(scene, stone, obsidian, end.x, end.y - 5.1, end.z, 2.08, 5.0, 2.08);
	const orb = add(orrery, crystal, warm, 0, 0, 0, .50, .77, .50);
	const outer = add(orrery, rim, violet, 0, 0, 0, 1.05, 1, 1.05);
	const inner = add(orrery, rim, warm, 0, 0, 0, .82, 1, .82);
	const flare = add(scene, rim, warm, end.x, end.y + .03, end.z);
	flare.visible = false;
	let activated: number | null = null;

	const aim = () => {
		for (const [i, mark] of instructionMarks.entries()) {
			const from = platforms[i].pos, to = platforms[i + 1].pos;
			const a = Math.atan2(to.x - from.x, to.z - from.z);
			const inset = BONUS_STEPS[i].diameter * .20;
			mark.position.x = Math.sin(a) * inset;
			mark.position.z = Math.cos(a) * inset;
			mark.rotation.y = a;
		}
	};
	aim();
	game.onUpdate((_dt, time) => {
		aim();
		const elapsed = activated === null ? 3 : Math.max(0, time - activated);
		orb.rotation.y = time * .45;
		outer.rotation.x = Math.sin(time * .42) * .65;
		outer.rotation.y = time * .29;
		inner.rotation.z = Math.cos(time * .47) * .78;
		inner.rotation.y = -time * .40;
		orrery.position.y = end.y + 1.88 + Math.sin(time * 1.7) * .09;
		orb.scale.set(.50 + Math.exp(-4 * elapsed) * .32, .77 + Math.exp(-4 * elapsed) * .4, .50 + Math.exp(-4 * elapsed) * .32);
		flare.visible = elapsed < 1.05;
		flare.scale.setScalar(.26 + elapsed * 2.48);
	});
	return {
		checkpoint(n: number) { checkpoints[n - 1]?.color.set('#a7ffe0'); },
		ring() { activated = game.time; },
		reset() {
			activated = null;
			checkpoints.forEach((m) => m.color.set('#ffd299'));
		},
	};
}
