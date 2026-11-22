// Moonbell Steps: a compact spiral of jumps around a floating belfry.
import * as THREE from 'three';
import type { GameContext } from '../../lib/nixkit/meta';
import { pick } from '../../lib/nixkit/lang';
import { COLORS, dressCourse } from './art';
import { bearing, FINISH, RESTS, RETURN_Y, SLAB_HEIGHT, STEPS } from './course';

const words = pick({
	en: {
		title: 'Moonbell Steps',
		intro: 'Follow the gold arrows. Run to cross the wider gaps.',
		checkpoints: 'Landings',
		touched: 'Landing saved',
		back: 'Back to landing',
		returned: 'Back at the last landing',
		finish: 'You rang the moonbell!',
		complete: 'Bell rung',
		replay: 'Climb again',
	},
	ko: {
		title: '달빛 종탑',
		intro: '금빛 화살표를 따라가요. 간격이 넓으면 달려서 뛰어요.',
		checkpoints: '쉼터',
		touched: '쉼터에 도착했어요',
		back: '쉼터로',
		returned: '마지막 쉼터로 돌아왔어요',
		finish: '달빛 종을 울렸어요!',
		complete: '등반 완료',
		replay: '다시 오르기',
	},
});

const position = (index: number) => {
	const { x, y, z } = STEPS[index];
	return new THREE.Vector3(x, y, z);
};

export default function start({ createGame, store }: GameContext) {
	let restore = 0;
	let cleared = false;
	const game = createGame({
		spawn: { pos: position(0), heading: bearing(0) },
		world: (parts) => ({ ...parts.world, fallOut: RETURN_Y - 5 }),
		onKey(key, event) {
			if (key === 'r' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey &&
				!(event.target instanceof HTMLElement && event.target.closest('button,a,input,textarea,select'))) restart();
		},
	});
	if (!game) return;
	const { hud, parts } = game;
	const art = dressCourse(game);
	let count = 0;
	const label = () => cleared ? words.complete : `${words.checkpoints} ${count}/${RESTS.length}`;
	const progress = hud.stat(label());
	const recover = hud.button(words.back, () => cleared ? restart() : returnToLanding(false));
	const rememberedWins = store.get('wins');
	let wins = typeof rememberedWins === 'number' && Number.isSafeInteger(rememberedWins) && rememberedWins >= 0
		? rememberedWins : 0;

	STEPS.forEach((s, i) => {
		const finish = i === FINISH;
		const tier = RESTS.filter((r) => r <= i).length;
		parts.add({
			at: [s.x, s.y - SLAB_HEIGHT / 2, s.z],
			size: [s.diameter, SLAB_HEIGHT, s.diameter],
			shape: 'cylinder',
			color: COLORS[finish ? 4 : tier],
			onTouch: s.checkpoint || finish ? () => {
				if (cleared) return;
				if (s.checkpoint) {
					// A repeated or backward visit never overwrites our newest safe landing.
					if (s.checkpoint !== count + 1) return;
					count = s.checkpoint;
					restore = i;
					parts.setSpawn(position(i), bearing(i));
					art.checkpoint(count);
					progress.set(label());
					hud.toast(words.touched, 1.6);
				} else if (count === RESTS.length) {
					cleared = true;
					restore = i;
					parts.setSpawn(position(i), bearing(i - 1));
					store.set('wins', ++wins);
					art.ring();
					progress.set(label());
					recover.textContent = words.replay;
					hud.banner(words.finish, '', 4);
					game.emote('happy', 2.8);
				}
			} : undefined,
		});
	});
	function returnToLanding(notify: boolean) {
		game!.teleport(position(restore), bearing(Math.min(restore, FINISH - 1)));
		if (notify) hud.toast(words.returned, 1.45);
	}
	function restart() {
		count = 0; restore = 0; cleared = false;
		parts.reset(position(0), bearing(0));
		game!.clearEmote();
		game!.teleport(position(0), bearing(0));
		art.reset();
		progress.set(label());
		recover.textContent = words.back;
	}
	game.onUpdate(() => {
		if (game.player.pos.y < RETURN_Y) returnToLanding(true);
	});
	game.loaded.then(() => hud.banner(words.title, words.intro, 4), () => {});
	void game.start();
}
