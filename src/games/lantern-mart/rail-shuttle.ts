/** One source of truth for the moving body, platform doors and passenger position. */
export const RAIL = {
	z: 62.2, floor: .45*1.27, halfLength: 6.12*1.19, halfDepth: 1.42*1.46, roof: 3.10*1.27,
	carScale: {x:1.19,y:1.27,z:1.46},
	trackMin: -153, trackMax: 54,
	platformZ: 59.25, dwell: 14, travel: 29, doorSeconds: .85,
} as const;
export const RAIL_STOPS = [
	{ x: 29.5, ko: '등불역', en: 'Lantern Station' },
	{ x: -128, ko: '물빛시장 건너편 정류장', en: 'Moonwater West' },
] as const;

type Direction = 0 | 1;
export type RailPose = { x:number; door:number; stop:Direction|null; stopped:boolean };
type GroundedPoint = { x:number; y:number; z:number; grounded:boolean };
type Vector = { x:number; y:number; z:number };
export type RailAction = 'board' | 'leave' | 'sit' | 'stand';
const SEAT_X = [-4.10,-2.51,2.51,4.10].map(x=>x*RAIL.carScale.x);
const BENCH_HALF_LENGTH = .745*RAIL.carScale.x;
const BENCH_EDGE = (.897-.285)*RAIL.carScale.z;
export const CABIN = {
	halfLength:5.73*RAIL.carScale.x,
	halfWidth:1.11*RAIL.carScale.z,
	seatHeight:(.865-.45)*RAIL.carScale.y,
} as const;
export type CabinSeat = {x:number;z:number;heading:number;side:number};
export const CABIN_SEATS: readonly CabinSeat[] = [-1,1].flatMap(side=>SEAT_X.map(x=>({
	x,z:side*.897*RAIL.carScale.z,heading:side>0?Math.PI:0,side,
})));
const clamp = (v:number,limit:number) => Math.max(-limit,Math.min(limit,v));
export const insideCabin = (pose:RailPose,x:number,z:number) =>
	Math.abs(x-pose.x)<=CABIN.halfLength && Math.abs(z-RAIL.z)<=CABIN.halfWidth;
export function keepInCabin(pose:RailPose,p:Vector,rad:number,v:Vector) {
	// Both the cabin and its four bench pairs live in the moving car's local frame.
	let x = p.x-pose.x, z = p.z-RAIL.z;
	const safeX=clamp(x,CABIN.halfLength-rad),safeZ=clamp(z,CABIN.halfWidth-rad);
	if(safeX!==x && Math.sign(v.x)===Math.sign(x))v.x=0;
	if(safeZ!==z && Math.sign(v.z)===Math.sign(z))v.z=0;
	x=safeX;z=safeZ;
	if(SEAT_X.some(b=>Math.abs(x-b)<BENCH_HALF_LENGTH+rad)&&Math.abs(z)>BENCH_EDGE-rad){
		const side=Math.sign(z);
		z=side*(BENCH_EDGE-rad);
		if(v.z*side>0)v.z=0;
	}
	p.x=pose.x+x;p.z=RAIL.z+z;
}

const half = RAIL.dwell + RAIL.travel;
const cycle = half * 2;
const unit = (t:number) => Math.max(0, Math.min(1, t));
const smooth = (u:number) => u*u*(3-2*u);

/** Dwell + acceleration/braking in both directions. There is no hidden respawn or jump. */
export function railPose(time:number): RailPose {
	const t = ((time % cycle) + cycle) % cycle;
	const direction:Direction = t < half ? 0 : 1;
	const local = t - half*direction;
	const a = RAIL_STOPS[direction].x, b = RAIL_STOPS[1-direction].x;
	if (local < RAIL.dwell) {
		const open = Math.min(unit(local/RAIL.doorSeconds), unit((RAIL.dwell-local)/RAIL.doorSeconds));
		return {x:a, door:smooth(open), stop:direction, stopped:true};
	}
	const s = smooth(unit((local - RAIL.dwell) / RAIL.travel));
	return {x:a+(b-a)*s, door:0, stop:null, stopped:false};
}

export function railPlatformAction(pose:RailPose, riding:boolean, p:GroundedPoint): RailAction|null {
	if (!pose.stopped || pose.stop === null || pose.door < .995) return null;
	if (riding) return p.grounded && insideCabin(pose,p.x,p.z) && Math.abs(p.x-pose.x)<=1.3 && p.z<RAIL.z-.23 ? 'leave' : null;
	if (!p.grounded || Math.abs(p.y) > .24) return null;
	return Math.abs(p.x-pose.x) <= 1.35 && Math.abs(p.z-RAIL.platformZ) <= 1.15 && p.z < RAIL.z-RAIL.halfDepth
		? 'board' : null;
}

/** Push to the nearest side (not along the moving rail) if she has wandered onto it. */
export function clearRailcar(pose:RailPose, p:Vector, radius:number, velocity:Vector) {
	if (p.y >= RAIL.roof || p.y + 1.7 <= .13 ||
		Math.abs(p.x-pose.x) >= RAIL.halfLength + radius ||
		Math.abs(p.z-RAIL.z) >= RAIL.halfDepth + radius) return false;
	const side = p.z <= RAIL.z ? -1 : 1;
	p.z = RAIL.z + side*(RAIL.halfDepth+radius);
	if(velocity.z*side<0)velocity.z=0;
	return true;
}

export function createRailShuttle() {
	let pose=railPose(0);
	let riding=false;
	let seated:CabinSeat|null=null;
	function nearbySeat(p:GroundedPoint) {
		if(!p.grounded || Math.abs(p.z-RAIL.z)<.19)return null;
		let closest:CabinSeat|null=null, reach=1.20;
		for(const seat of CABIN_SEATS){
			const dist=Math.hypot(p.x-pose.x-seat.x,p.z-RAIL.z-seat.z);
			if(dist<reach){reach=dist;closest=seat;}
		}
		return closest;
	}
	function action(p:GroundedPoint):RailAction|null {
		if(seated)return 'stand';
		const platform=railPlatformAction(pose,riding,p);
		if(platform)return platform;
		return riding&&nearbySeat(p)?'sit':null;
	}
	return {
		get pose(){return pose;},
		get riding(){return riding;},
		get seated(){return seated;},
		update(time:number){ pose=railPose(time);return pose; },
		action,
		interact(p:GroundedPoint){
			const next=action(p);
			if(next==='board')riding=true;
			if(next==='leave')riding=false;
			if(next==='sit')seated=nearbySeat(p);
			if(next==='stand')seated=null;
			return next;
		},
		seatPoint(seat:CabinSeat){return {x:pose.x+seat.x,y:RAIL.floor,z:RAIL.z+seat.z};},
		standingPoint(seat:CabinSeat){return {x:pose.x+seat.x,y:RAIL.floor,z:RAIL.z+seat.side*.27};},
		boardingPoint(){ return {x:pose.x,y:RAIL.floor,z:RAIL.z-.38}; },
		platformPoint(){ return {x:pose.x,y:0,z:RAIL.platformZ}; },
	};
}
