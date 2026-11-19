// Nixchan's bag on the island: Nixkit's (nixkit/inventory.ts), with the island's kinds of thing,
// remembered under the island's key.
import { createInventory as createBag, type Inventory as Bag, type ItemDef as Def } from '../nixkit/inventory';
import { loadJSON, saveJSON } from './save';

export type { ItemAction } from '../nixkit/inventory';

export type ItemKind = 'fish' | 'seed' | 'crop' | 'tool' | 'material';
export type ItemDef = Def<ItemKind>;
export type Inventory = Bag<ItemKind>;

const KINDS: Record<ItemKind, string> = { fish: 'Fish', seed: 'Seed', crop: 'Crop', tool: 'Tool', material: 'Material' };

export function createInventory(opts: { slots: number; grid: HTMLElement | null; detail: HTMLElement | null; summary: HTMLElement | null; note?: () => string }): Inventory {
	return createBag({
		...opts,
		kinds: KINDS,
		store: { load: () => loadJSON('bag'), save: (stacks) => saveJSON('bag', stacks) },
		words: { empty: 'Nothing in here yet. Try fishing off the pier!' },
	});
}
