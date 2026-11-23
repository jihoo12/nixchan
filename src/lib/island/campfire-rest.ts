// A fire-side rest belongs to the island, not the generic static chairs. The
// player stays on a checked ground route; only her pelvis goes above the log.
import { MathUtils, Quaternion, Vector2, Vector3, type Object3D } from 'three';
import type { NixFigure } from '../experimental/nix-figure';
import type { Offer } from '../nixkit/interact';
import { within, type World } from '../nixkit/world';
import { pick } from './lang';

const LOG_R = .28, LOG_L = 1.8, STAND = .94;
const BODY = .45, HEAD = 3.01, LEG_REACH = .79, ANKLE = .136;
const IDLE_HIP = .93, IDLE_DEPTH = -.4, SHOE_Z = -.418, SHOE_X = .188;
const Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0), ZERO = new Vector2();
const ease = (t: number) => { const x = MathUtils.clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export function campfireLogLayout(x: number, z: number, terrain: (x: number, z: number) => number) {
	return [[1.6, 2.39], [3.0, 2.48]].map(([bearing, distance]) => {
		const dx = Math.cos(bearing), dz = Math.sin(bearing);
		const lx = x + dx * distance, lz = z + dz * distance;
		const axisX = -dz, axisZ = dx;
		const a = terrain(lx - axisX * LOG_L / 2, lz - axisZ * LOG_L / 2);
		const b = terrain(lx + axisX * LOG_L / 2, lz + axisZ * LOG_L / 2);
		const slope = (b - a) / LOG_L;
		const middle = (a + b) / 2 + .236;
		return {
			x: lx, z: lz, bearing, axisX, axisZ, slope, radius: LOG_R, length: LOG_L, middle,
			y: middle + LOG_R / Math.sqrt(1 + slope * slope),
			facing: Math.atan2(-dx, -dz), sx: lx - dx * STAND, sz: lz - dz * STAND,
		};
	});
}
type Seat = ReturnType<typeof campfireLogLayout>[number];
type Phase = 'approach' | 'lower' | 'seated' | 'rise';
type Person = {
	figure: Pick<NixFigure, 'group' | 'node' | 'play' | 'tick' | 'setBlink'>;
	pos: Vector3; root: { position: Vector3 }; vel: Vector3;
	turn: number; grounded: boolean; swimming: boolean; dashing: boolean;
	face: (yaw: number) => void; clearGesture: () => void;
};
type Foot = { pos: Vector3; yaw: number; pitch: number };
type BindLeg = { joints: [Object3D, Object3D, Object3D]; dirs: [Vector3, Vector3]; a: number; b: number; side: number };
type Sequence = {
	phase: Phase; t: number; seat: Seat; stand: Vector3; from: Vector3;
	yaw: number; duration: number; hipFrom: Vector3; hipTo: Vector3; before: Foot[]; planted: Foot[];
	legs: BindLeg[]; hips: Object3D; chest: Object3D | null;
	first: number; letGo: boolean; blink: number; reduced: boolean;
};

/** One safe point on a dry, clear bit of campfire ground, not on a new block or a log hump. */
export function restGround(world: World, terrain: (x: number, z: number) => number, x: number, z: number, prior: number) {
	const y = world.groundAt(x, z, prior);
	if (!world.inside(x, z) || !Number.isFinite(y) || y <= (world.fallOut ?? -Infinity)
		|| y < (world.sea?.swimIn ?? -Infinity) || Math.abs(y - prior) > .25 || y - terrain(x, z) > .13
		|| world.ceilingAt(x, z, y) < y + HEAD || (world.wadeDepth?.(x, z, y) ?? 0) > .39) return null;
	for (const f of world.nearby(x, z)) {
		if (f.dome || f.pad !== undefined || !within(f, y) || (f.top !== undefined && y >= f.top)) continue;
		if (Math.hypot(x - f.x, z - f.z) < f.r + BODY + .035) return null;
	}
	if (world.collide) {
		const p = new Vector3(x, y, z);
		world.collide(p, BODY, new Vector3());
		if (Math.abs(p.x - x) + Math.abs(p.z - z) + Math.abs(p.y - y) > .0001) return null;
	}
	return y;
}

function readLeg(figure: Person['figure'], suffix: string, side: number): BindLeg | null {
	const high = figure.node('Thigh' + suffix), low = figure.node('Shin' + suffix), foot = figure.node('Foot' + suffix);
	if (!high || !low || !foot) return null;
	return { joints: [high, low, foot], dirs: [low.position.clone().normalize(), foot.position.clone().normalize()],
		a: low.position.length(), b: foot.position.length(), side };
}

function facingOf(foot: Object3D) {
	const f = new Vector3(0, 0, 1).applyQuaternion(foot.getWorldQuaternion(new Quaternion()));
	return Math.atan2(f.x, f.z);
}

function setRotation(node: Object3D, rotation: Quaternion, world: Quaternion) {
	if (!node.parent) return;
	node.quaternion.copy(node.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world).multiply(rotation));
	node.updateWorldMatrix(true, false);
}

