import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Nixkit's own imports leave off '.ts', as Vite allows.
registerHooks({resolve(specifier, ctx, next) {
	if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', ctx);
	return next(specifier, ctx);
}});
const THREE = await import('three');
const { createGrid } = await import('../src/lib/nixkit/grid.ts');
const { createParts } = await import('../src/lib/nixkit/parts.ts');
const { createChunks } = await import('../src/lib/nixkit/chunks.ts');
const { createEngine } = await import('../src/lib/nixkit/engine.ts');

// A little random number maker that comes out the same every run.
const random = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const toon = (o = {}) => new THREE.MeshToonMaterial({ color: o.color, transparent: o.transparent });
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the grid gives back what reaches a point, and keeps the very wide to one side', () => {
	const grid = createGrid(8);
	grid.insert('a', 0, 0, 4, 4);
	grid.insert('b', 9, 6, 20, 9);
	grid.insert('floor', -5000, -5000, 5000, 5000);
	assert.deepEqual([...grid.at(1, 1)].sort(), ['a', 'floor']);
	assert.deepEqual([...grid.at(18, 8.5)].sort(), ['b', 'floor']);
	assert.deepEqual([...grid.at(-100, 300)], ['floor']);
	grid.insert('a', 100, 100, 101, 101);
	assert.deepEqual([...grid.at(1, 1)], ['floor']);
	assert.deepEqual([...grid.at(100.5, 100.5)].sort(), ['a', 'floor']);
	const seen = [];
	grid.around(10, 10, 12, (x) => seen.push(x));
	assert.deepEqual(seen.sort(), ['b', 'floor']);
	grid.remove('floor');
	assert.equal(grid.at(-100, 300).length, 0);
	assert.equal(grid.size, 2);
});

test('parts filed in the grid answer just as they did when every part was looked through', () => {
	const rnd = random(7);
	const parts = createParts(new THREE.Scene(), toon);
	for (let i = 0; i < 400; i++) {
		const big = i % 50 === 0;
		parts.add({
			at: [(rnd() - 0.5) * 200, (rnd() - 0.5) * 20, (rnd() - 0.5) * 200],
			size: big ? [300, 1, 300] : [1 + rnd() * 10, 0.5 + rnd() * 4, 1 + rnd() * 10],
			shape: rnd() < 0.3 ? 'cylinder' : 'box',
			move: rnd() < 0.2 ? { by: [(rnd() - 0.5) * 30, rnd() * 4, (rnd() - 0.5) * 30], period: 2 + rnd() * 4 } : undefined,
			solid: rnd() > 0.1,
		});
	}
	// What the old way said: every part looked through.
	const GRIP = 0.3;
	const covers = (p, x, z) => {
		const [w, , d] = p.spec.size;
		if (p.spec.shape === 'cylinder') return Math.hypot(x - p.pos.x, z - p.pos.z) <= w / 2 + GRIP;
		return Math.abs(x - p.pos.x) <= w / 2 + GRIP && Math.abs(z - p.pos.z) <= d / 2 + GRIP;
	};
	const groundAt = (x, z, y) => {
		let g = -Infinity;
		for (const p of parts.all) if (p.solid && covers(p, x, z) && (y === undefined || p.bottom <= y + 1)) g = Math.max(g, p.top);
		return g;
	};
	const ceilingAt = (x, z, y) => {
		let c = Infinity;
		for (const p of parts.all) if (p.solid && covers(p, x, z) && p.bottom > y + 1) c = Math.min(c, p.bottom);
		return c;
	};
	for (const time of [0, 0.7, 1.9, 3.3]) {
		parts.move(0.016, time);
		for (let i = 0; i < 3000; i++) {
			const x = (rnd() - 0.5) * 260;
			const z = (rnd() - 0.5) * 260;
			const y = (rnd() - 0.5) * 30;
			assert.equal(parts.world.groundAt(x, z, y), groundAt(x, z, y));
			assert.equal(parts.world.groundAt(x, z), groundAt(x, z));
			assert.equal(parts.world.ceilingAt(x, z, y), ceilingAt(x, z, y));
		}
	}
});

test('a removed part is gone from the grid too', () => {
	const parts = createParts(new THREE.Scene(), toon);
	const p = parts.add({ at: [50, 0, 50], size: [4, 1, 4] });
	assert.equal(parts.world.groundAt(50, 50), 0.5);
	p.remove();
	assert.equal(parts.world.groundAt(50, 50), -Infinity);
	assert.equal(parts.near(50, 50).length, 0);
});

/** Flat chunks, each its own height (cx + cz), that note when they come and go. */
function flatChunks(log, { async = false, ...opts } = {}) {
	return createChunks({
		size: 10,
		radius: 15,
		...opts,
		load(place) {
			log.push(`load ${place.cx},${place.cz}`);
			const h = place.cx + place.cz;
			const chunk = {
				object: new THREE.Object3D(),
				world: {
					groundAt: (x, z) => (x >= place.x0 && x < place.x1 && z >= place.z0 && z < place.z1 ? h : -Infinity),
					ceilingAt: () => Infinity,
					nearby: () => [{ x: place.x0 + 5, z: place.z0 + 5, r: 1 }],
					inside: () => true,
				},
				dispose: () => log.push(`drop ${place.cx},${place.cz}`),
			};
			return async ? tick().then(() => chunk) : chunk;
		},
	});
}

