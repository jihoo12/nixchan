import type { PartSpec } from '../../lib/nixkit/parts';
import type { Step } from './course';

export interface BonusStep extends Step {
	move?: PartSpec['move'];
}

/** A steeper second spiral, starting just past the original summit. */
export const BONUS_STEPS: readonly BonusStep[] = [
	{ x: -1, y: 11.75, z: 11.25, diameter: 4.7 },
	{ x: 1.3, y: 12.33, z: 16.3, diameter: 2.4 },
	{ x: 4.1, y: 12.97, z: 20.2, diameter: 2.15 },
	{ x: 7, y: 13.55, z: 24, diameter: 2.1, move: { by: [1.2, 0, -.55], period: 4.8, phase: .12 } },
	{ x: 7.6, y: 14.2, z: 29.2, diameter: 2.1 },
	{ x: 5.6, y: 14.92, z: 34.1, diameter: 2.35 },
	{ x: 1.45, y: 15.45, z: 36, diameter: 5.2, checkpoint: 1 },
	{ x: -2.85, y: 16.09, z: 35.7, diameter: 2.3 },
	{ x: -7.5, y: 16.64, z: 34.65, diameter: 2.05, move: { by: [-.18, 0, 1.46], period: 5.4, phase: .28 } },
	{ x: -11.85, y: 17.22, z: 32.7, diameter: 2.15 },
	{ x: -15.35, y: 17.83, z: 29.35, diameter: 2.25 },
	{ x: -16.45, y: 18.46, z: 24.55, diameter: 2.15 },
	{ x: -14.1, y: 19, z: 20.2, diameter: 5.4, checkpoint: 2 },
	{ x: -10.1, y: 19.64, z: 17.3, diameter: 2.3 },
	{ x: -6.1, y: 20.28, z: 15, diameter: 2.15, move: { by: [.18, 0, -1.31], period: 5.6, phase: .39 } },
	{ x: -1.57, y: 20.82, z: 16.86, diameter: 2.15 },
	{ x: 2.32, y: 21.49, z: 20, diameter: 2.05 },
	{ x: 4.6, y: 22.1, z: 24.1, diameter: 2.2 },
	{ x: 3.6, y: 22.65, z: 29.4, diameter: 5.3, checkpoint: 3 },
	{ x: .4, y: 23.36, z: 32.8, diameter: 2.15 },
	{ x: -4.5, y: 24.02, z: 32.4, diameter: 2.15, move: { by: [-.14, 0, 1.35], period: 4.9, phase: .23 } },
	{ x: -8.1, y: 24.71, z: 29.3, diameter: 2.15 },
	{ x: -8.9, y: 25.36, z: 24, diameter: 5.9 },
];

export const BONUS_FINISH = BONUS_STEPS.length - 1;
export const BONUS_RESTS = BONUS_STEPS.flatMap((s, i) => s.checkpoint ? [i] : []);
export const BONUS_RETURN_Y = BONUS_STEPS[0].y - 4.6;
export function bonusBearing(i: number) {
	const a = BONUS_STEPS[i], b = BONUS_STEPS[Math.min(BONUS_FINISH, i + 1)];
	return Math.atan2(b.x - a.x, b.z - a.z);
}
