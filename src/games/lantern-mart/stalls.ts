// The two stalls along the widened street: Gomsun's bungeoppang cart on the west pavement and Yeoul's
// pojangmacha tent on the east. Their models are made in Blender (tools/lantern-mart/build.py,
// models/stalls.glb); the words on their boards are painted here, and so is the steam.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import stallsUrl from './models/stalls.glb?url';
import type { Item } from './requests';

/** The loose things in stalls.glb: what she can hold, and the festival's sky lantern. */
export type Props = Record<Item | 'skyLantern', THREE.Object3D>;

type Bounds = readonly [number, number, number, number];

export const CART = { x: -15.6, z: 1.0 } as const;
export const TENT = { x: 16.6, z: 0.3 } as const;

/** What she can't walk through, as [left, right, back, front]. The stools are left out, like the
 * mart's: she can stand among them at the counter. */
export const stallSolids: readonly Bounds[] = [
	[CART.x - 1.05, CART.x + 1.05, CART.z - 0.6, CART.z + 0.5], // the cart, wheels and push bar
	[TENT.x - 1.75, TENT.x + 1.75, TENT.z - 1.32, TENT.z - 1.18], // the tent's back
	[TENT.x - 1.78, TENT.x - 1.66, TENT.z - 1.3, TENT.z + 0.15], // and its sides, as far as they come
	[TENT.x + 1.66, TENT.x + 1.78, TENT.z - 1.3, TENT.z + 0.15],
	[TENT.x - 1.4, TENT.x + 1.4, TENT.z - 0.08, TENT.z + 0.6], // the counter
	[TENT.x - 1.76, TENT.x - 1.64, TENT.z + 1.18, TENT.z + 1.32], // the front poles
	[TENT.x + 1.64, TENT.x + 1.76, TENT.z + 1.18, TENT.z + 1.32],
];

function board(w: number, h: number, draw: (g: CanvasRenderingContext2D, cw: number, ch: number) => void) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = Math.round(512 * h / w);
	const g = canvas.getContext('2d');
	if (g) draw(g, canvas.width, canvas.height);
	const map = new THREE.CanvasTexture(canvas);
	map.colorSpace = THREE.SRGBColorSpace;
	return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
}

const text = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 800, max?: number) => {
	g.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
	g.fillStyle = color;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText(s, x, y, max);
};

/** Puffs of steam rising from a few points and thinning out as they go. */
function steam(scene: THREE.Scene, sources: { at: THREE.Vector3; spread: number }[]) {
	const per = 7;
	const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
		new THREE.MeshBasicMaterial({ color: '#fff3dc', transparent: true, opacity: 0.2, depthWrite: false }), sources.length * per);
	mesh.frustumCulled = false;
	scene.add(mesh);
	const puff = new THREE.Object3D();
	return (time: number) => {
		sources.forEach((s, i) => {
			for (let k = 0; k < per; k++) {
				const u = (time * 0.33 + k / per + i * 0.37) % 1;
				const wobble = Math.sin((k + 1) * 12.9898 + i) * s.spread;
				puff.position.set(s.at.x + wobble + Math.sin(u * 5 + k) * 0.04, s.at.y + u * 0.75, s.at.z + Math.cos(k * 7.1) * s.spread * 0.6);
				puff.scale.setScalar(0.035 + u * 0.09 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
				puff.updateMatrix();
				mesh.setMatrixAt(i * per + k, puff.matrix);
			}
		});
		mesh.instanceMatrix.needsUpdate = true;
	};
}

