import * as THREE from 'three';

/** Full-size, axis-aligned bounds. Floors and overhead decoration are not obstacles. */
export type Block = { x: number; z: number; w: number; d: number; bottom: number; top: number };

/** Original procedural school artwork. No external assets or shaders. */
export function buildSchool(scene: THREE.Scene): Block[] {
  const blocks: Block[] = [];
  const group = new THREE.Group();
  group.name = 'Sakura school — open-roof interior';
  scene.add(group);
  const colors = {
    plaster: 0xf4e4cb, trim: 0xe9d0ad, brick: 0xc98970, dark: 0x475d5b,
    roof: 0x688786, wood: 0xc9955e, edge: 0x976b46, steel: 0x7d8887,
    glass: 0xa6d5d8, board: 0x3d6557, white: 0xfff9e9, green: 0x8cae80,
    pink: 0xe7a1a1, blue: 0x7fabc3, gold: 0xdab56b, paper: 0xfaf0d6,
  };
  type Color = keyof typeof colors;
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key,
    new THREE.MeshStandardMaterial({ color, roughness: .85 })])) as Record<Color, THREE.MeshStandardMaterial>;
  const batches = new Map<Color, THREE.Matrix4[]>();
  const transform = new THREE.Object3D();
  function box(x: number, y: number, z: number, w: number, h: number, d: number, color: Color, solid = false) {
    transform.position.set(x, y, z); transform.rotation.set(0, 0, 0); transform.scale.set(w, h, d); transform.updateMatrix();
    const batch = batches.get(color) ?? []; batch.push(transform.matrix.clone()); batches.set(color, batch);
    if (solid) blocks.push({ x, z, w, d, bottom: y - h / 2, top: y + h / 2 });
  }
  function text(label: string, x: number, y: number, z: number, w: number, h: number,
    color = '#425954', background = '#fff6e4', rotation = 0) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = Math.max(96, Math.round(768 * h / w));
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color; ctx.font = `600 ${Math.floor(canvas.height * .46)}px "Malgun Gothic",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 384, canvas.height * .52, 720);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: .9 }));
    mesh.position.set(x, y, z); mesh.rotation.y = rotation; group.add(mesh);
  }
  // Thin inset floor: the caller owns the walkable surface at y=0.
  box(0, .01, -6, 20, .02, 12, 'trim');
  box(-5, .021, -7.5, 9.65, .006, 8.65, 'wood');
  box(5, .021, -7.5, 9.65, .006, 8.65, 'paper');
  for (let z = -11.8; z < -.2; z += .6) box(0, .024, z, 19.6, .002, .015, 'trim');
  // Main facade. The central three-metre doorway is completely open.
  box(-5.75, 1.7, 0, 8.5, 3.4, .24, 'plaster', true);
  box(5.75, 1.7, 0, 8.5, 3.4, .24, 'plaster', true);
  box(0, 3.1, 0, 3, .6, .24, 'plaster', true);
  for (const x of [-1.56, 1.56]) box(x, 1.4, .06, .12, 2.8, .36, 'dark', true);
  box(0, 2.81, .06, 3.24, .14, .36, 'dark');
  box(0, 3.65, -.3, 4.5, .18, 1.6, 'roof');
  text('벚꽃학교', 0, 3.23, .145, 2.55, .38);
  text('SAKURA SCHOOL', 0, 3.49, .5, 2.5, .16, '#fff7e7', '#688786');
  // Painted facade window bands and brick plinths.
  for (const x of [-7.4, -4.1, 4.1, 7.4]) {
    box(x, 1.83, .145, 2.65, 1.45, .05, 'dark');
    box(x, 1.83, .18, 2.47, 1.28, .025, 'glass');
    box(x, 1.83, .205, .065, 1.3, .04, 'white');
    box(x, 1.83, .205, 2.5, .065, .04, 'white');
    box(x, 1.06, .21, 2.85, .12, .3, 'trim');
  }
  for (const x of [-5.75, 5.75]) box(x, .23, .14, 8.5, .46, .05, 'brick');
  // Side windows have real openings between sill, piers and lintel.
  for (const x of [-9.9, 9.9]) {
    box(x, .53, -6, .2, 1.06, 12, 'plaster', true);
    box(x, 3.05, -6, .2, .7, 12, 'plaster', true);
    for (const z of [-1.5, -4.5, -7.5, -10.5]) {
      box(x, 1.88, z, .08, 1.65, 2.62, 'glass', true);
      box(x, 1.88, z, .15, 1.7, .065, 'white');
      box(x, 1.88, z, .15, .07, 2.72, 'white');
      box(x, 1.07, z, .44, .1, 2.8, 'trim');
      // Interior curtain ties at the window edges.
      for (const dz of [-1.22, 1.22]) box(x + (x < 0 ? .15 : -.15), 2.05, z + dz, .12, 1.36, .22, 'paper');
    }
    for (const z of [0, -3, -6, -9, -12]) box(x, 1.7, z, .24, 3.4, .24, 'plaster', true);
  }
  box(0, 1.7, -11.9, 20, 3.4, .2, 'plaster', true);
  // Corridor z=-3..0. Classroom doorway x=-6, clear opening [-6.9,-5.1].
  box(-8.4, 1.6, -3, 3, 3.2, .16, 'plaster', true);
  box(-2.55, 1.6, -3, 5.1, 3.2, .16, 'plaster', true);
  box(-6, 2.96, -3, 1.8, .48, .16, 'plaster', true);
  for (const x of [-6.95, -5.05]) box(x, 1.35, -2.98, .08, 2.7, .22, 'edge');
  text('1학년 1반', -6, 2.99, -2.9, 1.48, .3);
  // Central divider. East reading room entrance x=5.5, width 2 metres.
  box(0, 1.6, -7.5, .18, 3.2, 9, 'plaster', true);
  box(2.25, 1.6, -3, 4.5, 3.2, .16, 'plaster', true);
  box(8.25, 1.6, -3, 3.5, 3.2, .16, 'plaster', true);
  box(5.5, 2.96, -3, 2, .48, .16, 'plaster', true);
  text('햇살 도서실', 5.5, 2.99, -2.9, 1.7, .3);
  // No full ceiling or roof: a deliberate dollhouse cutaway keeps cameras clear.
  for (const x of [-10.1, 10.1]) box(x, 3.5, -6, .7, .18, 12.8, 'roof');
  for (const z of [.16, -12.1]) box(0, 3.5, z, 20.8, .18, .65, 'roof');
  for (const x of [-8.4, -3.9, 3.9, 8.4]) box(x, 3.36, -.05, .15, .16, .8, 'edge');
  // Two desk banks leave a broad central aisle directly behind the classroom door.
  for (const x of [-8.1, -3]) for (const z of [-5, -7.75, -10.5]) {
    box(x, .77, z, 1.2, .1, .72, 'wood');
    blocks.push({ x, z, w: 1.2, d: .72, bottom: 0, top: .82 });
    box(x, .61, z, 1.02, .12, .5, 'steel');
    for (const dx of [-.48, .48]) for (const dz of [-.25, .25]) box(x+dx, .36, z+dz, .055, .72, .055, 'steel');
    const cz = z + .83;
    box(x, .44, cz, .58, .08, .55, 'wood');
    box(x, .78, cz+.23, .58, .48, .07, 'wood');
    blocks.push({ x, z: cz, w: .58, d: .62, bottom: 0, top: 1.02 });
    for (const dx of [-.23,.23]) for (const dz of [-.2,.2]) box(x+dx, .22, cz+dz, .045, .44, .045, 'steel');
    box(x-.15, .835, z, .38, .025, .29, x < -5 ? 'blue' : 'pink');
    box(x-.15, .85, z, .33, .008, .25, 'paper');
    box(x+.3, .833, z+.02, .15, .025, .04, 'gold');
  }
  // Chalkboard at the rear, visible from every desk and the central aisle.
  box(-5.5, 1.87, -11.73, 5.8, 1.5, .12, 'edge');
  box(-5.5, 1.87, -11.65, 5.58, 1.28, .04, 'board');
  text('오늘도 반가워요!', -5.5, 2.12, -11.62, 4.9, .4, '#f4f1d8', '#3d6557');
  text('집에 가는 길에 봄을 한 가지 찾아오기.', -5.5, 1.67, -11.62, 4.7, .22, '#dfe9cf', '#3d6557');
  box(-5.5, 1.12, -11.57, 5.9, .08, .25, 'edge');
  for (const x of [-6,-5.7,-5.4]) box(x, 1.18, -11.51, .16, .03, .04, 'white');
  box(-4.5, 1.2, -11.5, .25, .09, .13, 'steel');
  // Quiet corner lockers, west-wall timetable, noticeboard in the corridor.
  for (let i=0;i<4;i++) {
    const x=.6+i*.64;
    box(x, .72, -1.35, .59, 1.44, .46, i%2 ? 'green' : 'blue', true);
    box(x, .72, -1.105, .025, 1.32, .03, 'white');
    box(x+.14, .82, -1.09, .05, .12, .04, 'gold');
    for (let n=0;n<3;n++) box(x, 1.2+n*.055, -1.105, .25, .014, .012, 'dark');
  }
  box(-3.05, 1.8, -2.89, 2.55, 1.05, .08, 'edge');
  box(-3.05, 1.8, -2.84, 2.4, .92, .025, 'gold');
  for (const [i, title] of ['우리 반 소식','도서실 안내','오늘의 약속'].entries()) {
    const x=-3.85+i*.8;
    text(title,x,1.87,-2.82,.65,.26,'#5b6857',i===1?'#e6edcc':'#fff5dc');
    box(x, 1.56, -2.815, .59, .23, .012, 'paper');
    box(x, 2.17, -2.805, .08, .06, .02, 'pink');
  }
  text('시간표', -9.76, 2.1, -4.4, 1,.35, '#44594f','#fff5dd',Math.PI/2);
  // Clock: warm cream dial and clearly readable 3:30 hands.
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,.055,32), materials.dark);
  clock.rotation.x=Math.PI/2;clock.position.set(-1.15,2.5,-11.73);group.add(clock);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(.235,32),materials.white);
  dial.position.set(-1.15,2.5,-11.69);group.add(dial);
  box(-1.15,2.405,-11.675,.02,.19,.012,'dark');
  box(-1.07,2.48,-11.67,.17,.02,.012,'dark');
  for (const [dx,dy] of [[0,.19],[.19,0],[0,-.19],[-.19,0]]) box(-1.15+dx,2.5+dy,-11.675,.025,.025,.01,'gold');
  // Reading room: low bookcases along the back, a shared table and soft benches.
  for (const x of [2,4,6,8]) {
    box(x,.78,-11.25,1.75,1.56,.58,'wood',true);
    for (const y of [.16,.67,1.18]) {
      box(x,y,-10.93,1.62,.07,.48,'edge');
      for (let i=0;i<7;i++) box(x-.65+i*.2,y+.2,-10.94,.13,.31+(i%3)*.04,.25,(['blue','pink','green','paper'] as Color[])[i%4]);
    }
  }
  box(5.5,.74,-7.7,3,.12,1.35,'wood');
  blocks.push({x:5.5,z:-7.7,w:3,d:1.35,bottom:0,top:.8});
  for(const x of [4.3,6.7]) for(const z of [-8.15,-7.25]) box(x,.34,z,.1,.68,.1,'edge');
  for(const z of [-9,-6.4]) {
    box(5.5,.43,z,2.7,.18,.55,'green');
    blocks.push({x:5.5,z,w:2.7,d:.55,bottom:0,top:.52});
    for(const x of [4.5,6.5]) box(x,.18,z,.13,.36,.4,'edge');
  }
  for(const x of [4.7,5.7,6.3]) box(x,.82,-7.7,.45,.035,.34,'paper');
  text('책 속으로 작은 여행',5.5,2.3,-11.77,4,.42);
  // Pots are tucked away, not in either doorway or the circulation routes.
  for(const [x,z] of [[-9.3,-1.2],[9.2,-4.2]]) {
    box(x,.25,z,.42,.5,.42,'brick',true);
    box(x,.65,z,.06,.7,.06,'edge');
    for (const [dx,dy,dz] of [[0,.94,0],[-.18,.83,.04],[.17,.78,-.08]]) {
      const leaf=new THREE.Mesh(new THREE.SphereGeometry(.27,8,6),materials.green);
      leaf.position.set(x+dx,dy,z+dz);leaf.scale.set(1,.75,.85);group.add(leaf);
    }
  }
  // Repeated rectangular props are batched by material (one draw per palette colour).
  const geometry = new THREE.BoxGeometry(1,1,1);
  for(const [color,matrices] of batches) {
    const mesh=new THREE.InstancedMesh(geometry,materials[color],matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
  }
  return blocks;
}
