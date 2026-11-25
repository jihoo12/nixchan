const KEYS = new Set('bag garden fishBook pebbleMet places map helpSeen skyChest skyCrystals forge ore machines blocks power owl feather tortoise outfit house monoShards monoMarks monoHelpSeen monoVeins monoCarried monoSeeds'.split(' '));
const VISIBLE = 12000, LIMIT = 524288;
const poses = new Set(['Idle','Walk','Run','Swim','Tread']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json = (body, status = 200) => Response.json(body, { status, headers:{'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff'} });
const idError = () => json({error:'sign_in_required'},401);

async function body(request, max) {
 if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw 415;
 if (Number(request.headers.get('content-length')) > max) throw 413;
 const reader = request.body?.getReader();
 if (!reader) throw 400;
 const decoder = new TextDecoder('utf-8',{fatal:true});
 let size=0, str='';
 try {
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>max){await reader.cancel();throw 413;}
   str+=decoder.decode(value,{stream:true});
  }
  return JSON.parse(str+decoder.decode());
 } catch(e){throw e===413?413:400;}
}
function writeAllowed(req,url) {
 const origin=req.headers.get('origin');
 return (!origin || origin===url.origin) && !['cross-site','same-site'].includes(req.headers.get('sec-fetch-site'));
}
const mime = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml',glb:'model/gltf-binary',json:'application/json',png:'image/png',jpg:'image/jpeg',webp:'image/webp',avif:'image/avif',woff2:'font/woff2',xml:'application/xml',ico:'image/x-icon',txt:'text/plain; charset=utf-8'};
const isPos = (n,m) => typeof n==='number' && Number.isFinite(n) && Math.abs(n)<=m;
async function peerKey(owner,id){
 const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner+'\0'+id));
 return Array.from(new Uint8Array(h).slice(0,12),b=>b.toString(16).padStart(2,'0')).join('');
}
async function api(request,url,env,owner) {
 if(!owner || owner.length>256)return idError();
 const db=env.DB;
 if(!db)return json({error:'storage_unavailable'},503);
 const get=request.method==='GET', put=request.method==='PUT', post=request.method==='POST';
 if(!get && !writeAllowed(request,url))return json({error:'forbidden_origin'},403);
 try{
  if(url.pathname==='/together-api/save' && get){
   const row=await db.prepare('SELECT version,payload FROM island_saves WHERE owner=?').bind(owner).first();
   const scope=await peerKey(owner,'save-scope');
   return json(row?{scope,version:row.version,values:JSON.parse(row.payload)}:{scope,version:0,values:{}});
  }
  if(url.pathname==='/together-api/save' && put){
   const msg=await body(request,LIMIT);
   if(!msg || !Number.isSafeInteger(msg.version) || msg.version<0 || msg.version>=2**31-1 || typeof msg.writeId!=='string' || !UUID.test(msg.writeId)
      || !msg.values || typeof msg.values!=='object' || Array.isArray(msg.values)
      || !Object.entries(msg.values).every(([k,v])=>KEYS.has(k)&&typeof v==='string'))return json({error:'bad_save'},400);
   if(msg.scope!==await peerKey(owner,'save-scope'))return json({error:'account_changed'},409);
   const payload=JSON.stringify(msg.values);
   const version=msg.version+1;
   const guarded=msg.version===0
    ? db.prepare('INSERT INTO island_saves(owner,version,payload,write_id) VALUES(?,?,?,?) ON CONFLICT(owner) DO NOTHING').bind(owner,version,payload,msg.writeId)
    : db.prepare('UPDATE island_saves SET version=?,payload=?,write_id=? WHERE owner=? AND version=?').bind(version,payload,msg.writeId,owner,msg.version);
   const r=await guarded.run();
   if(r.meta.changes===1)return json({version});
   // Safe retry if the original commit succeeded but the browser did not receive the reply.
   const current=await db.prepare('SELECT version,write_id,payload FROM island_saves WHERE owner=?').bind(owner).first();
   if(current?.version===version && current.write_id===msg.writeId && current.payload===payload)return json({version});
   return json({error:'save_conflict'},409);
  }
  if(url.pathname==='/together-api/players' && post){
   const p=await body(request,1024);
   if(!p || typeof p.id!=='string' || !UUID.test(p.id))return json({error:'bad_player'},400);
   if(p.leave===true){
    await db.prepare('DELETE FROM island_presence WHERE owner=? AND session=?').bind(owner,p.id).run();
    return json({peers:[]});
   }
   if(!isPos(p.x,2000)||!isPos(p.y,2000)||!isPos(p.z,2000)||!isPos(p.yaw,Math.PI+0.0001)||!poses.has(p.pose))
    return json({error:'bad_pose'},400);
   const now=Date.now(), cutoff=now-VISIBLE;
   const write=db.prepare(`INSERT INTO island_presence (owner,session,seen,x,y,z,yaw,pose)
    SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM island_presence WHERE seen>=?)<6
    OR EXISTS (SELECT 1 FROM island_presence WHERE owner=? AND session=? AND seen>=?)
    ON CONFLICT(owner,session) DO UPDATE SET seen=excluded.seen,x=excluded.x,y=excluded.y,z=excluded.z,yaw=excluded.yaw,pose=excluded.pose
    WHERE island_presence.seen<=?`).bind(owner,p.id,now,p.x,p.y,p.z,p.yaw,p.pose,cutoff,owner,p.id,cutoff,now-600);
   const queries=[write,
    db.prepare('SELECT 1 AS active FROM island_presence WHERE owner=? AND session=? AND seen>=?').bind(owner,p.id,cutoff),
    db.prepare('SELECT owner,session,x,y,z,yaw,pose FROM island_presence WHERE seen>=? AND NOT(owner=? AND session=?) ORDER BY seen DESC LIMIT 5').bind(cutoff,owner,p.id)];
   await db.prepare('DELETE FROM island_presence WHERE seen<?').bind(cutoff).run();
   const [ , admitted, rows ]=await db.batch(queries);
   if(!admitted.results.length)return json({error:'room_full'},429);
   const peers=await Promise.all(rows.results.map(async({owner,session,...p})=>({id:await peerKey(owner,session),...p})));
   return json({peers});
  }
  return json({error:'not_found'},404);
 }catch(e){
  if(typeof e==='number')return json({error:'invalid_request'},e);
  console.error('Island data operation failed',url.pathname,e?.name ?? 'Error');
  return json({error:'storage_unavailable'},503);
 }
}
function signInPage(url, method, acceptLanguage) {
 const lang=url.searchParams.get('lang');
 const ko=lang==='ko'||(lang!=='en'&&(acceptLanguage??'').toLowerCase().startsWith('ko'));
 const path=/^\/(?![\/\\])/.test(url.pathname)?url.pathname+url.search:'/island/';
 const signIn='/signin-with-chatgpt?return_to='+encodeURIComponent(path);
 const title=ko?'닉스쨩의 섬: 함께 걷기':'Nixchan Island: Walk Together';
 const copy=ko?'ChatGPT로 로그인하면 친구와 섬을 걷고, 내 진행 상황을 서버에 저장할 수 있어요.':'Sign in with ChatGPT to explore the island with friends and save your own progress.';
 const action=ko?'ChatGPT로 로그인':'Sign in with ChatGPT';
 return new Response(method==='HEAD'?null:`<!doctype html>
<html lang="${ko?'ko':'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:1.5rem;font:1rem/1.6 system-ui,sans-serif;color:#e9fcf4;background:radial-gradient(ellipse at 28% 12%,#19564d,#092624 70%)}
main{width:min(100%,30rem);padding:clamp(1.5rem,6vw,3rem);border:1px solid #6caa9350;border-radius:1.25rem;background:#0e302c}
span{font-size:2rem}h1{margin:.45rem 0 0;font-size:clamp(1.45rem,6vw,2rem);line-height:1.3}p{margin:.75rem 0 1.5rem;color:#c5e8dc}a{display:inline-flex;align-items:center;min-height:48px;padding:.65rem 1rem;border-radius:.6rem;background:#b4f7d6;color:#092c23;text-decoration:none;font-weight:700}a:focus-visible{outline:3px solid #fff;outline-offset:4px}
</style></head><body><main><span aria-hidden="true">🌴</span><h1>${title}</h1><p>${copy}</p>
<a href="${signIn}" target="_top">${action}</a></main></body></html>`,{
  headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
   'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self' https://chatgpt.com; base-uri 'none'; form-action 'none'"}
 });
}
export function createWorker(assets){
 return {async fetch(request,env){
  const url=new URL(request.url);
  const owner=request.headers.get('oai-authenticated-user-id');
  if(url.pathname.startsWith('/together-api/'))return api(request,url,env,owner);
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405});
  if(url.pathname==='/')return Response.redirect(new URL('/island/'+url.search,url),302);
  const path=url.pathname, key=Object.hasOwn(assets,path)?path:path+(path.endsWith('/')?'index.html':'/index.html');
  if(!owner || owner.length>256){
   if(key.endsWith('.html')&&Object.hasOwn(assets,key))return signInPage(url,request.method,request.headers.get('accept-language'));
   return idError();
  }
  if(path==='/trailer.mp4')return Response.redirect('https://jihoo12.github.io/nixchan/trailer.mp4',302);
  if(!Object.hasOwn(assets,key))return new Response('Not found',{status:404});
  const [packed,encoded]=assets[key], ext=key.split('.').at(-1);
  const headers={'Content-Type':mime[ext]??'application/octet-stream','Cache-Control':key.startsWith('/_astro/')?'private, max-age=31536000, immutable':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
  if(ext==='html')headers['Content-Security-Policy']="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self' https://jihoo12.github.io; worker-src 'self' blob:; frame-ancestors 'self' https://chatgpt.com; object-src 'none'; base-uri 'self'";
  const bytes=request.method==='HEAD'?null:Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const stream=packed&&bytes?new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')):bytes;
  return new Response(stream,{headers});
 }};
}
