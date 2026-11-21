// What Far Fields shows over the land besides the HUD: the "E" button for what she can do where she
// is (take up the sun, set it down), and her ember, a little bar that shows while she's out in the
// dark and burns down until she's back in the day.
import { lang } from '../../lib/nixkit/lang';

const css = `
[data-ff-act] { position:fixed; z-index:21; bottom:max(24px, env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%);
	display:flex; align-items:center; gap:8px; min-height:44px; max-width:calc(100% - 36px); padding:8px 14px;
	border:1px solid #ffe2a070; border-radius:999px; background:#1a1a33e8; color:#fff6dc; font:650 14px/1.2 system-ui,sans-serif;
	cursor:pointer; touch-action:manipulation; }
[data-ff-act][hidden], [data-ff-ember][hidden] { display:none!important; }
[data-ff-act]:hover { background:#2a2a4c; }
[data-ff-act][aria-disabled="true"] { cursor:default; opacity:.75; }
[data-ff-act]:focus-visible { outline:2px solid #ffe2a0; outline-offset:3px; }
[data-ff-act] kbd { border:1px solid #ffe2a063; border-radius:5px; padding:3px 5px; font-size:11px; }
@media (pointer:coarse) { [data-ff-act] kbd { display:none; } }
[data-ff-ember] { position:fixed; z-index:20; left:50%; transform:translateX(-50%); bottom:calc(max(24px, env(safe-area-inset-bottom)) + 58px);
	width:min(180px, 50vw); height:6px; border-radius:99px; background:#ffffff1f; overflow:hidden; pointer-events:none;
	box-shadow:0 0 12px #ff9a3c40; }
[data-ff-ember] i { display:block; height:100%; width:100%; transform-origin:left; border-radius:inherit;
	background:linear-gradient(90deg, #ff6a2c, #ffd36e); transition:transform .15s linear; }
[data-ff-ember].low i { animation:ff-flicker .5s infinite alternate; }
@keyframes ff-flicker { to { opacity:.45; } }
@media (prefers-reduced-motion: reduce) { [data-ff-ember].low i { animation:none; } }
`;

export interface Offer {
	label: string;
	/** What pressing E does; without it, the label's just to read. */
	go?: () => void;
}

export function createFieldsUi(press: () => void) {
	const style = document.createElement('style');
	style.textContent = css;
	document.head.append(style);

	const button = document.createElement('button');
	button.dataset.ffAct = '';
	button.type = 'button';
	button.lang = lang;
	button.hidden = true;
	button.setAttribute('aria-keyshortcuts', 'E');
	const key = document.createElement('kbd');
	key.textContent = 'E';
	key.setAttribute('aria-hidden', 'true');
	const text = document.createElement('span');
	button.append(key, text);
	button.addEventListener('click', press);

	const ember = document.createElement('div');
	ember.dataset.ffEmber = '';
	ember.hidden = true;
	ember.setAttribute('role', 'meter');
	ember.setAttribute('aria-label', lang === 'ko' ? '불씨' : 'Ember');
	const fill = document.createElement('i');
	ember.append(fill);
	document.body.append(button, ember);

	let shown: Offer | null = null;
	let emberShown = -1;
	return {
		/** Shows what's on offer (null: nothing). */
		offer(o: Offer | null) {
			if (shown?.label === o?.label && !!shown?.go === !!o?.go) return;
			shown = o;
			button.hidden = !o;
			text.textContent = o?.label ?? '';
			key.hidden = !o?.go;
			button.setAttribute('aria-disabled', String(!o?.go));
		},
		/** Shows how much of her ember is left (1 or more: it isn't shown). */
		ember(f: number) {
			const v = Math.round(Math.min(1, Math.max(0, f)) * 100) / 100;
			if (v === emberShown) return;
			emberShown = v;
			ember.hidden = v >= 1;
			fill.style.transform = `scaleX(${v})`;
			ember.setAttribute('aria-valuenow', String(Math.round(v * 100)));
			ember.classList.toggle('low', v < 0.3);
		},
	};
}
