// Nixchan's bag: what she's carrying, a stack to a slot. It doesn't know about fish or anything
// else in particular: each kind of thing she can carry is registered with a name, a picture and the
// things she can do with it (let a fish go, plant a seed, eat a turnip), and the rest of the game
// adds and takes items by id. What kinds of thing there are (`kinds`, and what each is called) and
// where the bag is remembered (`store`) are the game's to say; it draws itself into the page's own
// elements (`grid`, `detail`, `summary`).

export interface ItemAction {
	label: string;
	/** Does the thing, given the item's id; the action takes any items out of the bag itself. */
	run: (id: string) => void;
}

export interface ItemDef<K extends string = string> {
	id: string;
	name: string;
	kind: K;
	description: string;
	/** Shown until (or instead of) a picture. */
	color: string;
	/** A picture of it, as an image URL, once there is one. */
	icon?: () => string | null;
	actions?: ItemAction[];
	/** What the market stand pays for one, if it buys them at all. */
	sell?: number;
}

export interface Inventory<K extends string = string> {
	register(def: ItemDef<K>): void;
	/** Puts `n` in the bag, if there's room: a slot of their own, or the stack they join. */
	add(id: string, n?: number): boolean;
	remove(id: string, n?: number): boolean;
	count(id: string): number;
	has(id: string): boolean;
	/** Whether there's a slot for something new (or a stack it joins). */
	fits(id: string): boolean;
	def(id: string): ItemDef<K> | undefined;
	/** What's in the bag, in the order it sits there. */
	entries(): [string, number][];
	/** Draws the bag again, as when a picture comes in. */
	render(): void;
}

/** What the bag says, where it has words of its own. */
export interface BagWords {
	pick: string;
	empty: string;
	emptySlot: string;
	sells: (price: number) => string;
	summary: (used: number, slots: number, total: number) => string;
}

const ENGLISH: BagWords = {
	pick: 'Pick something to look at it.',
	empty: 'Nothing in here yet.',
	emptySlot: 'Empty slot',
	sells: (price) => `sells for ${price}`,
	summary: (used, slots, total) => `${used} of ${slots} slots used · ${total} ${total === 1 ? 'thing' : 'things'} in all`,
};

export function createInventory<K extends string>({
	slots,
	kinds,
	store,
	grid,
	detail,
	summary,
	note,
	words,
}: {
	slots: number;
	/** Each kind of thing, and what it's called on its tag. */
	kinds: Record<K, string>;
	/** Where what's in the bag is remembered (a list of [id, count]); nowhere, without it. */
	store?: { load(): unknown; save(stacks: [string, number][]): void };
	grid: HTMLElement | null;
	detail: HTMLElement | null;
	summary: HTMLElement | null;
	/** Anything more to say under the bag, like how many coins she has. */
	note?: () => string;
	/** Its words, for any it should say differently (English without them). */
	words?: Partial<BagWords>;
}): Inventory<K> {
	const say: BagWords = { ...ENGLISH, ...words };
	const defs = new Map<string, ItemDef<K>>();
	/** In the order they went in, which is the order they sit in the bag. */
	const stacks = new Map<string, number>();
	let selected: string | null = null;

	{
		const saved = store?.load();
		if (Array.isArray(saved))
			for (const entry of saved)
				if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number' && entry[1] > 0) stacks.set(entry[0], Math.floor(entry[1]));
	}
	const save = () => store?.save([...stacks]);

	const picture = (def: ItemDef<K> | undefined, className: string) => {
		const el = document.createElement('span');
		el.className = className;
		const url = def?.icon?.();
		if (url) el.style.backgroundImage = `url(${url})`;
		else el.style.backgroundColor = def?.color ?? '#c9d3ff';
		return el;
	};

	const renderDetail = () => {
		if (!detail) return;
		const def = selected ? defs.get(selected) : undefined;
		const n = selected ? (stacks.get(selected) ?? 0) : 0;
		if (!def || !n) {
			const empty = document.createElement('p');
			empty.className = 'bag-empty';
			empty.textContent = stacks.size ? say.pick : say.empty;
			detail.replaceChildren(empty);
			return;
		}
		const name = document.createElement('h3');
		name.textContent = def.name;
		const tag = document.createElement('span');
		tag.className = `bag-tag kind-${def.kind}`;
		tag.textContent = `${kinds[def.kind]} · ×${n}${def.sell ? ` · ${say.sells(def.sell)}` : ''}`;
		const about = document.createElement('p');
		about.textContent = def.description;
		const actions = document.createElement('div');
		actions.className = 'bag-actions';
		for (const action of def.actions ?? []) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'pill';
			button.textContent = action.label;
			button.addEventListener('click', () => action.run(def.id));
			actions.append(button);
		}
		const text = document.createElement('div');
		text.append(name, tag, about, actions);
		detail.replaceChildren(picture(def, 'bag-picture'), text);
	};

	const render = () => {
		if (summary) {
			const total = [...stacks.values()].reduce((a, b) => a + b, 0);
			const more = note?.();
			summary.textContent = `${say.summary(stacks.size, slots, total)}${more ? ` · ${more}` : ''}`;
		}
		if (grid) {
			const cells: HTMLElement[] = [];
			const ids = [...stacks.keys()];
			for (let i = 0; i < slots; i++) {
				const id = ids[i];
				const def = id ? defs.get(id) : undefined;
				const cell = document.createElement('button');
				cell.type = 'button';
				cell.className = 'slot';
				if (!id) {
					cell.disabled = true;
					cell.setAttribute('aria-label', say.emptySlot);
				} else {
					cell.setAttribute('aria-label', `${def?.name ?? id}, ${stacks.get(id)}`);
					cell.setAttribute('aria-pressed', String(id === selected));
					cell.append(picture(def, 'slot-picture'));
					const n = document.createElement('span');
					n.className = 'slot-count';
					n.textContent = String(stacks.get(id));
					cell.append(n);
					cell.addEventListener('click', () => {
						selected = id;
						render();
					});
				}
				cells.push(cell);
			}
			grid.replaceChildren(...cells);
		}
		renderDetail();
	};

	const changed = () => {
		if (selected && !stacks.has(selected)) selected = null;
		save();
		render();
	};

	return {
		register(def) {
			defs.set(def.id, def);
		},
		add(id, n = 1) {
			if (!stacks.has(id) && stacks.size >= slots) return false;
			stacks.set(id, (stacks.get(id) ?? 0) + n);
			selected ??= id;
			changed();
			return true;
		},
		remove(id, n = 1) {
			const have = stacks.get(id) ?? 0;
			if (have < n) return false;
			if (have === n) stacks.delete(id);
			else stacks.set(id, have - n);
			changed();
			return true;
		},
		count: (id) => stacks.get(id) ?? 0,
		has: (id) => stacks.has(id),
		fits: (id) => stacks.has(id) || stacks.size < slots,
		def: (id) => defs.get(id),
		entries: () => [...stacks],
		render,
	};
}
