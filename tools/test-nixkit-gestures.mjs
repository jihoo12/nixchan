import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { GESTURE_SECONDS, sampleGesture, createGestureLayer } from '../src/lib/nixkit/gestures.ts';

test('all four cues have finite bounded poses and neutral endpoints', () => {
	for (const [name, seconds] of Object.entries(GESTURE_SECONDS)) {
		for (const time of [-1, 0, seconds, seconds + 1, NaN, Infinity])
			assert.deepEqual(sampleGesture(name, time), { lift: 0, bones: {} });
		for (let t = 0; t < seconds; t += 0.01) {
			const pose = sampleGesture(name, t);
			assert.ok(Number.isFinite(pose.lift) && pose.lift >= 0 && pose.lift <= 0.18);
			for (const angle of Object.values(pose.bones).flat())
				assert.ok(Number.isFinite(angle) && Math.abs(angle) <= 1.2);
		}
	}
	assert.ok(sampleGesture('happy', 0.42).lift > 0.17);
	assert.ok(sampleGesture('determined', 0.4).bones.UpperArmR[0] < -0.7);
	assert.ok(sampleGesture('sad', 0.5).bones.Chest[0] > 0);
	assert.ok(sampleGesture('surprised', 0.15).bones.Chest[0] < 0);
});

const rig = () => {
	const group = new THREE.Group();
	group.position.set(2, 3, 4);
	const nodes = new Map(['Chest', 'Head', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'HandR'].map(n => {
		const node = new THREE.Object3D();
		node.rotation.set(0.1, 0.2, 0.3);
		group.add(node);
		return [n, node];
	}));
	const layer = createGestureLayer({ group, node: name => nodes.get(name) ?? null });
	return { group, nodes, layer };
};

test('restore returns exactly to mixer pose without touching parent physics or accumulating', () => {
	const { group, nodes, layer } = rig();
	const physics = new THREE.Group();
	physics.position.set(9, 8, 7);
	physics.add(group);
	const original = nodes.get('Chest').quaternion.clone();
	assert.equal(layer.play('happy'), 1.1);
	for (let i = 0; i < 110; i++) {
		layer.restore();
		assert.deepEqual(group.position.toArray(), [2, 3, 4]);
		assert.ok(nodes.get('Chest').quaternion.equals(original));
		layer.tick(0.01);
		assert.deepEqual(physics.position.toArray(), [9, 8, 7]);
	}
	layer.clear();
	assert.equal(layer.active, false);
	assert.deepEqual(group.position.toArray(), [2, 3, 4]);
	assert.ok(nodes.get('Chest').quaternion.equals(original));
});

test('interruptions, replacement, and completion clear all offsets immediately', () => {
	const { group, nodes, layer } = rig();
	const original = nodes.get('Chest').quaternion.clone();
	layer.play('happy'); layer.tick(0.42);
	assert.ok(group.position.y > 3);
	layer.play('sad');
	assert.deepEqual(group.position.toArray(), [2, 3, 4]);
	assert.ok(nodes.get('Chest').quaternion.equals(original));
	layer.tick(0.5);
	layer.tick(0, false); // first person, reduced motion, motion, wave, or held activity
	assert.equal(layer.active, false);
	assert.ok(nodes.get('Chest').quaternion.equals(original));
	layer.play('determined'); layer.tick(10);
	assert.equal(layer.active, false);
	assert.ok(nodes.get('Chest').quaternion.equals(original));
	assert.equal(layer.play('invalid'), 0);
});

test('time partitioning, invalid dt and unavailable rig are safe', () => {
	const a = rig(), b = rig();
	a.layer.play('happy'); b.layer.play('happy');
	a.layer.tick(0.4);
	for (let i = 0; i < 4; i++) { b.layer.restore(); b.layer.tick(0.1); }
	assert.ok(a.group.position.distanceTo(b.group.position) < 1e-12);
	assert.ok(a.nodes.get('Chest').quaternion.angleTo(b.nodes.get('Chest').quaternion) < 1e-7);
	b.layer.restore(); b.layer.tick(NaN); b.layer.tick(-1);
	assert.deepEqual(b.group.position.toArray(), [2, 3, 4]);
	const empty = createGestureLayer({ group: new THREE.Group(), node: () => null });
	empty.play('sad'); empty.tick(0.2); empty.clear();
	assert.equal(empty.active, false);
});
