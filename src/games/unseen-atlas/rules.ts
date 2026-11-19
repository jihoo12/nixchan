/** A light token has three distinguishable corners, in clockwise order. Its possible
 * orientations are the six elements of D₃: 0–2 rotate, 3–5 reflect. */
export type Vertex = 0 | 1 | 2;
export type Transform = 0 | 1 | 2 | 3 | 4 | 5;
export type Localized = Readonly<{ en: string; ko: string }>;
export type Settings = Partial<Record<string, Transform>>;

export interface Station {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly label: Localized;
}

export interface Link {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly initial: Transform;
	readonly adjustable: boolean;
}

export interface Step {
	readonly edge: string;
	readonly reverse?: boolean;
}

export interface Trace {
	readonly id: string;
	readonly label: Localized;
	readonly steps: readonly Step[];
	readonly target: Transform;
}

export interface Chapter {
	readonly id: string;
	readonly title: Localized;
	readonly intro: Localized;
	readonly hints: readonly Localized[];
	readonly nodes: readonly Station[];
	readonly edges: readonly Link[];
	readonly traces: readonly Trace[];
}

export const TRANSFORMS = [0, 1, 2, 3, 4, 5] as const;
export const GLYPHS = ['○', '↻', '↺', '◇', '◈', '◆'] as const;
const phrase = (en: string, ko: string): Localized => ({ en, ko });
const labels = [
	phrase('No change', '그대로'),
	phrase('Clockwise turn', '시계 방향 회전'),
	phrase('Counterclockwise turn', '반시계 방향 회전'),
	phrase('Mirror through top', '위쪽 꼭짓점 반사'),
	phrase('Mirror through lower left', '왼쪽 아래 꼭짓점 반사'),
	phrase('Mirror through lower right', '오른쪽 아래 꼭짓점 반사'),
];
export const GLYPH_INFO = TRANSFORMS.map(t => ({ glyph: GLYPHS[t], label: labels[t] }));

export function isTransform(value: unknown): value is Transform {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 6;
}

function modulo3(value: number): Vertex {
	return ((value % 3 + 3) % 3) as Vertex;
}

export function applyTransform(transform: Transform, vertex: Vertex): Vertex {
	return modulo3((transform % 3) + (transform < 3 ? vertex : -vertex));
}

/** Apply first, then next. Switching their order is generally not equivalent. */
export function composeTransforms(first: Transform, next: Transform): Transform {
	return (applyTransform(next, modulo3(first)) + ((first < 3) !== (next < 3) ? 3 : 0)) as Transform;
}

export function invertTransform(transform: Transform): Transform {
	return transform < 3 ? modulo3(-transform) : transform;
}

export function cycleTransform(current: Transform, offset = 1): Transform {
	return TRANSFORMS[((current + offset) % 6 + 6) % 6];
}

const A = { id: 'A', x: 50, y: 14, label: phrase('Lens', '렌즈') };
const B = { id: 'B', x: 16, y: 78, label: phrase('Archive', '기록실') };
const C = { id: 'C', x: 84, y: 78, label: phrase('Horizon', '지평선') };
const D = { id: 'D', x: 50, y: 54, label: phrase('Well', '우물') };

const link = (from: string, to: string, fixed?: Transform): Link =>
	({ id: (from + to).toLowerCase(), from, to, initial: fixed ?? 0, adjustable: fixed === undefined });

function observation(id: string, label: Localized, path: string, target: Transform): Trace {
	return {
		id, label, target,
		steps: path.split(' ').map(step => step.startsWith('-')
			? { edge: step.slice(1), reverse: true }
			: { edge: step }),
	};
}

