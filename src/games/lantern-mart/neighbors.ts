// The people of the Lantern Quarter, up late: Mochi at the mart's till, Pip at the bus stop, Gomsun at
// her bungeoppang cart and Yeoul in her pojangmacha. They're modelled in Blender
// (tools/lantern-mart/build.py) and brought in with Nixkit's createCharacter. Each waves as Nixchan
// comes by and talks with her at E: about the errand she's on, the first snow, and each other. Each
// also has a small favour to ask (requests.ts), and stamps her walk notebook when it's done.
import * as THREE from 'three';
import { createCharacter, type Character } from '../../lib/nixkit/character';
import type { Choice, Speaker, Talk } from '../../lib/nixkit/talk';
import type { Toon } from '../../lib/nixkit/look';
import { josa } from '../../lib/nixkit/lang';
import mochiUrl from './models/mochi.glb?url';
import pipUrl from './models/pip.glb?url';
import gomiUrl from './models/gomi.glb?url';
import yeoulUrl from './models/yeoul.glb?url';
import { CART, TENT } from './stalls';
import type { TreatKind } from './treat';
import type { Phase } from './errand';
import { REQUESTS, type Item, type NeighborId, type Requests } from './requests';

export type { NeighborId };
export const NEIGHBORS: readonly NeighborId[] = ['mochi', 'pip', 'gomsun', 'yeoul'];

type Bounds = readonly [number, number, number, number];

/** What they know about how the night is going. */
export interface Facts {
	phase: Phase;
	snowing: boolean;
	/** Her hands are full (a cup of ramen, or a treat). */
	handsFull: boolean;
	/** Treats she's eaten so far, of each kind. */
	eaten: Record<TreatKind, number>;
	/** The sky lanterns are up: every favour's done. */
	festival: boolean;
}

/** Each neighbour's favour: asking, a reminder, thanks, and what they say once it's done (and once
 * the lanterns are up). The stallholders also say something when what she buys is for someone. */
type Favor = { label: string; remind: string; asks: string; waiting: string; thanks: string; after: string; festival: string; forSomeone?: string };

const ITEM: Record<'ko' | 'en', Record<Item, string>> = {
	ko: { bungeo: '붕어빵', eomuk: '어묵', umbrella: '우산', radish: '무' },
	en: { bungeo: 'bungeoppang', eomuk: 'fish cake', umbrella: 'umbrella', radish: 'radish' },
};

