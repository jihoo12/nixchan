import type { GameContext } from '../../lib/nixkit/meta';
import type { NpcId } from './story';
import { createDocket } from './ui';
import { createTribunal, tribunalSpawn, tribunalStations, tribunalTerrain, tribunalWitnesses } from './world';

export default function start({ createGame, store }: GameContext) {
	const docket = createDocket(store);
	const game = createGame({
		spawn: tribunalSpawn, world: tribunalTerrain,
		onKey(key, event) {
			if (key !== 'e' || event.repeat || !game?.ready || event.target instanceof Element && event.target.closest('button, input, textarea, select, a')) return;
			game.controls.state.waveQueued = false;
			docket.interact();
		},
		hold: () => docket.isOpen && game ? game.player.heading : null,
	});
	let near: number | undefined;
	let witness: NpcId | undefined;
	if (!game) { docket.reveal(true); return; }
	const sync = createTribunal(game);
	docket.onChange((active, completed) => sync(active, completed));
	game.onUpdate(() => {
		const distance = (point: { x: number; z: number }) => Math.hypot(point.x - game.player.pos.x, point.z - game.player.pos.z);
		const next = tribunalStations.findIndex((point) => distance(point) < 2.35);
		const selected = next < 0 ? undefined : next;
		const localWitness = tribunalWitnesses.find(({ pos }) => distance(pos) < 2.65)?.id;
		if (near !== selected || witness !== localWitness) {
			near = selected;
			witness = localWitness;
			docket.setNear(near, witness);
		}
	});
	game.keys.intercept(() => docket.isOpen, 100);
	void Promise.all([game.loaded, game.drawing]).then(([, draws]) => docket.reveal(!draws), () => docket.reveal(true));
	game.engine.add({ dispose: docket.dispose });
	void game.start();
}
