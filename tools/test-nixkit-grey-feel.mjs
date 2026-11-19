// The grey place (/monochrome) moves Nixchan with Nixkit's player now. This keeps it feeling as it
// did: the grey place's own movement, as it was before (copied from monochrome/game.ts, `step` and
// `pushOut`, before the move), and Nixkit's player, given the same keys, the same camera and the same
// walls, frame by frame, must put her in the same place, turned the same way, playing the same clip.
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
			source: 'export function buildNixFigure() { return globalThis.__greyFigure(); }',
		};
		return next(url, context);
	},
});
const { createPlayer } = await import('../src/lib/nixkit/player.ts');
const { damp, clamp } = await import('../src/lib/nixkit/util.ts');
const { greyMoves, greyCollide } = await import('../src/lib/monochrome/moves.ts');

// ---------- the grey place's movement, as it was ----------

const WALK = 3, RUN = 7.5, GRAVITY = 26, JUMP_SPEED = 8.6, BODY_R = 0.45;
function greyBefore(solidsNear, controls, orbit, cast) {
	const pos = new THREE.Vector3(), vel = new THREE.Vector3();
	let vy = 0, grounded = true, heading = 0, turnTo = 0, clip = 'Idle';
	const pushOut = () => {
		for (const s of solidsNear) {
			let nx, nz, depth;
			if (s.circle) {
				const dx = pos.x - s.circle.x, dz = pos.z - s.circle.z, d = Math.hypot(dx, dz), min = s.circle.r + BODY_R;
				if (d >= min || d < 1e-5) continue;
				nx = dx / d; nz = dz / d; depth = min - d;
			} else {
				const b = s.box, cx = clamp(pos.x, b.x0, b.x1), cz = clamp(pos.z, b.z0, b.z1);
				const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
				if (d >= BODY_R) continue;
				if (d > 1e-5) { nx = dx / d; nz = dz / d; depth = BODY_R - d; }
				else {
					const out = [pos.x - b.x0, b.x1 - pos.x, pos.z - b.z0, b.z1 - pos.z];
					const k = out.indexOf(Math.min(...out));
					nx = k === 0 ? -1 : k === 1 ? 1 : 0; nz = k === 2 ? -1 : k === 3 ? 1 : 0; depth = out[k] + BODY_R;
				}
			}
			pos.x += nx * depth; pos.z += nz * depth;
			const into = vel.x * nx + vel.z * nz;
			if (into < 0) { vel.x -= into * nx; vel.z -= into * nz; }
		}
	};
	const steer = new THREE.Vector3();
	return {
		pos, get turn() { return turnTo; }, get clip() { return clip; },
		step(dt) {
			const { forward, right, running } = controls.move();
			const yaw = orbit.yaw;
			steer.set(-Math.sin(yaw) * forward + Math.cos(yaw) * right, 0, -Math.cos(yaw) * forward - Math.sin(yaw) * right);
			if (steer.lengthSq() > 1) steer.normalize();
			if (cast.started) { heading = cast.facing; cast.started = false; }
			if (cast.left > 0) {
				steer.set(0, 0, 0);
				controls.state.jumpQueued = false;
			}
			const moving = steer.lengthSq() > 0.01;
			const speed = running ? RUN : WALK;
			const control = grounded ? 10 : 3;
			vel.x = damp(vel.x, steer.x * speed, control, dt);
			vel.z = damp(vel.z, steer.z * speed, control, dt);
			pos.x += vel.x * dt;
			pos.z += vel.z * dt;
			pushOut();
			pushOut();
			if (controls.state.jumpQueued && grounded) { vy = JUMP_SPEED; grounded = false; }
			controls.state.jumpQueued = false;
			if (!grounded) {
				vy -= GRAVITY * dt;
				pos.y += vy * dt;
				if (pos.y <= 0) { pos.y = 0; vy = 0; grounded = true; }
			}
			const planar = Math.hypot(vel.x, vel.z);
			if (planar > 0.2 && moving) heading = Math.atan2(vel.x, vel.z);
			turnTo += Math.atan2(Math.sin(heading - turnTo), Math.cos(heading - turnTo)) * (1 - Math.exp(-10 * dt));
			cast.left = Math.max(0, cast.left - dt);
			clip = planar > 3 ? 'Run' : planar > 0.25 ? 'Walk' : 'Idle';
			if (cast.left > 0) clip = 'Smith';
		},
	};
}

// ---------- the same, with Nixkit's player ----------

