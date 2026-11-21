// The sun, fallen: a ball of light about as big as Nixchan's head, warm, with a ring of little
// rays turning round it. It shines through the night (no fog on it), so wherever it's set down it
// can be seen from far off. It grows a little with every spark of it she finds (sparks.ts).
import * as THREE from 'three';
import { glowTexture } from '../../lib/nixkit/look';

export function createSun() {
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);

	const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 2), new THREE.MeshBasicMaterial({ color: '#fff6c4', fog: false }));
	const shell = new THREE.Mesh(
		new THREE.IcosahedronGeometry(0.46, 2),
		new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
	);
	body.add(core, shell);

	const rays = new THREE.Group();
	const rayGeo = new THREE.ConeGeometry(0.07, 0.36, 5).translate(0, 0.62, 0);
	const rayMat = new THREE.MeshBasicMaterial({ color: '#ffd36e', fog: false });
	for (let i = 0; i < 10; i++) {
		const ray = new THREE.Mesh(rayGeo, rayMat);
		ray.rotation.z = (i / 10) * Math.PI * 2;
		rays.add(ray);
	}
	body.add(rays);

	const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffc566', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
	const glow = new THREE.Sprite(glowMat);
	glow.scale.setScalar(4);
	body.add(glow);

	const lamp = new THREE.PointLight('#ffcf7a', 14, 18, 1.4);
	body.add(lamp);

	let size = 1;
	return {
		root,
		/** How big it's grown (1 to begin with). */
		setSize(s: number) {
			size = s;
		},
		/** How bright its own lamp is (it dims while it's in her arms, so as not to blind her). */
		lamp,
		update(_dt: number, time: number) {
			const pulse = 1 + Math.sin(time * 2.3) * 0.04;
			body.scale.setScalar(size * pulse);
			rays.rotation.y = time * 0.7;
			rays.rotation.x = Math.sin(time * 0.4) * 0.5;
			shell.scale.setScalar(1 + Math.sin(time * 3.1) * 0.06);
			glow.material.rotation = time * 0.2;
		},
	};
}

export type Sun = ReturnType<typeof createSun>;
