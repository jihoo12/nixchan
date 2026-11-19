import { ARCHIVE, POLICY, isArchiveOpen } from './lore.ts';
import { NPC_IDS, meetNpc, restoreStory } from './story.ts';

const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const count = (state: ReturnType<typeof restoreStory>, sealed: number) =>
	ARCHIVE.filter(fragment => isArchiveOpen(fragment, state, sealed)).length;
let state = restoreStory(undefined);
check(count(state, 0) === 0, 'No records leak before meeting witnesses.');
for (const [index, id] of NPC_IDS.entries()) {
	state = meetNpc(state, 0, id).state;
	check(count(state, 0) === index + 1, 'Each encounter unlocks exactly one relevant document.');
}
check(count(state, 2) === 3 && count(state, 3) === 4, 'The final leaf requires the final seal.');
check(count(restoreStory(undefined, 3), 3) === 4, 'Existing completed saves can browse all lore.');
for (const id of NPC_IDS) {
	check(POLICY.hold.responses[id].ko !== POLICY.carry.responses[id].ko, 'Each witness changes response with the record policy.');
}
console.log('Archive unlocks, old saves, and two distinct policy reactions passed.');
