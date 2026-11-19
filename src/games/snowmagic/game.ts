// Snow Magic: Nixchan walks a snowy clearing and tries her snow spells out on the snowmen there.
// Four spells, on 1 to 4 (or the buttons along the bottom):
//
//   1 Frost Shot      a bolt of snow thrown the way she faces, that frosts the snowmen it reaches
//   2 Glacier Slam    paws down on the ground: a ring of snow bursts out round her
//   3 Blizzard Crown  a storm turns round her for a while, and frosts whatever's in it
//   4 Snow Dash       a dash, with a trail of snow
//
// A snowman frosted through bursts into snow, and is built again a little later. The snow is
// nixkit/snow.ts: worked out on the GPU, so there can be a lot of it.
import * as THREE from 'three';
import type { GameContext, NixClip } from '../../lib/nixkit/meta';
import { addSnow } from '../../lib/nixkit/snow';

const ARENA = 19;
const SNOWMEN = 7;
/** How many hits frost a snowman through. */
const FROST = 6;

interface Spell {
	name: string;
	key: string;
	clip: NixClip;
	/** How long she's busy with it (seconds), and how long before it can be cast again. */
	busy: number;
	cool: number;
	/** Called as it's cast; `at` is how far into her animation the magic comes out. */
	at: number;
	cast: () => void;
}

