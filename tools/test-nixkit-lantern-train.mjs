import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearRailcar, createRailShuttle, railPose, RAIL, RAIL_STOPS } from '../src/games/lantern-mart/rail-shuttle.ts';

const half=RAIL.dwell+RAIL.travel;
const east={x:RAIL_STOPS[0].x,z:RAIL.platformZ,y:0,grounded:true};
const west={...east,x:RAIL_STOPS[1].x};

test('the shuttle stops twice, closes doors before movement, and loops without jumping', () => {
	for (const [i, stop] of RAIL_STOPS.entries()) {
		const d=i*half;
		assert.equal(railPose(d).x,stop.x);
		assert.equal(railPose(d+2).door,1);
		assert.equal(railPose(d+RAIL.dwell+.001).door,0);
		assert.equal(railPose(d+RAIL.dwell+.001).stop,null);
		const next=(i+1)*half;
		assert.ok(Math.abs(railPose(next-.001).x-railPose(next).x)<.00001);
	}
	assert.deepEqual(railPose(1.5),railPose(2*half+1.5));
});

test('board from the platform only, ride to the other stop, get off and ride back', () => {
	const s=createRailShuttle();
	assert.equal(s.interact(east),null);
	s.update(2);
	for (const wrong of [west,{...east,z:RAIL.z+.1},{...east,y:1},{...east,grounded:false}]) assert.equal(s.interact(wrong),null);
	assert.equal(s.interact(east),'board');
	assert.equal(s.riding,true);
	assert.deepEqual(s.boardingPoint(),{x:east.x,y:RAIL.floor,z:RAIL.z-.05});
	s.update(RAIL.dwell+RAIL.travel/2);
	assert.equal(s.interact(east),null);
	assert.equal(s.boardingPoint().x,(east.x+west.x)/2);
	assert.equal(s.riding,true);
	s.update(half+2);
	assert.equal(s.boardingPoint().x,west.x);
	assert.equal(s.interact(west),'leave');
	assert.equal(s.riding,false);
	assert.deepEqual(s.platformPoint(),{x:west.x,y:0,z:RAIL.platformZ});
	assert.equal(s.interact(west),'board');
	s.update(2*half+2);
	assert.equal(s.interact(east),'leave');
	assert.equal(s.platformPoint().x,east.x);
});

test('only the current railcar position blocks pedestrians, not either empty platform', () => {
	const velocity={x:1,y:0,z:2},p={x:east.x,y:0,z:RAIL.z-1.1};
	assert.equal(clearRailcar(railPose(2),p,.45,velocity),true);
	assert.ok(Math.abs(p.z-(RAIL.z-RAIL.halfDepth-.45))<1e-9);
	assert.equal(velocity.z,0);
	const nowAway={x:east.x,y:0,z:RAIL.z};
	assert.equal(clearRailcar(railPose(half+2),nowAway,.45,velocity),false);
	const platform={...west};
	assert.equal(clearRailcar(railPose(half+2),platform,.45,velocity),false);
});
