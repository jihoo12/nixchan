// The sky gate at the end of the path: a stone arch, built in Blender by tools/experimental-portal/build.py,
// with a swirl of sky in its opening (TSL, for WebGPU). Walking Nixchan through it takes you to /island.
// Its origin is the middle of the opening on the ground; the opening faces +z (and -z: it works both ways).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import { abs, cos, float, floor, fract, length, max, min, mix, positionLocal, pow, select, sin, smoothstep, step, uniform, vec2, vec3 } from 'three/tsl';
import { fbm2, hash2 } from '../nixkit/noise-nodes';

// The arch's size, as tools/experimental-portal/build.py builds it.
const PLINTH_TOP = 0.06;
const CENTRE_Y = 2.15;
const R_IN = 1.5;
const R_OUT = 2.02;
const DEPTH = 0.62;
const FOOT = THREE.MathUtils.degToRad(-38);
/** Half the width of the opening, between the arch's feet. */
export const PORTAL_HALF_WIDTH = R_IN * Math.cos(FOOT);
/** The plinth's radius, so nothing else stands on it. */
export const PORTAL_RADIUS = 3;
/** Each foot of the arch on the ground, in the gate's own frame: [x0, x1, z0, z1]. */
export const PORTAL_FEET: [number, number, number, number][] = [-1, 1].map((side) => {
	const a = PORTAL_HALF_WIDTH - 0.12;
	const b = R_OUT * Math.cos(FOOT) + 0.36;
	const half = DEPTH / 2 + 0.13;
	return side < 0 ? [-b, -a, -half, half] : [a, b, -half, half];
});

/** The swirl of sky in the opening, in TSL: clouds wound into a slowly turning whirl, a bright eye in
 * the middle, a glowing rim round the edge of the opening, and stars in it by night. */
function veilMaterial() {
	const u = {
		time: uniform(0),
		night: uniform(0),
		surge: uniform(0),
		deep: uniform(new THREE.Color()),
		sky: uniform(new THREE.Color()),
		blush: uniform(new THREE.Color()),
		rim: uniform(new THREE.Color()),
	};
	const fbm = (p: Node<'vec2'>) => fbm2(p, 2.03, 7.1);
	const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: true });
	const vP = positionLocal.xy;
	const p = vP.sub(vec2(0, CENTRE_Y));
	const r = length(p).div(R_IN);
	// How far in from the edge of the opening: the arc above, the feet at the sides, the plinth below.
	const sides = min(abs(vP.x).negate().add(PORTAL_HALF_WIDTH), vP.y.sub(PLINTH_TOP));
	const edge = select(p.y.greaterThan(R_IN * Math.sin(FOOT)), min(sides, length(p).negate().add(R_IN)), sides);
	// Clouds wound round into a whirl that turns slowly, tighter towards the middle.
	const spin = u.time.mul(u.surge.mul(1.5).add(0.35)).add(float(2.2).div(r.add(0.45)));
	const c = cos(spin);
	const s = sin(spin);
	const q = vec2(c.mul(p.x).add(s.mul(p.y)), c.mul(p.y).sub(s.mul(p.x)));
	const n = fbm(q.mul(1.3).add(vec2(0, u.time.mul(0.08))));
	const wisps = smoothstep(0.5, 0.78, fbm(q.mul(2.4).sub(vec2(u.time.mul(0.05), 0))));
	let col = mix(u.deep, u.sky, smoothstep(0.15, 0.85, n.add(r.oneMinus().mul(0.35))));
	col = mix(col, u.blush, smoothstep(0.55, 0.9, n).mul(0.6));
	col = mix(col, vec3(1), wisps.mul(u.night.mul(-0.3).add(0.55)));
	// A bright eye in the middle, and a glowing rim.
	col = col.add(vec3(1, 0.97, 0.9).mul(pow(max(0, r.oneMinus()), 3).mul(u.surge.mul(1.5).add(0.55))));
	col = mix(col, u.rim, smoothstep(0, 0.32, edge).oneMinus().mul(0.85));
	// Stars twinkle in it by night.
	const cell = floor(q.mul(9));
	const star = step(0.93, hash2(cell)).mul(smoothstep(0, 0.12, length(fract(q.mul(9)).sub(0.5))).oneMinus());
	col = col.add(star.mul(u.night).mul(sin(u.time.mul(3).add(hash2(cell).mul(30))).mul(0.4).add(0.6)));
	material.colorNode = mix(col, vec3(1), u.surge.mul(0.5));
	return { material, u };
}

