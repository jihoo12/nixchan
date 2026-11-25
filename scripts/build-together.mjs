import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const source=join(root,'.game-dist'), dist=join(root,'dist');
await rm(source,{recursive:true,force:true});
execFileSync(process.execPath,[join(root,'node_modules/astro/bin/astro.mjs'),'build','--outDir','.game-dist'],{cwd:root,stdio:'inherit',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'}});
const assets = Object.create(null);
async function walk(dir) {
 for(const d of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const p=join(dir,d.name);
  if(d.isDirectory()) await walk(p);
  else {
   const key='/'+relative(source,p).split('/').join('/');
   if(key==='/trailer.mp4') continue; // linked to the unchanged public copy by the worker
   const raw=await readFile(p), gzip=gzipSync(raw,{level:9});
   const pack=gzip.length+16<raw.length;
   assets[key]=[pack,(pack?gzip:raw).toString('base64')];
  }
 }
}
await walk(source);
await rm(dist,{recursive:true,force:true});
await mkdir(join(dist,'server'),{recursive:true});
await mkdir(join(dist,'.openai'),{recursive:true});
const entry=await readFile(join(root,'worker/entry.js'),'utf-8');
await writeFile(join(dist,'server/index.js'),entry+'\nexport default createWorker('+JSON.stringify(assets)+');\n');
await cp(join(root,'.openai/hosting.json'),join(dist,'.openai/hosting.json'));
await cp(join(root,'drizzle'),join(dist,'.openai/drizzle'),{recursive:true});
console.log('Bundled '+Object.keys(assets).length+' Island assets.');
