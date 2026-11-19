// A menu over the game, a tab a panel (on the island: her bag, the map, the fish book and help). The
// page's own elements are the menu: `root` holds it, buttons marked data-tab="<tab>" switch to a
// tab's panel (data-panel="<tab>"), and buttons marked data-open="<tab>" open it at one from
// anywhere. Panels written out once per language (data-help-lang="en" / "ko") show only the page's.
// `seen` remembers whether she's been here before, for help that opens by itself the first time.
import { lang } from './lang';
import { closeOnBackdrop } from './util';

export function createMenu<Tab extends string>({
	root,
	close,
	start,
	seen,
	onOpen,
	onShow,
}: {
	root: HTMLElement | null;
	close: HTMLButtonElement | null;
	/** The tab it shows until another's been opened. */
	start: Tab;
	/** Whether she's been here before, and remembering that she has. */
	seen?: { get(): boolean; set(): void };
	/** The menu's come up over the game (so let go of whatever she's holding). */
	onOpen: () => void;
	/** A tab's been shown, to draw anything on it that needs drawing. */
	onShow: (tab: Tab) => void;
}) {
	let open = false;
	let current: Tab = start;
	const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')];
	const panels = [...document.querySelectorAll<HTMLElement>('[data-panel]')];
	// Help is written out in each language; show the page's (lang.ts).
	for (const el of document.querySelectorAll<HTMLElement>('[data-help-lang]')) el.hidden = el.dataset.helpLang !== lang;
	const showTab = (tab: Tab) => {
		current = tab;
		for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === tab));
		for (const panel of panels) panel.hidden = panel.dataset.panel !== tab;
		onShow(tab);
	};
	const openMenu = (tab: Tab) => {
		if (!root) return;
		open = true;
		root.hidden = false;
		onOpen();
		showTab(tab);
		tabs.find((t) => t.dataset.tab === tab)?.focus();
	};
	const closeMenu = () => {
		if (!root || !open) return;
		open = false;
		root.hidden = true;
		(document.activeElement as HTMLElement | null)?.blur();
	};
	/** Opens the menu at a tab, or closes it if it's already showing that tab. */
	const toggle = (tab: Tab) => {
		if (open && current === tab) closeMenu();
		else openMenu(tab);
	};
	for (const t of tabs) t.addEventListener('click', () => showTab(t.dataset.tab as Tab));
	for (const button of document.querySelectorAll<HTMLButtonElement>('[data-open]'))
		button.addEventListener('click', () => {
			toggle(button.dataset.open as Tab);
			if (!open) button.blur();
		});
	close?.addEventListener('click', closeMenu);
	closeOnBackdrop(root, closeMenu);

	const firstVisit = (() => {
		if (!seen || seen.get()) return false;
		seen.set();
		return true;
	})();

	return {
		open: openMenu,
		close: closeMenu,
		toggle,
		get isOpen() {
			return open;
		},
		get tab() {
			return current;
		},
		/** Whether this is her first time here (when help should open by itself). */
		firstVisit,
	};
}
