/** Support and refutation are independent bits. Negating a proposition swaps the two
 * signs; refutation is evidence in its own right, never mere lack of support. */
export type Value = 0 | 1 | 2 | 3;
export type Sign = 1 | 2;
export type Source = 'vel' | 'nem' | 'thae';
export type PrimarySource = Exclude<Source, 'thae'>;
export type Localized = Readonly<{ en: string; ko: string }>;
const loc = (en: string, ko: string): Localized => ({ en, ko });

export interface Atom {
	readonly id: string;
	readonly word: string;
	readonly label: Localized;
}
export interface Evidence {
	readonly atom: string;
	readonly sign: Sign;
}
export interface CorpusEntry extends Evidence {
	readonly id: string;
	readonly source: PrimarySource;
	readonly text: Localized;
}
export interface Rule {
	readonly id: string;
	readonly premises: readonly Evidence[];
	readonly conclusion: Evidence;
	readonly text: Localized;
}
export interface Clause {
	readonly atom: string;
	readonly source: Source;
	readonly value: Value;
}
export interface Slot {
	readonly id: string;
	readonly label: Localized;
	readonly options: readonly Clause[];
}
export interface Constraint {
	readonly id: string;
	readonly text: Localized;
	readonly slots: readonly string[];
	readonly check: (chosen: Readonly<Record<string, Clause>>, current: Model, chapter: Chapter) => boolean;
}
export interface Chapter {
	readonly id: string;
	readonly title: Localized;
	readonly intro: Localized;
	readonly hints: readonly Localized[];
	readonly atoms: readonly Atom[];
	readonly corpus: readonly CorpusEntry[];
	readonly rules: readonly Rule[];
	readonly slots: readonly Slot[];
	readonly constraints: readonly Constraint[];
}

export const SOURCES = ['vel', 'nem', 'thae'] as const;
export const VALUES = [0, 1, 2, 3] as const;
export const WORDS = {
	sources: {
		vel: { word: 'vel', label: loc('Witness', '목격'), description: loc('Only testimony from people who were there.', '현장에 있었던 사람들의 증언만 읽어요.') },
		nem: { word: 'nem', label: loc('Record', '기록'), description: loc('Only what the written record reports.', '문서에 적힌 보고만 읽어요.') },
		thae: { word: 'thae', label: loc('Synthesis', '종합'), description: loc('Both sources together, plus everything the posted rules derive.', '두 경로의 증거를 합치고, 게시된 규칙으로 도출되는 것까지 읽어요.') },
	},
	moods: {
		0: { word: 'va', label: loc('Unattested', '미확인'), description: loc('Neither sign is present.', '뒷받침도 반박도 없어요.') },
		1: { word: 'ya', label: loc('Affirmed', '긍정'), description: loc('Support is present; refutation is absent.', '뒷받침은 있지만 반박은 없어요.') },
		2: { word: 'nu', label: loc('Denied', '부정'), description: loc('Refutation is present; support is absent.', '반박은 있지만 뒷받침은 없어요.') },
		3: { word: 'du', label: loc('Disputed', '충돌'), description: loc('Both signs are present.', '뒷받침과 반박이 함께 있어요.') },
	},
} as const;

export const ATOMS: readonly Atom[] = [
	{ id: 'gate', word: 'orun', label: loc('The floodgate is open', '수문이 열려 있다') },
	{ id: 'beacon', word: 'sael', label: loc('The beacon is lit', '봉화에 불이 켜져 있다') },
	{ id: 'bell', word: 'dren', label: loc('The bell sounds', '종이 울린다') },
	{ id: 'bridge', word: 'mera', label: loc('The bridge is safe', '다리가 안전하다') },
	{ id: 'river', word: 'ith', label: loc('The river is rising', '강물이 불어난다') },
	{ id: 'arrival', word: 'rhe', label: loc('The messenger has arrived', '전령이 도착했다') },
	{ id: 'room', word: 'shai', label: loc('The upper room is occupied', '윗방에 누군가 있다') },
	{ id: 'stairs', word: 'nuv', label: loc('The east stair is open', '동쪽 계단이 열려 있다') },
	{ id: 'pump', word: 'vein', label: loc('The pump runs', '펌프가 작동한다') },
	{ id: 'siren', word: 'zhar', label: loc('The siren sounds', '경보음이 울린다') },
	{ id: 'sluice', word: 'veth', label: loc('The bypass is clear', '우회 수로에 막힌 곳이 없다') },
	{ id: 'relay', word: 'ael', label: loc('The relay is live', '중계기가 연결되어 있다') },
];

