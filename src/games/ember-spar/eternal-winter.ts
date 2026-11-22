// Eternal Winter: Nixchan's ultimate, and the cutscene it plays in, as in Snow Magic (this is a copy
// of src/games/snowmagic/ultimate.ts, since a game keeps to its own folder; up on the rooftop the
// one "snowman" is Noeul). Seven seconds, all in the game's own time, so the snow carries on round it:
//
//   0.0  the bars close in, the sky starts to darken, and she crouches to gather the cold: snow
//        streams in to her paws from all round (a close-up, from in front of her)
//   1.4  she opens her arms and rises off the ground, a snowflake sigil spreading out under her
//        (the camera circles her from below)
//   3.0  up in the air, she calls winter down: an aurora over the clearing, a beam of light, heavy
//        snow, and the title (a wide shot from low down, looking up at her against the sky)
//   4.62 she drops and strikes the ground: a white flash, a shock wave, and ice spires bursting up
//        across the whole clearing as it passes, frosting every snowman it reaches
//   5.3  the camera pulls up and away over the ice, and eases back to following her at 7.0
//
// The spires shatter into snow a little later, and the sky clears. The pose is the 'Ultimate' clip
// (tools/nixchan-3d/build.py), which strikes the ground at 0.66 of the way through: IMPACT here.
// Esc, Space or Enter (or the Skip button) goes straight to the strike and back to her.
import * as THREE from 'three';
import { ORDER } from '../../lib/nixkit/engine';
import type { Game } from '../../lib/nixkit/game';
import { pick } from '../../lib/nixkit/lang';
import type { Snow } from '../../lib/nixkit/snow';

/** How long the cutscene is, and when she strikes the ground (ULT_HIT × 7 s in build.py). */
export const LENGTH = 7;
const IMPACT = 4.62;
/** When the last of it (the ice, the aurora) is gone. */
const AFTER = 9.6;
/** How fast the shock wave spreads, in m/s. */
const WAVE = 17;
const HOVER = 1.9;

const smooth = (a: number, b: number, t: number) => THREE.MathUtils.smoothstep(t, a, b);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const outCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const outBack = (t: number) => {
	const u = clamp01(t) - 1;
	return 1 + 2.7 * u ** 3 + 1.7 * u ** 2;
};

export interface UltimateOptions {
	/** The clearing's radius: the sigil and the ice fill it. */
	arena: number;
	/** Where the snowmen stand, for a pillar of ice round each. */
	snowmen: THREE.Vector3[];
	/** Each frame after the strike: how far the shock wave has spread from `from`. */
	onWave: (from: THREE.Vector3, radius: number) => void;
	/** When it's skipped, to let her go at once. */
	onSkip: () => void;
	/** Each frame of the cutscene, where the camera is and what it's looking at (null once it's
	 * done), so the game can hide whatever stands in the way. */
	onCamera: (from: THREE.Vector3 | null, to: THREE.Vector3) => void;
}

