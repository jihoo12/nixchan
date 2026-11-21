// A world too big to have all at once, cut into square chunks that come and go round Nixchan.
// The game says what's in a chunk (`load`); the kit loads the chunks near her, nearest first, a
// few at a time so the frame doesn't stall, and lets go of those she's left far behind. Together
// the loaded chunks are one world (nixkit/world.ts) for her and the camera.
//
//   const chunks = createChunks({
//     size: 64,                           // metres across a chunk
//     radius: 160,                        // load what's within this far of her
//     load({ x0, z0, size }) {            // may be async (a fetch, a worker)
//       const ground = makeGround(x0, z0, size);
//       return { object: ground.mesh, world: ground.world, dispose: () => ground.dispose() };
//     },
//   });
//   const game = createGame({ world: chunks.world, ... });
//   chunks.attach(game.engine, () => game.player.pos);
//
// A chunk she hasn't got yet isn't somewhere she can go: she stops at its edge (as at the edge of
// a world) until it's come, rather than falling through ground that isn't there. `settle(x, z)`
// loads everything round a point at once, for where she starts or when she's teleported:
// `attach` waits on it for where she is to begin with.
//
// What a chunk's world says is asked about only near that chunk: at (x, z), the chunk it's in, and
// any neighbour within `reach` metres (so something standing on the line between two, a rock or a
// bridge, can be in either one's world). Its coordinates are the world's, not the chunk's own.
import * as THREE from 'three';
import { ORDER, type System } from './engine';
import type { Obstacle, World } from './world';

/** What's in one chunk while it's loaded. Every field is optional: a chunk of open sea may be
 * nothing at all. */
export interface Chunk {
	/** What it looks like: put in the scene while it's loaded, and taken out when it isn't. */
	object?: THREE.Object3D;
	/** What she stands on and walks round in it, in the world's own coordinates. */
	world?: World;
	/** Something to do each frame while it's loaded (and the game's running): water, birds. */
	update?(dt: number, time: number): void;
	/** It's been let go of: free its geometries and materials (unless other chunks share them). */
	dispose?(): void;
}

/** Where a chunk is: its cell (cx, cz), and the square it covers, from (x0, z0) to (x1, z1). */
export interface ChunkPlace {
	cx: number;
	cz: number;
	x0: number;
	z0: number;
	x1: number;
	z1: number;
	size: number;
}

export interface ChunkOptions {
	/** How many metres across a chunk is. */
	size: number;
	/** Chunks with any of their square within this many metres of her are loaded. */
	radius: number;
	/** Chunks with all of their square further than this are let go of (radius + half a chunk
	 * without it, so one isn't loaded and let go of over and over as she walks along its edge). */
	keep?: number;
	/** What's in the chunk at `place`: a chunk, or nothing, or a promise of either. */
	load(place: ChunkPlace): Chunk | null | undefined | Promise<Chunk | null | undefined>;
	/** How many loads may be under way at once (2 without it). */
	busy?: number;
	/** How many chunks may be started in one frame (1 without it), since even one that comes at
	 * once (made there and then, not fetched) takes a moment to make. */
	perFrame?: number;
	/** How near the edge of a chunk its neighbour's world is asked about too (4 m without it). */
	reach?: number;
	/** The edge of the world, if it has one: where she can never go, loaded or not. */
	inside?(x: number, z: number): boolean;
	/** A sea at y = 0, as in a World. */
	sea?: World['sea'];
	/** Fallen below this, she's put back (as in a World; -24 without it). */
	fallOut?: number;
}

type Slot = {
	place: ChunkPlace;
	state: 'loading' | 'loaded' | 'failed';
	chunk: Chunk | null;
	/** Let go of while it was still loading: drop it when it comes. */
	dropped?: boolean;
	/** When to try again, after a load that failed. */
	retry?: number;
};

const NONE: readonly Obstacle[] = [];

