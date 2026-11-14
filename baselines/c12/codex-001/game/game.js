import * as T from './three.module.js';

const step = 1 / 60;
const height = 3.8;
const start = [-5.8, 0, 3.2];
const pads = {lower: [-3.6, 0, 1.9], upper: [-3.6, height, 1.9]};
const controls = [
  {id: 'lower_power', floor: 'lower', x: -0.8, y: 0, z: 3.7},
  {id: 'upper_switch', floor: 'upper', x: -4.9, y: height, z: 3.5}
];
const traps = {
  lower: {x: 0.1, z: -1.2, w: 3.2, d: 2.45},
  upper: {x: 0.1, z: 2, w: 3.2, d: 2.15}
};
const exit = {x: -5.4, z: -3.25, w: 2.1, d: 1.7};
const decks = [
  {id:'lower', x:-1, z:0, w:12, d:10, y:0},
  {id:'upper', x:0.5, z:0, w:15, d:10, y:height},
  {id:'upper', x:11, z:-2.65, w:6, d:2.7, y:height},
  {id:'upper', x:13, z:0, w:2, d:8, y:height}
];
const ramp = {x:8.5,z:2.5,w:7,d:3};
const inside = (x,z,r) => Math.abs(x-r.x)<=r.w/2 && Math.abs(z-r.z)<=r.d/2;
const keys = new Set();
const pressed = new Set();
let state, sequence = 0;
const events = [];
function reset(position, support, attemptId=0, checkpointId=null, lowerPowered=false) {
  state = {
    attemptId, tick:0, avatar:{position:[...position],supportSurface:support},
    checkpoint:{id:checkpointId,position:checkpointId ? [...pads[checkpointId]] : null},
    outcome:'none', lowerPowered, upperSwitchOn:false, velocityY:0, heading:Math.PI/2
  };
}
reset(start,'lower');
function emit(type,data) {
  events.push({sequence:++sequence,type,attemptId:state.attemptId,tick:state.tick,data});
}
const copy = value => JSON.parse(JSON.stringify(value));
const scenarios = {
  lower_trap_route:{floor:'lower',x:-2.8,z:-1.2},
  upper_trap_route:{floor:'upper',x:-2.8,z:2},
  upper_safe_projection:{floor:'upper',x:-2.8,z:-1.2}
};
window.__gameTest = {
  getSnapshot() {
    const {attemptId,tick,avatar,checkpoint,outcome,lowerPowered,upperSwitchOn} = state;
    return copy({attemptId,tick,avatar,checkpoint,outcome,lowerPowered,upperSwitchOn});
  },
  getEvents(afterSequence=-1) {return copy(events.filter(e=>e.sequence>afterSequence));},
  loadScenario(id) {
    if (!Object.hasOwn(scenarios,id)) return {ok:false,reason:'Unknown scenario'};
    const {floor,x,z} = scenarios[id];
    reset([x,pads[floor][1],z],floor,state.attemptId+1,floor);
    keys.clear();
    pressed.clear();
    return {ok:true,reason:null};
  }
};

window.addEventListener('keydown',e=>{
  if (!['KeyW','KeyA','KeyS','KeyD','KeyE','KeyR'].includes(e.code)) return;
  e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();pressed.clear();});

