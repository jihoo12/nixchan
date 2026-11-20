import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequests, ASKERS } from '../src/games/lantern-mart/requests.ts';

test('a favour is asked, fetched and handed over for a stamp', () => {
	const r = createRequests();
	assert.equal(r.state('pip'), 'new');
	assert.equal(r.wanted('bungeo'), null, 'nobody wants a bungeoppang before Pip asks');
	assert.ok(r.ask('pip'));
	assert.ok(!r.ask('pip'), 'asking twice does nothing');
	assert.equal(r.wanted('bungeo'), 'pip', 'a bungeoppang bought now is for Pip');
	assert.ok(!r.canGive('pip', null));
	assert.ok(!r.canGive('pip', 'eomuk'), 'only what was asked for will do');
	assert.ok(!r.give('pip', 'eomuk'));
	assert.ok(r.give('pip', 'bungeo'));
	assert.equal(r.state('pip'), 'done');
	assert.equal(r.stamps, 1);
	assert.equal(r.wanted('bungeo'), null, 'once delivered, the next bungeoppang is for Nixchan');
	assert.ok(!r.give('pip', 'bungeo'), "a favour's only stamped once");
});

test('things left in town wait only while someone wants them', () => {
	const r = createRequests();
	assert.ok(!r.waiting('umbrella'));
	r.ask('gomsun');
	assert.ok(r.waiting('umbrella'));
	r.give('gomsun', 'umbrella');
	assert.ok(!r.waiting('umbrella'));
});

test('every stamp makes the festival, and the notebook survives a save', () => {
	const r = createRequests();
	const wants = { pip: 'bungeo', mochi: 'eomuk', gomsun: 'umbrella', yeoul: 'radish' };
	for (const id of ASKERS) {
		assert.ok(!r.all);
		r.ask(id);
		assert.ok(r.give(id, wants[id]));
	}
	assert.ok(r.all);
	const again = createRequests(JSON.parse(JSON.stringify(r.save())));
	assert.equal(again.stamps, ASKERS.length);
	assert.ok(again.all);
});

test('a damaged save starts the notebook over rather than breaking it', () => {
	const r = createRequests({ pip: 'done', mochi: 'sideways', gomsun: 3 });
	assert.equal(r.state('pip'), 'done');
	assert.equal(r.state('mochi'), 'new');
	assert.equal(r.state('gomsun'), 'new');
	assert.equal(createRequests('nonsense').stamps, 0);
});
