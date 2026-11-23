import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Ray, Vector3 } from 'three';
import { castBuildSolid, castBuildSurface, createBuildAim } from '../src/lib/island/build-aim.ts';

const v = (x, y, z) => new Vector3(x, y, z);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .001, `${actual} vs ${expected}`);

test('a mouse ray finds the first ground intersection, not where it exits on the other side', () => {
	const ray = new Ray(v(0, 4, 0), v(1, -.15, 0).normalize());
	const Ridge = (x) => x < 2 ? 0 : x < 5 ? (x - 2) * 1.5 : 0;
	const hit = castBuildSurface(ray, Ridge);
	assert.ok(hit);
	near(hit.point.x, (4 + 3) / 1.65);
	near(hit.point.y, Ridge(hit.point.x));
	assert.equal(castBuildSurface(ray, Ridge, 3), null);
	assert.equal(castBuildSurface(new Ray(v(0, 2, 0), v(0, 1, 0)), () => 0), null);
});

test('the nearest physical collider occludes the floor and exposes its own anchor, not a point behind it', () => {
	const a = { x: 2, z: .3, r: .5, top: 2.8 };
	const b = { x: 4, z: 0, r: .6, top: 3.1 };
	const ray = new Ray(v(0, 2, 0), v(1, 0, 0));
	const prop = castBuildSolid(ray, () => [b, a], () => .1, 6);
	near(prop.distance, 1.6);
	assert.deepEqual(prop.hit, { x: 2, y: .1, z: .3 });
	assert.equal(castBuildSolid(ray, () => [a], () => .1, 1.5), null);
	assert.equal(castBuildSolid(ray, () => [{ ...a, pad: 1 }, { ...b, dome: { base: 0, top: 1 } }], () => 0, 10), null);
	assert.equal(castBuildSolid(new Ray(v(0, 5, 0), v(1, 0, 0)), () => [a, b], () => 0, 10), null);
});

test('mouse miss, out-of-range hit, pointer exit and blur never become a facing installation', (t) => {
	class Canvas extends EventTarget {
		getBoundingClientRect() { return { left: 20, top: 30, width: 300, height: 200 }; }
	}
	const oldWindow = globalThis.window;
	globalThis.window = new EventTarget();
	t.after(() => { globalThis.window = oldWindow; });
	const canvas = new Canvas();
	const camera = new PerspectiveCamera(50, 1.5, .1, 1000);
	camera.position.set(0, 6, 5); camera.lookAt(0, 0, 0);
	const player = v(1, 0, 1);
	const aim = createBuildAim({ canvas, camera, player, ground: () => 0, solidFloor: () => 0, nearby: () => [] });
	function send(type, pointerType = 'mouse', x = 170, y = 130) {
		canvas.dispatchEvent(Object.assign(new Event(type), { pointerType, clientX: x, clientY: y }));
	}
	assert.deepEqual(aim.sample(), { mode: 'facing' });
	send('pointerenter');
	const pointed = aim.sample();
	assert.equal(pointed.mode, 'mouse');
	assert.equal(pointed.hit.kind, 'surface');
	near(pointed.hit.x, 0);
	near(pointed.hit.z, 0);
	player.set(15, 0, 15);
	assert.deepEqual(aim.sample(), { mode: 'mouse', hit: null });
	player.set(1, 0, 1);
	send('pointerleave');
	assert.deepEqual(aim.sample(), { mode: 'mouse', hit: null });
	send('pointermove');
	globalThis.window.dispatchEvent(new Event('blur'));
	assert.deepEqual(aim.sample(), { mode: 'mouse', hit: null });
	send('pointerdown', 'touch');
	assert.deepEqual(aim.sample(), { mode: 'facing' });
});

test('the same cursor still stacks and takes stone blocks without falling back on misses', async (t) => {
	const { registerHooks } = await import('node:module');
	const hook = registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !/\.[a-z]+$/.test(s) ? s + '.ts' : s, c); } });
	const { createBlocks, blockGround } = await import('../src/lib/island/blocks.ts');
	const { terrainAt } = await import('../src/lib/island/terrain.ts');
	const { Scene, Group, MeshBasicMaterial } = await import('three');
	hook.deregister();
	const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
	Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {} } });
	t.after(() => {
		if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
		else delete globalThis.localStorage;
	});
	const x = 43.5, z = 30.5;
	const pos = v(x - 2, terrainAt(x - 2, z), z);
	let ray = new Ray(v(x, 20, z), v(0, -1, 0));
	let pieces = 3;
	const inventory = {
		register() {}, render() {}, count: () => pieces, has: () => pieces > 0, fits: () => true,
		add: () => (++pieces, true), remove: () => pieces > 0 && (--pieces, true),
	};
	const aim = { mode: 'mouse', ray: () => ({ mode: 'mouse', ray }), solid: () => null };
	const tool = createBlocks({
		scene: new Scene(), inventory, figure: { group: new Group(), node: () => null },
		toon: (params) => new MeshBasicMaterial(params), pos, aim,
		canAct: () => true, open: () => true, toast() {}, selectBuild() {},
	});
	tool.start();
	tool.offer().go();
	const first = blockGround(x, z);
	assert.ok(Number.isFinite(first));
	tool.offer().go();
	assert.equal(blockGround(x, z), first + 1);
	assert.equal(pieces, 1);
	ray = null;
	assert.equal(tool.offer().go, undefined);
	assert.equal(tool.take(), false);
	assert.equal(pieces, 1);
	ray = new Ray(v(x, 20, z), v(0, -1, 0));
	assert.equal(tool.take(), true);
	assert.equal(blockGround(x, z), first);
	assert.equal(pieces, 2);
});