function nearby() {
  const {position:[x,,z],supportSurface} = state.avatar;
  return controls.find(c=>c.floor===supportSurface && Math.hypot(x-c.x,z-c.z)<1.4);
}
function finish(outcome,cause) {
  state.outcome = outcome;
  state.cause = cause;
  emit('outcome_changed',cause ? {outcome,cause} : {outcome});
}
function simulate() {
  const use = pressed.has('KeyE');
  const retry = pressed.has('KeyR');
  pressed.clear();
  if (state.outcome !== 'none') {
    if (state.outcome==='failure' && retry) {
      const id = state.checkpoint.id;
      reset(state.checkpoint.position || start,id || 'lower',state.attemptId+1,id,state.lowerPowered);
      emit('attempt_restarted',{checkpointId:id});
    }
    return;
  }
  state.tick++;
  const horizontal = +keys.has('KeyD') - +keys.has('KeyA');
  const vertical = +keys.has('KeyS') - +keys.has('KeyW');
  const length = Math.hypot(horizontal,vertical);
  const position = state.avatar.position;
  const priorSupport = state.avatar.supportSurface;
  if (length) {
    position[0] += horizontal/length * 4.3 * step;
    position[2] += vertical/length * 4.3 * step;
    state.heading = Math.atan2(horizontal,vertical);
  }
  const [x,y,z] = position;
  const surfaces = decks.filter(d=>inside(x,z,d));
  if (inside(x,z,ramp)) surfaces.push({id:'ramp',y:(x-5)*height/7});
  state.velocityY -= 13*step;
  const nextY = y+state.velocityY*step;
  const surface = surfaces.filter(s=>s.y<=y+0.14 && (s.y>=nextY || (priorSupport==='ramp' && s.id==='ramp'))).sort((a,b)=>b.y-a.y)[0];
  state.avatar.supportSurface = surface?.id ?? null;
  position[1] = surface?.y ?? nextY;
  if (surface) state.velocityY = 0;
  if (priorSupport!==state.avatar.supportSurface) {
    if (priorSupport) emit('contact_changed',{actorId:'avatar',objectId:priorSupport,active:false});
    if (surface) emit('contact_changed',{actorId:'avatar',objectId:surface.id,active:true});
  }

  const floor = surface?.id;
  const pad = pads[floor];
  if (pad && state.checkpoint.id!==floor && Math.abs(x-pad[0])<=0.68 && Math.abs(z-pad[2])<=0.68) {
    state.checkpoint = {id:floor,position:[...pad]};
    emit('checkpoint_registered',{id:floor,position:[...pad]});
  }
  if (use) {
    const control = nearby();
    if (control?.id==='lower_power' && !state.lowerPowered) {
      state.lowerPowered = true;
      emit('control_changed',{id:control.id,active:true});
    }
    if (control?.id==='upper_switch' && state.lowerPowered) {
      state.upperSwitchOn = !state.upperSwitchOn;
      emit('control_changed',{id:control.id,active:state.upperSwitchOn});
    }
  }
  if (position[1]<-3) finish('failure','fall');
  else if (traps[floor] && inside(x,z,traps[floor])) finish('failure',floor+'_trap');
  else if (floor==='upper' && state.lowerPowered && state.upperSwitchOn && inside(x,z,exit)) finish('victory');
}

const $ = id=>document.getElementById(id);
const viewport = $('viewport');
const renderer = new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x182629);
viewport.prepend(renderer.domElement);
const scene = new T.Scene();
const lower = new T.Group();
const upper = new T.Group();
const structure = new T.Group();
scene.add(lower,upper,structure);
const camera = new T.OrthographicCamera(-12,12,8,-8,.1,120);
const look = new T.Vector3(0.5,0,0);
scene.add(new T.HemisphereLight(0xe3fff7,0x625649,2.2));
const sun = new T.DirectionalLight(0xffead4,2.5);
sun.position.set(-8,16,9);
scene.add(sun);

const materials = new Map();
function mat(color, glow=false) {
  const key = color+':'+glow;
  if (!materials.has(key)) materials.set(key,new T.MeshStandardMaterial({color,roughness:.82,emissive:glow?color:0,emissiveIntensity:.45}));
  return materials.get(key);
}
function box(group,x,y,z,w,h,d,color,glow=false) {
  const mesh = new T.Mesh(new T.BoxGeometry(w,h,d),mat(color,glow));
  mesh.position.set(x,y,z);
  group.add(mesh);
  return mesh;
}

const tags = [];
function tag(group,x,y,z,label,style='') {
  const el = document.createElement('div');
  el.className = 'tag '+style;
  el.textContent = label;
  $('labels').append(el);
  tags.push({group,point:new T.Vector3(x,y,z),el});
  return el;
}

box(scene,2,-4,0,90,.25,70,0x233438);
const grid = new T.GridHelper(80,80,0x567373,0x2f4548);
grid.position.y = -3.86;
scene.add(grid);
for (const d of decks) {
  const group = d.id==='lower'?lower:upper;
  box(group,d.x,d.y-.25,d.z,d.w,.5,d.d,0x40575a);
  const nx = Math.ceil(d.w / 1.45);
  const nz = Math.ceil(d.d / 1.45);
  for(let i=0;i<nx;i++) for(let j=0;j<nz;j++) {
    const w=d.w/nx, depth=d.d/nz;
    box(group,d.x-d.w/2+(i+.5)*w,d.y-.035,d.z-d.d/2+(j+.5)*depth,w-.035,.07,depth-.035,(i+j)%2?0x607471:0x556a69);
  }
  for(const side of [-1,1]) {
    box(group,d.x,d.y-.12,d.z+side*(d.d/2-.07),d.w,.09,.12,0x9fb59f);
    box(group,d.x+side*(d.w/2-.07),d.y-.14,d.z,.12,.09,d.d,0x9fb59f);
  }
}

