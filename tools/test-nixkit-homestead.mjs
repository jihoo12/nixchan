import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import * as THREE from 'three';

const hooks = registerHooks({
	resolve(specifier, ctx, next) {
		if (specifier === 'three/examples/jsm/loaders/GLTFLoader.js')
			return { url: 'data:text/javascript,export class GLTFLoader {loadAsync(){return new Promise(()=>{});}}', shortCircuit: true };
		if (specifier === '../base')
			return { url: 'data:text/javascript,export const to=(path)=>"/nixchan"+path;', shortCircuit: true };
		if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', ctx);
		return next(specifier, ctx);
	},
});
const { planIsland } = await import('../src/lib/island/layout.ts');
const { scatter } = await import('../src/lib/island/scatter.ts');
const { buildLandmarks, buildPier } = await import('../src/lib/island/landmarks.ts');
const { createFarm } = await import('../src/lib/island/farm.ts');
const { createForge } = await import('../src/lib/island/forge.ts');
const { createHouse } = await import('../src/lib/island/house.ts');
const { createInventory } = await import('../src/lib/island/inventory.ts');
const { createMachines } = await import('../src/lib/island/machines.ts');
const { addFeature, removeFeature, groundAt, nearby, within } = await import('../src/lib/island/features.ts');
const { HOUSE_SITE, GARDEN_SITE, FORGE_SITE, MARKET_SITE, SETTLEMENT_PATH } = await import('../src/lib/island/settlements.ts');
const { naturalTerrainAt, terrainAt } = await import('../src/lib/island/terrain.ts');
const { ORE_VEINS, OLD_ORE_HOPPER } = await import('../src/lib/island/orefield.ts');
hooks.deregister();

const V = (x, z) => new THREE.Vector3(x, groundAt(x, z), z);
const front = (site, m) => ({ x: site.x + Math.sin(site.yaw) * m, z: site.z + Math.cos(site.yaw) * m });
const step = .4;
const walkable = (x, z) => {
	const y = groundAt(x, z);
	return y >= .15 && nearby(x, z).every((o) => {
		if (!within(o, y) || o.dome || o.pad !== undefined || (o.top !== undefined && y >= o.top)) return true;
		return Math.hypot(x - o.x, z - o.z) >= o.r + .45;
	});
};
// Check continuous foot clearance between successive sample centers; no jumping, swimming, or magic movement.
function canWalk(from, to) {
	const minX = Math.min(from.x, to.x) - 8, maxX = Math.max(from.x, to.x) + 8;
	const minZ = Math.min(from.z, to.z) - 8, maxZ = Math.max(from.z, to.z) + 8;
	const queue = [[0, 0]], seen = new Set(['0,0']);
	for (let k = 0; k < queue.length; ++k) {
		const [i, j] = queue[k], x = from.x + step * i, z = from.z + step * j, y = groundAt(x, z);
		if (Math.hypot(x - to.x, z - to.z) < .48 && walkable(x, z)) return true;
		for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
			const key = `${i + di},${j + dj}`, nx = x + di * step, nz = z + dj * step;
			if (seen.has(key) || nx < minX || nx > maxX || nz < minZ || nz > maxZ ||
				!walkable(nx, nz) || !walkable((x + nx) / 2, (z + nz) / 2) || Math.abs(groundAt(nx, nz) - y) > .20) continue;
			queue.push([i + di, j + dj]); seen.add(key);
		}
	}
	return false;
}

