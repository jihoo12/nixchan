import * as THREE from 'three';
import type { Game } from '../../lib/nixkit/game';
import { cloudSea } from '../../lib/nixkit/scenery';
import { bearing, FINISH, SLAB_HEIGHT, STEPS } from './course';

export const COLORS = ['#b5b9e4', '#a7cddc', '#babbec', '#9fd6cc', '#f7c97c'];

export function dressCourse(game: Game) {
	const { scene, toon } = game;
	const rim = new THREE.MeshBasicMaterial({ color: '#b2aaef' });
	const inlay = new THREE.MeshBasicMaterial({ color: '#ffdfa7' });
	const stone = toon({ color: '#515785' });
	const shade = toon({ color: '#353457' });
	const metal = toon({ color: '#7665a1' });
	const gold = toon({ color: '#f2bc6b', emissive: new THREE.Color('#603d18') });
	const poleGeo = new THREE.CylinderGeometry(.09, .12, 1, 10);
	const plinthGeo = new THREE.CylinderGeometry(.98, .61, 1, 10);
	const pointGeo = new THREE.CylinderGeometry(.62, .095, 1, 10);
	const ringGeo = new THREE.TorusGeometry(1, .016, 8, 48);
	ringGeo.rotateX(-Math.PI / 2);
	const jewelGeo = new THREE.OctahedronGeometry(1);
	const arrowShape = new THREE.Shape();
	arrowShape.moveTo(0, -.9);
	arrowShape.lineTo(.47, -.35);
	arrowShape.lineTo(.15, -.35);
	arrowShape.lineTo(.15, .43);
	arrowShape.lineTo(-.15, .43);
	arrowShape.lineTo(-.15, -.35);
	arrowShape.lineTo(-.47, -.35);
	arrowShape.closePath();
	const arrowGeo = new THREE.ShapeGeometry(arrowShape);
	arrowGeo.rotateX(-Math.PI / 2);

	const create = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number], scale: [number, number, number] = [1, 1, 1]) => {
		const m = new THREE.Mesh(geometry, material);
		m.position.set(...at);
		m.scale.set(...scale);
		parent.add(m);
		return m;
	};
	const beacons: THREE.MeshBasicMaterial[] = [];
	STEPS.forEach((s, i) => {
		const r = s.diameter / 2;
		const landing = r > 2;
		const depth = landing ? 2.45 : 1.13;
		create(scene, plinthGeo, stone, [s.x, s.y - SLAB_HEIGHT - depth / 2, s.z], [r, depth, r]);
		create(scene, pointGeo, shade, [s.x, s.y - SLAB_HEIGHT - depth * 1.40, s.z], [r, depth * .80, r]);
		create(scene, ringGeo, i === FINISH ? inlay : rim, [s.x, s.y + .016, s.z], [r * .91, 1, r * .91]);
		if (i < FINISH) {
			const a = bearing(i);
			const len = landing ? 1 : .69;
			const offset = landing ? r * .48 : r * .30;
			create(scene, arrowGeo, inlay, [s.x + Math.sin(a) * offset, s.y + .024, s.z + Math.cos(a) * offset], [len, 1, len]).rotation.y = a;
		}
		if (s.checkpoint) {
			const beam = new THREE.MeshBasicMaterial({ color: '#ffb77e' });
			beacons[s.checkpoint - 1] = beam;
			const a = Math.atan2(s.x, s.z - 2);
			const x = s.x + Math.sin(a) * (r - .43), z = s.z + Math.cos(a) * (r - .43);
			create(scene, poleGeo, metal, [x, s.y + .87, z], [1.7, 1.75, 1.7]);
			create(scene, jewelGeo, beam, [x, s.y + 1.96, z], [.30, .51, .30]);
			create(scene, ringGeo, gold, [x, s.y + 1.96, z], [.47, 1, .47]).rotation.x = .36;
			create(scene, ringGeo, gold, [x, s.y + 2.02, z], [.39, 1, .39]).rotation.x = -.35;
		}
	});

	// One hanging belfry ties together the spiral. It is scenery, not a second route.
	const summit = STEPS[FINISH];
	const pole = new THREE.BoxGeometry(1, 1, 1);
	const ax = summit.x, ay = summit.y, az = summit.z + 1.46;
	for (const dir of [-1, 1]) {
		create(scene, pole, stone, [ax + dir * 1.09, ay + 1.32, az], [.26, 2.64, .29]);
		create(scene, pole, gold, [ax + dir * 1.09, ay + .13, az], [.44, .26, .43]);
		create(scene, pole, gold, [ax + dir * 1.09, ay + 2.52, az], [.39, .15, .39]);
	}
	create(scene, pole, metal, [ax, ay + 2.66, az], [2.49, .24, .44]);
	const roof = new THREE.ConeGeometry(1.37, .82, 4);
	create(scene, roof, shade, [ax, ay + 2.95, az], [1, 1, .79]).rotation.y = Math.PI / 4;
	create(scene, jewelGeo, inlay, [ax, ay + 3.48, az], [.13, .27, .13]);
	const bell = new THREE.Group();
	bell.position.set(ax, ay + 2.49, az);
	scene.add(bell);
	const castBell = new THREE.LatheGeometry([
		new THREE.Vector2(.08, 0), new THREE.Vector2(.19, -.06), new THREE.Vector2(.28, -.20),
		new THREE.Vector2(.32, -.55), new THREE.Vector2(.46, -.67), new THREE.Vector2(.47, -.73),
		new THREE.Vector2(.36, -.74), new THREE.Vector2(.34, -.66), new THREE.Vector2(.23, -.54),
		new THREE.Vector2(.2, -.22),
	], 28);
	create(bell, castBell, gold, [0, 0, 0]);
	create(bell, jewelGeo, metal, [0, -.73, 0], [.10, .16, .10]);
	create(bell, ringGeo, inlay, [0, -.70, 0], [.46, 1, .46]);
	const chime = create(scene, ringGeo, inlay, [ax, ay + 1.68, az]);
	chime.visible = false;

	const towerX = ax, towerZ = summit.z;
	create(scene, plinthGeo, shade, [towerX, 3.10, towerZ], [1.84, 10.24, 1.84]);
	create(scene, pointGeo, shade, [towerX, -3.8, towerZ], [1.82, 3.6, 1.82]);
	for (let i = 0; i < 3; i++) {
		const y = 1.05 + i * 2.18;
		const orbit = create(scene, ringGeo, i === 2 ? inlay : rim, [towerX, y, towerZ], [2.54, .9, 2.54]);
		orbit.rotation.x = .13 - i * .16; orbit.rotation.z = -.17 + i * .19;
		for (let j = 0; j < 4; j++) {
			const a = (j + .5) * Math.PI / 2;
			create(scene, jewelGeo, i === 2 ? inlay : rim,
				[towerX + Math.sin(a) * 1.53, y, towerZ + Math.cos(a) * 1.53],
				[.115, .56, .115]).rotation.y = a;
		}
	}

	const sky = document.createElement('canvas');
	sky.width = 2; sky.height = 256;
	const ctx = sky.getContext('2d');
	if (ctx) {
		const gradient = ctx.createLinearGradient(0, 0, 0, sky.height);
		gradient.addColorStop(0, '#171935');
		gradient.addColorStop(.31, '#272d54');
		gradient.addColorStop(.68, '#5d609a');
		gradient.addColorStop(1, '#c4abce');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, sky.width, sky.height);
		const backdrop = new THREE.CanvasTexture(sky);
		backdrop.colorSpace = THREE.SRGBColorSpace;
		scene.background = backdrop;
	}
	game.sky.clock.on(() => {
		const { fog, sun, hemi } = game.sky;
		fog.color.set('#5b6092');
		fog.near = 28; fog.far = 104;
		sun.color.set('#f4e1ff'); sun.intensity = 1.57;
		hemi.groundColor.set('#8584bd'); hemi.intensity = 1.33;
	});
	const moon = create(scene, new THREE.SphereGeometry(4.4, 28, 20), new THREE.MeshBasicMaterial({ color: '#ffebc6', fog: false }), [-27, 23, 65]);
	moon.rotation.y = .4;
	const stars: number[] = [];
	for (let i = 0; i < 225; i++) {
		const a = i * 2.3999632297, h = 12 + ((i * 113) % 495) / 10;
		const r = 53 + ((i * 67) % 49);
		stars.push(Math.cos(a) * r, h, Math.sin(a) * r);
	}
	const pointsGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
	scene.add(new THREE.Points(pointsGeo, new THREE.PointsMaterial({ color: '#e8d9ff', size: .185, sizeAttenuation: true, fog: false, transparent: true, opacity: .75 })));
	cloudSea(game, { z: 1, spread: 65, below: -11, stretch: .87, count: 16 });

	let ringTime: number | null = null;
	game.onUpdate((_dt, time) => {
		const t = ringTime === null ? 9 : time - ringTime;
		bell.rotation.z = Math.sin(t * 16) * .39 * Math.exp(-t * 1.54);
		chime.scale.setScalar(1 + Math.max(0, t) * 2.2);
		chime.visible = t < .74;
	});
	return {
		checkpoint(n: number) { beacons[n - 1]?.color.set('#a7ffe0'); },
		ring() { ringTime = game.time; },
		reset() {
			ringTime = null;
			beacons.forEach((m) => m.color.set('#ffb77e'));
		},
	};
}
