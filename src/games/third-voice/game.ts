import type { GameContext } from '../../lib/nixkit/meta';
import { createDocket } from './ui';
import { createTribunal, tribunalSpawn, tribunalStations, tribunalTerrain } from './world';

export default function start({ createGame, store }: GameContext) {
	const docket = createDocket(store);
	const game = createGame({
		spawn: tribunalSpawn, world: tribunalTerrain,
		onKey(key, event) {
			if (key !== 'e' || event.repeat || !game?.ready || event.target instanceof Element && event.target.closest('button, input, textarea, select, a')) return;
			game.controls.state.waveQueued = false;
			docket.open(near);
		},
		hold: () => docket.isOpen && game ? game.player.heading : null,
	});
	let near: number | undefined;
	if (!game) { docket.reveal(true); return; }
	const sync = createTribunal(game);
	docket.onChange((active, completed) => sync(active, completed));
	game.onUpdate(() => {
		const next = tribunalStations.findIndex((point) => Math.hypot(point.x - game.player.pos.x, point.z - game.player.pos.z) < 2.15);
		const selected = next < 0 ? undefined : next;
		if (near !== selected) { near = selected; docket.setNear(near); }
	});
	game.keys.intercept((_key, _event) => docket.isOpen, 100);
	void Promise.all([game.loaded, game.drawing]).then(([, draws]) => docket.reveal(!draws), () => docket.reveal(true));
	game.engine.add({ dispose: docket.dispose });
	void game.start();
}