const incline = Math.atan2(height,7);
const rampGroup = new T.Group();
rampGroup.position.set(8.5,height/2,2.5);
rampGroup.rotation.z = incline;
structure.add(rampGroup);
const rampLength = Math.hypot(7,height);
box(rampGroup,0,-.17,0,rampLength,.34,3,0x465d5e);
for(let i=0;i<17;i++){
  const x=(i-8)*rampLength/17;
  box(rampGroup,x,.012,0,.1,.024,2.96,0x879a8c);
  for(const side of [-1,1]) {
    box(rampGroup,x,.028,side*1.38,.28,.035,.14,0xe6b86a,true);
  }
}
tag(structure,6.35,1.3,3.85,'EAST RAMP','ramp');
tag(upper,12.85,height+.55,-2.65,'UPPER DECK ←','ramp');
for(const x of [-6.65,4.65]) for(const z of [-4.65,4.65]) {
  box(lower,x,-1.95,z,.52,3.8,.52,0x3b5052);
  box(upper,x,height/2-.25,z,.34,height-.5,.34,0x35494b);
}
for(const [floor,p] of Object.entries(pads)) {
  const [x,y,z] = p;
  const group = floor==='lower'?lower:upper;
  box(group,x,y+.026,z,1.36,.052,1.36,0x183b3c);
  for(const side of [-1,1]) {
    box(group,x+side*.62,y+.059,z,.08,.028,1.32,0x7ef1ce,true);
    box(group,x,y+.06,z+side*.62,1.32,.028,.08,0x7ef1ce,true);
  }
  const ring = new T.Mesh(new T.RingGeometry(.22,.32,4),mat(0x8affd9,true));
  ring.rotation.x=-Math.PI/2;
  ring.position.set(x,y+.062,z);
  group.add(ring);
  tag(group,x,y+.42,z,'CHECKPOINT');
}

for(const [floor,r] of Object.entries(traps)){
  const group = floor==='lower'?lower:upper;
  const y=pads[floor][1];
  box(group,r.x,y+.04,r.z,r.w,.08,r.d,0x572a2c);
  for(let i=0;i<8;i++){
    const x=r.x+(i-3.5)*r.w/8;
    box(group,x,y+.087,r.z,.22,.045,r.d-.24,i%2?0xdc5a41:0xad3d32,true);
  }
  for(const side of [-1,1]) box(group,r.x,y+.09,r.z+side*(r.d/2-.05),r.w,.04,.09,0xff9371,true);
  tag(group,r.x,y+.43,r.z,'LIVE HAZARD','trap');
}
for(const c of controls){
  const group=c.floor==='lower'?lower:upper;
  box(group,c.x,c.y+.1,c.z,.85,.2,.68,0x283c40);
  box(group,c.x,c.y+.44,c.z,.55,.72,.46,0x294344);
  box(group,c.x,c.y+.85,c.z,.86,.24,.59,0x172c31);
  c.screen=box(group,c.x,c.y+.98,c.z,.59,.033,.38,0xffbd70,true);
  tag(group,c.x,c.y+1.36,c.z,c.floor==='lower'?'SUPPLY CONSOLE':'RELAY CONSOLE');
}
box(upper,exit.x,height+.04,exit.z,exit.w,.08,exit.d,0x224944);
for(const side of [-1,1]){
  box(upper,exit.x+side*.92,height+.8,exit.z-.65,.19,1.6,.26,0x263c40);
  box(upper,exit.x+side*.92,height+.8,exit.z-.495,.075,1.3,.04,0x7ef1ce,true);
}
const exitLight = box(upper,exit.x,height+1.6,exit.z-.65,2.03,.19,.26,0xffbd70,true);
tag(upper,exit.x,height+2,exit.z,'EXTRACTION');

const player=new T.Group();
scene.add(player);
box(player,0,.48,0,.49,.55,.36,0xe1eee0);
box(player,0,.86,0,.39,.27,.36,0xf4d485);
box(player,0,.87,.185,.3,.105,.04,0x243639);
box(player,0,.52,-.23,.35,.41,.16,0x243639);
const feet=[];
for(const side of [-1,1]){
  feet.push(box(player,side*.14,.13,0,.18,.26,.28,0x283b41));
  box(player,side*.31,.48,0,.13,.37,.23,0xc2d1bf);
}
const shadow = new T.Mesh(new T.CircleGeometry(.39,20),new T.MeshBasicMaterial({color:0x182626,transparent:true,opacity:.46,depthWrite:false}));
shadow.rotation.x=-Math.PI/2;
scene.add(shadow);

