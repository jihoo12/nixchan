// Snow, worked out on the GPU: a pool of snowflakes moved each frame by a compute shader (TSL), so
// there can be a great many of them, small and close, without the CPU touching any. Three things
// move them:
//
//   - snowfall round Nixchan, as heavy as `fall` says (0 for none), drifting on the wind;
//   - bursts, thrown from a point, that slow, drift and fall as snow (a spell's flurry);
//   - a vortex, that spins whatever's near it round, pulls it in and lifts it (a blizzard).
//
//   const snow = addSnow(game, { fall: 0.4 });
//   snow.burst(at, { count: 3000, dir, speed: 9, spread: 0.35 });
//   snow.vortex.set(at, { radius: 6, swirl: 14, pull: 3, lift: 4 }); ... snow.vortex.off();
//
// Where there's no WebGPU, the renderer works it out with WebGL 2 instead; there's less of it then.
import * as THREE from 'three';
import { SpriteNodeMaterial, type Node } from 'three/webgpu';
import { Fn, If, cameraPosition, float, hash, instanceIndex, instancedArray, length, max, mix, mx_noise_vec3, smoothstep, uint, uniform, uv, vec3, vec4 } from 'three/tsl';
import type { Game } from './game';

export interface SnowOptions {
	/** How many snowflakes there are at most (on WebGPU; a fifth of it without). */
	count?: number;
	/** How heavy the snowfall round her is, 0 (none) to 1. */
	fall?: number;
	/** How far round her it snows, and how high above her it starts. */
	area?: number;
	height?: number;
	/** How big a snowflake is, in metres. */
	size?: number;
}

export interface Burst {
	/** How many snowflakes. */
	count?: number;
	/** Which way they're thrown (needn't be unit length), and how fast. */
	dir?: THREE.Vector3;
	speed?: number;
	/** How far they scatter from `dir`: 0 in a line, 1 every which way. */
	spread?: number;
	/** How long they last, in seconds (each a little more or less). */
	life?: number;
	/** Their colour (snow white by default), and how big they are next to snowfall. */
	color?: THREE.ColorRepresentation;
	size?: number;
}

export interface Vortex {
	radius: number;
	/** How fast it spins things round, pulls them in, and lifts them, in m/s at its heart. */
	swirl: number;
	pull: number;
	lift: number;
}

/** The most a single burst throws. */
const MAX_BURST = 16384;
const DEAD = 0;
const FALLING = 1;
const THROWN = 2;

