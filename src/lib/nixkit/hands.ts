// Her arms hold one thing at a time. Each thing she can take up (a sprinkler, a block, a belt …)
// says whether she's holding it and how to put it away; whenever she takes one up, the rest are put
// away. As a system (ORDER.game, after what she's doing has had its say), and `holding` for the
// player's `carrying`, so she walks with it held out.
import { ORDER, type Engine } from './engine';

export interface Holdable {
	holding(): boolean;
	stop(): void;
}

export function createHands(things: Holdable[]) {
	// Nothing in her arms to begin with (and nothing's asked until the first frame, so the things
	// can be made after this is).
	let held = things.map(() => false);
	const update = () => {
		// The first one she's just taken up wins (in the order they're listed).
		const taken = things.findIndex((t, i) => t.holding() && !held[i]);
		if (taken >= 0) things.forEach((t, i) => i !== taken && t.stop());
		held = things.map((t) => t.holding());
	};
	return {
		update,
		/** Whether she has anything in her arms. */
		holding: () => things.some((t) => t.holding()),
		/** Puts it in the engine's frame, at `order` (ORDER.game without it). */
		addTo(engine: Engine, order: number = ORDER.game) {
			return engine.add({ order, update });
		},
	};
}
