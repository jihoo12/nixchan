// The menu over the island: her bag, the map, the fish book and help, a tab each (nixkit/menu.ts).
// Help opens by itself the first time she arrives.
import { createMenu as createTabs } from '../nixkit/menu';
import { loadText, saveText } from './save';

export type Tab = 'bag' | 'map' | 'fish' | 'help';

type Options = Omit<Parameters<typeof createTabs<Tab>>[0], 'start' | 'seen'>;

export const createMenu = (opts: Options) =>
	createTabs<Tab>({
		...opts,
		start: 'map',
		seen: { get: () => !!loadText('helpSeen'), set: () => saveText('helpSeen', '1') },
	});
