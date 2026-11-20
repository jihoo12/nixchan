import type { ChairOptions } from '../../lib/nixkit/game';

export type WorldSeat = ChairOptions;

/** World-space cushion data for the procedural furniture. Window stools exit away from the bar. */
export function benchSeat(x: number, z: number, height: number, facesZ: -1 | 1,
	standDistance = .89, sitOffset = .04, exitZ: -1 | 1 = facesZ): WorldSeat {
	return {
		at: [x, height, z + facesZ * sitOffset],
		facing: facesZ === 1 ? 0 : Math.PI,
		stand: [x, z + exitZ * standDistance],
	};
}
