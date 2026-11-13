import * as T from './three.module.js';

const scene = new T.Scene();
scene.background = new T.Color(0x15252e);
scene.fog = new T.FogExp2(0x15252e, .037);
const camera = new T.PerspectiveCamera(45, 1, .1, 130);
const renderer = new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
document.querySelector('#game').append(renderer.domElement);
scene.add(new T.HemisphereLight(0xcceaff, 0x56626d, 2.15));
const sun = new T.DirectionalLight(0xffe7c2, 2.3);
sun.position.set(-5, 12, 8);
scene.add(sun);

const colors = {blue:0x39cfff, amber:0xffad45, mint:0x67fbd0};
const upper = new T.Group();
scene.add(upper);
function mat(color, glow=0) {
  return new T.MeshStandardMaterial({color, roughness:.72, metalness:.22, emissive:color, emissiveIntensity:glow});
}
function box(parent, x,y,z, w,h,d, color, glow=0) {
  const m = new T.Mesh(new T.BoxGeometry(w,h,d), mat(color,glow));
  m.position.set(x,y,z);
  parent.add(m);
  return m;
}
function sign(parent, title, detail, x,y,z, color, width=2.7) {
  const c = document.createElement('canvas');
  c.width=512; c.height=152;
  const g=c.getContext('2d');
  g.fillStyle='#10202a'; g.fillRect(0,0,512,152);
  g.strokeStyle=color; g.lineWidth=6; g.strokeRect(3,3,506,146);
  g.fillStyle=color; g.textAlign='center'; g.font='bold 43px system-ui';
  g.fillText(title,256,64);
  g.fillStyle='#e2f1f7'; g.font='bold 22px system-ui'; g.fillText(detail,256,114);
  const texture=new T.CanvasTexture(c);
  texture.colorSpace=T.SRGBColorSpace;
  const mesh=new T.Mesh(new T.PlaneGeometry(width,width*152/512), new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));
  mesh.position.set(x,y,z);
  parent.add(mesh);
}
function deck(parent, left,right, front,back, y, tint, trim) {
  box(parent,(left+right)/2,y-.22,(front+back)/2,right-left,.44,front-back,tint);
  for(let z=back+.4;z<front;z+=1) {
    box(parent,(left+right)/2,y+.006,z,right-left-.14,.012,.025,0x405966);
  }
  for(const x of [left+.05,right-.05]) {
    box(parent,x,y+.04,(front+back)/2,.07,.08,front-back,trim,.26);
  }
}
function slope(parent,left,right,front,back,yFront,yBack,trim) {
  const angle=Math.atan2(yBack-yFront,front-back);
  const length=Math.hypot(front-back,yBack-yFront);
  const group=new T.Group();
  group.position.set((left+right)/2,(yFront+yBack)/2,(front+back)/2);
  group.rotation.x=angle;
  parent.add(group);
  deck(group,-(right-left)/2,(right-left)/2,length/2,-length/2,0,0x294653,trim);
}
deck(scene,-2.5,5.8,9.5,5,0,0x29434f,colors.mint);
deck(scene,-2.5,2.5,5,-15,0,0x29434f,colors.blue);
slope(scene,2.5,5.8,5,-1,0,3,colors.amber);
deck(upper,-2.5,5.8,-1,-2.5,3,0x364957,colors.amber);
deck(upper,-2.5,2.5,-2.5,-10,3,0x364957,colors.amber);
slope(upper,-2.5,2.5,-10,-15,3,0,colors.amber);
deck(scene,-2.5,2.5,-15,-19,0,0x294c4b,colors.mint);
box(scene,0,-3.8,-4,160,1,160,0x192d38);
const grid=new T.GridHelper(160,100,0x3c5c68,0x29414d);
grid.position.set(0,-3.29,-4); scene.add(grid);
for(const x of [-3.1,6.6]) for(let z=7;z>-20;z-=4) {
  box(scene,x,-1.65,z,.42,3.3,.42,0x243c47);
  box(scene,x,-.03,z,.58,.12,.58,0x45636d);
}
sign(scene,'LOWER','BLUE KEY · STRAIGHT',-.35,1.38,4.85,'#64dbff',2.4);
sign(scene,'UPPER','AMBER KEY · RIGHT RAMP',4.1,1.38,4.85,'#ffbf73',2.6);

