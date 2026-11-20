import assert from 'node:assert/strict';
import { test } from 'node:test';
import { benchSeat, findWorldSeat } from '../src/games/lantern-mart/world-seats.ts';

test('only offer fixed seats from the accessible side and at walking height', () => {
	const bench = benchSeat(0, 0, .60, 1);
	const visitor = { x: 0, y: 0, z: .89, grounded: true };
	assert.equal(findWorldSeat([bench], visitor, () => true), bench);
	for (const pose of [{z: -.89}, {z: 1.8}, {y: 2}, {grounded: false}]) {
		assert.equal(findWorldSeat([bench], {...visitor, ...pose}, () => true), null);
	}
	assert.equal(findWorldSeat([bench], visitor, () => false), null);
});

test('shop stools face the window but exit toward the aisle; choose the closest clear seat', () => {
	const stools = [1.69, 2.72, 3.79].map(x => benchSeat(x, -1.55, .651, 1, .76, .04, -1));
	const visitor = { x: 2.9, y: 0, z: stools[1].standZ, grounded: true };
	assert.equal(stools[1].heading, 0);
	assert.ok(stools[1].standZ < stools[1].z);
	assert.equal(findWorldSeat(stools, visitor, () => true), stools[1]);
	assert.equal(findWorldSeat(stools, visitor, (seat) => seat !== stools[1]), stools[2]);
});
