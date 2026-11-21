// Sparks of the sun, knocked off it as it fell: seven of them, each on high ground somewhere round
// home and on the way to the peak, always the same places. They glow through the night, so they
// can be seen from far off, and draw her out into the dark to fetch them. Each one she brings in
// makes the sun bigger and its day wider; it needs five to go back up into the sky.
import * as THREE from 'three';
import { glowTexture } from '../../lib/nixkit/look';
import { height } from './noise';

export const SPARKS_NEEDED = 5;

/** Roughly where each one is: it lies on the highest ground within 40 m of here. */
const ROUGHLY: [number, number][] = [
	[55, 45],
	[-150, 80],
	[160, -150],
	[-70, -270],
	[310, -240],
	[110, -430],
	[500, -420],
];

export interface Spark {
	id: number;
	at: THREE.Vector3;
}

export function sparkPlaces(): Spark[] {
	return ROUGHLY.map(([x0, z0], id) => {
		let best = new THREE.Vector3(x0, height(x0, z0), z0);
		for (let a = 0; a < 16; a++)
			for (const d of [12, 24, 36]) {
				const x = x0 + Math.cos(a * 0.39) * d;
				const z = z0 + Math.sin(a * 0.39) * d;
				const y = height(x, z);
				if (y > best.y) best = new THREE.Vector3(x, y, z);
			}
		// (Never in the sea.)
		best.y = Math.max(best.y, 0.5) + 1.3;
		return { id, at: best };
	});
}

export function createSparkLook() {
	const geo = new THREE.OctahedronGeometry(0.3, 0);
	const mat = new THREE.MeshBasicMaterial({ color: '#fff2b0', fog: false });
	const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf6a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
	const beamMat = new THREE.MeshBasicMaterial({ color: '#ffd889', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
	const beamGeo = new THREE.CylinderGeometry(0.12, 0.3, 18, 6, 1, true).translate(0, 9, 0);
	return (at: THREE.Vector3) => {
		const g = new THREE.Group();
		g.position.copy(at);
		const gem = new THREE.Mesh(geo, mat);
		const glow = new THREE.Sprite(glowMat);
		glow.scale.setScalar(3.4);
		const beam = new THREE.Mesh(beamGeo, beamMat);
		beam.position.y = -1.3;
		beam.frustumCulled = false;
		g.add(gem, glow, beam);
		return {
			group: g,
			update(time: number) {
				gem.rotation.y = time * 1.8;
				gem.position.y = Math.sin(time * 1.6) * 0.18;
				glow.position.y = gem.position.y;
				glow.scale.setScalar(3.2 + Math.sin(time * 4.1) * 0.4);
			},
		};
	};
}
