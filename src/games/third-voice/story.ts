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
			'Ever since the Night of the Erasure, the weir village has kept two ledgers instead of one. Now a ferryman and a mechanism disagree about the floodgate. Carry both reports downstream to the hearing.',
			'지워진 밤 이후, 보 옆 나루 마을에는 장부가 두 권 있다. 이제 나룻사공과 수문 장치가 서로 다른 말을 한다. 두 보고를 함께 들고 물길 아래 심리실로 가 보자.',
		),
		hearings: [0, 1],
	},
	{
		id: 'silence-trial',
		title: say('The Silence Trial', '침묵의 시험'),
		summary: say(
			'The two records survived the hearing. At dawn the bell tower lights up, and the old charter faces a new test: when may a report move a machine? The village will run a dry trial before putting any order on the water.',
			'심리가 끝나도 두 기록은 그대로 남았다. 이튿날 종루에 불이 켜지고, 옛 규약에 새 질문이 찾아왔다. 어떤 보고가 기계를 움직일 권한을 주는가? 마을은 물길에 명령을 내리기 전에 모의 시험부터 치른다.',
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
			say('Mind the mooring rope. On the Night of the Erasure we came back on that rope. A warning went missing when two reports were copied into one clean line. No one died. Some people tell it as a story about how the system worked.', '밧줄 조심해. 지워진 밤에 우린 저 줄을 잡고 돌아왔어. 보고 두 건을 말끔한 한 줄로 옮겨 적는 사이, 항로 경고 하나가 없어졌지. 아무도 죽진 않았어. 그래서 제도가 제구실을 했다는 사람도 있어.'),
		],
		say('This is my report about today’s gate. Put my name on that much, and no more.', '이건 오늘 수문에 대해 내가 한 보고야. 거기만 내 이름을 써. 그 너머까지 내 말로 만들지는 말고.'),
		say('Look at that. Neither of us had to take back a word. Next time, put both lines where the person at the tiller can see them.', '봐, 우리 중 아무도 말을 거둘 필요가 없었잖아. 다음에는 키를 잡은 사람도 두 줄을 다 볼 수 있는 데 붙여 둬.')),
		keeper: packet(['dial'], [
			say('The clerk that night had one box and a room full of people waiting for a decision. I won’t defend the erasure. I also won’t pretend replacing the clerk would have put a second box on the form.', '그날 기록관에게는 기입란 하나와 결정을 기다리는 사람들뿐이었어요. 지운 일을 두둔하진 않겠습니다. 그렇다고 기록관을 바꾼다고 양식에 두 번째 칸이 생겼을 것도 아니고요.'),
		],
		say('The twin ledgers keep eyewitness accounts apart from written reports. The third voice reads both. It isn’t another ledger where I get to make the first two agree.', '두 장부에는 목격과 문서 보고를 따로 둡니다. 세 번째 목소리는 두 장부를 함께 읽지요. 앞선 두 장부를 제 마음대로 맞춰 쓰라고 만든 세 번째 장부는 아닙니다.'),
		say('Two entries, one seal, not an erasure on either page. I’ll have the next clerk keep both sleeves on the desk, not one of them in a drawer.', '기록은 두 건, 인장은 하나. 어느 쪽도 지우지 않았습니다. 다음 기록관에게도 한쪽을 서랍에 넣지 말고 두 봉투 모두 책상 위에 두라고 하겠어요.')),
		bellkeeper: packet([], [
			say('People remember the clean page. I remember how relieved we were when it came out of the house. We were tired of hearing the argument. Nobody had to ask us to stop listening.', '사람들은 말끔한 종이를 기억하지. 나는 그 종이가 기록관에서 나왔을 때 다들 얼마나 안도했는지 기억해. 논쟁을 듣는 데 지쳐 있었거든. 누가 듣지 말라고 할 필요도 없었어.'),
		],
		say('The new slips are at the boat and the ledger house. None from me today. That doesn’t make mine a vote against either of them.', '새 쪽지는 배가 있는 곳과 기록관에 있어. 오늘 내가 낼 건 없어. 그렇다고 내가 어느 한쪽에 반대표를 던진 건 아니야.'),
		say('I used to ring when the clerk closed the book. Today I waited for the two reports to be read out. I think I’ll keep doing that.', '옛날에는 기록관이 책을 덮으면 종을 쳤어. 오늘은 두 보고를 모두 읽을 때까지 기다렸지. 앞으로도 그러려고.')),
	},
	downstream: {
		ferryman: packet(['current'], [
			say('Here’s what I saw of the current. I don’t need the village to agree with everything I say. I need to know before I cast off if somebody has a reason to tell me not to.', '물살에 대해 내가 본 건 여기 있어. 마을 모두가 내 말에 동의할 필요는 없어. 출항하기 전에, 누군가 나더러 나가지 말라고 할 이유가 있는지는 알아야지.'),
		],
		say('I signed for the reach of water I could see, not the whole river. Ask up at the tower before you make my name cover the rest.', '내 눈에 보이는 물굽이까지만 서명했어. 강 전체가 아니야. 나머지까지 내 이름으로 적기 전에 종루에 가서 물어봐.'),
		say('Iven didn’t strike through either report this time. Fair enough. I’ll chalk a place for the warning at the landing, right next to the sailing notice.', '이번엔 이벤이 우리 말을 지우지 않았더군. 그럼 됐어. 나루터에도 출항 안내 바로 옆에 경고를 적을 자리를 그어 둘게.')),
		keeper: packet(['raised', 'inspection'], [
			say('My own observation is in this bundle, beside the signed inspection. I admit both. The charter has a clause for that: accepting a report is not the same as authorizing an act. Every new clerk has to copy that line by hand.', '제 목격담과 서명된 점검 결과가 같은 묶음에 있어요. 둘 다 접수합니다. 규약에 그런 조항이 있지요. 보고를 받아들이는 일과 행동을 허락하는 일은 다릅니다. 새 기록관은 누구나 그 줄을 손으로 베껴 써요.'),
		],
		say('The ledger house is where I keep the pages. The marks on the pages are how you tell where the words came from.', '기록관은 문서를 보관하는 곳이에요. 말이 어디에서 나왔는지는 문서에 찍힌 표시로 구별하세요.'),
		say('We can now say what follows without pretending every witness said the same thing. Let that be what the file gives to the builders at dawn, not a polished substitute for the file.', '이제 모든 증인이 같은 말을 했다고 꾸미지 않아도 어떤 결론이 나오는지 말할 수 있어요. 내일 새벽 기계를 맡을 사람들에게 매끈하게 다시 쓴 기록 말고 이 사건부를 건네지요.')),
		bellkeeper: packet(['flame', 'dark', 'quiet'], [
			say('The watch report and the two logs, here. From the tower you can hear the square almost as well as the bell. It taught me not to trust the silence that comes right after everybody is told to go home.', '여기 망보던 사람의 보고와 장부 두 장. 종루에서는 종소리만큼 광장 소리도 잘 들려. 사람들을 다 집으로 돌려보내고 나서 찾아오는 고요는 믿을 게 못 된다는 걸 거기서 배웠어.'),
		],
		say('If a report bothers you, try reading it out loud with the others. That’s different from ringing a bell and drowning it out.', '마음에 걸리는 보고가 있으면 다른 것들과 나란히 소리 내어 읽어 봐. 종을 울려서 못 들리게 하는 것과는 다르니까.'),
		say('I left the shutters open for the end of the hearing. Some people still argued on the way home. The tower can live with that. Let’s see if the machine can, too.', '심리가 끝날 때 덧창을 열어 두었어. 집에 가는 길에도 다투는 사람들이 있더라. 종루는 그 정도는 견뎌. 기계도 그럴 수 있는지 보자.')),
	},
	compile: {
		ferryman: packet(['river-witness', 'messenger-log', 'bypass-witness'], [
			say('The river report is mine. The dock register and the inspector’s page came across in my boat. I’m carrying them, not putting my name on them.', '강물 보고는 내 거야. 부두의 도착부와 점검자의 보고는 내 배로 건너왔지. 내가 나르는 거지, 내 이름으로 증언하는 건 아니야.'),
			say('A passenger asked what will happen if I don’t make the crossing tomorrow. I said that was exactly what the dry trial was for.', '내일 내가 건너오지 못하면 어떻게 되냐고 손님 하나가 묻더군. 바로 그래서 물을 움직이기 전에 시험하는 거라고 답했어.'),
		],
		say('Make the test in the chamber, not with the river. The boat will wait.', '시험은 강물 말고 심리실에서 해. 배는 기다릴 테니.'),
		say('I’ve put a chair at the landing instead of a departure bell. We have time to read the warning before we look at the sailing order. Anyone who has to wait can sit.', '나루터에 출항 종 대신 의자를 갖다 놨어. 출항 지시를 보기 전에 경고부터 읽을 시간은 있어. 기다려야 하는 사람은 앉으면 돼.')),
		keeper: packet(['gate-witness', 'gate-log', 'bridge-witness', 'pump-log'], [
			say('A new docket, not a correction of the old one. These pages go to the machine room, with the clerk’s seal on the copies, not on the commands.', '옛 사건을 정정하는 문서가 아니라 새 사건부예요. 이 문서들은 기계실로 갑니다. 기록관 인장은 사본에만 찍어요. 명령에 찍는 게 아니고요.'),
			say('When you test with a report set aside, leave the first reading where we can see it. You’re testing what we relied on. You’re not correcting the witness.', '보고 하나를 빼고 시험하더라도 첫 판독은 보이는 곳에 놓으세요. 우리가 무엇에 의지했는지 살피는 시험이지, 증인 말을 고쳐 쓰는 게 아닙니다.'),
		],
		say('I used to think a clean page showed care. Now I’ll settle for being able to see, and account for, every mark we made.', '예전에는 말끔한 문서가 정성을 보여 준다고 생각했어요. 이제는 우리가 그은 표시를 하나도 빠짐없이 보고 설명할 수 있으면 됩니다.'),
		say('I filed the program beside the reports. Then I ruled a second column in the duty book: why we were permitted to act. I’d rather the next clerk have an empty box than no box at all.', '지시문을 보고 옆에 보관했어요. 그리고 근무 일지에 두 번째 칸을 그었지요. 왜 행동해도 된다고 판단했는지 쓰는 칸입니다. 다음 기록관에게 빈칸은 있어야지요. 칸조차 없으면 안 되니까요.')),
		bellkeeper: packet(['beacon-witness', 'beacon-log', 'bell-log', 'siren-log'], [
			say('Four slips from the tower. The bell calls people to listen. A siren tells them to move. If you mix up the names, they’ll still run when they hear one.', '종루에서 가져온 쪽지 넉 장이야. 종은 들어 보라고 사람을 부르고, 경보는 움직이라고 하지. 이름을 뒤섞어 놓아도 사람들은 소리가 나면 뛰어갈 거야.'),
			say('You will hear things fall quiet during the trial. I want to know whether the machine can leave a silence alone without declaring it safe.', '시험 중에 소리가 끊어질 거야. 기계가 그 침묵을 두고도 안전하다고 섣불리 말하지 않을 수 있는지 보고 싶어.'),
		],
		say('The village doesn’t owe the machine an answer to everything. The people on the water do need to know which sound asks something of them.', '마을이 기계에 모든 답을 줄 의무는 없어. 대신 물 위에 있는 사람들은 어느 소리가 자기한테 무슨 일을 하라는 건지 알아야 하지.'),
		say('I rang once after the trial, just to call the village together. Nobody ran to the gate. A child on the steps asked whether it was over. I said the trial was. The listening wasn’t.', '시험이 끝나고 마을 사람들을 모으려고 종을 한 번 울렸어. 아무도 수문으로 뛰어가지 않더군. 계단의 아이가 이제 끝났냐고 물었지. 시험은 끝났다고 했어. 듣는 일은 아니라고.')),
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
