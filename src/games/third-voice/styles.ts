export const styleText = `
.tv-launch, .tv-book {
	--tv-ink:#101120; --tv-panel:#1b1e30; --tv-border:#44495b; --tv-text:#f4ede0;
	--tv-mute:#bcbccd; --tv-gilt:#e8c48c; --tv-jade:#a0e6cf; --tv-rose:#ffc4bd;
	color:var(--tv-text); font: 1rem/1.55 system-ui,sans-serif; color-scheme:dark;
}
.tv-launch { position:fixed; z-index:12; left:50%; bottom:max(4.7rem,env(safe-area-inset-bottom)); transform:translateX(-50%); width:max-content; max-width:70vw; }
.tv-launch button, .tv-book button, .tv-book select {
	font:inherit; color:inherit; border-radius:.45rem; border:1px solid var(--tv-border);
	background:#202437; padding:.45rem .75rem; min-height:2.75rem;
}
.tv-launch button, .tv-book button { cursor:pointer; }
.tv-book button:disabled { opacity:.55; cursor:not-allowed; }
.tv-book :focus-visible, .tv-launch :focus-visible { outline:2px solid var(--tv-jade); outline-offset:3px; }
.tv-launch button, .tv-book .tv-primary { border-color:#d4ac66; background:#f0d19f; color:#19141c; font-weight:750; box-shadow:0 6px 22px #0006; }
.tv-book {
	box-sizing:border-box; padding:0; width:min(66rem,calc(100% - 1.5rem)); max-width:none; max-height:min(91dvh,58rem);
	border:1px solid #8b7660; border-radius:1rem; background:var(--tv-ink); box-shadow:0 22px 90px #000b;
	overflow:auto; overscroll-behavior:contain; scrollbar-color:#6e687a #101120;
}
.tv-book::backdrop { background:#060715ce; }
.tv-head { position:relative; isolation:isolate; padding:clamp(1.05rem,3vw,2.65rem); border-bottom:1px solid var(--tv-border); background:#1a1a2c; }
.tv-head [data-art] { position:absolute; z-index:-1; inset:0; width:100%; height:100%; object-fit:cover; object-position:66% 47%; opacity:.36; }
.tv-head:before { content:''; position:absolute; z-index:-1; inset:0; background:linear-gradient(100deg,#131421 15%,#131421d9 52%,#13142150); }
.tv-head .tv-close { position:absolute; right:.7rem; top:.7rem; }
.tv-head h2, .tv-section h3, .tv-epilogue h3 { font:600 clamp(1.35rem,3vw,2.25rem)/1.16 Georgia,'Noto Serif KR',serif; margin:.22em 0; text-wrap:balance; }
.tv-head h2 { font-size:clamp(1.45rem,5vw,3.15rem); margin-right:2.5rem; }
.tv-kicker { font-size:.78rem; letter-spacing:.18em; font-weight:750; color:var(--tv-gilt); }
.tv-head p, .tv-section p { margin:.5em 0; } .tv-head p { max-width:43ch; }
.tv-nav { padding:.65rem clamp(.65rem,2vw,1.45rem); border-bottom:1px solid var(--tv-border); display:flex; flex-wrap:wrap; gap:.45rem; }
.tv-nav button[aria-current='step'] { background:#24423f; border-color:var(--tv-jade); color:#ecfff8; font-weight:750; }
.tv-main { padding:clamp(.72rem,2.4vw,1.45rem); }
.tv-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1rem; margin-top:1rem; align-items:start; }
.tv-section, .tv-epilogue { padding:.85rem; border:1px solid var(--tv-border); border-radius:.65rem; background:var(--tv-panel); min-width:0; }
.tv-section h3 { color:var(--tv-gilt); } .tv-section h4 { margin:.8em 0 .4em; color:var(--tv-mute); }
.tv-book ul { list-style:none; padding:0; margin:.45rem 0; display:grid; gap:.4rem; }
.tv-book li { overflow-wrap:anywhere; padding:.35rem .55rem; border-left:2px solid #77718a; background:#131625; }
.tv-book code { color:var(--tv-jade); font:600 .94rem/1.45 ui-monospace,monospace; letter-spacing:.035em; }
.tv-book .tv-mute { color:var(--tv-mute); font-size:.91rem; }
.tv-lexicon { display:grid; grid-template-columns:repeat(auto-fit,minmax(8rem,1fr)); gap:.35rem; margin:.5rem 0; }
.tv-lexicon span { padding:.3rem .45rem; border:1px solid var(--tv-border); border-radius:.3rem; }
.tv-slot { display:grid; gap:.24rem; margin:.65rem 0; }
.tv-slot select { width:100%; color:var(--tv-jade); background:#141726; font-family:ui-monospace,monospace; }
.tv-book [data-mark=pass] { color:var(--tv-jade); border-color:var(--tv-jade); }
.tv-book [data-mark=fail] { color:var(--tv-rose); border-color:var(--tv-rose); }
.tv-actions { display:flex; align-items:center; flex-wrap:wrap; gap:.55rem; margin:.85rem 0 .35rem; }
.tv-book summary { cursor:pointer; color:var(--tv-gilt); font-weight:690; padding:.35rem 0; }
.tv-book details { border-top:1px solid var(--tv-border); margin-top:.65rem; padding-top:.2rem; }
.tv-epilogue { margin-top:1rem; border-color:var(--tv-gilt); background:linear-gradient(145deg,#223e39,#191e30 70%); }
.tv-book textarea { box-sizing:border-box; width:100%; resize:vertical; min-height:4.5rem; font:inherit; color:inherit; background:#111423; border:1px solid var(--tv-border); padding:.55rem; border-radius:.35rem; }
@media(max-width:48rem) {
	.tv-grid { grid-template-columns:minmax(0,1fr); }
	.tv-book { max-height:92dvh; width:calc(100% - .75rem); }
	.tv-launch { bottom:max(5.1rem,calc(env(safe-area-inset-bottom) + 4rem)); }
}
.tv-section[data-gloss=false] .tv-gloss { display:none; }
.tv-book textarea, .tv-book code { user-select:text; -webkit-user-select:text; }
.tv-launch[data-fallback] { z-index:45; }

.tv-launch { display:grid; justify-items:center; gap:.28rem; }
.tv-launch[hidden] { display:none; }
.tv-objective { margin:0; border:1px solid #695b60; border-radius:2rem; background:#121625ed; padding:.22rem .66rem; color:var(--tv-mute); font-size:.86rem; text-align:center; }
.tv-witness-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(10rem,1fr)); gap:.45rem; padding:.3rem 0; }
.tv-witness-card { display:grid; align-content:start; gap:.18rem; background:#151827; border:1px solid var(--tv-border); border-radius:.45rem; padding:.55rem; }
.tv-witness-card strong { color:var(--tv-jade); }
.tv-visit { justify-self:start; margin-top:.35rem; }
.tv-conversation { border-color:#776556; background:linear-gradient(128deg,#26273b,#1b1e30 72%); padding:clamp(.8rem,3vw,1.85rem); }
.tv-dialogue { max-width:60ch; min-height:4.5rem; border-left:2px solid var(--tv-gilt); padding-left:.75rem; margin:.85rem 0; }
.tv-afterword { color:var(--tv-jade); }

.tv-nav .tv-archive-tab { border-color:#a38764; color:var(--tv-gilt); }
.tv-archive { padding:clamp(.9rem,3vw,1.8rem); }
.tv-archive-leaf { margin-top:.8rem; padding:.8rem; background:#151829; border-left:2px solid #9e7c56; border-radius:.25rem; }
.tv-archive-leaf h4 { color:var(--tv-text); margin:.15rem 0 .35rem; font:600 1.25rem/1.3 Georgia,'Noto Serif KR',serif; }
.tv-archive-leaf p { max-width:69ch; }
`
