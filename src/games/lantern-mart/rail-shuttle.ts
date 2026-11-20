/** One source of truth for the moving body, platform doors and passenger position. */
export const RAIL = {
	z: 62.2, floor: .45*1.16, halfLength: 14.9+6.12*1.19, halfDepth: 1.42*1.13, roof: 3.10*1.16,
	carOffsets: [-14.9, 0, 14.9] as const, carScale: {x:1.19,y:1.16,z:1.13},
	trackMin: -153, trackMax: 54,
	platformZ: 59.85, dwell: 14, travel: 29, doorSeconds: .85,
} as const;
export const RAIL_STOPS = [
	{ x: 29.5, ko: '등불역', en: 'Lantern Station' },
	{ x: -128, ko: '물빛시장 건너편 정류장', en: 'Moonwater West' },
] as const;

type Direction = 0 | 1;
export type RailPose = { x:number; door:number; stop:Direction|null; stopped:boolean };
type GroundedPoint = { x:number; y:number; z:number; grounded:boolean };
type Vector = { x:number; y:number; z:number };
export type RailAction = 'board' | 'leave';
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
	if (riding) return 'leave';
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
	return {
		get pose(){return pose;},
		get riding(){return riding;},
		update(time:number){ pose=railPose(time);return pose; },
		action(p:GroundedPoint){ return railPlatformAction(pose,riding,p); },
		interact(p:GroundedPoint){
			const action=railPlatformAction(pose,riding,p);
			if(action)riding=action==='board';
			return action;
		},
		boardingPoint(){ return {x:pose.x,y:RAIL.floor,z:RAIL.z-.05}; },
		platformPoint(){ return {x:pose.x,y:0,z:RAIL.platformZ}; },
	};
}
