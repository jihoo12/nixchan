import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {createWorker} from '../worker/entry.js';

const sql=await readFile(new URL('../drizzle/0000_together.sql',import.meta.url),'utf8');
const origin='https://island.test';
const save='/together-api/save', players='/together-api/players';
function setup(worker=createWorker({})){
 const db=new DatabaseSync(':memory:');
 db.exec(sql);
 const wrap={prepare(q){
   function bound(params){return {
    first:async()=>db.prepare(q).get(...params)??null,
    all:async()=>({results:db.prepare(q).all(...params)}),
    run:async()=>({meta:db.prepare(q).run(...params)}),
    sync:()=>q.startsWith('SELECT')?{results:db.prepare(q).all(...params)}:{meta:db.prepare(q).run(...params)}
   };}
   return {bind:(...v)=>bound(v),...bound([])};
 },batch:async queries=>{
   db.exec('BEGIN');
   try{const result=queries.map(q=>q.sync());db.exec('COMMIT');return result;}
   catch(e){db.exec('ROLLBACK');throw e;}
 }};
 const send=(route,{user='A',method='GET',data,headers={}}={})=>{
  const h={...headers};
  if(user)h['oai-authenticated-user-id']=user;
  if(data!==undefined)h['content-type']='application/json';
  const payload=data===undefined?undefined:JSON.stringify(data);
  return worker.fetch(new Request(origin+route,{method,headers:h,body:payload}),{DB:wrap});
 };
 return {send,db};
}
const scope=id=>createHash('sha256').update(id+'\0save-scope').digest('hex').slice(0,24);
const put=(version,values,writeId=randomUUID())=>({method:'PUT',data:{scope:scope('A'),version,values,writeId}});
const pose=(id,x=1)=>({id,x,y:2,z:3,yaw:0,pose:'Walk'});
const post=(user,data)=>({user,method:'POST',data});
test('no actor header cannot read or write private game data',async()=>{
 const {send}=setup();
 assert.equal((await send(save,{user:null})).status,401);
 assert.equal((await send(save,{...put(0,{bag:'[]'}),user:null})).status,401);
 assert.equal((await send(players,post(null,pose(randomUUID())))).status,401);
});
test('cloud progress survives a fresh session, is account scoped, and uses compare-and-swap',async()=>{
 const {send}=setup();
 assert.deepEqual(await (await send(save)).json(),{scope:scope('A'),version:0,values:{}});
 const first=put(0,{bag:'[{"id":"carrot","count":2}]',garden:'{"plot":1}'});
 assert.deepEqual(await (await send(save,first)).json(),{version:1});
 assert.deepEqual(await (await send(save,first)).json(),{version:1});
 assert.deepEqual(await (await send(save)).json(),{scope:scope('A'),version:1,values:first.data.values});
 assert.deepEqual(await (await send(save,{user:'B'})).json(),{scope:scope('B'),version:0,values:{}});
 assert.equal((await send(save,{...put(0,{bag:'[]'}),user:'B'})).status,409);
 const second=put(1,{bag:'[]',garden:'{}'});
 assert.equal((await send(save,second)).status,200);
 assert.equal((await send(save,put(1,{bag:'[7]'}))).status,409);
 assert.equal((await send(save,put(0,{bag:'[9]'}))).status,409);
 assert.deepEqual(await (await send(save)).json(),{scope:scope('A'),version:2,values:second.data.values});
});
test('save validation rejects unknown keys, oversized input, and cross-origin changes',async()=>{
 const {send}=setup();
 assert.equal((await send(save,put(0,{wrong:'[]'}))).status,400);
 assert.equal((await send(save,put(0,{bag:'x'.repeat(524388)}))).status,413);
 assert.equal((await send(save,{...put(0,{bag:'[]'}),headers:{origin:'https://other.test'}})).status,403);
});
test('two signed-in sessions exchange only poses; leaving and expiry are visible',async()=>{
 const {send,db}=setup(), a=randomUUID(), b=randomUUID(), tab=randomUUID();
 assert.deepEqual(await (await send(players,post('A',pose(a)))).json(),{peers:[]});
 const fromB=(await (await send(players,post('B',pose(b,12)))).json()).peers;
 assert.deepEqual(fromB.map(p=>[p.x,p.y,p.z,p.pose]),[[1,2,3,'Walk']]);
 assert.equal(typeof fromB[0].id,'string');
 assert.notEqual(fromB[0].id,a);
 assert.equal(fromB[0].owner,undefined);
 const sameAccount=(await (await send(players,post('A',pose(tab,20)))).json()).peers;
 assert.deepEqual(sameAccount.map(p=>p.x).sort((a,b)=>a-b),[1,12]);
 await send(players,post('B',{id:b,leave:true}));
 db.prepare('UPDATE island_presence SET seen=? WHERE session=?').run(Date.now()-13000,tab);
 assert.deepEqual(await (await send(players,post('A',pose(a)))).json(),{peers:[]});
});
test('seventh participant is rejected, existing participants can still poll',async()=>{
 const {send}=setup(), a=randomUUID();
 for(let i=0;i<6;i++)assert.equal((await send(players,post('A',pose(i===0?a:randomUUID())))).status,200);
 assert.equal((await send(players,post('A',pose(randomUUID())))).status,429);
 assert.equal((await send(players,post('A',pose(a)))).status,200);
 assert.equal((await send(players,post('A',{...pose(a),pose:'bad'}))).status,400);
});
test('built anonymous visitor sees a top-level ChatGPT sign-in link instead of a JSON error',async()=>{
 const {default:worker}=await import('../dist/server/index.js');
 const {send}=setup(worker);
 const guest={user:null};
 assert.equal((await send('/?lang=ko',guest)).headers.get('location'),origin+'/island/?lang=ko');
 const page=await send('/island/?lang=ko&x=%22%3Cscript%3E',guest);
 assert.equal(page.status,200);
 assert.match(page.headers.get('content-type'),/^text\/html/);
 assert.equal(page.headers.get('cache-control'),'private, no-store');
 const html=await page.text();
 assert.match(html,/ChatGPT로 로그인/);
 const href=html.match(/href="([^"]+)" target="_top"/)?.[1];
 const login=new URL(href,origin);
 assert.equal(login.pathname,'/signin-with-chatgpt');
 assert.equal(login.searchParams.get('return_to'),'/island/?lang=ko&x=%22%3Cscript%3E');
 assert.doesNotMatch(html,/data-stage|<script/);
 assert.match(await (await send('/island/?lang=en',guest)).text(),/Sign in with ChatGPT/);
 assert.equal((await send('/island/?lang=ko',{...guest,method:'HEAD'})).status,200);
 const signed=await (await send('/island/')).text();
 const model=signed.match(/data-model="([^"]+)"/)?.[1];
 assert.ok(model);
 assert.equal((await send(model,guest)).status,401);
});
test('built signed-in route includes responsive game, scripts and actual Nixchan GLB',async()=>{
 const {default:worker}=await import('../dist/server/index.js');
 const {send}=setup(worker);
 assert.equal((await send('/?lang=ko')).headers.get('location'),origin+'/island/?lang=ko');
 const html=await (await send('/island/?lang=ko')).text();
 for(const item of ['viewport-fit=cover','data-coop','data-stage','data-build-toggle'])assert.ok(html.includes(item),item);
 const model=html.match(/data-model="([^"]+)"/)?.[1], script=html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
 assert.ok(model&&script);
 const glb=await send(model);
 assert.equal(glb.headers.get('content-type'),'model/gltf-binary');
 assert.equal(new TextDecoder().decode((await glb.arrayBuffer()).slice(0,4)),'glTF');
 assert.equal((await send(script)).status,200);
 for(const p of ['/home/','/monochrome/','/experimental/'])assert.equal((await send(p)).status,200);
});
