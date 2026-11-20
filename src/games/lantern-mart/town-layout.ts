import type { Vector3 } from 'three';
import type { World } from '../../lib/nixkit/world';
import { shopSolids } from './art';

/** A solid from the same dimensions as the scenery that defines it. */
export type TownBlock = {x:number;z:number;w:number;d:number;bottom:number;top:number};
export const TOWN = { west:-56, east:56, south:-15, north:113 } as const;
export function townGround(_x:number,z:number) {
	const t = Math.max(0,Math.min(1,(z-70)/42));
	return 9*t*t*(3-2*t);
}

type Waypoint = {id:string;x:number;z:number;ko:string;en:string;radius:number;hintKo:string;hintEn:string};
export const landmarks: readonly Waypoint[] = [
	{id:'mart',x:0,z:3,ko:'등불편의점',en:'Lantern Mart',radius:14,hintKo:'창가에 앉아 컵라면을 먹을 수 있어요.',hintEn:'The little shop is still serving ramen.'},
	{id:'market',x:-43,z:32,ko:'물빛시장',en:'Waterside Market',radius:15,hintKo:'등불 아래, 가게들이 하나둘 문을 닫고 있어요.',hintEn:'The last stalls are packing up under the lanterns.'},
	{id:'river',x:-38,z:58,ko:'강변 산책길',en:'River Walk',radius:13,hintKo:'강을 따라 걷다가 빛이 닿는 곳에서 쉬어가요.',hintEn:'Follow the river lights out to the lookout.'},
	{id:'station',x:34,z:39,ko:'등불역',en:'Lantern Station',radius:16,hintKo:'역 앞 광장을 지나 승강장을 둘러보세요.',hintEn:'The platform opens behind the station plaza.'},
	{id:'platform',x:44,z:57,ko:'북쪽 승강장',en:'North Platform',radius:12,hintKo:'오늘 밤 마지막 열차가 쉬어가는 곳이에요.',hintEn:'The last train of the night is resting here.'},
	{id:'hill',x:0,z:108,ko:'별바람 전망대',en:'Starwind Lookout',radius:13,hintKo:'여기서 돌아보면, 방금 걸어온 마을이 한눈에 들어와요.',hintEn:'Turn back to look over the town you just walked through.'},
];
export const trails: readonly (readonly [number,number])[][] = [
	[[0,12],[0,109]], [[0,32],[-45,32]], [[-44,32],[-44,58]], [[-44,58],[0,58]],
	[[0,39],[44,39]], [[43,39],[43,65]], [[43,65],[0,65]],
];
export function townArea(x:number,z:number) {
	if(z>88)return landmarks[5];
	let result:Waypoint|undefined, best=Infinity;
	for(const l of landmarks) {
		const d=Math.hypot(x-l.x,z-l.z);
		if(d<l.radius&&d<best){best=d;result=l;}
	}
	return result;
}

const old = (x:number,z:number,w:number,d:number,top:number):TownBlock=>({x,z,w,d,bottom:0,top});
const storefrontBlocks:TownBlock[] = [
	old(-10.4,-5.65,7.5,6,8.5),old(10.5,-6.55,7.5,6,11.3),
	old(-18.2,-4.85,6.8,6,8.5),old(18.6,-5.3,7.3,6,8.5),
	old(-7.66,1.85,2.9,.56,2.25),old(8.22,3.1,1.25,.77,2.1),
	...[-1,1].flatMap(side=>[0,1,2].map(i=>old(side*(26.5+i*2.5),.2+i*7.4,8,7.05,6+i*1.8))),
	...[-7.4,7.48].map(x=>old(x,7.42,.38,.38,4)),
];
export function townPhysics(blocks:readonly TownBlock[]): {world:World;blocks:TownBlock[]} {
	const fixed = [...storefrontBlocks,...blocks];
	const world: World = {
		groundAt:townGround, ceilingAt:()=>Infinity,nearby:()=>[],
		inside(x,z){
			return x>=TOWN.west&&x<=TOWN.east&&z>=TOWN.south&&z<=TOWN.north &&
				!shopSolids.some(([l,r,b,f])=>x>l-.24&&x<r+.24&&z>b-.24&&z<f+.24);
		},
		collide(p,r,vel){
			for(let pass=0;pass<2;pass++) for(const b of fixed){
				if(p.y>=b.top||p.y+1.69<=b.bottom)continue;
				const dx=p.x-b.x,dz=p.z-b.z,w=b.w/2+r,d=b.d/2+r;
				if(Math.abs(dx)>=w||Math.abs(dz)>=d)continue;
				if(w-Math.abs(dx)<d-Math.abs(dz)){
					const sign=dx<0?-1:1;
					p.x=b.x+sign*w;if(vel.x*sign<0)vel.x=0;
				}else{
					const sign=dz<0?-1:1;
					p.z=b.z+sign*d;if(vel.z*sign<0)vel.z=0;
				}
			}
			p.x=Math.max(TOWN.west+r,Math.min(TOWN.east-r,p.x));
			p.z=Math.max(TOWN.south+r,Math.min(TOWN.north-r,p.z));
		},
	};
	return {world,blocks:fixed};
}

export function townCameraClear(a:Vector3,b:Vector3,blocks:readonly TownBlock[]) {
	let near=1;
	const dist=a.distanceTo(b);
	if(dist<.01)return near;
	for(const s of blocks){
		if(s.top-townGround(s.x,s.z)<1.18)continue;
		let enter=0,exit=near;
		const pad=.13;
		const test=(start:number,end:number,l:number,h:number)=>{
			const dir=end-start;
			if(Math.abs(dir)<1e-7)return start>=l&&start<=h;
			const u=(l-start)/dir,v=(h-start)/dir;
			enter=Math.max(enter,Math.min(u,v));exit=Math.min(exit,Math.max(u,v));
			return enter<=exit;
		};
		if(test(a.x,b.x,s.x-s.w/2-pad,s.x+s.w/2+pad)&&test(a.z,b.z,s.z-s.d/2-pad,s.z+s.d/2+pad)&&test(a.y,b.y,s.bottom-pad,s.top+pad)&&enter>0)
			near=Math.min(near,Math.max(.075,enter-.23/dist));
	}
	return near;
}
