// The light and the sky: sun, ambient and sky light, a gradient dome with the sun (or the moon)
// in it, stars that come out at night, fog, and clouds drifting slowly round the island.
import * as THREE from 'three';
import { MeshBasicNodeMaterial, PointsNodeMaterial } from 'three/webgpu';
import { dot, instancedBufferAttribute, max, mix, normalize, pow, positionLocal, smoothstep, uniform } from 'three/tsl';
import type { Toon } from './look';
import type { Theme } from './theme';
import { TAU, rng } from '../nixkit/util';

export function createSky(scene: THREE.Scene, toon: Toon, theme: Theme) {
	const fog = new THREE.Fog('#ffffff', 110, 640);
	scene.fog = fog;

	const ambient = new THREE.AmbientLight('#ffffff', 1);
	const hemi = new THREE.HemisphereLight('#ffffff', '#ffffff', 0.5);
	const sun = new THREE.DirectionalLight('#ffffff', 1.8);
	const SUN_DIR = new THREE.Vector3(0.55, 0.72, 0.42).normalize();
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
	sun.shadow.bias = -0.0006;
	sun.shadow.normalBias = 0.03;
	// A warm glow that goes about with her at night.
	const lantern = new THREE.PointLight('#ffd38a', 0, 12, 1.4);
	scene.add(ambient, hemi, sun, sun.target, lantern);

	// The dome: from the horizon's colour up to the top's, with the sun (or the moon) a disc in it and
	// a glow round it. Worked out in linear colour, like everything else, and converted on the way out.
	const sky = {
		top: uniform(new THREE.Color()),
		horizon: uniform(new THREE.Color()),
		sunColor: uniform(new THREE.Color()),
	};
	const skyMat = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
	{
		const d = normalize(positionLocal);
		const s = dot(d, uniform(SUN_DIR));
		const col = mix(sky.horizon, sky.top, smoothstep(-0.02, 0.55, d.y));
		skyMat.colorNode = mix(col, sky.sunColor, smoothstep(0.9975, 0.998, s)).add(sky.sunColor.mul(pow(max(s, 0), 48).mul(0.22)));
	}
	const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
	dome.renderOrder = -2;
	scene.add(dome);
	const stars = (() => {
		const rand = rng(99);
		const pos = new Float32Array(900 * 3);
		for (let i = 0; i < 900; i++) {
			const a = rand() * TAU;
			const y = 0.08 + rand() * 0.92;
			const r = Math.sqrt(1 - y * y);
			pos.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
		}
		// Each star a little square two pixels across, as WebGL drew points (a sprite each: WebGPU's
		// own points are only ever one pixel).
		const mat = new PointsNodeMaterial({ color: '#fdfbff', size: 2 / Math.min(devicePixelRatio, 1.75), sizeAttenuation: false, fog: false, depthWrite: false });
		mat.positionNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(pos, 3));
		const points = new THREE.Sprite(mat as unknown as THREE.SpriteMaterial);
		points.count = 900;
		points.frustumCulled = false;
		return points;
	})();
	scene.add(stars);

	const cloudMat = toon({ color: '#ffffff' });
	const clouds = new THREE.Group();
	{
		const crand = rng(5);
		for (let i = 0; i < 28; i++) {
			const cloud = new THREE.Group();
			const puffs = 4 + Math.floor(crand() * 3);
			for (let k = 0; k < puffs; k++) {
				const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + crand() * 3, 1), cloudMat);
				puff.position.set((k - puffs / 2) * 4 + crand() * 2, crand() * 2, crand() * 4 - 2);
				puff.scale.y = 0.65;
				cloud.add(puff);
			}
			const a = (i / 28) * TAU + crand();
			const r = 100 + crand() * 240;
			cloud.position.set(Math.cos(a) * r, 48 + crand() * 26, Math.sin(a) * r);
			cloud.rotation.y = crand() * TAU;
			clouds.add(cloud);
		}
	}
	scene.add(clouds);

	theme.on((p) => {
		sky.top.value.set(p.top);
		sky.horizon.value.set(p.horizon);
		sky.sunColor.value.set(p.sunColor);
		fog.color.set(p.horizon);
		sun.color.set(p.sunColor);
		sun.intensity = p.sun;
		ambient.intensity = p.ambient;
		hemi.color.set(p.hemiSky);
		hemi.groundColor.set(p.hemiGround);
		hemi.intensity = p.hemi;
		cloudMat.color.set(p.cloud);
		stars.visible = p.night;
		lantern.intensity = p.night ? 2.2 : 0;
	});

	return {
		fog,
		/** Keeps the sky round the camera, and the sun's shadows and her lantern on her. */
		update(time: number, camera: THREE.Camera, her: THREE.Vector3) {
			dome.position.copy(camera.position);
			stars.position.copy(camera.position);
			sun.position.copy(her).addScaledVector(SUN_DIR, 80);
			sun.target.position.copy(her);
			lantern.position.set(her.x + 0.5, her.y + 2.2, her.z + 0.8);
			clouds.rotation.y = time * 0.004;
		},
	};
}
