// Time-based facial cues. Kept separate from locomotion and the game clock's pause behavior.
export const EMOTIONS = ['happy', 'surprised', 'sad', 'determined'] as const;
export type Emotion = (typeof EMOTIONS)[number];

export interface EmoteMenu {
	/** Pair player-selected faces with a body gesture when it is safe to animate. */
	gestures?: boolean;
	label?: string;
	labels?: Readonly<Record<Emotion, string>>;
	hint?: string;
}

const smooth = (value: number) => {
	const t = Math.max(0, Math.min(value, 1));
	return t * t * (3 - 2 * t);
};

export function createEmotionPlayer(apply: (emotion: Emotion | 'neutral', strength: number) => void, reduceMotion = () => false) {
	let cue: { name: Emotion; seconds: number; elapsed: number; from: number } | null = null;
	let shown: Emotion | 'neutral' = 'neutral';
	let weight = 0;
	const set = (name: Emotion | 'neutral', strength: number) => {
		if (shown === name && strength === weight) return;
		shown = name;
		weight = strength;
		apply(name, strength);
	};
	return {
		play(name: Emotion, seconds = 2.4) {
			if (!EMOTIONS.includes(name)) return;
			const duration = Number.isFinite(seconds) ? Math.max(0.45, Math.min(seconds, 12)) : 2.4;
			cue = { name, seconds: duration, elapsed: 0, from: shown === name ? weight : 0 };
		},
		tick(dt: number) {
			if (!Number.isFinite(dt) || dt < 0) return;
			const instant = reduceMotion();
			// An interrupted expression eases back through neutral before the new one appears.
			if (cue && shown !== 'neutral' && shown !== cue.name && weight > 0 && !instant) {
				const next = Math.max(0, weight - 10 * dt);
				set(next > 0 ? shown : 'neutral', next);
				return;
			}
			if (!cue) return;
			cue.elapsed += dt;
			if (cue.elapsed >= cue.seconds) {
				cue = null;
				set('neutral', 0);
				return;
			}
			const attack = cue.from + (1 - cue.from) * smooth(cue.elapsed / 0.16);
			const strength = instant ? 1 : attack * smooth((cue.seconds - cue.elapsed) / 0.22);
			set(cue.name, strength);
		},
		clear() {
			cue = null;
			set('neutral', 0);
		},
	};
}