test('chunks come nearest first, a few a frame, and she can only go where they have', () => {
	const log = [];
	const chunks = flatChunks(log, { perFrame: 1 });
	assert.equal(chunks.world.inside(5, 5), false, 'nothing yet: nowhere to go');
	chunks.update(5, 5, 0.016);
	assert.deepEqual(log, ['load 0,0']);
	assert.equal(chunks.world.inside(5, 5), true);
	assert.equal(chunks.world.groundAt(5, 5), 0);
	assert.equal(chunks.world.inside(15, 5), false);
	for (let i = 0; i < 30; i++) chunks.update(5, 5, 0.016);
	// Within 15 m of (5, 5): its own, the eight round it, and the four 15 m off straight along.
	assert.equal(chunks.counts.loaded, 13);
	assert.equal(chunks.world.groundAt(15, 15), 2);
	assert.equal(chunks.group.children.length, 13);
	// The first eight were its own and the nearest ring.
	assert.deepEqual(new Set(log.slice(1, 5)), new Set(['load 1,0', 'load -1,0', 'load 0,1', 'load 0,-1']));
});

test('chunks are let go of once she is well away, not as soon as she steps off their edge', () => {
	const log = [];
	const chunks = flatChunks(log, { perFrame: 100 });
	chunks.update(5, 5, 0.016);
	// 1 m further on: (-2, 0) is now just past 15 m away, but not past keep (15 + 5).
	chunks.update(6, 5, 0.016);
	assert.ok(!log.includes('drop -2,0'));
	chunks.update(60, 5, 0.016);
	assert.ok(log.includes('drop -2,0'));
	assert.ok(log.includes('drop 0,0'));
	assert.equal(chunks.world.inside(5, 5), false);
	assert.equal(chunks.group.children.length, chunks.counts.loaded);
});

test('a neighbour is asked about near the line between two chunks', () => {
	const chunks = createChunks({
		size: 10,
		radius: 10,
		perFrame: 100,
		load(place) {
			// Chunk 0,0 has a bridge that runs 2 m into chunk 1,0.
			if (place.cx !== 0 || place.cz !== 0) return null;
			return { world: {
				groundAt: (x, z) => (x >= 0 && x < 12 && z >= 0 && z < 10 ? 1 : -Infinity),
				ceilingAt: () => Infinity,
				nearby: () => [{ x: 9.5, z: 5, r: 1 }],
				inside: () => true,
			} };
		},
	});
	chunks.update(5, 5, 0.016);
	assert.equal(chunks.world.groundAt(11, 5), 1, 'the bridge, in the next chunk along');
	assert.equal(chunks.world.groundAt(15, 5), -Infinity, 'too far in for the bridge');
	assert.equal(chunks.world.nearby(10.5, 5).length, 1);
	assert.equal(chunks.world.inside(15, 5), true, 'an empty chunk is somewhere, just with no ground');
});

test('settle waits for everything round a point, and a chunk let go of while loading is dropped when it comes', async () => {
	const log = [];
	const chunks = flatChunks(log, { async: true, busy: 3 });
	await chunks.settle(5, 5);
	assert.equal(chunks.counts.loaded, 13);
	assert.equal(chunks.counts.loading, 0);
	chunks.update(500, 500, 0.016);
	assert.equal(chunks.counts.loading, 1);
	chunks.update(5, 5, 0.016);
	await tick();
	await tick();
	assert.ok(log.some((l) => /^drop (49|50),(49|50)$/.test(l)), 'the one far off came, and was let go of at once');
	assert.equal(chunks.world.inside(505, 505), false);
});

test('a chunk that fails to load is tried again a little later', () => {
	let tries = 0;
	const warn = console.warn;
	console.warn = () => {};
	try {
		const chunks = createChunks({
			size: 10,
			radius: 1,
			load() {
				if (++tries === 1) throw new Error('no');
				return {};
			},
		});
		chunks.update(5, 5, 0.016);
		assert.equal(chunks.world.inside(5, 5), false);
		chunks.update(5, 5, 0.5);
		assert.equal(tries, 1);
		chunks.update(5, 5, 2);
		assert.equal(tries, 2);
		assert.equal(chunks.world.inside(5, 5), true);
	} finally {
		console.warn = warn;
	}
});

test('the edge of the world is never loaded, nor gone past', () => {
	const log = [];
	const chunks = flatChunks(log, { perFrame: 100, inside: (x) => x < 10 });
	chunks.update(5, 5, 0.016);
	assert.ok(!log.some((l) => l.startsWith('load 1,')));
	assert.equal(chunks.world.inside(12, 5), false);
});

test('attached, the game waits for the chunks round her before it starts', async () => {
	const renderer = { shadowMap: {}, setPixelRatio() {}, setSize() {}, setAnimationLoop() {}, render() {} };
	const engine = createEngine({ canvas: {}, renderer: () => renderer });
	const log = [];
	const chunks = flatChunks(log, { async: true });
	const her = new THREE.Vector3(5, 0, 5);
	let ticks = 0;
	chunks.attach(engine, () => her);
	engine.onUpdate(() => ticks++);
	engine.step(0.016);
	assert.equal(engine.running, false);
	assert.equal(ticks, 0);
	for (let i = 0; i < 20 && !engine.running; i++) await tick();
	assert.equal(engine.running, true);
	engine.step(0.016);
	assert.equal(ticks, 1);
	assert.equal(chunks.world.groundAt(5, 5), 0);
	assert.ok(engine.scene.children.includes(chunks.group));
	engine.dispose();
	assert.equal(chunks.counts.loaded, 0);
});
