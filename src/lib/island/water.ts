// The sea: one big plane whose colour comes from how deep the sea floor is beneath it, so the
// shallows glow turquoise and foam laps at the shore without any depth buffer tricks. And ripples
// that spread out on it wherever she swims or wades.
import * as THREE from 'three';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import { cameraPosition, distance, float, fract, length, max, mix, positionWorld, select, sin, smoothstep, step, texture, uniform, vec2 } from 'three/tsl';
import { HALF, N, SIZE, STEP, heights } from './terrain';
import type { Theme } from './theme';

export function createWater(scene: THREE.Scene, fog: THREE.Fog, theme: Theme) {
	// Half floats, not bytes: a byte's 4 cm steps showed as wobbles in the surf on the flattest beaches.
	const data = new Uint16Array((N + 1) * (N + 1));
	for (let k = 0; k < data.length; k++) data[k] = THREE.DataUtils.toHalfFloat(heights[k]);
	const depthTex = new THREE.DataTexture(data, N + 1, N + 1, THREE.RedFormat, THREE.HalfFloatType);
	depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
	depthTex.needsUpdate = true;
	const u = {
		time: uniform(0),
		shallow: uniform(new THREE.Color()),
		deep: uniform(new THREE.Color()),
		foam: uniform(new THREE.Color()),
		fogColor: uniform(fog.color),
	};
	const waterMat = new MeshBasicNodeMaterial({
		transparent: true,
		// The sea does its own fog, below.
		fog: false,
		// Where the beach runs almost level with the sea the two would fight over every pixel; nudge
		// the water back a hair so the sand always wins there.
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 4,
	});
	{
		const world = positionWorld;
		const t = u.time;
		// The texel centres sit on the grid's vertices.
		const lo = -HALF - STEP / 2;
		const uv = world.xz.sub(lo).div(SIZE + STEP);
		const height = (at: Node<'vec2'>) => texture(depthTex, at).r;
		const onMap = uv.x.greaterThan(0).and(uv.y.greaterThan(0)).and(uv.x.lessThan(1)).and(uv.y.lessThan(1));
		const h = select(onMap, height(uv), float(-6));
		const depth = max(h.negate(), 0);
		const dist = distance(cameraPosition, world);
		const w = sin(world.x.mul(0.35).add(t.mul(1.1))).mul(sin(world.z.mul(0.3).sub(t.mul(0.9)))).add(sin(world.x.add(world.z).mul(0.6).add(t.mul(1.7))).mul(0.5));
		const shine = step(1.1, w).mul(0.07).mul(smoothstep(30, 140, dist).oneMinus());
		const col = mix(u.shallow, u.deep, smoothstep(0, 4.5, depth)).add(shine);
		// How steeply the sea floor shelves here, in metres down per metre out.
		const texel = 1 / (N + 1);
		const dx = vec2(texel, 0);
		const dz = vec2(0, texel);
		const slope = length(vec2(height(uv.add(dx)).sub(height(uv.sub(dx))), height(uv.add(dz)).sub(height(uv.sub(dz))))).div(2 * STEP);
		// A band of foam right at the water's edge, measured in depth scaled by the slope so it's
		// about half a metre wide and laps a few tens of centimetres whether the beach is steep or flat.
		const sl = max(slope, 0.04);
		const lap = depth.add(sl.mul(0.2).mul(sin(t.mul(1.6).add(world.x.mul(0.2)).add(world.z.mul(0.15)))));
		const edge = smoothstep(sl.mul(0.25), sl.mul(0.6), lap).oneMinus();
		// Rings of it rolling in over the shallows. They follow the depth, so over a near-level
		// shelf a whole stretch of sea would flash white at once; keep them to where the sea
		// floor shelves enough to make lines.
		const ring = step(0.9, fract(depth.mul(2.2).sub(t.mul(0.35)))).mul(smoothstep(0.2, 0.9, depth).oneMinus()).mul(smoothstep(0.05, 0.11, slope));
		const foam = max(edge, ring.mul(0.7));
		// The deep sea is opaque, so nothing shows past the edge of the sea floor.
		const alpha = max(mix(0.5, 1, smoothstep(0, 5, depth)), foam);
		const fogged = smoothstep(fog.near, fog.far, dist);
		waterMat.colorNode = mix(mix(col, u.foam, foam), u.fogColor, fogged);
		waterMat.opacityNode = mix(alpha, 1, fogged);
	}
	{
		const geo = new THREE.PlaneGeometry(4000, 4000);
		geo.rotateX(-Math.PI / 2);
		scene.add(new THREE.Mesh(geo, waterMat));
	}

	const ripples = Array.from({ length: 10 }, () => {
		const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
		const geo = new THREE.RingGeometry(0.82, 1, 40);
		geo.rotateX(-Math.PI / 2);
		const mesh = new THREE.Mesh(geo, mat);
		mesh.visible = false;
		mesh.renderOrder = 2;
		scene.add(mesh);
		return { mesh, mat, age: 0, size: 1 };
	});
	let nextRipple = 0;

	theme.on((p) => {
		u.shallow.value.set(p.shallow);
		u.deep.value.set(p.deep);
		u.foam.value.set(p.foam);
		for (const r of ripples) r.mat.color.set(p.foam);
	});

	return {
		/** Starts a ring spreading on the water at (x, z): the sea, or water standing at `level`. */
		ripple(x: number, z: number, size: number, level = 0) {
			const r = ripples[nextRipple];
			nextRipple = (nextRipple + 1) % ripples.length;
			r.mesh.position.set(x, level + 0.04, z);
			r.mesh.visible = true;
			r.age = 0;
			r.size = size;
		},
		update(time: number, dt: number) {
			for (const r of ripples) {
				if (!r.mesh.visible) continue;
				r.age += dt;
				const t = r.age / 1.3;
				if (t >= 1) {
					r.mesh.visible = false;
					continue;
				}
				r.mesh.scale.setScalar(r.size * (0.6 + t * 2.2));
				r.mat.opacity = 0.75 * (1 - t) * (1 - t);
			}
			u.time.value = time;
		},
	};
}
