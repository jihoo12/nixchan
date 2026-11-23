// Things to do with E (or the on-screen button). Anything on the island that she can do something
// with registers a source; each frame the first source with something to offer wins, its label goes
// in the prompt, and pressing E does it. A source returns null when it has nothing to say, or a
// label alone for something to read but not do ("The can is empty").

export interface Offer {
	label: string;
	/** What pressing E does; without it the prompt shows greyed out. */
	go?: () => void;
}

export type OfferSource = () => Offer | null;

export function createInteractions({ override }: { override?: () => Offer | null | undefined } = {}) {
	const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
	const ui = { prompt: $('[data-act-prompt]'), text: $('[data-act-text]'), button: $<HTMLButtonElement>('[data-act]') };
	const sources: OfferSource[] = [];
	let current: Offer | null = null;

	const find = () => {
		const foreground = override?.();
		if (foreground !== undefined) return foreground;
		for (const source of sources) {
			const offer = source();
			if (offer) return offer;
		}
		return null;
	};

	/** Does what's on offer, if anything is; returns whether it did. */
	const press = () => {
		// An exclusive mode can open, change item, or close between frames. Both touch and
		// keyboard must resolve the current mode, never use an offer cached before the switch.
		const action = override ? find() : current;
		if (!action?.go) return false;
		action.go();
		current = null;
		return true;
	};
	ui.button?.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		press();
	});
	// A long press on a phone mustn't bring up the menu for copying the button's text.
	ui.button?.addEventListener('contextmenu', (e) => e.preventDefault());

	return {
		/** Adds a source of things to do. Earlier sources come first. */
		add(source: OfferSource) {
			sources.push(source);
		},
		press,
		/** Asks the sources what's on offer now, and shows it. */
		update() {
			current = find();
			const label = current?.label ?? '';
			ui.prompt?.toggleAttribute('hidden', !current);
			ui.prompt?.classList.toggle('inactive', !current?.go);
			if (ui.text) ui.text.textContent = label;
			if (ui.button) {
				ui.button.hidden = !current?.go;
				ui.button.textContent = label.split(' ')[0] || 'Do';
			}
		},
	};
}

export type Interactions = ReturnType<typeof createInteractions>;
