import { CHAPTERS } from './rules.ts';
import type { CorpusEntry, Localized } from './rules.ts';

const say = (en: string, ko: string): Localized => ({ en, ko });

export const NPC_IDS = ['ferryman', 'keeper', 'bellkeeper'] as const;
export type NpcId = typeof NPC_IDS[number];

export interface Npc {
	readonly id: NpcId;
	readonly name: Localized;
	readonly role: Localized;
	readonly location: Localized;
}

export const NPCS: readonly Npc[] = [
	{ id: 'ferryman', name: say('Ruan', '루안'), role: say('Ferryman', '나룻사공'), location: say('Ferry landing', '나루터') },
	{ id: 'keeper', name: say('Iven', '이벤'), role: say('Weir archivist', '보의 기록관'), location: say('Ledger house', '기록관') },
	{ id: 'bellkeeper', name: say('Sera', '세라'), role: say('Bell keeper', '종지기'), location: say('Bell landing', '종루 앞') },
];

export interface StoryCase {
	readonly id: string;
	readonly title: Localized;
	readonly summary: Localized;
	readonly hearings: readonly number[];
}

export const CASES: readonly StoryCase[] = [
	{
		id: 'two-records',
		title: say('The Gate with Two Records', '기록이 둘인 수문'),
		summary: say(
			'A ferry village lives by its floodgate. At the water, a witness and a ledger disagree. Follow the testimony downstream before you decide what the village can say.',
			'나루 마을은 수문에 기대어 산다. 물가의 목격담과 장부가 서로 어긋난다. 마을이 무엇을 말할 수 있을지 정하기 전에 증언을 따라 물길 아래로 내려가 보자.',
		),
		hearings: [0, 1],
	},
	{
		id: 'silence-trial',
		title: say('The Silence Trial', '침묵의 시험'),
		summary: say(
			'The two records survived the hearing. At dawn the bell tower lights up: the village needs a machine that can live with them. Collect a new dossier and write instructions that still make sense when one witness falls silent.',
			'심리가 끝나도 두 기록은 그대로 남았다. 이튿날 종루에 등불이 켜졌다. 이제 마을에는 두 증언이 어긋나도 작동할 기계가 필요하다. 새 자료를 모으고, 한 증언을 빼도 안전한 지시문을 써 보자.',
		),
		hearings: [2],
	},
];

export function caseForChapter(index: number): StoryCase {
	return CASES.find(storyCase => storyCase.hearings.includes(index)) ?? CASES[0];
}

interface Packet {
	readonly documents: readonly string[];
	readonly first: readonly Localized[];
	readonly again: readonly Localized[];
	readonly after: readonly Localized[];
}

const packet = (documents: readonly string[], first: readonly Localized[], again: Localized, after: Localized): Packet =>
	({ documents, first, again: [again], after: [after] });

/** Custody is not authorship. A custodian can hand over a witnessed observation
 * or a written report; the source on each canonical line remains untouched. */
