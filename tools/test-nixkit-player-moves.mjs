// The player's per-game tuning (moves, canJump, autoSteer, world.collide), with the real movement
// loop; only the figure (GPU and model loading) is stubbed out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

registerHooks({
	resolve(specifier, context, next) {
		if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
			try { return next(specifier + '.ts', context); } catch {}
		}
		return next(specifier, context);
	},
	load(url, context, next) {
		if (url.endsWith('/experimental/nix-figure.ts')) return {
			format: 'module', shortCircuit: true,
			source: 'export function buildNixFigure() { return globalThis.__movesTestFigure(); }',
		};
		return next(url, context);
	},
});
const { createPlayer } = await import('../src/lib/nixkit/player.ts');

function setup(extra = {}, world = {}) {
	const move = { forward: 0, right: 0, running: false };
	const state = { jumpQueued: false, waveQueued: false, dashQueued: false };
	const plays = [];
	globalThis.__movesTestFigure = () => ({
		group: new THREE.Group(), ready: Promise.resolve(), node: () => null,
		play(name, pace) { plays.push([name, pace]); }, tick() {}, setBlink() {},
	});
	const player = createPlayer({
		modelUrl: '', scene: new THREE.Scene(), toon: (p) => new THREE.MeshBasicMaterial(p),
		start: new THREE.Vector3(), heading: 0, controls: { state, move: () => move }, orbit: { yaw: 0 },
		world: { groundAt: () => 0, ceilingAt: () => Infinity, nearby: () => [], inside: () => true, ...world },
		hold: () => null, clip: () => null,
		...extra,
	});
	const run = (n, dt = 0.02) => { for (let i = 0; i < n; i++) player.update(dt, 0); };
	return { player, move, state, plays, run };
}

test('without moves, she walks as on the island: easing up to 3 m/s', () => {
	const { player, move, run } = setup();
	move.right = 1;
	run(1);
	assert.ok(player.pos.x > 0 && player.pos.x < 3 * 0.02 * 0.5, 'eases up from standing');
	run(100);
	assert.ok(Math.abs(player.vel.x - 3) < 1e-3);
});

test('moves: speeds, an instant grip (even on a frame that took no time), and her stride', () => {
	const { player, move, plays, run } = setup({ moves: { walk: 2.6, run: 5.2, grip: Infinity, turn: 12, body: 0.38, stride: { walk: 2.6 / 1.1, run: 5.2 } } });
	move.right = 1;
	run(1, 0);
	assert.ok(Number.isFinite(player.pos.x) && Number.isFinite(player.vel.x));
	run(1);
	assert.equal(player.vel.x, 2.6);
	assert.ok(Math.abs(player.pos.x - 0.052) < 1e-9, 'at full speed from the first frame');
	assert.deepEqual(plays.at(-1), ['Walk', 2.6 / (2.6 / 1.1)]);
	move.running = true;
	run(1);
	assert.equal(player.vel.x, 5.2);
	assert.deepEqual(plays.at(-1), ['Run', 1]);
	move.right = 0;
	run(1);
	assert.equal(player.vel.x, 0, 'stops at once');
});

test('canJump false: Space does nothing; true or absent, she jumps', () => {
	const off = setup({ canJump: () => false });
	off.state.jumpQueued = true;
	off.run(5);
	assert.equal(off.player.pos.y, 0);
	assert.equal(off.state.jumpQueued, false);
	const on = setup();
	on.state.jumpQueued = true;
	on.run(5);
	assert.ok(on.player.pos.y > 0.5);
});

test('autoSteer walks her only while nothing is pressed', () => {
	let towards = { x: 0, z: -1 };
	const { player, move, run } = setup({ autoSteer: () => towards, moves: { grip: Infinity } });
	run(10);
	assert.ok(player.pos.z < -0.5 && Math.abs(player.pos.x) < 1e-9);
	move.right = 1;
	const z = player.pos.z;
	run(10);
	assert.equal(player.pos.z, z, 'a key takes over');
	move.right = 0;
	towards = null;
	const x = player.pos.x;
	run(10);
	assert.equal(player.pos.x, x, 'null stands her still');
});

test('world.collide moves her out; leaving her speed, she leans into a wall', () => {
	const wall = (p, r) => { if (p.x > 1 - r) p.x = 1 - r; };
	const { player, move, plays, run } = setup({ moves: { body: 0.38 } }, { collide: wall });
	move.right = 1;
	run(200);
	assert.ok(Math.abs(player.pos.x - 0.62) < 1e-9);
	assert.ok(player.vel.x > 2.9, 'still pressing on');
	assert.equal(plays.at(-1)[0], 'Walk');
});
