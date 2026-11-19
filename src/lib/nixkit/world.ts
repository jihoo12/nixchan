// What a Nixkit world is, as far as Nixchan and the camera are concerned. A world answers a few
// questions about the space round her (how high is what she'd stand on here? how low is what's over
// her head? what's standing near?) and says whether it has a sea to swim in. Everything else
// (what the place looks like, what there is to do there) is the world's own business.
//
// The island answers them from its terrain, rocks, trees and sky island (island/features.ts); a
// world built out of parts answers them from its parts (nixkit/parts.ts).
import type * as THREE from 'three';

/** Something standing in the world that she walks round, climbs onto or glides past. A trunk she
 * walks round (`r`, up to `top`, or all the way up without it), a rock she can climb onto (a dome),
 * or a flat-topped plinth she can step or jump onto (a pad). A tree's leaves are a ball (`crown`)
 * that she glides round rather than through, and that the camera won't sit inside. */
export interface Obstacle {
	x: number;
	z: number;
	r: number;
	dome?: { base: number; top: number };
	pad?: number;
	top?: number;
	crown?: { x: number; y: number; z: number; r: number };
	/** For something up off the ground (on a floating island): the height it stands at. It's only
	 * there for her when she's up there too, and not for anything far below it. */
	floor?: number;
}

/** How far below an obstacle's floor she can be and still meet it (as when stepping up onto the
 * floating ground it stands on). */
const FLOOR_REACH = 1.5;

/** Whether an obstacle is there at all for someone at height `y` (unknown: down on the ground). */
export const within = (f: Obstacle, y: number | undefined) => f.floor === undefined || (y !== undefined && y >= f.floor - FLOOR_REACH);

export interface World {
	/** The height of whatever she'd stand on at (x, z), for someone at height `y` (without it, what's
	 * on the ground there, ignoring anything floating). -Infinity where there's nothing at all. */
	groundAt(x: number, z: number, y?: number): number;
	/** How high she can be at (x, z) before her head meets something over it. */
	ceilingAt(x: number, z: number, y: number): number;
	/** The obstacles that might reach (x, z). */
	nearby(x: number, z: number): readonly Obstacle[];
	/** Whether (x, z) is somewhere she can go at all (inside the edge of the world). */
	inside(x: number, z: number): boolean;
	/** A sea at y = 0: where the floor drops below `swimIn` she swims, and finds her feet again above
	 * `swimOut`. Without one, there's only falling. */
	sea?: { swimIn: number; swimOut: number };
	/** How deep the water she's standing in is, at (x, z), when it isn't the sea (a lake up high). */
	wadeDepth?(x: number, z: number, y: number): number;
	/** How hard the wind lifts a glider at (x, z, y), if at all. */
	windLift?(x: number, z: number, y: number): number;
	/** Fallen below this, she's put back where she started (or wherever `respawn` says). */
	fallOut?: number;
	/** Pushes `p` (her feet, `r` round) out of anything else she can't walk into: walls, boxes, the
	 * edges of a room. Asked as she moves, after she's been pushed out of the obstacles; it moves her
	 * and leaves how fast she's going alone, so she can lean into a wall. */
	collide?(p: THREE.Vector3, r: number): void;
}

/** One world made of several, as when a game puts parts (nixkit/parts.ts) on terrain of its own:
 * she stands on the highest ground any of them has, meets the lowest ceiling, walks round what's
 * standing in all of them, and can go wherever any of them lets her. The sea is the first one's
 * that has one, and she falls out below the lowest of their fallOuts. */
export function combineWorlds(...worlds: World[]): World {
	if (worlds.length === 1) return worlds[0];
	const fallOuts = worlds.map((w) => w.fallOut).filter((f): f is number => f !== undefined);
	const wading = worlds.filter((w) => w.wadeDepth);
	const windy = worlds.filter((w) => w.windLift);
	return {
		groundAt(x, z, y) {
			let g = -Infinity;
			for (const w of worlds) g = Math.max(g, w.groundAt(x, z, y));
			return g;
		},
		ceilingAt(x, z, y) {
			let c = Infinity;
			for (const w of worlds) c = Math.min(c, w.ceilingAt(x, z, y));
			return c;
		},
		nearby(x, z) {
			const all: Obstacle[] = [];
			for (const w of worlds) for (const o of w.nearby(x, z)) all.push(o);
			return all;
		},
		inside: (x, z) => worlds.some((w) => w.inside(x, z)),
		sea: worlds.find((w) => w.sea)?.sea,
		wadeDepth: wading.length ? (x, z, y) => Math.max(...wading.map((w) => w.wadeDepth!(x, z, y))) : undefined,
		windLift: windy.length ? (x, z, y) => Math.max(...windy.map((w) => w.windLift!(x, z, y))) : undefined,
		fallOut: fallOuts.length ? Math.min(...fallOuts) : undefined,
	};
}
