import type { Localized } from './rules.ts';
import type { NpcId, StoryState } from './story.ts';

const both = (en: string, ko: string): Localized => ({ en, ko });

interface Fragment {
	readonly id: string;
	readonly origin: Localized;
	readonly title: Localized;
	readonly source: Localized;
	readonly paragraphs: readonly Localized[];
	readonly witness?: NpcId;
	readonly after?: number;
}

export const ARCHIVE: readonly Fragment[] = [
	{
		id: 'boat-tally',
		origin: both('Ask Ruan at the ferry landing', '나루터에서 루안의 말을 듣기'),
		title: both('The line the boat needed', '배에 필요했던 한 줄'),
		source: both('Ferry tally, reverse side · Ruan’s copy', '나루 운항표 뒷면 · 루안의 사본'),
		witness: 'ferryman',
		paragraphs: [
			both('Night of the Erasure. Cast off at the second bell. Turned back at the mouth. All aboard accounted for. On returning, we found the warning about the crosscurrent scored out of the harbor copy. The clerk’s final entry read: PASSAGE CLEAR.',
				'지워진 밤. 두 번째 종에 출항. 물목에서 회항. 승선자 전원 확인. 돌아와 보니 항구 쪽 운항표에서 옆물살 경고에 줄이 그어져 있었다. 서기가 남긴 최종 기록: 통과 가능.'),
			both('The warning didn’t prove that the passage was closed. It told us where to look before deciding. Don’t write that the boat turned back because the clerk was wrong. It turned back because we met water for which we no longer had a word on the sheet.',
				'경고는 물길이 막혔다는 증명이 아니었다. 결정을 내리기 전에 어디를 봐야 하는지 알려주는 말이었다. 서기가 틀려서 배를 돌렸다고 적지 마라. 종이 위에서는 이미 없어진 물살을, 우리가 물 위에서 만났기 때문이다.'),
		],
	},
	{
		id: 'charter',
		origin: both('Ask Iven at the ledger house', '기록관에서 이벤의 말을 듣기'),
		title: both('Charter of the twin ledgers', '두 장부의 헌장'),
		source: both('Village council · filed after the Erasure', '마을 회의 · 지워진 밤 이후 제정'),
		witness: 'keeper',
		paragraphs: [
			both('Keep the words of those who were there in one ledger, and what the gauges, seals and written reports attest in the other. A copy may be moved. Its source mark may not. The third voice is a reading across both ledgers. It is not a third witness and has no vote.',
				'현장에 있던 사람의 말은 한 장부에, 눈금과 인장과 문서가 전하는 말은 다른 장부에 적는다. 사본은 옮길 수 있다. 출처 표시는 떼어낼 수 없다. 제3의 목소리는 두 장부를 함께 읽은 결과다. 세 번째 증인이 아니며, 표결권도 없다.'),
			both('An instruction belongs on a separate slip. An order to wait does not make an affirmative report false. An order to act does not make a refutation disappear. If someone contests a reading, keep the earlier one available; write the correction beside it, not over it.',
				'집행 지시는 별지에 적는다. 기다리라는 명령이 긍정 보고를 거짓으로 만들지는 않는다. 움직이라는 명령이 반박을 없애지도 않는다. 판독에 이의를 제기한 사람이 있으면 전의 판독도 남겨 둔다. 정정은 그 곁에 적지, 그 위에 덮어 쓰지 않는다.'),
		],
	},
	{
		id: 'bell-margin',
		origin: both('Ask Sera at the bell tower', '종루에서 세라의 말을 듣기'),
		title: both('Instructions for an empty margin', '빈 여백을 위한 지시'),
		source: both('Change-of-watch book · an unsigned hand', '교대 일지 · 이름 없는 필체'),
		witness: 'bellkeeper',
		paragraphs: [
			both('Do not tick “bell silent” when no one was listening. The next keeper will read the tick as something you heard. If you can, leave the words “no listener on the stairs.” If you cannot, leave a space.',
				'듣는 사람이 없었을 때 ‘종이 잠잠함’에 표시하지 말 것. 다음 종지기는 그 표시를 네가 들은 것으로 읽을 테니. 가능하면 ‘계단에 듣는 사람 없었음’이라고 적을 것. 그러지 못했다면 자리를 비워 둘 것.'),
			both('One margin carries two hands. The first: “The night went quiet when the warning was struck.” The second: “No. The quay was loud. The book went quiet.” I did not scrape out either hand.',
				'한 여백에 두 사람의 필체가 있다. 첫째: “경고를 지우자 그 밤은 조용해졌다.” 둘째: “아니. 부두는 시끄러웠다. 장부가 조용해졌다.” 나는 어느 글씨도 긁어내지 않았다.'),
		],
	},
	{
		id: 'last-leaf',
		origin: both('Open with the sealed final verdict', '마지막 판결을 봉인하면 열림'),
		title: both('Blank page for a later clerk', '다음 기록관에게 남기는 백지'),
		source: both('Appendix · no verdict printed here', '부록 · 이곳에는 판결을 인쇄하지 않음'),
		after: 3,
		paragraphs: [
			both('If the village stores the record, a later reader can recover the grounds for its decision. But a document in a drawer cannot correct a wrong story already being told at the quay.',
				'마을이 기록을 보관하면 훗날 읽는 사람은 결정의 근거를 되짚을 수 있다. 하지만 서랍 속 문서가 부두에서 이미 떠도는 잘못된 이야기를 고쳐 주지는 않는다.'),
			both('If the village reads the verdict aloud, a listener can object before going home. But the bell carries the decision farther than its qualifications. Decide what to do with the record, not which of these risks to pretend away.',
				'마을이 판결을 읽어 주면 듣는 사람은 집에 가기 전에 이의를 제기할 수 있다. 하지만 종소리는 단서보다 결정을 더 멀리 나른다. 기록을 어떻게 할지 정하라. 어느 위험이 없는 셈 칠지 정하라는 뜻은 아니다.'),
		],
	},
];

