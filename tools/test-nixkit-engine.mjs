import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Nixkit's own imports leave off '.ts', as Vite allows.
registerHooks({resolve(specifier, ctx, next) {
	if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', ctx);
	return next(specifier, ctx);
}});
const { createEngine, ORDER } = await import('../src/lib/nixkit/engine.ts');
const { combineWorlds } = await import('../src/lib/nixkit/world.ts');
const { createKeyRouter } = await import('../src/lib/nixkit/controls.ts');
const { createFocus } = await import('../src/lib/nixkit/camera.ts');

function fakeRenderer({ init } = {}) {
	return {
		shadowMap: { enabled: false, type: null },
		draws: 0, loop: null, size: null,
		...(init ? { init } : {}),
		setPixelRatio() {}, setSize(w, h) { this.size = [w, h]; },
		setAnimationLoop(fn) { this.loop = fn; }, render() { this.draws++; },
	};
}
const engineWith = (r = fakeRenderer()) => createEngine({ canvas: {}, renderer: () => r });

test('systems run by order, then by when they were added, and every frame is drawn', () => {
	const engine = engineWith();
	const ran = [];
	engine.add({ order: ORDER.camera, update: () => ran.push('camera') });
	engine.onUpdate(() => ran.push('game 1'));
	engine.add({ order: ORDER.world, update: () => ran.push('world') });
	engine.onUpdate(() => ran.push('game 2'));
	engine.add({ order: ORDER.player, update: () => ran.push('player') });
	engine.step(0.016);
	assert.deepEqual(ran, ['world', 'player', 'game 1', 'game 2', 'camera']);
	assert.equal(engine.renderer.draws, 1);
});

test('a system can be taken out again, and one added mid-frame starts next frame', () => {
	const engine = engineWith();
	const ran = [];
	const remove = engine.onUpdate(() => ran.push('a'));
	engine.onUpdate(() => {
		ran.push('b');
		if (ran.length === 2) engine.onUpdate(() => ran.push('late'));
	});
	engine.step(0.016);
	assert.deepEqual(ran, ['a', 'b']);
	remove();
	engine.step(0.016);
	assert.deepEqual(ran, ['a', 'b', 'b', 'late']);
});

test('paused, time stands still and only `always` systems run', () => {
	const engine = engineWith();
	const ran = [];
	engine.onUpdate((dt, t) => ran.push(['game', t]));
	engine.add({ always: true, order: ORDER.camera, update: (dt, t) => ran.push(['camera', t]) });
	engine.step(0.02);
	engine.paused = true;
	assert.equal(engine.running, false);
	engine.step(0.02);
	engine.paused = false;
	engine.step(0.02);
	assert.deepEqual(ran, [['game', 0.02], ['camera', 0.02], ['camera', 0.02], ['game', 0.04], ['camera', 0.04]]);
	assert.equal(engine.renderer.draws, 3);
});

test('a frame is never longer than maxStep, nor negative', () => {
	const engine = engineWith();
	const dts = [];
	engine.onUpdate((dt) => dts.push(dt));
	engine.step(3);
	engine.step(-1);
	assert.deepEqual(dts, [0.05, 0]);
});

test('waitFor holds the game until what it waits for settles, either way', async () => {
	const engine = engineWith();
	let ran = 0;
	engine.onUpdate(() => ran++);
	let ok, fail;
	engine.waitFor(new Promise((r) => (ok = r)));
	engine.waitFor(new Promise((_, r) => (fail = r))).catch(() => {});
	engine.step(0.02);
	ok();
	await Promise.resolve();
	engine.step(0.02);
	assert.equal(ran, 0);
	fail(new Error('no'));
	await new Promise((r) => setTimeout(r));
	engine.step(0.02);
	assert.equal(ran, 1);
	assert.equal(engine.time, 0.02);
});

test('setDraw replaces how a frame is drawn', () => {
	const engine = engineWith();
	let drawn = 0;
	engine.setDraw(() => drawn++);
	engine.step(0.016);
	assert.equal(drawn, 1);
	assert.equal(engine.renderer.draws, 0);
});

test('no renderer, no engine; a renderer that fails to start says so', async () => {
	let failed = 0;
	globalThis.document = { documentElement: { classList: { add() {} } } };
	assert.equal(createEngine({ canvas: {}, renderer: () => { throw new Error('no gpu'); }, onFail: () => failed++ }), null);
	const engine = createEngine({ canvas: {}, renderer: () => fakeRenderer({ init: () => Promise.reject(new Error('no device')) }), onFail: () => failed++ });
	assert.equal(await engine.drawing, false);
	assert.equal(failed, 2);
	await engine.start();
	assert.equal(engine.renderer.loop, null, 'no loop when it cannot draw');
	delete globalThis.document;
});

