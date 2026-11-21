// Day and night in Far Fields. It's night everywhere, except where the sun is: round it, and
// wherever it's been. That's drawn as the scene's fog (scene.fogNode), worked out for each pixel
// from how far it is from the sun, from Nixchan's ember, and from a map of the day the sun has
// left behind it. Where none of them reach, everything sinks into the night.
//
// The map is a texture over the land round home, a texel every CELL metres; each place's day
// comes up slowly to how bright it's going to be, so when the sun is set down the day spreads out
// from it. It's remembered as the stamps that made it (where, and how wide), and painted again
// from them when she comes back.
import * as THREE from 'three';
import { MeshToonNodeMaterial, type Node } from 'three/webgpu';
import { attribute, distance, float, fog, max, mix, positionLocal, positionWorld, rangeFogFactor, renderGroup, smoothstep, texture, uniform, vec2 } from 'three/tsl';

const CELL = 2;
const N = 1024;
const HALF = (N * CELL) / 2;
/** How fast a place's day comes up (of 1, a second). */
const RISE = 0.7;

/** A place the sun has lit: a disc `r` round (x, z). */
export type Stamp = [x: number, z: number, r: number];

export function createLight(fogRange: [number, number]) {
	// What the day is now at each texel (`data`, for the texture) and what it's going to be.
	const data = new Uint8Array(N * N);
	const goal = new Uint8Array(N * N);
	/** Texels still on their way up. */
	const rising = new Set<number>();
	const map = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
	map.magFilter = map.minFilter = THREE.LinearFilter;
	map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
	map.needsUpdate = true;

	// (In the render's group, as three's own fog's are: the fog is worked out once for the whole
	// scene, and uniforms in an object's group aren't sent again for it.)
	const u = {
		sun: uniform(new THREE.Vector3()).setGroup(renderGroup),
		sunR: uniform(10).setGroup(renderGroup),
		nix: uniform(new THREE.Vector3()).setGroup(renderGroup),
		emberR: uniform(5).setGroup(renderGroup),
		/** 0 at night, 1 once the sun's back in the sky (the end). */
		day: uniform(0).setGroup(renderGroup),
		night: uniform(new THREE.Color('#05061a')).setGroup(renderGroup),
		dusk: uniform(new THREE.Color('#5a2d3c')).setGroup(renderGroup),
		haze: uniform(new THREE.Color('#d7ecff')).setGroup(renderGroup),
	};

	/** How much day there is at a point on the land, 0 … 1 (a node, for any shader). */
	const lightAt = (p: Node<'vec3'>) => {
		const uv = vec2(p.x.add(HALF).div(N * CELL), p.z.add(HALF).div(N * CELL));
		const remembered = texture(map, uv).r;
		const sun = smoothstep(u.sunR, u.sunR.mul(0.55), distance(p.xz, u.sun.xz));
		const ember = smoothstep(u.emberR, u.emberR.mul(0.25), distance(p.xz, u.nix.xz));
		return max(max(remembered, sun), max(ember, u.day));
	};
	const lightVertex = (p: Node<'vec3'>) => {
		const uv = vec2(p.x.add(HALF).div(N * CELL), p.z.add(HALF).div(N * CELL));
		const remembered = texture(map, uv).level(float(0)).r;
		const sun = smoothstep(u.sunR, u.sunR.mul(0.55), distance(p.xz, u.sun.xz));
		return max(max(remembered, sun), u.day);
	};

	// The fog: the night where there's no day, a dusky glow at the edge of the day, and the usual
	// haze far off (into the night, until the end).
	const lit = lightAt(positionWorld);
	const edge = lit.mul(float(1).sub(lit)).mul(4).mul(float(1).sub(u.day));
	const far = rangeFogFactor(fogRange[0], fogRange[1]);
	const color = mix(mix(u.night, u.haze, u.day), u.dusk, edge.mul(0.55));
	const fogNode = fog(color, max(far, float(1).sub(lit).mul(0.985)));

	/** A flower's material: it grows out of the ground where the day is, and is gone in the night.
	 * Each vertex knows the root of its flower (`root`, in the world's coordinates). */
	function bloomMaterial(gradientMap: THREE.Texture) {
		const m = new MeshToonNodeMaterial({ gradientMap, vertexColors: true });
		const root = attribute('root', 'vec3');
		const grow = smoothstep(0.35, 0.9, lightVertex(root));
		m.positionNode = mix(root, positionLocal, grow);
		return m;
	}

	const index = (x: number, z: number) => {
		const i = Math.floor((x + HALF) / CELL);
		const j = Math.floor((z + HALF) / CELL);
		return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
	};

	return {
		fogNode,
		uniforms: u,
		bloomMaterial,
		/** Lights a disc of the map, slowly (or at once, painting it again from what's remembered). */
		stamp([x, z, r]: Stamp, now = false) {
			const i0 = Math.floor((x - r + HALF) / CELL);
			const i1 = Math.ceil((x + r + HALF) / CELL);
			const j0 = Math.floor((z - r + HALF) / CELL);
			const j1 = Math.ceil((z + r + HALF) / CELL);
			for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++)
				for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
					const d = Math.hypot((i + 0.5) * CELL - HALF - x, (j + 0.5) * CELL - HALF - z);
					const t = Math.min(1, Math.max(0, (r - d) / (r * 0.35)));
					const want = Math.round(255 * t * t * (3 - 2 * t));
					const k = j * N + i;
					if (want <= goal[k]) continue;
					goal[k] = want;
					if (now) data[k] = want;
					else rising.add(k);
				}
			if (now) map.needsUpdate = true;
		},
		/** Brings the day up where it's rising. */
		update(dt: number) {
			if (!rising.size) return;
			const step = Math.max(1, Math.round(255 * RISE * dt));
			for (const k of rising) {
				data[k] = Math.min(goal[k], data[k] + step);
				if (data[k] >= goal[k]) rising.delete(k);
			}
			map.needsUpdate = true;
		},
		/** How much day the map has at (x, z), 0 … 1 (what it's going to be, not what it is yet). */
		at(x: number, z: number) {
			const k = index(x, z);
			return k < 0 ? 0 : goal[k] / 255;
		},
		dispose() {
			map.dispose();
		},
	};
}

export type Light = ReturnType<typeof createLight>;
