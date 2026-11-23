import type { Offer } from '../nixkit/interact';
import { pick } from './lang';

export const BUILD_ITEMS = ['stone-block', 'belt', 'windmill', 'drill', 'sprinkler', 'ore-hopper'] as const;
export type BuildItem = (typeof BUILD_ITEMS)[number];

export function createBuildMode({
	canBuild, putAway, choose, placement, take,
}: {
	canBuild: () => boolean;
	putAway: () => void;
	choose: (item: BuildItem) => void;
	placement: (item: BuildItem) => Offer | null;
	take: (item: BuildItem) => void;
}) {
	let pickerOpen = false;
	let selected: BuildItem | null = null;
	// The chooser and the equipped tool are independent. A modal can collapse the
	// chooser without disturbing the equipped tool or the preview and its aim.
	function closePicker() {
		pickerOpen = false;
	}
	function finish() {
		closePicker();
		if (selected) putAway();
		selected = null;
	}
	function togglePicker() {
		if (pickerOpen) closePicker();
		else if (canBuild()) pickerOpen = true;
	}
	function select(item: BuildItem) {
		if (!canBuild()) return false;
		if (selected !== item) {
			putAway();
			selected = item;
			choose(item);
		}
		closePicker();
		return true;
	}
	function remove() {
		if (!pickerOpen && selected && canBuild()) take(selected);
	}
	function offer(): Offer | null | undefined {
		// The picker blocks world actions but should not cover the game with a second hint.
		if (pickerOpen) return null;
		if (!selected) return undefined;
		if (!canBuild()) return { label: pick({ en: 'Stand on dry ground to build', ko: '마른 땅에 서서 건축하세요' }) };
		return placement(selected) ?? {
			label: pick({ en: 'No placement here · Q to remove', ko: '여기엔 설치할 수 없어요 · Q로 회수' }),
		};
	}
	return {
		togglePicker, closePicker, select, finish, remove, offer,
		get pickerOpen() { return pickerOpen; },
		get busy() { return pickerOpen || selected !== null; },
		get selected() { return selected; },
	};
}
