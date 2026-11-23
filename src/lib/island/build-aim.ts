import { Raycaster, Vector2, Vector3, type Camera, type Ray } from 'three';
import type { Obstacle } from '../nixkit/world';

export const BUILD_REACH = 6;
export const BUILD_RAY_FAR = 70;

type Height = (x: number, z: number) => number;
export type PlacementAim = { mode: 'facing' } | {
	mode: 'mouse';
	hit: { x: number; y: number; z: number; kind?: 'surface' | 'blocked' } | null;
};
type PointerRay = { mode: 'facing' } | { mode: 'mouse'; ray: Ray | null };

/** March over the same continuous heightfield used by movement, and refine the first
 * crossing. This avoids raycasting every terrain triangle each animation frame. */
export function castBuildSurface(ray: Ray, height: Height, far = BUILD_RAY_FAR) {
	if (!Number.isFinite(far) || far <= 0) return null;
	const p = new Vector3();
	const above = (t: number) => {
		ray.at(t, p);
		return p.y > height(p.x, p.z);
	};
	let previous = 0;
	if (!above(previous)) return null; // camera embedded in terrain: no valid aim
	while (previous < far) {
		const distance = Math.min(far, previous + .25);
		if (!above(distance)) {
			let lo = previous, hi = distance;
			for (let i = 0; i < 10; ++i) {
				const mid = (lo + hi) / 2;
				if (above(mid)) lo = mid;
				else hi = mid;
			}
			return { distance: hi, point: ray.at(hi, p) };
		}
		previous = distance;
	}
	return null;
}

/** Test the spatially indexed physical colliders rather than all scene meshes, which
 * would also hit the actor, placement ghosts, water effects and decorative plants. */
export function castBuildSolid(ray: Ray, nearby: (x: number, z: number) => readonly Obstacle[], floor: Height, far: number) {
	if (!Number.isFinite(far) || far <= 0) return null;
	const checked = new Set<Obstacle>();
	const { origin: o, direction: d } = ray;
	const planar = d.x * d.x + d.z * d.z;
	const p = new Vector3();
	let best: { distance: number; hit: { x: number; y: number; z: number } } | null = null;
	// The feature grid's cells are 4m with an overlap margin. Half-metre sampling
	// brings them into the query; exact entry distance is then computed per feature.
	for (let t = 0; t <= far + .5; t += .5) {
		if (t > (best?.distance ?? far) + 2) break;
		ray.at(Math.min(t, far), p);
		for (const f of nearby(p.x, p.z)) {
			if (checked.has(f)) continue;
			checked.add(f);
			if (f.pad !== undefined || f.dome || f.r <= 0) continue;
			const base = f.floor ?? floor(f.x, f.z);
			const top = f.top ?? base + 2.45;
			if (!Number.isFinite(base) || !Number.isFinite(top) || top <= base) continue;
			let lo = .045, hi = best?.distance ?? far;
			const x = o.x - f.x, z = o.z - f.z;
			const c = x * x + z * z - f.r * f.r;
			if (planar > 1e-8) {
				const b = x * d.x + z * d.z, discriminant = b * b - planar * c;
				if (discriminant < 0) continue;
				const root = Math.sqrt(discriminant);
				lo = Math.max(lo, (-b - root) / planar);
				hi = Math.min(hi, (-b + root) / planar);
			} else if (c > 0) continue;
			if (Math.abs(d.y) > 1e-8) {
				const a = (base - o.y) / d.y, b = (top - o.y) / d.y;
				lo = Math.max(lo, Math.min(a, b));
				hi = Math.min(hi, Math.max(a, b));
			} else if (o.y < base || o.y > top) continue;
			if (lo > hi || best && lo >= best.distance) continue;
			// Clicking a machine's visible collider identifies its ground anchor for Q,
			// but blocked hits must never be used for placing another machine.
			best = { distance: lo, hit: { x: f.x, y: base, z: f.z } };
		}
	}
	return best;
}

export function createBuildAim({
	canvas, camera, player, ground, solidFloor, nearby,
}: {
	canvas: HTMLCanvasElement; camera: Camera; player: Vector3;
	ground: Height; solidFloor: Height; nearby: (x: number, z: number) => readonly Obstacle[];
}) {
	let mode: 'facing' | 'mouse' = 'facing';
	let pointer: { x: number; y: number } | null = null;
	const raycaster = new Raycaster();
	const ndc = new Vector2();
	const update = (e: PointerEvent) => {
		mode = e.pointerType === 'mouse' ? 'mouse' : 'facing';
		pointer = mode === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
	};
	for (const event of ['pointerenter', 'pointermove', 'pointerdown'] as const) canvas.addEventListener(event, update);
	const clear = () => { pointer = null; };
	canvas.addEventListener('pointerleave', clear);
	canvas.addEventListener('pointercancel', clear);
	window.addEventListener('blur', clear);

	function ray(): PointerRay {
		if (mode === 'facing') return { mode };
		if (!pointer) return { mode, ray: null };
		const rect = canvas.getBoundingClientRect();
		const x = (pointer.x - rect.left) / rect.width, y = (pointer.y - rect.top) / rect.height;
		if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return { mode, ray: null };
		camera.updateWorldMatrix(true, false);
		raycaster.setFromCamera(ndc.set(x * 2 - 1, 1 - y * 2), camera);
		return { mode, ray: raycaster.ray };
	}
	const solid = (ray: Ray, far: number) => castBuildSolid(ray, nearby, solidFloor, far);
	function sample(): PlacementAim {
		const at = ray();
		if (at.mode === 'facing') return at;
		if (!at.ray || at.ray.origin.y <= ground(at.ray.origin.x, at.ray.origin.z)) return { mode: 'mouse', hit: null };
		const surface = castBuildSurface(at.ray, ground);
		const obstacle = solid(at.ray, surface?.distance ?? BUILD_RAY_FAR);
		const point = obstacle?.hit ?? surface?.point;
		if (!point || Math.hypot(point.x - player.x, point.z - player.z) > BUILD_REACH || Math.abs(point.y - player.y) > 2.8)
			return { mode: 'mouse', hit: null };
		const { x, y, z } = point;
		return { mode: 'mouse', hit: { x, y, z, kind: obstacle ? 'blocked' : 'surface' } };
	}
	return { ray, solid, sample, get mode() { return mode; } };
}
