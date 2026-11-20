import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { Vector3 } from 'three';

registerHooks({ resolve(specifier, context, next) {
	return next(specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { createChairs } = await import('../src/lib/nixkit/chairs.ts');

function setup({ at = [0, .6, 0], facing = 0, stand, reach, world = {}, ...hooks } = {}) {
	const p = { pos: new Vector3(0, 0, .9), vel: new Vector3(), root: { position: new Vector3() },
		grounded:true, dashing:false, heading:0, face(angle) { this.heading = angle; } };
	const controller = createChairs({ world: {
		inside: () => true, groundAt: () => 0, ceilingAt: () => Infinity, nearby: () => [], ...world,
	}, player: () => p, ...hooks });
	controller.add({ at, facing, stand, reach });
	return { p, controller };
}

test('fixed chair pins the feet, clears motion and exits to the stand point repeatedly', () => {
	const { p, controller } = setup();
	for (let i=0;i<3;i++) {
		assert.equal(controller.action(),'sit');
		p.vel.set(1,2,3);
		assert.equal(controller.interact(),true);
		assert.equal(controller.seated,true);
		assert.equal(controller.heading,0);
		assert.equal(controller.lift,.6);
		assert.deepEqual(p.pos.toArray(),[0,0,0]);
		assert.deepEqual(p.vel.toArray(),[0,0,0]);
		p.pos.x = 5;
		controller.pin();
		assert.deepEqual(p.pos.toArray(),[0,0,0]);
		assert.deepEqual(p.root.position.toArray(),[0,0,0]);
		assert.equal(controller.action(),'stand');
		assert.equal(controller.interact(),true);
		assert.equal(controller.seated,false);
		assert.equal(controller.lift,0);
		assert.equal(controller.heading,null);
		assert.deepEqual(p.pos.toArray(),[0,0,.9]);
	}
});

test('arbitrary facing and explicit stand side are distinct; lift uses world-space ground', () => {
	const facing = Math.PI/3;
	const { p, controller } = setup({ at:[0,2.58,0], facing, stand:[-.84,0], world:{groundAt:()=>2} });
	p.pos.set(.72,2,.42);
	assert.equal(controller.action(),null);
	p.pos.set(-.84,2,0);
	assert.equal(controller.interact(),true);
	assert.equal(p.heading,facing);
	assert.equal(controller.lift,2.58-2);
	assert.equal(controller.interact(),true);
	assert.deepEqual(p.pos.toArray(),[-.84,2,0]);
	const rotated=setup({ facing });
	rotated.p.pos.set(.9*Math.sin(facing),0,.9*Math.cos(facing));
	assert.equal(rotated.controller.interact(),true);
	assert.equal(rotated.controller.interact(),true);
	assert.deepEqual(rotated.p.pos.toArray(),[.9*Math.sin(facing),0,.9*Math.cos(facing)]);
});

test('a barrier on the approach and leaving the map both prevent chair teleportation', () => {
	const { p, controller } = setup({ reach:2, world:{ collide(probe,r) { assert.equal(r,.45); if (probe.z>1.03 && probe.z<1.3) probe.z=1.31; } } });
	p.pos.z=1.62;
	assert.equal(controller.action(),null);
	assert.equal(controller.interact(),false);
	const cliff=setup({ world:{ inside:(_x,z)=>z<.8 } });
	cliff.p.pos.z=.79;
	assert.equal(cliff.controller.interact(),false);
});

test('stand is revalidated; availability never traps an already seated visitor', () => {
	let blocked=false, available=true;
	const { p, controller } = setup({ available:()=>available, clear:()=>!blocked });
	assert.equal(controller.interact(),true);
	blocked=true;
	assert.equal(controller.action(),null);
	assert.equal(controller.interact(),false);
	assert.equal(controller.seated,true);
	assert.deepEqual(p.pos.toArray(),[0,0,0]);
	blocked=false;
	available=false;
	assert.equal(controller.interact(),true);
	assert.equal(controller.action(),null);
});

test('rejects airborne, dashing, underwater and low-clearance boarding; reset preserves chairs', () => {
	const { p, controller } = setup();
	p.grounded=false;
	assert.equal(controller.action(),null);
	p.grounded=true; p.dashing=true;
	assert.equal(controller.action(),null);
	p.dashing=false;
	assert.equal(controller.interact(),true);
	p.pos.set(0,0,.9);
	controller.reset(); controller.pin();
	assert.deepEqual(p.pos.toArray(),[0,0,.9]);
	assert.equal(controller.action(),'sit');
	for (const world of [{ceilingAt:()=>1.3},{wadeDepth:()=>.8},{groundAt:()=>-Infinity}]) {
		assert.equal(setup({world}).controller.action(),null);
	}
});
