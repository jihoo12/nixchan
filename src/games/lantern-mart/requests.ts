// The neighbours' little favours, and the walk notebook that stamps each one done. Kept apart from
// the renderer, the keys and the talk box, so the rules can be tested on their own
// (tools/test-nixkit-lantern-requests.mjs).
//
// Each neighbour asks for one thing: Pip wants a bungeoppang from Gomsun's cart, Mochi a fish cake
// from Yeoul's tent, Gomsun the umbrella she left at Lantern Station, and Yeoul the radish she left
// at the Waterside Market. Nixchan can carry one thing at a time. With all four stamped, the town
// lets its sky lanterns go.

export type NeighborId = 'mochi' | 'pip' | 'gomsun' | 'yeoul';
export type Item = 'bungeo' | 'eomuk' | 'umbrella' | 'radish';
export type RequestState = 'new' | 'asked' | 'done';

/** Who wants what, and where it's found: bought from a neighbour, or picked up somewhere in town. */
export const REQUESTS: Record<NeighborId, { wants: Item; from: NeighborId | 'station' | 'market' }> = {
	pip: { wants: 'bungeo', from: 'gomsun' },
	mochi: { wants: 'eomuk', from: 'yeoul' },
	gomsun: { wants: 'umbrella', from: 'station' },
	yeoul: { wants: 'radish', from: 'market' },
};
export const ASKERS: readonly NeighborId[] = ['pip', 'mochi', 'gomsun', 'yeoul'];

/** Where the two things to pick up are left, on the ground at the edge of a path. */
export const PICKUPS: Record<'umbrella' | 'radish', { x: number; z: number; heading: number }> = {
	// Leaning on a lamp in front of Lantern Station, at the end of the walk from the mart.
	umbrella: { x: 38.85, z: 42.05, heading: 0.4 },
	// On a crate between two market stalls that are packing up.
	radish: { x: -27.7, z: 45.4, heading: -0.3 },
};

const isState = (v: unknown): v is RequestState => v === 'new' || v === 'asked' || v === 'done';

export function createRequests(saved?: unknown) {
	const state = Object.fromEntries(ASKERS.map((id) => [id, 'new'])) as Record<NeighborId, RequestState>;
	if (saved && typeof saved === 'object') {
		for (const id of ASKERS) {
			const v = (saved as Record<string, unknown>)[id];
			if (isState(v)) state[id] = v;
		}
	}
	const stamps = () => ASKERS.filter((id) => state[id] === 'done').length;
	const canGive = (id: NeighborId, holding: Item | null) => state[id] === 'asked' && holding === REQUESTS[id].wants;
	return {
		state(id: NeighborId) {
			return state[id];
		},
		/** She's said she'll help. Returns false if there was nothing to ask (already asked or done). */
		ask(id: NeighborId) {
			if (state[id] !== 'new') return false;
			state[id] = 'asked';
			return true;
		},
		/** Whether what she's holding is what `id` asked her for. */
		canGive,
		/** Hands it over. Returns true if that stamped the notebook. */
		give(id: NeighborId, holding: Item | null) {
			if (!canGive(id, holding)) return false;
			state[id] = 'done';
			return true;
		},
		/** Someone asked for `item`, and is still waiting for it: buying one now is buying it for them. */
		wanted(item: Item) {
			return ASKERS.find((id) => state[id] === 'asked' && REQUESTS[id].wants === item) ?? null;
		},
		/** Whether `item` is waiting to be picked up (asked for, and not yet handed over). */
		waiting(item: 'umbrella' | 'radish') {
			return ASKERS.some((id) => state[id] === 'asked' && REQUESTS[id].wants === item);
		},
		get stamps() {
			return stamps();
		},
		get all() {
			return stamps() === ASKERS.length;
		},
		/** What to save in the game's store. */
		save() {
			return { ...state };
		},
	};
}

export type Requests = ReturnType<typeof createRequests>;