export function addSnow(game: Game, opts: SnowOptions = {}) {
	const N = Math.round((opts.count ?? 160_000) * (game.webgpu ? 1 : 0.2));

	// Each snowflake: where it is, how it's moving, its colour, and [life left, life, seed, kind].
	const pos = instancedArray(N, 'vec3');
	const vel = instancedArray(N, 'vec3');
	const tint = instancedArray(N, 'vec4');
	const data = instancedArray(N, 'vec4');

	const u = {
		dt: uniform(0),
		time: uniform(0),
		center: uniform(new THREE.Vector3()),
		floor: uniform(0),
		fall: uniform(opts.fall ?? 0),
		area: uniform(opts.area ?? 22),
		height: uniform(opts.height ?? 16),
		wind: uniform(new THREE.Vector3(0.6, 0, 0.25)),
		gust: uniform(1.2),
		// The burst being thrown: the slots it takes, from where, which way.
		from: uniform(0, 'uint'),
		burstCount: uniform(0, 'uint'),
		origin: uniform(new THREE.Vector3()),
		dir: uniform(new THREE.Vector3(0, 1, 0)),
		speed: uniform(6),
		spread: uniform(0.3),
		life: uniform(2.5),
		color: uniform(new THREE.Color('#ffffff')),
		scale: uniform(1),
		// The vortex (strength 0: none).
		vPos: uniform(new THREE.Vector3()),
		vRadius: uniform(6),
		vSwirl: uniform(0),
		vPull: uniform(0),
		vLift: uniform(0),
		vOn: uniform(0),
	};

	/** A random number from 0 to 1, for this snowflake and this `salt`. */
	const rand = (i: Node<'uint'>, salt: number) => hash(i.add(uint(salt)));

	/** Puts snowflake `i` somewhere in the snowfall: anywhere up the column (`spread`), or along the top. */
	const settleFalling = (i: Node<'uint'>, column: boolean) => {
		const a = rand(i, 11).add(u.time.mul(0.37)).fract().mul(Math.PI * 2);
		const r = rand(i, 23).add(u.time.mul(0.13)).fract().sqrt().mul(u.area);
		const up = column ? rand(i, 37).mul(u.height) : u.height.sub(rand(i, 41).mul(2));
		pos.element(i).assign(vec3(u.center.x.add(a.cos().mul(r)), u.floor.add(up), u.center.z.add(a.sin().mul(r))));
		vel.element(i).assign(vec3(0, -1, 0));
		tint.element(i).assign(vec4(1, 1, 1, 1));
		const life = float(30);
		data.element(i).assign(vec4(life, life, rand(i, 53), FALLING));
	};

	// ---------- compute: start, throw a burst, move ----------

	const init = Fn(() => {
		const i = instanceIndex;
		If(rand(i, 71).lessThan(u.fall), () => settleFalling(i, true)).Else(() => {
			data.element(i).assign(vec4(0, 1, rand(i, 53), DEAD));
			pos.element(i).assign(vec3(0, -1e4, 0));
		});
	})().compute(N);

	const throwBurst = Fn(() => {
		If(instanceIndex.lessThan(u.burstCount), () => {
			const i = u.from.add(instanceIndex).mod(uint(N));
			const salt = u.time.mul(997).fract().mul(1e5).toUint();
			const r1 = hash(i.add(salt));
			const r2 = hash(i.add(salt).add(uint(9001)));
			const r3 = hash(i.add(salt).add(uint(4243)));
			// A random direction, leaned towards `dir` as far as `spread` lets it.
			const z = r1.mul(2).sub(1);
			const t = r2.mul(Math.PI * 2);
			const s = z.mul(z).oneMinus().sqrt();
			const any = vec3(s.mul(t.cos()), z, s.mul(t.sin()));
			const way = mix(u.dir.normalize(), any, u.spread).normalize();
			const fast = u.speed.mul(r3.mul(0.6).add(0.7));
			pos.element(i).assign(u.origin.add(any.mul(0.15)));
			vel.element(i).assign(way.mul(fast));
			tint.element(i).assign(vec4(u.color, u.scale));
			const life = u.life.mul(hash(i.add(salt).add(uint(77))).mul(0.6).add(0.7));
			data.element(i).assign(vec4(life, life, hash(i.add(uint(53))), THROWN));
		});
	})().compute(MAX_BURST);

	const update = Fn(() => {
		const i = instanceIndex;
		const p = pos.element(i);
		const v = vel.element(i);
		const d = data.element(i);
		const kind = d.w;

		If(kind.equal(DEAD), () => {
			// A spare snowflake joins the snowfall, now and then, as heavy as it's meant to be.
			If(rand(i, 89).add(u.time.mul(0.71)).fract().lessThan(u.fall.mul(u.dt).mul(0.4)), () => settleFalling(i, false));
		}).Else(() => {
			const seed = d.z;
			// The wind, with gusts and eddies in it: a slowly changing noise field.
			const eddy = mx_noise_vec3(p.mul(0.16).add(vec3(u.time.mul(0.11), u.time.mul(-0.2), u.time.mul(0.07)))).mul(u.gust);
			const drift = vec3(u.wind.x, seed.mul(0.6).add(0.7).negate(), u.wind.z).add(eddy);
			// Falling snow settles into the drift at once; thrown snow slows into it.
			const settle = kind.equal(FALLING).select(float(3), float(1.6));
			const nv = v.add(drift.sub(v).mul(settle.mul(u.dt).min(1))).toVar();

			// The vortex: round, in, and up.
			const off = p.sub(u.vPos).toVar();
			const flat = vec3(off.x, 0, off.z);
			const r = max(length(flat), 0.3);
			const near = smoothstep(u.vRadius, u.vRadius.mul(0.15), r).mul(smoothstep(u.vRadius.mul(1.4), 0, off.y.abs())).mul(u.vOn);
			const round = vec3(off.z.negate(), 0, off.x).div(r);
			nv.addAssign(round.mul(u.vSwirl).sub(flat.div(r).mul(u.vPull)).add(vec3(0, u.vLift, 0)).sub(nv.mul(0.8)).mul(near).mul(u.dt.mul(3)));

			v.assign(nv);
			p.addAssign(nv.mul(u.dt));
			d.x.subAssign(u.dt);

			// Snowfall that drifts out of the area round her comes back in on the other side.
			If(kind.equal(FALLING), () => {
				const fromHer = vec3(p.x.sub(u.center.x), 0, p.z.sub(u.center.z));
				If(length(fromHer).greaterThan(u.area), () => {
					p.x.assign(u.center.x.sub(fromHer.x.mul(0.98)));
					p.z.assign(u.center.z.sub(fromHer.z.mul(0.98)));
				});
			});

			// Melted, landed, or blown far too high: gone (and back in the snowfall, if it's snowing).
			If(d.x.lessThan(0).or(p.y.lessThan(u.floor.sub(0.05))).or(p.y.greaterThan(u.floor.add(u.height.mul(3)))), () => {
				If(kind.equal(FALLING).and(rand(i, 97).lessThan(u.fall)), () => settleFalling(i, false)).Else(() => {
					d.w.assign(DEAD);
					p.assign(vec3(0, -1e4, 0));
				});
			});
		});
	})().compute(N);

	// ---------- drawing ----------

	const size = opts.size ?? 0.06;
	const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
	const at = pos.toAttribute();
	material.positionNode = at;
	const look = tint.toAttribute();
	const life = data.toAttribute();
	// Thrown snow fades in and out over its life; snowfall fades out as it lands.
	const fade = smoothstep(0, 0.35, life.x).mul(smoothstep(life.y, life.y.mul(0.92), life.x).max(life.w.equal(FALLING).select(float(1), float(0))));
	material.scaleNode = float(size).mul(life.z.mul(0.8).add(0.6)).mul(look.w).mul(life.w.equal(DEAD).select(float(0), float(1)));
	material.colorNode = look.xyz;
	const disc = smoothstep(0.5, 0.15, length(uv().sub(0.5)));
	// Right by the camera a snowflake would fill the screen, so it fades away there instead.
	const clear = smoothstep(0.5, 2.5, length(at.sub(cameraPosition)));
	material.opacityNode = disc.mul(fade).mul(clear).mul(0.9);
	material.fog = true;

	const flakes = new THREE.Sprite(material);
	flakes.count = N;
	flakes.frustumCulled = false;
	flakes.renderOrder = 2;
	game.scene.add(flakes);

	// ---------- each frame ----------

	let ready = false;
	game.drawing.then(async (ok) => {
		if (!ok) return;
		u.center.value.copy(game.player.pos);
		u.floor.value = game.world.groundAt(game.player.pos.x, game.player.pos.z, game.player.pos.y + 0.5);
		if (!Number.isFinite(u.floor.value)) u.floor.value = game.player.pos.y;
		await game.renderer.computeAsync(init);
		ready = true;
	});

	const pending: { at: THREE.Vector3; b: Burst }[] = [];
	let cursor = 0;
	game.onUpdate((dt, time) => {
		if (!ready) return;
		const p = game.player.pos;
		u.dt.value = dt;
		u.time.value = time;
		u.center.value.copy(p);
		const g = game.world.groundAt(p.x, p.z, p.y + 0.5);
		u.floor.value = Number.isFinite(g) ? g : p.y - 30;
		// Each burst takes the next run of slots, oldest snow first.
		for (const { at, b } of pending.splice(0)) {
			const n = Math.min(MAX_BURST, b.count ?? 2000, N);
			u.from.value = cursor;
			u.burstCount.value = n;
			u.origin.value.copy(at);
			u.dir.value.copy(b.dir ?? new THREE.Vector3(0, 1, 0));
			u.speed.value = b.speed ?? 6;
			u.spread.value = b.spread ?? 0.3;
			u.life.value = b.life ?? 2.5;
			u.color.value.set(b.color ?? '#ffffff');
			u.scale.value = b.size ?? 1;
			game.renderer.compute(throwBurst);
			cursor = (cursor + n) % N;
		}
		game.renderer.compute(update);
	});

	return {
		/** How many snowflakes there are at most. */
		count: N,
		/** How heavy the snowfall round her is, 0 to 1. */
		get fall() {
			return u.fall.value;
		},
		set fall(f: number) {
			u.fall.value = THREE.MathUtils.clamp(f, 0, 1);
		},
		/** Which way and how hard the wind blows (y is ignored), and how gusty it is. */
		wind: u.wind.value,
		set gust(g: number) {
			u.gust.value = g;
		},
		/** Throws snow from `at` (it's thrown with the next frame). */
		burst(at: THREE.Vector3, b: Burst = {}) {
			pending.push({ at: at.clone(), b });
		},
		vortex: {
			/** Starts (or moves) the vortex. */
			set(at: THREE.Vector3, v: Partial<Vortex> = {}) {
				u.vPos.value.copy(at);
				u.vRadius.value = v.radius ?? 6;
				u.vSwirl.value = v.swirl ?? 12;
				u.vPull.value = v.pull ?? 2;
				u.vLift.value = v.lift ?? 3;
				u.vOn.value = 1;
			},
			off() {
				u.vOn.value = 0;
			},
		},
		/** The snowflakes, to hide or move along with something. */
		object: flakes,
	};
}

export type Snow = ReturnType<typeof addSnow>;
