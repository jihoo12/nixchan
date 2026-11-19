// The rift: a tear in the air, grey and slowly churning, with ragged edges. One hangs between the
// standing stones on the island (on a night after she's been to the top of Cloudrest) and leads to
// the grey place; one in the grey place leads back; and smaller ones open where a colour shard was
// taken, back to the Threshold. Colour seeps into it as the shards come home.
import * as THREE from 'three';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import { Discard, Fn, If, abs, fract, max, mix, pow, select, sin, smoothstep, sRGBTransferEOTF, uniform, uv, vec2, vec3 } from 'three/tsl';
import { fbm2, noise2 } from '../nixkit/noise-nodes';

const fbm = (p: Node<'vec2'>) => fbm2(p, 2.07, 3.1);
const noise = noise2;

/** The rift's look: a TSL material, so it draws with WebGPU (or WebGL 2). Pages with more than one
 * rift share one, so they churn together. */
export function riftMaterial(): RiftMaterial {
	const tints = [new THREE.Color('#ff7aa8'), new THREE.Color('#6fd0ff'), new THREE.Color('#ffd84d')];
	const u = { uTime: uniform(0), uOpen: uniform(1), uDark: uniform(0), uTint: uniform(0) };
	const [t0, t1, t2] = tints.map((c) => uniform(c));
	const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: true });
	material.colorNode = Fn(() => {
		const time = u.uTime;
		// -1 … 1 across, 0 … 1 up. The tear is widest a little below the middle and pinches to a
		// point at top and bottom, its edges ragged and creeping.
		const x = uv().x.mul(2).sub(1);
		const y = uv().y;
		const width = pow(max(0, sin(y.mul(Math.PI))), 0.7).mul(u.uOpen);
		const ragged = fbm(vec2(y.mul(7), time.mul(0.4))).sub(0.5).mul(0.5).add(noise(vec2(y.mul(31), time.mul(1.3))).sub(0.5).mul(0.18));
		const edge = width.mul(ragged.add(0.82)).sub(abs(x.add(fbm(vec2(y.mul(2.5), time.mul(0.15))).sub(0.5).mul(0.35))));
		If(edge.lessThan(0), () => {
			Discard();
		});
		// Inside: grey smoke turning over itself, pulled downwards and in towards the middle.
		const p = vec2(x.mul(1.6), y.mul(3));
		const n = fbm(p.mul(1.4).add(vec2(fbm(p.add(time.mul(0.12))).mul(2), time.mul(-0.35))));
		const swirl = fbm(p.mul(3).sub(vec2(0, time.mul(0.6))));
		const shade0 = mix(0.12, 0.92, smoothstep(0.25, 0.8, n));
		const shade = mix(shade0, shade0.oneMinus(), smoothstep(0.62, 0.8, swirl).mul(0.6));
		// Colour seeps in once some has come home: bands of it, drifting through the smoke.
		const band = fract(n.mul(2).add(time.mul(0.05)));
		const tint = select(band.lessThan(0.333), t0, select(band.lessThan(0.666), t1, t2));
		let col = mix(vec3(shade), tint.mul(shade.mul(0.7).add(0.5)), u.uTint.mul(smoothstep(0.35, 0.75, n)));
		// At night it's the darker parts that win; in the day, the paler.
		col = mix(col, col.mul(col), u.uDark);
		// A bright rim, just inside the edge.
		const rim = smoothstep(0, 0.07, edge).oneMinus();
		col = mix(col, vec3(1), rim.mul(0.9));
		// Its colours were worked out to be written out as they are (as its GLSL once did, unconverted);
		// decoding them here keeps them the same through the renderer's conversion back.
		return sRGBTransferEOTF(col);
	})() as Node<'vec3'>; // (typed as a bare Node)
	return Object.assign(material, { uniforms: { ...u, uTints: { value: tints } } }) as unknown as RiftMaterial;
}

/** What a rift's material is told, each a uniform: how far on it is, how open, how dark (by night),
 * and how much colour is in it, of which three colours. */
export interface RiftUniforms {
	uTime: { value: number };
	uOpen: { value: number };
	uDark: { value: number };
	uTint: { value: number };
	uTints: { value: THREE.Color[] };
}

export type RiftMaterial = THREE.Material & { uniforms: RiftUniforms };

export interface Rift {
	mesh: THREE.Mesh;
	material: RiftMaterial;
	update(time: number): void;
	/** How open it is, 0 (shut, invisible) … 1. */
	open: number;
	/** How much colour is in it, 0 … 1, and which colours. */
	tint(amount: number, colors: string[]): void;
	/** Darker at night. */
	night(on: boolean): void;
}

/** A rift `width` across and `height` tall, standing on y = 0, facing ±z. */
export function createRift(width: number, height: number, material: RiftMaterial = riftMaterial()): Rift {
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
	mesh.position.y = height / 2;
	const u = material.uniforms;
	return {
		mesh,
		material,
		update(time) {
			u.uTime.value = time;
		},
		get open() {
			return u.uOpen.value;
		},
		set open(v: number) {
			u.uOpen.value = v;
			mesh.visible = v > 0.01;
		},
		tint(amount, colors) {
			u.uTint.value = amount;
			colors.slice(0, 3).forEach((c, i) => u.uTints.value[i].set(c));
			for (let i = colors.length; i < 3; i++) u.uTints.value[i].set(colors[0] ?? '#ffffff');
		},
		night(on) {
			u.uDark.value = on ? 0.6 : 0;
		},
	};
}