const FAVOR_KO: Record<NeighborId, Favor> = {
	pip: {
		label: '부탁할 거 있어?', remind: '부탁이 뭐였지?',
		asks: '사실... 배가 고파. 근데 여기서 자리를 비우면 그 사이에 버스가 올 것 같단 말이야. 곰순 할머니 붕어빵 하나만 사다 줄래?',
		waiting: '곰순 할머니 붕어빵! 꽃집 앞 빨간 수레야. 버스 오기 전에 부탁해!',
		thanks: '우와, 따끈따끈해! 고마워 닉스쨩! 자, 내 수첩 도장이야. 꼬리부터 먹어야지!',
		after: '붕어빵 먹으니까 기다리는 것도 하나도 안 힘들어. 버스야 천천히 와라~',
		festival: '저것 봐, 풍등이야! 버스 기다리길 정말 잘했다!',
	},
	mochi: {
		label: '뭐 도와줄까요?', remind: '부탁이 뭐였죠?',
		asks: '저기... 손님한테 이런 부탁 드려도 될까요? 근무가 길어서 따뜻한 게 너무 먹고 싶어요. 여울 포차 어묵 하나만 사다 주실래요?',
		waiting: '여울 포차는 거리 오른쪽 끝, 아케이드 앞 주황색 천막이에요. 국물이 제일 맛있어요.',
		thanks: '와아, 국물까지! 몸이 다 녹는 것 같아요. 고마워요, 닉스쨩. 여기, 등불편의점 도장이에요!',
		after: '어묵 덕분에 오늘 근무는 끝까지 버틸 수 있겠어요.',
		festival: '창밖 좀 보세요, 풍등이 떠올라요! 근무 중에 이런 걸 보다니, 오늘은 좋은 밤이에요.',
	},
	gomsun: {
		label: '도와드릴 거 있어요?', remind: '뭘 찾아 드리기로 했죠?',
		asks: '아이고, 마침 잘 왔네. 아까 등불역에 갔다가 우산을 두고 왔지 뭐유. 노란 우산이야. 역 앞 광장 가로등 근처에 있을 거예요. 좀 찾아다 줄래요?',
		waiting: '노란 우산이에요. 큰길을 따라 올라가다 오른쪽, 등불역 앞 광장 가로등 옆에 있을 거예요. 지도를 보면 쉬워요.',
		thanks: '어머, 내 우산! 우리 영감님이 사 준 거라 아끼는 거라우. 고마워요, 아가. 자, 할머니 도장이야.',
		after: '우산도 찾았으니, 이제 눈이 와도 걱정 없지요.',
		festival: '풍등이 다 올라가네... 영감님이랑 같이 보던 생각이 나요. 고마워요, 아가.',
		forSomeone: '핍 주려고? 그 녀석 또 배고프다고 했구먼. 식지 않게 종이에 꼭꼭 싸 줄게요.',
	},
	yeoul: {
		label: '도와줄 거 있어요?', remind: '뭐 가져오기로 했죠?',
		asks: '마침 잘 왔어요! 국물에 넣을 무가 다 떨어졌거든요. 물빛시장 채소 가게에 한 자루 맡겨 놨는데, 좀 가져다줄래요? 큰길로 가다 왼쪽이에요.',
		waiting: '물빛시장이요! 큰길을 따라가다 왼쪽으로 꺾으면 줄지은 노점이 보여요. 상자 위에 무가 있을 거예요.',
		thanks: '이 무 좀 봐요, 통통하다! 오늘 국물은 끝내주겠어요. 고마워요! 여울 포차 도장, 꾹!',
		after: '닉스쨩이 가져온 무로 끓인 국물이에요. 오늘은 특별히 더 달아요!',
		festival: '와, 풍등이다! 오늘 같은 밤엔 국물이 세 배로 맛있어요!',
		forSomeone: '모찌 주려고요? 걔 또 근무하다 배고파졌구나. 국물 안 흘리게 뚜껑 덮어 줄게요!',
	},
};

const FAVOR_EN: Record<NeighborId, Favor> = {
	pip: {
		label: 'Need anything?', remind: 'What did you need again?',
		asks: "Honestly... I'm hungry. But if I leave, the bus will come the minute I'm gone. Could you get me a bungeoppang from Gomsun's cart?",
		waiting: "Gomsun's bungeoppang! The red cart in front of the florist. Before the bus comes, please!",
		thanks: "Wow, it's still warm! Thank you, Nixchan! Here, a stamp for your notebook. Tail first, I think!",
		after: "With a bungeoppang inside me, waiting's no trouble at all. Take your time, bus~",
		festival: "Look, sky lanterns! I'm so glad I waited for the bus!",
	},
	mochi: {
		label: 'Can I help with anything?', remind: 'What was it you needed?',
		asks: "Um... is it all right to ask a customer this? It's a long shift and I'd love something warm. Could you get me a fish cake from Yeoul's tent?",
		waiting: "Yeoul's tent is at the right end of the street, the orange one in front of the arcade. The broth is the best part.",
		thanks: "Oh, with broth too! I feel like I'm thawing out. Thank you, Nixchan. Here's a Lantern Mart stamp!",
		after: "Thanks to that fish cake, I'll make it to the end of my shift.",
		festival: "Look out the window, the lanterns are going up! What a night to be working.",
	},
	gomsun: {
		label: 'Can I help you with anything?', remind: 'What was I finding for you?',
		asks: "Oh, just the person. I went up to Lantern Station earlier and left my umbrella behind. A yellow one. It'll be by a lamp in the station plaza. Would you fetch it for me, dear?",
		waiting: "A yellow umbrella. Up the main street and right, by a lamp in front of Lantern Station. The map will show you.",
		thanks: "My umbrella! My husband gave me that one, you know. Thank you, dear. Here's a stamp from Grandma.",
		after: "Now I've my umbrella back, let it snow all it likes.",
		festival: "All the lanterns going up... it puts me in mind of watching them with my husband. Thank you, dear.",
		forSomeone: "For Pip? That one's always hungry. I'll wrap it up snug so it stays warm.",
	},
	yeoul: {
		label: 'Need a hand?', remind: 'What was I bringing you?',
		asks: "Perfect timing! I've run out of radish for the broth. I left a sack at the Waterside Market. Could you bring it? Up the main street, then left.",
		waiting: "The Waterside Market! Up the main street, then left, and you'll see the rows of stalls. The radish is on a crate.",
		thanks: "Look at this radish, so plump! Tonight's broth will be amazing. Thank you! A Yeoul's Pocha stamp, there!",
		after: "This broth is made with the radish you brought. It's extra sweet tonight!",
		festival: "Wow, sky lanterns! Broth tastes three times as good on a night like this!",
		forSomeone: "For Mochi? Hungry on shift again, I bet. I'll put a lid on so the broth doesn't spill!",
	},
};

