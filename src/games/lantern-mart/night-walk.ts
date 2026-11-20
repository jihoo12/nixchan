// The parts of the neighbours' favours that are out in the town, and what the night looks like as
// they're done: Gomsun's umbrella and Yeoul's radish waiting where they were left (with a soft glow
// over them while someone's waiting for them), stars over the rooftops, and, once every favour is
// done, the town's sky lanterns rising from the streets.
import * as THREE from 'three';
import { PICKUPS, type Item } from './requests';
import type { Props } from './stalls';

const LANTERNS = 110;
const SKY = 88;

export function createNightWalk(scene: THREE.Scene, ko: boolean) {
	const group = new THREE.Group();
	group.name = 'Lantern Town · night walk';
	scene.add(group);

	// ---------- stars ----------
	// Far enough to sit behind everything, and drawn without fog so they stay crisp over the ridge.
	{
		const count = 520;
		const stars = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0),
			new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, toneMapped: false }), count);
		let seed = 9133;
		const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
		const o = new THREE.Object3D(), tint = new THREE.Color();
		for (let i = 0; i < count; i++) {
			const a = rand() * Math.PI * 2;
			const up = 0.12 + Math.pow(rand(), 0.8) * 0.85;
			const r = 240;
			o.position.set(-30 + Math.cos(a) * Math.cos(up * Math.PI / 2) * r, Math.sin(up * Math.PI / 2) * r * 0.62, 50 + Math.sin(a) * Math.cos(up * Math.PI / 2) * r);
			o.scale.setScalar(0.3 + rand() * rand() * 0.9);
			o.rotation.set(rand() * 3, rand() * 3, 0);
			o.updateMatrix();
			stars.setMatrixAt(i, o.matrix);
			stars.setColorAt(i, tint.set(['#ffffff', '#dfe8ff', '#fff1d6', '#cfdcff'][i % 4]).multiplyScalar(0.55 + rand() * 0.45));
		}
		stars.frustumCulled = false;
		group.add(stars);
	}

	// ---------- the things to fetch ----------
	const crate = new THREE.Group();
	{
		const wood = new THREE.MeshStandardMaterial({ color: '#8a5f45', roughness: 0.9 });
		const slat = new THREE.MeshStandardMaterial({ color: '#6a4637', roughness: 0.9 });
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.46), wood);
		body.position.y = 0.19;
		crate.add(body);
		for (const y of [0.1, 0.28]) {
			const band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.48), slat);
			band.position.y = y;
			crate.add(band);
		}
		crate.position.set(PICKUPS.radish.x, 0, PICKUPS.radish.z);
		crate.rotation.y = PICKUPS.radish.heading;
		group.add(crate);
	}
	// A glow on the ground and a little light bobbing over whatever's waiting to be fetched.
	const glowCanvas = document.createElement('canvas');
	glowCanvas.width = glowCanvas.height = 64;
	const gc = glowCanvas.getContext('2d');
	if (gc) {
		const g = gc.createRadialGradient(32, 32, 2, 32, 32, 31);
		g.addColorStop(0, '#ffffff');
		g.addColorStop(0.4, '#ffffff70');
		g.addColorStop(1, '#ffffff00');
		gc.fillStyle = g;
		gc.fillRect(0, 0, 64, 64);
	}
	const glowMap = new THREE.CanvasTexture(glowCanvas);
	const beacon = (x: number, z: number) => {
		const root = new THREE.Group();
		const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({
			map: glowMap, color: '#ffcf7a', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
		}));
		pool.rotation.x = -Math.PI / 2;
		pool.position.y = 0.02;
		const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: '#ffe2a6', toneMapped: false }));
		root.add(pool, spark);
		root.position.set(x, 0, z);
		root.visible = false;
		group.add(root);
		return { root, spark };
	};
	const spots = {
		umbrella: { ...beacon(PICKUPS.umbrella.x, PICKUPS.umbrella.z), prop: null as THREE.Object3D | null },
		radish: { ...beacon(PICKUPS.radish.x, PICKUPS.radish.z), prop: null as THREE.Object3D | null },
	};

	// ---------- the sky lanterns ----------
	let lanterns: THREE.InstancedMesh[] = [];
	const flight = Array.from({ length: LANTERNS }, () => ({ x: 0, z: 0, y: -10, speed: 1, sway: 0, size: 1 }));
	let festival = false;
	const launch = (l: (typeof flight)[number], fromStreet: boolean, height: number) => {
		if (fromStreet) {
			// The first ones go up from the mart's street, where the neighbours are.
			l.x = -20 + Math.random() * 40;
			l.z = -2 + Math.random() * 22;
		} else {
			// Then from all over town: along the main street, the market, the station and the hill.
			const spots = [[0, 20, 6, 80], [-36, 45, 14, 10], [36, 45, 12, 10], [0, 100, 20, 8], [-120, 60, 25, 12]] as const;
			const [cx, cz, rx, rz] = spots[Math.floor(Math.random() * spots.length)];
			l.x = cx + (Math.random() - 0.5) * 2 * rx;
			l.z = cz + (Math.random() - 0.5) * 2 * rz;
		}
		l.y = height;
		l.speed = 0.9 + Math.random() * 0.9;
		l.sway = Math.random() * Math.PI * 2;
		l.size = 0.85 + Math.random() * 0.5;
	};

	let props: Props | null = null;
	const o = new THREE.Object3D();
	return {
		setProps(p: Props) {
			props = p;
			// Copies of the umbrella and the radish, left where they were forgotten.
			const umbrella = p.umbrella.clone();
			umbrella.position.set(PICKUPS.umbrella.x, 0.5, PICKUPS.umbrella.z);
			// Stood on its tip, handle up, leaning on the lamp post.
			umbrella.rotation.set(0, PICKUPS.umbrella.heading, Math.PI + 0.2);
			umbrella.scale.setScalar(1.7);
			const radish = p.radish.clone();
			radish.position.set(0.02, 0.48, 0);
			radish.rotation.set(0, 0, Math.PI / 2 - 0.1);
			radish.scale.setScalar(1.6);
			crate.add(radish);
			group.add(umbrella);
			spots.umbrella.prop = umbrella;
			spots.radish.prop = radish;
			// The sky lanterns are one instanced batch per part of the model.
			const meshes: THREE.Mesh[] = [];
			p.skyLantern.traverse((m) => m instanceof THREE.Mesh && meshes.push(m));
			lanterns = meshes.map((m) => {
				const material = (m.material as THREE.MeshStandardMaterial).clone();
				const lit = material.name.startsWith('Glow')
					// Lit from inside by the candle: a deep warm orange rather than the paper's own cream.
					? new THREE.MeshBasicMaterial({ color: '#ff9f45', fog: false, toneMapped: false })
					: new THREE.MeshBasicMaterial({ color: '#6a3324', fog: false });
				const batch = new THREE.InstancedMesh(m.geometry, lit, LANTERNS);
				batch.frustumCulled = false;
				batch.visible = false;
				group.add(batch);
				return batch;
			});
		},
		/** The lanterns go up. `now` is true the moment the last favour's done, so they rise from the
		 * street; otherwise (coming back to a town that's already had its festival) they're already
		 * spread over the sky. */
		celebrate(now: boolean) {
			if (festival) return;
			festival = true;
			flight.forEach((l, i) => launch(l, now, now ? -i * 0.3 : 2 + Math.random() * (SKY - 2)));
		},
		/** What's left to pick up near her, if she can take it. */
		offer(pos: THREE.Vector3, waiting: (item: 'umbrella' | 'radish') => boolean, handsFree: boolean, pick: (item: Item) => void) {
			if (!handsFree || !props) return null;
			for (const item of ['umbrella', 'radish'] as const) {
				const at = PICKUPS[item];
				if (!waiting(item) || Math.hypot(pos.x - at.x, pos.z - at.z) > 1.8) continue;
				const label = item === 'umbrella' ? (ko ? '노란 우산 줍기' : 'Pick up the yellow umbrella') : (ko ? '무 챙기기' : 'Take the radish');
				return { label, go: () => pick(item) };
			}
			return null;
		},
		update(dt: number, time: number, reduced: boolean, show: (item: 'umbrella' | 'radish') => boolean) {
			for (const item of ['umbrella', 'radish'] as const) {
				const spot = spots[item];
				const here = show(item);
				if (spot.prop) spot.prop.visible = here;
				spot.root.visible = here;
				if (here) spot.spark.position.y = 1.45 + (reduced ? 0 : Math.sin(time * 2.4) * 0.1);
				if (here && !reduced) spot.spark.rotation.y = time * 1.3;
			}
			if (!festival || !lanterns.length) return;
			for (let i = 0; i < LANTERNS; i++) {
				const l = flight[i];
				if (!reduced) l.y += l.speed * dt;
				if (l.y > SKY) launch(l, false, 0.5);
				const y = Math.max(0, l.y);
				const drift = reduced ? 0 : Math.sin(time * 0.3 + l.sway) * (0.4 + y * 0.03);
				o.position.set(l.x + drift + y * 0.12, y + 0.4, l.z + Math.cos(time * 0.23 + l.sway) * 0.3);
				o.rotation.set(0, l.sway + time * 0.1, Math.sin(time * 0.8 + l.sway) * 0.06);
				// Not yet let go (waiting their turn below the street), they're not drawn.
				o.scale.setScalar(l.y < 0 ? 0 : l.size * 1.35 * Math.min(1, 0.3 + l.y * 0.25));
				o.updateMatrix();
				for (const batch of lanterns) batch.setMatrixAt(i, o.matrix);
			}
			for (const batch of lanterns) {
				batch.visible = true;
				batch.instanceMatrix.needsUpdate = true;
			}
		},
	};
}
