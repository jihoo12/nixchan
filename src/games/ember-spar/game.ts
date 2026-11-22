// Ember Spar: up on a rooftop at sunset, Nixchan spars with Noeul (노을), an ember mage in a black
// hooded jacket: snow against embers, all in fun.
//
// Noeul hovers round her and throws embers three ways, each shown before it comes:
//
//   Volley      her hand drawn back, glowing: a fan of embers thrown at Nixchan (step aside)
//   Flame ring  both arms raised, then brought down: a ring of flame runs out along the roof
//               (jump it)
//   Ember rain  arms up to the sky: rings mark the roof round Nixchan, and embers fall in them
//               (get out of the rings)
//
// and blinks away in a puff of embers if Nixchan stays too close, or out of her blizzard. Once her
// ember's half out, she tries for real: more embers, faster, and
//
//   Lantern     a great ember that drifts after Nixchan till it reaches her (outrun it, or put it
//               out: three snowballs, or a slam)
//
// and once it's down to a third, she calls her own sunset down, once a round:
//
//   Afterglow   up into the sky, nothing stops her: rings, ember rain and embers all round
//
// Nixchan has her snow magic, on 1 to 5 (or the buttons along the bottom), and turns to Noeul to
// cast:
//
//   1 Frost Shot      a snowball that curves after Noeul; it puts out an ember it meets
//   2 Glacier Slam    a ring of snow round her: hits hard, twice over, but not far
//   3 Blizzard Crown  a storm turns round her for a while: it frosts Noeul if she's in it, and
//                     puts out embers that come near
//   4 Snow Dash       a dash that nothing can catch, that frosts Noeul if it runs into her
//   5 Eternal Winter  once its gauge fills: her ultimate, the cutscene from Snow Magic
//                     (eternal-winter.ts), with ice bursting up across the whole roof
//
// Five snowflakes are how much warmth Nixchan can take; Noeul's ember gauge is how much snow she can.
// Whoever runs out first sits the round out, laughing, and they go again.
import * as THREE from 'three';
import type { GameContext, NixClip } from '../../lib/nixkit/meta';
import { pick } from '../../lib/nixkit/lang';
import { addSnow } from '../../lib/nixkit/snow';
import { buildArena, ROOF } from './arena';
import { createEternalWinter, LENGTH as ULTIMATE_LENGTH } from './eternal-winter';
import { createFx } from './fx';
import { createNoeul, SCALE, type PoseName } from './noeul';

/** How much warmth Nixchan can take (in snowflakes), and how much snow Noeul's ember can. */
const HEARTS = 5;
const EMBER = 150;
/** How much each of Nixchan's spells puts out. */
const SHOT = 6;
const SLAM = 8;
const SLAM_REACH = 6.5;
const STORM = 2;
const DASH = 5;
const ULTIMATE = 26;
/** How many snowballs put out one of Noeul's lanterns. */
const LANTERN_HP = 3;
/** How far Noeul likes to keep from Nixchan, and how far from the roof's middle she'll go. */
const KEEP = 8;
const REACH = ROOF - 2.5;
/** How long Nixchan can't be caught after she's been. */
const SAFE_AFTER_HIT = 1.4;
/** The ultimate's gauge: from her hits, from being hit, and by itself each second. */
const CHARGE_HIT = 0.03;
const CHARGE_HURT = 0.1;
const CHARGE_SECOND = 1 / 150;

/** How far `p` is from the line from `a` to `b`, on the ground. */
function segmentDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
	const dx = b.x - a.x;
	const dz = b.z - a.z;
	const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
	return Math.hypot(p.x - a.x - dx * k, p.z - a.z - dz * k);
}

const NIX_START = new THREE.Vector3(0, 0, -5);
const NOEUL_START = new THREE.Vector3(0, 0, 4);

interface Spell {
	name: string;
	key: string;
	clip: NixClip;
	busy: number;
	cool: number;
	/** How far into her animation (0 … 1) the magic comes out. */
	at: number;
	cast: () => void;
	ultimate?: boolean;
}

/** Something Noeul's doing: a pose, how long, and what happens when. */
interface Act {
	name: 'drift' | 'volley' | 'ring' | 'rain' | 'blink' | 'hit' | 'won' | 'lost' | 'enter' | 'awe' | 'lantern' | 'afterglow';
	t: number;
	length: number;
	events: [number, () => void][];
}