interface Who {
	id: NeighborId;
	url: string;
	at: readonly [number, number, number];
	facing: number;
	scale: number;
	/** Where Nixchan stands to talk, and how near that she has to be. */
	spot: readonly [number, number];
	reach: number;
	color: string;
	sells?: TreatKind;
}

const CAST: readonly Who[] = [
	// On a step behind the till, so she sees over the counter.
	{ id: 'mochi', url: mochiUrl, at: [-3.0, 0.48, -7.86], facing: 0, scale: 1.05, spot: [-3.0, -6.5], reach: 1.25, color: '#4f9f92' },
	{ id: 'pip', url: pipUrl, at: [-6.72, 0, 2.78], facing: 0.35, scale: 1.0, spot: [-6.5, 3.5], reach: 1.35, color: '#5d70b8' },
	{ id: 'gomsun', url: gomiUrl, at: [CART.x - 0.3, 0, CART.z - 1.05], facing: 0, scale: 1.25, spot: [CART.x, CART.z + 1.2], reach: 1.35, color: '#b8673c', sells: 'bungeo' },
	{ id: 'yeoul', url: yeoulUrl, at: [TENT.x + 0.02, 0, TENT.z - 0.55], facing: 0, scale: 1.3, spot: [TENT.x - 0.4, TENT.z + 1.15], reach: 1.4, color: '#d0672f', sells: 'eomuk' },
];

/** Room for each of them that Nixchan can't walk through (the stalls cover Gomsun and Yeoul). */
export const neighborSolids: readonly Bounds[] = [
	[-7.02, -6.42, 2.48, 3.08], // Pip
	[CART.x - 0.75, CART.x + 0.15, CART.z - 1.5, CART.z - 0.6], // Gomsun, behind her cart
];

type Lines = {
	name: string;
	first: string;
	hello: string[];
	wave: string;
	waveSnow: string;
	/** What they say about the errand Nixchan's on (by phase), and about the snow. */
	about: Partial<Record<Phase, string>>;
	snow: string;
	chat: string[];
	ask: string;
	bye: string;
	byeLine: string;
	buy?: string;
	sold?: string;
	full?: string;
	again?: string;
};

