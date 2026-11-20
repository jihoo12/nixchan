// Original, open-window vintage railcar. All pose changes are local to this visual group.
import * as THREE from 'three';
import { RAIL } from './rail-shuttle';

export function buildRailcar(scene: THREE.Scene): { setPose(x: number, door: number): void } {
	const car = new THREE.Group();
	car.name = 'Lantern Town • Last train • passenger cabin';
	car.position.z = RAIL.z;
	car.scale.set(RAIL.carScale.x, RAIL.carScale.y, RAIL.carScale.z);
	scene.add(car);
	const material = (color: string, metalness = 0) =>
		new THREE.MeshStandardMaterial({ color, metalness, roughness: metalness ? .58 : .85 });
	const enamel = material('#365861'), dark = material('#253d46'), ivory = material('#d3bc93');
	const edge = material('#87927d'), brass = material('#b59861', .22), iron = material('#29303c', .18);
	const wood = material('#795243'), floor = material('#826356'), velour = material('#7f5263');
	const ceiling = material('#75655a'), plaque = material('#594e48');
	const lamp = new THREE.MeshStandardMaterial({ color: '#ffe7ae', emissive: '#ffb85c', emissiveIntensity: 1.2, roughness: .65 });
	const geom = new THREE.BoxGeometry(1, 1, 1);
	const circle = new THREE.CylinderGeometry(.5, .5, 1, 16);
	const pose = new THREE.Object3D();
	const batches = new Map<THREE.BufferGeometry, Map<THREE.Material, THREE.Matrix4[]>>();
	const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number,
		w: number, h: number, d: number, pitch = 0, yaw = 0, roll = 0) => {
		let mats = batches.get(g);
		if (!mats) batches.set(g, mats = new Map());
		let entries = mats.get(m);
		if (!entries) mats.set(m, entries = []);
		pose.position.set(x, y, z); pose.rotation.set(pitch, yaw, roll); pose.scale.set(w, h, d);
		pose.updateMatrix(); entries.push(pose.matrix.clone());
	};
	const box = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, pitch = 0) =>
		add(geom, m, x, y, z, w, h, d, pitch);

	// The deck top is exactly local y=.45 and the rider's center aisle/boarding bay is clear.
	box(iron, 0, .303, 0, 11.8, .15, 2.37);
	box(floor, 0, .414, 0, 11.8, .072, 2.4);
	for (const z of [-.98, -.49, 0, .49, .98]) box(wood, 0, .4505, z, 11.78, .004, .017);
	box(brass, 0, .424, -1.247, 1.8, .047, .14);
	for (const x of [-4.6, -3.67, 3.67, 4.6]) {
		for (const rail of [-.60, .62]) {
			// Keep the larger cabin above the existing track gauge.
			const z = rail / RAIL.carScale.z;
			add(circle, iron, x, .268, z, .51, .132, .51, Math.PI / 2);
			add(circle, edge, x, .268, z + Math.sign(z) * .072, .31, .028, .31, Math.PI / 2);
			add(circle, brass, x, .268, z + Math.sign(z) * .092, .105, .025, .105, Math.PI / 2);
		}
		box(iron, x, .267, 0, .115, .115, 1.22 / RAIL.carScale.z);
	}
	for (const x of [-4.14, 4.14]) box(iron, x, .32, 0, 1.47, .19, 1.18 / RAIL.carScale.z);
	const bay = (center: number, width: number, z: number) => {
		box(enamel, center, .836, z, width, .77, .12);
		box(brass, center, 1.23, z, width, .042, .145);
		box(ivory, center, 2.559, z, width, .35, .13);
		box(edge, center, 1.295, z, width, .082, .18);
		box(wood, center, 2.353, z, width, .077, .15);
		for (const x of [center - width / 2 + .05, center + width / 2 - .05]) {
			box(ivory, x, 1.819, z, .107, 1.056, .13);
			box(wood, x, 1.82, z, .047, .982, .165);
		}
		box(brass, center, 1.83, z, .035, 1, .105);
	};
	for (const z of [-1.18, 1.18]) {
		for (const side of [-1, 1]) for (let i = 0; i < 3; i++)
			bay(side * (1.755 + i * 1.66), 1.66, z);
		if (z > 0) bay(0, 1.85, z);
		else {
			box(ivory, 0, 2.595, z, 1.85, .27, .13);
			for (const x of [-.915, .915]) box(wood, x, 1.448, z, .105, 1.995, .19);
			box(brass, 0, 2.454, z - .057, 1.776, .061, .12);
		}
	}

	// Segmented barrel roof, with rounded transverse profile and slim cap fascia.
	const width = 2.55, strips = 18, step = width / strips;
	for (let i = 0; i < strips; i++) {
		const z = -width / 2 + step * (i + .5);
		const y = 2.75 + .29 * (1 - (z / (width / 2)) ** 2);
		box(dark, 0, y, z, 11.94, .115, step + .018, Math.atan(.58 * z / (width / 2) ** 2));
	}
	for (const z of [-1.222, 1.222]) box(edge, 0, 2.738, z, 11.91, .075, .13);
	for (const x of [-5.86, 5.86]) {
		box(enamel, x, .86, 0, .13, .82, 2.38);
		box(brass, x, 1.283, 0, .16, .048, 2.42);
		box(ivory, x, 2.574, 0, .13, .32, 2.38);
		for (const z of [-1.031, 0, 1.031]) box(ivory, x, 1.879, z, .136, 1.161, z ? .318 : .11);
		for (const z of [-.82, .82]) {
			add(circle, iron, x + Math.sign(x) * .092, .826, z, .258, .089, .258, 0, 0, Math.PI / 2);
			add(circle, lamp, x + Math.sign(x) * .14, .826, z, .166, .027, .166, 0, 0, Math.PI / 2);
		}
		box(iron, x + Math.sign(x) * .12, .36, 0, .24, .15, .29);
	}

	// Bench cushions along the side walls, leaving the entire center of the car free.
	for (const z of [-.897, .897]) for (const x of [-4.1, -2.51, 2.51, 4.1]) {
		box(wood, x, .62, z, 1.47, .33, .54);
		box(velour, x, .805, z, 1.49, .12, .57);
		box(velour, x, 1.008, z + Math.sign(z) * .196, 1.49, .398, .124, -.09 * Math.sign(z));
		for (const dx of [-.74, .74]) box(brass, x + dx, .89, z, .043, .075, .46);
	}
	for (const z of [-.83, .83]) {
		box(brass, 0, 2.463, z, 10.97, .047, .05);
		for (const x of [-4.9, -2.93, 2.93, 4.9]) box(brass, x, 2.6, z, .050, .27, .05);
	}
	for (const x of [-4.3, -2.15, 0, 2.15, 4.3]) {
		box(ceiling, x, 2.756, 0, .49, .082, .42);
		box(lamp, x, 2.697, 0, .39, .045, .33);
	}
	for (const x of [-3.0, 3.0]) for (const z of [-1.25, 1.25]) {
		box(plaque, x, .957, z, .58, .241, .026);
		for (const d of [-.17, 0, .17]) box(brass, x + d, .957, z * 1.012, .076, .042, .021);
	}
	// Tiny ceiling fittings and woven seat piping, above the sightlines or beside the aisle.
	for (const x of [-4.6, -3.54, -2.45, 2.45, 3.54, 4.6]) for (const z of [-.83, .83]) {
		for (const dx of [-.068, .068]) box(brass, x + dx, 2.322, z, .021, .25, .028);
		box(wood, x, 2.207, z, .165, .042, .041);
	}
	for (const x of [-4.1, -2.51, 2.51, 4.1]) for (const z of [-.897, .897]) {
		box(ivory, x, .828, z - Math.sign(z) * .283, 1.36, .013, .008);
		box(wood, x, 1.099, z + Math.sign(z) * .126, 1.33, .018, .011);
	}
	// The outward ends get mirrored driver desks, headcode panels and side cab badges.
	// Their exact same open window holes keep the vintage look instead of using painted glass.
	for (const side of [-1, 1]) {
		box(wood, side * 5.49, 1.122, 0, .5, .31, 1.62);
		box(brass, side * 5.43, 1.291, -.28, .18, .05, .31);
		box(lamp, side * 5.43, 1.323, -.28, .11, .016, .22);
		box(velour, side * 4.93, .883, 0, .48, .12, .52);
		box(dark, side * 4.93, .669, 0, .19, .325, .19);
		const exterior = side * 5.939;
		box(iron, exterior, 2.562, 0, .052, .199, .75);
		for (const z of [-.215, 0, .215]) box(lamp, exterior + side * .029, 2.562, z, .018, .090, .091);
		for (const z of [-1.248, 1.248]) {
			box(plaque, side * 4.84, 1.015, z, .46, .22, .027);
			box(brass, side * 4.84, 1.015, z * 1.013, .081, .13, .022);
		}
	}

	// The center south door is the only moving geometry.
	const doorParts = (side: number, part: (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => void) => {
		part(enamel, 0, .875, 0, .888, .839, .065);
		part(brass, 0, 1.319, 0, .888, .05, .071);
		part(ivory, 0, 2.322, 0, .888, .195, .065);
		for (const x of [-.394, .394]) part(ivory, x, 1.79, 0, .1, .903, .065);
		part(brass, -side * .327, 1.165, -.059, .056, .206, .058);
	};
	for (const [g, materials] of batches) for (const [m, transforms] of materials) {
		const instances = new THREE.InstancedMesh(g, m, transforms.length);
		transforms.forEach((transform, i) => instances.setMatrixAt(i, transform));
		instances.instanceMatrix.needsUpdate = true;
		instances.receiveShadow = true; car.add(instances);
	}
	const leaves = [-1, 1].map(side => {
		const leaf = new THREE.Group();
		leaf.name = side < 0 ? 'Sliding door • left' : 'Sliding door • right';
		leaf.position.z = -1.318;
		car.add(leaf);
		doorParts(side, (m,x,y,z,w,h,d) => {
			const mesh = new THREE.Mesh(geom, m); mesh.scale.set(w, h, d); mesh.position.set(x, y, z); leaf.add(mesh);
		});
		return leaf;
	});
	const setPose = (x: number, door: number) => {
		car.position.x = x;
		const opened = THREE.MathUtils.clamp(door, 0, 1);
		leaves[0].position.x = -.45 - opened * .91;
		leaves[1].position.x = .45 + opened * .91;
	};
	setPose(0, 0);
	return { setPose };
}