const gateZ=-7;
const doorMeshes={};
for(const [id,y,parent,color] of [['lower',0,scene,'blue'],['upper',3,upper,'amber']]) {
  const tint=colors[color];
  for(const x of [-2.32,2.32]) {
    box(parent,x,y+1.18,gateZ,.28,2.36,.48,0x5b727a);
    box(parent,x,y+1.3,gateZ+.251,.09,1.55,.04,tint,.75);
  }
  box(parent,0,y+2.28,gateZ,4.9,.24,.46,0x445b64);
  const panel=new T.Group();
  panel.position.set(0,y,gateZ);
  parent.add(panel);
  for(let x=-2.06;x<2.1;x+=.29) box(panel,x,1.04,0,.115,2.02,.14,tint,.46);
  box(panel,0,.38,0,4.5,.11,.24,0x516976);
  sign(panel,color.toUpperCase()+' LOCK','E  ·  MATCHING KEY',0,1.48,.17,color==='blue'?'#64dbff':'#ffbf73',2.35);
  doorMeshes[id]={panel,y};
}
for(const x of [-2.21,2.21]) {
  box(scene,x,1.35,-17,.22,2.7,.32,colors.mint,.7);
  box(scene,x,1.35,-17.32,.38,2.7,.16,0x4f6f75);
}
box(scene,0,2.65,-17,4.6,.18,.35,colors.mint,.72);
box(scene,0,.018,-17.8,4.3,.025,2,0x4d9a89,.34);
sign(scene,'EXIT','SHARED TERMINAL',0,2.68,-17,'#92ffe1',2.25);

const keySites={blue:{x:-1,z:1,y:0,surface:'lower',parent:scene},amber:{x:1,z:-4,y:3,surface:'upper',parent:upper}};
for(const [color,site] of Object.entries(keySites)) {
  const tint=colors[color];
  const pedestal=new T.Mesh(new T.CylinderGeometry(.48,.57,.14,24),mat(0x536777));
  pedestal.position.set(site.x,site.y+.06,site.z);
  site.parent.add(pedestal);
  const key=new T.Group();
  key.position.set(site.x,site.y+.66,site.z);
  site.parent.add(key);
  const ring=new T.Mesh(new T.TorusGeometry(.22,.075,10,24),mat(tint,.6));
  ring.position.y=.22;
  key.add(ring);
  box(key,0,-.09,0,.12,.36,.12,tint,.6);
  box(key,.1,-.24,0,.25,.1,.12,tint,.6);
  box(key,.07,-.1,0,.18,.085,.12,tint,.6);
  site.mesh=key;
}
const player=new T.Group();
scene.add(player);
box(player,0,.53,0,.46,.62,.38,0xd1e2e6);
box(player,0,.95,0,.39,.27,.37,0xe4f5f7);
box(player,0,.95,-.197,.31,.11,.03,colors.mint,1);
box(player,0,.55,.23,.31,.34,.12,0x507f8c);
for(const x of [-.135,.135]) box(player,x,.14,0,.16,.28,.25,0x728e9b);