const KO: Record<NeighborId, Lines> = {
	mochi: {
		name: '모찌',
		first: '어서 오세요~ 등불편의점이에요. 저는 모찌, 밤 근무 담당이에요. 천천히 둘러보세요.',
		hello: ['또 오셨네요~ 반가워요.', '어서 오세요~ 오늘도 비가 오네요.', '아, 닉스쨩! 따뜻하게 있다 가요.'],
		wave: '어서 오세요~',
		waveSnow: '눈 와요, 눈!',
		about: {
			shelf: '컵라면은 왼쪽 벽 선반에 있어요. 금빛 줄이 있는 칸이요.',
			water: '온수기는 안쪽 카운터에 있어요. 버튼을 꾹 눌러 주세요. 뜨거우니까 조심!',
			wait: '창가 자리가 제일 좋아요. 비 오는 거 보면서 먹으면 더 맛있거든요.',
			seat: '창가 자리가 제일 좋아요. 비 오는 거 보면서 먹으면 더 맛있거든요.',
			after: '어, 눈이다! 올해 첫눈이네요. 오늘 밤은 손님이 많아지겠어요.',
		},
		snow: '눈 오는 밤엔 가게 불빛이 더 따뜻해 보여요. 그래서 이 일이 좋아요.',
		chat: [
			'밤에는 시간이 천천히 가요. 저는 그게 좋아요.',
			'길 건너 곰순 할머니 붕어빵은요, 팥이 꼬리 끝까지 들어 있어요.',
			'핍은 맨날 7번 버스를 기다려요. 근데 타는 건 한 번도 못 봤어요.',
			'근무 끝나면 여울 포차에 가요. 어묵 두 개랑 국물 한 컵. 그게 제 퇴근이에요.',
		],
		ask: '이야기하자',
		bye: '안녕!',
		byeLine: '또 오세요~ 우산 잊지 말고요!',
	},
	pip: {
		name: '핍',
		first: '안녕! 나는 핍. 7번 심야버스 기다리는 중이야. 벌써 세 대째 놓쳤지만!',
		hello: ['또 왔네! 버스는 아직이야.', '닉스쨩! 같이 기다려 줄래?', '안녕! 귀마개 예쁘지?'],
		wave: '안녕~!',
		waveSnow: '눈이다아!',
		about: {
			shelf: '등불편의점 컵라면 먹어 봤어? 창가 자리에서 먹으면 최고야.',
			after: '눈이다!! 이건 펭귄 날씨야! 버스 안 와도 괜찮아!',
		},
		snow: '눈 오는 날은 버스가 천천히 와. 그러니까 더 오래 구경할 수 있지!',
		chat: [
			'시간표에는 "비 그치면 옴"이라고 적혀 있어. 언제 그칠까?',
			'펭귄인데 왜 추위를 타냐고? 귀마개가 좋아서 그래.',
			'곰순 할머니가 가끔 붕어빵 하나씩 주셔. 버스 기다리는 값이래.',
			'7번 버스는 별빛 정류장까지 가. 거기선 은하수가 보인대!',
		],
		ask: '버스 언제 와?',
		bye: '안녕!',
		byeLine: '잘 가! 나는 여기 있을게. 아마 꽤 오래!',
	},
	gomsun: {
		name: '곰순 할머니',
		first: '어서 와요, 아가. 곰순이네 붕어빵이에요. 팥 듬뿍, 겉은 바삭하게!',
		hello: ['왔어요, 아가? 마침 막 구웠어요.', '어서 와요. 오늘도 춥지요?', '아이고, 또 왔네. 반가워라.'],
		wave: '어서 와요~',
		waveSnow: '첫눈이네, 아가!',
		about: {
			after: '첫눈 오는 밤엔 붕어빵이 제일 잘 팔려요. 다들 손이 시리거든.',
		},
		snow: '눈 오는 날 붕어빵은 손난로 겸 간식이지요.',
		chat: [
			'붕어빵은 머리부터 먹는 사람, 꼬리부터 먹는 사람이 있지. 아가는 어느 쪽이우?',
			'이 틀은 우리 영감님이 쓰던 거라우. 사십 년째 굽고 있어요.',
			'여울이네 어묵 국물이랑 같이 먹으면 속이 다 풀려요.',
			'모찌가 퇴근길에 꼭 하나씩 사 가요. 꼬리부터 먹더라고.',
		],
		ask: '이야기 들려줘',
		bye: '안녕히 계세요!',
		byeLine: '조심히 가요, 아가. 따뜻하게 다니고!',
		buy: '붕어빵 하나 주세요',
		sold: '자, 갓 구운 거예요. 뜨거우니까 호호 불어 먹어요.',
		full: '어이쿠, 손이 꽉 찼네. 그거 먼저 다 먹고 와요.',
		again: '또 먹으려고? 그럼 제일 통통한 놈으로 줄게요.',
	},
	yeoul: {
		name: '여울',
		first: '어서 와요! 여울 포차예요. 어묵 국물은 공짜, 떡볶이는 매콤!',
		hello: ['왔어요? 국물 딱 좋게 끓었어요!', '어서 와요! 오늘은 무가 달아요.', '닉스쨩! 앉아요, 앉아.'],
		wave: '어서 와요!',
		waveSnow: '첫눈이다!',
		about: {
			after: '첫눈이다! 오늘 같은 날엔 국물이 두 배로 맛있어요.',
		},
		snow: '눈 오면 사람들이 이 주황 불빛 보고 찾아와요. 등대 같죠?',
		chat: [
			'국물은 무랑 다시마를 넣고 밤새 끓였어요. 비결은... 비밀!',
			'모찌는 근무 끝나면 꼭 여기 들러서 어묵 두 개 먹고 가요.',
			'곰순 할머니 붕어빵이랑 우리 어묵, 이 동네 겨울 세트예요.',
			'떡볶이는 아직 연습 중이에요. 오늘은 조금 많이 매워요!',
		],
		ask: '수다 떨자',
		bye: '안녕!',
		byeLine: '또 와요! 국물은 언제나 끓고 있을 거예요.',
		buy: '어묵 하나 주세요',
		sold: '여기요! 국물도 컵에 듬뿍 담았어요. 뜨거우니까 조심!',
		full: '손이 꽉 찼네요! 그거 다 먹고 다시 와요.',
		again: '또요? 좋아요, 제일 길쭉한 걸로!',
	},
};

