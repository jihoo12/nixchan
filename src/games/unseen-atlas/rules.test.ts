// Run in isolation with: node --test src/games/unseen-atlas/rules.test.ts
import {
	applyTransform, CHAPTERS, composeTransforms, cycleTransform, GLYPH_INFO,
	initialSettings, invertTransform, isSolved, isTransform, linkTransform,
	traceFrames, traceOutcome, traceStations, TRANSFORMS,
} from './rules.ts';
import type { Chapter, Settings, Vertex } from './rules.ts';

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

const vertices = [0, 1, 2] as const;
const permutations: readonly (readonly Vertex[])[] = [
	[0, 1, 2], [1, 2, 0], [2, 0, 1],
	[0, 2, 1], [1, 0, 2], [2, 1, 0],
];

for (const transform of TRANSFORMS) {
	for (const vertex of vertices) {
		assert(applyTransform(transform, vertex) === permutations[transform][vertex], 'canonical glyph permutation');
	}
	assert(composeTransforms(transform, invertTransform(transform)) === 0, 'round-tripping forwards');
	assert(composeTransforms(invertTransform(transform), transform) === 0, 'round-tripping backwards');
	assert(GLYPH_INFO[transform].label.ko.length > 0, 'Korean glyph label');
	for (const next of TRANSFORMS) {
		for (const vertex of vertices) {
			const expected = permutations[next][permutations[transform][vertex]];
			assert(applyTransform(composeTransforms(transform, next), vertex) === expected, 'non-ambiguous composition');
		}
		for (const third of TRANSFORMS) {
			assert(
				composeTransforms(composeTransforms(transform, next), third)
					=== composeTransforms(transform, composeTransforms(next, third)),
				'associative composition',
			);
		}
	}
}
assert(composeTransforms(1, 3) !== composeTransforms(3, 1), 'reflection and rotation order matters');
assert(cycleTransform(5) === 0 && cycleTransform(0, -1) === 5, 'knob wrap');
assert(!isTransform(Infinity) && !isTransform(NaN) && !isTransform(1.5) && !isTransform('2'), 'invalid settings');

function enumerateSolutions(chapter: Chapter): Settings[] {
	const free = chapter.edges.filter(edge => edge.adjustable);
	const results: Settings[] = [];
	const settings = initialSettings(chapter);
	function step(index: number): void {
		if (index === free.length) {
			if (isSolved(chapter, settings)) results.push({ ...settings });
			return;
		}
		for (const transform of TRANSFORMS) {
			settings[free[index].id] = transform;
			step(index + 1);
		}
	}
	step(0);
	return results;
}

for (const chapter of CHAPTERS) {
	const stationIds = new Set(chapter.nodes.map(station => station.id));
	const initial = initialSettings(chapter);
	assert(stationIds.size === chapter.nodes.length, 'unique stations');
	assert(new Set(chapter.traces.map(trace => trace.id)).size === chapter.traces.length, 'unique trace IDs');
	assert(new Set(chapter.edges.map(edge => edge.id)).size === chapter.edges.length, 'unique edge IDs');
	for (const edge of chapter.edges) {
		assert(stationIds.has(edge.from) && stationIds.has(edge.to) && edge.from !== edge.to, 'valid endpoints');
		assert(chapter.traces.some(trace => trace.steps.some(step => step.edge === edge.id)), 'every edge affects a trace');
		if (!edge.adjustable) assert(linkTransform(edge, { [edge.id]: cycleTransform(edge.initial) }) === edge.initial, 'locked links ignore overrides');
	}
	for (const trace of chapter.traces) {
		const route = traceStations(chapter, trace);
		assert(route.length === trace.steps.length + 1, 'whole path shown');
		let expected: string | undefined;
		for (const [index, step] of trace.steps.entries()) {
			const edge = chapter.edges.find(edge => edge.id === step.edge);
			assert(edge, 'valid step');
			const [begin, end] = step.reverse ? [edge.to, edge.from] : [edge.from, edge.to];
			assert(index === 0 || expected === begin, 'trace must be a continuous walk');
			assert(route[index] === begin && route[index + 1] === end, 'route matches its steps');
			expected = end;
		}
		const frames = traceFrames(chapter, trace, initial);
		assert(frames.length === trace.steps.length + 1 && frames[0] === 0, 'frames begin at identity');
		assert(frames.at(-1) === traceOutcome(chapter, trace, initial), 'frames and result agree');
		assert(traceOutcome(chapter, trace, initial) !== trace.target, 'initially every record is unmatched');
	}
}

const solutions = CHAPTERS.map(enumerateSolutions);
assert(solutions[0].length === 1 && solutions[1].length === 1 && solutions[2].length === 4, 'exhaustive solution counts');
assert(solutions[0][0].bc === 1 && solutions[0][0].ac === 4, 'intro is solved by rotation and reflection');
assert(solutions[1][0].bc === 2 && solutions[1][0].bd === 4 && solutions[1][0].da === 2, 'two perspectives fix the Well');
assert(new Set(solutions[2].map(solution => solution.ad)).size > 1, 'different worlds fit the same five observations');
console.log('The D₃ group laws, all walks, and 1 / 1 / 4 solution counts passed.');
