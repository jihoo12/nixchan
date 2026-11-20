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
[data-ramen-action] { position:fixed; z-index:21; bottom:max(24px, env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%);
	display:flex; align-items:center; gap:8px; min-height:44px; max-width:calc(100% - 36px); padding:8px 14px;
	border:1px solid #e2b98575; border-radius:999px; background:#1b2032e8; color:#fff0d7; font:650 14px/1.2 system-ui,sans-serif;
	cursor:pointer; touch-action:manipulation; }
[data-ramen-action][hidden] { display:none; }
[data-ramen-action]:hover { background:#33334a; }
[data-ramen-action]:focus-visible { outline:2px solid #ffd9a2; outline-offset:3px; }
[data-ramen-action] kbd { border:1px solid #ddc4a963; border-radius:5px; padding:3px 5px; font-size:11px; }
@media (pointer:coarse) { [data-ramen-action] kbd { display:none; } }
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
	button.dataset.ramenAction = '';
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
