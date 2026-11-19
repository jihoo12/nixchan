#!/usr/bin/env node
/** Local-only Nixkit MCP transport. Never loads credentials or changes game saves itself. */
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const GAME='third-voice', BASE='/nixchan/', HTTP_PREFIX='/__nixkit/';
const bytes=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=(x,max=500)=>typeof x==='string'?x.slice(0,max):'';
const exact=(obj,keys)=>object(obj)&&Object.keys(obj).every(k=>keys.includes(k));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const failure=code=>Object.assign(Error(code),{safeCode:code});
export const TOOL_DEFINITIONS=[
 {name:'nixkit_observe',description:'Observe the explicitly paired local The Third Voice game. Only player-visible bounded game state is returned.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'nixkit_move',description:'Move relative to the current camera, forward/right from -1 to 1, for at most 2000ms. Does not teleport or alter saves directly.',inputSchema:{type:'object',properties:{forward:{type:'number',minimum:-1,maximum:1},right:{type:'number',minimum:-1,maximum:1},durationMs:{type:'integer',minimum:1,maximum:2000}},required:['forward','right','durationMs'],additionalProperties:false}},
 {name:'nixkit_interact',description:'Use only the currently visible interaction.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'nixkit_choose',description:'Choose a currently visible dialogue choice by its exact ID.',inputSchema:{type:'object',properties:{choiceId:{type:'string',minLength:1,maxLength:100}},required:['choiceId'],additionalProperties:false}},
 {name:'nixkit_stop',description:'Stop queued commands and request the paired browser to release movement. Browser also has an independent movement watchdog.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
];
export function validateTool(name,args={}) {
 if(!TOOL_DEFINITIONS.some(t=>t.name===name))throw failure('UNKNOWN_TOOL');
 if(name==='nixkit_move') {if(!exact(args,['forward','right','durationMs'])||!finite(args.forward)||!finite(args.right)||Math.abs(args.forward)>1||Math.abs(args.right)>1||!Number.isInteger(args.durationMs)||args.durationMs<1||args.durationMs>2000)throw failure('INVALID_MOVE');}
 else if(name==='nixkit_choose') {if(!exact(args,['choiceId'])||typeof args.choiceId!=='string'||!args.choiceId.length||args.choiceId.length>100)throw failure('INVALID_CHOICE');}
 else if(!exact(args,[]))throw failure('INVALID_ARGUMENTS');
 return {type:name.slice(7),args:structuredClone(args)};
}
// Explicit allowlist. Never forward arbitrary browser objects, HTML, URLs, saves or diagnostics.
export function sanitizeSnapshot(value) {
 if(!object(value)||value.game!==GAME)throw failure('WRONG_GAME');
 const out={game:GAME,ready:value.ready===true,paused:value.paused===true};
 if(object(value.position)&&['x','y','z'].every(k=>finite(value.position[k])))out.position=Object.fromEntries(['x','y','z'].map(k=>[k,value.position[k]]));
 out.nearbyAction=typeof value.nearbyAction==='string'?text(value.nearbyAction):null;
 out.dialogue=object(value.dialogue)?{speaker:text(value.dialogue.speaker,120),text:text(value.dialogue.text,3000),choices:Array.isArray(value.dialogue.choices)?value.dialogue.choices.slice(0,12).filter(c=>object(c)&&typeof c.id==='string'&&c.id.length<=100).map(c=>({id:c.id,label:text(c.label,300)})):[]}:null;
 out.clues=Array.isArray(value.clues)?value.clues.slice(0,30).filter(c=>typeof c==='string').map(c=>text(c,300)):[];
 if(object(value.navigation)) {
  const vector=v=>object(v)&&finite(v.x)&&finite(v.z)?{x:v.x,z:v.z}:null;
  out.navigation={forward:vector(value.navigation.forward),right:vector(value.navigation.right),landmarks:Array.isArray(value.navigation.landmarks)?value.navigation.landmarks.slice(0,20).filter(l=>object(l)&&[l.dx,l.dz,l.distance].every(finite)&&l.distance>=0&&l.distance<=10).map(l=>({label:text(l.label,120),dx:l.dx,dz:l.dz,distance:l.distance})):[]};
 }
 return out;
}

export async function createNixkitBridge({distDir,port=0,commandTimeoutMs=7000,heartbeatMs=10000}={}) {
 const root=await realpath(distDir??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'));
 const secret=bytes(); let token=null,stopped=true,lastSeen=0,snapshot=null,pending=null,closed=false,origin='';
 function rejectPending(code){if(pending){clearTimeout(pending.timer);pending.reject(failure(code));pending=null;}}
 function stop(){stopped=true;snapshot=null;rejectPending('STOPPED');}
 function send(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
 async function json(req){if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw failure('JSON_REQUIRED');let parts=[],length=0;for await(const part of req){length+=part.length;if(length>32768)throw failure('BODY_TOO_LARGE');parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw failure('INVALID_JSON');}}
 const server=http.createServer(async(req,res)=>{
  try {
   if(req.headers.host!==new URL(origin).host)return send(res,403,{error:'INVALID_HOST'});
   const u=new URL(req.url,origin);
   if(u.pathname.startsWith(HTTP_PREFIX)) {
    if(req.method!=='POST')return send(res,405,{error:'POST_REQUIRED'});
    if(req.headers.origin!==origin)return send(res,403,{error:'INVALID_ORIGIN'});
    const body=await json(req);
    if(u.pathname===HTTP_PREFIX+'pair') {
     if(!exact(body,['secret','game'])||body.game!==GAME||!equal(body.secret,secret))return send(res,403,{error:'PAIRING_DENIED'});
     if(token&&!stopped&&Date.now()-lastSeen<=heartbeatMs)return send(res,409,{error:'ALREADY_PAIRED'});
     rejectPending('SESSION_REPLACED');token=bytes();stopped=false;lastSeen=Date.now();snapshot=null;return send(res,200,{token});
    }
    if(!object(body)||!token||!equal(body.token,token))return send(res,403,{error:'UNAUTHORIZED'});
    if(u.pathname===HTTP_PREFIX+'stop'){if(!exact(body,['token']))throw failure('INVALID_BODY');stop();return send(res,200,{stopped:true});}
    if(u.pathname!==HTTP_PREFIX+'poll')return send(res,404,{error:'NOT_FOUND'});
    if(!exact(body,['token','snapshot','ack']))throw failure('INVALID_BODY');
    // Expired sessions never silently resume after a background tab wakes up.
    if(!stopped&&Date.now()-lastSeen>heartbeatMs)stop();
    lastSeen=Date.now();
    if(stopped)return send(res,200,{command:null,stopped:true});
    snapshot=sanitizeSnapshot(body.snapshot);
    if(body.ack!==undefined){if(!exact(body.ack,['id','ok','error'])||typeof body.ack.id!=='string'||typeof body.ack.ok!=='boolean')throw failure('INVALID_ACK');
     if(pending&&pending.id===body.ack.id&&pending.delivered){const p=pending;pending=null;clearTimeout(p.timer);if(body.ack.ok)p.resolve({ok:true,snapshot});else p.reject(failure('BROWSER_COMMAND_FAILED'));}
    }
    let command=null;if(pending&&!pending.delivered){pending.delivered=true;command={id:pending.id,type:pending.type,args:pending.args};}
    return send(res,200,{command,stopped:false});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'READ_ONLY_STATIC'});
   if(!u.pathname.startsWith(BASE))return send(res,404,{error:'NOT_FOUND'});
   let relative;try{relative=decodeURIComponent(u.pathname.slice(BASE.length));}catch{return send(res,400,{error:'INVALID_PATH'});}
   if(relative.includes('\\')||relative.includes('\0')||relative.split('/').includes('..'))return send(res,403,{error:'INVALID_PATH'});
   // Only the selected game HTML is served. Other games cannot acquire this bridge.
   if(relative===''||relative.endsWith('/')||relative.endsWith('.html')){if(!['play/third-voice/','play/third-voice/index.html'].includes(relative))return send(res,404,{error:'GAME_NOT_ENABLED'});}
   if(relative.endsWith('/'))relative+='index.html';
   const full=await realpath(path.resolve(root,relative));if(!full.startsWith(root+path.sep))return send(res,403,{error:'INVALID_PATH'});
   const info=await stat(full);if(!info.isFile())return send(res,404,{error:'NOT_FOUND'});
   if(path.extname(full)==='.html'&&relative!=='play/third-voice/index.html')return send(res,404,{error:'GAME_NOT_ENABLED'});
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'}[path.extname(full)]??'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:await readFile(full));
  } catch(e){if(!res.headersSent)send(res,e.code==='ENOENT'?404:400,{error:e.safeCode??'REQUEST_REJECTED'});else res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 origin=`http://127.0.0.1:${server.address().port}`;
 const watchdog=setInterval(()=>{if(!stopped&&Date.now()-lastSeen>heartbeatMs)stop();},Math.min(1000,heartbeatMs));watchdog.unref();
 return {origin,pairingUrl:`${origin}/nixchan/play/third-voice/?lang=ko#nixkit=${secret}`,
  async call(name,args){const command=validateTool(name,args);if(command.type==='stop'){stop();return {ok:true,stopped:true,browserRelease:'requested; browser watchdog also expires inputs'};}
   if(!token||stopped)throw failure('NO_PAIRED_TAB');if(Date.now()-lastSeen>heartbeatMs){stop();throw failure('TAB_EXPIRED');}if(pending)throw failure('COMMAND_IN_PROGRESS');
   if(command.type!=='observe'&&(!snapshot||!snapshot.ready))throw failure('GAME_NOT_READY');
   if(['move','interact'].includes(command.type)&&snapshot?.paused)throw failure('GAME_PAUSED');
   if(command.type==='choose'&&!snapshot?.dialogue?.choices?.some(c=>c.id===command.args.choiceId))throw failure('CHOICE_NOT_VISIBLE');
   return new Promise((resolve,reject)=>{pending={...command,id:bytes(),delivered:false,resolve,reject,timer:setTimeout(()=>{stopped=true;snapshot=null;rejectPending('COMMAND_TIMEOUT');},commandTimeoutMs)};});},
  async close(){if(closed)return;closed=true;stop();clearInterval(watchdog);await new Promise(resolve=>server.close(resolve));},
 };
}

export async function startMcp(bridge,transport=new StdioServerTransport()) {
 const server=new Server({name:'nixkit-local',version:'0.1.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:TOOL_DEFINITIONS}));
 server.setRequestHandler(CallToolRequestSchema,async (request,extra)=>{const abort=()=>{void bridge.call('nixkit_stop',{});};extra.signal.addEventListener('abort',abort,{once:true});try{if(extra.signal.aborted)throw failure('CANCELLED');return {content:[{type:'text',text:JSON.stringify(await bridge.call(request.params.name,request.params.arguments??{}))}]};}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:e.safeCode??'COMMAND_REJECTED'})}]};}finally{extra.signal.removeEventListener('abort',abort);}});
 await server.connect(transport);return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const port=Number(process.env.NIXKIT_PORT??0);if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid NIXKIT_PORT');
 const bridge=await createNixkitBridge({distDir:process.env.NIXKIT_DIST,port});
 process.stderr.write(`Nixkit local pairing: ${bridge.pairingUrl}\nOpen this link locally, then explicitly enable AI control. Only The Third Voice is enabled.\n`);
 const mcp=await startMcp(bridge);let stopping=false;
 const shutdown=async()=>{if(stopping)return;stopping=true;await bridge.close();await mcp.close();};
 process.once('SIGINT',()=>shutdown().finally(()=>process.exit(0)));process.once('SIGTERM',()=>shutdown().finally(()=>process.exit(0)));process.stdin.once('end',()=>shutdown());
}
