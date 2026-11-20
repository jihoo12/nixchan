const info = {
	ko: {
		title: '플레이 도움말', close: '닫기',
		rows: [
			['이동', 'WASD 또는 방향키로 이동, Shift로 달리기, Space로 점프.'],
			['카메라', '드래그로 회전, 휠로 거리 조절, V로 1인칭과 3인칭 전환.'],
			['터치', '화면 왼쪽을 드래그해 이동하고 오른쪽을 드래그해 둘러봐요. 점프는 화면 버튼을 눌러요.'],
			['마을 지도', 'M 또는 마을 지도 버튼으로 열어요.'],
			['리액션', '3인칭에서 B를 눌러 열고, B 또는 Esc로 닫아요.'],
			['의자', '역과 전망대의 벤치, 편의점 창가 의자에 가까이 가서 E나 화면 버튼으로 앉고 일어나요.'],
			['기차', '등불역과 강 건너 물빛시장 정류장을 오가는 열차예요. 문이 열리면 출입문 근처에서 E 또는 화면 버튼으로 타고 내려요. 주행 중에도 통로를 걸을 수 있고, 좌석 가까이에서 E로 앉거나 일어나요.'],
			['편의점', '선반에서 컵라면을 고르고 온수기에서 물을 부은 뒤 창가에서 먹을 수 있어요. 가까이 가면 E나 화면 버튼으로 상호작용해요.'],
			['이웃', '편의점의 모찌, 정류장의 핍, 붕어빵 수레의 곰순 할머니, 포장마차의 여울에게 가까이 가서 E로 말을 걸어요. 붕어빵과 어묵도 살 수 있어요.'],
		],
	},
	en: {
		title: 'How to play', close: 'Close',
		rows: [
			['Movement', 'Move with WASD or the arrow keys, run with Shift, and jump with Space.'],
			['Camera', 'Drag to look around, scroll to zoom, and press V to switch between first and third person.'],
			['Touch', 'Drag on the left to move and on the right to look. Tap the jump button to jump.'],
			['Town map', 'Press M or use the Town map button.'],
			['Reactions', 'Press B in third person to open the menu. Press B or Esc to close it.'],
			['Seats', 'Approach a station or lookout bench, or a window stool in the shop. Use E or the on-screen action to sit or stand.'],
			['Train', 'The train runs between Lantern Station and Moonwater West, across the river. Use E or the on-screen button near the open door to board or leave. Walk inside while moving, and use E near a seat to sit or stand.'],
			['Corner shop', 'Pick up ramen at the shelf, add hot water, then eat by the window. Use E or the on-screen action when close enough.'],
			['Neighbours', 'Walk up to Mochi in the shop, Pip at the bus stop, Grandma Gomsun at the bungeoppang cart or Yeoul in the street-food tent and press E to talk. You can buy a bungeoppang or a fish cake, too.'],
		],
	},
} as const;

export function createTownHelp(ko: boolean) {
	const copy = ko ? info.ko : info.en;
	const dialog = document.createElement('dialog');
	dialog.id = 'lantern-town-help';
	dialog.lang = ko ? 'ko' : 'en';
	dialog.setAttribute('aria-labelledby', 'lantern-town-help-title');
	const style = document.createElement('style');
	style.textContent = `
#lantern-town-help { box-sizing:border-box; width:min(460px,calc(100% - 24px)); max-height:calc(100% - 30px); overflow:auto;
	padding:18px 21px; border:1px solid #a898ac; border-radius:14px; background:#1b2133; color:#fff0d7;
	font:500 14px/1.5 system-ui,sans-serif; box-shadow:0 15px 44px #08081780; }
#lantern-town-help::backdrop { background:#0a0e20a0; }
#lantern-town-help header { display:flex; align-items:center; gap:12px; justify-content:space-between; }
#lantern-town-help h2 { margin:0; font-size:18px; }
#lantern-town-help dl { margin:4px 0 0; }
#lantern-town-help dt { margin-top:11px; color:#ffdcad; font-weight:750; }
#lantern-town-help dd { margin:0; color:#eadfda; }
#lantern-town-help button { min-height:44px; padding:4px 12px; border:1px solid #7b728c; border-radius:7px; background:#303149; color:inherit; font:inherit; cursor:pointer; }
#lantern-town-help button:focus-visible { outline:2px solid #ffd9a2; outline-offset:3px; }
`;
	document.head.append(style);
	const head = document.createElement('header');
	const title = document.createElement('h2');
	title.id = 'lantern-town-help-title';
	title.textContent = copy.title;
	const close = document.createElement('button');
	close.type = 'button';
	close.textContent = copy.close;
	head.append(title, close);
	const list = document.createElement('dl');
	for (const [term, details] of copy.rows) {
		const name = document.createElement('dt');
		const desc = document.createElement('dd');
		name.textContent = term;
		desc.textContent = details;
		list.append(name, desc);
	}
	dialog.append(head, list);
	document.body.append(dialog);
	return { dialog, close };
}
