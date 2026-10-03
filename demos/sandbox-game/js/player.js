// player.js — 玩家与怪物实体（史莱姆/僵尸/蝙蝠/Boss克苏鲁之眼）
class Entity {
  constructor(x,y,w,h){
    this.x=x; this.y=y; this.w=w; this.h=h;
    this.vx=0; this.vy=0; this.onGround=false;
    this.hitFlash=0; // 受击闪白
  }
  // 与世界的 AABB 碰撞移动（单位：格）
  moveAndCollide(world, dt, gravity=38){
    this.vy += gravity*dt;
    if(this.vy>30) this.vy=30;
    this.x += this.vx*dt;
    if(this.vx>0){
      const xe = this.x+this.w;
      for(let y=Math.floor(this.y); y<=Math.floor(this.y+this.h-0.001); y++){
        if(world.isSolid(Math.floor(xe),y)){ this.x = Math.floor(xe)-this.w-0.001; this.vx=0; break; }
      }
    } else if(this.vx<0){
      for(let y=Math.floor(this.y); y<=Math.floor(this.y+this.h-0.001); y++){
        if(world.isSolid(Math.floor(this.x),y)){ this.x = Math.floor(this.x)+1+0.001; this.vx=0; break; }
      }
    }
    this.y += this.vy*dt;
    this.onGround = false;
    if(this.vy>0){
      const ye = this.y+this.h;
      for(let x=Math.floor(this.x); x<=Math.floor(this.x+this.w-0.001); x++){
        if(world.isSolid(x,Math.floor(ye))){ this.y = Math.floor(ye)-this.h-0.001; this.vy=0; this.onGround=true; break; }
      }
    } else if(this.vy<0){
      for(let x=Math.floor(this.x); x<=Math.floor(this.x+this.w-0.001); x++){
        if(world.isSolid(x,Math.floor(this.y))){ this.y = Math.floor(this.y)+1+0.001; this.vy=0; break; }
      }
    }
  }
  overlaps(o){
    return this.x<o.x+o.w && this.x+this.w>o.x && this.y<o.y+o.h && this.y+this.h>o.y;
  }
  center(){ return {x:this.x+this.w/2, y:this.y+this.h/2}; }
}

class Player extends Entity {
  constructor(x,y){
    super(x,y,0.9,1.8);
    this.hp=100; this.maxHp=100;
    this.facing=1;
    this.miningPower=70;      // 每秒挖掘值
    this.invulnTime=0;
    this.attackTimer=0;       // 挥剑动画剩余时间
    this.attackCd=0;
    this.walkAnim=0;
  }
  update(world, input, dt){
    const speed=8, jump=13.5;
    this.vx = 0;
    if(input.left){ this.vx=-speed; this.facing=-1; }
    if(input.right){ this.vx=speed; this.facing=1; }
    if(input.jump && this.onGround) this.vy = -jump;
    const prevVy = this.vy;
    this.moveAndCollide(world, dt);
    if(this.onGround && prevVy>22) this.hurt(Math.floor((prevVy-22)*4));
    if(this.invulnTime>0) this.invulnTime-=dt;
    if(this.attackTimer>0) this.attackTimer-=dt;
    if(this.attackCd>0) this.attackCd-=dt;
    if(this.vx!==0 && this.onGround) this.walkAnim += dt*10;
    else if(this.onGround) this.walkAnim = 0;
  }
  hurt(dmg){
    if(this.invulnTime>0 || dmg<=0) return false;
    this.hp = Math.max(0,this.hp-dmg);
    this.invulnTime = 0.8;
    return true;
  }
  // 尝试挥剑，返回是否成功触发
  swing(){
    if(this.attackCd>0) return false;
    this.attackCd = 0.35;
    this.attackTimer = 0.22;
    return true;
  }
  // 挥剑攻击范围（面前的矩形）
  attackBox(){
    const r = 2.4;
    return {
      x: this.facing>0 ? this.x+this.w*0.5 : this.x+this.w*0.5-r,
      y: this.y-0.6, w: r, h: this.h+1.0
    };
  }
}

// ---------- 怪物基类 ----------
class Monster extends Entity {
  constructor(x,y,w,h,hp,dmg){
    super(x,y,w,h);
    this.hp=hp; this.maxHp=hp; this.contactDmg=dmg;
    this.dead=false;
  }
  takeHit(dmg, fromX){
    this.hp -= dmg;
    this.hitFlash = 0.12;
    this.vx = (this.x+this.w/2 > fromX ? 1 : -1)*6;
    this.vy = -4;
    if(this.hp<=0) this.dead=true;
  }
  touchPlayer(player){
    if(this.overlaps(player)){
      if(player.hurt(this.contactDmg)){
        player.vy=-6;
        player.vx=(player.x>this.x?1:-1)*9;
      }
    }
  }
}