const meetings: Readonly<Record<string, Readonly<Record<NpcId, Packet>>>> = {
	'two-mouths': {
		ferryman: packet(['lever'], [
			say('Leave room for the boat. Good. As for the gate, I’ll put down exactly what I saw. I won’t swear why it happened.', '배 댈 자리만 비켜 줘. 그래, 거기. 수문은 내가 본 그대로 적을게. 왜 그렇게 됐는지까지 장담할 수는 없어.'),
		],
		say('You have my word as I gave it. Leave the cause blank.', '내가 한 말은 네가 받아 적은 그대로야. 까닭은 빈칸으로 둬.'),
		say('I thought you’d make one of us take it back. You left both lines on the page. I can live with that.', '우리 둘 중 하나는 말을 거둬야 할 줄 알았어. 자네는 두 줄 다 남겼더군. 그거라면 받아들일 수 있어.')),
		keeper: packet(['dial'], [
			say('Take a copy, not the original. The seal confirms where this page came from. It cannot confirm what happened at the gate.', '원본 말고 사본을 가져가세요. 인장은 이 문서가 어디서 왔는지 확인해 줍니다. 수문에서 무슨 일이 있었는지까지 확인해 주지는 않아요.'),
		],
		say('The ferryman’s deposition and this log belong in separate sleeves. Both stay in the file.', '나룻사공의 진술과 이 장부는 따로 끼워 두세요. 둘 다 사건 기록에 남깁니다.'),
		say('The docket has two entries and no erasures. That is a decision I can put my name to.', '사건부에 두 줄을 적었고, 지운 건 없습니다. 이 결정에는 제 서명을 남길 수 있겠어요.')),
		bellkeeper: packet([], [
			say('No slip from me at this hearing. Ask those two. If someone brings an empty page, don’t read a “no” into it.', '이번 심리에 낼 쪽지는 없어. 두 사람에게 물어봐. 빈 종이를 받거든 거기에 ‘아니오’라고 적혀 있다고 읽지는 마.'),
		],
		say('The two slips are down by the boat and in the ledger house.', '쪽지 두 장은 배가 있는 곳과 기록관에 있어.'),
		say('You let a question stay open. Good. A silence somebody can leave alone is a rare thing.', '물음 하나를 열린 채로 두었구나. 잘했어. 침묵을 억지로 채우지 않기란 좀처럼 쉽지 않지.')),
	},
	downstream: {
		ferryman: packet(['current'], [
			say('Take the current report. I did not see what happened farther down. Don’t stretch my eyes that far for me.', '물살을 본 보고는 가져가. 그 아래에서 일어난 일은 내가 못 봤어. 내 눈이 닿지 않은 데까지 봤다고 하지는 말아 줘.'),
		],
		say('A line from me, not a verdict from me. The rest is up to the posted rules.', '내가 준 건 증언 한 줄이지 판결이 아니야. 나머지는 벽에 적힌 규칙을 따라가 봐.'),
		say('So a bad report can still tell you something, even beside a good one. I’ll remember that next time I argue with Iven.', '좋은 보고 옆에 놓였다고 해서 나쁜 보고가 할 말이 없어지진 않는군. 다음에 이벤과 다툴 땐 그걸 기억해야겠어.')),
		keeper: packet(['raised', 'inspection'], [
			say('These two pages are not the same kind. One records what I saw. The other is a signed inspection. Keep their marks attached.', '두 장은 같은 종류가 아니에요. 한 장은 제가 본 일, 다른 한 장은 서명된 점검 결과입니다. 각각의 출처 표시를 떼지 마세요.'),
		],
		say('The ledger is a shelf, not a source. Read the mark on each page, not the name on the door.', '기록관은 보관 장소일 뿐, 출처는 아니에요. 문패 말고 각 문서에 찍힌 표시를 읽으세요.'),
		say('The file says which conclusions follow, and which do not. I can take that to the village without asking anyone to forget their own eyes.', '무슨 결론은 따라오고, 무슨 결론은 그렇지 않은지 사건부에 남았어요. 누구에게도 본 일을 잊으라고 하지 않고 마을에 이 문서를 가져갈 수 있겠군요.')),
		bellkeeper: packet(['flame', 'dark', 'quiet'], [
			say('Here are the watch report and the two logs. Don’t pick the page that sounds most like me. Read each page by its own mark.', '망보던 사람의 보고와 장부 두 장이야. 내 말처럼 들리는 것을 고르지 말고, 종이마다 붙은 표시를 읽어.'),
		],
		say('There are two kinds of marks on these pages. One does not put out the other.', '종이에 서로 다른 표시가 있지. 한쪽이 다른 한쪽의 불을 끄는 건 아니야.'),
		say('The whole village heard a verdict that didn’t demand a single voice. Next we ask the machine to do as much.', '마을 사람 모두가, 한 목소리만 내라고 하지 않는 판결을 들었지. 이제 기계에도 같은 걸 요구해 보자.')),
	},
	compile: {
		ferryman: packet(['river-witness', 'messenger-log', 'bypass-witness'], [
			say('The river report is mine. The dock register and the inspector’s page came across in my boat. I’m carrying them, not putting my name on them.', '강물 보고는 내 거야. 부두의 도착부와 점검자의 보고는 내 배로 건너왔지. 내가 나르는 거지, 내 이름으로 증언하는 건 아니야.'),
			say('Test the machine with a voice missing. We can’t always get every witness across.', '증인 하나가 빠져도 기계가 어떻게 움직일지 시험해 봐. 늘 모두를 건너편에서 데려올 수는 없으니까.'),
		],
		say('Make the test in the chamber, not with the river. The boat will wait.', '시험은 강물 말고 심리실에서 해. 배는 기다릴 테니.'),
		say('The test could lose a witness and still leave the commands clear. That’s the only sort of machine I’d tie my boat beside.', '증인 하나가 빠진 시험에서도 명령은 분명했어. 내 배를 매어 두려면 기계도 그 정도는 돼야지.')),
		keeper: packet(['gate-witness', 'gate-log', 'bridge-witness', 'pump-log'], [
			say('A new docket, not a correction of the old one. This bundle is for the weir. The original testimony remains in its sleeve.', '옛 사건을 정정하는 문서가 아니라 새 사건부예요. 이 묶음은 보를 위한 겁니다. 옛 증언은 원래 봉투에 그대로 있어요.'),
			say('For the trial, set one report aside. Then begin from the remaining pages. Do not copy any conclusion from the complete file.', '시험에서는 보고 한 줄을 빼고, 남은 종이에서 다시 시작하세요. 전체 사건부에서 내렸던 결론을 옮겨 쓰면 안 됩니다.'),
		],
		say('I will file the program only after both readings hold up.', '두 판독에서 모두 문제가 없을 때만 지시문을 접수하겠습니다.'),
		say('I’ve filed the program beside the testimonies, not in their place. The next clerk will know what the machine was allowed to assume.', '지시문을 증언 대신 끼우지 않고 그 옆에 두었어요. 다음 기록관도 기계에 어떤 가정이 허락되었는지 알겠지요.')),
		bellkeeper: packet(['beacon-witness', 'beacon-log', 'bell-log', 'siren-log'], [
			say('Four slips from the tower. The bell and the siren have different names. Don’t let one take the other’s place merely because both make a sound.', '종루에서 가져온 쪽지 넉 장이야. 종과 경보에는 이름이 따로 있어. 둘 다 소리를 낸다고 해서 한쪽을 다른 쪽 자리로 들여보내진 마.'),
			say('An echo needs a first sound. When you set aside a report, see which answers are still able to begin.', '메아리가 있으려면 처음 울린 소리가 있어야 해. 보고 하나를 빼고도 처음으로 울릴 수 있는 답이 무엇인지 들어 봐.'),
		],
		say('When the trial goes quiet, listen for what stayed, not just what went missing.', '시험에서 소리가 잦아들면, 사라진 것뿐 아니라 남아 있는 것도 들어 봐.'),
		say('We did not teach it everything. We taught it to leave a place for what nobody knows. I’m glad that place has a name now.', '기계에 모든 것을 가르친 건 아니야. 아무도 모르는 것을 위해 자리를 비워 두는 법을 가르쳤지. 이제 그 자리에 이름이 있어서 좋아.')),
	},
};

