export const skin = `
[data-atlas-ui], [data-atlas-dialog] {
	--a-ink:#eaf2fd; --a-soft:#aec1d5; --a-rule:#37516b; --a-mint:#84f2de;
	--a-paper:#101e32; --a-night:#091425; --a-gold:#f8c88e;
	font:500 .9rem/1.48 system-ui,sans-serif; color:var(--a-ink); color-scheme:dark;
}
[data-atlas-ui] *, [data-atlas-dialog] * { box-sizing:border-box }
[data-atlas-ui] button, [data-atlas-dialog] button { font:inherit; color:inherit; cursor:pointer }
[data-atlas-ui] button:focus-visible, [data-atlas-dialog] button:focus-visible { outline:2px solid var(--a-gold); outline-offset:2px }
[data-atlas-ui][hidden] { display:none }
[data-atlas-ui] { position:fixed; z-index:22; left:clamp(12px,3vw,48px); top:clamp(68px,12vh,120px); width:min(23rem,calc(100vw - 24px)); pointer-events:none }
[data-atlas-ui][data-fallback] { z-index:41; top:auto; bottom:clamp(12px,11vh,96px) }
[data-atlas-ui] section { width:fit-content; max-width:100%; padding:14px 16px; border:1px solid #7594a568; border-radius:14px; background:#0a1526e8; box-shadow:0 12px 34px #03081380 }
[data-atlas-ui] .a-open { margin-top:10px; pointer-events:auto }
[data-atlas-ui] h2, [data-atlas-dialog] h2 { margin:3px 0 5px; font:500 clamp(1.35rem,3vw,2.06rem)/1.14 Georgia,serif; letter-spacing:-.015em }
[data-atlas-ui] p, [data-atlas-dialog] p { margin:5px 0 0 }
[data-atlas-ui] p { color:var(--a-soft); font-size:.82rem }
[data-atlas-ui] small, [data-atlas-dialog] small { color:var(--a-mint); font:700 .66rem/1.4 system-ui,sans-serif; letter-spacing:.135em }
[data-atlas-ui] .a-progress { margin-top:8px; color:var(--a-gold); font-size:.75rem }
[data-atlas-ui] .a-open, [data-atlas-dialog] .a-primary { min-height:40px; color:#071a24; background:var(--a-mint); border:1px solid #b3fff1; font-weight:750; border-radius:9px; padding:7px 13px }
[data-atlas-dialog] {
	margin:auto max(10px,3vw) auto auto; width:min(680px,calc(100vw - 20px)); max-width:none;
	max-height:calc(100dvh - 24px); padding:0; border:1px solid #5c7a91; border-radius:18px;
	background:linear-gradient(155deg,#182d45,var(--a-night) 57%); box-shadow:0 25px 90px #0009;
	overscroll-behavior:contain; overflow:auto;
}
[data-atlas-dialog]::backdrop { background:linear-gradient(90deg,#040b1430,#040b1488) }
[data-atlas-dialog] .a-shell { padding:clamp(12px,3vw,24px) }
[data-atlas-dialog] .a-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px }
[data-atlas-dialog] .a-close { flex:none; min-height:36px; min-width:40px; padding:4px 9px }
[data-atlas-dialog] .a-steps { display:flex; gap:6px; margin:10px 0; flex-wrap:wrap }
[data-atlas-dialog] button { background:#13263d; border:1px solid var(--a-rule); border-radius:8px; min-height:36px; padding:5px 8px }
[data-atlas-dialog] button:hover:not(:disabled) { border-color:var(--a-mint); background:#213c52 }
[data-atlas-dialog] button.a-primary:hover:not(:disabled) { background:#b0fff0 }
[data-atlas-dialog] button:disabled { opacity:.46; cursor:default }
[data-atlas-dialog] button[aria-pressed=true], [data-atlas-dialog] button[aria-current=step] { border-color:var(--a-mint); background:#203e4c }
[data-atlas-dialog] .a-intro { color:var(--a-soft); margin-bottom:10px }
[data-atlas-dialog] .a-help { color:var(--a-soft); font-size:.82rem; margin:0 0 12px }
[data-atlas-dialog] .a-help summary { cursor:pointer; color:var(--a-gold); width:fit-content }
[data-atlas-dialog] .a-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px; align-items:start }
[data-atlas-dialog] .a-card { background:#0b182a; border:1px solid var(--a-rule); border-radius:11px; padding:9px; min-width:0 }
[data-atlas-dialog] .a-card h3 { margin:0 0 6px; color:var(--a-soft); font-size:.71rem; letter-spacing:.06em }
[data-atlas-dialog] .a-map svg { display:block; width:100%; max-height:205px; margin:auto }
[data-atlas-dialog] .a-legend { color:var(--a-soft); font-size:.72rem; margin:4px 1px 7px }
[data-atlas-dialog] .a-lenses { display:flex; flex-wrap:wrap; gap:5px; margin-top:4px }
[data-atlas-dialog] .a-lenses button { flex:1 1 57px; padding:3px 4px; font-size:.74rem }
[data-atlas-dialog] .a-glyphs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px }
[data-atlas-dialog] .a-glyphs button { padding:3px 2px; font-size:.75rem }
[data-atlas-dialog] .a-inspect { color:var(--a-soft); font-size:.76rem; margin:8px 0 5px; min-height:1.25em }
[data-atlas-dialog] .a-traces { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px }
[data-atlas-dialog] .a-traces button { min-width:0; font-size:.74rem; text-align:left; overflow-wrap:anywhere }
[data-atlas-dialog] .a-traces [data-match] { color:var(--a-mint) }
[data-atlas-dialog] .a-path { color:var(--a-soft); font-size:.8rem; overflow-wrap:anywhere; margin-top:8px }
[data-atlas-dialog] .a-compare { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin-top:8px }
[data-atlas-dialog] .a-reading { border:1px solid #30465b; border-radius:7px; padding:5px; font-size:.7rem }
[data-atlas-dialog] .a-reading p { color:var(--a-soft); min-height:2.1em; margin:0 0 3px }
[data-atlas-dialog] .a-triplet { display:inline-flex; align-items:center; gap:3px; vertical-align:middle }
[data-atlas-dialog] .a-token { display:grid; min-width:1.42em; height:1.45em; padding:0 .1em; place-items:center; border-radius:4px; color:#091421; font-weight:850; background:#f8cc91 }
[data-atlas-dialog] .a-token[data-light="1"] { background:#78e3da }
[data-atlas-dialog] .a-token[data-light="2"] { background:#c5b7ff }
[data-atlas-dialog] .a-playline, [data-atlas-dialog] .a-bottom { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:8px }
[data-atlas-dialog] .a-playline button, [data-atlas-dialog] .a-bottom button { font-size:.79rem }
[data-atlas-dialog] .a-status { font-size:.82rem; color:var(--a-gold); padding-top:4px }
[data-atlas-dialog] .a-note { color:var(--a-gold); border-left:2px solid #92754d; padding-left:8px; font-size:.84rem }
[data-atlas-dialog] .a-ending { padding:14px; border:1px solid var(--a-gold); border-radius:12px; background:#192438 }
[data-atlas-dialog] .a-ending p { max-width:55ch; margin-bottom:10px }
@media(max-width:570px) {
	[data-atlas-ui] { top:61px }
	[data-atlas-ui] section { padding:9px 12px }
	[data-atlas-ui] h2 { font-size:1.2rem }
	[data-atlas-dialog] { margin:auto; max-height:calc(100dvh - 14px); border-radius:13px }
	[data-atlas-dialog] .a-grid { grid-template-columns:1fr }
	[data-atlas-dialog] .a-map svg { max-height:166px }
	[data-atlas-dialog] button { min-height:40px }
	[data-atlas-dialog] .a-glyphs { grid-template-columns:repeat(3,minmax(0,1fr)) }
}
`;
