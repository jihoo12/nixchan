import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import * as THREE from 'three';

// Nixkit's own imports leave off '.ts', as Vite allows.
registerHooks({resolve(specifier, ctx, next) {
	if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', ctx);
	return next(specifier, ctx);
}});

const stored = new Map();
const events = new Map();
Object.assign(globalThis, {
	localStorage: {
		getItem: (k) => (stored.has(k) ? stored.get(k) : null),
		setItem: (k, v) => stored.set(k, String(v)),
	},
	location: { search: '' },
	document: { documentElement: { dataset: {} } },
	addEventListener: (k, fn) => events.set(k, [...(events.get(k) ?? []), fn]),
	removeEventListener: (k, fn) => events.set(k, (events.get(k) ?? []).filter((f) => f !== fn)),
	performance: globalThis.performance,
});
const fire = (k) => (events.get(k) ?? []).forEach((fn) => fn());

const { createSaves, readJSON } = await import('../src/lib/nixkit/save.ts');
const { createDayNight } = await import('../src/lib/nixkit/daynight.ts');
const { createInventory } = await import('../src/lib/nixkit/inventory.ts');
const { createTalk } = await import('../src/lib/nixkit/talk.ts');
const { createKeyRouter } = await import('../src/lib/nixkit/controls.ts');
const { josa, pick } = await import('../src/lib/nixkit/lang.ts');

test('saves: only the keys it was given, under their own names, and never throwing', () => {
	const save = createSaves({ bag: 'game-bag', seen: 'game-seen' });
	save.saveJSON('bag', [['fish', 2]]);
	save.saveText('seen', '1');
	assert.equal(stored.get('game-bag'), '[["fish",2]]');
	assert.deepEqual(save.loadJSON('bag'), [['fish', 2]]);
	assert.equal(save.loadText('seen'), '1');
	stored.set('game-bag', '{not json');
	assert.equal(save.loadJSON('bag'), undefined);
	const real = globalThis.localStorage;
	globalThis.localStorage = { getItem() { throw new Error('private'); }, setItem() { throw new Error('full'); } };
	assert.equal(readJSON('anything'), undefined);
	assert.doesNotThrow(() => save.saveText('seen', '2'));
	globalThis.localStorage = real;
});

test('day and night: told the palette on start and whenever the site clock changes', () => {
	const clock = createDayNight({ day: 'sun', night: 'moon' });
	const told = [];
	clock.on((p) => told.push(p));
	assert.deepEqual(told, [], 'nothing until it starts');
	clock.start();
	document.documentElement.dataset.time = 'night';
	fire('site-time');
	const stop = clock.on((p) => told.push('late ' + p));
	assert.deepEqual(told, ['sun', 'moon', 'late moon']);
	stop();
	document.documentElement.dataset.time = 'day';
	fire('site-time');
	assert.deepEqual(told, ['sun', 'moon', 'late moon', 'sun']);
	assert.equal(clock.current, 'sun');
	clock.dispose();
	fire('site-time');
	assert.equal(told.length, 4);
});

test('inventory: stacks to slots, kept where it says, and wary of what it reads back', () => {
	let saved = [['fish-moon', 2], ['bad', -1], 'junk', ['seed', 1.7]];
	const bag = createInventory({
		slots: 2, kinds: { fish: 'Fish', seed: 'Seed' },
		store: { load: () => saved, save: (s) => (saved = s) },
		grid: null, detail: null, summary: null,
	});
	assert.deepEqual(bag.entries(), [['fish-moon', 2], ['seed', 1]]);
	assert.equal(bag.fits('turnip'), false, 'both slots are taken');
	assert.equal(bag.add('turnip'), false);
	assert.equal(bag.add('seed', 3), true);
	assert.equal(bag.count('seed'), 4);
	assert.equal(bag.remove('fish-moon', 3), false);
	assert.equal(bag.remove('fish-moon', 2), true);
	assert.deepEqual(saved, [['seed', 4]]);
	assert.equal(bag.add('turnip'), true);
	bag.register({ id: 'turnip', name: 'Turnip', kind: 'seed', description: '', color: '#fff' });
	assert.equal(bag.def('turnip').name, 'Turnip');
});

test('talk: keys go to the conversation only while someone is talking', () => {
	const keys = createKeyRouter();
	const talk = createTalk(new THREE.PerspectiveCamera(), { talk: { hidden: true, setAttribute() {} }, name: null, text: null, choices: null, bubble: null });
	let ran = '';
	keys.intercept(() => { ran += 'menu '; return true; });
	talk.keysFor(keys, 90);
	const key = (k) => keys.route.intercept(k, { repeat: false, preventDefault() {} });
	key('m');
	assert.equal(ran, 'menu ');
	let closed = 0;
	assert.equal(talk.open({ name: 'Pebble', color: '#fc9', onClose: () => closed++ }), true);
	talk.say('Hello!', [{ label: 'Hi', run: () => (ran += 'hi ') }]);
	key('m');
	assert.equal(ran, 'menu ', 'the menu never hears it');
	key('enter'); // hurries the words along
	key('enter'); // picks the choice
	assert.equal(ran, 'menu hi ');
	key('escape');
	assert.equal(talk.talking, false);
	assert.equal(closed, 1);
	key('m');
	assert.equal(ran, 'menu hi menu ');
});

test('lang: Korean particles', () => {
	assert.equal(josa('당근', '이', '가'), '당근이');
	assert.equal(josa('순무', '이', '가'), '순무가');
	assert.equal(josa('Pebble', '과', '와'), 'Pebble와');
	assert.equal(pick({ en: 'hi', ko: '안녕' }), 'hi');
});