export function buildStalls(scene: THREE.Scene, ko: boolean, onProps: (props: Props) => void) {
	const group = new THREE.Group();
	group.name = 'Stalls';
	scene.add(group);

	// Warm light pooling under each: a paper lantern on the cart, a bare bulb in the tent.
	const lantern = new THREE.PointLight('#ff9a63', 9, 6.5, 1.8);
	lantern.position.set(CART.x + 0.7, 1.8, CART.z + 0.7);
	const bulb = new THREE.PointLight('#ffcf8a', 14, 7.5, 1.8);
	bulb.position.set(TENT.x, 2.0, TENT.z + 0.4);
	group.add(lantern, bulb);

	// The signs, painted in each one's colours.
	const cartSign = board(1.0, 0.27, (g, w, h) => {
		g.fillStyle = '#f8e7c4';
		g.fillRect(0, 0, w, h);
		g.strokeStyle = '#c9493f';
		g.lineWidth = 6;
		g.strokeRect(8, 8, w - 16, h - 16);
		text(g, ko ? '붕어빵' : 'BUNGEOPPANG', w * 0.38, h * 0.52, h * (ko ? 0.56 : 0.36), '#8c2f2a', 900, w * 0.62);
		text(g, ko ? '팥 듬뿍' : 'red bean', w * 0.82, h * 0.36, h * 0.2, '#c9493f', 800);
		text(g, ko ? '3개 2천원' : '3 for 2,000', w * 0.82, h * 0.66, h * 0.2, '#5f3d36', 800);
	});
	cartSign.position.set(CART.x - 0.2, 1.88, CART.z + 0.548);
	const tentSign = board(1.7, 0.34, (g, w, h) => {
		g.fillStyle = '#3a2433';
		g.fillRect(0, 0, w, h);
		g.fillStyle = '#ffb36b';
		g.fillRect(0, 7, w, 3);
		g.fillRect(0, h - 10, w, 3);
		text(g, ko ? '여울 포차' : 'YEOUL POCHA', w * 0.36, h * 0.52, h * 0.52, '#ffe7c0', 900, w * 0.6);
		text(g, ko ? '어묵 · 떡볶이' : 'fish cakes · tteokbokki', w * 0.8, h * 0.52, h * 0.2, '#ffb36b', 800, w * 0.36);
	});
	tentSign.position.set(TENT.x, 2.28, TENT.z + 1.36);
	const menu = board(1.25, 0.55, (g, w, h) => {
		g.fillStyle = '#f8e7c4';
		g.fillRect(0, 0, w, h);
		text(g, ko ? '오늘의 메뉴' : "TONIGHT'S MENU", w / 2, h * 0.18, h * 0.15, '#9c3d2c', 900);
		const rows = ko
			? [['어묵 한 꼬치', '1,000'], ['떡볶이 한 접시', '3,000'], ['어묵 국물', '무료!']]
			: [['Fish cake skewer', '1,000'], ['Tteokbokki', '3,000'], ['Broth', 'free!']];
		rows.forEach(([name, price], i) => {
			const y = h * (0.42 + i * 0.2);
			g.font = `700 ${Math.round(h * 0.12)}px system-ui, sans-serif`;
			g.fillStyle = '#3a2433';
			g.textAlign = 'left';
			g.fillText(name, w * 0.1, y);
			g.textAlign = 'right';
			g.fillStyle = '#c4542a';
			g.fillText(price, w * 0.9, y);
		});
	});
	menu.position.set(TENT.x - 0.55, 1.65, TENT.z - 1.25 + 0.08);
	group.add(cartSign, tentSign, menu);

	// Glowing patches on the wet pavement in front of each.
	const glowCanvas = document.createElement('canvas');
	glowCanvas.width = glowCanvas.height = 64;
	const gc = glowCanvas.getContext('2d');
	if (gc) {
		const gradient = gc.createRadialGradient(32, 32, 2, 32, 32, 31);
		gradient.addColorStop(0, '#ffffff');
		gradient.addColorStop(0.35, '#ffffff80');
		gradient.addColorStop(1, '#ffffff00');
		gc.fillStyle = gradient;
		gc.fillRect(0, 0, 64, 64);
	}
	const glowMap = new THREE.CanvasTexture(glowCanvas);
	for (const [x, z, w, d, color, opacity] of [
		[CART.x + 0.3, CART.z + 1.6, 4.2, 3.4, '#ff8a5c', 0.24],
		[TENT.x, TENT.z + 2.2, 5.6, 3.6, '#ffb060', 0.26],
	] as const) {
		const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
			map: glowMap, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		}));
		m.rotation.x = -Math.PI / 2;
		m.scale.set(w, d, 1);
		m.position.set(x, 0.013, z);
		group.add(m);
	}

	const puffs = steam(scene, [
		{ at: new THREE.Vector3(CART.x - 0.28, 1.15, CART.z), spread: 0.4 },
		{ at: new THREE.Vector3(TENT.x - 0.55, 1.18, TENT.z + 0.25), spread: 0.35 },
		{ at: new THREE.Vector3(TENT.x + 0.55, 1.18, TENT.z + 0.25), spread: 0.15 },
	]);

	new GLTFLoader().loadAsync(stallsUrl).then((gltf) => {
		const tarp = new Map<string, THREE.Material>();
		gltf.scene.traverse((o) => {
			if (!(o instanceof THREE.Mesh)) return;
			const list = Array.isArray(o.material) ? o.material : [o.material];
			const swapped = list.map((m: THREE.MeshStandardMaterial) => {
				const cached = tarp.get(m.name);
				if (cached) return cached;
				let next: THREE.Material = m;
				if (m.name.startsWith('Glow')) next = new THREE.MeshBasicMaterial({ color: m.color, toneMapped: false });
				else if (m.name === 'Tarp') {
					// Lit from inside, the orange plastic glows and lets a little of the night through.
					next = new THREE.MeshStandardMaterial({ color: m.color, emissive: m.color.clone().multiplyScalar(0.45), roughness: 0.7, transparent: true, opacity: 0.86, side: THREE.DoubleSide });
				} else if (m.name === 'Glass') {
					next = new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: 0.16, depthWrite: false });
				} else {
					m.roughness = 0.85;
					m.metalness = 0;
				}
				// Keep the name: night-walk.ts tells the sky lantern's glowing paper from its rim by it.
				next.name = m.name;
				tarp.set(m.name, next);
				return next;
			});
			o.material = Array.isArray(o.material) ? swapped : swapped[0];
			o.receiveShadow = true;
		});
		const take = (name: string) => {
			const node = gltf.scene.getObjectByName(name);
			node?.removeFromParent();
			return node;
		};
		const cart = take('BungeoCart');
		if (cart) {
			cart.position.set(CART.x, 0, CART.z);
			group.add(cart);
		}
		const pocha = take('Pocha');
		if (pocha) {
			pocha.position.set(TENT.x, 0, TENT.z);
			group.add(pocha);
		}
		const props = {
			bungeo: take('TreatBungeo'), eomuk: take('TreatEomuk'), umbrella: take('PropUmbrella'),
			radish: take('PropRadish'), skyLantern: take('PropSkyLantern'),
		};
		if (Object.values(props).every(Boolean)) onProps(props as Props);
	}, () => {
		// Without the models the street is just quieter; the signs and lights still show where they'd be.
	});

	return (time: number, reduced: boolean) => puffs(reduced ? 0.4 : time);
}
