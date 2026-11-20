import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CABIN, CABIN_BENCH, CABIN_SEATS, cabinView, clearRailcar, createRailShuttle, insideCabin, keepInCabin, railPose, RAIL, RAIL_STOPS } from '../src/games/lantern-mart/rail-shuttle.ts';

const half=RAIL.dwell+RAIL.travel;
const east={x:RAIL_STOPS[0].x,z:RAIL.platformZ,y:0,grounded:true};
const west={...east,x:RAIL_STOPS[1].x};

test('the long route fits the taller, wider single coach and leaves the east crossing clear', () => {
	assert.ok(RAIL.halfLength*2<16);
	assert.ok(RAIL.halfDepth*2>4);
	assert.ok(RAIL.roof>3.8);
	assert.ok(RAIL_STOPS[0].x-RAIL_STOPS[1].x>150);
	for (const stop of RAIL_STOPS) {
		assert.ok(stop.x-RAIL.halfLength>=RAIL.trackMin);
		assert.ok(stop.x+RAIL.halfLength<=RAIL.trackMax);
	}
	assert.ok(RAIL_STOPS[0].x+RAIL.halfLength+.45<53.5);
});

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
	assert.deepEqual(s.boardingPoint(),{x:east.x,y:RAIL.floor,z:RAIL.z-.38});
	s.update(RAIL.dwell+RAIL.travel/2);
	assert.equal(s.interact(east),null);
	assert.equal(s.boardingPoint().x,(east.x+west.x)/2);
	assert.equal(s.riding,true);
	s.update(half+2);
	assert.equal(s.boardingPoint().x,west.x);
	assert.equal(s.interact(west),null, 'must actually be at the cabin door');
	assert.equal(s.interact({...s.boardingPoint(),grounded:true}),'leave');
	assert.equal(s.riding,false);
	assert.deepEqual(s.platformPoint(),{x:west.x,y:0,z:RAIL.platformZ});
	assert.equal(s.interact(west),'board');
	s.update(2*half+2);
	assert.equal(s.interact({...s.boardingPoint(),grounded:true}),'leave');
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

test('walkable cabin, bench collision, and sitting follow the train instead of the boarding spot', () => {
	const s=createRailShuttle();
	s.update(2);
	assert.equal(s.interact(east),'board');
	s.update(RAIL.dwell+RAIL.travel/2);
	const p={...s.boardingPoint(),x:s.pose.x+CABIN_SEATS[0].x,grounded:true};
	const v={x:0,y:0,z:-3};
	p.z=RAIL.z-.86;
	keepInCabin(s.pose,p,.45,v);
	assert.equal(v.z,0);
	assert.ok(Math.abs(p.z-RAIL.z)<.5);
	assert.equal(s.interact(p),'sit');
	const seat=s.seated;
	assert.ok(seat);
	assert.ok(CABIN.seatHeight>.5);
	s.update(half+2);
	const at=s.seatPoint(seat);
	assert.ok(insideCabin(s.pose,at.x,at.z));
	assert.equal(at.x,RAIL_STOPS[1].x+seat.x);
	assert.equal(s.interact({...at,grounded:true}),'stand');
	assert.equal(s.seated,null);
	const stand=s.standingPoint(seat);
	assert.equal(s.action({...stand,grounded:true}),'sit', 'no remote exit from the seat');
	assert.equal(s.interact({...s.boardingPoint(),grounded:true}),'leave');
});

test('train sitting uses the cushion front edge and the camera remains on the aisle side', () => {
	const pose=railPose(2);
	for (const seat of CABIN_SEATS) {
		assert.ok(Math.abs(Math.abs(seat.z)-CABIN_BENCH.front*RAIL.carScale.z)<1e-6);
		const eye={x:pose.x+seat.x,y:RAIL.floor+CABIN.seatHeight+.78,z:RAIL.z+seat.z};
		for (let i=0;i<36;i++) {
			const camera=cabinView(pose,eye,i*Math.PI/18,.23,seat.side);
			assert.ok(insideCabin(pose,camera.x,camera.z));
			assert.ok((camera.z-eye.z)*seat.side < -1.85);
			assert.ok(Math.hypot(camera.x-eye.x,camera.z-eye.z)>2.4);
		}
	}
});
