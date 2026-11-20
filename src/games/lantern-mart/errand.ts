export type Phase = 'shelf' | 'water' | 'wait' | 'seat' | 'eat' | 'after';

export const STEEP_SECONDS = 3;
export const EAT_SECONDS = 4.6;

/** Timing and legal transitions are independent of the renderer, keyboard and touch controls. */
export function createErrand() {
	let phase: Phase = 'shelf';
	let elapsed = 0;
	const advance = (next: Phase) => {
		phase = next;
		elapsed = 0;
	};
	return {
		get phase() { return phase; },
		get elapsed() { return elapsed; },
		act() {
			if (phase === 'shelf' || phase === 'after') advance('water');
			else if (phase === 'water') advance('wait');
			else if (phase === 'seat') advance('eat');
			else return false;
			return true;
		},
		/** Returns true exactly once for each finished meal. */
		tick(dt: number) {
			if (phase !== 'wait' && phase !== 'eat') return false;
			elapsed += dt;
			if (phase === 'wait' && elapsed >= STEEP_SECONDS) advance('seat');
			if (phase === 'eat' && elapsed >= EAT_SECONDS) {
				advance('after');
				return true;
			}
			return false;
		},
	};
}
