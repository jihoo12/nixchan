import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const hook = registerHooks({ resolve(specifier, ctx, next) {
	if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', ctx);
	return next(specifier, ctx);
} });
const { BUILD_ITEMS, createBuildMode } = await import('../src/lib/island/build-mode.ts');
const { createInteractions } = await import('../src/lib/nixkit/interact.ts');
hook.deregister();

test('B opens one palette; choice never installs and every category uses the same placement/removal hooks', () => {
	const log = [];
	let canBuild = true;
	const mode = createBuildMode({
		canBuild: () => canBuild,
		putAway: () => log.push('put away'),
		choose: (item) => log.push('choose ' + item),
		placement: (item) => ({ label: 'Place', go: () => log.push('place ' + item) }),
		take: (item) => log.push('remove ' + item),
	});
	assert.equal(mode.offer(), undefined);
	mode.togglePicker();
	assert.ok(mode.busy);
	assert.equal(mode.selected, null);
	assert.equal(mode.offer(), null, 'the chooser pauses world actions without an extra HUD hint');
	for (const item of BUILD_ITEMS) {
		const before = log.length;
		mode.select(item);
		assert.deepEqual(log.slice(before), ['put away', 'choose ' + item]);
		assert.ok(!mode.pickerOpen, 'selecting folds the chooser');
		assert.equal(mode.selected, item);
		mode.offer().go();
		mode.remove();
		assert.deepEqual(log.slice(-2), ['place ' + item, 'remove ' + item]);
	}
	canBuild = false;
	assert.equal(mode.offer().go, undefined);
	mode.remove();
	assert.equal(log.at(-1), 'remove ore-hopper');
	mode.finish();
	assert.equal(mode.offer(), undefined);
	assert.equal(mode.select('belt'), false);
	assert.ok(!mode.busy, 'a modal, swim or unsupported ground cannot start building');
});

test('fresh E and touch never fall through to a cached normal action or an old build item', (t) => {
	const prev = globalThis.document;
	const touch = new EventTarget();
	globalThis.document = { querySelector: (sel) => sel === '[data-act]' ? touch : null };
	// For refresh/update: the same button the live page binds pointerdown to.
	t.after(() => { globalThis.document = prev; });

	const log = [];
	let valid = true;
	const mode = createBuildMode({
		canBuild: () => true, putAway() {}, choose() {},
		placement: (item) => valid ? { label: 'Place', go: () => log.push(item) } : null,
		take: (item) => log.push('remove ' + item),
	});
	const interactions = createInteractions({ override: mode.offer });
	interactions.add(() => ({ label: 'Talk', go: () => log.push('talk') }));
	interactions.update();
	mode.togglePicker();
	assert.equal(interactions.press(), false, 'no selected item: no old talk or placement');
	assert.deepEqual(log, []);
	mode.select('windmill');
	interactions.update();
	mode.select('sprinkler');
	touch.dispatchEvent(new Event('pointerdown', { cancelable: true }));
	assert.deepEqual(log, ['sprinkler'], 'touch resolves the new selection before rendering another frame');
	valid = false;
	assert.equal(interactions.press(), false, 'blocked installation does not talk or remove');
	assert.deepEqual(log, ['sprinkler']);
	mode.finish();
	assert.equal(interactions.press(), true);
	assert.deepEqual(log, ['sprinkler', 'talk']);
});

test('reopen or fold the chooser without putting the piece away; Done/Esc explicitly ends placement', () => {
	const events = [];
	let allowed = true;
	const mode = createBuildMode({
		canBuild: () => allowed,
		putAway: () => events.push('put away'),
		choose: (item) => events.push('equip ' + item),
		placement: (item) => ({ label: 'Place', go: () => events.push('place ' + item) }),
		take: (item) => events.push('take ' + item),
	});
	mode.togglePicker();
	mode.closePicker();
	assert.equal(mode.offer(), undefined, 'cancelling the empty chooser arms nothing');
	mode.togglePicker();
	mode.select('belt');
	mode.offer().go();
	mode.offer().go();
	mode.togglePicker();
	assert.equal(mode.selected, 'belt');
	assert.equal(mode.offer(), null);
	mode.remove();
	assert.deepEqual(events, ['put away', 'equip belt', 'place belt', 'place belt']);
	mode.togglePicker();
	assert.equal(mode.selected, 'belt');
	mode.offer().go();
	mode.remove();
	mode.togglePicker();
	mode.select('belt');
	assert.equal(events.filter((entry) => entry === 'equip belt').length, 1);
	allowed = false;
	assert.equal(mode.offer().go, undefined);
	allowed = true;
	mode.offer().go();
	mode.finish();
	mode.finish();
	assert.equal(mode.selected, null);
	assert.equal(mode.pickerOpen, false);
	assert.equal(mode.busy, false);
	assert.equal(mode.offer(), undefined);
	assert.deepEqual(events.slice(-4), ['place belt', 'take belt', 'place belt', 'put away']);
});
