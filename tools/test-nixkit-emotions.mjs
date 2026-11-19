import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmotionPlayer } from '../src/lib/nixkit/emotions.ts';

test('emotion blends in, holds, blends out, then restores neutral only once', () => {
	const events = [];
	const p = createEmotionPlayer((...frame) => events.push(frame));
	p.tick(1);
	assert.deepEqual(events, []);
	p.play('happy', 1);
	p.tick(0.08);
	assert.deepEqual(events.at(-1), ['happy', 0.5]);
	p.tick(0.2);
	assert.deepEqual(events.at(-1), ['happy', 1]);
	p.tick(0.61);
	assert.equal(events.at(-1)[0], 'happy');
	assert.ok(Math.abs(events.at(-1)[1] - 0.5) < 1e-10);
	p.tick(0.2);
	assert.deepEqual(events.at(-1), ['neutral', 0]);
	const length = events.length;
	p.tick(0.25);
	assert.equal(events.length, length);
});

test('replacement passes through neutral; a repeated mood keeps its current strength', () => {
	const events = [];
	const p = createEmotionPlayer((...frame) => events.push(frame));
	p.play('sad');
	p.tick(0.08);
	p.play('sad');
	p.tick(0);
	assert.deepEqual(events.at(-1), ['sad', 0.5]);
	p.tick(0.16);
	p.play('surprised');
	p.tick(0.05);
	assert.deepEqual(events.at(-1), ['sad', 0.5]);
	p.tick(0.05);
	assert.deepEqual(events.at(-1), ['neutral', 0]);
	p.tick(0.16);
	assert.deepEqual(events.at(-1), ['surprised', 1]);
	p.clear();
	assert.deepEqual(events.at(-1), ['neutral', 0]);
});

test('reduced motion uses a still face and invalid timing never leaves a stuck cue', () => {
	const events = [];
	const p = createEmotionPlayer((...frame) => events.push(frame), () => true);
	p.play('determined', NaN);
	p.tick(NaN);
	assert.equal(events.length, 0);
	p.tick(0.01);
	assert.deepEqual(events.at(-1), ['determined', 1]);
	p.tick(3);
	assert.deepEqual(events.at(-1), ['neutral', 0]);
});
