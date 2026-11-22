// What's thrown about in the spar, drawn: Noeul's embers (orbs, a ring of flame that runs out
// along the roof, marks where embers will fall) and Nixchan's snowballs. Each kind is a small
// pool of meshes, taken and put back, so nothing's made mid-fight.
import * as THREE from 'three';

function glow(color: string, opacity: number) {
	return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

/** A pool of meshes: `take()` one (shown), `give(m)` it back (hidden). */
export function pool(scene: THREE.Scene, make: () => THREE.Object3D, size: number) {
	const free: THREE.Object3D[] = [];
	for (let i = 0; i < size; i++) {
		const m = make();
		m.visible = false;
		scene.add(m);
		free.push(m);
	}
	return {
		take() {
			const m = free.pop() ?? (() => {
				const n = make();
				scene.add(n);
				return n;
			})();
			m.visible = true;
			return m;
		},
		give(m: THREE.Object3D) {
			m.visible = false;
			free.push(m);
		},
	};
}

/** A glowing ball: a bright core in a soft halo. */
function orb(core: string, halo: string, r: number) {
	const g = new THREE.Group();
	g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: core, toneMapped: false })));
	const h = new THREE.Mesh(new THREE.SphereGeometry(r * 2.3, 16, 12), glow(halo, 0.45));
	g.add(h);
	return g;
}

export function createFx(scene: THREE.Scene) {
	return {
		ember: pool(scene, () => orb('#fff0c2', '#ff7a2e', 0.17), 30),
		snowball: pool(scene, () => orb('#f4fbff', '#8fd0ff', 0.19), 20),
		/** A wall of flame, a metre round: scaled out to the ring's radius as it runs. */
		flame: pool(scene, () => {
			const g = new THREE.Group();
			const wall = glow('#ff7a2e', 0.65);
			wall.side = THREE.DoubleSide;
			g.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.55, 96, 1, true).translate(0, 0.275, 0), wall));
			const top = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 96), glow('#ffd36b', 0.9));
			top.rotation.x = Math.PI / 2;
			top.position.y = 0.55;
			g.add(top);
			return g;
		}, 4),
		/** Where embers will fall: a ring on the roof, and a disc filling it as they come. */
		mark: pool(scene, () => {
			const g = new THREE.Group();
			const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.3, 40), glow('#ff6a3a', 0.8));
			const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), glow('#ff9a4d', 0.25));
			ring.rotation.x = disc.rotation.x = -Math.PI / 2;
			ring.position.y = 0.03;
			disc.position.y = 0.025;
			g.add(ring, disc);
			return g;
		}, 10),
		/** A lantern: a great ember that drifts after Nixchan. */
		lantern: pool(scene, () => orb('#fff3c8', '#ff5a1e', 0.42), 3),
		/** A falling ember, bigger than a thrown one. */
		drop: pool(scene, () => orb('#fff0c2', '#ff6a2e', 0.32), 10),
		/** A warm light round Noeul, as bright as her ember is. */
		aura: (() => {
			const l = new THREE.PointLight('#ff8a3d', 3, 6, 1.6);
			scene.add(l);
			return l;
		})(),
	};
}