export function line(clause: Clause): string {
	const root = ATOMS.find(atom => atom.id === clause.atom)?.word ?? clause.atom;
	return `${WORDS.sources[clause.source].word} ${root} ${WORDS.moods[clause.value].word}`;
}

export type Model = Readonly<Record<Source, ReadonlyMap<string, Value>>>;
const cache = new WeakMap<Chapter, Model>();

function addSign(values: Map<string, Value>, atom: string, sign: Sign): boolean {
	const before = values.get(atom) ?? 0;
	const after = (before | sign) as Value;
	if (before === after) return false;
	values.set(atom, after);
	return true;
}

/** Least fixed point of the explicit signed rules. With finitely many atoms, each
 * pass can only add bits, never remove a premise or manufacture unrelated evidence. */
function collect(chapter: Chapter, muted?: Clause): Model {
	const vel = new Map<string, Value>();
	const nem = new Map<string, Value>();
	const thae = new Map<string, Value>();
	for (const entry of chapter.corpus) {
		if (muted?.source === entry.source && muted.atom === entry.atom && muted.value === entry.sign) continue;
		addSign(entry.source === 'vel' ? vel : nem, entry.atom, entry.sign);
		addSign(thae, entry.atom, entry.sign);
	}
	let changed: boolean;
	do {
		changed = false;
		for (const rule of chapter.rules) {
			if (rule.premises.every(({ atom, sign }) => ((thae.get(atom) ?? 0) & sign) !== 0)) {
				if (addSign(thae, rule.conclusion.atom, rule.conclusion.sign)) changed = true;
			}
		}
	} while (changed);
	return { vel, nem, thae };
}

export function model(chapter: Chapter): Model {
	const cached = cache.get(chapter);
	if (cached) return cached;
	const values = collect(chapter);
	cache.set(chapter, values);
	return values;
}

/** Hide exactly the selected signed report from its named source, then start the
 * closure from the remaining reports. A missing report does not become its negation. */
export function modelWithout(chapter: Chapter, muted: Clause): Model {
	return collect(chapter, muted);
}

export function readValue(current: Model, atom: string, source: Source): Value {
	return current[source].get(atom) ?? 0;
}

export type Assignments = Partial<Record<string, number>>;
export type SlotStatus = 'empty' | 'unsupported' | 'licensed';
export type ConstraintStatus = 'pending' | 'pass' | 'fail';

export function evaluate(chapter: Chapter, assignments: Assignments) {
	const current = model(chapter);
	const chosen: Record<string, Clause> = {};
	const slots: Record<string, SlotStatus> = {};
	const constraints: Record<string, ConstraintStatus> = {};
	for (const slot of chapter.slots) {
		const index = assignments[slot.id];
		const selected = typeof index === 'number' && Number.isInteger(index) && index >= 0
			? slot.options[index] : undefined;
		if (!selected) {
			slots[slot.id] = 'empty';
			continue;
		}
		chosen[slot.id] = selected;
		slots[slot.id] = readValue(current, selected.atom, selected.source) === selected.value ? 'licensed' : 'unsupported';
	}
	for (const condition of chapter.constraints) {
		const ready = condition.slots.every(slot => chosen[slot] !== undefined);
		const licensed = condition.slots.every(slot => slots[slot] === 'licensed');
		constraints[condition.id] = !ready ? 'pending' : (licensed && condition.check(chosen, current, chapter)) ? 'pass' : 'fail';
	}
	const solved = chapter.slots.every(slot => slots[slot.id] === 'licensed')
		&& chapter.constraints.every(condition => constraints[condition.id] === 'pass');
	return { slots, constraints, solved };
}

