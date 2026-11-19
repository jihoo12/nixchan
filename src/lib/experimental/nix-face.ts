// Nixchan's expressions share the original painted Face UVs. Every frame needn't upload a new
// texture: neutral maps are immutable/shared, and expressions reuse one canvas per active figure.
import * as THREE from 'three';

export type FaceEmotion = 'neutral' | 'happy' | 'surprised' | 'sad' | 'determined';

const SKIN = '#fde9df';
const INK = '#1d1b3a';
const lerp = THREE.MathUtils.lerp;

type Mood = {
	eyeHeight: number;
	eyeY: number;
	tilt: number;
	lid: number;
	blush: number;
	brow: { inner: number; outer: number; arc: number };
	mouth: { width: number; y: number; top: number; bottom: number; smile: number; tongue: boolean };
};

// +y moves down the face. Brows use mirrored inner/outer positions, not mirrored screen tilt.
const moods: Record<FaceEmotion, Mood> = {
	neutral:    { eyeHeight: 1.0,  eyeY: 0,      tilt: 0,     lid: .09, blush: .6,  brow: { inner: -.095, outer: -.095, arc: .03 }, mouth: { width: .084, y: .466, top: 0,      bottom: .025, smile: 0,      tongue: false } },
	happy:      { eyeHeight: .84,  eyeY: .025,   tilt: -.12,  lid: -.12, blush: .81, brow: { inner: -.084, outer: -.085, arc: .065 }, mouth: { width: .122, y: .451, top: -.008, bottom: .164, smile: .04,   tongue: true } },
	surprised:  { eyeHeight: 1.17, eyeY: .008,   tilt: 0,     lid: .11, blush: .44, brow: { inner: -.170, outer: -.154, arc: .061 }, mouth: { width: .066, y: .492, top: -.100, bottom: .118, smile: 0,     tongue: true } },
	sad:        { eyeHeight: .76,  eyeY: .015,   tilt: .20,   lid: .11, blush: .32, brow: { inner: -.110, outer: -.031, arc: .04 }, mouth: { width: .085, y: .515, top: -.075, bottom: -.073, smile: 0,    tongue: false } },
	determined: { eyeHeight: .73,  eyeY: .017,   tilt: -.29,  lid: .06, blush: .53, brow: { inner: -.010, outer: -.116, arc: .008 }, mouth: { width: .092, y: .489, top: .013,  bottom: .033, smile: .013, tongue: false } },
};