/** The knee points a little outward but always bends forward; the ankle's rotation is independent. */
function plant(leg: BindLeg, view: Object3D, target: Foot, yaw: number) {
	const [hip, knee, foot] = leg.joints;
	const start = view.worldToLocal(hip.getWorldPosition(new Vector3()));
	const step = view.worldToLocal(target.pos.clone()).sub(start);
	const length = step.length();
	if (length < .001) return;
	step.divideScalar(length);
	const reach = MathUtils.clamp(length, Math.abs(leg.a - leg.b) + .001, leg.a + leg.b - .001);
	const along = (leg.a ** 2 - leg.b ** 2 + reach ** 2) / (2 * reach);
	const pole = new Vector3(leg.side * .05, 0, 1).applyAxisAngle(Y, Math.atan2(Math.sin(target.yaw - yaw), Math.cos(target.yaw - yaw)) * .70);
	pole.addScaledVector(step, -pole.dot(step)).normalize();
	const bend = start.clone().addScaledVector(step, along)
		.addScaledVector(pole, Math.sqrt(Math.max(0, leg.a ** 2 - along ** 2)));
	const end = start.clone().addScaledVector(step, reach);
	const pose = view.getWorldQuaternion(new Quaternion());
	setRotation(hip, new Quaternion().setFromUnitVectors(leg.dirs[0], bend.clone().sub(start).normalize()), pose);
	setRotation(knee, new Quaternion().setFromUnitVectors(leg.dirs[1], end.sub(bend).normalize()), pose);
	setRotation(foot, new Quaternion().setFromAxisAngle(Y, target.yaw - yaw)
		.multiply(new Quaternion().setFromAxisAngle(X, target.pitch)), pose);
}