export const CHAPTERS: readonly Chapter[] = [
	{
		id: 'first-light',
		title: phrase('The borrowed light', '빌려 온 빛'),
		intro: phrase(
			'The observatory kept the light it received, but not what happened in the corridors. Turn the two loose lenses until both records can be true.',
			'천문대에는 도착한 빛의 기록만 남았다. 복도에서 무슨 일이 일어났는지는 알 수 없다. 두 렌즈를 조정해서 두 기록이 동시에 성립하게 하자.',
		),
		hints: [
			phrase('Start with The outward record: only one loose lens lies on that route.', '먼저 ‘가는 빛’을 살펴보자. 그 경로에는 조정할 수 있는 렌즈가 하나뿐이다.'),
			phrase('A reverse step undoes the forward step. A turn reverses direction; a mirror undoes itself.', '역방향은 정방향에서 일어난 변화를 되돌린다. 회전은 반대 방향으로 돌고, 반사는 한 번 더 하면 원래대로 돌아온다.'),
		],
		nodes: [A, B, C],
		edges: [link('A', 'B', 1), link('B', 'C'), link('A', 'C')],
		traces: [
			observation('outward', phrase('The outward record', '가는 빛'), 'ab bc', 2),
			observation('return', phrase('The homeward record', '돌아오는 빛'), 'ac -bc -ab', 5),
		],
	},
	{
		id: 'turning-well',
		title: phrase('The turning well', '회전하는 우물'),
		intro: phrase(
			'Two observers followed the same circuit and disagreed about what returned. They stood at different stations. Rebuild a single circuit that accounts for both.',
			'두 관측자가 같은 고리를 돌고도 서로 다른 빛을 기록했다. 출발한 장소가 달랐을 뿐이다. 두 기록을 모두 설명하는 하나의 고리를 복원하자.',
		),
		hints: [
			phrase('First pin down Archive → Horizon with the outer circuit. Leave that lens alone while you work on the Well.', '바깥 고리로 기록실 → 지평선 렌즈부터 정하자. 우물 쪽을 해결할 때는 그 렌즈를 그대로 둬도 된다.'),
			phrase('The two Well circuits can distinguish candidates that look identical from the Lens. Changing a loop’s starting point shifts the sequence without reversing it.', '렌즈에서 보면 똑같은 후보도 우물에서 출발하는 두 고리로 구별할 수 있다. 출발점이 바뀌면 고리를 도는 방향은 그대로지만, 연산을 적용하는 순서는 달라진다.'),
		],
		nodes: [A, B, C, D],
		edges: [link('A', 'B', 1), link('B', 'C'), link('C', 'A', 3), link('B', 'D'), link('D', 'A')],
		traces: [
			observation('outer', phrase('The outer circuit', '바깥 고리'), 'ab bc ca', 3),
			observation('near', phrase('From the Lens', '렌즈에서 바라본 빛'), 'ab bd da', 5),
			observation('long', phrase('The long way from the Well', '우물에서 시작하는 먼길'), '-bd bc ca -da', 1),
			observation('near-well', phrase('From the Well', '우물에서 바라본 빛'), 'da ab bd', 4),
		],
	},
	{
		id: 'unseen-atlas',
		title: phrase('The unrecorded world', '기록되지 않은 세계'),
		intro: phrase(
			'Five witnesses agree on what reached home, but nobody saw each lens. Build a world their records allow. Is it the only one that could have existed?',
			'다섯 기록에는 제자리로 돌아온 빛만 남아 있다. 렌즈 하나하나가 무슨 일을 했는지는 아무도 보지 못했다. 모두의 기록과 맞는 세계를 만들어 보자. 그런 세계는 하나뿐일까?',
		),
		hints: [
			phrase('The first and fourth records follow the same loop from different stations. Solve them together before moving deeper into the atlas.', '첫 번째와 네 번째 기록은 같은 고리에서 출발점만 다르다. 나머지 기록을 보기 전에 이 둘을 함께 맞춰 보자.'),
			phrase('Choose a setting for Lens → Well. The second and third records then each leave only one choice for their other loose lens. Test the result against the fifth witness.', '렌즈 → 우물 구간의 설정을 하나 가정하자. 그러면 두 번째와 세 번째 기록에서 나머지 조정 가능한 렌즈가 각각 하나로 정해진다. 마지막 기록에도 맞는지 확인해 보자.'),
			phrase('Different settings can fit every witness. Do not look for a preferred answer hidden in the machine.', '서로 다른 배치가 모든 기록을 만족할 수 있다. 천문대가 숨겨 둔 하나의 정답을 찾을 필요는 없다.'),
		],
		nodes: [A, B, C, D],
		edges: [link('A', 'B', 1), link('B', 'C'), link('C', 'A'), link('A', 'D'), link('B', 'D'), link('C', 'D')],
		traces: [
			observation('outer-lens', phrase('The rim · Lens', '가장자리 · 렌즈'), 'ab bc ca', 4),
			observation('archive-well', phrase('The archive fold', '기록실의 굴절'), 'ab bd -ad', 2),
			observation('horizon-well', phrase('The horizon fold', '지평선의 굴절'), '-ca cd -ad', 1),
			observation('outer-horizon', phrase('The rim · Horizon', '가장자리 · 지평선'), 'ca ab bc', 5),
			observation('well-witness', phrase('The final witness', '마지막 증언'), '-bd bc cd', 3),
		],
	},
];

export function initialSettings(chapter: Chapter): Settings {
	return Object.fromEntries(chapter.edges.map(edge => [edge.id, edge.initial]));
}

/** Locked links ignore overrides, including those in recovered saves. */
export function linkTransform(edge: Link, settings: Settings): Transform {
	const candidate = settings[edge.id];
	return edge.adjustable && isTransform(candidate) ? candidate : edge.initial;
}

function traceEdge(chapter: Chapter, step: Step): Link {
	const edge = chapter.edges.find(edge => edge.id === step.edge);
	if (!edge) throw new Error('Unknown atlas link: ' + step.edge);
	return edge;
}

export function traceStations(chapter: Chapter, trace: Trace): string[] {
	return trace.steps.reduce<string[]>((stations, step) => {
		const edge = traceEdge(chapter, step);
		if (!stations.length) stations.push(step.reverse ? edge.to : edge.from);
		stations.push(step.reverse ? edge.from : edge.to);
		return stations;
	}, []);
}

/** The incoming orientation and the orientation after each traversal, in order. */
export function traceFrames(chapter: Chapter, trace: Trace, settings: Settings): Transform[] {
	const frames: Transform[] = [0];
	for (const step of trace.steps) {
		const link = traceEdge(chapter, step);
		const forward = linkTransform(link, settings);
		const applied = step.reverse ? invertTransform(forward) : forward;
		frames.push(composeTransforms(frames[frames.length - 1], applied));
	}
	return frames;
}

export function traceOutcome(chapter: Chapter, trace: Trace, settings: Settings): Transform {
	const frames = traceFrames(chapter, trace, settings);
	return frames[frames.length - 1];
}

export function isSolved(chapter: Chapter, settings: Settings): boolean {
	return chapter.traces.every(trace => traceOutcome(chapter, trace, settings) === trace.target);
}
