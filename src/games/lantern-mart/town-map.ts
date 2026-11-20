import {landmarks, TOWN, trails} from './town-layout';
import {RAIL, RAIL_STOPS} from './rail-shuttle';

export function townMap(ko:boolean) {
	const panel=document.createElement('section');
	panel.id='lantern-town-map';
	panel.hidden=true;
	panel.lang=ko?'ko':'en';
	panel.setAttribute('aria-label',ko?'등불마을 지도':'Map of Lantern Town');
	panel.style.cssText='z-index:25;position:fixed;top:max(68px,calc(env(safe-area-inset-top) + 68px));right:max(12px,env(safe-area-inset-right));width:min(340px,calc(100% - 24px));max-height:calc(100% - 80px - env(safe-area-inset-top));overflow:auto;padding:12px 14px;background:#191d31f9;border:1px solid #a898ac;border-radius:14px;color:#fff0d7;box-sizing:border-box;font:500 14px/1.4 system-ui,sans-serif;box-shadow:0 15px 44px #0808178c';
	const header=document.createElement('div');
	header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px';
	const title=document.createElement('strong');
	title.textContent=ko?'등불마을 지도':'Lantern Town Map';
	const close=document.createElement('button');
	close.textContent=ko?'닫기':'Close';
	close.type='button';close.style.cssText='min-height:40px;padding:4px 12px;border:1px solid #7b728c;border-radius:7px;background:#303149;color:inherit';
	header.append(title,close);panel.append(header);
	const canvas=document.createElement('canvas');
	canvas.width=440;canvas.height=460;canvas.style.cssText='width:100%;display:block;height:auto;margin:.4rem 0';
	canvas.setAttribute('role','img');
	canvas.setAttribute('aria-label',ko?'산책길과 등불역·물빛시장 사이의 철도':'Town walking paths and rail line between Lantern Station and Moonwater Halt');
	const status=document.createElement('p');status.style.cssText='margin:4px 0 2px;font-size:13px;color:#e2cbbc';
	// The walk notebook: a stamp for each neighbour's favour.
	const book=document.createElement('section');
	book.style.cssText='margin-top:10px;padding-top:9px;border-top:1px solid #4a4660';
	const bookTitle=document.createElement('strong');bookTitle.style.cssText='display:block;font-size:14px;margin-bottom:4px';
	const bookList=document.createElement('ul');bookList.style.cssText='list-style:none;margin:0;padding:0;font-size:13px;line-height:1.55';
	const bookNote=document.createElement('p');bookNote.style.cssText='margin:6px 0 0;font-size:12px;color:#c9bccb';
	book.append(bookTitle,bookList,bookNote);
	panel.append(canvas,status,book);
	document.body.append(panel);
	const c=canvas.getContext('2d');
	const X=(v:number)=>44+(v-TOWN.west)/(TOWN.east-TOWN.west)*352;
	const Z=(v:number)=>38+(TOWN.north-v)/(TOWN.north-TOWN.south)*386;
	const base=document.createElement('canvas');base.width=440;base.height=460;
	const b=base.getContext('2d');
	if(b){
		b.fillStyle='#222940';b.fillRect(0,0,440,460);
		const area = (x:number,z:number,w:number,d:number,color:string) => {
			b.fillStyle=color;b.fillRect(X(x),Z(z),X(x+w)-X(x),Z(z-d)-Z(z));
		};
		area(-94,81,38,66,'#314d65');
		area(-154,80,60,38,'#3b4d56');
		area(-48,60,34,29,'#384f59');
		area(14,68,37,34,'#423e59');
		area(-39,112,78,39,'#41535a');
		area(-24,12,48,23,'#35384e');
		b.strokeStyle='#a8bac9';b.lineWidth=6;b.lineCap='round';
		for(const [a,end] of trails){b.beginPath();b.moveTo(X(a[0]),Z(a[1]));b.lineTo(X(end[0]),Z(end[1]));b.stroke();}
		b.strokeStyle='#8599b1';b.lineWidth=5;b.beginPath();b.moveTo(X(0),Z(12));b.lineTo(X(0),Z(3));b.stroke();
		b.strokeStyle='#edb67d';b.lineWidth=2;b.setLineDash([4,4]);
		b.beginPath();b.moveTo(X(RAIL.trackMin),Z(RAIL.z));b.lineTo(X(RAIL.trackMax),Z(RAIL.z));b.stroke();
		b.setLineDash([]);
		for(const stop of RAIL_STOPS){
			b.fillStyle='#edb67d';
			b.fillRect(X(stop.x)-3,Z(RAIL.z)-3,6,6);
		}
		for(const spot of landmarks){
			const x=X(spot.x),z=Z(spot.z);
			b.fillStyle='#ffd9a2';b.beginPath();b.arc(x,z,5,0,Math.PI*2);b.fill();
			b.font='650 15px system-ui, sans-serif'; b.fillStyle='#fff2e2';
			const left=x>290, text=ko?spot.ko:spot.en;
			b.textAlign=left?'right':'left';
			const delta=spot.id==='station'?19:spot.id==='mart'?21:-11;
			b.fillText(text,x+(left?-9:9),z+(spot.id==='west'?23:delta));
		}
		b.font='700 12px system-ui,sans-serif';b.textAlign='left';b.fillStyle='#cdcae2';b.fillText('20 m',46,435);
		b.fillStyle='#edb67d';b.textAlign='right';b.fillText(ko?'점선: 철도':'Dotted: rail',394,435);
		b.strokeStyle='#cdcae2';b.lineWidth=2;b.beginPath();b.moveTo(46,445);b.lineTo(46+352*20/(TOWN.east-TOWN.west),445);b.stroke();
	}
	let marks:readonly {x:number;z:number}[]=[];
	/** Rows of the notebook: who, what, and whether it's stamped, being done, or not yet asked. */
	const notebook=(rows:readonly {who:string;what:string;state:'new'|'asked'|'done'}[],stamps:number)=>{
		bookTitle.textContent=ko?`산책 수첩 · 도장 ${stamps}/${rows.length}`:`Walk notebook · ${stamps}/${rows.length} stamps`;
		bookList.replaceChildren(...rows.map(r=>{
			const li=document.createElement('li');
			const mark=r.state==='done'?'●':r.state==='asked'?'◐':'○';
			li.textContent=`${mark} ${r.who}: ${r.state==='new'?(ko?'이야기해 보세요':'say hello'):r.what}`;
			li.style.color=r.state==='done'?'#ffd9a2':r.state==='asked'?'#fff0d7':'#a99fb5';
			return li;
		}));
		bookNote.textContent=stamps===rows.length
			?(ko?'도장을 다 모았어요. 하늘을 올려다보세요!':'Every stamp collected. Look up at the sky!')
			:(ko?'이웃들의 작은 부탁을 들어주고 도장을 받아요. 별 표시가 다음에 갈 곳이에요.':"Do the neighbours' small favours to collect stamps. Stars mark where to go next.");
	};
	const update=(x:number,z:number,label:string,next:readonly {x:number;z:number}[]=marks)=>{
		marks=next;
		if(panel.hidden)return;
		const line=ko?`현재 위치: ${label}`:`You are near: ${label}`;
		if(status.textContent!==line)status.textContent=line;
		if(!c)return;
		c.clearRect(0,0,440,460);if(b)c.drawImage(base,0,0);
		// Where to go next for each favour under way: a little star.
		for(const m of marks){
			const mx=X(m.x),mz=Z(m.z);
			c.fillStyle='#ffcf5a';c.strokeStyle='#5a3b2e';c.lineWidth=1.5;c.beginPath();
			for(let i=0;i<10;i++){const r=i%2?4:9,a=-Math.PI/2+i*Math.PI/5;c.lineTo(mx+Math.cos(a)*r,mz+Math.sin(a)*r);}
			c.closePath();c.fill();c.stroke();
		}
		c.fillStyle='#fff';c.strokeStyle='#995366';c.lineWidth=3;
		c.beginPath();c.arc(X(x),Z(z),7,0,Math.PI*2);c.fill();c.stroke();
	};
	return {panel,close,update,notebook};
}
