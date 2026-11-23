import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import * as THREE from 'three';

registerHooks({
	resolve(specifier, context, next) {
		return next(specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier) ? specifier + '.ts' : specifier, context);
	},
});

const { planIsland } = await import('../src/lib/island/layout.ts');
const { scatter } = await import('../src/lib/island/scatter.ts');
const { islandWorld } = await import('../src/lib/island/features.ts');
const { terrainAt, naturalTerrainAt, terrainMesh, PIER_DIR, COAST } = await import('../src/lib/island/terrain.ts');
const {
	HOUSE_SITE, GARDEN_SITE, FORGE_SITE, VILLAGE_SITE, MARKET_SITE,
	HOMESTEAD_GREEN, VILLAGE_GREEN, SETTLEMENT_PATH, clearOfSettlements,
} = await import('../src/lib/island/settlements.ts');

function worldPoint(site, localX, localZ) {
	const s = Math.sin(site.yaw), c = Math.cos(site.yaw);
	return { x: site.x + c * localX + s * localZ, z: site.z - s * localX + c * localZ };
}
function close(actual, expected, tolerance, message) {
	assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: got ${actual}, expected ${expected} ± ${tolerance}`);
}

// Stable coordinates from the seeded Island before grading the new clearings.
test('settlement grading preserves beach spawn, sea profile, and existing landmarks', () => {
	const { START, SUMMIT, LIGHT, CAMP, STONES, BUOY, places } = planIsland();
	close(START.x, 65.5682444253941, 1e-6, 'beach spawn x');
	close(START.y, 1.1104397016501655, 1e-6, 'beach spawn height');
	close(START.z, 43.71919284446793, 1e-6, 'beach spawn z');
	for (const [name, point, x, z] of [
		['summit', SUMMIT, -27.5, -21.25],
		['lighthouse', LIGHT, 20.292034250693725, -52.194188814164676],
		['campfire', CAMP, -44.30661995544151, 25.55347414464127],
		['standing stones', STONES, 17.14889439981891, 32.62458868577296],
		['buoy', BUOY, -95.59759915574988, 8.78060565431397],
		['windspout', places.find(p => p.id === 'windspout'), -33.28749663864848, -38.79149117546118],
	]) {
		close(point.x, x, 1e-6, `${name} x`);
		close(point.z, z, 1e-6, `${name} z`);
		for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) {
			assert.equal(terrainAt(x + dx, z + dz), naturalTerrainAt(x + dx, z + dz), `${name} terrain changed`);
		}
	}
	close(SUMMIT.h, 20.15212059020996, 1e-6, 'summit height');
	for (let r = COAST - 4; r <= COAST + 24; r += .5) {
		const x = PIER_DIR.x * r, z = PIER_DIR.z * r;
		assert.equal(terrainAt(x, z), naturalTerrainAt(x, z), 'shoreline along pier changed');
	}
});

test('homestead buildings and distinct market green sit on broad level footprints', () => {
	const gardenFromPorch = worldPoint(HOUSE_SITE, 0, 12.6);
	close(GARDEN_SITE.x, gardenFromPorch.x, 1e-6, 'garden is directly in front of house, x');
	close(GARDEN_SITE.z, gardenFromPorch.z, 1e-6, 'garden is directly in front of house, z');
	assert.ok(Math.hypot(VILLAGE_SITE.x - GARDEN_SITE.x, VILLAGE_SITE.z - GARDEN_SITE.z) > 20);
	assert.ok(Math.hypot(MARKET_SITE.x - GARDEN_SITE.x, MARKET_SITE.z - GARDEN_SITE.z) > 25);
	const footprints = [
		['cottage and porch', HOUSE_SITE, 3.2, -3, 2.9, HOMESTEAD_GREEN.height],
		['vegetable beds and watering barrel', GARDEN_SITE, 5.7, -3, 3.2, HOMESTEAD_GREEN.height],
		['forge and entrance', FORGE_SITE, 3.5, -2.5, 3.4, HOMESTEAD_GREEN.height],
		['village green core', VILLAGE_SITE, 5.6, -5.8, 5.8, VILLAGE_GREEN.height],
		['stall and service side', MARKET_SITE, 1.75, -1.2, 2.4, VILLAGE_GREEN.height],
	];
	for (const [name, site, halfWidth, back, front, height] of footprints) {
		for (let lx = -halfWidth; lx <= halfWidth; lx += .25) for (let lz = back; lz <= front; lz += .25) {
			const { x, z } = worldPoint(site, lx, lz);
			close(terrainAt(x, z), height, .012, name);
			assert.equal(clearOfSettlements(x, z, 0), false, `${name} allows a scattered prop`);
		}
	}
});

test('settlement lane stays wide, dry and walkable through actual seeded scenery and terrain mesh', () => {
	const scene = new THREE.Scene(), material = new THREE.MeshBasicMaterial();
	scatter(scene, () => material, planIsland());
	const mesh = terrainMesh(material);
	const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 30);
	const radius = .45;
	for (let i = 1; i < SETTLEMENT_PATH.length; i++) {
		const a = SETTLEMENT_PATH[i - 1], b = SETTLEMENT_PATH[i];
		const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
		const steps = Math.ceil(length / .20), stride = length / steps;
		for (const offset of [-.90, 0, .90]) {
			let prior;
			for (let j = 0; j <= steps; j++) {
				const t = j / steps;
				const x = a.x + t * dx - dz * offset / length, z = a.z + t * dz + dx * offset / length;
				const y = islandWorld.groundAt(x, z);
				assert.ok(islandWorld.inside(x, z) && y > 3, 'lane must stay on dry ground');
				assert.ok(!clearOfSettlements(x, z, 0));
				assert.ok(islandWorld.nearby(x, z).every(f => Math.hypot(x - f.x, z - f.z) >= radius + f.r), 'scenery obstructs lane');
				if (prior !== undefined) assert.ok(Math.abs(y - prior) / stride < .09, 'lane is too steep to read as gentle');
				prior = y;
				if (j === 0 || j === Math.floor(steps / 2) || j === steps) {
					ray.ray.origin.set(x, 25, z);
					const hit = ray.intersectObject(mesh)[0];
					assert.ok(hit, 'walkable floor needs visible terrain underneath');
					close(hit.point.y, y, .001, 'visible terrain and collision ground');
				}
			}
		}
	}
});