const EN: Record<NeighborId, Lines> = {
	mochi: {
		name: 'Mochi',
		first: "Welcome to Lantern Mart~ I'm Mochi, on the night shift. Take your time.",
		hello: ['Back again? Nice to see you.', 'Welcome~ Still raining out there.', "Oh, Nixchan! Stay and get warm."],
		wave: 'Welcome~',
		waveSnow: "It's snowing!",
		about: {
			shelf: 'Cup ramen is on the shelf along the left wall. The row with the gold stripe.',
			water: 'The hot water is on the back counter. Hold the button down, and careful, it\'s hot!',
			wait: 'The window seat is the best one. Ramen tastes better watching the rain.',
			seat: 'The window seat is the best one. Ramen tastes better watching the rain.',
			after: "Oh, snow! The first of the year. We'll be busy tonight.",
		},
		snow: "The shop lights look warmer when it snows. That's why I like this job.",
		chat: [
			'Time goes slowly at night. I like that.',
			"Gomsun's bungeoppang across the street have red bean right to the tip of the tail.",
			"Pip waits for the 07 every night. I've never once seen Pip get on it.",
			"After my shift I go to Yeoul's tent. Two fish cakes and a cup of broth. That's my way home.",
		],
		ask: "Let's chat",
		bye: 'Bye!',
		byeLine: "Come again~ Don't forget your umbrella!",
	},
	pip: {
		name: 'Pip',
		first: "Hi! I'm Pip. Waiting for the 07 night bus. I've only missed three so far!",
		hello: ['You again! No bus yet.', 'Nixchan! Wait with me?', 'Hi! Do you like my earmuffs?'],
		wave: 'Hi~!',
		waveSnow: 'Snooow!',
		about: {
			shelf: "Have you tried the cup ramen at Lantern Mart? Eat it at the window seat. It's the best.",
			after: "Snow!! This is penguin weather! I don't even mind the bus now!",
		},
		snow: 'The bus goes slowly in the snow. More time to watch it fall!',
		chat: [
			'The timetable says "comes when the rain stops". When will it stop?',
			"Why does a penguin feel the cold? I don't. I just like earmuffs.",
			'Gomsun gives me a bungeoppang sometimes. She says it\'s my waiting wage.',
			'The 07 goes all the way to Starlight Stop. You can see the Milky Way from there!',
		],
		ask: 'When does the bus come?',
		bye: 'Bye!',
		byeLine: "Bye! I'll be here. Probably for a while!",
	},
	gomsun: {
		name: 'Grandma Gomsun',
		first: "Come here, dear. Gomsun's bungeoppang: plenty of red bean, crisp on the outside!",
		hello: ['Here you are, dear. Fresh out of the mould.', 'Come in. Cold tonight, isn\'t it?', 'Oh, you again. How lovely.'],
		wave: 'Come here, dear~',
		waveSnow: 'First snow, dear!',
		about: {
			after: 'First-snow nights sell the most bungeoppang. Everyone\'s hands are cold.',
		},
		snow: 'On a snowy day, a bungeoppang is a hand warmer and a snack in one.',
		chat: [
			'Some eat bungeoppang head first, some tail first. Which are you, dear?',
			'This mould was my husband\'s. Forty years I\'ve been baking with it.',
			"Have one with Yeoul's fish cake broth. It warms you right through.",
			'Mochi buys one on the way home every night. Eats it tail first.',
		],
		ask: 'Tell me a story',
		bye: 'Goodbye!',
		byeLine: 'Mind how you go, dear. Keep warm!',
		buy: 'One bungeoppang, please',
		sold: "There, fresh from the iron. It's hot, so blow on it first.",
		full: 'Oh my, your hands are full. Finish that first, dear.',
		again: "Another? Then you'll have the plumpest one.",
	},
	yeoul: {
		name: 'Yeoul',
		first: "Welcome! This is Yeoul's pocha. The broth is free, the tteokbokki's spicy!",
		hello: ['Here you are! The broth is just right.', 'Welcome! The radish is sweet tonight.', 'Nixchan! Sit, sit.'],
		wave: 'Welcome!',
		waveSnow: 'First snow!',
		about: {
			after: 'First snow! Broth tastes twice as good on a night like this.',
		},
		snow: 'When it snows, people find their way here by the orange light. Like a lighthouse.',
		chat: [
			'The broth simmers all night with radish and kelp. The secret? Secret!',
			'Mochi always stops by after work for two fish cakes.',
			"Gomsun's bungeoppang and my fish cakes: the neighbourhood's winter set.",
			"I'm still practising the tteokbokki. Tonight's is a bit too spicy!",
		],
		ask: "Let's chat",
		bye: 'Bye!',
		byeLine: "Come again! The broth's always on.",
		buy: 'One fish cake, please',
		sold: "Here you go! I filled the cup with broth too. Careful, it's hot!",
		full: 'Your hands are full! Finish that and come back.',
		again: 'Another one? The longest one, then!',
	},
};

