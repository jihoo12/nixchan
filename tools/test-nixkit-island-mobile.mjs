import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({resolve(specifier, ctx, next) {
	if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', ctx);
	return next(specifier, ctx);
}});
const { islandQuality } = await import('../src/lib/island/quality.ts');
const { createControls, createKeyRouter } = await import('../src/lib/nixkit/controls.ts');
const { createInteractions } = await import('../src/lib/nixkit/interact.ts');

test('small phone quality reduces target and antialiasing; desktop and explicit overrides are preserved', () => {
	assert.deepEqual(islandQuality(true, true, null), { maxPixelRatio: 1.25, antialias: false });
	assert.deepEqual(islandQuality(false, true, null), { maxPixelRatio: 1.75, antialias: true });
	assert.deepEqual(islandQuality(true, false, null), { maxPixelRatio: 1.75, antialias: true });
	assert.deepEqual(islandQuality(true, true, 'high'), { maxPixelRatio: 1.75, antialias: true });
	assert.deepEqual(islandQuality(false, false, 'low'), { maxPixelRatio: 1.25, antialias: false });
	assert.deepEqual(islandQuality(true, true, 'other'), islandQuality(true, true, null));
});

const pointer = (type, pointerId, clientX = 0, clientY = 0) =>
	Object.assign(new Event(type, { cancelable: true }), { pointerId, clientX, clientY, pointerType: 'touch' });

test('a second movement finger cannot steal the stick, while aiming remains independent', (t) => {
	const originalAdd = globalThis.addEventListener;
	const originalDocument = globalThis.document;
	t.after(() => {
		globalThis.addEventListener = originalAdd;
		globalThis.document = originalDocument;
	});
	const window = new EventTarget();
	const document = new EventTarget();
	globalThis.addEventListener = window.addEventListener.bind(window);
	globalThis.document = document;

	const canvas = new EventTarget();
	const capt = new Set();
	canvas.getBoundingClientRect = () => ({ left: 20, width: 350 });
	canvas.setPointerCapture = (id) => capt.add(id);
	canvas.hasPointerCapture = (id) => capt.has(id);
	canvas.releasePointerCapture = (id) => capt.delete(id);
	const ui = { stick: { hidden: true, style: {} }, knob: { style: {} }, jump: new EventTarget() };
	const orbit = { yaw: 0, pitch: 0, distance: 6 };
	const keys = createKeyRouter();
	let blurred = 0;
	keys.blur(() => blurred++);
	const ctrl = createControls(canvas, ui, orbit, keys.route);
	canvas.dispatchEvent(pointer('pointerdown', 1, 50, 210));
	canvas.dispatchEvent(pointer('pointermove', 1, 50, 175));
	assert.ok(ctrl.move().forward > 0);
	assert.equal(ui.stick.hidden, false);
	canvas.dispatchEvent(pointer('pointerdown', 2, 70, 210));
	canvas.dispatchEvent(pointer('pointermove', 2, 10, 210));
	canvas.dispatchEvent(pointer('pointerup', 2));
	assert.ok(!capt.has(2));
	assert.ok(ctrl.move().forward > 0);
	canvas.dispatchEvent(pointer('pointerdown', 3, 270, 200));
	canvas.dispatchEvent(pointer('pointermove', 3, 310, 180));
	assert.notEqual(orbit.yaw, 0);
	assert.ok(ctrl.move().forward > 0);

	canvas.dispatchEvent(pointer('lostpointercapture', 1));
	assert.deepEqual(ctrl.move(), { forward: 0, right: 0, running: false });
	assert.equal(ui.stick.hidden, true);
	const yaw = orbit.yaw;
	canvas.dispatchEvent(pointer('pointermove', 3, 330, 180));
	assert.notEqual(orbit.yaw, yaw, 'moving thumb release must not stop camera thumb');

	ui.jump.dispatchEvent(pointer('pointerdown', 4));
	assert.equal(ctrl.state.jumpQueued, true);
	document.hidden = true;
	document.dispatchEvent(new Event('visibilitychange'));
	assert.equal(blurred, 1);
	assert.equal(ctrl.state.jumpQueued, false);
	assert.equal(capt.has(3), false);
	const afterBlur = orbit.yaw;
	canvas.dispatchEvent(pointer('pointermove', 3, 350, 180));
	assert.equal(orbit.yaw, afterBlur);
});

test('steady action offer does not replace visible button/prompt text every frame', (t) => {
	const originalDocument = globalThis.document;
	t.after(() => { globalThis.document = originalDocument; });
	const tracked = () => {
		let value = '', writes = 0;
		return {
			get textContent() { return value; },
			set textContent(next) { value = next; writes++; },
			get writes() { return writes; },
		};
	};
	const attr = new Map();
	const button = Object.create(tracked());
	Object.assign(button, {
		hidden: true,
		addEventListener() {},
		getAttribute: (n) => attr.get(n) ?? null,
		setAttribute: (n, v) => attr.set(n, v),
	});
	const text = tracked();
	const prompt = { toggleAttribute() {}, classList: { toggle() {} } };
	globalThis.document = { querySelector: (s) => ({ '[data-act]': button, '[data-act-text]': text, '[data-act-prompt]': prompt })[s] };
	let label = 'Place block';
	const interactions = createInteractions();
	interactions.add(() => ({ label, go() {} }));
	interactions.update();
	interactions.update();
	assert.equal(button.writes, 1);
	assert.equal(text.writes, 1);
	assert.equal(attr.get('aria-label'), label);
	assert.equal(button.textContent, 'Place');
	label = 'Place belt';
	interactions.update();
	assert.equal(button.writes, 1, 'unchanged verb is stable');
	assert.equal(text.writes, 2);
	assert.equal(attr.get('aria-label'), label, 'screen reader still gets the precise action');
});