export interface StoryState {
	readonly met: Partial<Record<string, readonly NpcId[]>>;
}

function isNpc(value: unknown): value is NpcId {
	return typeof value === 'string' && NPC_IDS.some(id => id === value);
}

/** Older saves have seals but no encounter record. Do not ask the player to
 * recollect evidence for hearings they already completed before this update. */
export function restoreStory(saved: unknown, seals = 0): StoryState {
	const input = saved !== null && typeof saved === 'object' ? (saved as Record<string, unknown>).met : null;
	const values = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {};
	const met: StoryState['met'] = {};
	for (const [index, chapter] of CHAPTERS.entries()) {
		const prior = values[chapter.id];
		if (Number.isInteger(seals) && index < seals) met[chapter.id] = [...NPC_IDS];
		else if (Array.isArray(prior)) met[chapter.id] = [...new Set(prior.filter(isNpc))];
	}
	return { met };
}

export function testimonyForNpc(index: number, id: NpcId): readonly CorpusEntry[] {
	const chapter = CHAPTERS[index];
	if (!chapter) return [];
	const ids = meetings[chapter.id]?.[id]?.documents ?? [];
	return chapter.corpus.filter(entry => ids.includes(entry.id));
}

export function visibleTestimony(state: StoryState, index: number): readonly CorpusEntry[] {
	const chapter = CHAPTERS[index];
	if (!chapter) return [];
	const met = state.met[chapter.id] ?? [];
	const ids = new Set(met.flatMap(id => (meetings[chapter.id]?.[id]?.documents ?? [])));
	return chapter.corpus.filter(entry => ids.has(entry.id));
}

export function hasAllTestimony(state: StoryState, index: number): boolean {
	const hearing = CHAPTERS[index];
	return !!hearing && visibleTestimony(state, index).length === hearing.corpus.length;
}

export interface Encounter {
	readonly state: StoryState;
	readonly lines: readonly Localized[];
	readonly records: readonly CorpusEntry[];
	readonly newRecords: number;
}

export function meetNpc(state: StoryState, index: number, id: NpcId, seals = 0): Encounter {
	const chapter = CHAPTERS[index];
	const meeting = chapter && meetings[chapter.id]?.[id];
	if (!meeting) return { state, lines: [], records: [], newRecords: 0 };
	const prior = state.met[chapter.id] ?? [];
	const seen = prior.includes(id);
	const records = testimonyForNpc(index, id);
	return {
		state: seen ? state : { met: { ...state.met, [chapter.id]: [...prior, id] } },
		lines: index < seals ? meeting.after : seen ? meeting.again : meeting.first,
		records,
		newRecords: seen ? 0 : records.length,
	};
}
