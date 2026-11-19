// Remembering things between visits, in the browser's localStorage. A game lists every key it keeps
// in one place (so there's one place to see what's saved, and one place to bump a key when a format
// changes) and gets back readers and writers that only take those keys:
//
//   const save = createSaves({ bag: 'island-bag', map: 'island-map-v2' });
//   save.saveJSON('bag', [...]);
//   const bag = save.loadJSON('bag');   // unknown: check its shape
//
// Reading and writing never throw: a private window or a full store just means it forgets.

/** The raw text saved under a localStorage key, or null if there's none (or it can't be read). */
export function readText(name: string): string | null {
	try {
		return localStorage.getItem(name);
	} catch {
		return null;
	}
}

export function writeText(name: string, value: string) {
	try {
		localStorage.setItem(name, value);
	} catch {
		// Too full, or not allowed: it just won't be remembered.
	}
}

/** What's saved under a localStorage key, parsed, or undefined if there's nothing or it's garbled.
 * The value is untrusted (it may be from an older version, or edited by hand), so check its shape. */
export function readJSON(name: string): unknown {
	const text = readText(name);
	if (text === null) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export function writeJSON(name: string, value: unknown) {
	writeText(name, JSON.stringify(value));
}

/** Readers and writers for a game's own keys: each short name stands for the localStorage key it
 * maps to. */
export function createSaves<K extends string>(keys: Record<K, string>) {
	return {
		keys,
		loadText: (key: K) => readText(keys[key]),
		saveText: (key: K, value: string) => writeText(keys[key], value),
		loadJSON: (key: K) => readJSON(keys[key]),
		saveJSON: (key: K, value: unknown) => writeJSON(keys[key], value),
	};
}