export function isArchiveOpen(fragment: Fragment, state: StoryState, sealed: number) {
	if (fragment.after !== undefined) return sealed >= fragment.after;
	const witness = fragment.witness;
	return witness !== undefined && Object.values(state.met).some(ids => ids?.includes(witness));
}

export type RecordPolicy = 'hold' | 'carry';
export const POLICY: Readonly<Record<RecordPolicy, { verdict: Localized; responses: Record<NpcId, Localized> }>> = {
	hold: {
		verdict: both('The two ledgers went into the same unlocked drawer. The ferryman left a paper sign on it: Ask to see both. By dusk he was still explaining to the people on the quay that an unannounced verdict was not the same as no verdict.',
			'두 장부는 잠그지 않은 서랍 하나에 들어갔다. 나룻사공은 서랍에 ‘둘 다 보여 달라고 하시오’라는 쪽지를 붙였다. 해 질 무렵에도 그는 부두 사람들에게 알리지 않은 판결과 판결이 없는 것은 다르다고 설명하고 있었다.'),
		responses: {
			ferryman: both('I’ll tell the people at the dock where to ask. They can’t object to a paper they don’t know exists.', '부두 사람들한테 어디 가서 물을지 일러 줄게. 문서가 있는 줄도 모르는데 이의를 어떻게 내겠어.'),
			keeper: both('The drawer is unlocked. If anyone asks for one volume, I’ll set both on the desk.', '서랍은 잠그지 않았어요. 누가 한 장부를 청하면 두 권 다 책상에 꺼내 놓겠습니다.'),
			bellkeeper: both('I left the bell alone. I hope no one took my silence for agreement.', '종에 손대지 않았어. 아무도 내 침묵을 동의로 읽지 않았으면 해.'),
		},
	},
	carry: {
		verdict: both('Nixchan read the decision. When someone at the far end repeated only the order, a child asked, “What did we still not know?” The archivist opened both books on the steps. The reading began again, this time with the question.',
			'닉스쨩이 판결을 읽었다. 저쪽 끝에서 누군가 명령만 되풀이하자, 아이가 물었다. “그런데 우리가 아직 몰랐던 건 뭐였어요?” 기록관이 계단 위에서 두 장부를 펼쳤다. 낭독은 이번엔 그 물음부터 다시 시작됐다.'),
		responses: {
			ferryman: both('I heard the order from my boat. I had to come ashore to hear why.', '배 위에선 명령이 들렸어. 왜 그런지는 뭍까지 와야 들을 수 있었지.'),
			keeper: both('Two listeners asked me to show the earlier pages. That’s the kind of objection I know what to do with.', '듣던 두 사람이 앞의 기록도 보여 달라고 하더군요. 그런 이의라면 무얼 해야 하는지 알겠어요.'),
			bellkeeper: both('Next time, let the question go before the order. People remember what they hear first.', '다음엔 명령보다 질문을 먼저 보내자. 사람들은 먼저 들은 말을 기억하니까.'),
		},
	},
};
