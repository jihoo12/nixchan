// Day and night. The site's clock button sets `data-time` on the page and says so with a
// 'site-time' event; each part of a game that changes with it (sky, sea, lamps…) registers with
// `on`, and is told the palette whenever it switches, so nothing has to know about everything else
// that changes colour. The palette is the game's own: whatever it needs to know by day and by night.

export const isNight = () => document.documentElement.dataset.time === 'night';

export interface DayNight<P> {
	/** Calls `apply` with the palette now (once `start` has run) and whenever day turns to night or
	 * back. Returns what stops it. */
	on(apply: (p: P) => void): () => void;
	/** Applies the palette to everything registered so far, and follows the clock from then on. */
	start(): void;
	/** The palette for now. */
	readonly current: P;
	/** Stops following the clock. */
	dispose(): void;
}

export function createDayNight<P>(palettes: { day: P; night: P }): DayNight<P> {
	let listeners: ((p: P) => void)[] = [];
	let started = false;
	const current = () => (isNight() ? palettes.night : palettes.day);
	const apply = () => {
		const p = current();
		for (const fn of listeners) fn(p);
	};
	return {
		on(fn) {
			listeners = [...listeners, fn];
			if (started) fn(current());
			return () => {
				listeners = listeners.filter((l) => l !== fn);
			};
		},
		start() {
			if (started) return;
			started = true;
			apply();
			addEventListener('site-time', apply);
		},
		get current() {
			return current();
		},
		dispose() {
			removeEventListener('site-time', apply);
			listeners = [];
		},
	};
}
