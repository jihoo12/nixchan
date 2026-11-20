import type { Vector3 } from 'three';
import type { World } from '../../lib/nixkit/world';

export interface Block {
	x: number; z: number; w: number; d: number; bottom: number; top: number;
}
const HALF_X = 14.8;
const NORTH_Z = -13.3;
const SOUTH_Z = 20.8;
const HEIGHT = 1.7;

export function schoolWorld(blocks: readonly Block[]): World {
	return {
		groundAt: () => 0,
		ceilingAt(x,z,y) {
			let ceiling = Infinity;
			for (const b of blocks) if (b.bottom >= HEIGHT && b.bottom >= y && Math.abs(x-b.x) < b.w*.5 && Math.abs(z-b.z) < b.d*.5) {
				ceiling = Math.min(ceiling, b.bottom);
			}
			return ceiling;
		},
		nearby: () => [],
		inside: (x,z) => Math.abs(x) <= HALF_X && z >= NORTH_Z && z <= SOUTH_Z,
		collide(p,r,vel) {
			// Project the player capsule out of the rectangular solids in XZ, keeping tangential
			// speed. Contains door jambs as well as the empty-center case when spawned into a prop.
			for (let pass=0; pass<3; pass++) {
				let moved=false;
				for (const b of blocks) {
					if (p.y >= b.top || p.y+HEIGHT <= b.bottom) continue;
					const x=p.x-b.x, z=p.z-b.z, hw=b.w*.5, hd=b.d*.5;
					if (Math.abs(x)>=hw+r || Math.abs(z)>=hd+r) continue;
					const cx=Math.max(-hw,Math.min(hw,x)), cz=Math.max(-hd,Math.min(hd,z));
					const dx=x-cx,dz=z-cz,d2=dx*dx+dz*dz;
					if (d2>=r*r)continue;
					let nx:number,nz:number,push:number;
					if(d2>1e-10){
						const dist=Math.sqrt(d2);
						nx=dx/dist;nz=dz/dist;push=r-dist;
					}else if(hw-Math.abs(x)<hd-Math.abs(z)){
						nx=x<0?-1:1;nz=0;push=hw-Math.abs(x)+r;
					}else{
						nx=0;nz=z<0?-1:1;push=hd-Math.abs(z)+r;
					}
					p.x+=nx*push;p.z+=nz*push;moved=true;
					const incoming=vel.x*nx+vel.z*nz;
					if(incoming<0){vel.x-=nx*incoming;vel.z-=nz*incoming;}
				}
				if(!moved)break;
			}
			const x=Math.max(-HALF_X+r,Math.min(HALF_X-r,p.x));
			const z=Math.max(NORTH_Z+r,Math.min(SOUTH_Z-r,p.z));
			if(x!==p.x&&Math.sign(vel.x)===Math.sign(p.x-x))vel.x=0;
			if(z!==p.z&&Math.sign(vel.z)===Math.sign(p.z-z))vel.z=0;
			p.x=x;p.z=z;
		},
	};
}

/** Cut the third-person orbit in front of walls; in first person Nixkit uses the player capsule. */
export function cameraFraction(eye: Vector3, camera: Vector3, blocks: readonly Block[]) {
	let fraction=1;
	const distance=eye.distanceTo(camera);
	if(distance<.01)return fraction;
	for(const b of blocks) {
		if (b.top < 1.25) continue; // low furniture doesn't obstruct the follow camera
		let enter=0,leave=1;
		const pad=.11;
		const axes=[
			[eye.x,camera.x-eye.x,b.x-b.w*.5-pad,b.x+b.w*.5+pad],
			[eye.y,camera.y-eye.y,b.bottom-pad,b.top+pad],
			[eye.z,camera.z-eye.z,b.z-b.d*.5-pad,b.z+b.d*.5+pad],
		];
		for(const [p,d,lo,hi] of axes){
			if(Math.abs(d)<1e-8){
				if(p<lo||p>hi){enter=Infinity;break;}
			}else{
				const a=(lo-p)/d,c=(hi-p)/d;
				enter=Math.max(enter,Math.min(a,c));leave=Math.min(leave,Math.max(a,c));
			}
		}
		if(enter>0&&enter<=leave)fraction=Math.min(fraction,Math.max(.055,enter-.21/distance));
	}
	return fraction;
}
