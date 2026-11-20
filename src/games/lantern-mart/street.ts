// The block outside Lantern Mart. Most street geometry is packed into a handful of
// instance batches; only the painted signs and moving motes need their own meshes.
import * as THREE from 'three';

type RGB = `#${string}`;
type Block = { x: number; y: number; z: number; w: number; h: number; d: number; color: RGB; tilt: number };
type Shade = 'paint' | 'lamp' | 'paving';
const Y = 0;

export function buildStreet(scene: THREE.Scene) {
	const street = new THREE.Group();
	street.name = 'Lantern Quarter';
	scene.add(street);
	const batches: Record<Shade, Block[]> = { paint: [], lamp: [], paving: [] };
	const block = (
		x: number, y: number, z: number, w: number, h: number, d: number, color: RGB,
		shade: Shade = 'paint', tilt = 0,
	) => batches[shade].push({ x, y, z, w, h, d, color, tilt });

	let seed = 2468;
	const rand = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
	const choose = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
	const boxGeo = new THREE.BoxGeometry();

	function flush() {
		const brush = new THREE.Object3D();
		const color = new THREE.Color();
		for (const kind of Object.keys(batches) as Shade[]) {
			const list = batches[kind];
			const mat = kind === 'lamp'
				? new THREE.MeshBasicMaterial({ color: '#ffffff' })
				: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: kind === 'paving' ? 0.78 : 0.92 });
			const mesh = new THREE.InstancedMesh(boxGeo, mat, list.length);
			mesh.name = `Street ${kind}`;
			list.forEach((b, i) => {
				brush.position.set(b.x, b.y, b.z);
				brush.rotation.set(0, b.tilt, 0);
				brush.scale.set(b.w, b.h, b.d);
				brush.updateMatrix();
				mesh.setMatrixAt(i, brush.matrix);
				mesh.setColorAt(i, color.set(b.color));
			});
			mesh.computeBoundingSphere();
			street.add(mesh);
		}
	}

	function sign(
		label: string, subtitle: string, x: number, y: number, z: number,
		w: number, h: number, ground: RGB, ink: RGB, angle = 0,
	) {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = Math.round(512 * h / w);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.fillStyle = ground;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.strokeStyle = ink;
		ctx.lineWidth = 3;
		ctx.strokeRect(11, 11, canvas.width - 22, canvas.height - 22);
		ctx.fillStyle = ink;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `700 ${Math.round(canvas.height * 0.40)}px system-ui, sans-serif`;
		ctx.fillText(label, canvas.width / 2, canvas.height * (subtitle ? 0.39 : 0.51), canvas.width - 55);
		if (subtitle) {
			ctx.font = `600 ${Math.round(canvas.height * 0.15)}px system-ui, sans-serif`;
			ctx.fillText(subtitle, canvas.width / 2, canvas.height * 0.72, canvas.width - 55);
		}
		const map = new THREE.CanvasTexture(canvas);
		map.colorSpace = THREE.SRGBColorSpace;
		const mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(w, h),
			new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }),
		);
		mesh.position.set(x, y, z);
		mesh.rotation.y = angle;
		street.add(mesh);
	}

	// The tile grid is drawn as a repeating canvas rather than a mesh per paving stone.
	function paving() {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 256;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.fillStyle = '#292d43';
		ctx.fillRect(0, 0, 256, 256);
		for (let row = -1; row < 8; row++) {
			for (let col = -1; col < 8; col++) {
				const x = col * 64 + (row % 2 === 0 ? 0 : 32);
				const y = row * 32;
				ctx.fillStyle = choose(['#333851', '#30364d', '#363b53', '#383b52', '#31364a']);
				ctx.fillRect(x + 1, y + 1, 62, 30);
				ctx.fillStyle = '#41455f';
				ctx.fillRect(x + 2, y + 2, 60, 1);
			}
		}
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(10, 2.5);
		tex.anisotropy = 4;
		const plane = new THREE.Mesh(new THREE.PlaneGeometry(54, 9.5),
			new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
		plane.rotation.x = -Math.PI / 2;
		plane.position.set(0, Y - 0.008, 4.75);
		street.add(plane);
	}
	paving();

	block(0, Y - 0.085, 9.0, 102, 0.15, 75, '#282e42', 'paving');
	block(0, Y - 0.033, 9.74, 66, 0.055, 0.30, '#687088', 'paving');
	block(0, Y - 0.016, 9.90, 66, 0.011, 0.055, '#9a9daf', 'paving');
	block(0, Y - 0.010, 12.35, 64, 0.019, 0.085, '#a28b73', 'paving');
	for (let n = -4; n <= 4; n++) {
		const x = n * 0.72;
		block(x, Y - 0.006, 11.0, 0.43, 0.011, 1.95, '#727d91', 'paving');
	}
	// Drain slots and a yellow tactile strip stop short of the shop threshold.
	for (let n = -3; n <= 3; n++) {
		block(n * 0.34, Y - 0.005, 0.49, 0.29, 0.018, 0.18, '#a28a65', 'paving');
	}
	block(4.45, Y + 0.002, 1.15, 0.76, 0.023, 0.29, '#263146', 'paving');
	for (let n = -2; n <= 2; n++) {
		block(4.45 + n * 0.13, Y + 0.014, 1.15, 0.042, 0.005, 0.23, '#877d81', 'paving');
	}

	// Soft surface glints sell wet pavement without a reflection probe or extra render pass.
	const glowCanvas = document.createElement('canvas');
	glowCanvas.width = glowCanvas.height = 64;
	const glowCtx = glowCanvas.getContext('2d');
	if (glowCtx) {
		const gradient = glowCtx.createRadialGradient(32, 32, 2, 32, 32, 31);
		gradient.addColorStop(0, '#ffffff');
		gradient.addColorStop(0.28, '#ffffff9e');
		gradient.addColorStop(0.73, '#ffffff30');
		gradient.addColorStop(1, '#ffffff00');
		glowCtx.fillStyle = gradient;
		glowCtx.fillRect(0, 0, 64, 64);
	}
	const glowMap = new THREE.CanvasTexture(glowCanvas);
	const puddleGeo = new THREE.PlaneGeometry(1, 1);
	function smear(x: number, z: number, w: number, length: number, color: RGB, opacity: number) {
		const m = new THREE.Mesh(puddleGeo, new THREE.MeshBasicMaterial({
			map: glowMap, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		}));
		m.rotation.x = -Math.PI / 2;
		m.scale.set(w, length, 1);
		m.position.set(x, Y + 0.012, z);
		street.add(m);
	}
	smear(0, 1.85, 8.0, 5.8, '#ff994d', 0.30);
	smear(-1.2, 3.1, 3.9, 5.9, '#f97d67', 0.26);
	smear(2.65, 2.85, 2.9, 4.4, '#81e4d8', 0.22);
	smear(-7.75, 2.0, 4.5, 4.8, '#91bdff', 0.16);
	smear(8.1, 3.6, 3.3, 4.4, '#5deeca', 0.25);
	const tintOptions = ['#8e9ed7', '#bcb6d4', '#648ccb'] as const;
	const puddles = tintOptions.map(() => [] as { x: number; z: number; turn: number; width: number; depth: number }[]);
	for (let i = 0; i < 32; i++) {
		const x = -13 + rand() * 26;
		const z = 0.7 + rand() * 12;
		const group = puddles[Math.floor(rand() * tintOptions.length)];
		group.push({ x, z, turn: (rand() - 0.5) * 0.3, width: 0.7 + rand() * 2.1, depth: 0.11 + rand() * 0.48 });
	}
	const streak = new THREE.Object3D();
	puddles.forEach((group, index) => {
		const mat = new THREE.MeshBasicMaterial({
			map: glowMap, color: tintOptions[index], opacity: 0.13, transparent: true,
			depthWrite: false, blending: THREE.AdditiveBlending,
		});
		const mesh = new THREE.InstancedMesh(puddleGeo, mat, group.length);
		group.forEach((p, i) => {
			streak.rotation.set(-Math.PI / 2, 0, p.turn);
			streak.scale.set(p.width, p.depth, 1);
			streak.position.set(p.x, Y + 0.014, p.z);
			streak.updateMatrix();
			mesh.setMatrixAt(i, streak.matrix);
		});
		mesh.computeBoundingSphere();
		street.add(mesh);
	});

	function frontage(x: number, zFront: number, w: number, floors: number, wall: RGB, trim: RGB, awning: RGB) {
		// Leave the shopfronts at eye level, with more breathing room above each story.
		const floor = 2.8;
		const h = 2.9 + floor * (floors - 1);
		const d = 6.0;
		block(x, h / 2, zFront - d / 2, w, h, d, wall);
		block(x, h - 0.10, zFront - d / 2, w + 0.32, 0.25, d + 0.3, trim);
		block(x, 0.31, zFront + 0.02, w + 0.04, 0.6, 0.14, trim);
		const panes = Math.max(2, Math.floor(w / 1.66));
		for (let i = 0; i < floors; i++) {
			const y = 1.50 + i * floor;
			block(x, y + 0.94, zFront + 0.035, w + 0.10, 0.11, 0.18, trim);
			for (let j = 0; j < panes; j++) {
				const wx = x + (j - (panes - 1) / 2) * (w / panes);
				const warm = rand() > 0.39;
				block(wx, y, zFront + 0.055, 0.99, 1.41, 0.21, trim);
				block(wx, y + 0.02, zFront + 0.17, 0.75, 1.09, 0.025,
					warm ? choose(['#e6a46b', '#c07960', '#798cac', '#f2c38a'] as const) : '#384b6b',
					warm ? 'lamp' : 'paint');
				block(wx, y, zFront + 0.20, 0.06, 1.12, 0.05, trim);
				block(wx, y - 0.14, zFront + 0.20, 0.76, 0.06, 0.05, trim);
				block(wx, y - 0.64, zFront + 0.18, 1.08, 0.10, 0.32, trim);
				if (i > 0 && (j + i) % 4 === 0) {
					block(wx, y - 0.55, zFront + 0.43, 0.94, 0.18, 0.48, '#444061');
					for (let leaf = -1; leaf < 2; leaf++) {
						block(wx + leaf * 0.24, y - 0.38, zFront + 0.41, 0.24, 0.32, 0.25, '#527377');
					}
				}
			}
		}
		block(x, 2.64, zFront + 0.62, w + 0.24, 0.20, 1.29, awning);
		block(x, 2.49, zFront + 1.21, w + 0.24, 0.19, 0.15, trim);
		block(x, 2.55, zFront + 1.30, w + 0.20, 0.038, 0.026, '#c39781', 'lamp');
		for (let tx = x - w / 2 + 0.18; tx < x + w / 2; tx += 0.49) {
			block(tx, 2.75, zFront + 0.62, 0.045, 0.035, 1.29, trim);
		}
		block(x - w * 0.24, h + 0.35, zFront - 1.0, 1.45, 0.66, 1.0, trim);
		block(x + w * 0.20, h + 0.56, zFront - 2.6, 0.47, 1.12, 0.51, trim);
	}
	frontage(-10.4, -2.65, 7.5, 3, '#44495e', '#262e47', '#4e6381');
	frontage(10.5, -3.55, 7.5, 4, '#5b5269', '#38304a', '#5f5069');
	frontage(-18.2, -1.85, 6.8, 3, '#4f4965', '#32304a', '#805968');
	frontage(18.6, -2.3, 7.3, 3, '#55516c', '#34374d', '#4d636b');
	// Mount the boards on the awning fascia, between the two rows of windows.
	// The art plane sits just beyond its backing, clear of even the awning's light strip.
	function fasciaSign(label: string, subtitle: string, x: number, zFront: number, w: number, ground: RGB, ink: RGB) {
		const y = 2.54, z = zFront + 1.355, h = 0.51;
		block(x, y, z - 0.035, w, h, 0.064, ground);
		sign(label, subtitle, x, y, z, w, h, ground, ink);
	}
	fasciaSign('LAST STOP', 'TEA  ·  BOOKS', -10.4, -2.65, 3.2, '#35385d', '#e6c8a2');
	fasciaSign('MOON LAUNDRY', 'OPEN UNTIL THE RAIN STOPS', 10.5, -3.55, 4.0, '#3c344f', '#e8badc');
	// The shops at either end of the block: a florist behind Gomsun's bungeoppang cart, and a little
	// arcade behind Yeoul's tent (stalls.ts).
	fasciaSign('HANA FLOWERS', 'BLOOMS AFTER DARK', -18.2, -1.85, 3.6, '#3d4a45', '#f2d7e0');
	fasciaSign('STAR ARCADE', 'CLAW  ·  COIN  ·  PRIZES', 18.6, -2.3, 3.6, '#2e2a52', '#a8e8ff');
	// Buckets of flowers on the florist's step, and the arcade's glowing machines by its door.
	for (let i = 0; i < 6; i++) {
		const x = -20.6 + i * 0.52;
		block(x, 0.18, -1.45, 0.34, 0.36, 0.34, '#5d6c7b');
		for (let k = 0; k < 3; k++) {
			block(x + (k - 1) * 0.09, 0.47 + (k % 2) * 0.07, -1.45 + (k % 2 ? 0.06 : -0.05), 0.11, 0.11, 0.11,
				choose(['#f29bb5', '#ffd27a', '#f5f0ff', '#e46f73', '#b9a3f0'] as const), 'lamp');
		}
		block(x, 0.38, -1.45, 0.3, 0.12, 0.3, '#4f7a5a');
	}
	block(16.6, 0.95, -2.05, 1.0, 1.9, 0.6, '#3b3570');
	block(16.6, 1.25, -1.74, 0.82, 0.8, 0.02, '#9ff0ff', 'lamp');
	block(16.6, 1.85, -1.74, 0.9, 0.12, 0.03, '#ff8ad8', 'lamp');
	block(20.4, 0.75, -1.95, 0.8, 1.5, 0.5, '#46306a');
	block(20.4, 1.05, -1.69, 0.6, 0.5, 0.02, '#ffd27a', 'lamp');

	// Far city gets colour and a few bigger silhouettes, not an endlessly repeated facade.
	for (let i = 0; i < 16; i++) {
		const x = i * 7.3 - 55 + (rand() - 0.5) * 4;
		const z = -22 - rand() * 17;
		const w = 4.8 + rand() * 5;
		const h = 7.5 + rand() * 18;
		block(x, h / 2, z, w, h, 6, choose(['#2b3454', '#2d3a5a', '#333655', '#3e385b'] as const));
		block(x, h - 0.06, z, w + 0.2, 0.15, 6.2, '#555476');
		if (i % 4 === 0) {
			block(x + 0.24, h + 1.75, z - 0.1, 0.065, 3.55, 0.065, '#8581a4');
			block(x + 0.24, h + 3.62, z - 0.1, 0.14, 0.20, 0.14, '#ec978d', 'lamp');
		}
		for (let y = 3.5; y < h - 1; y += 2.9) {
			for (let dx = -w / 2 + 1.1; dx < w / 2 - 0.6; dx += 1.32) {
				if (rand() < 0.63) continue;
				block(x + dx, y, z + 3.012, 0.42, 0.67, 0.025,
					choose(['#9e8d9c', '#8c9cb2', '#7d84ae', '#b4a79b'] as const), 'lamp');
			}
		}
	}

	// A line of closed storefronts at the side of the playable block disguises the boundary.
	for (const side of [-1, 1]) {
		for (let n = 0; n < 3; n++) {
			const x = side * (26.5 + n * 2.5);
			const z = 0.2 + n * 7.4;
			const h = 6 + n * 1.8;
			block(x, h / 2, z, 8, h, 7.05, '#343b58');
			for (let k = -2; k <= 2; k++) {
				block(x - side * 4.035, 3.0 + n * 0.30, z + k * 1.2, 0.10, 1.10, 0.56,
					k % 3 === 0 ? '#ae8b86' : '#596889', 'lamp');
			}
		}
	}

	// Last bus stop; the waiting area opens toward the player, with its own geometry/silhouette.
	const busX = -7.66;
	const busZ = 2.15;
	for (const offset of [-1.35, 1.35]) {
		block(busX + offset, 1.15, busZ - 0.47, 0.10, 2.3, 0.105, '#384553');
	}
	block(busX, 2.25, busZ, 3.05, 0.17, 1.35, '#657183');
	block(busX, 2.145, busZ + 0.33, 2.78, 0.028, 0.05, '#bbd3eb', 'lamp');
	block(busX, 0.50, busZ - 0.26, 2.24, 0.10, 0.40, '#ae7766');
	block(busX, 0.83, busZ - 0.38, 2.24, 0.25, 0.12, '#9c665e');
	for (const offset of [-0.81, 0.81]) {
		block(busX + offset, 0.24, busZ - 0.26, 0.16, 0.47, 0.26, '#37434f');
	}
	block(busX - 0.86, 1.53, busZ - 0.49, 0.73, 0.79, 0.10, '#c0a285');
	sign('NIGHT BUS', '07  →  LANTERN QUARTER', busX - 0.86, 1.53, busZ - 0.43, 0.68, 0.72, '#dbcbaf', '#38455c');
	block(busX + 1.8, 1.43, busZ + 0.05, 0.09, 2.86, 0.09, '#394451');
	block(busX + 1.8, 2.73, busZ + 0.078, 0.51, 0.38, 0.13, '#91a5bf');

	// Across the street, a little vending cabinet echoes the mart's palette.
	const vendX = 8.22;
	const vendZ = 3.1;
	block(vendX, 1.05, vendZ, 1.25, 2.1, 0.77, '#53767b');
	block(vendX, 1.16, vendZ + 0.391, 1.04, 1.33, 0.023, '#19394e');
	block(vendX, 1.80, vendZ + 0.40, 1.09, 0.08, 0.028, '#b2dfd2', 'lamp');
	for (let r = 0; r < 3; r++) {
		const height = 0.87 + r * 0.29;
		block(vendX, height - 0.12, vendZ + 0.412, 0.95, 0.031, 0.032, '#87b3b0');
		for (let c = -2; c <= 2; c++) {
			block(vendX + c * 0.176, height, vendZ + 0.422, 0.09, 0.17, 0.059,
				choose(['#db9b83', '#a4b9cb', '#f0c995', '#85c7b1'] as const), 'lamp');
		}
	}
	block(vendX + 0.23, 0.33, vendZ + 0.406, 0.53, 0.18, 0.028, '#243b47');
	sign('STARDROP', '', vendX, 1.96, vendZ + 0.406, 1.08, 0.24, '#416778', '#e0f4de');

	// Lamps have lit heads and pavement falloff, plus only two real lights.
	for (const [x, z, wash] of [[-7.4, 7.47, '#efbb85'], [7.48, 7.38, '#9ccef9']] as const) {
		const inner = x < 0 ? 1 : -1;
		block(x, 0.19, z, 0.38, 0.38, 0.38, '#494657');
		block(x, 2.13, z, 0.11, 3.92, 0.12, '#454655');
		block(x + inner * 0.34, 4.03, z, 0.74, 0.10, 0.12, '#4b5064');
		block(x + inner * 0.70, 3.97, z, 0.58, 0.17, 0.53, '#455063');
		block(x + inner * 0.70, 3.875, z, 0.42, 0.028, 0.39, wash, 'lamp');
		smear(x + inner * 0.73, z, 5.5, 3.7, wash, 0.21);
		const light = new THREE.PointLight(wash, 11, 9, 2);
		light.position.set(x + inner * 0.70, 3.70, z);
		street.add(light);
	}
	flush();

	// The full moon sits above the roof gap, with a small softly painted corona.
	// Unlike the animated flecks this is far enough away to read as part of the skyline.
	const moon = new THREE.Group();
	moon.position.set(-8, 21.5, -48);
	const disc = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40),
		new THREE.MeshBasicMaterial({ color: '#d3d9f5', fog: false }));
	moon.add(disc);
	const halo = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({
		map: glowMap, color: '#abc7ff', opacity: 0.38, transparent: true, depthWrite: false,
		blending: THREE.AdditiveBlending, fog: false,
	}));
	halo.position.z = -0.02;
	moon.add(halo);
	street.add(moon);

	// Sparse, slowly moving embers outside the shop. No particle sprite is needed.
	const count = 31;
	const drift = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0),
		new THREE.MeshBasicMaterial({ color: '#fff1cb', transparent: true, opacity: 0.68, depthWrite: false }), count);
	drift.frustumCulled = false;
	const motions = Array.from({ length: count }, () => ({
		x: -13.5 + rand() * 27, y: 0.8 + rand() * 7.8, z: 0.45 + rand() * 13,
		phase: rand() * Math.PI * 2, radius: 0.010 + rand() * 0.025,
	}));
	const point = new THREE.Object3D();
	street.add(drift);
	let time = 0;
	function tick(dt: number) {
		time += dt;
		for (let i = 0; i < count; i++) {
			const p = motions[i];
			point.position.set(
				p.x + Math.cos(p.phase + time * 0.32) * 0.45,
				p.y + Math.sin(p.phase + time * 0.58) * 0.36,
				p.z + Math.sin(p.phase + time * 0.24) * 0.48,
			);
			point.scale.setScalar(p.radius * (0.7 + 0.3 * Math.cos(p.phase + time * 1.3)));
			point.updateMatrix();
			drift.setMatrixAt(i, point.matrix);
		}
		drift.instanceMatrix.needsUpdate = true;
	}
	tick(0);
	return tick;
}
