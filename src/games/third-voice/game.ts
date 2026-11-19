import { attachAgentBridge } from '../../lib/nixkit/agent-bridge';
import type { GameContext } from '../../lib/nixkit/meta';
import { NPCS, type NpcId } from './story';
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
	let agent: ReturnType<typeof attachAgentBridge> | undefined;
	let disposed = false;
	void Promise.all([game.loaded, game.drawing]).then(([, draws]) => {
		if (disposed) return;
		docket.reveal(!draws);
		if (!draws) return;
		const ko = new URLSearchParams(location.search).get('lang') === 'ko'
			|| (new URLSearchParams(location.search).get('lang') !== 'en' && navigator.language.startsWith('ko'));
		agent = attachAgentBridge({
			game: 'third-voice',
			canAct: () => game.ready && !game.paused,
			canMove: () => !docket.isOpen,
			movement: game.controls.agentMovement,
			observe: () => {
				const { x, y, z } = game.player.pos;
				const { yaw } = game.orbit;
				const landmarks = tribunalWitnesses
					.map(({ id, pos }) => {
						const npc = NPCS.find(candidate => candidate.id === id);
						const dx = pos.x - x, dz = pos.z - z;
						return { label: npc ? `${npc.name[ko ? 'ko' : 'en']} · ${npc.location[ko ? 'ko' : 'en']}` : id, dx, dz, distance: Math.hypot(dx, dz) };
					})
					.filter(landmark => landmark.distance <= 10);
				return {
					position: { x, y, z },
					ready: game.ready,
					paused: game.paused,
					navigation: {
						forward: { x: -Math.sin(yaw), z: -Math.cos(yaw) },
						right: { x: Math.cos(yaw), z: -Math.sin(yaw) },
						landmarks,
					},
					nearbyAction: docket.agentNearbyAction(),
					dialogue: docket.agentDialogue(),
					clues: docket.agentClues(),
				};
			},
			interact: () => {
				if (!docket.agentNearbyAction()) return false;
				docket.interact();
				return docket.isOpen;
			},
			choose: docket.agentChoose,
		});
	}, () => { if (!disposed) docket.reveal(true); });
	game.engine.add({ dispose() { disposed = true; agent?.dispose(); docket.dispose(); } });
	void game.start();
}