class Slime extends Monster {
  constructor(x,y,green){
    super(x,y,1.0,0.75, green?18:28, green?6:10);
    this.green=!!green;
    this.jumpTimer = 1+Math.random()*2;
  }
  update(world, player, dt){
    this.jumpTimer -= dt;
    if(this.hitFlash>0) this.hitFlash-=dt;
    if(this.onGround){
      this.vx = 0;
      if(this.jumpTimer<=0){
        const dir = player.x>this.x?1:-1;
        this.vx = dir*(3+Math.random()*3);
        this.vy = -(8+Math.random()*4);
        this.jumpTimer = 1.2+Math.random()*1.8;
      }
    }
    this.moveAndCollide(world, dt);
    this.touchPlayer(player);
  }
  get tex(){ return this.green?Textures.slimeGreen:Textures.slimeBlue; }
  get drops(){ return [{item:'gel', count:1+Math.floor(Math.random()*2), chance:1}]; }
}

class Zombie extends Monster {
  constructor(x,y){
    super(x,y,0.9,1.8, 45, 14);
    this.dir = Math.random()<0.5?-1:1;
    this.jumpCd = 0;
  }
  update(world, player, dt){
    if(this.hitFlash>0) this.hitFlash-=dt;
    this.jumpCd -= dt;
    // 朝玩家走
    this.dir = player.x > this.x ? 1 : -1;
    const wantVx = this.dir*2.6;
    // 前方有台阶则跳
    const fx = Math.floor(this.x + (this.dir>0?this.w+0.1:-0.1));
    const fy = Math.floor(this.y+this.h-0.5);
    if(this.onGround && world.isSolid(fx,fy) && !world.isSolid(fx,fy-1) === false && this.jumpCd<=0){
      // 前方被挡
    }
    if(this.onGround && world.isSolid(fx,fy) && this.jumpCd<=0){
      this.vy = -11; this.jumpCd = 0.8;
    }
    this.vx = wantVx;
    this.moveAndCollide(world, dt);
    this.touchPlayer(player);
  }
  get tex(){ return Textures.zombie; }
  get drops(){ return [{tile:T.IRON, count:1, chance:0.4},{tile:T.GOLD, count:1, chance:0.15}]; }
}

class Bat extends Monster {
  constructor(x,y){
    super(x,y,0.75,0.5, 15, 8);
    this.t = Math.random()*10;
  }
  update(world, player, dt){
    if(this.hitFlash>0) this.hitFlash-=dt;
    this.t += dt;
    const pc = player.center(), c = this.center();
    const dx = pc.x-c.x, dy = pc.y-c.y;
    const d = Math.hypot(dx,dy)||1;
    // 飞向玩家 + 正弦扰动，无重力
    this.vx = dx/d*4.5 + Math.sin(this.t*5)*2;
    this.vy = dy/d*3.5 + Math.cos(this.t*4)*2;
    this.moveAndCollide(world, dt, 0);
    this.touchPlayer(player);
  }
  get tex(){ return Textures.bat; }
  get drops(){ return [{tile:T.COAL, count:1, chance:0.5}]; }
}

// ---------- Boss：克苏鲁之眼 ----------
class BossEye extends Monster {
  constructor(x,y){
    super(x,y,2.4,2.4, 1200, 22);
    this.state='hover';   // hover 悬停 / charge 冲刺
    this.stateTimer=2.5;
    this.chargeVx=0; this.chargeVy=0;
    this.angle=0;
  }
  get phase2(){ return this.hp < this.maxHp*0.4; }
  update(world, player, dt){
    if(this.hitFlash>0) this.hitFlash-=dt;
    this.stateTimer -= dt;
    const pc = player.center(), c = this.center();
    const speedMul = this.phase2 ? 1.6 : 1;

    if(this.state==='hover'){
      // 悬停在玩家上方
      const tx = pc.x + Math.sin(performance.now()/700)*6;
      const ty = pc.y - 7;
      this.vx += ((tx-c.x)*2.2 - this.vx)*dt*3*speedMul;
      this.vy += ((ty-c.y)*2.2 - this.vy)*dt*3*speedMul;
      this.angle = Math.atan2(pc.y-c.y, pc.x-c.x);
      if(this.stateTimer<=0){
        this.state='charge';
        this.stateTimer = this.phase2?0.55:0.75;
        const d = Math.hypot(pc.x-c.x, pc.y-c.y)||1;
        const sp = (this.phase2?26:19);
        this.chargeVx = (pc.x-c.x)/d*sp;
        this.chargeVy = (pc.y-c.y)/d*sp;
        this.chargesLeft = this.phase2?3:1;
      }
    } else {
      this.vx = this.chargeVx; this.vy = this.chargeVy;
      if(this.stateTimer<=0){
        if(this.chargesLeft>1){
          this.chargesLeft--;
          const d = Math.hypot(pc.x-c.x, pc.y-c.y)||1;
          const sp = 26;
          this.chargeVx=(pc.x-c.x)/d*sp; this.chargeVy=(pc.y-c.y)/d*sp;
          this.stateTimer=0.5;
        } else {
          this.state='hover';
          this.stateTimer = this.phase2?1.3:2.5;
        }
      }
    }
    // Boss 无视地形（穿墙飞行）
    this.x += this.vx*dt; this.y += this.vy*dt;
    if(this.y<2) this.y=2;
    this.touchPlayer(player);
  }
  takeHit(dmg, fromX){
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if(this.hp<=0) this.dead=true;
  }
  get tex(){ return this.phase2?Textures.bossEye2:Textures.bossEye1; }
  get drops(){
    return [{tile:T.GOLD, count:15, chance:1},{tile:T.DIAMOND, count:5, chance:1}];
  }
}