const scenarios={
  before_amber_pickup:{x:1,z:-3.15,surface:'upper'},
  blue_only_near_upper_lock:{x:0,z:-6.15,surface:'upper',picked:'blue'},
  amber_key_near_upper_lock:{x:0,z:-6.15,surface:'upper',picked:'amber'},
  no_key_near_locked_door:{x:0,z:-6.15,surface:'lower'}
};
let state;
const events=[];
const held=new Set();
let use=false, facing=0, feedback='', feedbackUntil=0;
const dt=1/60;
function event(type,data) {
  events.push({sequence:events.length+1,type,attemptId:state.attemptId,tick:state.tick,data});
}
function height(surface,z) {
  if(surface==='upper') return 3;
  if(surface==='ascent') return (5-z)/2;
  if(surface==='descent') return (z+15)*.6;
  return 0;
}
function contact(id, touching) {
  event('contact_changed',{actorId:'avatar',objectId:id,touching});
}
function reset(entry, reason) {
  const attemptId=state ? state.attemptId+1 : 0;
  const {x,z,surface,picked}=entry;
  state={attemptId,tick:0,x,z,surface,inventory:{amber:0,blue:0},
    doors:{lower:{locked:true,passable:false},upper:{locked:true,passable:false}},
    keys:{amber:{collected:false},blue:{collected:false}},outcome:'none',traversedBranch:null};
  if(picked) {
    state.inventory[picked]=1;
    state.keys[picked].collected=true;
  }
  use=false;
  held.clear();
  facing=0;
  feedback='';
  if(attemptId) event('attempt_restarted',{reason});
  contact(surface,true);
  updateView(true);
}
function newGame() { reset({x:0,z:8,surface:'entrance'},'retry'); }
function surfaceAt(x,z,current) {
  if(z>9.2 || z< -18.65 || x< -2.23 || x>5.52) return null;
  if(current==='upper' || current==='ascent' || current==='descent') {
    if(z>5) return 'entrance';
    if(z> -1) return x>=2.5 ? 'ascent' : null;
    if(z> -2.5 || x<=2.23) {
      if(z>=-10) return 'upper';
      if(z>=-15) return 'descent';
      return 'exit';
    }
    return null;
  }
  if(z>=5) return 'entrance';
  if(current==='entrance' && x>=2.5) return 'ascent';
  if(x>2.23) return null;
  return z< -15 ? 'exit' : 'lower';
}
const gateStop=gateZ+.33;
function move(x,z) {
  const next=surfaceAt(x,z,state.surface);
  if(!next) return;
  const branch=next==='lower' || next==='upper' ? next : null;
  if(branch && state.doors[branch].locked && z<gateStop) return;
  if(branch && state.doors[branch].passable && state.z>=gateZ && z<gateZ) state.traversedBranch=branch;
  if(next!==state.surface) {
    contact(state.surface,false);
    contact(next,true);
  }
  state.x=x;
  state.z=z;
  state.surface=next;
}
function nearDoor() {
  const {surface,z}=state;
  return (surface==='upper'||surface==='lower') && Math.abs(z-gateZ)<=1.35 ? surface : null;
}
const match={upper:'amber',lower:'blue'};
function inventory(color,after,action,objectId) {
  const before=state.inventory[color];
  state.inventory[color]=after;
  event('inventory_changed',{color,before,after,action,objectId});
}
function step() {
  if(state.outcome!=='none') return;
  state.tick++;
  const x=Number(held.has('KeyD'))-Number(held.has('KeyA'));
  const z=Number(held.has('KeyS'))-Number(held.has('KeyW'));
  if(x||z) {
    const stride=3.85*dt/Math.hypot(x,z);
    move(state.x+x*stride,state.z);
    move(state.x,state.z+z*stride);
    facing=Math.atan2(-x,-z);
  }
  for(const [color,site] of Object.entries(keySites)) {
    if(!state.keys[color].collected && state.surface===site.surface && Math.hypot(state.x-site.x,state.z-site.z)<=.59) {
      contact(color,true);
      state.keys[color].collected=true;
      inventory(color,state.inventory[color]+1,'pickup',color);
      contact(color,false);
    }
  }
  if(use) {
    use=false;
    const id=nearDoor();
    if(id && state.doors[id].locked) {
      const color=match[id];
      if(state.inventory[color]) {
        inventory(color,state.inventory[color]-1,'unlock',id);
        state.doors[id]={locked:false,passable:true};
        event('door_state_changed',{doorId:id,...state.doors[id]});
        feedback='Lock open';
      } else feedback='Requires the '+color+' key';
      feedbackUntil=state.tick+95;
    }
  }
  if(state.traversedBranch && state.surface==='exit' && state.z<=-17) {
    state.outcome='victory';
    contact('goal',true);
    event('outcome_changed',{outcome:'victory'});
  }
}
const ui=Object.fromEntries(['blue','amber','upper-route','lower-route','upper-status','lower-status','deck','instruction','prompt','finish','result','retry']
  .map(id=>[id,document.getElementById(id)]));
