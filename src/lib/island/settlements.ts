// Siting shared by the land, the buildings and the footpath, in Island world meters.
// The cottage is the anchor; X/Z of the other homestead buildings are
// in its frame, so the garden reads directly off the front of the porch.
type Spot = Readonly<{ x: number; z: number }>;
type Building = Spot & Readonly<{ yaw: number }>;
type Green = Building & Readonly<{ height: number; halfWidth: number; halfDepth: number }>;

export const HOUSE_SITE: Building = Object.freeze({
	x: 43.02921908106473, z: 36.348638663115096, yaw: 2.9138304097152625,
});
const local = (site: Building, x: number, z: number): Building => Object.freeze({
	x: site.x + Math.cos(site.yaw) * x + Math.sin(site.yaw) * z,
	z: site.z - Math.sin(site.yaw) * x + Math.cos(site.yaw) * z,
	yaw: site.yaw,
});
export const GARDEN_SITE = local(HOUSE_SITE, 0, 12.6);
export const FORGE_SITE = local(HOUSE_SITE, -10.3, 2.7);
export const VILLAGE_SITE: Building = Object.freeze({ x: 47.3, z: 1.3, yaw: 0.44056693091230004 });
export const MARKET_SITE = local(VILLAGE_SITE, 0, -4.35);

export const HOMESTEAD_GREEN: Green = Object.freeze({
	...local(HOUSE_SITE, -4.7, 7.2), height: 3.68, halfWidth: 12.6, halfDepth: 11.4,
});
export const VILLAGE_GREEN: Green = Object.freeze({
	...VILLAGE_SITE, height: 3.67, halfWidth: 8.8, halfDepth: 7.3,
});

/** Follow the gate beside the garden instead of cutting through the crops. */
export const SETTLEMENT_PATH: readonly Spot[] = Object.freeze([
	local(HOUSE_SITE, 6.0, 16.7),
	Object.freeze({ x: 41.6, z: 13.1 }),
	Object.freeze({ x: 44.6, z: 8.75 }),
	Object.freeze({ x: 47.3, z: 3.4 }),
]);

const clamp = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => {
	const s = clamp(t);
	return s * s * (3 - 2 * s);
};

function greenDistance(x: number, z: number, green: Green, corner: number) {
	const dx = x - green.x, dz = z - green.z;
	const c = Math.cos(green.yaw), s = Math.sin(green.yaw);
	// Signed distance to a softly rounded rectangle in the building's frame.
	const a = Math.abs(dx * c - dz * s) - green.halfWidth + corner;
	const b = Math.abs(dx * s + dz * c) - green.halfDepth + corner;
	return Math.hypot(Math.max(0, a), Math.max(0, b)) + Math.min(0, Math.max(a, b)) - corner;
}

const lengths = SETTLEMENT_PATH.slice(1).map((p, i) => {
	const q = SETTLEMENT_PATH[i];
	return Math.hypot(p.x - q.x, p.z - q.z);
});
const total = lengths.reduce((a, b) => a + b, 0);

function lane(x: number, z: number) {
	let closest = Infinity, progress = 0, walked = 0;
	for (let i = 0; i < lengths.length; i++) {
		const a = SETTLEMENT_PATH[i], b = SETTLEMENT_PATH[i + 1], len = lengths[i];
		const dx = b.x - a.x, dz = b.z - a.z;
		const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (len * len));
		const near = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
		if (near < closest) {
			closest = near;
			progress = (walked + t * len) / total;
		}
		walked += len;
	}
	return { closest, weight: 1 - ease((closest - 1.20) / 3.4), progress };
}

/** Leave the active greens and lane free of procedurally scattered props. */
export function clearOfSettlements(x: number, z: number, gap: number) {
	return greenDistance(x, z, HOMESTEAD_GREEN, 2.8) > gap
		&& greenDistance(x, z, VILLAGE_GREEN, 2.55) > gap
		&& lane(x, z).closest > 1.85 + gap;
}

/** Shape only these dry places. Islands, beach, shore profile and the outer heightfield are unchanged. */
export function settlementHeight(x: number, z: number, natural: number) {
	if (x < 29 || x > 72 || z < -15 || z > 51 || natural <= 0.85) return natural;
	const coast = ease((natural - .85) / .81);
	const home = 1 - ease(greenDistance(x, z, HOMESTEAD_GREEN, 2.8) / 5.8);
	const village = 1 - ease(greenDistance(x, z, VILLAGE_GREEN, 2.55) / 5.45);
	if (home >= 1 && coast === 1) return HOMESTEAD_GREEN.height;
	if (village >= 1 && coast === 1) return VILLAGE_GREEN.height;
	const road = lane(x, z);
	const targets = [
		{ weight: home, y: HOMESTEAD_GREEN.height },
		{ weight: village, y: VILLAGE_GREEN.height },
		{ weight: road.weight, y: HOMESTEAD_GREEN.height + (VILLAGE_GREEN.height - HOMESTEAD_GREEN.height) * ease(road.progress) },
	];
	const weight = Math.max(home, village, road.weight) * coast;
	if (weight === 0) return natural;
	const sum = home + village + road.weight;
	const y = targets.reduce((value, target) => value + target.weight * target.y, 0) / sum;
	return natural + (y - natural) * weight;
}