test('start sizes systems, runs the loop, and dispose takes it all down', async () => {
	const engine = engineWith();
	const sizes = [];
	let disposed = 0;
	engine.add({ resize: (w, h) => sizes.push([w, h]), dispose: () => disposed++ });
	await engine.start();
	assert.deepEqual(sizes, [[1, 1]]);
	engine.add({ resize: (w, h) => sizes.push(['late', w, h]) });
	assert.deepEqual(sizes.at(-1), ['late', 1, 1], 'a system added after start is sized at once');
	assert.equal(typeof engine.renderer.loop, 'function');
	engine.dispose();
	assert.equal(engine.renderer.loop, null);
	assert.equal(disposed, 1);
});

test('combineWorlds: the highest ground, lowest ceiling, everything nearby', () => {
	const rock = { x: 0, z: 0, r: 1 };
	const box = { x: 1, z: 0, r: 2 };
	const terrain = { groundAt: () => 1, ceilingAt: () => Infinity, nearby: () => [rock], inside: (x) => x < 10, sea: { swimIn: -1, swimOut: -0.5 } };
	const parts = { groundAt: (x) => (x > 5 ? 3 : -Infinity), ceilingAt: () => 8, nearby: () => [box], inside: (x) => x < 20, fallOut: -24, windLift: () => 2 };
	const world = combineWorlds(terrain, parts);
	assert.equal(world.groundAt(0, 0), 1);
	assert.equal(world.groundAt(6, 0), 3);
	assert.equal(world.ceilingAt(0, 0, 0), 8);
	assert.deepEqual(world.nearby(0, 0), [rock, box]);
	assert.equal(world.inside(15, 0), true);
	assert.equal(world.inside(25, 0), false);
	assert.equal(world.sea, terrain.sea);
	assert.equal(world.fallOut, -24);
	assert.equal(world.windLift(0, 0, 0), 2);
	assert.equal(world.wadeDepth, undefined);
	assert.equal(combineWorlds(terrain), terrain);
});

test('key router: highest priority first, the first to take a key has it; commands all hear', () => {
	const keys = createKeyRouter();
	const heard = [];
	keys.intercept((k) => { heard.push('menu'); return k === 'm'; });
	const removeTalk = keys.intercept((k) => { heard.push('talk'); return k === 'enter'; }, 10);
	keys.command((k) => heard.push('a:' + k));
	keys.command((k) => heard.push('b:' + k));
	assert.equal(keys.route.intercept('enter', {}), true);
	assert.deepEqual(heard, ['talk']);
	heard.length = 0;
	assert.equal(keys.route.intercept('m', {}), true);
	assert.deepEqual(heard, ['talk', 'menu']);
	removeTalk();
	heard.length = 0;
	assert.equal(keys.route.intercept('x', {}), false);
	keys.route.command('x', {});
	assert.deepEqual(heard, ['menu', 'a:x', 'b:x']);
	assert.equal(keys.route.blockZoom(), false);
	keys.blockZoom(() => true);
	assert.equal(keys.route.blockZoom(), true);
});

test('focus: the first source that frames anyone wins', () => {
	const focus = createFocus();
	let talking = false;
	focus.add(() => (talking ? { x: 1, z: 2, facing: 0 } : null));
	const removeForge = focus.add(() => ({ x: 9, z: 9, facing: 1 }));
	assert.deepEqual(focus.current(), { x: 9, z: 9, facing: 1 });
	talking = true;
	assert.deepEqual(focus.current(), { x: 1, z: 2, facing: 0 });
	talking = false;
	removeForge();
	assert.equal(focus.current(), null);
});

test('hands: one thing at a time, the one just taken up wins', async () => {
	const { createHands } = await import('../src/lib/nixkit/hands.ts');
	const state = { can: false, block: false, belt: false };
	const thing = (k) => ({ holding: () => state[k], stop: () => (state[k] = false) });
	const hands = createHands([thing('can'), thing('belt'), thing('block')]);
	assert.equal(hands.holding(), false);
	state.block = true;
	hands.update();
	assert.deepEqual(state, { can: false, block: true, belt: false });
	state.belt = true; // taken up while the block is held: the block goes
	hands.update();
	assert.deepEqual(state, { can: false, block: false, belt: true });
	state.can = state.block = true; // two at once: the first listed wins
	hands.update();
	assert.deepEqual(state, { can: true, block: false, belt: false });
	assert.equal(hands.holding(), true);
});