export function createEternalWinter(game: Game, snow: Snow, opts: UltimateOptions) {
	const { scene, camera, player, sky, hud } = game;
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
	const additive = (color: THREE.ColorRepresentation) =>
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

	// ---------- what it draws ----------

	// Night falling: a dark dome round the camera, over the sky (drawn before everything else
	// that's see-through, so the aurora and the snow show over it).
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(400, 32, 16),
		new THREE.MeshBasicMaterial({ color: '#070620', transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false }),
	);
	dome.renderOrder = -10;
	dome.frustumCulled = false;

	// The aurora: curtains of light on arcs far off behind her, bright at the foot and fading out
	// upwards and at the ends (added light, so black is nothing).
	const ROWS = 7;
	const COLS = 90;
	const auroraMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
	const curtains = [
		{ radius: 72, base: 20, height: 17, span: 2.6, phase: 0 },
		{ radius: 88, base: 26, height: 20, span: 2.2, phase: 2.1 },
		{ radius: 60, base: 15, height: 12, span: 1.7, phase: 4.3 },
	].map((c) => {
		const geo = new THREE.BufferGeometry();
		const position = new Float32Array(ROWS * COLS * 3);
		const color = new Float32Array(ROWS * COLS * 3);
		const green = new THREE.Color('#4dffae');
		const cyan = new THREE.Color('#5fd2ff');
		const violet = new THREE.Color('#a477ff');
		const col = new THREE.Color();
		for (let r = 0; r < ROWS; r++) {
			const v = r / (ROWS - 1);
			for (let k = 0; k < COLS; k++) {
				const u = k / (COLS - 1);
				col.copy(green).lerp(cyan, smooth(0, 0.45, v)).lerp(violet, smooth(0.4, 1, v));
				const glow = (1 - v) ** 1.4 * smooth(0, 0.12, v + 0.02) * Math.sin(Math.PI * u) ** 0.8 * (0.75 + 0.25 * Math.sin(u * 31 + c.phase));
				col.multiplyScalar(glow).toArray(color, (r * COLS + k) * 3);
			}
		}
		const index: number[] = [];
		for (let r = 0; r < ROWS - 1; r++)
			for (let k = 0; k < COLS - 1; k++) {
				const a = r * COLS + k;
				index.push(a, a + 1, a + COLS, a + 1, a + COLS + 1, a + COLS);
			}
		geo.setIndex(index);
		geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
		const mesh = new THREE.Mesh(geo, auroraMat);
		mesh.frustumCulled = false;
		return { ...c, mesh, position };
	});

	// The sigil: a six-armed snowflake in rings, drawn in light on the snow (made a metre across,
	// and scaled up to fill the clearing).
	const sigilMat = additive('#8fe3ff');
	const sigil = new THREE.Group();
	const sigilFlat = new THREE.Group();
	sigilFlat.rotation.x = -Math.PI / 2;
	sigil.add(sigilFlat);
	const line = (w: number, len: number, along: number, angle: number, off = 0) => {
		const geo = new THREE.PlaneGeometry(w, len);
		geo.translate(0, len / 2, 0);
		const m = new THREE.Mesh(geo, sigilMat);
		const pivot = new THREE.Group();
		pivot.rotation.z = angle;
		m.position.y = along;
		m.rotation.z = off;
		pivot.add(m);
		sigilFlat.add(pivot);
	};
	for (const [inner, outer] of [[0.95, 1], [0.6, 0.625], [0.28, 0.305]]) sigilFlat.add(new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128), sigilMat));
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		line(0.03, 0.95, 0, a);
		for (const side of [-1, 1]) {
			line(0.022, 0.24, 0.5, a, side * 1.0);
			line(0.018, 0.15, 0.74, a, side * 1.0);
		}
		// Little diamonds between the arms.
		line(0.02, 0.12, 0.82, a + Math.PI / 6, 0.5);
		line(0.02, 0.12, 0.82, a + Math.PI / 6, -0.5);
	}

	// A beam of light from the sky down onto her, and the shock wave's two rings.
	const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
	beamGeo.translate(0, 0.5, 0);
	const beam = new THREE.Mesh(beamGeo, additive('#bfeaff'));
	const rings = [0, 1].map(() => {
		const r = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 128), additive('#dff4ff'));
		r.rotation.x = -Math.PI / 2;
		return r;
	});

	// The ice: a cluster of crystals at each spire, all one instanced mesh.
	const crystalGeo = new THREE.ConeGeometry(0.5, 1, 6);
	crystalGeo.translate(0, 0.5, 0);
	const iceMat = game.toon({ color: '#c4ecff', emissive: '#2d6fa8', emissiveIntensity: 0.35 });
	interface Crystal { tilt: THREE.Euler; width: number; height: number; off: THREE.Vector3 }
	interface Spire { at: THREE.Vector3; delay: number; shatter: number; crystals: Crystal[]; risen: boolean; broken: boolean }
	let spires: Spire[] = [];
	const MAX_CRYSTALS = 4 * (48 + opts.snowmen.length);
	const ice = new THREE.InstancedMesh(crystalGeo, iceMat, MAX_CRYSTALS);
	ice.castShadow = true;
	ice.frustumCulled = false;
	ice.count = 0;

	const fx = new THREE.Group();
	fx.add(dome, sigil, beam, ...rings, ice, ...curtains.map((c) => c.mesh));
	fx.visible = false;
	scene.add(fx);

	// ---------- the bars, the title, the flash ----------

	const overlay = document.createElement('div');
	overlay.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;overflow:hidden;visibility:hidden';
	const bar = (top: boolean) => {
		const b = document.createElement('div');
		b.style.cssText = `position:absolute;left:0;right:0;${top ? 'top' : 'bottom'}:0;height:12vh;background:#04030d;transform:translateY(${top ? -101 : 101}%);transition:transform .6s cubic-bezier(.2,.8,.2,1)`;
		overlay.append(b);
		return b;
	};
	const barTop = bar(true);
	const barBottom = bar(false);
	const whiteout = document.createElement('div');
	whiteout.style.cssText = 'position:absolute;inset:0;background:#f3fbff;opacity:0';
	const title = document.createElement('div');
	title.style.cssText = 'position:absolute;left:16px;right:16px;top:62%;text-align:center;color:#fdfdff;opacity:0;transition:opacity .5s,letter-spacing 1.6s cubic-bezier(.2,.8,.2,1);letter-spacing:.02em';
	const titleSmall = document.createElement('p');
	titleSmall.style.cssText = 'margin:0 0 6px;font:800 clamp(12px,1.8vw,16px) var(--sans,system-ui,sans-serif);letter-spacing:.3em;color:#bfe6ff;text-transform:uppercase';
	titleSmall.textContent = pick({ en: "Nixchan's ultimate", ko: '닉스쨩의 궁극기' });
	const titleBig = document.createElement('p');
	titleBig.style.cssText = 'margin:0;font:900 clamp(30px,7.5vw,80px)/1.05 var(--display,var(--sans,system-ui,sans-serif));text-shadow:0 0 18px #7fd0ff,0 0 42px #6f8bff,0 3px 0 #2c2a52';
	titleBig.textContent = pick({ en: 'ETERNAL WINTER', ko: '영원한 겨울' });
	title.append(titleSmall, titleBig);
	const skipButton = document.createElement('button');
	skipButton.type = 'button';
	skipButton.textContent = pick({ en: 'Skip ▸▸', ko: '건너뛰기 ▸▸' });
	skipButton.style.cssText = 'position:absolute;right:16px;bottom:calc(6vh - 16px);min-height:32px;padding:4px 14px;border:1px solid #ffffff40;border-radius:99px;background:transparent;color:#dfe9ff;font:700 13px var(--sans,system-ui);cursor:pointer;pointer-events:auto;touch-action:manipulation';
	skipButton.addEventListener('click', () => skip());
	overlay.append(whiteout, title, skipButton);
	document.body.append(overlay);

	// ---------- running it ----------

	/** How far into it we are (seconds), or -1 when it isn't on. */
	let t = -1;
	/** When the camera's back with her: LENGTH, or sooner once it's skipped. */
	let camEnd = LENGTH;
	let skipped = false;
	let struck = false;
	let burstClock = 0;
	let liftBase = 0;
	let hudEl: HTMLElement | null = null;
	const at = new THREE.Vector3();
	const forward = new THREE.Vector3();
	const right = new THREE.Vector3();
	const saved = { hemi: 0, sun: 0, fog: new THREE.Color(), fall: 0 };
	const NIGHT_FOG = new THREE.Color('#1d1b48');

	function start() {
		if (t >= 0) finish();
		t = 0;
		camEnd = LENGTH;
		skipped = false;
		struck = false;
		burstClock = 0;
		at.copy(player.pos);
		forward.set(Math.sin(player.heading), 0, Math.cos(player.heading));
		right.set(forward.z, 0, -forward.x);
		saved.hemi = sky.hemi.intensity;
		saved.sun = sky.sun.intensity;
		saved.fog.copy(sky.fog.color);
		saved.fall = snow.fall;
		liftBase = player.figure.group.position.y;

		// The aurora's behind her, as the wide shot from in front of her sees it.
		const behind = Math.atan2(-forward.x, -forward.z);
		for (const c of curtains) {
			c.mesh.position.set(at.x, 0, at.z);
			c.mesh.userData.center = behind + (c.phase - 2) * 0.12;
		}
		sigil.position.set(at.x, at.y + 0.04, at.z);
		beam.position.set(at.x, at.y, at.z);
		for (const r of rings) r.position.set(at.x, at.y + 0.08, at.z);
		makeSpires();
		fx.visible = true;

		overlay.style.visibility = 'visible';
		barTop.style.transform = barBottom.style.transform = 'translateY(0)';
		skipButton.hidden = false;
		hudEl = document.querySelector<HTMLElement>('.nk-hud');
		if (hudEl) {
			hudEl.style.transition = 'opacity .4s';
			hudEl.style.opacity = '0';
		}
		game.emote('determined', 4.6);
	}

	/** Spires all over the clearing (none right on top of her), and one round each snowman. */
	function makeSpires() {
		spires = [];
		const rand = mulberry(Math.floor(Math.random() * 1e9));
		const add = (x: number, z: number, big: boolean) => {
			const p = new THREE.Vector3(x, at.y, z);
			const d = Math.hypot(x - at.x, z - at.z);
			if (d < 2.6) return;
			const n = big ? 4 : 2 + Math.floor(rand() * 2);
			const crystals: Crystal[] = [];
			for (let i = 0; i < n; i++) {
				const main = i === 0;
				const a = rand() * Math.PI * 2;
				const lean = main ? rand() * 0.12 : 0.35 + rand() * 0.35;
				crystals.push({
					tilt: new THREE.Euler(Math.cos(a) * lean, rand() * Math.PI, Math.sin(a) * lean),
					width: (big ? 1.5 : 0.7 + rand() * 0.5) * (main ? 1 : 0.6),
					height: (big ? 3.6 : 1.6 + rand() * 3.4) * (main ? 1 : 0.55 + rand() * 0.2),
					off: main ? new THREE.Vector3() : new THREE.Vector3(Math.sin(a) * 0.35, -0.1, Math.cos(a) * 0.35),
				});
			}
			spires.push({ at: p, delay: IMPACT + d / WAVE, shatter: 6.4 + rand() * 1.6 + d * 0.03, crystals, risen: false, broken: false });
		};
		for (const s of opts.snowmen) add(s.x, s.z, true);
		const N = 48;
		for (let i = 0; i < N; i++) {
			const a = i * 2.39996 + rand() * 0.3;
			const r = 3 + Math.sqrt((i + 0.5) / N) * (opts.arena - 5);
			const x = Math.sin(a) * r;
			const z = Math.cos(a) * r;
			if (opts.snowmen.some((s) => Math.hypot(s.x - x, s.z - z) < 1.8)) continue;
			add(x, z, false);
		}
	}

	function skip() {
		if (t < 0 || skipped || t >= camEnd) return;
		skipped = true;
		if (t < IMPACT) t = IMPACT - 0.001;
		camEnd = Math.min(camEnd, t + 0.8);
		opts.onSkip();
	}

	function finish() {
		t = -1;
		fx.visible = false;
		ice.count = 0;
		snow.vortex.off();
		snow.fall = saved.fall;
		restoreSky();
		player.figure.group.position.y = liftBase;
		endCutscene();
	}

	function endCutscene() {
		barTop.style.transform = 'translateY(-101%)';
		barBottom.style.transform = 'translateY(101%)';
		skipButton.hidden = true;
		title.style.opacity = '0';
		if (hudEl) hudEl.style.opacity = '';
		setTimeout(() => {
			if (t < 0 || t >= camEnd) overlay.style.visibility = 'hidden';
		}, 700);
	}

	function restoreSky() {
		sky.hemi.intensity = saved.hemi;
		sky.sun.intensity = saved.sun;
		sky.fog.color.copy(saved.fog);
	}

	/** How high she's floating. */
	function liftAt(time: number) {
		if (skipped || time < 1.4 || time >= IMPACT) return 0;
		if (time < 3) return HOVER * outCubic((time - 1.4) / 1.6);
		if (time < 4.25) return HOVER + 0.12 * Math.sin((time - 3) * 4);
		const u = (time - 4.25) / (IMPACT - 4.25);
		return (HOVER + 0.12 * Math.sin(1.25 * 4)) * (1 - u * u);
	}

	// She floats: after she's been moved and posed, before the camera looks at her.
	game.engine.add({
		order: ORDER.player + 1,
		update() {
			if (t >= 0 && t < IMPACT + 0.1) player.figure.group.position.y = liftBase + liftAt(t);
		},
	});

	// Keys, while it's on: Esc, Space or Enter skips; the rest do nothing (she's busy).
	game.keys.intercept((key) => {
		if (t < 0 || t >= camEnd) return false;
		if (key === 'escape' || key === ' ' || key === 'enter') skip();
		return true;
	}, 100);

	// ---------- each frame: the magic ----------

	const tmp = new THREE.Vector3();
	const dir = new THREE.Vector3();
	const m4 = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const scl = new THREE.Vector3();
	const pos = new THREE.Vector3();
	const UP = new THREE.Vector3(0, 1, 0);

	game.onUpdate((dt, time) => {
		if (t < 0) return;
		const was = t;
		t += dt;
		const lift = liftAt(t);
		const her = tmp.copy(at).setY(at.y + 1.1 + lift);

		// The night, the aurora, the sigil and the beam.
		const night = smooth(0, 1.2, t) * (1 - smooth(6.6, 8.8, t));
		dome.position.copy(camera.position);
		dome.material.opacity = 0.82 * night;
		sky.hemi.intensity = saved.hemi * (1 - 0.55 * night);
		sky.sun.intensity = saved.sun * (1 - 0.7 * night);
		sky.fog.color.copy(saved.fog).lerp(NIGHT_FOG, night);
		const aurora = smooth(2.5, 3.6, t) * (1 - smooth(7.2, AFTER - 0.2, t));
		auroraMat.opacity = aurora;
		if (aurora > 0) for (const c of curtains) waveCurtain(c, time);

		const grow = outCubic((t - 1.4) / 1.8);
		sigil.scale.setScalar(Math.max(0.001, grow * (opts.arena - 1.2)));
		sigil.rotation.y += dt * (t < IMPACT ? 0.35 : 0.08);
		const flare = t >= IMPACT ? Math.exp(-(t - IMPACT) * 3) : 0;
		sigilMat.opacity = (0.75 * smooth(1.4, 2.2, t) + 0.25 * flare + 0.12 * Math.sin(time * 6) * smooth(1.4, 2.2, t)) * (1 - smooth(5.2, 7, t));

		const beamOn = smooth(3, 3.6, t) * (t < IMPACT ? 1 : Math.exp(-(t - IMPACT) * 4));
		beam.material.opacity = 0.32 * beamOn + 0.5 * flare;
		const beamR = t < IMPACT ? 0.5 + 0.6 * smooth(3, 4.4, t) : 1.1 + 4 * (1 - flare);
		beam.scale.set(beamR, 70, beamR);
		beam.visible = beam.material.opacity > 0.01;

		// The snow: drawn in to her paws, swirling up round her as she rises, falling hard while
		// she's up there, and thrown out every way when she strikes.
		burstClock -= dt;
		if (t < 1.4) {
			snow.vortex.set(her, { radius: 10, swirl: 9, pull: 7, lift: 0.4 });
			if (burstClock <= 0) {
				burstClock = 0.05;
				const a = Math.random() * Math.PI * 2;
				const from = pos.set(at.x + Math.sin(a) * 9, at.y + 0.3 + Math.random() * 2, at.z + Math.cos(a) * 9);
				snow.burst(from, { count: 380, dir: dir.subVectors(her, from).normalize(), speed: 9, spread: 0.06, life: 1.3, color: Math.random() < 0.5 ? '#9fd4ff' : '#ffffff', size: 1.2 });
			}
		} else if (t < 3) {
			snow.vortex.set(her, { radius: 6, swirl: 16, pull: 2, lift: 5 });
			snow.burst(pos.copy(at).setY(at.y + 0.2), { count: 260, dir: dir.set(Math.sin(time * 9), 1.2, Math.cos(time * 9)), speed: 6, spread: 0.3, life: 1.8, color: '#dff1ff', size: 1.2 });
		} else if (t < IMPACT) {
			snow.fall = Math.max(snow.fall, 1);
			snow.vortex.set(pos.copy(at).setY(at.y + 3), { radius: 16, swirl: 10, pull: 1, lift: 1.5 });
			if (burstClock <= 0) {
				burstClock = 0.05;
				const a = Math.random() * Math.PI * 2;
				const r = Math.sqrt(Math.random()) * 14;
				snow.burst(pos.set(at.x + Math.sin(a) * r, at.y + 16, at.z + Math.cos(a) * r), { count: 700, dir: dir.set(0, -1, 0), speed: 10, spread: 0.2, life: 2.2, color: '#e8f6ff', size: 1.3 });
			}
		}
		if (was < IMPACT && t >= IMPACT) strike();
		if (t > IMPACT) {
			snow.fall = THREE.MathUtils.lerp(1, saved.fall, smooth(IMPACT, 8.5, t));
			const since = t - IMPACT;
			rings.forEach((r, i) => {
				const radius = 0.5 + since * WAVE * (i ? 0.62 : 1);
				r.scale.setScalar(radius);
				r.material.opacity = 0.9 * (1 - clamp01(radius / (opts.arena + 6)));
				r.visible = r.material.opacity > 0.01;
			});
			opts.onWave(at, since * WAVE);
		}
		updateIce();

		if (t >= camEnd && t - dt < camEnd) endCutscene();
		if (t >= AFTER) finish();
	});

	function strike() {
		struck = true;
		whiteout.style.transition = 'none';
		whiteout.style.opacity = '0.95';
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				whiteout.style.transition = 'opacity .7s ease-out';
				whiteout.style.opacity = '0';
			}),
		);
		title.style.opacity = '0';
		snow.vortex.off();
		const ground = pos.copy(at).setY(at.y + 0.3);
		for (let i = 0; i < 12; i++) {
			const a = (i / 12) * Math.PI * 2;
			snow.burst(ground, { count: 3000, dir: dir.set(Math.sin(a), 0.15, Math.cos(a)), speed: 17, spread: 0.1, life: 1.6, color: '#bfe3ff', size: 1.4 });
		}
		snow.burst(ground, { count: 12000, dir: UP, speed: 12, spread: 0.6, life: 3, size: 1.5 });
		snow.burst(ground, { count: 5000, dir: UP, speed: 5, spread: 1, life: 2.2, color: '#bfe3ff', size: 2.2 });
		game.emote('happy', 3);
	}

	function updateIce() {
		let n = 0;
		for (const s of spires) {
			if (s.broken || t < s.delay) continue;
			const rise = outBack((t - s.delay) / 0.32);
			if (!s.risen) {
				s.risen = true;
				snow.burst(pos.copy(s.at).setY(s.at.y + 0.5), { count: 900, dir: UP, speed: 6, spread: 0.45, life: 1.8, color: '#cfeaff', size: 1.3 });
			}
			let shrink = 1;
			if (t > s.shatter) {
				shrink = 1 - (t - s.shatter) / 0.22;
				if (shrink <= 0) {
					s.broken = true;
					const mid = pos.copy(s.at).setY(s.at.y + s.crystals[0].height * 0.5);
					snow.burst(mid, { count: 2200, dir: UP, speed: 5, spread: 1, life: 2.2, size: 1.4 });
					snow.burst(mid, { count: 700, dir: UP, speed: 3, spread: 1, life: 1.6, color: '#a8dcff', size: 2 });
					continue;
				}
			}
			for (const c of s.crystals) {
				if (n >= MAX_CRYSTALS) break;
				q.setFromEuler(c.tilt);
				scl.set(c.width * (0.6 + 0.4 * shrink), c.height * rise * shrink, c.width * (0.6 + 0.4 * shrink));
				m4.compose(pos.copy(s.at).add(c.off).setY(s.at.y + c.off.y - 0.15), q, scl);
				ice.setMatrixAt(n++, m4);
			}
		}
		ice.count = n;
		ice.instanceMatrix.needsUpdate = true;
	}

	function waveCurtain(c: (typeof curtains)[number], time: number) {
		const center = c.mesh.userData.center as number;
		for (let k = 0; k < COLS; k++) {
			const u = k / (COLS - 1);
			const a = center + (u - 0.5) * c.span;
			const sway = 5 * Math.sin(u * 7 + time * 0.6 + c.phase) + 2.2 * Math.sin(u * 19 - time * 1.3);
			for (let r = 0; r < ROWS; r++) {
				const v = r / (ROWS - 1);
				const rad = c.radius + sway * (0.6 + 0.4 * v) + v * 6;
				const y = c.base + v * c.height + 1.5 * Math.sin(u * 11 + time * 0.9 + c.phase) * v;
				const i = (r * COLS + k) * 3;
				c.position[i] = Math.sin(a) * rad;
				c.position[i + 1] = y;
				c.position[i + 2] = Math.cos(a) * rad;
			}
		}
		c.mesh.geometry.attributes.position.needsUpdate = true;
	}

	// ---------- the camera ----------

	const shotPos = new THREE.Vector3();
	const shotLook = new THREE.Vector3();
	// (A camera, since a plain Object3D's lookAt turns its +z to the target, and a camera's -z.)
	const aim = new THREE.PerspectiveCamera();
	const followPos = new THREE.Vector3();
	const followQ = new THREE.Quaternion();
	/** Where the camera is, and what it looks at, at `time` into it. */
	function shot(time: number) {
		const lift = liftAt(time);
		const along = (f: number, r: number, y: number) => shotPos.copy(at).addScaledVector(forward, f).addScaledVector(right, r).setY(at.y + y);
		if (time < 1.4) {
			// Close in on her, from in front and a little below, as she gathers it.
			const u = time / 1.4;
			along(3.3 - 0.7 * u, 0.7 - 0.3 * u, 0.85);
			shotLook.copy(at).setY(at.y + 1.0);
		} else if (time < 3) {
			// Circling her from below as she rises.
			const u = outCubic((time - 1.4) / 1.6);
			const a = -1.0 + 2.2 * u;
			along(Math.cos(a) * 5.4, Math.sin(a) * 5.4, 0.35 + 0.6 * u);
			shotLook.copy(at).setY(at.y + 1.3 + lift);
		} else if (time < 4.3) {
			// Wide and low, looking up at her against the aurora.
			const u = (time - 3) / 1.3;
			const a = 0.45 - 0.2 * u;
			along(Math.cos(a) * (10.5 - 1.5 * u), Math.sin(a) * (10.5 - 1.5 * u), 1.3);
			shotLook.copy(at).setY(at.y + 4.2 + lift * 0.3);
		} else if (time < 5.3) {
			// The strike, from beside her.
			const u = (time - 4.3) / 1;
			along(5.5 + u * 1.2, 3.2, 1.8 + u * 0.6);
			shotLook.copy(at).setY(at.y + 0.9 + lift * 0.6);
		} else {
			// Up and away over the ice.
			const u = outCubic((time - 5.3) / 1.7);
			const a = 0.9 + 0.5 * u;
			const r = 8 + 14 * u;
			along(Math.cos(a) * r, Math.sin(a) * r, 3 + 10 * u);
			shotLook.copy(at).setY(at.y + 1 - u * 0.5);
		}
		// The ground shakes when she strikes it.
		if (time > IMPACT && !reduceMotion.matches) {
			const k = 0.4 * Math.exp(-(time - IMPACT) * 4.5);
			shotPos.x += Math.sin(time * 71) * k;
			shotPos.y += Math.sin(time * 53 + 1) * k;
			shotPos.z += Math.sin(time * 67 + 2) * k;
		}
	}

	game.engine.add({
		order: ORDER.camera + 1,
		always: true,
		update() {
			if (t < 0 || t >= camEnd) return opts.onCamera(null, at);
			// Eased in from the follow camera, and back out to it at the end.
			const w = smooth(0, 0.45, t) * (1 - smooth(camEnd - (skipped ? 0.8 : 0.9), camEnd, t));
			followPos.copy(camera.position);
			followQ.copy(camera.quaternion);
			shot(t);
			aim.position.copy(shotPos);
			aim.lookAt(shotLook);
			camera.position.copy(followPos).lerp(shotPos, w);
			camera.quaternion.copy(followQ).slerp(aim.quaternion, w);
			opts.onCamera(camera.position, shotLook);
			// The title, while she's up in the air calling it down.
			const showTitle = !skipped && !struck && t > 3.15;
			if (showTitle !== (title.style.opacity === '1')) {
				title.style.opacity = showTitle ? '1' : '0';
				title.style.letterSpacing = showTitle ? '.14em' : '.02em';
			}
		},
	});

	return {
		start,
		skip,
		/** Whether it's playing (from the start until the ice has gone). */
		get active() {
			return t >= 0;
		},
		/** Whether the cutscene's camera has her. */
		get cutscene() {
			return t >= 0 && t < camEnd;
		},
	};
}

/** A little seeded random, so each spire's crystals stay as they were made. */
function mulberry(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}