const projected = new T.Vector3();
let width=0,heightPx=0,activeDeck='lower',lastPosition=[...start];
function display() {
  const {avatar:{position,supportSurface},checkpoint,outcome,attemptId,lowerPowered,upperSwitchOn}=state;
  const [x,y,z]=position;
  if (supportSurface==='upper' || supportSurface==='lower') activeDeck=supportSurface;
  if (supportSurface==='ramp') activeDeck='ramp';
  upper.visible=activeDeck!=='lower' && (activeDeck!=='ramp' || y>height*.42);
  lower.visible=activeDeck!=='upper';
  const nextWidth=viewport.clientWidth, nextHeight=viewport.clientHeight;
  if(width!==nextWidth || heightPx!==nextHeight){
    width=nextWidth;
    heightPx=nextHeight;
    renderer.setSize(width,heightPx,false);
    const halfWidth=Math.max(11.6,7.9*width/heightPx);
    camera.left=-halfWidth;
    camera.right=halfWidth;
    camera.top=halfWidth*heightPx/width;
    camera.bottom=-camera.top;
    camera.updateProjectionMatrix();
  }
  const targetX=activeDeck==='lower'?1.1:3.1;
  look.x+=(targetX-look.x)*.09;
  look.y+=((activeDeck==='upper'?height:Math.max(0,y)*.7)-look.y)*.09;
  camera.position.copy(look).add(new T.Vector3(1.2,15,19));
  camera.lookAt(look);
  camera.updateMatrixWorld();
  player.position.fromArray(position);
  player.rotation.y=state.heading;
  const moving=Math.abs(x-lastPosition[0])+Math.abs(z-lastPosition[2])>.0001;
  feet.forEach((foot,i)=>foot.position.z=moving?Math.sin(state.tick*.31+i*Math.PI)*.15:0);
  lastPosition=[...position];
  shadow.visible=!!supportSurface;
  shadow.position.set(x,y+.075,z);
  controls[0].screen.material=mat(lowerPowered?0x8affd9:0xffbd70,true);
  controls[1].screen.material=mat(upperSwitchOn?0x8affd9:0xffbd70,true);
  exitLight.material=mat(lowerPowered&&upperSwitchOn?0x8affd9:0xffbd70,true);

  for(const label of tags){
    projected.copy(label.point).project(camera);
    label.el.hidden=!label.group.visible;
    label.el.style.left=((projected.x+1)*width/2)+'px';
    label.el.style.top=((1-projected.y)*heightPx/2)+'px';
  }
  $('deck').textContent=activeDeck==='upper'?'L02 / UPPER DECK':activeDeck==='ramp'?'TRANSFER / EAST RAMP':'L01 / LOWER DECK';
  $('attempt').textContent='ATTEMPT '+String(attemptId+1).padStart(2,'0');
  $('coords').textContent='X '+x.toFixed(1)+'  /  Y '+y.toFixed(1)+'  /  Z '+z.toFixed(1);
  $('saved').textContent=checkpoint.id?checkpoint.id.toUpperCase()+' DECK':'NO SIGNAL';
  $('powerTask').classList.toggle('done',lowerPowered);
  $('relayTask').classList.toggle('done',upperSwitchOn);
  $('exitTask').classList.toggle('done',outcome==='victory');
  const control=nearby();
  $('prompt').hidden=!control || outcome!=='none';
  if(control) $('prompt').textContent=control.floor==='lower'?(lowerPowered?'Supply online':'E  /  Restore supply'):
    (lowerPowered?(upperSwitchOn?'E  /  Deactivate relay':'E  /  Activate relay'):'Restore lower supply first');
  const result=$('result');
  result.hidden=outcome==='none';
  result.classList.toggle('failure',outcome==='failure');
  if(outcome!=='none'){
    $('resultCode').textContent=outcome==='victory'?'EXTRACTION CONFIRMED':state.cause==='fall'?'FALL DETECTED':'LIVE PANEL CONTACT';
    result.querySelector('h2').textContent=outcome==='victory'?'Station online':'Run interrupted';
    result.querySelector('p').textContent=outcome==='victory'?'Supply restored. Relay active.':'Press R to retry from your last checkpoint.';
  }
  renderer.render(scene,camera);
}

let previous=performance.now(),accumulator=0;
function frame(now) {
  accumulator+=Math.min(.2,(now-previous)/1000);
  previous=now;
  while(accumulator>=step){
    simulate();
    accumulator-=step;
  }
  display();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