export function createChunks(opts: ChunkOptions) {
	const { size, radius } = opts;
	const keep = Math.max(opts.keep ?? radius + size / 2, radius);
	const busy = opts.busy ?? 2;
	const perFrame = opts.perFrame ?? 1;
	const reach = Math.min(opts.reach ?? 4, size / 2);
	const group = new THREE.Group();
	group.name = 'chunks';
	const slots = new Map<string, Slot>();
	const key = (cx: number, cz: number) => `${cx},${cz}`;
	const cellOf = (v: number) => Math.floor(v / size);
	let clock = 0;
	let loading = 0;
	const waiting: { x: number; z: number; done: () => void }[] = [];

	const placeOf = (cx: number, cz: number): ChunkPlace => ({ cx, cz, x0: cx * size, z0: cz * size, x1: (cx + 1) * size, z1: (cz + 1) * size, size });
	/** How far (x, z) is from the nearest point of a chunk's square. */
	const away = (cx: number, cz: number, x: number, z: number) => {
		const dx = Math.max(cx * size - x, 0, x - (cx + 1) * size);
		const dz = Math.max(cz * size - z, 0, z - (cz + 1) * size);
		return Math.hypot(dx, dz);
	};

	const loadedAt = (cx: number, cz: number) => {
		const s = slots.get(key(cx, cz));
		return s?.state === 'loaded' ? s : undefined;
	};

	// The loaded chunks to ask about at (x, z): its own, then any neighbour it's within `reach` of.
	const near: Slot[] = [];
	const around = (x: number, z: number) => {
		near.length = 0;
		const cx = cellOf(x);
		const cz = cellOf(z);
		const fx = x - cx * size;
		const fz = z - cz * size;
		const ox = fx < reach ? -1 : fx > size - reach ? 1 : 0;
		const oz = fz < reach ? -1 : fz > size - reach ? 1 : 0;
		const own = loadedAt(cx, cz);
		if (own) near.push(own);
		if (ox) {
			const s = loadedAt(cx + ox, cz);
			if (s) near.push(s);
		}
		if (oz) {
			const s = loadedAt(cx, cz + oz);
			if (s) near.push(s);
		}
		if (ox && oz) {
			const s = loadedAt(cx + ox, cz + oz);
			if (s) near.push(s);
		}
		return near;
	};

	const nearbyAll: Obstacle[] = [];
	const world: World = {
		groundAt(x, z, y) {
			let g = -Infinity;
			for (const s of around(x, z)) if (s.chunk?.world) g = Math.max(g, s.chunk.world.groundAt(x, z, y));
			return g;
		},
		ceilingAt(x, z, y) {
			let c = Infinity;
			for (const s of around(x, z)) if (s.chunk?.world) c = Math.min(c, s.chunk.world.ceilingAt(x, z, y));
			return c;
		},
		nearby(x, z) {
			const slots = around(x, z);
			// Most of the time she's well inside one chunk: give back its own list as it is.
			if (slots.length === 1) return slots[0].chunk?.world?.nearby(x, z) ?? NONE;
			nearbyAll.length = 0;
			for (const s of slots) for (const o of s.chunk?.world?.nearby(x, z) ?? NONE) nearbyAll.push(o);
			return nearbyAll;
		},
		inside(x, z) {
			if (opts.inside && !opts.inside(x, z)) return false;
			const s = loadedAt(cellOf(x), cellOf(z));
			if (!s) return false;
			return s.chunk?.world?.inside(x, z) ?? true;
		},
		wadeDepth(x, z, y) {
			let d = 0;
			for (const s of around(x, z)) if (s.chunk?.world?.wadeDepth) d = Math.max(d, s.chunk.world.wadeDepth(x, z, y));
			return d;
		},
		windLift(x, z, y) {
			let w = 0;
			for (const s of around(x, z)) if (s.chunk?.world?.windLift) w = Math.max(w, s.chunk.world.windLift(x, z, y));
			return w;
		},
		collide(p, r, vel) {
			// (Copied, since a chunk's collide may ask the world something and use `near` again.)
			for (const s of [...around(p.x, p.z)]) s.chunk?.world?.collide?.(p, r, vel);
		},
		sea: opts.sea,
		fallOut: opts.fallOut ?? -24,
	};

	const settleWaiting = () => {
		for (let i = waiting.length - 1; i >= 0; i--) {
			const w = waiting[i];
			if (wanted(w.x, w.z).every(([cx, cz]) => {
				const s = slots.get(key(cx, cz));
				return s && s.state !== 'loading';
			})) {
				waiting.splice(i, 1);
				w.done();
			}
		}
	};

	const arrive = (slot: Slot, chunk: Chunk | null | undefined) => {
		if (slot.dropped) {
			chunk?.dispose?.();
			return;
		}
		slot.state = 'loaded';
		slot.chunk = chunk ?? null;
		if (chunk?.object) group.add(chunk.object);
	};

	const start = (cx: number, cz: number) => {
		const slot: Slot = { place: placeOf(cx, cz), state: 'loading', chunk: null };
		slots.set(key(cx, cz), slot);
		let got: ReturnType<ChunkOptions['load']>;
		try {
			got = opts.load(slot.place);
		} catch (e) {
			fail(slot, e);
			return;
		}
		if (got && typeof (got as Promise<unknown>).then === 'function') {
			loading++;
			(got as Promise<Chunk | null | undefined>).then(
				(c) => {
					loading--;
					arrive(slot, c);
					pump();
				},
				(e) => {
					loading--;
					fail(slot, e);
					pump();
				},
			);
		} else arrive(slot, got as Chunk | null | undefined);
	};

	const fail = (slot: Slot, e: unknown) => {
		console.warn(`[nixkit] chunk ${slot.place.cx},${slot.place.cz} didn't load`, e);
		if (slot.dropped) return;
		slot.state = 'failed';
		slot.retry = clock + 2;
	};

	const drop = (k: string, slot: Slot) => {
		slots.delete(k);
		if (slot.state === 'loading') {
			slot.dropped = true;
			return;
		}
		if (slot.chunk?.object) group.remove(slot.chunk.object);
		slot.chunk?.dispose?.();
	};

	/** The chunks to have round (x, z), nearest first. */
	const wanted = (x: number, z: number) => {
		const out: [number, number, number][] = [];
		const r = Math.ceil(radius / size);
		const cx = cellOf(x);
		const cz = cellOf(z);
		for (let i = cx - r; i <= cx + r; i++)
			for (let j = cz - r; j <= cz + r; j++) {
				const d = away(i, j, x, z);
				if (d <= radius && (!opts.inside || chunkMeetsWorld(i, j))) out.push([i, j, d]);
			}
		return out.sort((a, b) => a[2] - b[2]);
	};
	// Whether any of a chunk's square is inside the world's edge (asked at its corners and middle).
	const chunkMeetsWorld = (cx: number, cz: number) => {
		const x0 = cx * size;
		const z0 = cz * size;
		for (const [u, v] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1]])
			if (opts.inside!(x0 + u * size, z0 + v * size)) return true;
		return false;
	};

	/** Starts up to `limit` of the chunks wanted round (x, z) that aren't there yet, nearest first. */
	const want = (x: number, z: number, limit: number) => {
		let started = 0;
		for (const [cx, cz] of wanted(x, z)) {
			if (started >= limit || loading >= busy) break;
			const s = slots.get(key(cx, cz));
			if (s && !(s.state === 'failed' && clock >= s.retry!)) continue;
			if (s) slots.delete(key(cx, cz));
			start(cx, cz);
			started++;
		}
	};
	/** Starts everything anyone's waiting on (`settle`), as far as `busy` allows, and lets them know
	 * once theirs have all come. */
	function pump() {
		for (const w of [...waiting]) want(w.x, w.z, Infinity);
		settleWaiting();
	}

	/** Loads what's wanted round (x, z), a few a frame, and lets go of what's too far. */
	const update = (x: number, z: number, dt: number) => {
		clock += dt;
		for (const [k, s] of slots) if (away(s.place.cx, s.place.cz, x, z) > keep) drop(k, s);
		want(x, z, perFrame);
		pump();
	};

	const chunks = {
		/** The loaded chunks, as a world for her and the camera. */
		world,
		/** Everything the chunks look like; `attach` puts it in the scene. */
		group,
		size,
		/** Loads and lets go of chunks round (x, z) (as `attach` does every frame). */
		update,
		/** Settles once every chunk wanted round (x, z) has come (or failed), starting them all at
		 * once rather than a few a frame. */
		settle(x: number, z: number) {
			// Everything at once, but no more at a time than `busy` allows: the rest follow as those come.
			return new Promise<void>((done) => {
				waiting.push({ x, z, done });
				pump();
			});
		},
		/** The chunk that (x, z) is in, if it's loaded. */
		at(x: number, z: number): Chunk | null | undefined {
			return loadedAt(cellOf(x), cellOf(z))?.chunk;
		},
		/** Whether the chunk that (x, z) is in has come. */
		ready: (x: number, z: number) => !!loadedAt(cellOf(x), cellOf(z)),
		/** How many chunks are loaded, and how many on their way. */
		get counts() {
			let loaded = 0;
			for (const s of slots.values()) if (s.state === 'loaded') loaded++;
			return { loaded, loading };
		},
		/** Puts the chunks in `engine`: their looks in its scene, loading round `follow()` every
		 * frame (even while paused), each chunk's `update` while the game runs, and waits for the
		 * chunks round where `follow()` is to begin with before the game starts. */
		attach(engine: { scene: THREE.Object3D; add(s: System): () => void; waitFor(p: Promise<unknown>): unknown }, follow: () => { x: number; z: number }) {
			engine.scene.add(group);
			const from = follow();
			engine.waitFor(chunks.settle(from.x, from.z));
			const off = [
				engine.add({
					order: ORDER.world - 10,
					always: true,
					update: (dt) => {
						const at = follow();
						update(at.x, at.z, dt);
					},
				}),
				engine.add({
					order: ORDER.world,
					update: (dt, time) => {
						for (const s of slots.values()) if (s.state === 'loaded') s.chunk?.update?.(dt, time);
					},
					dispose: () => chunks.dispose(),
				}),
			];
			return () => {
				for (const o of off) o();
				engine.scene.remove(group);
			};
		},
		/** Lets go of every chunk. */
		dispose() {
			for (const [k, s] of slots) drop(k, s);
			for (const w of waiting.splice(0)) w.done();
		},
	};
	return chunks;
}

export type Chunks = ReturnType<typeof createChunks>;
