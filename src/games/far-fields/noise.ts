// The shape of the land: the same everywhere for everyone, worked out from where you are, so the
// world needs no saving and goes on for ever.

/** A whole number from two, well stirred. */
export function hash2(x: number, z: number, seed = 0) {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return (h ^ (h >>> 16)) >>> 0;
}

/** A random number maker (0 … 1) that's always the same for the same two numbers. */
export function rng(x: number, z: number, seed = 0) {
	let s = hash2(x, z, seed) || 1;
	const next = () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
	// The first few out of seeds that are alike come out alike too: let them go by.
	for (let i = 0; i < 4; i++) next();
	return next;
}

const corner = (x: number, z: number, seed: number) => hash2(x, z, seed) / 4294967295;
const ease = (t: number) => t * t * (3 - 2 * t);

/** Smooth noise, 0 … 1, in cells one unit wide. */
export function noise(x: number, z: number, seed = 0) {
	const ix = Math.floor(x);
	const iz = Math.floor(z);
	const u = ease(x - ix);
	const v = ease(z - iz);
	const a = corner(ix, iz, seed);
	const b = corner(ix + 1, iz, seed);
	const c = corner(ix, iz + 1, seed);
	const d = corner(ix + 1, iz + 1, seed);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Noise in several octaves, -1 … 1 or so. */
export function fbm(x: number, z: number, octaves: number, seed = 0) {
	let sum = 0;
	let amp = 0.5;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += (noise(x, z, seed + i * 17) * 2 - 1) * amp;
		norm += amp;
		x = x * 2.03 + 11.7;
		z = z * 2.03 - 5.3;
		amp *= 0.5;
	}
	return sum / norm;
}

export const smooth = (a: number, b: number, t: number) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));

/** Where the sun fell from: the peak under the ring in the sky, and how high and wide it is. */
export const PEAK = { x: 320, z: -555, rise: 72, width: 120 };

/** How high the land is at (x, z). The sea is at 0. */
export function height(x: number, z: number) {
	// Land and sea, in broad sweeps.
	const continent = fbm(x / 950, z / 950, 3, 1) * 1.6;
	// Rolling hills over it.
	const hills = fbm(x / 170, z / 170, 4, 2);
	// Here and there, mountains with sharp ridges.
	const mountains = smooth(0.15, 0.55, fbm(x / 1300, z / 1300, 2, 3));
	const ridge = 1 - Math.abs(fbm(x / 260, z / 260, 4, 4));
	// Home is on a broad stretch of land, whatever the sweeps say; further off, the sea comes and goes.
	const mainland = 13 * Math.exp(-(x * x + z * z) / (520 * 520));
	// And knolls: round hills standing up out of the fields, good places to set the sun down.
	const knoll = smooth(0.5, 0.85, noise(x / 75, z / 75, 11));
	let h = 5 + mainland + continent * 16 + hills * 7 + knoll * (14 + hills * 6) + mountains * ridge * ridge * 46;
	// Where she starts is always a gentle hill above the sea.
	const home = Math.exp(-(x * x + z * z) / (90 * 90));
	h = h * (1 - home) + Math.max(h, 6 + hills * 3) * home;
	// The peak the sun has to be taken up, always on land.
	const dp = ((x - PEAK.x) ** 2 + (z - PEAK.z) ** 2) / (PEAK.width * PEAK.width);
	const peak = Math.exp(-dp);
	h = Math.max(h, 8) * smooth(0, 0.35, peak) + h * (1 - smooth(0, 0.35, peak));
	h += PEAK.rise * peak + hills * 4 * peak;
	return h;
}

/** How wooded it is at (x, z), 0 … 1. */
export const woods = (x: number, z: number) => smooth(-0.05, 0.35, fbm(x / 230, z / 230, 3, 5));