export default function start({ createGame, store }: GameContext) {
	// What she's casting, and how far into it she is.
	let casting: Spell | null = null;
	let castT = 0;
	let fired = false;

	const game = createGame({
		spawn: { pos: new THREE.Vector3(0, 0, -3), heading: 0 },
		canDash: () => true,
		clip: () => (casting ? casting.clip : null),
		// Casting keeps her on the spot (a dash carries her itself), facing the way she was.
		hold: () => (casting && casting.clip !== 'Dash' ? game!.player.heading : null),
		onKey: (key) => {
			const spell = spells.find((s) => s.key === key);
			if (spell) cast(spell);
		},
	});
	if (!game) return;
	const { parts, hud, player, scene, toon } = game;
	const snow = addSnow(game, { fall: 0.3, area: 26, height: 18 });
	snow.wind.set(0.5, 0, 0.2);

	// ---------- the clearing ----------

	parts.add({ at: [0, -0.5, 0], size: [ARENA * 2, 1, ARENA * 2], shape: 'cylinder', color: '#eef4ff' });
	// A ring of ice round the edge, and a rune circle in the middle, drawn in the snow.
	for (let i = 0; i < 18; i++) {
		const a = (i / 18) * Math.PI * 2;
		const h = 1.2 + ((i * 7) % 5) * 0.45;
		parts.add({ at: [Math.sin(a) * (ARENA - 1.2), h / 2, Math.cos(a) * (ARENA - 1.2)], size: [0.9, h, 0.9], shape: 'cylinder', color: i % 2 ? '#bfe2ff' : '#d8eeff' });
	}
	const rune = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.45, 64), new THREE.MeshBasicMaterial({ color: '#9fd4ff', transparent: true, opacity: 0.55 }));
	rune.rotation.x = -Math.PI / 2;
	rune.position.y = 0.02;
	scene.add(rune);

	// ---------- the snowmen ----------

	const coal = toon({ color: '#2c2a52' });
	const carrot = toon({ color: '#ff9a4d' });
	const scarfColours = ['#f25f6b', '#5fb0e8', '#ffd84d', '#8fd18a', '#c79bff'];

	interface Snowman {
		group: THREE.Group;
		body: THREE.Group;
		pos: THREE.Vector3;
		frost: number;
		wobble: number;
		wobbleV: number;
		/** Seconds until it's built again (0: standing). */
		gone: number;
		frostMat: THREE.MeshToonMaterial;
	}
	const snowmen: Snowman[] = [];
	for (let i = 0; i < SNOWMEN; i++) {
		// In an arc in front of where she starts, so none stand between her and the camera.
		const a = -1.25 + (i / (SNOWMEN - 1)) * 2.5;
		const r = 8 + (i % 2) * 4;
		const pos = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
		const group = new THREE.Group();
		group.position.copy(pos);
		group.rotation.y = Math.atan2(-pos.x, -pos.z);
		const body = new THREE.Group();
		group.add(body);
		const frostMat = toon({ color: '#ffffff' });
		const ball = (y: number, rad: number) => {
			const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 20, 14), frostMat);
			m.position.y = y;
			m.castShadow = true;
			body.add(m);
			return m;
		};
		ball(0.55, 0.62);
		ball(1.35, 0.45);
		const head = ball(1.95, 0.32);
		for (const side of [-1, 1]) {
			const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), coal);
			eye.position.set(side * 0.11, 0.08, 0.28);
			head.add(eye);
		}
		const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 10), carrot);
		nose.rotation.x = Math.PI / 2;
		nose.position.set(0, -0.02, 0.42);
		head.add(nose);
		const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.07, 8, 24), toon({ color: scarfColours[i % scarfColours.length] }));
		scarf.rotation.x = Math.PI / 2;
		scarf.position.y = 1.7;
		body.add(scarf);
		const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.3, 16), coal);
		hat.position.y = 2.33;
		body.add(hat);
		scene.add(group);
		// Something solid where it stands, so she walks round it rather than through.
		parts.add({ at: [pos.x, 0.9, pos.z], size: [1.1, 1.8, 1.1], shape: 'cylinder', color: '#ffffff' }).mesh.visible = false;
		snowmen.push({ group, body, pos, frost: 0, wobble: 0, wobbleV: 0, gone: 0, frostMat });
	}

	let frosted = Number(store.get('frosted') ?? 0);
	const frostStat = hud.stat(`☃ ${frosted}`);
	const ICE = new THREE.Color('#7cc4ff');
	const WHITE = new THREE.Color('#ffffff');

	/** A hit on a snowman: it wobbles, frosts a little bluer, and bursts once frosted through. */
	const hit = (s: Snowman, push = 1) => {
		if (s.gone > 0) return;
		s.wobbleV += 3.2 * push;
		s.frost++;
		s.frostMat.color.copy(WHITE).lerp(ICE, Math.min(1, s.frost / FROST));
		if (s.frost < FROST) return;
		const at = s.pos.clone().setY(1.2);
		snow.burst(at, { count: 6000, dir: new THREE.Vector3(0, 1, 0), speed: 7, spread: 1, life: 2.4, size: 1.6 });
		snow.burst(at, { count: 2500, dir: new THREE.Vector3(0, 1, 0), speed: 4, spread: 1, life: 1.6, color: '#bfe3ff', size: 2.2 });
		s.group.visible = false;
		s.gone = 5;
		frostStat.set(`☃ ${++frosted}`);
		store.set('frosted', frosted);
	};

	// ---------- the spells ----------

	const facing = () => new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
	const hands = () => player.pos.clone().addScaledVector(facing(), 0.45).setY(player.pos.y + 1.1);
	/** The snowmen in front of her, within `reach` and `cone` (radians either side). */
	const ahead = (reach: number, cone: number) => {
		const f = facing();
		return snowmen.filter((s) => {
			const to = s.pos.clone().sub(player.pos).setY(0);
			const d = to.length();
			return d < reach && d > 0.01 && f.angleTo(to) < cone;
		});
	};
	const near = (at: THREE.Vector3, reach: number) => snowmen.filter((s) => s.pos.distanceTo(at.clone().setY(0)) < reach);

	// The blizzard: how long it has left.
	let storm = 0;
	let stormTick = 0;

	const spells: Spell[] = [
		{
			name: 'Frost Shot',
			key: '1',
			clip: 'Shot',
			busy: 0.7,
			cool: 0.6,
			at: 0.35,
			cast() {
				const f = facing();
				snow.burst(hands(), { count: 5000, dir: f.clone().setY(0.05), speed: 22, spread: 0.06, life: 1.4, color: '#a8dcff', size: 1.3 });
				snow.burst(hands(), { count: 1500, dir: f, speed: 6, spread: 0.5, life: 0.8, size: 1.8 });
				// The bolt reaches the snowmen a moment later, as far off as they are.
				for (const s of ahead(16, 0.22)) setTimeout(() => hit(s, 1), (s.pos.distanceTo(player.pos) / 22) * 1000);
			},
		},
		{
			name: 'Glacier Slam',
			key: '2',
			clip: 'Slam',
			busy: 1.0,
			cool: 2.5,
			at: 0.45,
			cast() {
				const at = player.pos.clone().setY(player.pos.y + 0.2);
				for (let i = 0; i < 16; i++) {
					const a = (i / 16) * Math.PI * 2;
					snow.burst(at, { count: 900, dir: new THREE.Vector3(Math.sin(a), 0.25, Math.cos(a)), speed: 13, spread: 0.12, life: 1.3, color: '#bfe3ff', size: 1.2 });
				}
				snow.burst(at, { count: 3000, dir: new THREE.Vector3(0, 1, 0), speed: 5, spread: 0.7, life: 1.8, size: 1.5 });
				// It hits hard: twice over.
				for (const s of near(at, 7)) {
					hit(s, 1.5);
					hit(s, 0);
				}
			},
		},
		{
			name: 'Blizzard Crown',
			key: '3',
			clip: 'Summon',
			busy: 1.1,
			cool: 9,
			at: 0.5,
			cast() {
				storm = 6;
				snow.fall = 0.55;
				snow.burst(player.pos.clone().setY(player.pos.y + 2.6), { count: 8000, dir: new THREE.Vector3(0, 1, 0), speed: 6, spread: 1, life: 3, color: '#cfe9ff', size: 1.3 });
			},
		},
		{
			name: 'Snow Dash',
			key: '4',
			clip: 'Dash',
			busy: 0.45,
			cool: 1.2,
			at: 0,
			cast() {
				game.controls.state.dashQueued = true;
				for (const s of ahead(4, 0.5)) hit(s, 1.2);
			},
		},
	];
	const cools = new Map<Spell, number>(spells.map((s) => [s, 0]));
	const buttons = new Map(spells.map((s) => [s, hud.skill(s.name, s.key, () => cast(s))]));

	function cast(spell: Spell) {
		if (casting || (cools.get(spell) ?? 0) > 0 || !game!.ready || player.swimming) return;
		casting = spell;
		castT = 0;
		fired = false;
		cools.set(spell, spell.cool + spell.busy);
	}

	// ---------- each frame ----------

	game.onUpdate((dt, time) => {
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
			buttons.get(s)!.cool(c / (s.cool + s.busy));
		}

		// The snow dash leaves a trail.
		if (player.dashing) snow.burst(player.pos.clone().setY(player.pos.y + 0.7), { count: 220, dir: facing().negate().setY(0.4), speed: 3, spread: 0.6, life: 1.2, size: 1.1 });

		// The blizzard turns round her, and frosts what's in it now and then.
		if (storm > 0) {
			storm -= dt;
			snow.vortex.set(player.pos.clone().setY(player.pos.y + 1), { radius: 7, swirl: 15, pull: 2.5, lift: 3.5 });
			snow.burst(player.pos.clone().setY(player.pos.y + 0.3), { count: 260, dir: new THREE.Vector3(Math.sin(time * 7), 0.6, Math.cos(time * 7)), speed: 8, spread: 0.3, life: 1.8, color: '#dff1ff', size: 1.2 });
			stormTick -= dt;
			if (stormTick <= 0) {
				stormTick = 0.6;
				for (const s of near(player.pos, 7)) hit(s, 0.6);
			}
			if (storm <= 0) {
				snow.vortex.off();
				snow.fall = 0.3;
			}
		}
		rune.material.opacity = storm > 0 ? 0.9 : 0.55;
		rune.rotation.z += dt * (storm > 0 ? 1.5 : 0.1);

		for (const s of snowmen) {
			// Wobbling back upright, on a spring.
			s.wobbleV += (-s.wobble * 40 - s.wobbleV * 5) * dt;
			s.wobble += s.wobbleV * dt;
			s.body.rotation.x = s.wobble * 0.25;
			if (s.gone > 0) {
				s.gone -= dt;
				if (s.gone <= 0) {
					s.group.visible = true;
					s.frost = 0;
					s.frostMat.color.copy(WHITE);
					s.group.scale.setScalar(0.01);
				}
			}
			// Built again: it grows back up.
			if (s.group.scale.x < 1) s.group.scale.setScalar(Math.min(1, s.group.scale.x + dt * 1.5));
		}
	});

	game.loaded.then(() => hud.banner('Snow Magic', 'Press 1 to 4 to cast'), () => {});
	game.start();
	if (import.meta.env.DEV) Object.assign(window, { snow });
}
