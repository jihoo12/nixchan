import type { TalkUi } from '../../lib/nixkit/talk';
import type { Phase } from './errand';

const labels = {
	en: { shelf: 'Pick up ramen', water: 'Add hot water', seat: 'Eat by the window', after: 'Get another cup' },
	ko: { shelf: '컵라면 집기', water: '뜨거운 물 붓기', seat: '창가에서 먹기', after: '컵라면 하나 더' },
} as const;

/** No checklist: an action exists only while the player can actually perform it. */
export function ramenAction(phase: Phase, reachable: boolean, ko: boolean): string | null {
	if (!reachable || phase === 'wait' || phase === 'eat') return null;
	return labels[ko ? 'ko' : 'en'][phase];
}

export function lanternEmotes(ko: boolean) {
	return ko
		? { gestures: true, label: '리액션', danceLabel: '별빛 스텝 (춤)', hint: '멈춰 서서 고르면 표정과 몸짓이 함께 나와요.', labels: { happy: '폴짝!', surprised: '깜짝!', sad: '시무룩', determined: '불끈!' } }
		: { gestures: true, label: 'Reactions', danceLabel: 'Starlight Step', hint: 'Stand still to play both the face and the gesture.', labels: { happy: 'Little hop', surprised: 'Startled', sad: 'Droop', determined: 'Fist pump' } };
}

const css = `
[data-town-action] { position:fixed; z-index:21; bottom:max(24px, env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%);
	display:flex; align-items:center; gap:8px; min-height:44px; max-width:calc(100% - 36px); padding:8px 14px;
	border:1px solid #e2b98575; border-radius:999px; background:#1b2032e8; color:#fff0d7; font:650 14px/1.2 system-ui,sans-serif;
	cursor:pointer; touch-action:manipulation; }
[data-town-action][hidden] { display:none; }
[data-town-action]:hover { background:#33334a; }
[data-town-action]:focus-visible { outline:2px solid #ffd9a2; outline-offset:3px; }
[data-town-action] kbd { border:1px solid #ddc4a963; border-radius:5px; padding:3px 5px; font-size:11px; }
@media (pointer:coarse) { [data-town-action] kbd { display:none; } }
[data-lantern-talk] { z-index:22; position:fixed; inset:auto 0 max(24px, env(safe-area-inset-bottom)) 0; margin:auto;
	width:min(480px,calc(100% - 32px)); box-sizing:border-box; padding:13px 16px 14px; border:1px solid #e2b98575;
	border-radius:16px; background:#1b2032f2; color:#fff0d7; font:500 15px/1.5 system-ui,sans-serif;
	box-shadow:0 8px 32px #0808157a; }
[data-lantern-talk][hidden], [data-lantern-bubble][hidden] { display:none!important; }
[data-lantern-talk] .who { display:inline-block; padding:2px 10px; border-radius:999px; color:#fff8ec;
	font-size:12px; font-weight:800; letter-spacing:.02em; }
[data-lantern-talk] p { margin:7px 0 0; min-height:2.9em; }
[data-lantern-talk] .choices { display:flex; flex-wrap:wrap; gap:7px; margin-top:9px; }
[data-lantern-talk] .choices button { min-height:44px; border:1px solid #e2b98575; border-radius:8px; background:#2a2c44;
	color:#fff0d7; padding:6px 12px; font:650 13px system-ui,sans-serif; cursor:pointer; touch-action:manipulation; }
[data-lantern-talk] .choices button[aria-pressed="true"] { background:#ffd9a2; color:#291e21; border-color:#ffd9a2; }
[data-lantern-talk] .choices button:focus-visible { outline:2px solid #ffd9a2; outline-offset:2px; }
[data-lantern-bubble] { z-index:20; position:fixed; left:0; top:0; max-width:220px; padding:6px 11px; border-radius:12px;
	background:#fff4e0; color:#2e2235; font:700 13px/1.35 system-ui,sans-serif; pointer-events:none;
	box-shadow:0 4px 14px #0a0a1a55; margin-top:-8px; }
@media (pointer:coarse) { [data-lantern-talk] { bottom:max(10px, env(safe-area-inset-bottom)); width:min(460px,calc(100% - 24px)); } }
`;

export function lanternKorean() {
	const lang = new URLSearchParams(location.search).get('lang');
	return lang === 'ko' || (lang !== 'en' && (document.documentElement.lang === 'ko' || navigator.language.startsWith('ko')));
}

export function createLanternHud(activate: () => void, ko: boolean) {
	const style = document.createElement('style');
	style.textContent = css;
	document.head.append(style);
	const button = document.createElement('button');
	button.dataset.townAction = '';
	button.type = 'button';
	button.lang = ko ? 'ko' : 'en';
	button.hidden = true;
	button.setAttribute('aria-keyshortcuts', 'E');
	const key = document.createElement('kbd');
	key.textContent = 'E';
	key.setAttribute('aria-hidden', 'true');
	const text = document.createElement('span');
	button.append(key, text);
	button.addEventListener('click', activate);
	document.body.append(button);
	let shown: string | null = null;
	return {
		update(action: string | null) {
			if (shown === action) return;
			shown = action;
			text.textContent = action ?? '';
			button.hidden = action === null;
		},
	};
}

/** The conversation box and speech bubble Nixkit's talk draws into (lib/nixkit/talk.ts), styled to
 * match the action button. */
export function createTalkUi(ko: boolean): TalkUi {
	const talk = document.createElement('section');
	talk.dataset.lanternTalk = '';
	talk.hidden = true;
	const name = document.createElement('span');
	name.className = 'who';
	const text = document.createElement('p');
	text.setAttribute('aria-live', 'polite');
	const choices = document.createElement('div');
	choices.className = 'choices';
	talk.append(name, text, choices);
	const bubble = document.createElement('div');
	bubble.dataset.lanternBubble = '';
	bubble.hidden = true;
	bubble.lang = talk.lang = ko ? 'ko' : 'en';
	document.body.append(talk, bubble);
	return { talk, name, text, choices, bubble };
}