const testimony = (id: string, source: PrimarySource, atom: string, sign: Sign, en: string, ko: string): CorpusEntry =>
	({ id, source, atom, sign, text: loc(en, ko) });
const bit = (atom: string, sign: Sign): Evidence => ({ atom, sign });
const rule = (id: string, premises: readonly Evidence[], conclusion: Evidence, en: string, ko: string): Rule =>
	({ id, premises, conclusion, text: loc(en, ko) });
const say = (source: Source, atom: string, value: Value): Clause => ({ source, atom, value });
const slot = (id: string, label: Localized, options: readonly Clause[]): Slot => ({ id, label, options });
const read = (id: string, source: Source, atom: string, en: string, ko: string): Slot =>
	slot(id, loc(en, ko), VALUES.map(value => say(source, atom, value)));
const used = (...ids: string[]) => ATOMS.filter(atom => ids.includes(atom.id));

export const CHAPTERS: readonly Chapter[] = [
	{
		id: 'two-mouths',
		title: loc('Two mouths at the water', '물가의 두 목소리'),
		intro: loc(
			'Someone held the floodgate lever. Someone else wrote down a reading from the mechanism. Their testimonies disagree. The chamber has four speaking tubes; fill each with what can actually be said.',
			'누군가는 수문 손잡이를 잡았다. 다른 누군가는 장치의 눈금을 기록했다. 두 사람의 말은 서로 다르다. 네 개의 전성관에 각자가 실제로 할 수 있는 말을 담자.',
		),
		hints: [
			loc('The first two tubes speak from only one source each. Ignore the other page while filling each tube.', '처음 두 관은 각각 한 출처만 읽는다. 관 하나를 채울 때 다른 쪽 보고는 잠시 잊자.'),
			loc('The third voice keeps both marks, even when they contradict. The beacon has no mark of either kind.', '세 번째 목소리는 증거가 모순되어도 양쪽을 모두 남긴다. 봉화에 대해서는 어느 쪽 증거도 없다.'),
		],
		atoms: used('gate', 'beacon'),
		corpus: [
			testimony('lever', 'vel', 'gate', 1, 'The ferryman saw the floodgate open.', '나룻사공은 수문이 열린 것을 보았다.'),
			testimony('dial', 'nem', 'gate', 2, 'The mechanism’s log marks the floodgate closed.', '장치의 기록에는 수문이 닫혀 있다고 적혀 있다.'),
		],
		rules: [],
		slots: [
			read('witness', 'vel', 'gate', 'What the ferryman can say', '나룻사공이 할 수 있는 말'),
			read('record', 'nem', 'gate', 'What the mechanism can say', '장치 기록이 할 수 있는 말'),
			read('together', 'thae', 'gate', 'What the third voice can say', '세 번째 목소리가 할 수 있는 말'),
			read('beacon', 'thae', 'beacon', 'What the third voice can say of the beacon', '세 번째 목소리가 봉화에 관해 할 수 있는 말'),
		],
		constraints: [],
	},
	{
		id: 'downstream',
		title: loc('What follows downstream', '물길을 타고 오는 결론'),
		intro: loc(
			'The acoustics of the chamber are written in its walls. Let each rule carry only the sign it names. Then tell the third voice what it heard downstream.',
			'이 방에서 소리가 전해지는 법칙은 벽에 적혀 있다. 규칙마다 적혀 있는 종류의 증거만 흘려보내자. 그 뒤 물길 아래까지 무엇이 닿았는지 세 번째 목소리로 말해 보자.',
		),
		hints: [
			loc('The beacon has both signs. Its support and its refutation can power different rules at the same time.', '봉화에는 두 종류의 증거가 모두 있다. 뒷받침은 한 규칙을, 반박은 다른 규칙을 동시에 작동시킬 수 있다.'),
			loc('Revisit rules after deriving new signs. No statement or rule mentions the upper room; conflict anywhere else cannot tell you whether it is occupied.', '새 증거를 얻으면 앞의 규칙도 다시 보자. 어느 증언이나 규칙에도 윗방은 나오지 않는다. 다른 곳의 모순으로는 윗방에 누가 있는지 알 수 없다.'),
		],
		atoms: used('gate', 'beacon', 'bell', 'bridge', 'river', 'arrival', 'room'),
		corpus: [
			testimony('flame', 'vel', 'beacon', 1, 'The watch saw fire on the tower.', '망보던 사람은 탑에서 불을 보았다.'),
			testimony('raised', 'vel', 'gate', 1, 'The keeper saw the gate open.', '관리인은 수문이 열린 것을 보았다.'),
			testimony('current', 'vel', 'river', 1, 'The ferryman saw the river rise.', '나룻사공은 강물이 불어나는 것을 보았다.'),
			testimony('dark', 'nem', 'beacon', 2, 'The lamp ledger marks the beacon dark.', '등불 장부에는 봉화가 꺼져 있다고 적혀 있다.'),
			testimony('quiet', 'nem', 'bell', 2, 'The clock log records no bell.', '시계 장치는 종이 울리지 않았다고 기록했다.'),
			testimony('inspection', 'nem', 'bridge', 1, 'The inspection certificate reports the bridge safe.', '점검 확인서에는 다리가 안전하다고 적혀 있다.'),
		],
		rules: [
			rule('arrival', [bit('bridge', 1), bit('bell', 1)], bit('arrival', 1), 'Bridge safe (+) and bell sounding (+) give messenger arrived (+).', '다리 안전(+)과 종이 울림(+)이 함께 있으면, 전령 도착(+)을 얻는다.'),
			rule('resonance', [bit('beacon', 1), bit('gate', 1)], bit('bell', 1), 'Beacon lit (+) and gate open (+) give bell sounding (+).', '봉화에 불이 켜짐(+)과 수문 열림(+)이 함께 있으면, 종이 울림(+)을 얻는다.'),
			rule('warning', [bit('beacon', 2), bit('river', 1)], bit('bridge', 2), 'Beacon unlit (−) and river rising (+) give bridge unsafe (−).', '봉화에 불이 꺼짐(−)과 강물 불어남(+)이 함께 있으면, 다리 안전의 반박(−)을 얻는다.'),
			rule('return', [bit('gate', 2)], bit('arrival', 2), 'Gate closed (−) gives messenger not arrived (−).', '수문 닫힘(−)이 있으면, 전령 도착의 반박(−)을 얻는다.'),
		],
		slots: [
			read('bell', 'thae', 'bell', 'The chamber’s reading of the bell', '종에 관한 방의 판독'),
			read('bridge', 'thae', 'bridge', 'The chamber’s reading of the bridge', '다리에 관한 방의 판독'),
			read('messenger', 'thae', 'arrival', 'The chamber’s reading of the messenger', '전령에 관한 방의 판독'),
			read('room', 'thae', 'room', 'The chamber’s reading of the upper room', '윗방에 관한 방의 판독'),
		],
		constraints: [],
	},	{
		id: 'compile',
		title: loc('Instructions for a careful machine', '신중한 기계의 사용법'),
		intro: loc(
			'The third voice now operates the weir. Write its six lines against a new dossier. The compiler also runs a trial with the Probe report silenced. It starts over from the remaining reports, not from conclusions already in memory.',
			'이제 세 번째 목소리가 보를 움직여야 한다. 새 보고서로 여섯 줄을 조립하자. 컴파일러는 시험 삼아 차단 줄이 지목한 보고를 제외한다. 이때 이전 결론은 버리고, 남은 보고부터 다시 추론한다.',
		),
		hints: [
			loc('Set the two commands first. Their source and mood must fit both the raw report and the complete synthesis. A local yes can become disputed.', '두 명령부터 정하자. 원본의 출처와 서법이 맞고, 전체를 종합해도 서법이 같아야 한다. 한쪽에서만 긍정인 말이 종합하면 충돌일 수 있다.'),
			loc('The Brake’s refutation and the Probe’s support must share a rule. Follow that rule’s output into a second rule, then use the new refutation to find the Echo.', '정지의 반박과 차단의 뒷받침이 같은 규칙에 들어가야 한다. 그 규칙의 결론을 다음 규칙에 이어 넣고, 새로 얻은 반박으로 메아리를 찾아보자.'),
			loc('When the Probe is muted, a loop cannot lend itself its first piece of evidence. Rebuild the trial from the remaining raw pages; keep opposites separate.', '차단할 보고를 지우면, 순환하는 규칙만으로는 첫 증거를 만들 수 없다. 남은 원본부터 다시 계산하고, 뒷받침과 반박은 따로 추적하자.'),
		],
		atoms: ATOMS,
		corpus: [
			testimony('gate-witness', 'vel', 'gate', 1, 'The mechanic saw the floodgate open.', '정비사는 수문이 열린 것을 보았다.'),
			testimony('gate-log', 'nem', 'gate', 2, 'The floodgate dial was entered as closed.', '수문 눈금은 닫힘으로 기록되었다.'),
			testimony('beacon-witness', 'vel', 'beacon', 2, 'The watch saw no flame in the beacon.', '망보던 사람은 봉화에 불이 꺼진 것을 보았다.'),
			testimony('beacon-log', 'nem', 'beacon', 1, 'The lamp ledger has the beacon lit.', '등불 장부에는 봉화가 켜져 있다.'),
			testimony('bell-log', 'nem', 'bell', 1, 'The clock log records that the bell rang.', '시계 장치에는 종이 울렸다고 적혀 있다.'),
			testimony('bridge-witness', 'vel', 'bridge', 2, 'The keeper saw the bridge deck get swept away.', '관리인은 다리 상판이 휩쓸려 가는 모습을 보았다.'),
			testimony('river-witness', 'vel', 'river', 1, 'The ferryman saw the river rise.', '나룻사공은 강물이 불어나는 것을 보았다.'),
			testimony('messenger-log', 'nem', 'arrival', 1, 'The messenger signed the arrival register.', '전령이 도착부에 서명했다.'),
			testimony('pump-log', 'nem', 'pump', 1, 'The control log records the pump running.', '조작 기록에는 펌프가 작동한다고 적혀 있다.'),
			testimony('siren-log', 'nem', 'siren', 2, 'The control log records no siren.', '조작 기록에는 경보음이 울리지 않았다고 적혀 있다.'),
			testimony('bypass-witness', 'vel', 'sluice', 2, 'The inspector saw the bypass blocked.', '점검자는 우회 수로가 막힌 것을 보았다.'),
		],
		rules: [
			rule('siren-resonance', [bit('bell', 2), bit('pump', 1)], bit('siren', 1), 'Bell refuted (−) and pump running (+) give siren sounding (+).', '종 울림의 반박(−)과 펌프 작동(+)이 함께 있으면 경보음 울림(+)을 얻는다.'),
			rule('self-loop', [bit('bell', 2)], bit('relay', 2), 'Bell refuted (−) gives relay offline (−).', '종 울림의 반박(−)에서 중계기 연결의 반박(−)을 얻는다.'),
			rule('relay-to-bell', [bit('relay', 2), bit('pump', 1)], bit('bell', 2), 'Relay offline (−) and pump running (+) give bell refuted (−).', '중계기 연결의 반박(−)과 펌프 작동(+)에서 종 울림의 반박(−)을 얻는다.'),
			rule('flood-to-relay', [bit('river', 1), bit('bridge', 2)], bit('relay', 2), 'River rising (+) and bridge unsafe (−) give relay offline (−).', '강물이 불어남(+)과 다리 안전의 반박(−)에서 중계기 연결의 반박(−)을 얻는다.'),
			rule('pump-interlock', [bit('gate', 1), bit('beacon', 2)], bit('pump', 2), 'Gate open (+) and beacon dark (−) give pump refuted (−).', '수문 열림(+)과 봉화가 꺼짐(−)에서 펌프 작동의 반박(−)을 얻는다.'),
			rule('arrival-backup', [bit('siren', 1), bit('bridge', 2)], bit('arrival', 1), 'Siren sounding (+) and bridge unsafe (−) give messenger arrived (+).', '경보음 울림(+)과 다리 안전의 반박(−)에서 전령 도착(+)을 얻는다.'),
			rule('bypass-pressure', [bit('river', 1), bit('sluice', 2)], bit('sluice', 1), 'River rising (+) and bypass blocked (−) also give bypass clear (+).', '강물이 불어남(+)과 우회 수로가 막힘(−)에서 우회 수로가 뚫렸다는 증거(+)도 얻는다.'),
			rule('gate-to-arrival', [bit('gate', 1), bit('bridge', 2)], bit('arrival', 1), 'Gate open (+) and bridge unsafe (−) give messenger arrived (+).', '수문 열림(+)과 다리 안전의 반박(−)에서 전령 도착(+)을 얻는다.'),
			rule('stair-interlock', [bit('arrival', 1), bit('stairs', 1)], bit('bell', 2), 'Messenger arrived (+) and east stair open (+) give bell refuted (−).', '전령 도착(+)과 동쪽 계단 열림(+)에서 종 울림의 반박(−)을 얻는다.'),
		],
		slots: [
			slot('arm', loc('I · Arm', 'I · 가동'), [
				say('vel', 'river', 1), say('nem', 'beacon', 1), say('nem', 'arrival', 1),
				say('nem', 'pump', 1), say('nem', 'bell', 1),
			]),
			slot('brake', loc('II · Brake', 'II · 정지'), [
				say('vel', 'beacon', 2), say('nem', 'gate', 2), say('vel', 'bridge', 2),
				say('thae', 'bridge', 2), say('vel', 'sluice', 2),
			]),
			slot('probe', loc('III · Probe', 'III · 차단'), [
				say('vel', 'gate', 1), say('nem', 'pump', 1), say('vel', 'river', 1),
				say('nem', 'arrival', 1), say('vel', 'bridge', 2),
			]),
			slot('watch', loc('IV · Watch', 'IV · 감시'), [
				say('thae', 'beacon', 3), say('thae', 'bell', 3), say('thae', 'gate', 3),
				say('thae', 'pump', 3), say('thae', 'sluice', 3),
			]),
			slot('echo', loc('V · Echo', 'V · 메아리'), [
				say('thae', 'sluice', 3), say('thae', 'pump', 3), say('thae', 'siren', 3),
				say('thae', 'bell', 3), say('thae', 'beacon', 3),
			]),
			slot('hold', loc('VI · Hold', 'VI · 보류'), [
				say('thae', 'room', 0), say('thae', 'stairs', 0), say('nem', 'room', 0),
				say('thae', 'river', 0), say('thae', 'bridge', 2),
			]),
		],
		constraints: [
			{
				id: 'orders',
				slots: ['arm', 'brake'],
				text: loc(
					'Arm on a recorded affirmation (nem … ya), Brake on a witnessed denial (vel … nu). Both moods must agree with the synthesis.',
					'가동은 기록에 있는 긍정(nem … ya), 정지는 목격에 있는 부정(vel … nu)이어야 한다. 두 서법 모두 종합의 서법과 같아야 한다.',
				),
				check: ({ arm, brake }, current) =>
					arm.source === 'nem' && arm.value === 1 && brake.source === 'vel' && brake.value === 2
					&& readValue(current, arm.atom, 'thae') === 1 && readValue(current, brake.atom, 'thae') === 2,
			},
			{
				id: 'seed',
				slots: ['probe', 'brake', 'watch'],
				text: loc(
					'Probe names a witnessed affirmation (vel … ya). Its support and Brake’s refutation must feed the same two-premise rule. That conclusion must be about a third topic and feed a second rule for Watch’s refutation.',
					'차단은 목격에 있는 긍정(vel … ya)을 지목한다. 그 뒷받침과 정지의 반박이 전제 두 개짜리 한 규칙에 함께 들어가야 한다. 이 규칙은 차단·정지·감시와 다른 대상에 대한 결론을 내고, 그 결론은 다음 규칙에서 감시의 반박을 도출하는 전제가 되어야 한다.',
				),
				check: ({ probe, brake, watch }, _, chapter) =>
					probe.source === 'vel' && probe.value === 1
					&& chapter.rules.some(seed => seed.premises.length === 2
						&& [probe.atom, brake.atom, watch.atom].every(atom => atom !== seed.conclusion.atom)
						&& seed.premises.some(p => p.atom === probe.atom && p.sign === 1)
						&& seed.premises.some(p => p.atom === brake.atom && p.sign === 2)
						&& chapter.rules.some(next => next.conclusion.atom === watch.atom && next.conclusion.sign === 2
							&& next.premises.some(p => p.atom === seed.conclusion.atom && p.sign === seed.conclusion.sign))),
			},
			{
				id: 'monitor',
				slots: ['watch', 'echo'],
				text: loc(
					'Watch and Echo are conflicts in the synthesis (thae … du), on different topics. The raw pages only support Watch and only refute Echo. A rule must carry Watch’s refutation into Echo’s support.',
					'감시와 메아리는 서로 다른 대상의 종합 충돌(thae … du)이다. 원본에는 감시의 뒷받침과 메아리의 반박만 있어야 한다. 감시의 반박을 메아리의 뒷받침으로 잇는 규칙도 있어야 한다.',
				),
				check: ({ watch, echo }, current, chapter) => {
					const raw = (atom: string) => readValue(current, atom, 'vel') | readValue(current, atom, 'nem');
					return watch.atom !== echo.atom && watch.source === 'thae' && watch.value === 3
						&& echo.source === 'thae' && echo.value === 3 && raw(watch.atom) === 1 && raw(echo.atom) === 2
						&& chapter.rules.some(rule => rule.conclusion.atom === echo.atom && rule.conclusion.sign === 1
							&& rule.premises.some(p => p.atom === watch.atom && p.sign === 2));
				},
			},
			{
				id: 'mute',
				slots: ['probe', 'arm', 'brake', 'watch', 'echo'],
				text: loc(
					'Silence only the Probe report and deduce again. Arm and Brake must keep their synthesized moods. Watch must become affirmed; Echo must become denied.',
					'차단 줄이 지목한 보고만 제외한 뒤 다시 추론한다. 가동과 정지는 종합의 서법이 그대로여야 한다. 감시는 긍정으로, 메아리는 부정으로 바뀌어야 한다.',
				),
				check: ({ probe, arm, brake, watch, echo }, current, chapter) => {
					const muted = modelWithout(chapter, probe);
					return readValue(muted, arm.atom, 'thae') === readValue(current, arm.atom, 'thae')
						&& readValue(muted, brake.atom, 'thae') === readValue(current, brake.atom, 'thae')
						&& readValue(muted, watch.atom, 'thae') === 1 && readValue(muted, echo.atom, 'thae') === 2;
				},
			},
			{
				id: 'unknown',
				slots: ['hold', 'probe'],
				text: loc(
					'Hold on something the synthesis genuinely cannot judge (thae … va), both in the complete dossier and after the Probe is muted.',
					'보류는 전체 보고서에서도, 차단할 보고를 제외한 뒤에도 종합이 증거를 찾을 수 없는 대상(thae … va)을 지목한다.',
				),
				check: ({ hold, probe }, _, chapter) => hold.source === 'thae' && hold.value === 0
					&& readValue(modelWithout(chapter, probe), hold.atom, 'thae') === 0,
			},
		],
	},
];
