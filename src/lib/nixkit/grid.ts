// A grid of cells over the ground (x, z), for finding what's near a point without looking at
// everything in the world. Each thing goes in every cell its footprint reaches, so asking at a
// point gives back only what might be there: a handful, however big the world is.
//
//   const grid = createGrid<Rock>(8);
//   grid.insert(rock, rock.x - rock.r, rock.z - rock.r, rock.x + rock.r, rock.z + rock.r);
//   for (const r of grid.at(x, z)) ...          // what might reach (x, z)
//   grid.remove(rock);
//
// Something much bigger than the cells (a floor a whole level wide) would fill too many of them,
// so it's kept to one side instead and always given back: `at` is everything in the cell plus
// those.

/** How many cells something may fill before it's kept to one side as too big. */
const MOST_CELLS = 256;

export interface Grid<T> {
	/** How wide each cell is, in metres. */
	readonly cell: number;
	/** Puts `item` in every cell from (minX, minZ) to (maxX, maxZ). Putting it in again moves it. */
	insert(item: T, minX: number, minZ: number, maxX: number, maxZ: number): void;
	remove(item: T): void;
	/** What might reach (x, z). Don't hold on to it, or change it: it's the grid's own. */
	at(x: number, z: number): readonly T[];
	/** Each thing that might reach anywhere within `r` of (x, z), once each. */
	around(x: number, z: number, r: number, each: (item: T) => void): void;
	/** How many things are in it. */
	readonly size: number;
	clear(): void;
}

export function createGrid<T>(cell = 8): Grid<T> {
	const cells = new Map<string, T[]>();
	const where = new Map<T, string[] | 'wide'>();
	const wide: T[] = [];
	const key = (cx: number, cz: number) => `${cx},${cz}`;
	// What `at` gives back for a cell when there's also something wide: kept, so it isn't made anew
	// every time she's asked about.
	const merged = new Map<string, T[]>();
	const EMPTY: readonly T[] = [];

	const remove = (item: T) => {
		const w = where.get(item);
		if (!w) return;
		where.delete(item);
		if (w === 'wide') {
			wide.splice(wide.indexOf(item), 1);
			merged.clear();
			return;
		}
		for (const k of w) {
			const list = cells.get(k)!;
			list.splice(list.indexOf(item), 1);
			if (!list.length) cells.delete(k);
			merged.delete(k);
		}
	};

	return {
		cell,
		insert(item, minX, minZ, maxX, maxZ) {
			remove(item);
			const x0 = Math.floor(minX / cell);
			const x1 = Math.floor(maxX / cell);
			const z0 = Math.floor(minZ / cell);
			const z1 = Math.floor(maxZ / cell);
			if (!Number.isFinite(x0 + x1 + z0 + z1) || (x1 - x0 + 1) * (z1 - z0 + 1) > MOST_CELLS) {
				where.set(item, 'wide');
				wide.push(item);
				merged.clear();
				return;
			}
			const keys: string[] = [];
			for (let cx = x0; cx <= x1; cx++)
				for (let cz = z0; cz <= z1; cz++) {
					const k = key(cx, cz);
					const list = cells.get(k);
					if (list) list.push(item);
					else cells.set(k, [item]);
					merged.delete(k);
					keys.push(k);
				}
			where.set(item, keys);
		},
		remove,
		at(x, z) {
			const k = key(Math.floor(x / cell), Math.floor(z / cell));
			const list = cells.get(k);
			if (!wide.length) return list ?? EMPTY;
			if (!list) return wide;
			let m = merged.get(k);
			if (!m) merged.set(k, (m = [...list, ...wide]));
			return m;
		},
		around(x, z, r, each) {
			const seen = new Set<T>();
			for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++)
				for (let cz = Math.floor((z - r) / cell); cz <= Math.floor((z + r) / cell); cz++)
					for (const item of cells.get(key(cx, cz)) ?? EMPTY)
						if (!seen.has(item)) {
							seen.add(item);
							each(item);
						}
			for (const item of wide) each(item);
		},
		get size() {
			return where.size;
		},
		clear() {
			cells.clear();
			where.clear();
			merged.clear();
			wide.length = 0;
		},
	};
}
