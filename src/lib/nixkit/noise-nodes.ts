// Noise for shaders in TSL: the hash, value noise and fractal noise the rift and the sky gate swirl
// with. (The GLSL they came from is in monochrome/rift.ts, which the grey place still draws with.)
import type { Node } from 'three/webgpu';
import { dot, float, floor, fract, mix, sin, vec2 } from 'three/tsl';

type V2 = Node<'vec2'>;

/** A number from 0 to 1 that jumps about from one point to the next. */
export const hash2 = (p: V2) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

/** Smooth noise from 0 to 1, changing about once a unit. */
export const noise2 = (p: V2) => {
	const i = floor(p);
	const f = fract(p);
	const u = f.mul(f).mul(f.mul(-2).add(3));
	return mix(mix(hash2(i), hash2(i.add(vec2(1, 0))), u.x), mix(hash2(i.add(vec2(0, 1))), hash2(i.add(vec2(1, 1))), u.x), u.y);
};

/** Fractal noise: four layers of noise2, each `scale` times finer (and moved on by `shift`) and half
 * as strong as the last. */
export const fbm2 = (start: V2, scale: number, shift: number) => {
	let v = float(0) as Node<'float'>;
	let p = start;
	let a = 0.5;
	for (let i = 0; i < 4; i++) {
		v = v.add(noise2(p).mul(a)) as Node<'float'>;
		p = p.mul(scale).add(shift);
		a *= 0.5;
	}
	return v;
};