export default function start({ createGame, store }: GameContext) {
	type Phase = 'loading' | 'intro' | 'fight' | 'won' | 'lost';
	let phase: Phase = 'loading';
	let casting: Spell | null = null;
	let castT = 0;
	let fired = false;

	const game = createGame({
		spawn: { pos: NIX_START.clone(), heading: 0 },
		canDash: () => true,
		clip: () => {
			if (casting) return casting.clip;
			// A fighting stance while she stands still in the spar.
			if (phase === 'fight' && game!.player.grounded && Math.hypot(game!.player.vel.x, game!.player.vel.z) < 0.25) return 'Ready';
			return null;
		},
		// Casting keeps her on the spot, turned to Noeul (a dash carries her itself).
		hold: () => (casting && casting.clip !== 'Dash' ? towardNoeul() : null),
		onKey: (key) => {
			const spell = spells.find((s) => s.key === key);
			if (spell) cast(spell);
			if (key === 'r') restart();
		},
	});
	if (!game) return;
	const { hud, player, scene } = game;
	const arena = buildArena(game);
	const fx = createFx(scene);
	const snow = addSnow(game, { fall: 0.015, area: 30, height: 16 });
	snow.wind.set(0.6, 0, 0.1);
	const noeul = createNoeul(game);
	game.engine.waitFor(noeul.ready);

	const say = (en: string, ko: string, seconds = 3.2) => {
		hud.toast(`${pick({ en: 'Noeul', ko: '노을' })}: ${pick({ en, ko })}`, seconds);
		noeul.talk(Math.min(seconds - 0.6, pick({ en, ko }).length * 0.06));
	};

	// ---------- the HUD ----------

	let wins = Number(store.get('wins') ?? 0);
	const heartStat = hud.stat('');
	const emberStat = hud.stat('');
	const winStat = hud.stat(`🏆 ${wins}`);
	let hearts = HEARTS;
	let ember = EMBER;
	const showHearts = () => heartStat.set(`${pick({ en: 'Nixchan', ko: '닉스쨩' })} ${'❄'.repeat(hearts)}${'·'.repeat(HEARTS - hearts)}`);
	const showEmber = () => {
		const n = Math.ceil((ember / EMBER) * 10);
		emberStat.set(`${pick({ en: 'Noeul', ko: '노을' })} 🔥${'▰'.repeat(n)}${'▱'.repeat(10 - n)}`);
	};
	showHearts();
	showEmber();
	hud.button(pick({ en: 'Spar again', ko: '다시 겨루기' }), () => restart());

	// ---------- Noeul ----------

	/** Where she is on the roof (her feet, under her hover), and which way she's drifting. */
	const npos = NOEUL_START.clone();
	const nvel = new THREE.Vector3();
	let strafe = 1;
	let strafeFlip = 3;
	let hover = 0.4;
	let facing = Math.PI;
	let act: Act = { name: 'enter', t: 0, length: 1, events: [] };
	let nextAttack = 2.2;
	let closeFor = 0;
	let recentHits: number[] = [];
	let serious = false;
	let urged = false;

	const chest = new THREE.Vector3();
	const hand = new THREE.Vector3();
	const nixChest = () => player.pos.clone().setY(player.pos.y + 1);
	function towardNoeul() {
		return Math.atan2(npos.x - player.pos.x, npos.z - player.pos.z);
	}

	// Nixchan's ultimate: its shock wave catches Noeul once, as it reaches her.
	let struck = false;
	const ult = createEternalWinter(game, snow, {
		arena: ROOF,
		snowmen: [npos],
		onWave(from, radius) {
			if (struck || Math.hypot(npos.x - from.x, npos.z - from.z) > radius) return;
			struck = true;
			hitNoeul(ULTIMATE, true);
		},
		onSkip() {
			if (casting?.ultimate) casting = null;
		},
		// Noeul steps out of the shot if she's between the cutscene's camera and Nixchan.
		onCamera(from, to) {
			if (act.name !== 'blink') noeul.group.visible = !from || segmentDistance(npos, from, to) > 1.4;
		},
	});

	function doAct(name: Act['name'], length: number, pose: PoseName, events: [number, () => void][] = [], speed = 10) {
		act = { name, t: 0, length, events };
		noeul.pose(pose, speed);
	}
	const drift = () => doAct('drift', Infinity, 'hover', [], 6);

	/** A spot on the roof `dist` from Nixchan, round from her at `angle`, kept on the roof. */
	function spotNear(angle: number, dist: number) {
		const p = new THREE.Vector3(player.pos.x + Math.sin(angle) * dist, 0, player.pos.z + Math.cos(angle) * dist);
		if (p.length() > REACH) p.setLength(REACH);
		return p;
	}

	// ---------- what's flying ----------

	interface Flying {
		mesh: THREE.Object3D;
		pos: THREE.Vector3;
		vel: THREE.Vector3;
		life: number;
		/** A snowball's lantern to curve after (Noeul if none). */
		target?: Lantern | null;
	}
	const embers: Flying[] = [];
	const snowballs: Flying[] = [];
	interface Ring {
		mesh: THREE.Object3D;
		r: number;
		speed: number;
		at: THREE.Vector3;
		caught: boolean;
	}
	const rings: Ring[] = [];
	interface Mark {
		mesh: THREE.Object3D;
		at: THREE.Vector3;
		t: number;
		fall: number;
		drop: THREE.Object3D | null;
	}
	const marks: Mark[] = [];
	/** Her lanterns: great embers drifting after Nixchan, put out by a few snowballs. */
	interface Lantern {
		mesh: THREE.Object3D;
		pos: THREE.Vector3;
		hp: number;
		life: number;
	}
	const lanterns: Lantern[] = [];
	const dropLantern = (l: Lantern, out: boolean) => {
		if (out) puff(l.pos, 2500, 5);
		else sparks(l.pos, 1200, 5);
		fx.lantern.give(l.mesh);
		lanterns.splice(lanterns.indexOf(l), 1);
	};
	/** Her blizzard: how long it has left, and till it next frosts Noeul. */
	let storm = 0;
	let stormTick = 0;
	/** Her dash: while it can still run into Noeul. */
	let dashStrike = 0;

	const ORANGE = '#ff8a3d';
	const GOLD = '#ffd36b';
	const sparks = (at: THREE.Vector3, count: number, speed = 4, dir = new THREE.Vector3(0, 1, 0), spread = 1) => {
		snow.burst(at, { count, dir, speed, spread, life: 1.1, color: ORANGE, size: 1.3 });
		snow.burst(at, { count: Math.round(count / 3), dir, speed: speed * 0.7, spread, life: 0.8, color: GOLD, size: 1.6 });
	};
	const puff = (at: THREE.Vector3, count: number, speed = 4) => {
		snow.burst(at, { count, dir: new THREE.Vector3(0, 1, 0), speed, spread: 1, life: 1.4, size: 1.4 });
		snow.burst(at, { count: Math.round(count / 2), dir: new THREE.Vector3(0, 1, 0), speed: speed * 0.6, spread: 1, life: 1, color: '#bfe3ff', size: 1.8 });
	};

	function throwEmber(from: THREE.Vector3, dir: THREE.Vector3, speed: number) {
		const mesh = fx.ember.take();
		mesh.position.copy(from);
		embers.push({ mesh, pos: mesh.position, vel: dir.clone().normalize().multiplyScalar(speed), life: 3.5 });
	}
	function dropEmber(e: Flying, i: number) {
		fx.ember.give(e.mesh);
		embers.splice(i, 1);
	}

	// ---------- Noeul's attacks ----------

	function volley(again: boolean) {
		const n = serious ? 5 : 3;
		const speed = serious ? 12.5 : 10;
		noeul.face('fierce', 1.4);
		doAct('volley', 1.25, 'aim', [
			[0.12, () => sparks(noeul.hand('R', hand), 300, 1.5)],
			[0.35, () => sparks(noeul.hand('R', hand), 300, 1.5)],
			[0.6, () => sparks(noeul.hand('R', hand), 300, 1.5)],
			[0.68, () => {
				noeul.pose('throw', 22);
				const from = noeul.hand('R', hand).clone();
				// Aimed where she is (and, trying for real, a little where she's going).
				const aim = nixChest().addScaledVector(player.vel, serious ? 0.3 : 0.08);
				const base = aim.sub(from);
				for (let i = 0; i < n; i++) {
					const spread = (i - (n - 1) / 2) * 0.24;
					throwEmber(from, base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread), speed);
				}
				sparks(from, 900, 6, base.clone().normalize(), 0.3);
			}],
			[1.0, () => noeul.pose('hover', 6)],
		], 9);
		if (again) act.events.push([1.2, () => volley(false)]);
	}

	function flameRing() {
		noeul.face('grin', 1.6);
		const events: [number, () => void][] = [
			[0.2, () => sparks(npos.clone().setY(hover * 1 + 2.6), 600, 2)],
			[0.55, () => sparks(npos.clone().setY(hover * 1 + 2.6), 600, 2)],
			[0.8, () => {
				noeul.pose('slam', 24);
				spawnRing();
			}],
			[1.25, () => noeul.pose('hover', 6)],
		];
		if (serious) {
			events.push([1.35, () => noeul.pose('gather', 14)], [1.75, () => {
				noeul.pose('slam', 24);
				spawnRing();
			}], [2.1, () => noeul.pose('hover', 6)]);
		}
		doAct('ring', serious ? 2.4 : 1.5, 'gather', events, 9);
	}
	function spawnRing() {
		const mesh = fx.flame.take();
		const at = npos.clone().setY(0.02);
		mesh.position.copy(at);
		mesh.scale.set(0.5, 1, 0.5);
		rings.push({ mesh, r: 0.5, speed: serious ? 7.5 : 6.5, at, caught: false });
		sparks(at.clone().setY(0.3), 1500, 7, new THREE.Vector3(0, 0.3, 0), 1);
	}

	function emberRain() {
		noeul.face('smile', 2);
		const n = serious ? 7 : 4;
		doAct('rain', 1.4, 'call', [
			[0.15, () => sparks(noeul.hand('L', hand), 400, 4)],
			[0.45, () => rainAround(n, 1.8, 3.2, 1.15)],
			[1.1, () => noeul.pose('hover', 6)],
		], 10);
	}

	/** Rings on the roof for embers to fall in: one where Nixchan is, the others round her. */
	function rainAround(n: number, near: number, far: number, after: number) {
		for (let i = 0; i < n; i++) {
			const a = Math.random() * Math.PI * 2;
			const d = i === 0 ? 0 : near + Math.random() * (far - near);
			const at = new THREE.Vector3(player.pos.x + Math.sin(a) * d, 0, player.pos.z + Math.cos(a) * d);
			if (at.length() > ROOF - 1.2) at.setLength(ROOF - 1.2);
			const mesh = fx.mark.take();
			mesh.position.copy(at);
			mesh.scale.setScalar(0.3);
			marks.push({ mesh, at, t: 0, fall: after + i * 0.12, drop: null });
		}
	}

	function lantern() {
		noeul.face('grin', 2);
		doAct('lantern', 1.3, 'gather', [
			[0.25, () => sparks(npos.clone().setY(hover + 2.8), 800, 2)],
			[0.7, () => {
				noeul.pose('throw', 18);
				const mesh = fx.lantern.take();
				mesh.position.copy(npos).setY(hover + 2.6);
				lanterns.push({ mesh, pos: mesh.position, hp: LANTERN_HP, life: 8 });
				sparks(mesh.position, 1500, 5);
			}],
			[1.05, () => noeul.pose('hover', 6)],
		], 10);
	}

	/** Her own ultimate, once a round: up into the sunset, and embers every way at once. */
	let glowed = false;
	function afterglow() {
		glowed = true;
		say("This is my sunset!", '이게 내 노을이야!', 2.6);
		noeul.face('fierce', 4.5, 'grin');
		const ringAt = (t: number): [number, () => void][] => [[t - 0.35, () => noeul.pose('gather', 14)], [t, () => {
			noeul.pose('slam', 24);
			spawnRing();
		}]];
		const burstAt = (t: number, k: number): [number, () => void] => [t, () => {
			// Embers out all round her, a ring of them.
			const from = npos.clone().setY(hover + 1.2);
			const m = 14;
			for (let i = 0; i < m; i++) {
				const a = ((i + k * 0.5) / m) * Math.PI * 2;
				const to = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
				to.y = (nixChest().y - from.y) / 9;
				throwEmber(from, to, 8);
			}
			sparks(from, 2000, 6);
		}];
		doAct('afterglow', 5, 'call', [
			[0.3, () => sparks(npos.clone().setY(hover + 1), 3000, 7)],
			...ringAt(0.9),
			[1.3, () => noeul.pose('call', 12)],
			[1.5, () => rainAround(6, 2, 4, 0.9)],
			burstAt(2.3, 0),
			...ringAt(3.0),
			burstAt(3.6, 1),
			[3.9, () => rainAround(5, 1.5, 3.5, 0.8)],
			[4.6, () => noeul.pose('hover', 5)],
		], 8);
	}

	function blink() {
		const from = npos.clone().setY(hover + 1.2);
		doAct('blink', 0.75, 'curl', [
			[0.18, () => {
				sparks(from, 2500, 5);
				noeul.group.visible = false;
			}],
			[0.45, () => {
				// Out to the far side of Nixchan, more or less.
				const a = towardNoeul() + Math.PI + (Math.random() - 0.5) * 1.6;
				npos.copy(spotNear(a, KEEP));
				nvel.set(0, 0, 0);
				facing = Math.atan2(player.pos.x - npos.x, player.pos.z - npos.z);
				noeul.group.position.set(npos.x, hover, npos.z);
				noeul.group.rotation.y = facing;
				noeul.group.visible = true;
				noeul.settle();
				sparks(npos.clone().setY(hover + 1.2), 2500, 5);
			}],
			[0.55, () => noeul.pose('hover', 8)],
		], 18);
		closeFor = 0;
		recentHits = [];
	}

	function chooseAttack() {
		const dist = Math.hypot(player.pos.x - npos.x, player.pos.z - npos.z);
		const r = Math.random();
		if (!glowed && ember <= EMBER / 3) afterglow();
		else if (serious && !lanterns.length && r < 0.18) lantern();
		else if (dist > 12 || r < 0.45) volley(serious && Math.random() < 0.6);
		else if (r < 0.72) flameRing();
		else emberRain();
		nextAttack = serious ? 0.9 + Math.random() * 0.6 : 1.5 + Math.random() * 1.0;
	}

	// ---------- Noeul is hit ----------

	/** A hit on Noeul. A soft one (the blizzard's) neither stops her nor charges the ultimate. */
	function hitNoeul(amount: number, big: boolean, soft = false) {
		if (phase !== 'fight') return;
		ember = Math.max(0, ember - amount);
		showEmber();
		if (!ult.active && !soft) charge = Math.min(1, charge + CHARGE_HIT * (big ? 2 : 1));
		if (!soft) noeul.face('ouch', 0.45);
		puff(noeul.chest(chest), big ? 2500 : soft ? 300 : 700, big ? 6 : 3);
		if (!soft) recentHits.push(game!.time);
		if (ember <= 0) return noeulLoses();
		// A small hit only makes her flinch when she's not busy; a big one stops what she's doing;
		// nothing but Nixchan's ultimate stops her afterglow.
		const stops = act.name === 'afterglow' ? amount >= ULTIMATE : act.name === 'drift' || big;
		if (stops && !soft) {
			doAct('hit', big ? 0.7 : 0.32, 'hit', [[big ? 0.5 : 0.22, () => noeul.pose('hover', 6)]], 20);
			// Pushed back a little, away from Nixchan.
			nvel.add(npos.clone().sub(player.pos).setY(0).setLength(big ? 6 : 2));
		}
		if (!serious && ember <= EMBER / 2) {
			serious = true;
			say("Oh, you're good! Now I'm trying for real!", '오, 제법인데? 이제 진짜로 간다!');
			noeul.face('fierce', 2.5, 'grin');
		} else if (!urged && ember <= EMBER * 0.2) {
			urged = true;
			say("Not yet! My ember's still lit!", '아직이야, 불씨는 안 꺼졌어!');
		}
	}

	// ---------- Nixchan is caught ----------

	let safe = 0;
	function hitNixchan(from: THREE.Vector3) {
		if (phase !== 'fight' || safe > 0 || player.dashing || ult.cutscene) return false;
		hearts--;
		showHearts();
		safe = SAFE_AFTER_HIT;
		if (!ult.active) charge = Math.min(1, charge + CHARGE_HURT);
		hud.flash();
		game!.emote('surprised', 1);
		game!.action('flinch');
		// Knocked back a little, and off her feet.
		const away = player.pos.clone().sub(from).setY(0);
		if (away.lengthSq() < 1e-4) away.set(Math.sin(player.heading), 0, Math.cos(player.heading)).negate();
		player.vel.addScaledVector(away.normalize(), 7);
		player.launch(4);
		sparks(nixChest(), 900, 4);
		if (hearts <= 0) nixchanLoses();
		return true;
	}

	// ---------- the round ----------

	let roundStart = 0;
	let best = Number(store.get('best') ?? 0);

	function noeulLoses() {
		phase = 'won';
		arena.setLive(false);
		// (Cleared at the end of the frame: this may be called from inside the loops over them.)
		clearAfter = true;
		doAct('lost', Infinity, 'sit', [], 5);
		noeul.face('laugh');
		const seconds = Math.round(game!.time - roundStart);
		wins++;
		store.set('wins', wins);
		winStat.set(`🏆 ${wins}`);
		const record = !best || seconds < best;
		if (record) {
			best = seconds;
			store.set('best', best);
		}
		setTimeout(() => game!.react('happy'), 300);
		setTimeout(() => say("Haha… my ember's all out. Your snow's really cold! I won't lose next time.", '하하… 불씨가 다 꺼졌어. 네 눈, 진짜 차갑다! 다음엔 안 질 거야.', 4.5), 900);
		hud.banner(pick({ en: 'You won!', ko: '이겼다!' }), pick({ en: `${seconds} s${record ? ' · best yet' : ''} · R to spar again`, ko: `${seconds}초${record ? ' · 최고 기록' : ''} · R로 다시 겨루기` }), 5);
	}

	function nixchanLoses() {
		phase = 'lost';
		arena.setLive(false);
		// (Cleared at the end of the frame: this may be called from inside the loops over them.)
		clearAfter = true;
		doAct('won', Infinity, 'cheer', [], 7);
		noeul.face('laugh', 2.2, 'smile');
		setTimeout(() => game!.react('sad'), 300);
		setTimeout(() => say('Hehe, I win this time! One more?', '헤헤, 이번엔 내가 이겼다! 한 판 더 할래?'), 800);
		hud.banner(pick({ en: 'Nixchan melted', ko: '닉스쨩이 녹아버렸어요' }), pick({ en: 'R to spar again', ko: 'R로 다시 겨루기' }), 5);
	}

	let clearAfter = false;
	function clearFlying() {
		clearAfter = false;
		for (const e of embers) fx.ember.give(e.mesh);
		for (const s of snowballs) fx.snowball.give(s.mesh);
		for (const r of rings) fx.flame.give(r.mesh);
		for (const l of lanterns) fx.lantern.give(l.mesh);
		lanterns.length = 0;
		for (const m of marks) {
			fx.mark.give(m.mesh);
			if (m.drop) fx.drop.give(m.drop);
		}
		embers.length = snowballs.length = rings.length = marks.length = 0;
		storm = 0;
		snow.fall = 0.015;
		if (!ult.active) snow.vortex.off();
	}

	let introTimers: number[] = [];
	function begin(first: boolean) {
		introTimers.forEach(clearTimeout);
		phase = 'intro';
		hearts = HEARTS;
		ember = EMBER;
		serious = urged = glowed = false;
		charge = 0;
		casting = null;
		safe = 0;
		showHearts();
		showEmber();
		clearFlying();
		npos.copy(NOEUL_START);
		nvel.set(0, 0, 0);
		facing = Math.PI;
		noeul.group.visible = true;
		noeul.group.position.set(npos.x, first ? 9 : hover, npos.z);
		noeul.group.rotation.y = facing;
		noeul.settle();
		doAct('enter', Infinity, 'hover', [], 6);
		noeul.face('smile');
		game!.teleport(NIX_START, 0);
		if (!first) hud.banner(pick({ en: 'Again!', ko: '한 판 더!' }), '', 1.6);
		if (first) {
			introTimers.push(window.setTimeout(() => say("Nixchan! I've heard about your snow magic. Spar with my embers?", '닉스쨩! 네 눈 마법 얘기 들었어. 내 불씨랑 한 판 겨뤄볼래?', 3.6), 1200));
			hud.banner(pick({ en: 'Ember Spar', ko: '노을과 겨루기' }), pick({ en: '1–4 cast · 5 once it shines · dodge her embers!', ko: '1~4 마법 · 빛나면 5 · 불씨를 피해요!' }), 4);
		}
		introTimers.push(window.setTimeout(() => {
			if (phase !== 'intro') return;
			phase = 'fight';
			roundStart = game!.time;
			nextAttack = 1.6;
			arena.setLive(true);
			drift();
			hud.banner(pick({ en: 'Go!', ko: '시작!' }), '', 1.2);
		}, first ? 5200 : 1800));
	}
	function restart() {
		if (phase === 'loading' || ult.cutscene) return;
		begin(false);
	}

	// ---------- Nixchan's spells ----------

	let charge = 0;
	const nearLantern = () => {
		let best: Lantern | null = null;
		for (const l of lanterns) if (l.pos.distanceTo(player.pos) < 7 && (!best || l.pos.distanceTo(player.pos) < best.pos.distanceTo(player.pos))) best = l;
		return best;
	};
	const facingDir = () => new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
	const hands = () => player.pos.clone().addScaledVector(facingDir(), 0.45).setY(player.pos.y + 1.1);

	const spells: Spell[] = [
		{
			name: pick({ en: 'Frost Shot', ko: '서리 탄' }),
			key: '1',
			clip: 'Shot',
			busy: 0.55,
			cool: 0.3,
			at: 0.4,
			cast() {
				const from = hands();
				const mesh = fx.snowball.take();
				mesh.position.copy(from);
				// At a lantern coming for her, if there is one near; at Noeul otherwise.
				const target = nearLantern();
				const dir = (target ? target.pos : noeul.chest(chest)).clone().sub(from).normalize();
				snowballs.push({ mesh, pos: mesh.position, vel: dir.multiplyScalar(17), life: 2, target });
				snow.burst(from, { count: 900, dir, speed: 6, spread: 0.4, life: 0.7, color: '#a8dcff', size: 1.4 });
			},
		},
		{
			name: pick({ en: 'Glacier Slam', ko: '빙하 강타' }),
			key: '2',
			clip: 'Slam',
			busy: 0.9,
			cool: 3,
			at: 0.45,
			cast() {
				const at = player.pos.clone().setY(player.pos.y + 0.2);
				for (let i = 0; i < 16; i++) {
					const a = (i / 16) * Math.PI * 2;
					snow.burst(at, { count: 700, dir: new THREE.Vector3(Math.sin(a), 0.25, Math.cos(a)), speed: 12, spread: 0.12, life: 1.1, color: '#bfe3ff', size: 1.2 });
				}
				// Puts out embers round her, and hits Noeul if she's in reach: hard, twice over.
				for (let i = embers.length - 1; i >= 0; i--) if (embers[i].pos.distanceTo(at) < SLAM_REACH) {
					puff(embers[i].pos, 200, 2);
					dropEmber(embers[i], i);
				}
				for (const l of [...lanterns]) if (l.pos.distanceTo(at) < SLAM_REACH * 0.7) dropLantern(l, true);
				if (Math.hypot(npos.x - player.pos.x, npos.z - player.pos.z) < SLAM_REACH) {
					hitNoeul(SLAM, true);
					hitNoeul(SLAM, false);
				}
			},
		},
		{
			name: pick({ en: 'Blizzard Crown', ko: '눈보라 왕관' }),
			key: '3',
			clip: 'Summon',
			busy: 1.0,
			cool: 10,
			at: 0.5,
			cast() {
				storm = 4;
				stormTick = 0.3;
				// Noeul won't stand about in it: she blinks out, or keeps away while it lasts.
				if (act.name === 'drift' && Math.hypot(npos.x - player.pos.x, npos.z - player.pos.z) < 7.5 && Math.random() < 0.65) blink();
				snow.fall = 0.4;
				snow.burst(player.pos.clone().setY(player.pos.y + 2.6), { count: 8000, dir: new THREE.Vector3(0, 1, 0), speed: 6, spread: 1, life: 3, color: '#cfe9ff', size: 1.3 });
			},
		},
		{
			name: pick({ en: 'Snow Dash', ko: '눈 대시' }),
			key: '4',
			clip: 'Dash',
			busy: 0.4,
			cool: 1,
			at: 0,
			cast() {
				game.controls.state.dashQueued = true;
				dashStrike = 0.45;
			},
		},
		{
			name: pick({ en: 'Eternal Winter', ko: '영원한 겨울' }),
			key: '5',
			clip: 'Ultimate',
			busy: ULTIMATE_LENGTH,
			cool: 0,
			at: 0,
			ultimate: true,
			cast() {
				charge = 0;
				// Everything in the air goes out, the blizzard gives way to it, and Noeul stops to stare.
				clearFlying();
				storm = 0;
				snow.vortex.off();
				struck = false;
				doAct('awe', ULTIMATE_LENGTH, 'hover', [], 4);
				noeul.face('ouch', 2.5, serious ? 'grin' : 'smile');
				ult.start();
			},
		},
	];
	const cools = new Map<Spell, number>(spells.map((s) => [s, 0]));
	const buttons = new Map(spells.map((s) => [s, hud.skill(s.name, s.key, () => cast(s))]));

	function cast(spell: Spell) {
		if (phase !== 'fight' || casting || (cools.get(spell) ?? 0) > 0 || !game!.ready || game!.paused) return;
		if (spell.ultimate && (charge < 1 || ult.active || !player.grounded)) {
			if (charge < 1) hud.toast(pick({ en: `Eternal Winter: ${Math.floor(charge * 100)}% — hit Noeul to charge it`, ko: `영원한 겨울: ${Math.floor(charge * 100)}% — 노을을 맞혀서 채워요` }));
			return;
		}
		casting = spell;
		castT = 0;
		fired = false;
		cools.set(spell, spell.cool + spell.busy);
	}

	// ---------- each frame ----------

	const up = new THREE.Vector3(0, 1, 0);
	const tmp = new THREE.Vector3();
	let auraTick = 0;

	game.onUpdate((dt, time) => {
		// Her spell.
		if (casting) {
			castT += dt;
			if (!fired && castT >= casting.busy * casting.at) {
				fired = true;
				casting.cast();
			}
			if (castT >= casting.busy) casting = null;
		}
		for (const s of spells) {
			const c = Math.max(0, (cools.get(s) ?? 0) - dt);
			cools.set(s, c);
			if (!s.ultimate) buttons.get(s)!.cool(c / (s.cool + s.busy));
		}
		if (phase === 'fight' && !ult.active && charge < 1) {
			charge = Math.min(1, charge + CHARGE_SECOND * dt);
			if (charge >= 1) hud.toast(pick({ en: 'Eternal Winter is ready! Press 5', ko: '영원한 겨울 준비 완료! 5를 눌러요' }), 3);
		}
		const ultButton = buttons.get(spells[4])!;
		ultButton.cool(1 - charge);
		ultButton.charged(charge >= 1 && !ult.active);

		// While she can't be caught, she flickers.
		safe = Math.max(0, safe - dt);
		player.figure.group.visible = safe <= 0 || Math.floor(time * 14) % 2 === 0;
		if (player.dashing) snow.burst(player.pos.clone().setY(player.pos.y + 0.7), { count: 160, dir: facingDir().negate().setY(0.4), speed: 3, spread: 0.6, life: 1, size: 1.1 });

		// Her blizzard turns round her, and frosts Noeul now and then if she's in it.
		if (storm > 0) {
			storm -= dt;
			snow.vortex.set(player.pos.clone().setY(player.pos.y + 1), { radius: 7, swirl: 15, pull: 2.5, lift: 3.5 });
			snow.burst(player.pos.clone().setY(player.pos.y + 0.3), { count: 260, dir: new THREE.Vector3(Math.sin(time * 7), 0.6, Math.cos(time * 7)), speed: 8, spread: 0.3, life: 1.8, color: '#dff1ff', size: 1.2 });
			stormTick -= dt;
			if (stormTick <= 0) {
				stormTick = 0.6;
				if (Math.hypot(npos.x - player.pos.x, npos.z - player.pos.z) < 7.5) hitNoeul(STORM, false, true);
			}
			if (storm <= 0) {
				snow.vortex.off();
				snow.fall = 0.015;
			}
		}
		// Her dash runs into Noeul.
		if (dashStrike > 0) {
			dashStrike -= dt;
			if (Math.hypot(npos.x - player.pos.x, npos.z - player.pos.z) < 2.2) {
				dashStrike = 0;
				hitNoeul(DASH, false);
			}
		}

		// ---- Noeul ----
		act.t += dt;
		for (const ev of act.events) if (ev[0] >= 0 && act.t >= ev[0]) {
			ev[1]();
			ev[0] = -1;
		}
		if (act.t >= act.length && act.name !== 'drift') {
			if (phase === 'fight') drift();
		}
		const toNix = tmp.copy(player.pos).sub(npos).setY(0);
		const dist = toNix.length();
		if (phase === 'fight' && act.name === 'drift') {
			// Round Nixchan, about KEEP away, now one way, now the other.
			strafeFlip -= dt;
			if (strafeFlip <= 0) {
				strafe = -strafe;
				strafeFlip = 2 + Math.random() * 2.5;
			}
			const around = towardNoeul() + strafe * (serious ? 0.55 : 0.4);
			// (Further while the blizzard's up, and quicker about it.)
			const want = spotNear(around, storm > 0 ? 10.5 : KEEP);
			nvel.lerp(want.sub(npos).setY(0).clampLength(0, storm > 0 ? 7 : serious ? 6 : 4.5), 1 - Math.exp(-2.5 * dt));
			if (!ult.cutscene) nextAttack -= dt;
			if (nextAttack <= 0) chooseAttack();
			// Too close for too long, or hit again and again: she blinks away.
			closeFor = dist < 3 ? closeFor + dt : Math.max(0, closeFor - dt);
			recentHits = recentHits.filter((t) => time - t < 2.2);
			if (closeFor > 0.8 || recentHits.length >= 4) blink();
		} else if (phase === 'intro' || act.name === 'enter') {
			nvel.multiplyScalar(Math.exp(-4 * dt));
		} else {
			nvel.multiplyScalar(Math.exp(-6 * dt));
		}
		npos.addScaledVector(nvel, dt);
		if (npos.length() > REACH) npos.setLength(REACH);
		// Nixchan can't walk through her.
		if (dist < 0.9 && phase !== 'won') {
			const push = toNix.lengthSq() > 1e-4 ? toNix.clone().setLength(0.9 - dist) : new THREE.Vector3(0, 0, -0.1);
			player.pos.add(push);
		}
		// Her hover: floating, bobbing; sat on the roof once her ember's out; in from the sky at first.
		const sitting = act.name === 'lost';
		const wantHover = sitting ? (0.06 - 0.924) * SCALE : act.name === 'afterglow' ? 3.2 + Math.sin(time * 2) * 0.15 : 0.4 + Math.sin(time * 1.6) * 0.12;
		hover += (wantHover - hover) * (1 - Math.exp(-(sitting ? 3 : 8) * dt));
		const g = noeul.group;
		g.position.x = npos.x;
		g.position.z = npos.z;
		g.position.y += (hover - g.position.y) * (1 - Math.exp(-(phase === 'intro' ? 2.2 : 10) * dt));
		// Turned to Nixchan, leaning a little into how she drifts.
		const wantFacing = phase === 'won' ? facing : Math.atan2(player.pos.x - npos.x, player.pos.z - npos.z);
		let df = wantFacing - facing;
		df = Math.atan2(Math.sin(df), Math.cos(df));
		facing += df * (1 - Math.exp(-6 * dt));
		g.rotation.y = facing;
		const side = nvel.x * Math.cos(facing) - nvel.z * Math.sin(facing);
		const fwd = nvel.x * Math.sin(facing) + nvel.z * Math.cos(facing);
		g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, sitting ? 0 : -side * 0.03, 1 - Math.exp(-5 * dt));
		g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, sitting ? 0 : fwd * 0.03, 1 - Math.exp(-5 * dt));
		noeul.update(dt, time, nixChest());

		// Embers under her feet as she hovers, and her light, as bright as her ember.
		// (At her feet, so it warms the roof round her more than her face.)
		fx.aura.position.copy(g.position).setY(Math.max(0.25, g.position.y - 0.1));
		fx.aura.intensity = sitting ? 0.2 : 0.8 + 2.4 * (ember / EMBER);
		auraTick -= dt;
		if (auraTick <= 0 && !sitting && g.visible) {
			auraTick = 0.12;
			snow.burst(g.position.clone().setY(g.position.y + 0.1), { count: 50, dir: new THREE.Vector3(0, -1, 0), speed: 1.2, spread: 0.6, life: 0.7, color: ORANGE, size: 1.1 });
		}

		// ---- what's flying ----
		const nc = nixChest();
		for (let i = embers.length - 1; i >= 0; i--) {
			const e = embers[i];
			e.pos.addScaledVector(e.vel, dt);
			e.mesh.rotation.y += dt * 6;
			e.life -= dt;
			if (Math.floor(time * 30) % 3 === i % 3) snow.burst(e.pos, { count: 30, dir: e.vel.clone().negate(), speed: 1, spread: 0.5, life: 0.5, color: ORANGE, size: 1.1 });
			// The blizzard puts out embers that come near her.
			if (storm > 0 && e.pos.distanceTo(nc) < 2.4) {
				puff(e.pos, 300, 2);
				dropEmber(e, i);
				continue;
			}
			if (e.pos.distanceTo(nc) < 0.65) {
				if (hitNixchan(e.pos) || player.dashing) {
					dropEmber(e, i);
					continue;
				}
			}
			if (e.life <= 0 || e.pos.y < 0 || e.pos.length() > ROOF + 8) {
				if (e.pos.y < 0.2) sparks(e.pos.clone().setY(0.1), 120, 2);
				dropEmber(e, i);
			}
		}
		for (let i = snowballs.length - 1; i >= 0; i--) {
			const s = snowballs[i];
			// It curves after her chest (or the lantern it was thrown at).
			if (s.target && !lanterns.includes(s.target)) s.target = null;
			const want = (s.target ? s.target.pos : noeul.chest(chest)).clone().sub(s.pos);
			const d = s.target ? Infinity : want.length();
			s.vel.lerp(want.setLength(17), 1 - Math.exp(-(phase === 'fight' ? 5 : 0) * dt));
			s.pos.addScaledVector(s.vel, dt);
			s.life -= dt;
			if (Math.floor(time * 30) % 2 === i % 2) snow.burst(s.pos, { count: 40, dir: s.vel.clone().negate(), speed: 1, spread: 0.4, life: 0.6, color: '#cfe9ff', size: 1.1 });
			let gone = false;
			// Snow meets ember: both go out.
			for (let j = embers.length - 1; j >= 0; j--) {
				if (embers[j].pos.distanceTo(s.pos) < 0.55) {
					puff(s.pos, 500, 3);
					dropEmber(embers[j], j);
					gone = true;
					break;
				}
			}
			for (const l of lanterns) {
				if (gone || l.pos.distanceTo(s.pos) > 0.9) continue;
				gone = true;
				puff(s.pos, 600, 3);
				if (--l.hp <= 0) dropLantern(l, true);
			}
			if (!gone && d < 0.85 * SCALE && g.visible && act.name !== 'blink') {
				hitNoeul(SHOT, false);
				gone = true;
			}
			if (gone || s.life <= 0) {
				fx.snowball.give(s.mesh);
				snowballs.splice(i, 1);
			}
		}
		for (const l of [...lanterns]) {
			// Drifting after her, slower than she runs, faster than she walks.
			const to = nc.clone().sub(l.pos);
			l.pos.addScaledVector(to.setLength(Math.min(to.length(), (serious ? 3.4 : 2.8) * dt)), 1);
			l.mesh.rotation.y += dt * 2;
			l.mesh.scale.setScalar((1 + 0.08 * Math.sin(time * 9)) * (0.6 + 0.4 * (l.hp / LANTERN_HP)));
			l.life -= dt;
			if (Math.floor(time * 30) % 2 === 0) snow.burst(l.pos, { count: 60, dir: up, speed: 1.5, spread: 0.7, life: 0.8, color: ORANGE, size: 1.3 });
			// (The blizzard doesn't stop it: it's too big to put out that way.)
			if (l.pos.distanceTo(nc) < 0.9) {
				hitNixchan(l.pos);
				dropLantern(l, false);
			} else if (l.life <= 0) dropLantern(l, false);
		}
		for (let i = rings.length - 1; i >= 0; i--) {
			const r = rings[i];
			r.r += r.speed * dt;
			r.mesh.scale.set(r.r, 1 + 0.15 * Math.sin(time * 20), r.r);
			const fromCentre = Math.hypot(player.pos.x - r.at.x, player.pos.z - r.at.z);
			if (!r.caught && Math.abs(fromCentre - r.r) < 0.45 && player.pos.y < 0.5) {
				const on = new THREE.Vector3(r.at.x, 0.3, r.at.z).add(player.pos.clone().sub(r.at).setY(0).setLength(r.r - 0.5));
				if (hitNixchan(on)) r.caught = true;
			}
			// Sparks off it here and there.
			const a = Math.random() * Math.PI * 2;
			snow.burst(new THREE.Vector3(r.at.x + Math.sin(a) * r.r, 0.4, r.at.z + Math.cos(a) * r.r), { count: 60, dir: up, speed: 2.5, spread: 0.4, life: 0.6, color: GOLD, size: 1.2 });
			if (r.r > ROOF + 2) {
				fx.flame.give(r.mesh);
				rings.splice(i, 1);
			}
		}
		for (let i = marks.length - 1; i >= 0; i--) {
			const m = marks[i];
			m.t += dt;
			const k = Math.min(1, m.t / m.fall);
			m.mesh.scale.setScalar(0.3 + 0.7 * Math.min(1, m.t / 0.25));
			((m.mesh.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.4 * k;
			((m.mesh.children[1] as THREE.Mesh).scale.setScalar(k));
			// The ember falls the last moment before it lands.
			if (m.t > m.fall - 0.35 && !m.drop) m.drop = fx.drop.take();
			if (m.drop) m.drop.position.set(m.at.x, Math.max(0.3, 9 * (m.fall - m.t) / 0.35), m.at.z);
			if (m.t >= m.fall) {
				sparks(m.at.clone().setY(0.3), 600, 7, up, 0.7);
				const near = Math.hypot(player.pos.x - m.at.x, player.pos.z - m.at.z) < 1.35 && player.pos.y < 1.6;
				if (near) hitNixchan(m.at);
				fx.mark.give(m.mesh);
				if (m.drop) fx.drop.give(m.drop);
				marks.splice(i, 1);
			}
		}
		if (clearAfter) clearFlying();

		// Her face while she fights: a smile at first, a grin once she's serious.
		if (phase === 'fight' && act.name === 'drift' && Math.random() < dt * 0.15) noeul.face(serious ? 'grin' : 'smile');
	});

	Promise.all([game.loaded, noeul.ready]).then(() => begin(true), () => {});
	game.start();
	if (import.meta.env.DEV) Object.assign(window, { game, noeul, fillUltimate: () => (charge = 1), win: () => hitNoeul(EMBER, true), hurt: (n: number) => hitNoeul(n, false, true), lantern });
}
