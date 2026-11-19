import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { GESTURE_SECONDS, sampleGesture, createGestureLayer } from '../src/lib/nixkit/gestures.ts';

test('dance has eight alternating readable beats and eases to/from neutral', () => {
	assert.equal(GESTURE_SECONDS.dance, 3.6);
	for (let beat = 0; beat < 8; beat++) {
		const pose = sampleGesture('dance', .225 + beat * .45);
		const raised = beat % 2 === 0 ? 'L' : 'R';
		const planted = raised === 'L' ? 'R' : 'L';
		assert.ok(pose.bones['Thigh' + raised][0] < -.2);
		assert.ok(Math.abs(pose.bones['Thigh' + planted][0]) < 1e-12);
		if (beat < 6) assert.ok(pose.bones['UpperArm' + planted][0] < pose.bones['UpperArm' + raised][0]);
		else {
			assert.ok(Math.abs(pose.bones['UpperArmL'][2]) > .5);
			assert.ok(Math.abs(pose.bones['Thigh' + raised][2]) > .18);
		}
		assert.equal(pose.lift, 0);
	}
	for (const t of [0, 3.6, 10, NaN]) assert.deepEqual(sampleGesture('dance', t), { lift: 0, bones: {} });
	for (const t of [.00001, 3.59999])
		assert.ok(Object.values(sampleGesture('dance', t).bones).flat().every(v => Math.abs(v) < 1e-7));
});

function rig() {
	const world = new THREE.Group();
	world.position.set(9, 2, 3); world.rotation.y = .8; world.scale.setScalar(1.7);
	const group = new THREE.Group(); world.add(group);
	group.position.set(0, .12, 0);
	const nodes = new Map();
	for (const [side, sign] of [['L', 1], ['R', -1]]) {
		let parent = group;
		for (const [name, pos] of [['Thigh', [sign * .1, .8, 0]], ['Shin', [0, -.4, 0]], ['Foot', [0, -.4, 0]]]) {
			const node = new THREE.Object3D(); node.position.set(...pos); parent.add(node);
			nodes.set(name + side, node); parent = node;
		}
	}
	return { world, group, nodes, layer: createGestureLayer({ group, node: name => nodes.get(name) ?? null }) };
}
const lowest = nodes => Math.min(...['L', 'R'].map(s => nodes.get('Foot' + s).getWorldPosition(new THREE.Vector3()).y));

test('dance grounds support foot in transformed rigs without moving physical parent, and restores', () => {
	const { world, group, nodes, layer } = rig();
	const floor = lowest(nodes), originalPosition = group.position.clone();
	const physics = world.matrix.clone();
	assert.equal(layer.play('dance'), 3.6);
	let maxGap = 0;
	for (let i = 0; i < 220; i++) {
		layer.restore();
		assert.ok(group.position.equals(originalPosition));
		layer.tick(1 / 60);
		assert.ok(Math.abs(lowest(nodes) - floor) < 1e-10);
		const left = nodes.get('FootL').getWorldPosition(new THREE.Vector3());
		const right = nodes.get('FootR').getWorldPosition(new THREE.Vector3());
		maxGap = Math.max(maxGap, Math.abs(left.y - right.y));
		assert.ok(world.matrix.equals(physics));
	}
	assert.ok(maxGap > .1, 'feet must visibly lift rather than only sway the torso');
	assert.equal(layer.active, false);
	for (const node of nodes.values()) assert.ok(node.quaternion.equals(new THREE.Quaternion()));
	assert.ok(group.position.equals(originalPosition));
});

test('dance interruption/replacement restores leg offsets; missing feet is safe', () => {
	const { group, nodes, layer } = rig();
	const originalPosition = group.position.clone();
	layer.play('dance'); layer.tick(.225);
	layer.play('happy');
	assert.ok(group.position.equals(originalPosition));
	for (const node of nodes.values()) assert.ok(node.quaternion.equals(new THREE.Quaternion()));
	layer.play('dance'); layer.tick(.4); layer.tick(0, false);
	assert.equal(layer.active, false);
	assert.ok(group.position.equals(originalPosition));
	const empty = createGestureLayer({ group: new THREE.Group(), node: () => null });
	empty.play('dance'); empty.tick(.5); empty.clear();
});
