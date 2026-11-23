import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import * as THREE from 'three';

// Run geometric and delivery bookkeeping in Node, with only browser's model I/O
// replaced. Power's scene, terrain, save parser, belt routing and offers stay real.
const hooks = registerHooks({resolve(specifier, ctx, next) {
	if (specifier === 'three/examples/jsm/loaders/GLTFLoader.js')
		return { url: 'data:text/javascript,export class GLTFLoader {loadAsync(){return new Promise(()=>{});}}', shortCircuit: true };
	if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', ctx);
	return next(specifier, ctx);
}});
const { createPower } = await import('../src/lib/island/power.ts');
hooks.deregister();

test('old and new belt endpoints deliver once into the same saved hopper stock', (t) => {
	const powerKey = 'island-power';
	const saved = new Map();
	const oldDocument = globalThis.document;
	const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	globalThis.document = { querySelector: () => null };
	Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
		getItem: (key) => saved.get(key) ?? null,
		setItem: (key, value) => saved.set(key, value),
	}});
	t.after(() => {
		if (oldDocument === undefined) delete globalThis.document;
		else globalThis.document = oldDocument;
		if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
		else delete globalThis.localStorage;
	});
	let now = 10_000;
	t.mock.method(Date, 'now', () => now);
	const hopper = { x: 14.5, z: 10, yaw: 0 };
	const legacyHopper = { x: 14.5, z: 4, yaw: 0 };
	const veins = [
		{ id: 'vein-0', x: 14.5, y: 3, z: -0.5 },
		{ id: 'vein-1', x: 14.5, y: 3, z: 5.5 },
	];
	const ripe = new Map(veins.map((v) => [v.id, now]));
	const regrowMs = 1_000_000;
	const beltRun = (z) => Array.from({ length: 3 }, (_, i) => [14, z + i, 0]);
	const belts = [...beltRun(7), ...beltRun(1)];
	const windmills = [{ x: 14.5, z: 0 }];
	saved.set(powerKey, JSON.stringify({ windmills, drills: veins.map((v) => ({ vein: v.id, yaw: 0, from: now, stored: 0, flight: [] })), belts, hopper: 2 }));
	const read = () => JSON.parse(saved.get(powerKey));

	const scene = new THREE.Scene();
	const pos = new THREE.Vector3();
	let stock = 0;
	const power = createPower({
		scene, renderer: { init: () => new Promise(() => {}) }, toon: (p) => new THREE.MeshStandardMaterial(p),
		inventory: { register() {}, render() {}, add(id, amount) { assert.equal(id, 'ore'); stock += amount; return true; } },
		pos, figure: { group: new THREE.Group(), node: () => null }, modelUrl: '', ore: { id: 'ore', color: '#b79771' },
		veins: { veins: () => veins, ripeAt: (id) => ripe.get(id), take: (id, at) => ripe.set(id, at + regrowMs), regrowMs },
		hopper, legacyHopper, groundAt: () => 3, addFeature() {}, removeFeature() {}, canAct: () => true, canCarry: () => true, toast() {},
	});
	assert.equal(scene.getObjectByName('Old ore receiver').position.z, legacyHopper.z);
	assert.equal(scene.getObjectByName('Forge ore hopper').position.z, hopper.z);

	power.update(2, 0);
	assert.deepEqual(read().drills.map((d) => d.flight.length), [1, 1]);
	assert.deepEqual(read().drills.map((d) => d.stored), [0, 0]);
	now += 3_000;
	power.update(2, 3);
	assert.deepEqual(read().drills.map((d) => d.flight.length), [0, 0]);
	assert.equal(read().hopper, 4);

	pos.set(legacyHopper.x, 0, legacyHopper.z);
	assert.match(power.offer().label, /shared ore \(4\)/);
	power.offer().go();
	assert.equal(stock, 4);
	assert.equal(read().hopper, 0);
	pos.set(hopper.x, 0, hopper.z);
	assert.match(power.offer().label, /empty/);
	assert.equal(power.offer().go, undefined);
	assert.deepEqual(read().windmills, windmills);
	assert.deepEqual(read().belts, belts);
	assert.deepEqual(Object.keys(read()).sort(), ['belts', 'drills', 'hopper', 'windmills']);
});
