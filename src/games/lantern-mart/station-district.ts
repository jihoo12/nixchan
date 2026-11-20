import * as THREE from 'three';
import type { TownBlock } from './town-layout';
import { RAIL, RAIL_STOPS } from './rail-shuttle';

/** Lantern Station: a little night-train terminus, with a through waiting room. */
export function buildStationDistrict(scene: THREE.Scene): TownBlock[] {
  const group = new THREE.Group(); group.name = 'Lantern Town / Station'; scene.add(group);
  const blocks: TownBlock[] = [];
  const palette = {
    paving: 0x504c56, pavingEdge: 0x625966, grout: 0x696170, sandstone: 0xdfb786, cornice: 0xa66357,
    bark: 0x624443, enamel: 0x36656a, tile: 0x344952, tileLight: 0x445d65, metal: 0x342f42,
    brass: 0xd39b58, bench: 0x7f4f42, ink: 0x231e30, moss: 0x536e63, paper: 0xffd589,
    warm: 0xffae55, blue: 0x63c4bd, gravel: 0x52525b, steel: 0x918289, white: 0xffebbf,
  };
  type Paint = keyof typeof palette;
  const mats = Object.fromEntries(Object.entries(palette).map(([id,color]) => [id, new THREE.MeshStandardMaterial({
    color, roughness: .84, ...(['paper','warm','blue','white'].includes(id) ? { emissive: color,
      emissiveIntensity: id === 'warm' ? .85 : id === 'blue' ? .32 : .45 } : {}),
  })])) as Record<Paint, THREE.MeshStandardMaterial>;
  const meshes = new Map<Paint, THREE.Matrix4[]>();
  const dummy = new THREE.Object3D();
  function box(x:number,y:number,z:number,w:number,h:number,d:number,m:Paint, solid = false, rx = 0, ry = 0) {
    dummy.position.set(x,y,z); dummy.rotation.set(rx,ry,0); dummy.scale.set(w,h,d); dummy.updateMatrix();
    let batch = meshes.get(m); if (!batch) meshes.set(m, batch = []);
    batch.push(dummy.matrix.clone());
    if (solid) blocks.push({x,z,w,d,bottom:y-h/2,top:y+h/2});
  }
  function sign(label: string, small: string, x:number,y:number,z:number,w:number,h:number, heading = Math.PI, color = '#ffe3a8') {
    const canvas = document.createElement('canvas'); canvas.width=768; canvas.height=256;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#253b40'; ctx.fillRect(0,0,768,256);
    ctx.strokeStyle = '#c89558'; ctx.lineWidth=6; ctx.strokeRect(14,14,740,228); ctx.strokeRect(26,26,716,204);
    ctx.textAlign='center'; ctx.fillStyle=color; ctx.font='700 79px system-ui, sans-serif'; ctx.fillText(label,384,119,690);
    ctx.font='600 34px system-ui, sans-serif'; ctx.fillText(small,384,183,680);
    const map=new THREE.CanvasTexture(canvas); map.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,emissive:'#fff4cc',emissiveMap:map,emissiveIntensity:.38,roughness:1}));
    mesh.position.set(x,y,z); mesh.rotation.y=heading; group.add(mesh);
  }
  function lamp(x:number,z:number,h=3.4) {
    box(x,.14,z,.45,.28,.45,'cornice',true); box(x,h/2,z,.14,h,.14,'metal',true);
    box(x,h,z,.68,.12,.68,'brass'); box(x,h+.27,z,.45,.44,.45,'warm');
    box(x,h+.51,z,.61,.10,.61,'metal'); box(x,h+.61,z,.22,.11,.22,'brass');
    for(const dx of [-.24,.24]) for(const dz of [-.24,.24]) box(x+dx,h+.27,z+dz,.04,.44,.04,'metal');
    box(x,.024,z,1.45,.008,1.45,'pavingEdge');
  }
  function roof(x:number,z:number,y:number,w:number,half:number,pitch=.31) {
    const slant=half/Math.cos(pitch);
    for(const side of [-1,1]) {
      const rx=side*pitch;
      box(x,y,z+side*half/2,w,.20,slant,'tile',false,rx);
      // Thin long ribs and broken horizontal bands give the curved-tile read without many draws.
      const n=Math.floor(w/.46);
      for(let i=0;i<=n;i++) box(x-w/2+.15+i*(w-.3)/n,y+.116,z+side*half/2,.07,.085,slant,'tileLight',false,rx);
      for(let i=1;i<5;i++) {
        const dz=half*(i/5-.5);
        box(x,y+.132-dz*Math.tan(pitch),z+side*(half/2+dz),w,.045,.075,'tileLight',false,rx);
      }
      box(x,y-half/2*Math.tan(pitch),z+side*half,w+.3,.20,.25,'cornice');
    }
    box(x,y+half/2*Math.tan(pitch)+.08,z,w+.35,.20,.30,'tileLight');
  }
  function window(x:number,y:number,z:number,w:number,h:number) {
    box(x,y,z,w+.20,h+.2,.13,'bark'); box(x,y,z-.082,w,h,.065,'paper');
    for(const dx of [-w/3,0,w/3]) box(x+dx,y,z-.125,.07,h,.04,'bark');
    box(x,y,z-.125,w,.075,.04,'bark'); box(x,y-h/2-.08,z-.13,w+.28,.12,.24,'sandstone');
  }
  function bench(x:number,z:number) {
    box(x,.52,z,2.35,.16,.65,'bench',true); box(x,.91,z+.27,2.35,.40,.13,'bench',true);
    for(const dx of [-.91,.91]) box(x+dx,.26,z,.17,.52,.58,'metal',true);
  }
  // Flush civic paths: the cross-town walk at z=39 and eastern branch remain uninterrupted.
  box(32,.016,39,44,.008,3.65,'paving'); box(43,.016,51.9,3.65,.008,26.2,'paving');
  box(32,.016,65,46,.008,3.65,'paving'); box(31,.019,44,23,.009,10.4,'paving');
  box(31,.019,52.2,21.2,.009,19.6,'paving'); box(31,.023,50,20,.006,11,'sandstone');
  for(let x=10;x<=53;x+=1.7) for(const z of [37.3,40.7,63.3,66.7]) box(x,.023,z,.38,.006,.045,'grout');
  for(let z=42;z<=62;z+=1.5) for(const x of [41.3,44.7]) box(x,.023,z,.065,.006,.45,'grout');
  for(let x=21;x<42;x+=1.2) box(x,.025,42.4,.65,.006,.14,'brass');
  // Articulated plaster station with south-facing ticket windows; both center doors stay open.
  for(const z of [44.5,55.5]) {
    for(const x of [24.35,35.65]) {
      box(x,1.85,z,8.7,3.7,.28,'sandstone',true);
      box(x,.40,z,8.7,.8,.33,'cornice'); box(x,3.45,z,8.78,.22,.4,'cornice');
    }
    box(30,3.44,z,2.62,.52,.28,'sandstone');
    for(const x of [28.7,31.3]) box(x,1.58,z,.18,3.16,.44,'bark');
  }
  for(const x of [20,40]) {
    box(x,1.85,50,.28,3.7,11,'sandstone',true);
    box(x,.4,50,.31,.8,11,'cornice'); box(x,3.45,50,.42,.22,11,'cornice');
  }
  for(const x of [22.6,25.9,34.1,37.4]) window(x,2.1,44.31,2.38,1.34);
  for(const x of [23.3,26.2,33.8,36.7]) window(x,2.05,55.24,2.1,1.21);
  for(const x of [20.35,28.62,31.38,39.65]) box(x,1.8,44.20,.26,3.6,.35,'bark',true);
  box(30,.039,44.28,2.55,.04,.68,'brass'); box(30,.039,55.7,2.55,.04,.68,'brass');
  sign('등불역','LANTERN STATION',30,3.47,44.13,3.42,.81);
  sign('밤 기차','NIGHT SERVICE',30,3.49,55.69,3.27,.72,0);
  roof(30,50,4.85,21.2,6.28);
  // Long through-platform extends either side of the existing central canopy.
  box(29.5,.027,58.9,45.5,.014,4.23,'pavingEdge');
  for(let x=7.15;x<51.95;x+=.85) box(x,.056,60.87,.57,.010,.13,'brass');
  for(let x=8;x<=51;x+=1.8) box(x,.041,57.02,.52,.008,.10,'grout');
  for(const x of [19.2,27,36.4,39.8]) box(x,1.31,56.7,.19,2.62,.19,'enamel',true);
  roof(29.5,56.9,2.89,21,1.06,.21);
  sign('1번 승강장','PLATFORM 01',22.2,2.24,56.8,2.35,.56,0);
  bench(23,58.25); bench(37.25,58.25);
  // Interior reading and waiting corners. No furnishings in the x=30 through aisle.
  for(const x of [23,37]) {
    bench(x,51.8);
    box(x,.61,47,2.5,1.22,.8,'bench',true);
    box(x,1.25,47,2.59,.09,.88,'brass');
    box(x-.55,1.40,47,.41,.22,.32,'paper');
    box(x+.48,1.42,47,.30,.28,.29,'enamel');
    box(x+.48,1.58,47,.27,.10,.20,'warm');
  }
  sign('막차  23:55','LAST TRAIN',34.5,2.2,44.69,3.38,.80,0);
  sign('표 사는 곳','TICKETS',24,2.2,44.69,3.12,.80,0);
  for(const x of [25.7,34.3]) {
    box(x,2.92,50,.08,.72,.08,'metal'); box(x,2.56,50,.73,.11,.57,'warm');
    box(x,2.65,50,.83,.12,.64,'brass');
  }
  // The rail bridge and its parallel pedestrian span meet dry land at both ends.
  const bridgeX = -74, bridgeWidth = 40, walkZ = 56.65;
  box(bridgeX,-.112,walkZ,bridgeWidth,.255,3.90,'paving');
  box(bridgeX,-.157,RAIL.z,bridgeWidth,.31,4.04,'tile');
  for (const x of [-92.7,-84.1,-74,-63.9,-55.3]) {
    for (const z of [walkZ,RAIL.z]) {
      box(x,-.26,z,2.03,.27,3.76,'cornice');
      box(x,-.66,z,1.60,.68,2.66,'tileLight');
      box(x,-.96,z,1.93,.18,3.06,'tile');
    }
  }
  for (const z of [walkZ-1.96,walkZ+1.96]) {
    box(bridgeX,.13,z,bridgeWidth,.20,.13,'sandstone');
    box(bridgeX,1.04,z,bridgeWidth,.10,.13,'brass');
    blocks.push({x:bridgeX,z,w:bridgeWidth,d:.14,bottom:0,top:1.1});
    for(let x=-93.4;x<=-54.6;x+=2.28) {
      box(x,.55,z,.15,1.09,.15,'enamel');
      if (Math.round((x+93.4)/2.28)%4===0) box(x,1.15,z,.21,.16,.2,'warm');
    }
  }
  for (const z of [RAIL.z-2.07,RAIL.z+2.07]) {
    box(bridgeX,.33,z,bridgeWidth,.10,.14,'tileLight');
    blocks.push({x:bridgeX,z,w:bridgeWidth,d:.15,bottom:0,top:.58});
    for(let x=-93.5;x<-54;x+=1.65) box(x,.22,z,.10,.45,.11,'steel');
  }
  for(let x=-93.8;x<=-54.1;x+=.9) box(x,.020,walkZ,.025,.006,3.65,'grout');
  // Paved shore approaches steer foot traffic onto the walker span, not the rail deck.
  box(-49,.029,57.0,10,.012,3.12,'pavingEdge');
  box(-111.5,.031,56.65,35,.012,2.85,'pavingEdge');
  for(let x=-125;x<=-96;x+=9.5) lamp(x,54.55,2.6);
  // Flush crossings on the original paths and a permanent end crossing beyond the berthed train.
  box(53.5,.028,61.15,2.35,.009,8.8,'paving');
  const length = RAIL.trackMax - RAIL.trackMin, mid = (RAIL.trackMax + RAIL.trackMin) / 2;
  box(mid,.020,RAIL.z,length,.010,2.75,'gravel');
  for(let x=RAIL.trackMin+.35;x<RAIL.trackMax-.12;x+=.72) box(x,.034,RAIL.z,.29,.012,2.63,'bark');
  for(const z of [61.6,62.82]) box(mid,.051,z,length,.022,.09,'steel');
  for(const center of [0,43,53.5]) {
    for(const dx of [-.87,-.29,.29,.87]) box(center+dx,.046,RAIL.z,.55,.016,2.75,'enamel');
    for(const z of [60.70,63.70]) for(const dx of [-.72,0,.72]) box(center+dx,.057,z,.47,.010,.12,'brass');
  }
  // Moonwater Halt: low far-bank platform runs the length of the train. Shelter remains clear of the boarding mark.
  const west = RAIL_STOPS[1].x, shelter = west-4.425;
  box(west,.035,59.07,46,.025,3.86,'paving');
  box(west,.055,57.18,46,.014,.09,'pavingEdge');
  for(let x=west-22.7;x<west+22.8;x+=.89) box(x,.056,60.87,.66,.012,.14,'brass');
  for(const x of [shelter-1.675,shelter+1.675]) for(const z of [58.72,59.70]) {
    box(x,1.22,z,.14,2.40,.14,'enamel',true);
    box(x,.16,z,.28,.32,.28,'cornice',true);
  }
  box(shelter,1.19,59.70,3.25,1.03,.10,'bark',true);
  box(shelter,1.27,59.63,2.97,.65,.03,'enamel');
  bench(shelter,59.13);
  roof(shelter,59.56,2.49,4.17,1.12,.27);
  box(shelter,2.15,58.57,.51,.13,.28,'warm');
  sign(RAIL_STOPS[1].ko,RAIL_STOPS[1].en.toUpperCase(),shelter,2.02,58.49,3.35,.75);
  sign('물빛시장',RAIL_STOPS[1].en.toUpperCase(),shelter,2.09,60.48,2.80,.64,0);
  for(const x of [west-20,west-11,west+7,west+18]) lamp(x,57.84,2.82);
  // Matching inlaid circles/edges show the unobstructed waiting position at both stops.
  for(const {x} of RAIL_STOPS) {
    box(x,.067,RAIL.platformZ,1.45,.010,.73,'enamel');
    for(const dx of [-.61,.61]) box(x+dx,.075,RAIL.platformZ,.08,.012,.51,'blue');
    box(x,.075,RAIL.platformZ,.53,.012,.08,'paper');
  }
  // The clock tower reads from across town, and serves as an east-side navigation anchor.
  const tx=50,tz=46.7;
  box(tx,.35,tz,3.6,.7,3.5,'cornice',true);
  box(tx,2.8,tz,2.80,4.9,2.80,'sandstone',true);
  box(tx,5.07,tz,3.18,.27,3.18,'cornice');
  box(tx,5.53,tz,2.45,.78,2.45,'ink');
  for(const [dx,dz] of [[-.9,0],[.9,0],[0,-.9],[0,.9]]) box(tx+dx,5.54,tz+dz,dx ? .69 : 1.45,.64,dz ? .69 : 1.45,'warm');
  for(const dx of [-1.16,1.16]) for(const dz of [-1.16,1.16]) box(tx+dx,5.56,tz+dz,.17,.93,.17,'metal');
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.05,1.25,4),mats.enamel);
  cap.rotation.y=Math.PI/4; cap.position.set(tx,6.49,tz); group.add(cap);
  box(tx,7.26,tz,.105,.72,.105,'brass'); box(tx,7.66,tz,.26,.18,.26,'warm');
  const clockGeo=new THREE.CircleGeometry(.63,32);
  for(const side of [-1,1]) {
    const z=tz+side*1.419;
    box(tx,4.18,z,1.55,1.53,.055,'bark');
    const face = new THREE.Mesh(clockGeo,mats.paper); face.position.set(tx,4.18,z+side*.042); face.rotation.y=side<0?Math.PI:0; group.add(face);
    box(tx,4.33,z+side*.052,.082,.38,.037,'metal'); box(tx+.17,4.19,z+side*.062,.43,.068,.036,'metal');
    for(const [dx,dy] of [[0,.52],[0,-.52],[.52,0],[-.52,0]]) box(tx+dx,4.18+dy,z+side*.052,.07,.07,.035,'metal');
  }
  for(const [x,z] of [[16.2,42.7],[39.4,42.5],[19.2,67.4],[46.8,59.2],[48,42.9],[53,47],[40,67.4]]) lamp(x,z);
  sign('등불역 광장','STATION SQUARE',38.4,2.08,37.04,2.75,.66);
  for(const x of [37.35,39.45]) box(x,.96,37.08,.125,1.92,.125,'metal',true);
  for(const [x,z] of [[18,46.4],[19,50.5],[47.5,52.8],[53.6,49.6]]) {
    box(x,.29,z,1.05,.58,1.05,'cornice',true); box(x,.61,z,.9,.17,.9,'moss');
    const plant=new THREE.Mesh(new THREE.IcosahedronGeometry(.49,1),mats.moss);
    plant.scale.set(.91,.67,.91); plant.position.set(x,.87,z); group.add(plant);
  }
  const boxGeo=new THREE.BoxGeometry(1,1,1);
  for(const [paint, matrices] of meshes) {
    const mesh = new THREE.InstancedMesh(boxGeo,mats[paint],matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.instanceMatrix.needsUpdate=true; mesh.receiveShadow=true; group.add(mesh);
  }
  return blocks;
}
