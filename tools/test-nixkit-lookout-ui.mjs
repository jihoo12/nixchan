import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';

// Use the same TS for the interaction as the browser, with no WebGL or DOM dependency.
const hook = registerHooks({
	resolve(specifier, context, next) {
		try { return next(specifier, context); }
		catch (error) {
			if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
			return next(specifier + '.ts', context);
		}
	},
});
const { atLookout, createLookout } = await import('../src/lib/island/lookout.ts');
const { createLookoutCamera } = await import('../src/lib/island/lookout-camera.ts');
hook.deregister();

const site = { stand: new Vector3(3, 2, 5), eye: new Vector3(3, 4, 7), yaw: 0 };
test('offers the view only at the foot of the eyepiece, not above or across the platform', () => {
	assert.ok(atLookout(site, site.stand));
	assert.ok(atLookout(site, new Vector3(3.9, 2, 5)));
	assert.ok(!atLookout(site, new Vector3(3.98, 2, 5)));
	assert.ok(!atLookout(site, new Vector3(3, 2.6, 5)));
});

test('native modal keeps its controls during the return and restores focus without moving the actor', (t) => {
	class Element extends EventTarget {
		isConnected = true;
		focusCount = 0;
		focus() { this.focusCount++; }
		setAttribute() {}
		removeAttribute() {}
		closest(sel) { return sel === 'button' ? this : null; }
	}
	const prev = new Element(), drag = new Element(), close = new Element();
	const zoomIn = new Element();
	zoomIn.dataset = { lookoutZoom: '1' };
	class Dialog extends Element {
		open = false;
		showModal() { this.open = true; }
		close() { this.open = false; this.dispatchEvent(new Event('close')); }
		querySelector(sel) { return { '[data-lookout-drag]': drag, '[data-lookout-exit]': close }[sel] ?? null; }
		querySelectorAll() { return [zoomIn]; }
	}
	const modal = new Dialog();
	t.mock.method(zoomIn, 'setAttribute');
	t.mock.method(modal, 'showModal');
	t.mock.method(modal, 'close');
	const prior = { document: globalThis.document, HTMLElement: globalThis.HTMLElement };
	globalThis.document = { activeElement: prev, querySelector: () => modal };
	globalThis.HTMLElement = Element;
	t.after(() => { Object.assign(globalThis, prior); });

	const position = site.stand.clone(), view = new PerspectiveCamera(45, 1, .5);
	view.position.set(3, 4, 0);
	const camera = createLookoutCamera(view);
	let held = 0, canLook = false;
	const interaction = createLookout({ site, camera, pos: position, canLook: () => canLook, halt: () => held++ });
	assert.equal(interaction.offer(), null);
	canLook = true;
	interaction.offer().go();
	assert.equal(held, 1);
	assert.equal(modal.showModal.mock.callCount(), 1);
	assert.equal(interaction.offer(), null);
	const press = (key, { repeat = false, target = close } = {}) => {
		let prevented = false;
		const captured = interaction.key(key, { target, repeat, preventDefault() { prevented = true; } });
		return [captured, prevented];
	};
	assert.deepEqual(press('tab'), [true, false], 'native Tab works');
	assert.deepEqual(press(' '), [true, false], 'native button activation works');
	assert.deepEqual(press('i'), [true, true], 'bag key cannot leak');
	assert.deepEqual(press('e', { repeat: true }), [true, true], 'held E cannot close the view');
	assert.equal(camera.looking, true);
	for (let i = 0; i < 40; ++i) interaction.update(1/60);
	zoomIn.dispatchEvent(new Event('click'));
	for (let i = 0; i < 25; ++i) interaction.update(1/60);
	assert.ok(view.fov < 30);
	assert.equal(modal.open, true);
	const cancel = new Event('cancel', { cancelable: true });
	modal.dispatchEvent(cancel);
	assert.ok(cancel.defaultPrevented);
	assert.equal(camera.phase, 'exiting');
	assert.equal(modal.open, true, 'no movement leak while returning');
	for (let i = 0; i < 40; ++i) interaction.update(1/60);
	assert.equal(modal.open, false);
	assert.equal(modal.close.mock.callCount(), 1);
	assert.equal(prev.focusCount, 1);
	assert.equal(view.fov, 45);
	assert.equal(interaction.key('w', {}), false);
	assert.ok(position.equals(site.stand));
	assert.equal(held, 3, 'halt at entry, on exit request and at the final handoff');
	interaction.offer().go();
	assert.equal(modal.showModal.mock.callCount(), 2);
	assert.equal(camera.looking, true);
});