export interface Portal {
	group: THREE.Group;
	/** What the pointer picks: the arch and its opening. */
	pickable: THREE.Object3D;
	ready: Promise<void>;
	/** Turn the palette to day or night. */
	theme(night: boolean): void;
	/** 0 → 1 as someone goes through, and the whirl spins up and brightens. */
	surge: number;
	tick(time: number): void;
}

export function buildPortal(url: string, reduceMotion: boolean): Portal {
	const group = new THREE.Group();
	const pickable = new THREE.Group();
	group.add(pickable);

	const { material: veilMat, u } = veilMaterial();
	const glowMat = new THREE.MeshBasicMaterial({ color: '#bfeeff' });

	// A soft light spilling out of the opening, which shows by night.
	const light = new THREE.PointLight('#9fdcff', 0, 9, 1.5);
	light.position.set(0, CENTRE_Y, 1.2);
	group.add(light);

	// Motes of light drifting in from round about and swallowed by the whirl.
	const MOTES = 18;
	const motes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), glowMat, MOTES);
	motes.frustumCulled = false;
	group.add(motes);
	const moteSeeds = Array.from({ length: MOTES }, (_, i) => ({ phase: i / MOTES, angle: i * 2.39996, side: i % 2 ? 1 : -1 }));
	const place = new THREE.Object3D();

	const floats: { mesh: THREE.Object3D; base: THREE.Vector3; phase: number }[] = [];
	const FLOAT_AT = [new THREE.Vector3(-2.75, 3.4, 0.35), new THREE.Vector3(2.8, 3.95, -0.25), new THREE.Vector3(0.75, 4.75, 0.55)];

	let lit = false;
	const ready = new GLTFLoader().loadAsync(url).then((gltf) => {
		const cache = new Map<string, THREE.Material>();
		gltf.scene.traverse((child) => {
			const mesh = child as THREE.Mesh;
			if (!mesh.isMesh) return;
			if (mesh.name.startsWith('Veil')) {
				mesh.material = veilMat;
				return;
			}
			const swap = (m: THREE.Material) => {
				const std = m as THREE.MeshStandardMaterial;
				if (std.name === 'Glow') return glowMat;
				const key = std.color.getHexString();
				let mat = cache.get(key);
				if (!mat) cache.set(key, (mat = new THREE.MeshLambertMaterial({ color: std.color })));
				return mat;
			};
			mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
			mesh.castShadow = mesh.receiveShadow = true;
		});
		for (const name of ['Gate', 'Veil']) {
			const part = gltf.scene.getObjectByName(name);
			if (part) pickable.add(part);
		}
		FLOAT_AT.forEach((base, i) => {
			const mesh = gltf.scene.getObjectByName(`Float${i}`);
			if (!mesh) return;
			mesh.position.copy(base);
			group.add(mesh);
			floats.push({ mesh, base, phase: i * 2.1 });
		});
	});

	return {
		group,
		pickable,
		ready,
		surge: 0,
		theme(night) {
			u.night.value = night ? 1 : 0;
			u.deep.value.set(night ? '#2a2f7a' : '#6fb6f2');
			u.sky.value.set(night ? '#6a63c9' : '#bfe6ff');
			u.blush.value.set(night ? '#c48ae6' : '#ffc9e3');
			u.rim.value.set(night ? '#c9f2ff' : '#ffffff');
			glowMat.color.set(night ? '#c9f6ff' : '#e6fbff');
			lit = night;
		},
		tick(time) {
			const t = reduceMotion ? 0 : time;
			u.time.value = t;
			u.surge.value = this.surge;
			light.intensity = (lit ? 14 : 0) + this.surge * 30;
			for (const f of floats) {
				f.mesh.position.set(f.base.x, f.base.y + Math.sin(t * 0.9 + f.phase) * 0.18, f.base.z);
				f.mesh.rotation.y = t * 0.25 + f.phase;
			}
			moteSeeds.forEach((m, i) => {
				// Each one spirals in from a couple of metres out to the middle of the opening, then starts again.
				const k = (m.phase + t * (0.12 + this.surge * 0.6)) % 1;
				const r = (1 - k) * 2.6 + 0.1;
				const a = m.angle + k * 5 * m.side;
				place.position.set(Math.cos(a) * r * 0.9, CENTRE_Y + Math.sin(a) * r * 0.75, (1 - k) * 1.4 * m.side);
				const size = Math.sin(Math.PI * k) * (reduceMotion ? 0 : 1);
				place.scale.setScalar(size);
				place.updateMatrix();
				motes.setMatrixAt(i, place.matrix);
			});
			motes.instanceMatrix.needsUpdate = true;
		},
	};
}