test('the house, saved garden, forge and village connect on foot using actual world features', (t) => {
	const storage = new Map();
	const today = Date.now();
	const plots = [
		{ crop: 'turnip', stage: 3, wet: false, since: today, last: 'turnip' },
		{ crop: 'carrot', stage: 1, wet: true, since: today, last: 'carrot' },
	];
	storage.set('island-garden', JSON.stringify({ plots, water: 3, coins: 46, gifted: true, seed: 'turnip' }));
	storage.set('island-bag', JSON.stringify([['tool-can', 1], ['seed-turnip', 7]]));
	storage.set('island-machines', JSON.stringify({ sprinklers: [{ slot: 0, at: today }], helper: null, crate: { turnip: 4 } }));
	const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
		getItem: (key) => storage.get(key) ?? null,
		setItem: (key, val) => storage.set(key, val),
	} });
	t.after(() => {
		if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
		else delete globalThis.localStorage;
	});
	const priorDocument = globalThis.document, priorListener = globalThis.addEventListener;
	globalThis.document = {
		querySelector: () => null,
		createElement: () => ({
			getContext: () => new Proxy({
				createRadialGradient: () => ({ addColorStop() {} }),
				createLinearGradient: () => ({ addColorStop() {} }),
			}, { get: (o, k) => o[k] ?? (() => {}) }),
		}),
	};
	globalThis.addEventListener = () => {};
	t.after(() => { globalThis.document = priorDocument; globalThis.addEventListener = priorListener; });

	const scene = new THREE.Scene(), toon = (options) => new THREE.MeshStandardMaterial(options), theme = { on() {} };
	buildPier(scene, toon, theme);
	const layout = planIsland();
	scatter(scene, toon, layout);
	buildLandmarks(scene, toon, theme, layout, layout.START);
	const renderer = { init: () => new Promise(() => {}) };
	const inventory = createInventory({ slots: 24, grid: null, detail: null, summary: null });
	const pos = layout.START.clone(), figure = { group: new THREE.Group(), node: () => null };
	let traded = false;
	const ctx = { scene, toon, theme, renderer, inventory, modelUrl: '', figure, places: layout.places,
		addFeature, removeFeature, groundAt, pos, canAct: () => true, towardCamera: () => 0, toast() {} };
	const farm = createFarm({ ...ctx, centre: GARDEN_SITE, angle: GARDEN_SITE.yaw, market: MARKET_SITE,
		keeper: { name: 'Pebble', talk: () => { traded = true; } } });
	const forge = createForge({ ...ctx, site: FORGE_SITE, onUpgrade() {} });
	const house = createHouse({ ...ctx, site: HOUSE_SITE });
	const machines = createMachines({ ...ctx, garden: farm.garden, swimming: () => false });

	assert.deepEqual(farm.garden.plots.slice(0, 2), plots, 'crop slots hydrate unchanged');
	assert.equal(inventory.count('tool-can'), 1);
	assert.equal(inventory.count('seed-turnip'), 7);
	assert.equal(farm.coins, 46);
	assert.equal(machines.sprinklers(), 1, 'saved sprinkler hydrates by slot on moved garden');
	const local = farm.garden.plotLocal(0);
	const crop = farm.garden.world(local.lx, local.lz);
	pos.copy(V(crop.x, crop.z));
	assert.match(farm.offer()?.label, /Harvest the turnip/i, 'previous crop is now at the homestead');

	const porchFront = front(HOUSE_SITE, 4.03);
	const market = front(MARKET_SITE, 1.4);
	const forgeFront = front(FORGE_SITE, 4.1);
	assert.ok(walkable(porchFront.x, porchFront.z), 'porch apron is reachable');
	assert.ok(canWalk(layout.START, porchFront), 'beach connects to the homestead on foot');
	assert.ok(canWalk(porchFront, crop), 'from the porch to the field');
	assert.ok(canWalk(porchFront, forgeFront), 'side yard reaches the forge');
	const anvilFront = front(FORGE_SITE, 1.4);
	assert.ok(canWalk(forgeFront, anvilFront), 'forge entrance connects to the anvil');
	pos.copy(V(anvilFront.x, anvilFront.z));
	assert.match(forge.offer()?.label, /Use the anvil/);
	for (const [i, point] of SETTLEMENT_PATH.entries())
		assert.ok(walkable(point.x, point.z), `clear footpath point ${i}`);
	assert.ok(canWalk(crop, SETTLEMENT_PATH[0]), 'garden reaches path');
	assert.ok(canWalk(SETTLEMENT_PATH.at(-1), market), 'village green reaches the counter');
	assert.ok(Math.hypot(farm.keeperSpot.x - MARKET_SITE.x, farm.keeperSpot.z - MARKET_SITE.z) < 1);
	pos.copy(V(market.x, market.z));
	assert.match(farm.offer()?.label, /Pebble/);
	farm.offer().go();
	assert.equal(traded, true);
	assert.ok(Math.hypot(house.doorStep.x - HOUSE_SITE.x, house.doorStep.z - HOUSE_SITE.z) < 2);
	assert.equal(terrainAt(OLD_ORE_HOPPER.x, OLD_ORE_HOPPER.z), naturalTerrainAt(OLD_ORE_HOPPER.x, OLD_ORE_HOPPER.z));
	assert.deepEqual(forge.veinSource.veins(),
		ORE_VEINS.map(([x, y, z], i) => ({ id: `vein-${i}`, x, y, z })), 'persistent drill IDs and their world coordinates');
});