export function createCampfireRest({ world, terrain, seats, player, available, reduced }: {
	world: World; terrain: (x: number, z: number) => number; seats: readonly Seat[];
	player: Person; available: () => boolean; reduced: () => boolean;
}) {
	let sequence: Sequence | null = null;
	const ground = (x: number, z: number, y: number) => restGround(world, terrain, x, z, y);
	function soleHeight(pos: Vector3, yaw: number) {
		let y = terrain(pos.x, pos.z);
		for (const [x, z] of [[-.082,-.105],[.082,-.105],[-.082,.227],[.082,.227],[0,.252]]) {
			const v = new Vector3(x, 0, z).applyAxisAngle(Y, yaw).add(pos);
			y = Math.max(y,terrain(v.x,v.z));
		}
		return y+ANKLE;
	}
	function route(a: Vector3, b: Vector3) {
		const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .14));
		let floor = a.y;
		for (let i = 1; i <= steps; ++i) {
			const u = i / steps;
			const y = ground(MathUtils.lerp(a.x, b.x, u), MathUtils.lerp(a.z, b.z, u), floor);
			if (y === null) return false;
			floor = y;
		}
		return true;
	}
	function find() {
		if (!available() || !player.grounded || player.swimming || player.dashing) return null;
		let best: { seat: Seat; stand: Vector3; distance: number } | null = null;
		for (const seat of seats) {
			const dx = player.pos.x - seat.x, dz = player.pos.z - seat.z;
			const front = dx * Math.sin(seat.facing) + dz * Math.cos(seat.facing);
			const distance = Math.hypot(player.pos.x - seat.sx, player.pos.z - seat.sz);
			if (front < .44 || Math.hypot(dx, dz) > 1.68 || distance > .90 || distance >= (best?.distance ?? Infinity)) continue;
			const floor = ground(seat.sx, seat.sz, player.pos.y);
			if (floor === null || seat.y - floor < .20 || seat.y - floor > .60) continue;
			if (world.ceilingAt(seat.x, seat.z, floor) < seat.y + 2.18) continue;
			const stand = new Vector3(seat.sx, floor, seat.sz);
			if (route(player.pos, stand)) best = { seat, stand, distance };
		}
		return best;
	}
	function start() {
		if (sequence) return false;
		const choice = find(), hips = player.figure.node('Hips');
		const a = readLeg(player.figure, 'L', 1), b = readLeg(player.figure, 'R', -1);
		if (!choice || !hips || !a || !b) return false;
		player.clearGesture();
		const {seat, stand, distance} = choice, legs = [a, b], simple = reduced();
		const before = legs.map(leg => { const foot = leg.joints[2]; return {pos:foot.getWorldPosition(new Vector3()), yaw:facingOf(foot), pitch:0}; });
		const planted = legs.map(leg => {
			const pos = new Vector3(leg.side * SHOE_X, 0, SHOE_Z).applyAxisAngle(Y, seat.facing).add(stand);
			pos.y=soleHeight(pos,seat.facing);
			return {pos, yaw:seat.facing, pitch:0};
		});
		const first = (before[0].pos.distanceToSquared(planted[0].pos) <
			before[1].pos.distanceToSquared(planted[1].pos)) ? 0 : 1;
		sequence = {phase:'approach', t:0, seat, stand, from:player.pos.clone(),
			yaw:player.turn, duration:simple ? .40 : MathUtils.clamp(.49 + distance * .56, .52, 1.05),
			hipFrom:hips.getWorldPosition(new Vector3()),
			hipTo:new Vector3(0,IDLE_HIP,IDLE_DEPTH).applyAxisAngle(Y,seat.facing).add(stand),
			before, planted, first, hips, legs, chest:player.figure.node('Chest'),
			letGo:false, blink:2.6, reduced:simple};
		player.vel.set(0, 0, 0);
		return true;
	}
	function canStand(s: Sequence) {
		return ground(s.stand.x, s.stand.z, s.stand.y) !== null;
	}
	function stand() {
		const s = sequence;
		if (!s || s.phase !== 'seated' || !canStand(s)) return false;
		s.phase='rise'; s.t=0;
		return true;
	}
	function offer(): Offer | null {
		const s = sequence;
		if (s?.phase === 'seated') return canStand(s)
			? { label:pick({en:'Stand up', ko:'일어서기'}), go:stand }
			: { label:pick({en:'The space in front is blocked', ko:'앞자리가 막혔어요'}) };
		if (s) return { label:s.phase === 'rise' ? pick({en:'Getting up…', ko:'일어나는 중…'}) : pick({en:'Taking a seat…', ko:'앉는 중…'}) };
		return find() ? {label:pick({en:'Sit by the campfire', ko:'앉기'}), go:start} : null;
	}
	function place(p: Vector3, yaw: number) {
		player.pos.copy(p); player.root.position.copy(p); player.vel.set(0, 0, 0);
		player.face(yaw); player.figure.group.rotation.y = yaw;
		player.figure.group.updateWorldMatrix(true, false);
	}
	function limitReach(s: Sequence, targets: Foot[], release: number) {
		s.hips.updateWorldMatrix(true, false);
		let reduce = 0;
		for (let i = 0; i < 2; ++i) {
			const p = s.legs[i].joints[0].getWorldPosition(new Vector3()), to = targets[i].pos;
			const h = Math.hypot(p.x - to.x, p.z - to.z);
			const max = Math.sqrt(Math.max(.02, (LEG_REACH + .009 * release) ** 2 - h ** 2));
			reduce = Math.max(reduce, p.y - to.y - max);
		}
		s.hips.position.y -= reduce;
	}
	function update(dt: number, time: number, steering: boolean) {
		const s = sequence;
		if (!s) return;
		if (!steering) s.letGo = true;
		if (steering && s.letGo && s.phase === 'seated') stand();
		s.t += dt;
		const {seat, hips, chest} = s;
		const p = s.stand.clone();
		let yaw = seat.facing, settled = 0, lean = 0, release = 0;
		let targets = s.planted;
		if (s.phase === 'approach') {
			const u = Math.min(1, s.t / s.duration);
			p.lerpVectors(s.from, s.stand, ease(u));
			const floor = ground(p.x, p.z, player.pos.y);
			if (floor === null) { player.figure.play('Idle'); sequence=null; return; }
			p.y = floor;
			yaw = angle(s.yaw, seat.facing, ease(u));
			targets = s.before.map((foot, i) => {
				const t = MathUtils.clamp((u - (i === s.first ? 0 : .43)) / .57, 0, 1);
				const dest = s.planted[i], pos = foot.pos.clone().lerp(dest.pos, ease(t));
				const bearing = angle(foot.yaw, dest.yaw, ease(t));
				if (t > 0 && t < 1) pos.y = Math.max(pos.y, soleHeight(pos, bearing))
					+ (s.reduced ? .03 : .085) * Math.sin(Math.PI * t) ** 2;
				return {pos, yaw:bearing, pitch:0};
			});
			player.figure.play(u < .78 && s.from.distanceToSquared(s.stand) > .045 ? 'Walk' : 'Idle', .72);
		} else if (s.phase === 'lower') {
			const u = s.t / (s.reduced ? .53 : .88);
			settled = ease((u - .09) / .91);
			lean = (s.reduced ? .12 : .30) * Math.sin(Math.PI * MathUtils.clamp(u, 0, 1));
			player.figure.play(u > .19 ? 'Sit' : 'Idle');
		} else if (s.phase === 'rise') {
			const u = s.t / (s.reduced ? .64 : .82);
			settled = 1 - ease((u - .14) / .86);
			lean = (s.reduced ? .12 : .33) * Math.sin(Math.PI * ease(MathUtils.clamp(u, 0, 1)) ** .63);
			player.figure.play('Idle');
			release = ease((u - .77) / .23);
		} else {
			settled = 1; player.figure.play('Sit');
		}
		place(p, yaw);
		player.figure.tick(dt * (s.phase === 'rise' ? 1.6 : 1), time, {airborne:false, look:ZERO, still:false, jump:null});
		const authoredHip = hips.position.clone();
		if (release && release < 1) targets = targets.map((target,i) => {
			const foot = s.legs[i].joints[2];
			const pos = target.pos.clone().lerp(foot.getWorldPosition(new Vector3()),release);
			const bearing = angle(target.yaw,facingOf(foot),release);
			pos.y = Math.max(pos.y, soleHeight(pos,bearing));
			return {pos,yaw:bearing,pitch:0};
		});
		if (s.phase === 'approach') {
			const u = Math.min(1, s.t / s.duration);
			const pivot = s.hipFrom.clone().lerp(s.hipTo,ease(u));
			pivot.y -= .022 * Math.sin(u * Math.PI) ** 2;
			if (hips.parent) hips.position.copy(hips.parent.worldToLocal(pivot));
		} else {
			const top = seat.y - p.y + .135;
			hips.position.set(0, MathUtils.lerp(IDLE_HIP, top, settled),
				MathUtils.lerp(IDLE_DEPTH, -STAND+.032, settled));
			if (chest) chest.quaternion.multiply(new Quaternion().setFromAxisAngle(X, lean));
		}
		if (release) hips.position.lerp(authoredHip, release);
		if (release < 1) {
			limitReach(s, targets, release);
			for (let i = 0; i < 2; ++i) plant(s.legs[i], player.figure.group, targets[i], yaw);
		}
		s.blink -= dt;
		if (s.blink < 0) {
			player.figure.setBlink(s.blink > -.12);
			if (s.blink <= -.12) s.blink = 3.1;
		}
		if (s.phase === 'approach' && s.t >= s.duration) { s.phase='lower'; s.t=0; }
		else if (s.phase === 'lower' && s.t >= (s.reduced ? .53 : .88)) { s.phase='seated'; s.t=0; }
		else if (s.phase === 'rise' && s.t >= (s.reduced ? .64 : .82)) {
			player.figure.setBlink(false); sequence=null;
		}
	}
	return { offer, stand, update, get active() { return !!sequence; }, get phase() { return sequence?.phase ?? null; } };
}
