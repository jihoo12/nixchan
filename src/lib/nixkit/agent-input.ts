/** Bounded controller input only: consumed by normal player physics, never coordinates. */
export interface AgentMove {
	forward: number;
	right: number;
	durationMs: number;
}
export function validateAgentMove(value: unknown): AgentMove {
	const v = value as AgentMove;
	if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['forward', 'right', 'durationMs'].includes(k)) || ![v.forward, v.right].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1) || !Number.isInteger(v.durationMs) || v.durationMs < 1 || v.durationMs > 2000)
		throw Error('Invalid bounded movement');
	return v;
}
export function createAgentMovement(now: () => number = () => performance.now()) {
	let held: {
		forward: number;
		right: number;
		until: number;
	} | null = null;
	return {
		begin(value: unknown) { const v = validateAgentMove(value); if (held && now() < held.until)
			throw Error('Movement already running'); const norm = Math.max(1, Math.hypot(v.forward, v.right)); held = { forward: v.forward / norm, right: v.right / norm, until: now() + v.durationMs }; },
		release() { held = null; },
		sample() { if (!held || now() >= held.until) {
			held = null;
			return null;
		} return { forward: held.forward, right: held.right, running: false }; },
	};
}
export type AgentMovement = ReturnType<typeof createAgentMovement>;
