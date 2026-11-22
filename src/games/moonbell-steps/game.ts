// Moonbell Steps, and a harder climb that opens once Nixchan has rung the first bell.
import * as THREE from 'three';
import type { GameContext } from '../../lib/nixkit/meta';
import { pick } from '../../lib/nixkit/lang';
import { COLORS, dressCourse } from './art';
import { BONUS_COLORS, dressBonus } from './bonus-art';
import { bonusBearing, BONUS_FINISH, BONUS_RESTS, BONUS_RETURN_Y, BONUS_STEPS } from './bonus';
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
		mainButton: 'Main course',
		bonusButton: 'Bonus course',
		bonusTitle: 'Beyond the Moonbell',
		bonusIntro: 'Run for the long jumps. Watch the sliding platforms before you leap.',
		bonusReady: 'The bonus course is open. Jump past the bell or use Bonus course.',
		bonusCheckpoints: 'Bonus landings',
		bonusFinish: 'You reached the moon compass!',
		bonusComplete: 'Bonus complete',
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
		mainButton: '기본 코스',
		bonusButton: '추가 코스',
		bonusTitle: '달빛 너머',
		bonusIntro: '긴 구간은 달려서 뛰고, 움직이는 발판은 위치를 보고 건너요.',
		bonusReady: '종 너머로 뛰거나 ‘추가 코스’를 눌러 다음 등반을 시작해요.',
		bonusCheckpoints: '추가 코스 쉼터',
		bonusFinish: '달빛 나침반에 도착했어요!',
		bonusComplete: '추가 등반 완료',
	},
});

const courses = {
	main: { steps: STEPS, bearing, finish: FINISH, rests: RESTS, fallY: RETURN_Y },
	bonus: { steps: BONUS_STEPS, bearing: bonusBearing, finish: BONUS_FINISH, rests: BONUS_RESTS, fallY: BONUS_RETURN_Y },
};
type Course = keyof typeof courses;
const position = (course: Course, index: number) => {
	const { x, y, z } = courses[course].steps[index];
	return new THREE.Vector3(x, y, z);
};
const safeHeading = (course: Course, index: number) => {
	const route = courses[course];
	return route.bearing(Math.min(index, route.finish - 1));
};
const fresh = () => ({ restore: 0, count: 0, cleared: false });
const winCount = (n: unknown): number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0;

export default function start({ createGame, store }: GameContext) {
	let active: Course = 'main';
	const run = { main: fresh(), bonus: fresh() };
	let wins = winCount(store.get('wins'));
	let bonusWins = winCount(store.get('bonusWins'));
	const game = createGame({
		spawn: { pos: position('main', 0), heading: bearing(0) },
		world: (parts) => ({ ...parts.world, fallOut: RETURN_Y - 5 }),
		onKey(key, event) {
			if (key === 'r' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey &&
				!(event.target instanceof HTMLElement && event.target.closest('button,a,input,textarea,select'))) restart();
		},
	});
	if (!game) return;
	const { hud, parts, teleport, clearEmote } = game;
	const art = dressCourse(game);
	const label = () => {
		const s = run[active];
		const bonus = active === 'bonus';
		if (s.cleared) return bonus ? words.bonusComplete : words.complete;
		return `${bonus ? words.bonusCheckpoints : words.checkpoints} ${s.count}/${courses[active].rests.length}`;
	};
	const progress = hud.stat(label());
	const recover = hud.button(words.back, () => run[active].cleared ? restart() : returnToLanding(false));
	const courseButton = hud.button(words.bonusButton, () => switchCourse(active === 'main' ? 'bonus' : 'main'));
	function refresh() {
		progress.set(label());
		recover.textContent = run[active].cleared ? words.replay : words.back;
		courseButton.textContent = active === 'main' ? words.bonusButton : words.mainButton;
		courseButton.hidden = active === 'main' && wins === 0;
	}
	refresh();

	function arrive(course: Course, i: number, checkpoint?: number) {
		if (active !== course || run[course].cleared) return;
		const state = run[course], route = courses[course];
		const decorations = course === 'main' ? art : bonusArt;
		if (checkpoint) {
			// Visited out of order or backtracking: keep the highest reached landing.
			if (checkpoint !== state.count + 1) return;
			state.count = checkpoint;
			state.restore = i;
			parts.setSpawn(position(course, i), safeHeading(course, i));
			decorations.checkpoint(checkpoint);
			hud.toast(words.touched, 1.6);
		} else if (i === route.finish && state.count === route.rests.length) {
			state.cleared = true;
			state.restore = i;
			parts.setSpawn(position(course, i), safeHeading(course, i));
			if (course === 'main') {
				wins = Math.min(Number.MAX_SAFE_INTEGER, wins + 1);
				store.set('wins', wins);
				hud.banner(words.finish, words.bonusReady, 5);
			} else {
				bonusWins = Math.min(Number.MAX_SAFE_INTEGER, bonusWins + 1);
				store.set('bonusWins', bonusWins);
				hud.banner(words.bonusFinish, '', 4);
			}
			decorations.ring();
			game!.emote('happy', 2.8);
		}
		refresh();
	}

	for (const [i, s] of STEPS.entries()) {
		const tier = RESTS.filter((r) => r <= i).length;
		parts.add({
			at: [s.x, s.y - SLAB_HEIGHT / 2, s.z],
			size: [s.diameter, SLAB_HEIGHT, s.diameter],
			shape: 'cylinder',
			color: COLORS[i === FINISH ? 4 : tier],
			onTouch: s.checkpoint || i === FINISH ? () => arrive('main', i, s.checkpoint) : undefined,
		});
	}
	const bonusPads = BONUS_STEPS.map((s, i) => parts.add({
		at: [s.x, s.y - SLAB_HEIGHT / 2, s.z],
		size: [s.diameter, SLAB_HEIGHT, s.diameter],
		shape: 'cylinder',
		color: BONUS_COLORS[i === BONUS_FINISH ? 4 : BONUS_RESTS.filter((r) => r <= i).length],
		move: s.move,
		onTouch: i === 0 ? () => switchCourse('bonus', false) :
			s.checkpoint || i === BONUS_FINISH ? () => arrive('bonus', i, s.checkpoint) : undefined,
	}));
	const bonusArt = dressBonus(game, bonusPads);

	function switchCourse(next: Course, warp = true) {
		if (next === active || (next === 'bonus' && wins === 0)) return;
		active = next;
		clearEmote();
		if (warp) returnToLanding(false);
		else {
			const at = run[active].restore;
			parts.setSpawn(position(active, at), safeHeading(active, at));
		}
		refresh();
		if (active === 'bonus' && !run.bonus.cleared && run.bonus.count === 0)
			hud.banner(words.bonusTitle, words.bonusIntro, 4.2);
	}
	function returnToLanding(notify: boolean) {
		const i = run[active].restore;
		teleport(position(active, i), safeHeading(active, i));
		if (notify) hud.toast(words.returned, 1.45);
	}
	function restart() {
		run[active] = fresh();
		parts.reset(position(active, 0), safeHeading(active, 0));
		clearEmote();
		returnToLanding(false);
		(active === 'main' ? art : bonusArt).reset();
		refresh();
	}
	game.onUpdate(() => {
		const p = game.player;
		const fellIntoLowerCourse = active === 'bonus' && p.grounded && p.pos.y < BONUS_STEPS[0].y - .05;
		if (p.pos.y < courses[active].fallY || fellIntoLowerCourse) returnToLanding(true);
	});
	game.loaded.then(() => hud.banner(words.title, words.intro, 4), () => {});
	void game.start();
}
