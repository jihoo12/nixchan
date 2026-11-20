// Original code-built schoolyard art. No downloaded models, textures, or shader patches.
import * as THREE from 'three';

export interface CourtBlock { x: number; z: number; w: number; d: number; bottom: number; top: number }

/** School front is z=0; its clear approach runs down the middle toward the gate at z=20. */
export function buildCourt(scene: THREE.Scene): { blocks: CourtBlock[]; update: (t: number) => void } {
	const court = new THREE.Group();
	court.name = 'Spring school courtyard';
	scene.add(court);
	const blocks: CourtBlock[] = [];
	const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.94 });
	const mats = {
		stone: material('#e8deca'), pale: material('#f5eddc'), darkStone: material('#cfc8b4'),
		dirt: material('#d9b68a'), grass: material('#9cba81'), leaf: material('#78966c'),
		wood: material('#b17b55'), metal: material('#647c76'), trunk: material('#79604e'),
		chalk: material('#f6eedb'), ochre: material('#d8bb85'), cap: material('#ebe0c6'),
	};
	type Box = { x: number; y: number; z: number; w: number; h: number; d: number };
	const batches = new Map<THREE.Material, Box[]>();
	const box = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
		const batch = batches.get(m) ?? []; batch.push({ x, y, z, w, h, d }); batches.set(m, batch);
	};
	const solid = (x: number, z: number, w: number, d: number, bottom: number, top: number) => blocks.push({ x, z, w, d, bottom, top });
	// Quiet warm ground behind all the details. Physical terrain is supplied by game.ts.
	box(mats.dirt, 0, -.12, 5, 30, .24, 34);
	// Checkered limestone forecourt and walkway: colour variation, not slippery floor-height noise.
	for (let ix = -12; ix < 12; ix++) for (let iz = 0; iz < 4; iz++)
		box((ix + iz) % 2 ? mats.stone : mats.pale, ix + .5, -.018, iz + .5, .975, .04, .975);
	for (let ix = -2; ix < 2; ix++) for (let iz = 4; iz < 21; iz++)
		box((ix + iz) % 2 ? mats.stone : mats.pale, ix + .5, -.018, iz + .5, .975, .04, .975);
	for (const side of [-1, 1]) {
		box(mats.darkStone, side * 2.08, .015, 12.5, .12, .07, 17);
		box(mats.grass, side * 14.15, .015, 10.5, 1.7, .06, 21);
		box(mats.darkStone, side * 13.25, .05, 10.5, .14, .12, 21);
	}
	// A familiar dusty Korean school playing field with restrained white running/game lines.
	box(mats.dirt, -7.65, .006, 12, 9.6, .018, 12.8);
	for (const x of [-12, -10.4, -8.8, -7.2, -5.6, -4]) box(mats.chalk, x, .021, 12, .055, .012, 11.6);
	for (const z of [6.2, 17.8]) box(mats.chalk, -8, .023, z, 8.1, .014, .065);
	// Small hopscotch tiles by the near edge, away from the main walking axis.
	for (let i = 0; i < 6; i++) {
		const z = 18.6 + (i % 3) * .65, x = -6 + Math.floor(i / 3) * .65;
		box(mats.chalk, x, .025, z - .3, .6, .012, .035);
		box(mats.chalk, x, .025, z + .3, .6, .012, .035);
		box(mats.chalk, x - .3, .025, z, .035, .012, .6);
		box(mats.chalk, x + .3, .025, z, .035, .012, .6);
	}
	// Low plaster gate piers, intentionally no overhead beam or centre obstruction behind camera.
	for (const side of [-1, 1]) {
		const x = side * 4.2;
		box(mats.ochre, x, .95, 20.2, .85, 1.9, .85);
		box(mats.cap, x, 1.96, 20.2, 1, .16, 1);
		box(mats.darkStone, x, .14, 20.2, 1, .28, 1);
		solid(x, 20.2, 1, 1, 0, 2.04);
		box(mats.ochre, side * 9.8, .38, 20.2, 10.3, .76, .32);
		box(mats.cap, side * 9.8, .79, 20.2, 10.4, .1, .4);
		solid(side * 9.8, 20.2, 10.4, .4, 0, 1.42);
		for (let i = 0; i < 15; i++) box(mats.metal, side * (4.8 + i * .67), 1.12, 20.2, .035, .62, .035);
		box(mats.metal, side * 9.6, 1.39, 20.2, 10.1, .045, .045);
	}
	const bench = (x: number, z: number) => {
		for (let i = 0; i < 4; i++) {
			box(mats.wood, x, .49, z - .27 + i * .18, 2.25, .095, .145);
			box(mats.wood, x, .77 + i * .115, z - .37, 2.25, .085, .08);
		}
		for (const side of [-1, 1]) {
			box(mats.metal, x + side * .85, .25, z, .09, .5, .6);
			box(mats.metal, x + side * .85, .76, z - .38, .06, .73, .06);
		}
		solid(x, z, 2.3, .85, 0, 1.16);
	};
	bench(7, 5.1); bench(10.5, 11.6); bench(-10, 4.7);
	// Procedural cherries: visible branching structure and layered, blossom-like scalloped crowns.
	let seed = 1948;
	const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
	const blossomMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
	const crowns: { p: THREE.Vector3; s: THREE.Vector3; c: THREE.Color }[] = [];
	const branchGeometry = new THREE.CylinderGeometry(.72, 1, 1, 8);
	const up = new THREE.Vector3(0, 1, 0);
	const branch = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
		const mesh = new THREE.Mesh(branchGeometry, mats.trunk);
		mesh.position.copy(a).add(b).multiplyScalar(.5);
		mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
		mesh.scale.set(radius, a.distanceTo(b), radius * .85);
		mesh.castShadow = true; court.add(mesh);
	};
	const trees = [{ x: 7, z: 8, scale: 1 }, { x: 11.1, z: 15.4, scale: .88 }, { x: -11.5, z: 3.8, scale: .86 }];
	for (const tree of trees) {
		const { x, z, scale: s } = tree;
		box(mats.darkStone, x, .12, z, 2.15, .24, 2.15);
		box(mats.pale, x, .24, z, 2.02, .12, 2.02);
		box(mats.dirt, x, .31, z, 1.8, .035, 1.8);
		solid(x, z, 2.15, 2.15, 0, .3);
		solid(x, z, .65, .65, .3, 2.8 * s);
		const origin = new THREE.Vector3(x, .3, z);
		const fork = new THREE.Vector3(x + .13 * s, 2.1 * s, z);
		branch(origin, fork, .23 * s);
		for (let j = 0; j < 7; j++) {
			const angle = j * 2.399, reach = (1.05 + random() * .6) * s;
			const tip = new THREE.Vector3(x + Math.cos(angle) * reach, (3.15 + random() * .65) * s, z + Math.sin(angle) * reach);
			branch(fork, tip, .08 * s);
			for (let k = 0; k < 5; k++) {
				const a = k * 2.399 + j;
				crowns.push({ p: tip.clone().add(new THREE.Vector3(Math.cos(a) * .42 * s, .12 + random() * .4 * s, Math.sin(a) * .42 * s)),
					s: new THREE.Vector3((.59 + random() * .32) * s, (.39 + random() * .25) * s, (.57 + random() * .32) * s),
					c: new THREE.Color(['#f2b5c4', '#f7c7d2', '#ffe0e2', '#eaa6bc'][Math.floor(random() * 4)]) });
			}
		}
	}
	const dummy = new THREE.Object3D();
	const blossoms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), blossomMaterial, crowns.length);
	crowns.forEach(({ p, s, c }, i) => { dummy.position.copy(p); dummy.scale.copy(s); dummy.rotation.set(0, i * .47, .12); dummy.updateMatrix(); blossoms.setMatrixAt(i, dummy.matrix); blossoms.setColorAt(i, c); });
	blossoms.castShadow = true; blossoms.receiveShadow = true; court.add(blossoms);
	// A light scatter of individually shaped five-petal blooms breaks up the smooth clumps at
	// close range. All petals share one instanced draw; the broader crown still reads from far away.
	const flowerShape = new THREE.BufferGeometry();
	const flowerPositions = [0, 0, 0], flowerColors = [.69, .36, .49], flowerIndices: number[] = [];
	for (let k = 0; k < 5; k++) {
		const a = k * Math.PI * .4;
		const base = flowerPositions.length / 3;
		for (const [u, v, z] of [[.33,-.22,.01],[.73,-.34,.045],[.98,-.13,.07],[.88,0,.064],[.98,.13,.07],[.74,.33,.045],[.33,.22,.01]]) {
			flowerPositions.push(Math.cos(a)*u - Math.sin(a)*v, Math.sin(a)*u + Math.cos(a)*v, z);
			flowerColors.push(1, .82 + u*.16, .87 + u*.1);
		}
		for (let j=0; j<6; j++) flowerIndices.push(0,base+j,base+j+1);
	}
	flowerShape.setAttribute('position', new THREE.Float32BufferAttribute(flowerPositions,3));
	flowerShape.setAttribute('color', new THREE.Float32BufferAttribute(flowerColors,3));
	flowerShape.setIndex(flowerIndices);flowerShape.computeVertexNormals();
	const flowers = new THREE.InstancedMesh(flowerShape, new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true, side:THREE.DoubleSide, roughness:.9}), crowns.length * 13);
	const palettes = ['#e6a0b1','#ffe5e7','#f3b6c4','#ffece8','#f9cad5'].map(c=>new THREE.Color(c));
	const front = new THREE.Vector3(0,0,1);
	crowns.forEach(({p,s},i)=>{
		for(let k=0;k<13;k++){
			const a=k*2.399+random()*.6, y=2*random()-1, r=Math.sqrt(1-y*y);
			const x=Math.cos(a)*r,z=Math.sin(a)*r;
			dummy.position.set(p.x+x*s.x*.99,p.y+y*s.y*.99,p.z+z*s.z*.99);
			dummy.quaternion.setFromUnitVectors(front,new THREE.Vector3(x,y,z).normalize());
			dummy.rotateZ(random()*Math.PI*2);
			dummy.scale.setScalar(.044+random()*.054);
			dummy.updateMatrix();
			flowers.setMatrixAt(i*13+k,dummy.matrix);flowers.setColorAt(i*13+k,palettes[(i+k)%palettes.length]);
		}
	});
	court.add(flowers);

	// Hedges are deliberately small, low, and peripheral, so the facade and sakura stay readable.
	for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
		box(mats.leaf, side * 14.15, .43, 1.5 + i * 2.3, 1.2, .82, 1.7);
	}
	for (const side of [-1, 1]) solid(side * 14.15, 9.55, 1.2, 17.8, 0, .84);
	// Draw every static cuboid of one material in a single instanced batch.
	for (const [mat, items] of batches) {
		const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, items.length);
		items.forEach((b, i) => { dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
		mesh.receiveShadow = true; mesh.castShadow = true; court.add(mesh);
	}
	// Sparse small petals, not a noisy particle blizzard; deterministic wind, independent of FPS.
	const petals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 5), new THREE.MeshStandardMaterial({ color: '#ffd8df', roughness: 1, side: THREE.DoubleSide }), 36);
	const petalData = Array.from({ length: 36 }, () => ({ phase: random(), x: 4.8 + random() * 5.1, z: 5.8 + random() * 5.2, spin: random() * Math.PI * 2 }));
	petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage); petals.frustumCulled = false; court.add(petals);
	const update = (t: number) => {
		if (!Number.isFinite(t)) return;
		petalData.forEach((p, i) => {
			const fall = ((t * .11 + p.phase) % 1 + 1) % 1;
			dummy.position.set(p.x - fall * 2.1 + Math.sin(t * .9 + p.spin) * .18, .12 + (1 - fall) * 3.7, p.z + Math.sin(t * .45 + p.spin) * .35);
			dummy.rotation.set(.8 + Math.sin(t + p.spin) * .7, p.spin + t * .5, t * .7 + p.spin);
			dummy.scale.set(.047, .027, 1); dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix);
		});
		petals.instanceMatrix.needsUpdate = true;
	};
	update(0);
	return { blocks, update };
}
