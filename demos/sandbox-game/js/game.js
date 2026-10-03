// game.js — 主循环、渲染、物品/合成、怪物与Boss、昼夜与平滑光照、粒子
(function(){
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resize(){ canvas.width=innerWidth; canvas.height=innerHeight; }
addEventListener('resize',resize); resize();

const world = new World(Date.now()%100000);
const spawnX = WORLD_W/2;
const player = new Player(spawnX, world.surface[Math.floor(spawnX)]-3);
let monsters = [];
let boss = null;
let drops = [];      // 掉落物 {x,y,vx,vy,tile,item,count,life}
let dmgNums = [];    // 伤害数字
let particles = [];  // 粒子 {x,y,vx,vy,life,maxLife,color,size,glow}

// ---------- 物品定义 ----------
const ITEMS = {
  wood_sword:   {name:'木剑',   icon:'swordWood',    dmg:15},
  stone_sword:  {name:'石剑',   icon:'swordStone',   dmg:28},
  iron_sword:   {name:'铁剑',   icon:'swordIron',    dmg:38},
  gold_sword:   {name:'金剑',   icon:'swordGold',    dmg:50},
  diamond_sword:{name:'钻石剑', icon:'swordDiamond', dmg:75},
  potion:       {name:'生命药水', icon:'potion', use:'heal'},
  gel:          {name:'凝胶',   icon:'gel'},
  summon_eye:   {name:'可疑的眼球', icon:'summonEye', use:'summonBoss'},
};
const FIST_DMG = 6;

const hotbar = Array.from({length:9},()=>({tile:null,item:null,count:0}));
hotbar[0]={tile:null,item:'wood_sword',count:1};
hotbar[1]={tile:T.TORCH,item:null,count:30};
hotbar[2]={tile:T.PLANK,item:null,count:50};
let activeSlot = 0;

function slotIcon(s){
  if(s.item) return Textures[ITEMS[s.item].icon];
  if(s.tile!==null) return Textures[TileInfo[s.tile].tex];
  return null;
}
function slotName(s){
  if(s.item) return ITEMS[s.item].name;
  if(s.tile!==null) return TileInfo[s.tile].name;
  return '';
}
function addItem(tile, count, item=null){
  if(item){
    for(const s of hotbar){ if(s.item===item && s.count>0){ s.count+=count; renderHotbar(); return true; } }
    for(const s of hotbar){ if(s.count===0){ s.tile=null; s.item=item; s.count=count; renderHotbar(); return true; } }
    return false;
  }
  for(const s of hotbar){ if(s.tile===tile && s.count>0){ s.count+=count; renderHotbar(); return true; } }
  for(const s of hotbar){ if(s.count===0){ s.item=null; s.tile=tile; s.count=count; renderHotbar(); return true; } }
  return false;
}
// need: {tile} 或 {item}
function countOf(need){
  return hotbar.reduce((a,s)=>{
    if(need.tile!==undefined) return a + (s.tile===need.tile ? s.count : 0);
    return a + (s.item===need.item ? s.count : 0);
  },0);
}
function removeOf(need, n){
  for(const s of hotbar){
    const match = need.tile!==undefined ? s.tile===need.tile : s.item===need.item;
    if(match && s.count>0){
      const take=Math.min(s.count,n);
      s.count-=take; n-=take;
      if(s.count===0){ s.tile=null; s.item=null; }
      if(n<=0) break;
    }
  }
  renderHotbar();
}
function currentDamage(){
  const s=hotbar[activeSlot];
  if(s.item && ITEMS[s.item].dmg) return ITEMS[s.item].dmg;
  return FIST_DMG;
}

const hotbarEl = document.getElementById('hotbar');
function renderHotbar(){
  hotbarEl.innerHTML='';
  hotbar.forEach((s,i)=>{
    const d=document.createElement('div');
    d.className='slot'+(i===activeSlot?' active':'');
    const k=document.createElement('span'); k.className='key'; k.textContent=i+1; d.appendChild(k);
    const icon=slotIcon(s);
    if(icon && s.count>0){
      const ic=document.createElement('canvas'); ic.width=36; ic.height=36;
      const g=ic.getContext('2d'); g.imageSmoothingEnabled=false;
      g.drawImage(icon,0,0,36,36);
      d.appendChild(ic);
      d.title = slotName(s);
      if(!(s.item && ITEMS[s.item].dmg && s.count===1)){
        const c=document.createElement('span'); c.className='cnt'; c.textContent=s.count; d.appendChild(c);
      }
    }
    d.addEventListener('mousedown',e=>{e.stopPropagation(); activeSlot=i; renderHotbar(); renderCraft();});
    hotbarEl.appendChild(d);
  });
}

// ---------- 合成（分类目录） ----------
const RECIPES = [
  {cat:'建材', out:{tile:T.PLANK,count:4},   name:'木板 ×4',   need:[{tile:T.WOOD_LOG,n:1}]},
  {cat:'建材', out:{tile:T.STONE_BRICK,count:4}, name:'石砖 ×4', need:[{tile:T.STONE,n:4}]},
  {cat:'建材', out:{tile:T.GLASS,count:2},   name:'玻璃 ×2',   need:[{tile:T.SAND,n:2}]},
  {cat:'建材', out:{tile:T.TORCH,count:5},   name:'火把 ×5',   need:[{tile:T.PLANK,n:1},{item:'gel',n:1}]},
  {cat:'建材', out:{tile:T.TORCH,count:5},   name:'火把 ×5（煤）', need:[{tile:T.PLANK,n:1},{tile:T.COAL,n:1}]},
  {cat:'武器', out:{item:'wood_sword'},      name:'木剑',   sub:'伤害 15', need:[{tile:T.WOOD_LOG,n:8}]},
  {cat:'武器', out:{item:'stone_sword'},     name:'石剑',   sub:'伤害 28', need:[{tile:T.WOOD_LOG,n:4},{tile:T.STONE,n:10}]},
  {cat:'武器', out:{item:'iron_sword'},      name:'铁剑',   sub:'伤害 38', need:[{tile:T.WOOD_LOG,n:4},{tile:T.IRON,n:8}]},
  {cat:'武器', out:{item:'gold_sword'},      name:'金剑',   sub:'伤害 50', need:[{tile:T.WOOD_LOG,n:4},{tile:T.GOLD,n:8}]},
  {cat:'武器', out:{item:'diamond_sword'},   name:'钻石剑', sub:'伤害 75', need:[{tile:T.WOOD_LOG,n:4},{tile:T.DIAMOND,n:6}]},
  {cat:'道具', out:{item:'potion',count:1},  name:'生命药水', sub:'右键使用，回复 50 生命', need:[{item:'gel',n:3},{tile:T.GLASS,n:1}]},
  {cat:'道具', out:{item:'summon_eye'},      name:'可疑的眼球', sub:'右键召唤 Boss：克苏鲁之眼', need:[{tile:T.GOLD,n:5},{tile:T.DIAMOND,n:3}]},
];
const craftEl = document.getElementById('craft');
const recipesEl = document.getElementById('recipes');
let craftOpen = false;
let craftCat = '建材';

function canCraft(r){ return r.need.every(nd=> countOf(nd)>=nd.n); }
function needName(nd){ return nd.tile!==undefined ? TileInfo[nd.tile].name : ITEMS[nd.item].name; }
function renderCraft(){
  if(!craftOpen) return;
  recipesEl.innerHTML='';
  // 分类标签
  const tabs=document.createElement('div'); tabs.className='tabs';
  ['建材','武器','道具'].forEach(c=>{
    const b=document.createElement('span');
    b.className='tab'+(c===craftCat?' cur':'');
    b.textContent=c;
    b.addEventListener('mousedown',e=>{e.stopPropagation(); craftCat=c; renderCraft();});
    tabs.appendChild(b);
  });
  recipesEl.appendChild(tabs);
  RECIPES.filter(r=>r.cat===craftCat).forEach(r=>{
    const ok = canCraft(r);
    const d=document.createElement('div');
    d.className='recipe '+(ok?'ok':'no');
    const ic=document.createElement('canvas'); ic.width=36; ic.height=36;
    const g=ic.getContext('2d'); g.imageSmoothingEnabled=false;
    const icon = r.out.item ? Textures[ITEMS[r.out.item].icon] : Textures[TileInfo[r.out.tile].tex];
    g.drawImage(icon,0,0,36,36);
    d.appendChild(ic);
    const info=document.createElement('div'); info.className='info';
    const needTxt = r.need.map(nd=>{
      const have=countOf(nd);
      return `<span class="${have>=nd.n?'':'lack'}">${needName(nd)} ${have}/${nd.n}</span>`;
    }).join('　');
    info.innerHTML=`<b>${r.name}</b>${r.sub?` <span class="sub">${r.sub}</span>`:''}<br><span class="need">${needTxt}</span>`;
    d.appendChild(info);
    if(ok){
      d.addEventListener('mousedown',e=>{
        e.stopPropagation();
        if(!canCraft(r)) return;
        r.need.forEach(nd=>removeOf(nd,nd.n));
        if(r.out.item) addItem(null,r.out.count||1,r.out.item);
        else addItem(r.out.tile, r.out.count);
        renderCraft();
        showMsg('合成成功：'+r.name);
      });
    }
    recipesEl.appendChild(d);
  });
}
function toggleCraft(){
  craftOpen=!craftOpen;
  craftEl.style.display=craftOpen?'block':'none';
  renderCraft();
}

// ---------- 提示消息 ----------
const msgEl=document.getElementById('msg');
let msgTimer=null;
function showMsg(txt){
  msgEl.textContent=txt; msgEl.style.opacity=1;
  clearTimeout(msgTimer);
  msgTimer=setTimeout(()=>msgEl.style.opacity=0, 2200);
}

// ---------- 输入 ----------
const input={left:false,right:false,jump:false};
const mouse={x:0,y:0,left:false,right:false};
addEventListener('keydown',e=>{
  if(e.code==='KeyA'||e.code==='ArrowLeft') input.left=true;
  if(e.code==='KeyD'||e.code==='ArrowRight') input.right=true;
  if(e.code==='Space'||e.code==='KeyW'||e.code==='ArrowUp'){ input.jump=true; e.preventDefault(); }
  if(e.code==='KeyC') toggleCraft();
  if(e.code>='Digit1'&&e.code<='Digit9'){ activeSlot=+e.code.slice(5)-1; renderHotbar(); }
});
addEventListener('keyup',e=>{
  if(e.code==='KeyA'||e.code==='ArrowLeft') input.left=false;
  if(e.code==='KeyD'||e.code==='ArrowRight') input.right=false;
  if(e.code==='Space'||e.code==='KeyW'||e.code==='ArrowUp') input.jump=false;
});
addEventListener('wheel',e=>{ activeSlot=(activeSlot+(e.deltaY>0?1:8))%9; renderHotbar(); });
canvas.addEventListener('mousemove',e=>{ mouse.x=e.clientX; mouse.y=e.clientY; });
canvas.addEventListener('mousedown',e=>{ if(e.button===0)mouse.left=true; if(e.button===2){mouse.right=true; useItem();} });
addEventListener('mouseup',e=>{ if(e.button===0)mouse.left=false; if(e.button===2)mouse.right=false; });
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// ---------- 相机 ----------
const cam={x:0,y:0};
let shake=0;
function updateCam(){
  cam.x = player.x*TILE + player.w*TILE/2 - canvas.width/2;
  cam.y = player.y*TILE + player.h*TILE/2 - canvas.height/2;
  cam.x = Math.max(0, Math.min(WORLD_W*TILE-canvas.width, cam.x));
  cam.y = Math.max(0, Math.min(WORLD_H*TILE-canvas.height, cam.y));
  if(shake>0){
    cam.x += (Math.random()-0.5)*shake*14;
    cam.y += (Math.random()-0.5)*shake*14;
  }
}

// ---------- 昼夜（一整天 10 分钟：白天约 6 分钟）----------
let dayTime = 0.08;
const DAY_LEN = 600;
function skyColor(){
  const t = dayTime;
  let day;
  if(t<0.05) day = t/0.05;
  else if(t<0.55) day = 1;
  else if(t<0.62) day = 1-(t-0.55)/0.07;
  else day = 0;
  let orange = 0;
  if(t>0.52&&t<0.64) orange=(1-Math.abs(t-0.58)/0.06);
  if(t<0.07) orange=(1-Math.abs(t-0.035)/0.035)*0.7;
  const r=Math.floor(20+day*110+orange*80), g=Math.floor(24+day*150+orange*10), b=Math.floor(60+day*175-orange*45);
  return {css:`rgb(${r},${Math.max(0,g)},${Math.max(0,b)})`, day};
}
function isDaytime(){ return dayTime<0.585; }

// ---------- 光照（平滑光照贴图）----------
let torches=[];
let torchFlicker=1;
function lightAt(x,y,dayFactor){
  const s = world.surface[Math.max(0,Math.min(WORLD_W-1,x))];
  let l;
  if(y<=s+2) l = dayFactor;
  else l = Math.max(0, dayFactor - (y-s-2)*0.12);
  for(const t of torches){
    const dx=t.x-x, dy=t.y-y;
    const d = Math.sqrt(dx*dx+dy*dy);
    if(d<9) l = Math.max(l, (1-d/9)*torchFlicker);
  }
  const pd = Math.abs(player.x-x)+Math.abs(player.y-y);
  if(pd<6) l = Math.max(l, 0.5*(1-pd/6));
  return Math.min(1,l);
}
function rebuildTorchesNear(cx,cy){
  torches=[];
  for(let y=Math.max(0,cy-32); y<Math.min(WORLD_H,cy+32); y++)
    for(let x=Math.max(0,cx-48); x<Math.min(WORLD_W,cx+48); x++)
      if(world.get(x,y)===T.TORCH) torches.push({x,y});
}
// 光照小画布：1像素=1格，放大绘制时开平滑 → 柔和光影
const lightCanvas=document.createElement('canvas');
const lightCtx=lightCanvas.getContext('2d');

// ---------- 粒子 ----------
function spawnParticles(x,y,color,n,spread=4,glow=false){
  for(let i=0;i<n;i++){
    particles.push({
      x:x+(Math.random()-0.5)*0.6, y:y+(Math.random()-0.5)*0.6,
      vx:(Math.random()-0.5)*spread, vy:-Math.random()*spread*0.8,
      life:0.4+Math.random()*0.4, maxLife:0.8,
      color, size:2+Math.random()*3, glow
    });
  }
}
const TILE_PARTICLE_COLOR = {
  [T.DIRT]:'#8b5a2b',[T.GRASS]:'#3faf3f',[T.STONE]:'#7d7d7d',[T.SAND]:'#dbc478',
  [T.WOOD_LOG]:'#6b4423',[T.LEAF]:'#2e8b2e',[T.PLANK]:'#b3803f',[T.COAL]:'#26262e',
  [T.IRON]:'#b88a6a',[T.GOLD]:'#e2b933',[T.DIAMOND]:'#4dd8e6',[T.STONE_BRICK]:'#7d7d7d',
  [T.GLASS]:'#b4dcf0',[T.TORCH]:'#ff9a1f',
};
function updateParticles(dt){
  for(const p of particles){
    p.life-=dt;
    p.vy+=(p.glow?-2:18)*dt;
    p.x+=p.vx*dt; p.y+=p.vy*dt;
  }
  particles=particles.filter(p=>p.life>0);
  // 火把火星
  if(Math.random()<0.25){
    for(const t of torches){
      if(Math.abs(t.x-player.x)<25 && Math.random()<0.12){
        particles.push({x:t.x+0.5,y:t.y+0.3,vx:(Math.random()-0.5)*0.6,vy:-1-Math.random(),
          life:0.5+Math.random()*0.5,maxLife:1,color:Math.random()<0.5?'#ffd21f':'#ff9a1f',size:2,glow:true});
      }
    }
  }
}

// ---------- 掉落物 ----------
function spawnDrop(x,y,spec){
  drops.push({x,y,vx:(Math.random()-0.5)*4,vy:-4-Math.random()*3,
    tile:spec.tile!==undefined?spec.tile:null, item:spec.item||null, count:spec.count||1, life:120});
}
function dropIcon(d){
  return d.item ? Textures[ITEMS[d.item].icon] : Textures[TileInfo[d.tile].tex];
}
function updateDrops(dt){
  for(const d of drops){
    d.life-=dt;
    d.vy+=30*dt;
    d.x+=d.vx*dt;
    if(world.isSolid(Math.floor(d.x),Math.floor(d.y))){ d.x-=d.vx*dt; d.vx*=-0.3; }
    d.y+=d.vy*dt;
    if(world.isSolid(Math.floor(d.x),Math.floor(d.y+0.3))){ d.y-=d.vy*dt; d.vy=0; d.vx*=0.85; }
    const pc=player.center();
    const dx=pc.x-d.x, dy=pc.y-d.y, dist=Math.hypot(dx,dy);
    if(dist<3.2){ d.x+=dx/dist*10*dt; d.y+=dy/dist*10*dt; }
    if(dist<0.9){
      if(addItem(d.tile,d.count,d.item)){ d.life=-1; if(craftOpen) renderCraft(); }
    }
  }
  drops=drops.filter(d=>d.life>0);
}

// ---------- 伤害数字 ----------
function spawnDmg(x,y,txt,color='#ffdf60'){
  dmgNums.push({x,y,txt,t:1,color});
}
function updateDmg(dt){
  for(const n of dmgNums){ n.t-=dt; n.y-=dt*1.6; }
  dmgNums=dmgNums.filter(n=>n.t>0);
}

// ---------- 挖掘 / 放置 / 使用 / 攻击 ----------
const REACH = 6;
function tileUnderMouse(){
  return {x:Math.floor((mouse.x+cam.x)/TILE), y:Math.floor((mouse.y+cam.y)/TILE)};
}
function inReach(tx,ty){
  const dx=tx+0.5-(player.x+player.w/2), dy=ty+0.5-(player.y+player.h/2);
  return dx*dx+dy*dy <= REACH*REACH;
}
function useItem(){
  const s=hotbar[activeSlot];
  if(!s.item || s.count<=0) return;
  const def=ITEMS[s.item];
  if(def.use==='summonBoss'){
    if(boss){ showMsg('Boss 已在场！'); return; }
    boss = new BossEye(player.x+10, Math.max(3,player.y-10));
    s.count--; if(s.count===0) s.item=null;
    renderHotbar(); renderCraft();
    showMsg('⚠ 克苏鲁之眼 已苏醒！');
    shake=1;
  } else if(def.use==='heal'){
    if(player.hp>=player.maxHp){ showMsg('生命值已满'); return; }
    player.hp=Math.min(player.maxHp,player.hp+50);
    s.count--; if(s.count===0) s.item=null;
    renderHotbar(); renderCraft();
    spawnParticles(player.center().x,player.center().y,'#ff6080',12,3,true);
    showMsg('❤ 回复 50 生命');
  }
}
let mineParticleCd=0;
function handleMouse(dt){
  const {x,y}=tileUnderMouse();
  mineParticleCd-=dt;
  if(mouse.left){
    const mx=(mouse.x+cam.x)/TILE;
    player.facing = mx > player.x+player.w/2 ? 1 : -1;
    if(player.swing()){
      const box=player.attackBox();
      const dmg=currentDamage();
      const targets = boss ? monsters.concat([boss]) : monsters;
      for(const m of targets){
        if(m.x<box.x+box.w && m.x+m.w>box.x && m.y<box.y+box.h && m.y+m.h>box.y){
          m.takeHit(dmg, player.x+player.w/2);
          const c=m.center();
          spawnDmg(c.x,c.y-0.5,''+dmg, m===boss?'#ff6060':'#ffdf60');
          spawnParticles(c.x,c.y,m===boss?'#c02020':'#ff8080',8,5);
        }
      }
    }
    if(inReach(x,y)){
      const t=world.get(x,y);
      const res = world.mine(x,y,player.miningPower*dt);
      if(t!==T.AIR && mineParticleCd<=0){
        spawnParticles(x+0.5,y+0.5,TILE_PARTICLE_COLOR[t]||'#999',3,3);
        mineParticleCd=0.08;
      }
      if(res && res.drop!==null){
        spawnDrop(x+0.4,y+0.3,{tile:res.drop,count:res.count});
        spawnParticles(x+0.5,y+0.5,TILE_PARTICLE_COLOR[t]||'#999',10,5);
      }
    }
  } else if(mouse.right && inReach(x,y)){
    const s=hotbar[activeSlot];
    if(s.tile!==null && s.count>0 && world.get(x,y)===T.AIR){
      const overlapsPlayer = TileInfo[s.tile].solid &&
        x<player.x+player.w && x+1>player.x && y<player.y+player.h && y+1>player.y;
      const overlapsMonster = TileInfo[s.tile].solid && monsters.some(m=>
        x<m.x+m.w && x+1>m.x && y<m.y+m.h && y+1>m.y);
      const hasNeighbor = world.isSolid(x-1,y)||world.isSolid(x+1,y)||world.isSolid(x,y-1)||world.isSolid(x,y+1)||world.getWall(x,y)>0;
      if(!overlapsPlayer && !overlapsMonster && hasNeighbor){
        world.set(x,y,s.tile);
        s.count--;
        if(s.count===0) s.tile=null;
        renderHotbar(); renderCraft();
      }
    }
  }
}

// ---------- 怪物生成（收敛版）----------
// 规则：屏幕外 24~36 格生成；各类型有独立上限；生成间隔更长
let spawnTimer=5;
function countType(cls){ return monsters.filter(m=>m instanceof cls).length; }
function updateMonsters(dt, dayFactor){
  spawnTimer-=dt;
  const night = !isDaytime();
  const surfIdx = Math.floor(Math.max(0,Math.min(WORLD_W-1,player.x)));
  const underground = player.y > world.surface[surfIdx]+12;
  if(spawnTimer<=0 && !boss){
    spawnTimer = night?7:10;
    const roll = Math.random();
    if(underground && roll<0.5 && countType(Bat)<2){
      // 蝙蝠：玩家附近洞穴空气处
      for(let tr=0;tr<10;tr++){
        const bx=Math.floor(player.x+(Math.random()<0.5?-1:1)*(14+Math.random()*10));
        const by=Math.floor(player.y+(Math.random()-0.5)*12);
        if(world.get(bx,by)===T.AIR){ monsters.push(new Bat(bx,by)); break; }
      }
    } else {
      const side = Math.random()<0.5?-1:1;
      const sx = Math.floor(player.x + side*(24+Math.random()*12)); // 保证在屏幕外
      if(sx>1&&sx<WORLD_W-1){
        const sy = world.surface[sx]-2.2;
        if(night && roll<0.45 && countType(Zombie)<3) monsters.push(new Zombie(sx,sy));
        else if(countType(Slime)<(night?4:3)) monsters.push(new Slime(sx,sy, Math.random()<0.5));
      }
    }
  }
  for(const m of monsters) m.update(world,player,dt);
  for(const m of monsters){
    if(m.dead){
      const c=m.center();
      spawnParticles(c.x,c.y,'#ff8080',14,6);
      for(const d of m.drops) if(Math.random()<d.chance) spawnDrop(c.x,c.y,d);
    }
  }
  monsters = monsters.filter(m=> !m.dead && Math.abs(m.x-player.x)<70);
  // 白天僵尸燃尽消失（带粒子）
  if(!night){
    for(const m of monsters) if(m instanceof Zombie) spawnParticles(m.center().x,m.center().y,'#ff9a1f',6,3,true);
    monsters = monsters.filter(m=> !(m instanceof Zombie));
  }
}

// ---------- Boss ----------
const bossbarEl=document.getElementById('bossbar');
const bossfillEl=bossbarEl.querySelector('.fill');
function updateBoss(dt){
  if(!boss){ bossbarEl.style.display='none'; return; }
  boss.update(world,player,dt);
  bossbarEl.style.display='block';
  bossfillEl.style.width=Math.max(0,boss.hp/boss.maxHp*100)+'%';
  if(boss.dead){
    const c=boss.center();
    spawnParticles(c.x,c.y,'#c02020',40,10);
    spawnParticles(c.x,c.y,'#ffd700',25,8,true);
    for(const d of boss.drops) spawnDrop(c.x+(Math.random()-0.5)*2,c.y,d);
    showMsg('🎉 击败了 克苏鲁之眼！');
    shake=1.2;
    boss=null;
  }
}

// ---------- 生命值 UI ----------
const healthEl=document.getElementById('health');
function renderHealth(){
  healthEl.innerHTML='';
  const hearts=Math.ceil(player.maxHp/20);
  for(let i=0;i<hearts;i++){
    const c=document.createElement('canvas'); c.width=20;c.height=18;
    const g=c.getContext('2d'); g.imageSmoothingEnabled=false;
    g.globalAlpha = player.hp>=(i+1)*20 ? 1 : (player.hp>i*20 ? 0.5 : 0.15);
    g.drawImage(Textures.heart,0,0,20,18);
    healthEl.appendChild(c);
  }
}

// ---------- 提示框 ----------
const tooltipEl=document.getElementById('tooltip');
function updateTooltip(){
  const {x,y}=tileUnderMouse();
  const t=world.get(x,y);
  if(t!==T.AIR && inReach(x,y) && !craftOpen){
    tooltipEl.style.display='block';
    tooltipEl.style.left=(mouse.x+14)+'px';
    tooltipEl.style.top=(mouse.y+14)+'px';
    tooltipEl.textContent=TileInfo[t].name;
  } else tooltipEl.style.display='none';
}

// ---------- 云朵 ----------
const clouds=[];
for(let i=0;i<8;i++){
  clouds.push({x:Math.random()*WORLD_W*TILE, y:30+Math.random()*160, s:0.5+Math.random()*0.8, v:3+Math.random()*6});
}

// ---------- 远山（两层视差）----------
function drawMountains(day){
  const layers=[
    {par:0.12, amp:90, base:0.62, col:`rgba(${30+day*45},${40+day*60},${70+day*70},0.75)`, seed:5},
    {par:0.22, amp:130, base:0.75, col:`rgba(${22+day*32},${30+day*45},${58+day*52},0.85)`, seed:9},
  ];
  for(const L of layers){
    ctx.fillStyle=L.col;
    ctx.beginPath();
    ctx.moveTo(0,canvas.height);
    for(let sx=0;sx<=canvas.width;sx+=8){
      const wx=(sx+cam.x*L.par)*0.004;
      const h = Math.sin(wx*1.3+L.seed)*0.5 + Math.sin(wx*2.7+L.seed*2)*0.3 + Math.sin(wx*0.6)*0.6;
      ctx.lineTo(sx, canvas.height*L.base - cam.y*0.08 + h*L.amp - L.amp);
    }
    ctx.lineTo(canvas.width,canvas.height);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------- 渲染 ----------
function drawEntity(e, tex, flip){
  const sx=e.x*TILE-cam.x, sy=e.y*TILE-cam.y;
  ctx.save();
  if(e.hitFlash>0){ ctx.filter='brightness(2.5)'; }
  if(flip){
    ctx.translate(sx+e.w*TILE, sy); ctx.scale(-1,1);
    ctx.drawImage(tex,0,0,e.w*TILE,e.h*TILE);
  } else {
    ctx.drawImage(tex,sx,sy,e.w*TILE,e.h*TILE);
  }
  ctx.restore();
}

function render(){
  const sky = skyColor();
  // 天空竖直渐变
  const skyGrad=ctx.createLinearGradient(0,0,0,canvas.height);
  skyGrad.addColorStop(0, sky.css);
  const d2=sky.day;
  skyGrad.addColorStop(1, `rgb(${Math.floor(60+d2*140)},${Math.floor(70+d2*150)},${Math.floor(110+d2*130)})`);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled = false;

  // 太阳/月亮（白天占 dayTime 0~0.585）
  const dayFrac = 0.585;
  const ang = (dayTime<dayFrac ? dayTime/dayFrac : (dayTime-dayFrac)/(1-dayFrac))*Math.PI;
  const cx0=canvas.width/2, cy0=canvas.height*0.95, R=Math.min(canvas.width,canvas.height)*0.6;
  const bx=cx0-Math.cos(ang)*R, by=cy0-Math.sin(ang)*R;
  ctx.drawImage(isDaytime()?Textures.sun:Textures.moon, bx-24, by-24, isDaytime()?64:40, isDaytime()?64:40);

  // 星星
  if(sky.day<0.3){
    const srng = makeRng(777);
    for(let i=0;i<90;i++){
      const sx=Math.floor(srng()*canvas.width), sy=Math.floor(srng()*canvas.height*0.7);
      const tw = srng()<0.3 ? (Math.sin(performance.now()/300+i)*0.5+0.5) : 1;
      ctx.globalAlpha=(0.3-sky.day)*2.5*tw;
      ctx.fillStyle='#fff';
      ctx.fillRect(sx,sy,2,2);
    }
    ctx.globalAlpha=1;
  }

  // 远山
  drawMountains(sky.day);

  // 云朵
  if(sky.day>0.1){
    ctx.globalAlpha=Math.min(1,sky.day)*0.9;
    for(const c of clouds){
      const px=(c.x-cam.x*0.35)%(WORLD_W*TILE);
      ctx.drawImage(Textures.cloud, px, c.y-cam.y*0.15, 72*c.s*2, 40*c.s*2);
    }
    ctx.globalAlpha=1;
  }

  const x0=Math.floor(cam.x/TILE), y0=Math.floor(cam.y/TILE);
  const x1=Math.ceil((cam.x+canvas.width)/TILE), y1=Math.ceil((cam.y+canvas.height)/TILE);

  // 方块
  for(let y=y0;y<=y1;y++){
    for(let x=x0;x<=x1;x++){
      if(x<0||x>=WORLD_W||y<0||y>=WORLD_H) continue;
      const sx=Math.floor(x*TILE-cam.x), sy=Math.floor(y*TILE-cam.y);
      const t=world.get(x,y);
      const wall=world.getWall(x,y);
      if(t===T.AIR && wall>0){
        ctx.drawImage(wall===1?Textures.dirtWall:Textures.stoneWall,sx,sy,TILE,TILE);
      }
      if(t!==T.AIR){
        ctx.drawImage(Textures[TileInfo[t].tex],sx,sy,TILE,TILE);
        const dr = world.getDamageRatio(x,y);
        if(dr>0){
          ctx.fillStyle=`rgba(0,0,0,${dr*0.45})`;
          ctx.fillRect(sx,sy,TILE,TILE);
        }
      }
    }
  }

  // 掉落物
  for(const d of drops){
    const bob=Math.sin(performance.now()/300+d.x)*3;
    ctx.drawImage(dropIcon(d), d.x*TILE-cam.x-10, d.y*TILE-cam.y-10+bob, 20,20);
  }

  // 怪物
  for(const m of monsters){
    drawEntity(m, m.tex, m instanceof Zombie ? m.dir<0 : (m.vx<0));
  }

  // Boss
  if(boss){
    const c=boss.center();
    ctx.save();
    ctx.translate(c.x*TILE-cam.x, c.y*TILE-cam.y);
    const a = Math.atan2(player.center().y-c.y, player.center().x-c.x);
    ctx.rotate(a);
    if(boss.hitFlash>0) ctx.filter='brightness(2.2)';
    ctx.drawImage(boss.tex, -boss.w*TILE/2, -boss.h*TILE/2, boss.w*TILE, boss.h*TILE);
    ctx.restore();
  }

  // 玩家
  ctx.save();
  if(player.invulnTime>0 && Math.floor(player.invulnTime*10)%2===0) ctx.globalAlpha=0.4;
  const frame = (player.vx!==0 && player.onGround)
    ? Textures.playerFrames[1+Math.floor(player.walkAnim)%2]
    : Textures.playerFrames[0];
  const px=player.x*TILE-cam.x, py=player.y*TILE-cam.y;
  if(player.facing<0){
    ctx.translate(px+player.w*TILE, py); ctx.scale(-1,1);
    ctx.drawImage(frame,0,0,player.w*TILE,player.h*TILE);
  } else {
    ctx.drawImage(frame,px,py,player.w*TILE,player.h*TILE);
  }
  ctx.restore();

  // 挥剑动画
  if(player.attackTimer>0){
    const s=hotbar[activeSlot];
    const swordTex = (s.item && ITEMS[s.item].dmg) ? Textures[ITEMS[s.item].icon] : null;
    const prog = 1-player.attackTimer/0.22;
    const swingA = (-1.6+prog*2.6)*player.facing;
    const pcx=player.x*TILE-cam.x+player.w*TILE/2, pcy=player.y*TILE-cam.y+player.h*TILE*0.45;
    ctx.save();
    ctx.translate(pcx,pcy);
    ctx.rotate(swingA);
    if(swordTex){
      if(player.facing<0){ ctx.scale(-1,1); }
      ctx.drawImage(swordTex, 6, -44, 40,40);
    } else {
      ctx.fillStyle='rgba(255,255,255,0.35)';
      ctx.fillRect(8,-8,26,8);
    }
    ctx.restore();
  }

  // 粒子
  for(const p of particles){
    ctx.globalAlpha=Math.max(0,p.life/p.maxLife);
    if(p.glow){ ctx.globalCompositeOperation='lighter'; }
    ctx.fillStyle=p.color;
    ctx.fillRect(p.x*TILE-cam.x-p.size/2, p.y*TILE-cam.y-p.size/2, p.size, p.size);
    ctx.globalCompositeOperation='source-over';
  }
  ctx.globalAlpha=1;

  // ===== 平滑光照层 =====
  const lw = x1-x0+2, lh = y1-y0+2;
  if(lightCanvas.width!==lw) lightCanvas.width=lw;
  if(lightCanvas.height!==lh) lightCanvas.height=lh;
  const img=lightCtx.createImageData(lw,lh);
  const dayF=Math.max(sky.day,0.02);
  for(let y=0;y<lh;y++){
    for(let x=0;x<lw;x++){
      const wx=x0+x, wy=y0+y;
      let l;
      if(wx<0||wx>=WORLD_W||wy<0||wy>=WORLD_H) l=dayF;
      else {
        const t=world.get(wx,wy), wall=world.getWall(wx,wy);
        l = (t===T.AIR&&wall===0) ? 1 : lightAt(wx,wy,dayF); // 露天空气不遮暗
      }
      const i=(y*lw+x)*4;
      img.data[i]=0; img.data[i+1]=0; img.data[i+2]=8;
      img.data[i+3]=Math.floor((1-l)*235);
    }
  }
  lightCtx.putImageData(img,0,0);
  ctx.imageSmoothingEnabled=true; // 放大时平滑 → 柔和光影
  ctx.drawImage(lightCanvas, x0*TILE-cam.x, y0*TILE-cam.y, lw*TILE, lh*TILE);
  ctx.imageSmoothingEnabled=false;

  // 伤害数字
  ctx.font='bold 16px "Segoe UI"';
  ctx.textAlign='center';
  for(const n of dmgNums){
    ctx.globalAlpha=Math.min(1,n.t*2);
    ctx.fillStyle='#000';
    ctx.fillText(n.txt, n.x*TILE-cam.x+1, n.y*TILE-cam.y+1);
    ctx.fillStyle=n.color;
    ctx.fillText(n.txt, n.x*TILE-cam.x, n.y*TILE-cam.y);
  }
  ctx.globalAlpha=1;

  // 鼠标选框
  const tm=tileUnderMouse();
  if(inReach(tm.x,tm.y)){
    ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=2;
    ctx.strokeRect(tm.x*TILE-cam.x+1,tm.y*TILE-cam.y+1,TILE-2,TILE-2);
  }

  // 暗角
  const vg=ctx.createRadialGradient(canvas.width/2,canvas.height/2,Math.min(canvas.width,canvas.height)*0.45,
    canvas.width/2,canvas.height/2,Math.max(canvas.width,canvas.height)*0.75);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(1,'rgba(0,0,20,0.35)');
  ctx.fillStyle=vg;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // HUD
  const hour = Math.floor(((dayTime*24)+6)%24), min=Math.floor((dayTime*24*60+360)%60);
  const depth = Math.max(0,Math.floor(player.y-world.surface[Math.floor(Math.max(0,Math.min(WORLD_W-1,player.x)))]));
  document.getElementById('hud').textContent =
    `${isDaytime()?'☀ 白天':'🌙 夜晚'} ${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}  |  深度 ${depth}m  |  武器伤害 ${currentDamage()}`;
}

// ---------- 主循环 ----------
let last=performance.now();
let torchRebuild=0;
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  dayTime=(dayTime+dt/DAY_LEN)%1;
  if(shake>0) shake=Math.max(0,shake-dt*2);
  torchFlicker = 0.88 + Math.sin(now/90)*0.06 + Math.random()*0.06;

  player.update(world,input,dt);
  handleMouse(dt);
  updateMonsters(dt, skyColor().day);
  updateBoss(dt);
  updateDrops(dt);
  updateDmg(dt);
  updateParticles(dt);
  for(const c of clouds){ c.x=(c.x+c.v*dt*10)%(WORLD_W*TILE); }
  torchRebuild-=dt;
  if(torchRebuild<=0){ rebuildTorchesNear(Math.floor(player.x),Math.floor(player.y)); torchRebuild=0.5; }

  if(player.hp<=0){
    player.hp=player.maxHp;
    player.x=spawnX; player.y=world.surface[Math.floor(spawnX)]-3;
    player.vx=0; player.vy=0;
    player.invulnTime=2;
    showMsg('你死了…已在出生点重生');
    if(boss) boss=null;
  }

  updateCam();
  render();
  renderHealth();
  updateTooltip();
  requestAnimationFrame(loop);
}
renderHotbar();
requestAnimationFrame(loop);
})();
