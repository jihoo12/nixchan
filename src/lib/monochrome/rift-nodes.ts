// The rift (rift.ts) for pages drawn with WebGPU (the island): the same tear, smoke, colour and rim,
// written in TSL. The grey place draws with WebGL and keeps rift.ts's GLSL; the two are kept the
// same by hand, so a change to one wants making to the other.
import * as THREE from 'three';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import { Discard, Fn, If, abs, dot, float, floor, fract, max, mix, pow, select, sin, smoothstep, sRGBTransferEOTF, uniform, uv, vec2, vec3 } from 'three/tsl';
import type { RiftMaterial } from './rift';

type V2 = Node<'vec2'>;
const hash = (p: V2) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
const noise = (p: V2) => {
	const i = floor(p);
	const f = fract(p);
	const u = f.mul(f).mul(f.mul(-2).add(3));
	return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y);
};
const fbm = (start: V2) => {
	let v = float(0) as Node<'float'>;
	let p = start;
	let a = 0.5;
	for (let i = 0; i < 4; i++) {
		v = v.add(noise(p).mul(a)) as Node<'float'>;
		p = p.mul(2.07).add(3.1);
		a *= 0.5;
	}
	return v;
};

export function riftNodeMaterial(): RiftMaterial {
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
		// The GLSL rift writes its colours out as they are, unconverted; decoding them here keeps them
		// the same through the renderer's conversion back.
		return sRGBTransferEOTF(col);
	})() as Node<'vec3'>; // (typed as a bare Node)
	return Object.assign(material, { uniforms: { ...u, uTints: { value: tints } } }) as unknown as RiftMaterial;
}
