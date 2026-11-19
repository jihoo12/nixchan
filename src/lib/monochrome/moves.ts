// How Nixchan moves in the grey place, as Nixkit's player is told it (nixkit/player.ts): its speeds,
// grip and turning are the island's own, and the walls, boxes and columns of the cells round her push
// her out the way they always have here (greyCollide), taking away the part of her speed that was
// carrying her into them, so she slides along. tools/test-nixkit-grey-feel.mjs keeps it feeling as
// it did before the grey place moved her with Nixkit.
import type * as THREE from 'three';
import type { Moves } from '../nixkit/player';
import { clamp } from '../nixkit/util';

export const greyMoves: Moves = {};

/** Something solid near her, in the laid-out frame: a box (a wall, a block) or a column. */
export interface NearSolid {
	box: { x0: number; x1: number; z0: number; z1: number } | null;
	circle: { x: number; z: number; r: number } | null;
}

/** Pushes her out of what's solid round her (twice over, for a corner), as the grey place does. */
export function greyCollide(solids: () => readonly NearSolid[]) {
	const once = (pos: THREE.Vector3, r: number, vel: THREE.Vector3) => {
		for (const s of solids()) {
			let nx: number;
			let nz: number;
			let depth: number;
			if (s.circle) {
				const dx = pos.x - s.circle.x;
				const dz = pos.z - s.circle.z;
				const d = Math.hypot(dx, dz);
				const min = s.circle.r + r;
				if (d >= min || d < 1e-5) continue;
				nx = dx / d;
				nz = dz / d;
				depth = min - d;
			} else {
				const b = s.box!;
				const cx = clamp(pos.x, b.x0, b.x1);
				const cz = clamp(pos.z, b.z0, b.z1);
				const dx = pos.x - cx;
				const dz = pos.z - cz;
				const d = Math.hypot(dx, dz);
				if (d >= r) continue;
				if (d > 1e-5) {
					nx = dx / d;
					nz = dz / d;
					depth = r - d;
				} else {
					// Right inside it (a step too far in one frame): out the nearest way.
					const out = [pos.x - b.x0, b.x1 - pos.x, pos.z - b.z0, b.z1 - pos.z];
					const k = out.indexOf(Math.min(...out));
					nx = k === 0 ? -1 : k === 1 ? 1 : 0;
					nz = k === 2 ? -1 : k === 3 ? 1 : 0;
					depth = out[k] + r;
				}
			}
			pos.x += nx * depth;
			pos.z += nz * depth;
			const into = vel.x * nx + vel.z * nz;
			if (into < 0) {
				vel.x -= into * nx;
				vel.z -= into * nz;
			}
		}
	};
	return (pos: THREE.Vector3, r: number, vel: THREE.Vector3) => {
		once(pos, r, vel);
		once(pos, r, vel);
	};
}
