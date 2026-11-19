// Run the real physics/player loop; only GPU/model loading is stubbed out.
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
			source: 'export function buildNixFigure() { return globalThis.__gestureTestFigure(); }',
		};
		return next(url, context);
	},
});
const { createPlayer } = await import('../src/lib/nixkit/player.ts');
function setup() {
	let held = null, clip = null, carrying = false, permitted = true, carryingCalls = 0;
	const move = { forward: 0, right: 0, running: false };
	const state = { jumpQueued: false, waveQueued: false, dashQueued: false };
	globalThis.__gestureTestFigure = () => ({
		group: new THREE.Group(), ready: Promise.resolve(), node: () => null,
		play(name) { this.clip = name; }, tick() {}, setBlink() {},
	});
	const player = createPlayer({
		modelUrl: '', scene: new THREE.Scene(), toon: p => new THREE.MeshBasicMaterial(p),
		start: new THREE.Vector3(), heading: 0, controls: { state, move: () => move }, orbit: { yaw: 0 },
		world: { groundAt: () => 0, ceilingAt: () => Infinity, nearby: () => [], inside: () => true },
		hold: () => held, clip: () => clip, carrying: () => { carryingCalls++; return carrying; },
		canGesture: () => permitted, canDash: () => true,
	});
	player.update(0.01, 0);
	return { player, move, state, held: v => held = v, clip: v => clip = v, carry: v => carrying = v,
		permit: v => permitted = v, calls: () => carryingCalls };
}
test('hop changes only visual figure, never position, velocity, grounded state or root', () => {
	const { player } = setup();
	assert.equal(player.playGesture('happy'), 1.1);
	player.update(0.42, 0.42);
	assert.ok(player.figure.group.position.y > 0.17);
	assert.deepEqual(player.pos.toArray(), [0, 0, 0]);
	assert.deepEqual(player.root.position.toArray(), [0, 0, 0]);
	assert.deepEqual(player.vel.toArray(), [0, 0, 0]);
	assert.equal(player.grounded, true);
	player.clearGesture();
	assert.equal(player.figure.group.position.y, 0);
});
test('movement, wave, jump, dash, hold, carry, custom clip and permission interrupt safely', () => {
	for (const interrupt of [
		s => s.move.forward = 1, s => s.state.waveQueued = true, s => s.state.jumpQueued = true,
		s => s.state.dashQueued = true, s => s.held(0), s => s.carry(true),
		s => s.clip('Sit'), s => s.permit(false),
	]) {
		const s = setup();
		s.player.playGesture('happy'); s.player.update(0.3, 0.3);
		assert.equal(s.player.gesturing, true);
		interrupt(s);
		s.player.update(0.01, 0.31);
		assert.equal(s.player.gesturing, false);
		assert.equal(s.player.figure.group.position.y, 0);
		assert.equal(s.player.playGesture('sad'), 0);
	}
});
test('E still starts Wave, carry callback is read once per frame, launch/respawn reset', () => {
	const s = setup();
	const calls = s.calls();
	s.player.update(0.01, 0.01);
	assert.equal(s.calls() - calls, 1);
	s.state.waveQueued = true; s.player.update(0.01, 0.02);
	assert.equal(s.player.figure.clip, 'Wave');
	assert.equal(s.state.waveQueued, false);
	for (const reset of [p => p.launch(4), p => p.respawn()]) {
		const { player } = setup();
		player.playGesture('happy'); player.update(0.3, 0.3);
		reset(player);
		assert.equal(player.gesturing, false);
		assert.equal(player.figure.group.position.y, 0);
	}
});