const cameraTarget=new T.Vector3();
const cameraPosition=new T.Vector3();
const desiredTarget=new T.Vector3();
const desiredPosition=new T.Vector3();
function updateView(snap=false) {
  const {x,z,surface,tick,doors,keys,inventory,outcome,traversedBranch}=state;
  const y=height(surface,z);
  player.position.set(x,y,z);
  player.rotation.y=facing;
  upper.visible=surface!=='lower';
  for(const [id,{panel,y:base}] of Object.entries(doorMeshes)) {
    panel.visible=doors[id].locked;
    panel.position.y=base;
    ui[id+'-route'].classList.toggle('active',surface===id);
    ui[id+'-status'].textContent=doors[id].locked?'LOCKED':'OPEN';
  }
  for(const [color,site] of Object.entries(keySites)) {
    site.mesh.visible=!keys[color].collected;
    site.mesh.rotation.y=tick*.041;
    site.mesh.position.y=site.y+.68+Math.sin(tick*.067)*.09;
    ui[color].textContent=inventory[color];
  }
  desiredPosition.set(x+1.1,y+6.2,z+8.1);
  desiredTarget.set(x,y+.1,z-2.4);
  cameraPosition.lerp(desiredPosition,snap?1:.14);
  cameraTarget.lerp(desiredTarget,snap?1:.14);
  camera.position.copy(cameraPosition);
  camera.lookAt(cameraTarget);

  const id=nearDoor();
  let prompt='';
  if(id && doors[id].locked) prompt=inventory[match[id]]?'Press E to unlock':'Requires the '+match[id]+' key';
  if(feedback && tick<feedbackUntil) prompt=feedback;
  if(ui.prompt.textContent!==prompt) ui.prompt.textContent=prompt;
  ui.deck.textContent=surface==='ascent'?'UPPER RAMP':surface==='descent'?'EXIT RAMP':surface.toUpperCase();
  let instruction;
  if(surface==='entrance') instruction='Go straight for Blue or take the right ramp for Amber.';
  else if(surface==='ascent') instruction='Climb the ramp, then turn left onto the upper deck.';
  else if(surface==='exit'||surface==='descent'||traversedBranch) instruction='Continue through the green exit arch.';
  else {
    const color=match[surface];
    const name=color[0].toUpperCase()+color.slice(1);
    if(!keys[color].collected) instruction=surface==='lower'?'Pick up the blue key on the left.':'Pick up the amber key on the right.';
    else if(doors[surface].locked) instruction='Approach the '+name+' lock and press E.';
    else instruction='Walk through the open gate.';
  }
  ui.instruction.textContent=instruction;
  ui.finish.hidden=outcome!=='victory';
  if(outcome==='victory') ui.result.textContent='You reached the shared exit via the '+traversedBranch+' route.';
}
window.__gameTest={
  getSnapshot() {
    const {attemptId,tick,x,z,surface,inventory,doors,keys,outcome,traversedBranch}=state;
    return {attemptId,tick,avatar:{position:[x,height(surface,z),z],supportSurface:surface},
      inventory:{...inventory},doors:{lower:{...doors.lower},upper:{...doors.upper}},
      keys:{amber:{...keys.amber},blue:{...keys.blue}},outcome,traversedBranch};
  },
  getEvents(afterSequence=-1) {
    return events.filter(entry=>entry.sequence>afterSequence).map(entry=>({...entry,data:{...entry.data}}));
  },
  loadScenario(id) {
    if(!Object.hasOwn(scenarios,id)) return {ok:false,reason:'Unknown scenario'};
    reset(scenarios[id],id);
    return {ok:true,reason:null};
  }
};
const movement=['KeyW','KeyA','KeyS','KeyD'];
window.addEventListener('keydown',e=>{
  if(movement.includes(e.code)) {
    e.preventDefault();
    held.add(e.code);
  } else if(!e.repeat && e.code==='KeyE') use=true;
  else if(!e.repeat && e.code==='KeyR') newGame();
});
window.addEventListener('keyup',e=>held.delete(e.code));
window.addEventListener('blur',()=>{held.clear();use=false;});
ui.retry.addEventListener('click',newGame);
function resize() {
  const width=innerWidth, height=innerHeight;
  camera.aspect=width/height;
  camera.fov=width/height<1 ? 57 : 45;
  camera.updateProjectionMatrix();
  renderer.setSize(width,height);
}
window.addEventListener('resize',resize);
resize();
newGame();
let last=performance.now(), accumulator=0;
function frame(now) {
  accumulator+=Math.min(.25,Math.max(0,(now-last)/1000));
  last=now;
  while(accumulator>=dt) {
    step();
    accumulator-=dt;
  }
  updateView();
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