function greyNow(solidsNear, controls, orbit, cast) {
	let clip = 'Idle';
	globalThis.__greyFigure = () => ({
		group: new THREE.Group(), ready: Promise.resolve(), node: () => null,
		play(name) { clip = name; }, tick() {}, setBlink() {},
	});
	const player = createPlayer({
		modelUrl: '', scene: new THREE.Scene(), toon: (p) => new THREE.MeshBasicMaterial(p),
		start: new THREE.Vector3(), heading: 0, controls, orbit,
		world: { groundAt: () => 0, ceilingAt: () => Infinity, nearby: () => [], inside: () => true, collide: greyCollide(() => solidsNear) },
		hold: () => (cast.left > 0 ? cast.facing : null), clip: () => (cast.left > 0 ? 'Smith' : null), canGlide: () => false, moves: greyMoves,
	});
	return { pos: player.pos, get turn() { return player.turn; }, get clip() { return clip; }, step(dt) { player.update(dt, 0); cast.left = Math.max(0, cast.left - dt); } };
}

// ---------- the same keys for both ----------

/** A wall across the way ahead (z from -6 to -5), and a column off to the right. */
const SOLIDS = [{ box: { x0: -20, x1: 20, z0: -6, z1: -5 }, circle: null }, { box: null, circle: { x: 3, z: -2, r: 0.4 } }];

function script(t, move, state, orbit, cast) {
	move.forward = t < 4 ? 1 : 0;
	// (Both let go at once at 4 s, while she's sliding along the wall.)
	move.right = t > 1 && t < 4 ? 0.6 : t > 5.5 && t < 6.5 ? -1 : 0;
	move.running = t > 1.5 && t < 5;
	if (Math.abs(t - 2) < 1e-6 || Math.abs(t - 6) < 1e-6) state.jumpQueued = true;
	orbit.yaw = t > 5 ? (t - 5) * 0.8 : 0;
	// Chipping at a rock off to her left while she's running (as the grey place's E does).
	if (Math.abs(t - 3.2) < 1e-6) Object.assign(cast, { left: 0.9, facing: -Math.PI / 2, started: true });
}

function race(dt, seconds) {
	const pair = [greyBefore, greyNow].map((make) => {
		const move = { forward: 0, right: 0, running: false };
		const state = { jumpQueued: false, waveQueued: false, dashQueued: false };
		const orbit = { yaw: 0, pitch: 0.3, distance: 8 };
		const controls = { state, move: () => move };
		const cast = { left: 0, facing: 0, started: false };
		return { her: make(SOLIDS, controls, orbit, cast), move, state, orbit, cast };
	});
	let worst = { pos: 0, turn: 0, clips: 0 };
	let nearest = 0;
	const frames = Math.round(seconds / dt);
	for (let i = 0; i < frames; i++) {
		const t = +(i * dt).toFixed(6);
		for (const s of pair) {
			script(t, s.move, s.state, s.orbit, s.cast);
			s.her.step(dt);
		}
		const [a, b] = pair.map((s) => s.her);
		worst.pos = Math.max(worst.pos, a.pos.distanceTo(b.pos));
		worst.turn = Math.max(worst.turn, Math.abs(Math.atan2(Math.sin(a.turn - b.turn), Math.cos(a.turn - b.turn))));
		if (a.clip !== b.clip) worst.clips++;
		nearest = Math.min(nearest, a.pos.z);
	}
	return { worst, nearest };
}

test('at 60 frames a second, Nixkit moves her exactly as the grey place did', () => {
	const { worst, nearest } = race(1 / 60, 8);
	assert.ok(Math.abs(nearest - (-5 + 0.45)) < 1e-6, `she got as far as the wall (${nearest})`);
	assert.ok(worst.pos < 1e-9, `positions apart by ${worst.pos}`);
	assert.ok(worst.turn < 1e-9, `facing apart by ${worst.turn}`);
	// The one frame a cast ends on: the grey place counted its cast down before choosing her clip, and
	// now counts it down once she's moved (ORDER.player + 1), so the cast's clip shows a frame longer.
	assert.ok(worst.clips <= 1, `${worst.clips} frames with a different clip`);
});

test('at 20 frames a second (running, so Nixkit steps twice a frame), within a centimetre', () => {
	const { worst } = race(0.05, 8);
	assert.ok(worst.pos < 0.01, `positions apart by ${worst.pos}`);
	assert.ok(worst.turn < 0.01, `facing apart by ${worst.turn}`);
});