function paintBrows(ctx: CanvasRenderingContext2D, mood: Mood, strength: number) {
	ctx.strokeStyle = '#444064';
	ctx.globalAlpha = Math.min(1, strength * 2.4);
	ctx.lineWidth = lerp(.02, .036, strength);
	for (const side of [-1, 1]) {
		const inner = lerp(-.087, mood.brow.inner, strength);
		const outer = lerp(-.087, mood.brow.outer, strength);
		ctx.beginPath();
		ctx.moveTo(side * .255, inner);
		ctx.quadraticCurveTo(side * .391, (inner + outer) * .5 - mood.brow.arc * strength, side * .525, outer);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function paintMouth(ctx: CanvasRenderingContext2D, mood: Mood, strength: number) {
	const m = mood.mouth;
	const width = lerp(.075, m.width, strength);
	const y = lerp(.473, m.y, strength);
	const corner = m.smile * strength;
	ctx.save();
	ctx.globalAlpha = Math.min(1, strength / .34);
	ctx.strokeStyle = '#663846';
	ctx.lineWidth = lerp(.02, .029, strength);
	ctx.beginPath();
	ctx.moveTo(-width, y - corner);
	ctx.bezierCurveTo(-width * .7, y + m.top * strength, width * .7, y + m.top * strength, width, y - corner);
	if (Math.abs(m.bottom - m.top) > .016) {
		ctx.bezierCurveTo(width * .77, y + m.bottom * strength, -width * .77, y + m.bottom * strength, -width, y - corner);
		ctx.closePath();
		ctx.fillStyle = '#553041';
		ctx.fill();
		if (m.tongue && strength > .23) {
			ctx.save();
			ctx.clip();
			ctx.fillStyle = '#e98c9b';
			ctx.beginPath();
			ctx.ellipse(0, y + m.bottom * strength * .70, width * .68, m.bottom * strength * .30, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}
	ctx.stroke();
	ctx.restore();
}

/** The head's skin, with the face painted where an equirectangular map puts the front (+z). */
function paintFace(ctx: CanvasRenderingContext2D, width: number, height: number, eyesClosed: boolean, mood: Mood, strength: number) {
	ctx.fillStyle = SKIN;
	ctx.fillRect(0, 0, width, height);
	// Work in radians around the front of the face: x along the equator, y down from it.
	ctx.save();
	const k = height / Math.PI;
	ctx.translate(width / 4, height / 2);
	ctx.scale(k, k);
	ctx.lineCap = ctx.lineJoin = 'round';

	for (const side of [-1, 1]) {
		const blush = ctx.createRadialGradient(side * 0.57, 0.47, 0, side * 0.57, 0.47, 0.14);
		blush.addColorStop(0, 'rgba(244, 146, 158, ' + lerp(0.6, mood.blush, strength) + ')');
		blush.addColorStop(1, 'rgba(244, 146, 158, 0)');
		ctx.fillStyle = blush;
		ctx.beginPath();
		ctx.ellipse(side * 0.57, 0.47, 0.15, 0.09, 0, 0, Math.PI * 2);
		ctx.fill();
		// The little hatch lines over the blush.
		ctx.strokeStyle = 'rgba(226, 112, 128, 0.75)';
		ctx.lineWidth = 0.012;
		for (const dx of [-0.05, 0, 0.05]) {
			ctx.beginPath();
			ctx.moveTo(side * 0.57 + dx + 0.015, 0.44);
			ctx.lineTo(side * 0.57 + dx - 0.015, 0.5);
			ctx.stroke();
		}
	}

	for (const side of [-1, 1]) {
		const cx = side * 0.4;
		const cy = 0.2;
		// Drawn at the size the numbers below read naturally, then enlarged about the eye's centre.
		ctx.save();
		ctx.translate(cx, cy);
		ctx.translate(0, mood.eyeY * strength);
		ctx.rotate(side * mood.tilt * strength);
		ctx.scale(1.16, lerp(1.16, 1.16 * mood.eyeHeight, strength));
		ctx.translate(-cx, -cy);
		if (eyesClosed) {
			ctx.strokeStyle = INK;
			ctx.lineWidth = 0.04;
			ctx.beginPath();
			ctx.moveTo(cx - 0.16, cy + 0.01);
			ctx.quadraticCurveTo(cx, cy + lerp(0.09, mood.lid, strength), cx + 0.16, cy + 0.01);
			ctx.stroke();
			ctx.restore();
			continue;
		}
		ctx.save();
		ctx.beginPath();
		ctx.ellipse(cx, cy, 0.165, 0.2, 0, 0, Math.PI * 2);
		ctx.clip();
		const iris = ctx.createLinearGradient(0, cy - 0.19, 0, cy + 0.19);
		iris.addColorStop(0, '#1f2a72');
		iris.addColorStop(0.55, '#3d5ccc');
		iris.addColorStop(1, '#8db4f5');
		ctx.fillStyle = iris;
		ctx.fillRect(cx - 0.2, cy - 0.2, 0.4, 0.4);
		// A lighter crescent low in the iris, the pupil, and a dark rim round the edge.
		ctx.fillStyle = 'rgba(176, 210, 255, 0.85)';
		ctx.beginPath();
		ctx.ellipse(cx, cy + 0.13, 0.11, 0.07, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#141a50';
		ctx.beginPath();
		ctx.ellipse(cx, cy - 0.01, 0.075, 0.105, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = '#1a2160';
		ctx.lineWidth = 0.025;
		ctx.beginPath();
		ctx.ellipse(cx, cy, 0.165, 0.2, 0, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
		// Highlights, both on the same side like the 2D art.
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.arc(cx + 0.055, cy - 0.08, 0.05, 0, Math.PI * 2);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(cx - 0.06, cy + 0.09, 0.022, 0, Math.PI * 2);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(cx + 0.075, cy + 0.06, 0.012, 0, Math.PI * 2);
		ctx.fill();
		// The heavy upper lash, with a little flick at the outer corner.
		ctx.strokeStyle = INK;
		ctx.lineWidth = 0.05;
		ctx.beginPath();
		ctx.ellipse(cx, cy + 0.01, 0.18, 0.215, 0, Math.PI * 1.12, Math.PI * 1.88);
		ctx.stroke();
		ctx.fillStyle = INK;
		ctx.beginPath();
		ctx.moveTo(cx + side * 0.12, cy - 0.15);
		ctx.lineTo(cx + side * 0.235, cy - 0.135);
		ctx.lineTo(cx + side * 0.17, cy - 0.04);
		ctx.fill();
		// A soft lower lash along the outer half.
		ctx.lineWidth = 0.016;
		ctx.beginPath();
		ctx.ellipse(cx, cy - 0.01, 0.17, 0.225, 0, Math.PI * (side > 0 ? 0.08 : 0.62), Math.PI * (side > 0 ? 0.38 : 0.92));
		ctx.stroke();
		ctx.restore();
	}

	if (strength > 0) paintBrows(ctx, mood, strength);
	// Keep the exact original :3 for neutral; blend it out as the new shape opens.
	if (strength < 0.34) {
		ctx.globalAlpha = 1 - strength / 0.34;
		ctx.strokeStyle = '#6b3a40';
		ctx.lineWidth = 0.02;
		ctx.beginPath();
		ctx.arc(-0.042, 0.46, 0.042, 0.1, Math.PI);
		ctx.moveTo(0.084, 0.46);
		ctx.arc(0.042, 0.46, 0.042, 0, Math.PI - 0.1);
		ctx.stroke();
		ctx.globalAlpha = 1;
	}
	if (strength > 0) paintMouth(ctx, mood, strength);
	ctx.restore();
}

function createMap(width: number, height: number, dynamic = false) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	if (dynamic) {
		// No mipmap regeneration on every animation step; the fixed neutral maps keep their mipmaps.
		texture.generateMipmaps = false;
		texture.minFilter = THREE.LinearFilter;
	} else texture.anisotropy = 4;
	return {
		texture,
		draw(eyesClosed: boolean, mood: Mood, strength: number) {
			paintFace(ctx, width, height, eyesClosed, mood, strength);
			texture.needsUpdate = true;
		},
	};
}

let neutralMaps: readonly [THREE.CanvasTexture, THREE.CanvasTexture] | undefined;
function neutralPair() {
	if (!neutralMaps) {
		const open = createMap(2048, 1024);
		const closed = createMap(2048, 1024);
		open.draw(false, moods.neutral, 0);
		closed.draw(true, moods.neutral, 0);
		neutralMaps = [open.texture, closed.texture];
	}
	return neutralMaps;
}

/** Original neutral/blinking face until the caller opts in to a non-neutral expression. */
export function createFace() {
	const neutral = neutralPair();
	let dynamic: ReturnType<typeof createMap> | undefined;
	let emotion: FaceEmotion = 'neutral';
	let level = 0;
	let eyesClosed = false;
	let map: THREE.CanvasTexture = neutral[0];
	const refresh = () => {
		if (emotion === 'neutral' || level === 0) return neutral[Number(eyesClosed)];
		dynamic ??= createMap(1024, 512, true);
		dynamic.draw(eyesClosed, moods[emotion], level / 16);
		return dynamic.texture;
	};
	return {
		get map() { return map; },
		blink(closed: boolean) {
			if (closed !== eyesClosed) {
				eyesClosed = closed;
				map = refresh();
			}
			return map;
		},
		emote(next: FaceEmotion, strength: number) {
			const step = next === 'neutral' ? 0 : Math.round(THREE.MathUtils.clamp(Number.isFinite(strength) ? strength : 0, 0, 1) * 16);
			const mood = step === 0 ? 'neutral' : next;
			if (mood !== emotion || step !== level) {
				emotion = mood;
				level = step;
				map = refresh();
			}
			return map;
		},
	};
}
