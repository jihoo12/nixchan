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
	let active = false;
	let selected: BuildItem | null = null;
	function close() {
		if (!active) return;
		putAway();
		active = false;
		selected = null;
	}
	function toggle() {
		if (active) close();
		else if (canBuild()) active = true;
	}
	function select(item: BuildItem) {
		if (!canBuild()) return false;
		putAway();
		active = true;
		selected = item;
		choose(item);
		return true;
	}
	function remove() {
		if (active && selected && canBuild()) take(selected);
	}
	function offer(): Offer | undefined {
		if (!active) return undefined;
		if (!canBuild()) return { label: pick({ en: 'Stand on dry ground to build', ko: '마른 땅에 서서 건축하세요' }) };
		if (!selected) return { label: pick({ en: 'Choose an item to build', ko: '설치할 물건을 고르세요' }) };
		return placement(selected) ?? {
			label: pick({ en: 'No placement here · Q to remove', ko: '여기엔 설치할 수 없어요 · Q로 회수' }),
		};
	}
	return { toggle, select, close, remove, offer, get active() { return active; }, get selected() { return selected; } };
}
