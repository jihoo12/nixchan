// Exercises the same controls and player collision code as the browser, with only
// the rendering/model layer stubbed. No keys or position writes at runtime.
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
			source: 'export function buildNixFigure() { return globalThis.__nixkitRouteTestFigure(); }',
		};
		return next(url, context);
	},
});

const { createControls, createKeyRouter } = await import('../src/lib/nixkit/controls.ts');
const { createPlayer } = await import('../src/lib/nixkit/player.ts');
const { tribunalSpawn, tribunalTerrain, tribunalWitnesses } = await import('../src/games/third-voice/world.ts');

test('bounded agent input walks real Nixkit physics from Weirhaven spawn to Ruan', () => {
	const events = new EventTarget();
	const previous = globalThis.addEventListener;
	globalThis.addEventListener = events.addEventListener.bind(events);
	globalThis.__nixkitRouteTestFigure = () => ({
		group: new THREE.Group(), ready: Promise.resolve(), node: () => null,
		play() {}, tick() {}, setBlink() {},
	});
	try {
		const orbit = { yaw: tribunalSpawn.heading + Math.PI, pitch: 0, distance: 7 };
		const controls = createControls(new EventTarget(), { stick: null, knob: null, jump: null }, orbit, createKeyRouter());
		const player = createPlayer({
			modelUrl: '', scene: new THREE.Scene(), toon: p => new THREE.MeshBasicMaterial(p),
			start: tribunalSpawn.pos.clone(), heading: tribunalSpawn.heading, controls, orbit,
			world: tribunalTerrain, hold: () => null, clip: () => null,
		});
		const target = tribunalWitnesses.find(w => w.id === 'ferryman').pos;
		const distance = () => Math.hypot(player.pos.x - target.x, player.pos.z - target.z);
		const step = (n) => { for (let i = 0; i < n; i++) player.update(1 / 60, 0); };
		assert.ok(distance() > 6);
		controls.agentMovement.begin({ forward: 0.68, right: -0.73, durationMs: 1800 });
		step(108);
		controls.agentMovement.release();
		step(15);
		assert.ok(distance() < 2.65, `within normal interaction range; now ${distance()} m`);
		assert.equal(controls.move().right, 0);
		assert.ok(tribunalTerrain.inside(player.pos.x, player.pos.z));
	} finally {
		if (previous) globalThis.addEventListener = previous;
		else delete globalThis.addEventListener;
		delete globalThis.__nixkitRouteTestFigure;
	}
});
