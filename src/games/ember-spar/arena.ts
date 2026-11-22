// The rooftop: a round roof high over the city at sunset, with a railing round it, lanterns, a
// water tank, and the city's towers all round below, their windows coming on. Whatever the site's
// clock says, it's always the moment the sun goes down up here.
import * as THREE from 'three';
import type { Game } from '../../lib/nixkit/game';

export const ROOF = 13;

/** The sky at sunset, top to bottom, and the light. */
const DUSK = { top: '#2d2557', middle: '#9d5a8f', bottom: '#ffb070', fog: '#d98a86', sun: '#ffc08a', sunPower: 2.1, hemiTop: '#ffd9c2', hemiGround: '#4c3f78', hemi: 1.25 };

export function buildArena(game: Game) {
	const { parts, scene, toon } = game;

	// ---------- the sky ----------

	const canvas = document.createElement('canvas');
	canvas.width = 2;
	canvas.height = 256;
	const ctx = canvas.getContext('2d')!;
	const g = ctx.createLinearGradient(0, 0, 0, 256);
	g.addColorStop(0, DUSK.top);
	g.addColorStop(0.55, DUSK.middle);
	g.addColorStop(1, DUSK.bottom);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 2, 256);
	const sky = new THREE.CanvasTexture(canvas);
	sky.colorSpace = THREE.SRGBColorSpace;
	const dusk = () => {
		scene.background = sky;
		(scene.fog as THREE.Fog).color.set(DUSK.fog);
		(scene.fog as THREE.Fog).near = 40;
		(scene.fog as THREE.Fog).far = 190;
		game.sky.sun.color.set(DUSK.sun);
		game.sky.sun.intensity = DUSK.sunPower;
		game.sky.hemi.color.set(DUSK.hemiTop);
		game.sky.hemi.groundColor.set(DUSK.hemiGround);
		game.sky.hemi.intensity = DUSK.hemi;
	};
	game.sky.clock.on(dusk);
	dusk();

	// The sun itself, low on the horizon, and a glow round it.
	const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: '#ffe0a8', fog: false, toneMapped: false }));
	sun.position.set(-60, 9, -150);
	sun.lookAt(0, 9, 0);
	scene.add(sun);
	const halo = new THREE.Mesh(new THREE.CircleGeometry(22, 48), new THREE.MeshBasicMaterial({ color: '#ff9f6b', transparent: true, opacity: 0.35, fog: false, depthWrite: false }));
	halo.position.copy(sun.position).add(new THREE.Vector3(0, 0, -1));
	halo.lookAt(0, 9, 0);
	scene.add(halo);

	// ---------- the roof ----------

	parts.add({ at: [0, -0.5, 0], size: [ROOF * 2, 1, ROOF * 2], shape: 'cylinder', color: '#7d7394' });
	// The building under it, going down into the city.
	parts.add({ at: [0, -16, 0], size: [ROOF * 2 - 0.6, 30, ROOF * 2 - 0.6], shape: 'cylinder', color: '#4d4670', solid: false });
	// A ring painted on the roof where they spar, and tiles round it.
	const ring = new THREE.Mesh(new THREE.RingGeometry(8.6, 8.9, 96), new THREE.MeshBasicMaterial({ color: '#ffd6a0', transparent: true, opacity: 0.5 }));
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = 0.015;
	scene.add(ring);
	const inner = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.35, 64), new THREE.MeshBasicMaterial({ color: '#c9e8ff', transparent: true, opacity: 0.45 }));
	inner.rotation.x = -Math.PI / 2;
	inner.position.y = 0.015;
	scene.add(inner);

	// A railing all the way round, too tall to hop.
	const posts = 36;
	for (let i = 0; i < posts; i++) {
		const a = (i / posts) * Math.PI * 2;
		parts.add({ at: [Math.sin(a) * (ROOF - 0.25), 0.65, Math.cos(a) * (ROOF - 0.25)], size: [0.16, 1.3, 0.16], shape: 'cylinder', color: '#3b3560' });
	}
	const rail = new THREE.Mesh(new THREE.TorusGeometry(ROOF - 0.25, 0.07, 8, 160), toon({ color: '#3b3560' }));
	rail.rotation.x = Math.PI / 2;
	rail.position.y = 1.3;
	scene.add(rail);
	// What actually keeps her on the roof: a wall she can't see, higher than she jumps.
	for (let i = 0; i < 48; i++) {
		const a = (i / 48) * Math.PI * 2;
		parts.add({ at: [Math.sin(a) * (ROOF + 0.1), 3, Math.cos(a) * (ROOF + 0.1)], size: [1.9, 6, 0.4], color: '#000000' }).mesh.visible = false;
	}

	// Lanterns on posts round the edge, warm in the dusk.
	const glow = new THREE.MeshBasicMaterial({ color: '#ffd28a', toneMapped: false });
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
		const x = Math.sin(a) * (ROOF - 1.1);
		const z = Math.cos(a) * (ROOF - 1.1);
		parts.add({ at: [x, 1.2, z], size: [0.18, 2.4, 0.18], shape: 'cylinder', color: '#2f2a4d' });
		const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), glow);
		lamp.position.set(x, 2.6, z);
		scene.add(lamp);
		const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.3, 12), toon({ color: '#2f2a4d' }));
		cap.position.set(x, 2.98, z);
		scene.add(cap);
	}
	// A water tank and a stairway hut by the edge, behind where Nixchan starts.
	parts.add({ at: [-8.4, 1.4, -6.2], size: [2.6, 2.8, 2.6], shape: 'cylinder', color: '#a7637c' });
	parts.add({ at: [-8.4, 3.0, -6.2], size: [2.8, 0.4, 2.8], shape: 'cylinder', color: '#6f4062' });
	parts.add({ at: [8.6, 1.3, -6.6], size: [3, 2.6, 2.2], color: '#5d557f' });
	parts.add({ at: [8.6, 2.75, -6.6], size: [3.3, 0.3, 2.5], color: '#3b3560' });

	// ---------- the city ----------

	// Towers in rings round the roof, lower near it and taller far off, each a little different.
	const box = new THREE.BoxGeometry(1, 1, 1);
	const towerColours = ['#5a4f86', '#6b5a8e', '#4a4377', '#7a5f8a', '#59507a'].map((c) => toon({ color: c }));
	const windows: THREE.Matrix4[] = [];
	const m = new THREE.Matrix4();
	const quat = new THREE.Quaternion();
	let seed = 7;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	for (let i = 0; i < 90; i++) {
		const a = rand() * Math.PI * 2;
		const r = 24 + rand() * 90;
		const w = 6 + rand() * 9;
		const d = 6 + rand() * 9;
		const top = -18 + rand() * 14 + (r - 24) * 0.25;
		const x = Math.sin(a) * r;
		const z = Math.cos(a) * r;
		const tower = new THREE.Mesh(box, towerColours[i % towerColours.length]);
		tower.scale.set(w, top + 60, d);
		tower.position.set(x, (top - 60) / 2, z);
		tower.rotation.y = a;
		scene.add(tower);
		// Lit windows on the side facing the roof.
		quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI);
		const face = new THREE.Vector3(0, 0, -d / 2 - 0.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
		for (let fy = top - 2; fy > top - 26; fy -= 2.4) {
			for (let fx = -w / 2 + 1; fx < w / 2 - 0.6; fx += 1.6) {
				if (rand() < 0.45) continue;
				const side = new THREE.Vector3(fx, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
				m.compose(new THREE.Vector3(x + face.x + side.x, fy, z + face.z + side.z), quat, new THREE.Vector3(0.8, 1.1, 1));
				windows.push(m.clone());
			}
		}
	}
	const lit = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffd59a', side: THREE.DoubleSide }), windows.length);
	windows.forEach((w, i) => lit.setMatrixAt(i, w));
	scene.add(lit);

	return {
		/** The ring on the roof brightens as the spar starts, and dims between. */
		setLive(on: boolean) {
			(ring.material as THREE.MeshBasicMaterial).opacity = on ? 0.8 : 0.5;
		},
	};
}
