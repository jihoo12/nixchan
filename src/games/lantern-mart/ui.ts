export type Phase = 'shelf' | 'water' | 'wait' | 'seat' | 'eat' | 'after';

const copy = {
	en: {
		chapter: 'NIGHT WALK / 01', name: 'Lantern Mart', steps: ['Pick a cup', 'Add hot water', 'Window seat'],
		cues: {
			shelf: 'The amber shop is still open. Find the ramen shelf inside.',
			water: 'Take your cup to the hot-water dispenser in the back.',
			wait: 'Let it steep. The shop is warm enough to forget the rain.',
			seat: 'Take the steaming cup to the window seat.',
			eat: 'Nixchan takes her first bite.',
			after: 'Outside, the rain has turned to snow. Stay as long as you like.',
		},
		cup: 'Pick up ramen', pour: 'Add hot water', sit: 'Eat by the window', again: 'Get another cup',
	},
	ko: {
		chapter: '밤 산책 / 01', name: '등불편의점', steps: ['컵라면 고르기', '뜨거운 물 붓기', '창가에서 먹기'],
		cues: {
			shelf: '아직 불이 켜져 있어요. 편의점 안에서 컵라면을 찾아보세요.',
			water: '컵라면을 들고 가게 안쪽의 온수기로 가세요.',
			wait: '면이 익는 중이에요. 비를 잊을 만큼 가게 안이 따뜻해요.',
			seat: '김이 나는 컵라면을 들고 창가 자리로 가세요.',
			eat: '닉스쨩이 첫 젓가락을 들어요.',
			after: '창밖의 비가 눈으로 바뀌었어요. 천천히 쉬다 가세요.',
		},
		cup: '컵라면 집기', pour: '뜨거운 물 붓기', sit: '창가에서 먹기', again: '컵라면 하나 더',
	},
} as const;

export function lanternEmotes(ko: boolean) {
	return ko
		? { gestures: true, label: '리액션', danceLabel: '별빛 스텝 (춤)', hint: '멈춰 서서 고르면 표정과 몸짓이 함께 나와요.', labels: { happy: '폴짝!', surprised: '깜짝!', sad: '시무룩', determined: '불끈!' } }
		: { gestures: true, label: 'Reactions', danceLabel: 'Starlight Step', hint: 'Stand still to play both the face and the gesture.', labels: { happy: 'Little hop', surprised: 'Startled', sad: 'Droop', determined: 'Fist pump' } };
}

const css = `
[data-lantern-hud] { z-index:21; position:fixed; inset:auto 0 max(24px, env(safe-area-inset-bottom)) 0; margin:auto;
	width:min(440px,calc(100% - 32px)); box-sizing:border-box; padding:14px 16px 15px; border:1px solid #bd9e675e;
	border-radius:16px; background:#161629f2; color:#fff0d7; font:500 14px/1.45 system-ui,sans-serif;
	box-shadow:0 8px 32px #0808157a; pointer-events:none; }
[data-lantern-hud] [hidden] { display:none!important; }
[data-lantern-hud] header { display:flex; align-items:center; gap:10px; margin-bottom:7px; }
[data-lantern-hud] h2 { font-size:16px; line-height:1.15; margin:0; letter-spacing:.015em; }
[data-lantern-hud] small { color:#e7b97a; letter-spacing:.13em; font-size:10px; font-weight:750; }
[data-lantern-hud] ol { display:flex; gap:7px 14px; margin:0; padding:0; list-style:none; font-size:11px; color:#d3c6b9; }
[data-lantern-hud] li[aria-current] { color:#ffda90; font-weight:800; }
[data-lantern-hud] li[data-done] { color:#d3dec7; }
[data-lantern-hud] p { margin:7px 0 0; }
[data-lantern-hud] button { pointer-events:auto; display:flex; align-items:center; gap:8px; margin-top:10px; min-height:44px;
	border:0; border-radius:8px; background:#ffd18a; color:#291e21; padding:8px 13px; font:750 14px system-ui;
	cursor:pointer; touch-action:manipulation; }
[data-lantern-hud] button:hover { background:#ffe0ac; }
[data-lantern-hud] button:focus-visible { outline:2px solid white; outline-offset:3px; }
[data-lantern-hud] kbd { background:#332333; color:#fff0da; border-radius:4px; padding:2px 6px; }
[data-lantern-hud] progress { display:block; width:100%; height:6px; margin-top:9px; accent-color:#ffd18a; }
@media (pointer:coarse) {
	[data-lantern-hud] { bottom:max(10px, env(safe-area-inset-bottom)); width:min(420px,calc(100% - 24px)); }
	[data-lantern-hud] kbd { display:none; }
	.nk-jump { bottom:182px; right:max(15px, env(safe-area-inset-right)); width:57px; height:57px; }
}
@media (max-height:490px) and (orientation:landscape) {
	[data-lantern-hud] { bottom:7px; width:min(390px,calc(100% - 150px)); padding:7px 11px; }
	[data-lantern-hud] header { margin-bottom:3px; }
	[data-lantern-hud] p { margin-top:3px; }
	[data-lantern-hud] button { min-height:36px; margin-top:5px; }
}
`;

export function lanternKorean() {
	const lang = new URLSearchParams(location.search).get('lang');
	return lang === 'ko' || (lang !== 'en' && (document.documentElement.lang === 'ko' || navigator.language.startsWith('ko')));
}

export function createLanternHud(activate: () => void) {
	const ko = lanternKorean();
	const text = ko ? copy.ko : copy.en;
	const style = document.createElement('style');
	style.textContent = css;
	document.head.append(style);
	const panel = document.createElement('section');
	panel.dataset.lanternHud = '';
	panel.lang = ko ? 'ko' : 'en';
	panel.setAttribute('aria-label', text.name);
	const make = <K extends keyof HTMLElementTagNameMap>(type: K, parent: HTMLElement, value?: string) => {
		const e = document.createElement(type);
		if (value) e.textContent = value;
		parent.append(e);
		return e;
	};
	const header = make('header', panel);
	make('small', header, text.chapter);
	make('h2', header, text.name);
	const list = make('ol', panel);
	const steps = text.steps.map((step) => make('li', list, step));
	const status = make('p', panel);
	status.setAttribute('role', 'status');
	const progress = make('progress', panel);
	progress.max = 1;
	progress.setAttribute('aria-label', ko ? '진행률' : 'Progress');
	const button = make('button', panel);
	button.type = 'button';
	make('kbd', button, 'E');
	const label = make('span', button);
	button.addEventListener('click', activate);
	button.hidden = true;
	progress.hidden = true;
	panel.hidden = true;
	document.body.append(panel);
	let shownPhase: Phase | null = null;
	let shownAction: string | null = null;
	return {
		text,
		show(visible: boolean) { panel.hidden = !visible; },
		update(phase: Phase, action: string | null, value: number) {
			if (shownPhase !== phase) {
				shownPhase = phase;
				panel.dataset.phase = phase;
				status.textContent = text.cues[phase];
				const active = phase === 'shelf' ? 0 : phase === 'water' || phase === 'wait' ? 1 : phase === 'after' ? 3 : 2;
				steps.forEach((step, i) => {
					step.toggleAttribute('data-done', i < active);
					if (i === active) step.setAttribute('aria-current', 'step');
					else step.removeAttribute('aria-current');
				});
			}
			if (shownAction !== action) {
				shownAction = action;
				button.hidden = action === null;
				label.textContent = action ?? '';
			}
			progress.hidden = phase !== 'wait' && phase !== 'eat';
			if (!progress.hidden) progress.value = value;
		},
	};
}
