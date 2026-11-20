import assert from 'node:assert/strict';
import { test } from 'node:test';
import { benchSeat } from '../src/games/lantern-mart/world-seats.ts';

test('benches face the track while bar stools exit backward toward the aisle', () => {
	const bench = benchSeat(23, 57.46, .6, 1);
	assert.equal(bench.facing, 0);
	assert.ok(Math.abs(bench.at[2]-57.76)<1e-6, 'the bench seat is anchored at its front edge');
	assert.ok(bench.stand[1] > bench.at[2]);
	const stool = benchSeat(2.72, -1.55, .651, 1, .76, .04, -1);
	assert.equal(stool.facing, 0);
	assert.equal(stool.at[1], .651);
	assert.ok(stool.stand[1] < stool.at[2]);
});
