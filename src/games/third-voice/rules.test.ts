// Run in isolation with: node --test src/games/third-voice/rules.test.ts
import { CHAPTERS, evaluate, line, model, modelWithout, readValue } from './rules.ts';
import type { Assignments, Chapter } from './rules.ts';

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

const [mouths, downstream, compile] = CHAPTERS;
const paired = model(mouths);
assert(readValue(paired, 'gate', 'vel') === 1, 'witness supports the gate');
assert(readValue(paired, 'gate', 'nem') === 2, 'record refutes the gate');
assert(readValue(paired, 'gate', 'thae') === 3, 'independent signs coexist in synthesis');
assert(readValue(paired, 'beacon', 'thae') === 0, 'an unmentioned claim is neither denied nor affirmed');
assert(line({ atom: 'gate', source: 'thae', value: 3 }) === 'thae orun du', 'stable conlang form');
assert(line({ atom: 'beacon', source: 'nem', value: 0 }) === 'nem sael va', 'silence has its own mood');

const closure = model(downstream);
assert(readValue(closure, 'bell', 'thae') === 3, 'a derived sign can coexist with direct refutation');
assert(readValue(closure, 'bell', 'nem') === 2 && readValue(closure, 'bell', 'vel') === 0, 'raw voices do not inherit derived claims');
assert(readValue(closure, 'bridge', 'thae') === 3, 'one conflict can feed distinct signed consequences');
assert(readValue(closure, 'arrival', 'thae') === 1, 'least fixed point revisits earlier rules, needs exact signed premises');
assert(readValue(closure, 'room', 'thae') === 0, 'unrelated propositions get neither sign despite contradiction');
const reversed = model({ ...downstream, rules: [...downstream.rules].reverse() });
assert(downstream.atoms.every(atom => readValue(closure, atom.id, 'thae') === readValue(reversed, atom.id, 'thae')), 'rule order does not change the model');

const program = { arm: 2, brake: 2, probe: 2, watch: 1, echo: 2, hold: 0 };
assert(evaluate(compile, program).solved, 'constructive solution');
const foils: Readonly<Record<string, Assignments>> = {
	orders: { ...program, arm: 1 },
	seed: { ...program, probe: 1 },
	monitor: { ...program, echo: 0 },
	mute: { ...program, probe: 0 },
	unknown: { ...program, hold: 2 },
};
for (const [wrong, options] of Object.entries(foils)) {
	const foil = evaluate(compile, options);
	assert(Object.values(foil.slots).every(status => status === 'licensed'), 'every foil is individually licensed');
	const faults = Object.entries(foil.constraints).filter(([, status]) => status !== 'pass').map(([id]) => id);
	assert(faults.length === 1 && faults[0] === wrong && !foil.solved, 'each compiler contract independently rules out a foil: ' + wrong);
}

const probe = compile.slots.find(slot => slot.id === 'probe')!.options[2];
const frozen = model(compile);
const muted = modelWithout(compile, probe);
assert(readValue(frozen, 'river', 'vel') === 1 && readValue(muted, 'river', 'vel') === 0, 'muting a source does not mutate the original evidence');
assert(readValue(frozen, 'relay', 'thae') === 2 && readValue(muted, 'relay', 'thae') === 0, 'unseeded cycle cannot sustain itself');
assert(readValue(frozen, 'bell', 'thae') === 3 && readValue(muted, 'bell', 'thae') === 1, 'watch loses only its refutation');
assert(readValue(frozen, 'siren', 'thae') === 3 && readValue(muted, 'siren', 'thae') === 2, 'echo loses only its support');
assert(readValue(muted, 'arrival', 'thae') === 1 && readValue(muted, 'bridge', 'thae') === 2, 'commands survive the counterfactual');

const echoed: Chapter = {
	...mouths,
	corpus: [...mouths.corpus, {
		id: 'other-source', source: 'nem', atom: 'gate', sign: 1, text: { en: 'another report', ko: '다른 보고' },
	}],
};
const oneSource = modelWithout(echoed, { atom: 'gate', source: 'vel', value: 1 });
assert(readValue(oneSource, 'gate', 'vel') === 0 && readValue(oneSource, 'gate', 'nem') === 3 &&
	readValue(oneSource, 'gate', 'thae') === 3, 'muting removes only the selected sign from the selected source');

const pending = evaluate(compile, { arm: 2, watch: NaN, hold: 100, brake: -1 });
assert(pending.slots.arm === 'licensed' && pending.slots.watch === 'empty' && pending.slots.hold === 'empty' &&
	pending.slots.brake === 'empty', 'out-of-range, negative, and invalid options remain empty');
assert(pending.constraints.orders === 'pending' && pending.constraints.unknown === 'pending' && !pending.solved, 'missing choices cannot pass or compile');
assert(evaluate(compile, { hold: 3 }).slots.hold === 'unsupported', 'claiming ignorance of attested evidence is unsupported');

function enumerate(chapter: Chapter) {
	let licensed = 0;
	const solutions: Assignments[] = [];
	const choices: Assignments = {};
	function visit(index: number) {
		if (index === chapter.slots.length) {
			const result = evaluate(chapter, choices);
			if (Object.values(result.slots).every(status => status === 'licensed')) licensed++;
			if (result.solved) solutions.push({ ...choices });
			return;
		}
		const slot = chapter.slots[index];
		for (const [choice] of slot.options.entries()) {
			choices[slot.id] = choice;
			visit(index + 1);
		}
	}
	visit(0);
	return { licensed, solutions };
}

for (const chapter of CHAPTERS) {
	const atoms = new Set(chapter.atoms.map(atom => atom.id));
	assert(chapter.slots.every(slot => slot.options.length > 1 && slot.options.every(option => atoms.has(option.atom))), 'every option has a glossary entry');
	assert(chapter.corpus.every(entry => atoms.has(entry.atom)), 'all testimony uses known atoms');
	assert(chapter.rules.every(rule => [rule.conclusion, ...rule.premises].every(evidence => atoms.has(evidence.atom))), 'all signed rules use known atoms');
	assert(chapter.constraints.every(constraint => constraint.slots.every(id => chapter.slots.some(slot => slot.id === id))), 'constraint dependencies refer to slots in the chapter');
	assert(!evaluate(chapter, {}).solved, 'no chapter begins solved');
}

const counts = CHAPTERS.map(enumerate);
assert(counts[0].solutions.length === 1 && counts[1].solutions.length === 1, 'intro and deduction each have one solution');
assert(counts[2].licensed === 12500 && counts[2].solutions.length === 2, 'compiler filters 12,500 locally licensed configurations down to two');
assert(counts[2].solutions.every(solution => solution.arm === 2 && solution.brake === 2 && solution.probe === 2 && solution.watch === 1 && solution.echo === 2), 'commands and alarm are uniquely fixed');
assert(counts[2].solutions[0].hold === 0 && counts[2].solutions[1].hold === 1, 'both genuine silences can complete the program');
console.log('All four evidence moods, signed closure, and 1/1/2 exhaustive solution counts passed.');
