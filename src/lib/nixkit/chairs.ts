import { Vector3 } from 'three';
import { within, type World } from './world';

export type ChairOptions = {
	/** World position of the top of the cushion. */
	at: readonly [number, number, number];
	/** Heading in radians, with zero facing +z. */
	facing: number;
	/** A walkable point on the open side, as [x, z]. Defaults to .9 m in front. */
	stand?: readonly [number, number];
	reach?: number;
};

type ChairPlayer = {
	pos: Vector3;
	root: { position: Vector3 };
	vel: Vector3;
	readonly grounded: boolean;
	readonly dashing: boolean;
	face(angle: number): void;
};

type Chair = { x:number; height:number; z:number; facing:number; sx:number; sz:number; dx:number; dz:number; reach:number };
const BODY = .45, HEAD = 1.7, MAX_STEP = .6;

/** A player's fixed seat keeps her physics feet on the ground; `lift` raises just the sitting pose. */
export function createChairs({ world, player, available, clear }: {
	world: World;
	player: () => ChairPlayer;
	available?: () => boolean;
	clear?: (x: number, z: number) => boolean;
}) {
	const chairs: Chair[] = [];
	const probe = new Vector3(), probeVelocity = new Vector3();
	let current: Chair | null = null, floor = 0;

	function supports(x: number, z: number, y: number) {
		return Number.isFinite(y) && y > (world.fallOut ?? -Infinity)
			&& y >= (world.sea?.swimIn ?? -Infinity) && (world.wadeDepth?.(x,z,y) ?? 0) <= .45;
	}
	function walkable(x: number, z: number, height: number) {
		if (world.inside?.(x,z) === false || clear?.(x,z) === false) return null;
		const y = world.groundAt(x,z,height);
		if (!supports(x,z,y) || Math.abs(y-height) > MAX_STEP || world.ceilingAt(x,z,y) < y+HEAD) return null;
		for (const f of world.nearby(x,z)) {
			if (f.dome || f.pad !== undefined || !within(f,y) || (f.top !== undefined && y >= f.top)) continue;
			if (Math.hypot(x-f.x,z-f.z) < f.r+BODY) return null;
		}
		probe.set(x,y,z); probeVelocity.set(0,0,0);
		world.collide?.(probe,BODY,probeVelocity);
		return Math.abs(probe.x-x)+Math.abs(probe.y-y)+Math.abs(probe.z-z) < 1e-4 ? y : null;
	}
	function approach(p: ChairPlayer, c: Chair) {
		const dx = c.sx-p.pos.x, dz = c.sz-p.pos.z, steps = Math.max(1,Math.ceil(Math.hypot(dx,dz)/.22));
		let h = p.pos.y;
		for (let i=1;i<=steps;i++) {
			const y = walkable(p.pos.x+dx*i/steps,p.pos.z+dz*i/steps,h);
			if (y === null) return false;
			h = y;
		}
		return true;
	}
	function candidate(p: ChairPlayer) {
		if (!p.grounded || p.dashing || available?.() === false) return null;
		let best: {chair:Chair; y:number} | null = null, closest = Infinity;
		for (const c of chairs) {
			const dx = p.pos.x-c.x, dz = p.pos.z-c.z;
			const distance = Math.hypot(dx,dz);
			if (distance >= c.reach || distance >= closest || dx*c.dx+dz*c.dz < .12 || Math.abs(c.height-p.pos.y)>1.1) continue;
			const y = world.groundAt(c.x,c.z,p.pos.y);
			if (world.inside?.(c.x,c.z) === false || !supports(c.x,c.z,y) || Math.abs(p.pos.y-y)>MAX_STEP
				|| y>c.height+1e-3 || world.ceilingAt(c.x,c.z,y)<c.height+1.08
				|| !approach(p,c) || walkable(c.sx,c.sz,y) === null) continue;
			best = { chair:c,y }; closest = distance;
		}
		return best;
	}
	function place(p: ChairPlayer, x: number, y: number, z: number, facing: number) {
		p.pos.set(x,y,z); p.root.position.copy(p.pos); p.vel.set(0,0,0); p.face(facing);
	}
	return {
		add({ at:[x,height,z], facing, stand, reach = 1.3 }: ChairOptions) {
			const [sx,sz] = stand ?? [x+.9*Math.sin(facing),z+.9*Math.cos(facing)];
			const dx = sx-x, dz = sz-z, d = Math.hypot(dx,dz);
			if (d < 1e-3 || reach <= 0 || ![x,height,z,facing,sx,sz,reach].every(Number.isFinite)) return;
			chairs.push({x,height,z,facing,sx,sz,dx:dx/d,dz:dz/d,reach});
		},
		get seated() { return current !== null; },
		get heading() { return current?.facing ?? null; },
		get lift() { return current ? current.height-floor : 0; },
		action(): 'sit' | 'stand' | null {
			if (current) return walkable(current.sx,current.sz,floor) === null ? null : 'stand';
			return candidate(player()) ? 'sit' : null;
		},
		interact() {
			const p = player();
			if (current) {
				const { sx,sz,facing } = current, y = walkable(sx,sz,floor);
				if (y === null) return false;
				current = null; place(p,sx,y,sz,facing); return true;
			}
			const next = candidate(p);
			if (!next) return false;
			current = next.chair; floor = next.y; place(p,current.x,floor,current.z,current.facing); return true;
		},
		pin() { if (current) place(player(),current.x,floor,current.z,current.facing); },
		reset() { current = null; },
	};
}