const PIP_BUS_KO = ['곧 올 거야! ...아마도.', '시간표 보면 "비 그치면"이래. 그러니까 지금은 아니야.', '방금 지나간 것 같기도 해. 다음 거 기다리지 뭐!'];
const PIP_BUS_EN = ["Any minute now! ...Probably.", 'The timetable says "when the rain stops". So, not yet.', 'I think one just went by. I\'ll catch the next!'];

export interface NeighborContext {
	scene: THREE.Scene;
	toon: Toon;
	talk: Talk;
	ko: boolean;
	pos: THREE.Vector3;
	facts: () => Facts;
	/** Hands her a treat (to eat, or to carry to whoever asked for it); false if she can't take it. */
	buy: (kind: TreatKind, carry: boolean) => boolean;
	requests: Requests;
	/** What she's holding, if anything. */
	holding: () => Item | null;
	/** She hands over what she's holding, and the notebook gets a stamp. */
	give: (id: NeighborId) => void;
	/** The first time she talks with each of them. */
	met: (id: NeighborId) => boolean;
	meet: (id: NeighborId) => void;
	/** Turns her to face whoever she's talking to. */
	face: (heading: number) => void;
	/** She's said she'll do someone a favour. */
	onAsk: (id: NeighborId) => void;
}

export function createNeighbors(ctx: NeighborContext) {
	const words = ctx.ko ? KO : EN;
	const favors = ctx.ko ? FAVOR_KO : FAVOR_EN;
	const items = ITEM[ctx.ko ? 'ko' : 'en'];
	const { requests } = ctx;
	const rand = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
	// Mochi stands on a little step behind the counter, out of sight below its top.
	const step = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.48, 0.36), new THREE.MeshStandardMaterial({ color: '#4a3a50', roughness: 0.9 }));
	step.position.set(-3.0, 0.24, -7.9);
	ctx.scene.add(step);

	const people = CAST.map((who) => {
		const body: Character = createCharacter(ctx.scene, ctx.toon, {
			url: who.url, at: who.at, facing: who.facing, scale: who.scale, clip: 'Work', look: { within: 7 },
		});
		const lines = words[who.id];
		const favor = favors[who.id];
		const speaker: Speaker = {
			name: lines.name,
			color: who.color,
			onSay: () => body.play('Talk'),
			onTyped: () => body.play('Idle'),
			onClose: () => body.play('Work'),
		};
		return { who, body, lines, favor, speaker, near: false, waveUntil: 0, happyUntil: 0, chat: Math.floor(Math.random() * lines.chat.length), workClock: Math.random() * 8 };
	});
	type Person = (typeof people)[number];
	let talking: Person | null = null;

	const say = (p: Person, text: string) => ctx.talk.say(text, menu(p));
	function menu(p: Person): Choice[] {
		const { lines, who, favor } = p;
		const choices: Choice[] = [];
		if (requests.canGive(who.id, ctx.holding())) choices.push({ label: giveLabel(p), run: () => give(p) });
		if (who.sells && lines.buy) choices.push({ label: lines.buy, run: () => buy(p) });
		const state = requests.state(who.id);
		if (state === 'new') choices.push({ label: favor.label, run: () => (requests.ask(who.id), ctx.onAsk(who.id), say(p, favor.asks)) });
		else if (state === 'asked' && !requests.canGive(who.id, ctx.holding())) choices.push({ label: favor.remind, run: () => say(p, favor.waiting) });
		choices.push({
			label: lines.ask,
			run: () => {
				if (who.id === 'pip' && Math.random() < 0.5) return say(p, rand(ctx.ko ? PIP_BUS_KO : PIP_BUS_EN));
				p.chat = (p.chat + 1) % lines.chat.length;
				const f = ctx.facts();
				if (f.festival && p.chat === 0) return say(p, favor.festival);
				if (requests.state(who.id) === 'done' && p.chat === 1) return say(p, favor.after);
				say(p, f.snowing && p.chat === 0 ? lines.snow : lines.chat[p.chat]);
			},
		});
		choices.push({ label: lines.bye, run: () => ctx.talk.bye(lines.byeLine) });
		return choices;
	}
	function buy(p: Person) {
		const { lines, who, favor } = p;
		if (!who.sells) return;
		const f = ctx.facts();
		// Bought while someone's waiting for one, it's for them: wrapped up to carry, not eaten.
		const forSomeone = requests.wanted(who.sells) !== null;
		if (f.handsFull || !ctx.buy(who.sells, forSomeone)) return say(p, lines.full ?? '');
		p.happyUntil = performance.now() + 1600;
		p.body.play('Happy');
		if (forSomeone && favor.forSomeone) return ctx.talk.bye(favor.forSomeone);
		ctx.talk.bye(f.eaten[who.sells] > 0 && lines.again ? `${lines.again} ${lines.sold}` : (lines.sold ?? ''));
	}
	function giveLabel(p: Person) {
		const thing = items[REQUESTS[p.who.id].wants];
		return ctx.ko ? `${josa(thing, '을', '를')} 건네기` : `Give ${p.lines.name} the ${thing}`;
	}
	function give(p: Person) {
		if (!requests.canGive(p.who.id, ctx.holding())) return;
		ctx.give(p.who.id);
		p.happyUntil = performance.now() + 2400;
		p.body.play('Happy');
		say(p, p.favor.thanks);
	}
	function open(p: Person) {
		if (!ctx.talk.open(p.speaker)) return;
		talking = p;
		ctx.face(Math.atan2(p.body.root.position.x - ctx.pos.x, p.body.root.position.z - ctx.pos.z));
		const f = ctx.facts();
		const first = !ctx.met(p.who.id);
		if (first) ctx.meet(p.who.id);
		// Arriving with what they asked for, she hands it straight over.
		if (requests.canGive(p.who.id, ctx.holding())) return give(p);
		const about = f.festival ? p.favor.festival : f.phase === 'after' ? (p.lines.about.after ?? p.lines.snow) : p.lines.about[f.phase];
		const hello = first ? p.lines.first : rand(p.lines.hello);
		say(p, about && !first ? `${hello} ${about}` : hello);
	}

	/** Who she's near enough to talk to, if anyone. */
	function nearest() {
		let best: Person | null = null;
		let bestD = Infinity;
		for (const p of people) {
			const d = Math.hypot(ctx.pos.x - p.who.spot[0], ctx.pos.z - p.who.spot[1]);
			if (d <= p.who.reach && d < bestD) {
				best = p;
				bestD = d;
			}
		}
		return best;
	}

	return {
		/** What pressing E would do near someone ("Talk to Mochi"), or null. */
		offer(): { label: string; go: () => void } | null {
			if (ctx.talk.talking) return null;
			const p = nearest();
			if (!p) return null;
			if (requests.canGive(p.who.id, ctx.holding())) {
				const thing = items[REQUESTS[p.who.id].wants];
				return { label: ctx.ko ? `${p.lines.name}에게 ${josa(thing, '을', '를')} 건네기` : giveLabel(p), go: () => open(p) };
			}
			return { label: ctx.ko ? `${josa(p.lines.name, '과', '와')} 이야기하기` : `Talk to ${p.lines.name}`, go: () => open(p) };
		},
		get talking() {
			return talking !== null && ctx.talk.speaker === talking.speaker;
		},
		/** Where whoever she's talking to stands, and which way she faces them, for the camera. */
		framing() {
			if (!talking || ctx.talk.speaker !== talking.speaker) return null;
			const at = talking.body.root.position;
			return { x: at.x, z: at.z, facing: Math.atan2(at.x - ctx.pos.x, at.z - ctx.pos.z) };
		},
		update(dt: number) {
			const now = performance.now();
			const f = ctx.facts();
			if (talking && ctx.talk.speaker !== talking.speaker) talking = null;
			for (const p of people) {
				const at = p.body.root.position;
				const d = Math.hypot(ctx.pos.x - at.x, ctx.pos.z - at.z);
				// A wave and a word as she comes by.
				if (!p.near && d < 4.2) {
					p.near = true;
					if (!ctx.talk.talking) {
						p.waveUntil = now + 2200;
						ctx.talk.bubble(f.snowing ? p.lines.waveSnow : p.lines.wave, p.body.above(p.who.id === 'mochi' ? 1.35 : 1.45));
					}
				} else if (p.near && d > 6.5) p.near = false;
				if (talking === p && d > 3.4) ctx.talk.close();
				if (talking !== p) {
					// Between customers they get on with their work, with a breather now and then.
					p.workClock = (p.workClock + dt) % 9;
					const resting = p.workClock > 6.5;
					p.body.play(now < p.happyUntil ? 'Happy' : now < p.waveUntil ? 'Wave' : resting ? 'Idle' : 'Work');
				}
				p.body.update(dt, ctx.pos);
			}
		},
		/** Each of them, for counting who she's met. */
		count: people.length,
		/** Their names, for the notebook. */
		name: (id: NeighborId) => words[id].name,
		/** Everyone's delighted (the lanterns have gone up). */
		cheer() {
			const now = performance.now();
			for (const p of people) p.happyUntil = now + 3200;
		},
	};
}
