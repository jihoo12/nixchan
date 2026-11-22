/** Coordinates describe walkable tops, not centres. Each disk has a marked next jump. */
export interface Step {
	x: number;
	y: number;
	z: number;
	diameter: number;
	checkpoint?: number;
}
export const STEPS: readonly Step[] = [
	{ x: 0, y: 0, z: -16, diameter: 6.6 },
	{ x: -.1, y: .40, z: -10.85, diameter: 2.9 },
	{ x: 2.5, y: .88, z: -7.4, diameter: 2.7 },
	{ x: 5.4, y: 1.34, z: -4.5, diameter: 2.6 },
	{ x: 7.55, y: 1.80, z: -1, diameter: 2.65 },
	{ x: 8.7, y: 2.30, z: 3.1, diameter: 2.9 },
	{ x: 8.3, y: 2.80, z: 8.20, diameter: 5.4, checkpoint: 1 },
	{ x: 7.1, y: 3.32, z: 12.8, diameter: 2.55 },
	{ x: 3.35, y: 3.90, z: 14.5, diameter: 2.5 },
	{ x: -1, y: 4.46, z: 14.85, diameter: 2.6 },
	{ x: -5.25, y: 5.04, z: 13.6, diameter: 2.55 },
	{ x: -8.6, y: 5.62, z: 10.85, diameter: 2.55 },
	{ x: -10.5, y: 6.12, z: 6.1, diameter: 5.7, checkpoint: 2 },
	{ x: -11.3, y: 6.68, z: 1.55, diameter: 2.55 },
	{ x: -10.35, y: 7.17, z: -2.6, diameter: 2.52 },
	{ x: -8.5, y: 7.75, z: -6.15, diameter: 2.55 },
	{ x: -4.55, y: 8.27, z: -7.90, diameter: 2.7 },
	{ x: -.2, y: 8.80, z: -7.8, diameter: 2.55 },
	{ x: 4.5, y: 9.30, z: -6.75, diameter: 5.4, checkpoint: 3 },
	{ x: 6.8, y: 9.77, z: -2.45, diameter: 2.55 },
	{ x: 6.3, y: 10.23, z: 1.5, diameter: 2.55 },
	{ x: 3.65, y: 10.75, z: 5, diameter: 2.65 },
	{ x: -.95, y: 11.30, z: 6.2, diameter: 5.75 },
];

export const FINISH = STEPS.length - 1;
export const RESTS = STEPS.flatMap((s, i) => s.checkpoint ? [i] : []);
export const SLAB_HEIGHT = .48;
export const RETURN_Y = -5.2;
export const bearing = (i: number) => {
	const a = STEPS[i], b = STEPS[Math.min(FINISH, i + 1)];
	return Math.atan2(b.x - a.x, b.z - a.z);
};
