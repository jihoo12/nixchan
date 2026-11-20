export type WorldSeat = Readonly<{
	x: number;
	z: number;
	height: number;
	heading: number;
	standZ: number;
}>;

/** height is the world-space top of the cushion. Stools can be exited away from the bar. */
export function benchSeat(x: number, z: number, height: number, facesZ: -1 | 1,
	standDistance = .89, sitOffset = .04, exitZ: -1 | 1 = facesZ): WorldSeat {
	return { x, z: z + facesZ * sitOffset, height, heading: facesZ === 1 ? 0 : Math.PI, standZ: z + exitZ * standDistance };
}

type SeatVisitor = { x: number; y: number; z: number; grounded: boolean };

export function findWorldSeat(seats: readonly WorldSeat[], p: SeatVisitor,
	canApproach: (seat: WorldSeat) => boolean): WorldSeat | null {
	if (!p.grounded) return null;
	let best: WorldSeat | null = null, reach = 1.30;
	for (const seat of seats) {
		// Approach from the accessible side, not through a backrest or the window bar.
		if ((p.z - seat.z) * Math.sign(seat.standZ - seat.z) < .12 || Math.abs(p.y - seat.height) > 1.1) continue;
		const d = Math.hypot(p.x - seat.x, p.z - seat.z);
		if (d >= reach || !canApproach(seat)) continue;
		best = seat;
		reach = d;
	}
	return best;
}
