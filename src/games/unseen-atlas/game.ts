import type { GameContext } from '../../lib/nixkit/meta';
import { atlasSpawn, atlasTerrain, buildAtlasWorld } from './world';
import { createAtlas } from './ui';

export default function start({ createGame, store }: GameContext) {
	const atlas = createAtlas(store);
	const game = createGame({
		spawn: atlasSpawn, world: atlasTerrain,
		onKey(key, event) {
			if (key === 'e' && !event.repeat && game?.ready &&
				!(event.target instanceof Element && event.target.closest('button, a'))) {
				game.controls.state.waveQueued = false;
				atlas.open();
			}
		},
		hold: () => atlas.isOpen && game ? game.player.heading : null,
	});
	if (!game) { atlas.reveal(true); return; }
	const syncWorld = buildAtlasWorld(game);
	atlas.onChange((chapter, solved, links) => syncWorld(chapter, solved, links));
	game.keys.intercept((key, event) => {
		if (!atlas.isOpen) return false;
		if (key === 'e') { if (!event.repeat) atlas.close(); return true; }
		// Keep native dialog focus, escape, scrolling and button activation intact.
		return true;
	}, 100);
	void Promise.all([game.loaded, game.drawing]).then(([, draws]) => atlas.reveal(!draws), () => atlas.reveal(true));
	game.engine.add({ dispose: atlas.dispose });
	void game.start();
}
