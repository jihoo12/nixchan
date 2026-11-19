import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { aimFirstPerson, createViewMode } from '../src/lib/nixkit/view-mode.ts';

test('defaults to third person; a temporary override neither toggles nor clears the choice', () => {
	const view = createViewMode();
	assert.equal(view.active, false);
	assert.equal(view.resolve(false), false);
	assert.equal(view.toggle(true), false);
	assert.equal(view.toggle(false), true);
	assert.equal(view.resolve(false), true);
	assert.equal(view.resolve(true), false);
	assert.equal(view.toggle(true), true);
	assert.equal(view.active, true);
	assert.equal(view.resolve(false), true);
	assert.equal(view.toggle(false), false);
	assert.equal(view.resolve(false), false);
	assert.equal(createViewMode().active, false);
});

test('eye tracks feet and direction follows movement yaw and orbit pitch without changing projection', () => {
	const feet = new Vector3(6, 0.75, -3);
	const camera = new PerspectiveCamera(53, 2, 0.09, 425);
	const projection = camera.projectionMatrix.clone();
	const direction = () => camera.getWorldDirection(new Vector3());
	const equalDirection = (x, y, z) => assert.ok(direction().distanceTo(new Vector3(x, y, z)) < 1e-10);

	aimFirstPerson(camera, feet, 0, 0);
	assert.deepEqual(camera.position.toArray(), [6, 2.3, -3]);
	equalDirection(0, 0, -1);

	aimFirstPerson(camera, feet, -Math.PI / 2, Math.PI / 6, 0.9);
	assert.ok(camera.position.distanceTo(new Vector3(6, 1.65, -3)) < 1e-10);
	equalDirection(Math.sqrt(3) / 2, -0.5, 0);

	feet.set(-2, -0.3, 7);
	aimFirstPerson(camera, feet, Math.PI, -Math.PI / 6);
	assert.deepEqual(camera.position.toArray(), [-2, 1.25, 7]);
	equalDirection(0, 0.5, Math.sqrt(3) / 2);
	assert.ok(camera.projectionMatrix.equals(projection));
	assert.equal(camera.fov, 53);
	assert.equal(camera.near, 0.09);
	assert.equal(camera.far, 425);
	assert.deepEqual(feet.toArray(), [-2, -0.3, 7]);
});
