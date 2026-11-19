// Run in isolation with: node --test src/games/third-voice/story.test.ts
import { CHAPTERS } from './rules.ts';
import { CASES, NPC_IDS, NPCS, caseForChapter, hasAllTestimony, meetNpc, restoreStory, testimonyForNpc, visibleTestimony } from './story.ts';

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

assert(CASES.length === 2 && NPCS.length === 3, 'two cases and three distinct NPCs');
assert(new Set(NPCS.map(npc => npc.id)).size === 3, 'stable NPC IDs');
assert(CASES.flatMap(storyCase => storyCase.hearings).join() === CHAPTERS.map((_, index) => index).join(), 'case order follows hearing order exactly');
assert(caseForChapter(0) === caseForChapter(1) && caseForChapter(1) !== caseForChapter(2), 'hearings 0/1 are related, and hearing 2 opens the next case');

for (const [index, chapter] of CHAPTERS.entries()) {
	const custody = NPC_IDS.flatMap(id => testimonyForNpc(index, id));
	assert(custody.length === chapter.corpus.length, 'NPCs cover the whole corpus exactly once: ' + chapter.id);
	assert(custody.every(entry => chapter.corpus.includes(entry)), 'canonical reports retain identity and evidentials');
	assert(custody.length === new Set(custody.map(entry => entry.id)).size, 'no duplicate custody: ' + chapter.id);

	const initial = restoreStory(undefined);
	assert(visibleTestimony(initial, index).length === 0 && !hasAllTestimony(initial, index), 'new hearing begins with no exposed evidence');
	let state = initial;
	for (const id of [...NPC_IDS].reverse()) {
		const first = meetNpc(state, index, id);
		assert(first.lines.length > 0 && first.lines.every(line => line.en && line.ko), 'every NPC opens with a bilingual voice');
		assert(first.newRecords === first.records.length, 'first talk credits each newly gathered report');
		const again = meetNpc(first.state, index, id);
		assert(again.state === first.state && again.newRecords === 0 && again.lines[0] !== first.lines[0], 'revisiting does not duplicate evidence');
		const sealed = meetNpc(first.state, index, id, index + 1);
		assert(sealed.lines[0] !== again.lines[0] && sealed.newRecords === 0, 'each witness reacts to each sealed verdict');
		state = first.state;
	}
	assert(visibleTestimony(initial, index).length === 0, 'meetings never mutate their input state');
	assert(visibleTestimony(state, index).every((entry, k) => entry === chapter.corpus[k]), 'visibility order does not depend on meeting order');
	assert(hasAllTestimony(state, index), 'all custodians allow the hearing');
	assert(CHAPTERS.every((_, other) => other === index || visibleTestimony(state, other).length === 0), 'testimony does not leak between hearings');
}

const beginning = restoreStory({});
let firstHearing = meetNpc(beginning, 0, 'bellkeeper').state;
assert(!hasAllTestimony(firstHearing, 0), 'context-only NPC does not fabricate a report');
firstHearing = meetNpc(firstHearing, 0, 'ferryman').state;
assert(!hasAllTestimony(firstHearing, 0), 'one side of the contradiction is not the complete dossier');
firstHearing = meetNpc(firstHearing, 0, 'keeper').state;
assert(hasAllTestimony(firstHearing, 0), 'only actual custody is required to finish gathering the chapter');

const migrated = restoreStory({ met: { foreign: ['keeper'], compile: ['keeper', 'keeper', 'unknown', 7], downstream: null } }, 1);
assert(hasAllTestimony(migrated, 0), 'old saves retain access to hearings that are already sealed');
assert(visibleTestimony(migrated, 1).length === 0, 'the next case still requires collection');
assert(migrated.met.compile?.join() === 'keeper' && migrated.met.foreign === undefined, 'deduplicate legitimate visits and discard malformed data');
assert(!hasAllTestimony(migrated, 2) && visibleTestimony(migrated, 2).length === 4, 'unsealed collection is preserved as stored');
console.log('Three NPCs partition all 19 canonical reports across two cases; encounter, revisit, follow-up, and save migration passed.');
