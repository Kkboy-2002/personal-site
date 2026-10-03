// world.js — 地形生成与方块系统
const T = {
  AIR:0, DIRT:1, GRASS:2, STONE:3, WOOD_LOG:4, LEAF:5, SAND:6,
  COAL:7, IRON:8, GOLD:9, DIAMOND:10, PLANK:11, TORCH:12,
  STONE_BRICK:13, GLASS:14,
};

const TileInfo = {
  [T.AIR]:    {name:'空气', solid:false, tex:null, hp:0},
  [T.DIRT]:   {name:'泥土', solid:true,  tex:'dirt', hp:30},
  [T.GRASS]:  {name:'草方块',solid:true, tex:'grass',hp:30, drops:T.DIRT},
  [T.STONE]:  {name:'石头', solid:true,  tex:'stone',hp:70},
  [T.WOOD_LOG]:{name:'原木',solid:false, tex:'log',  hp:50},
  [T.LEAF]:   {name:'树叶', solid:false, tex:'leaf', hp:5, drops:null},
  [T.SAND]:   {name:'沙子', solid:true,  tex:'sand', hp:25},
  [T.COAL]:   {name:'煤矿', solid:true,  tex:'coal', hp:90},
  [T.IRON]:   {name:'铁矿', solid:true,  tex:'iron', hp:120},
  [T.GOLD]:   {name:'金矿', solid:true,  tex:'gold', hp:150},
  [T.DIAMOND]:{name:'钻石', solid:true,  tex:'diamond',hp:200},
  [T.PLANK]:  {name:'木板', solid:true,  tex:'plank',hp:40},
  [T.TORCH]:  {name:'火把', solid:false, tex:'torch',hp:1, light:true},
  [T.STONE_BRICK]:{name:'石砖', solid:true, tex:'stoneBrick', hp:80},
  [T.GLASS]:  {name:'玻璃', solid:true,  tex:'glass', hp:15, drops:null},
};

const WORLD_W = 400, WORLD_H = 200;

// 一维值噪声（分形叠加）
function noise1D(seedRng, n, octaves, amp, scale){
  const base = [];
  for(let i=0;i<=Math.ceil(n/scale)+1;i++) base.push(seedRng());
  const out = new Array(n).fill(0);
  for(let o=0;o<octaves;o++){
    const sc = scale/Math.pow(2,o), a = amp/Math.pow(2,o);
    const pts=[];
    for(let i=0;i<=Math.ceil(n/sc)+1;i++) pts.push(seedRng());
    for(let x=0;x<n;x++){
      const t = x/sc, i = Math.floor(t), f = t-i;
      const s = f*f*(3-2*f);
      out[x] += (pts[i]*(1-s)+pts[i+1]*s - 0.5)*2*a;
    }
  }
  return out;
}

class World {
  constructor(seed){
    this.rng = makeRng(seed||12345);
    this.tiles = new Uint8Array(WORLD_W*WORLD_H);
    this.walls = new Uint8Array(WORLD_W*WORLD_H); // 0无 1泥墙 2石墙
    this.damage = {}; // "x,y" -> 累计伤害
    this.surface = new Array(WORLD_W);
    this.generate();
  }
  idx(x,y){ return y*WORLD_W+x; }
  get(x,y){
    if(x<0||x>=WORLD_W||y<0) return T.STONE;
    if(y>=WORLD_H) return T.STONE;
    return this.tiles[this.idx(x,y)];
  }
  set(x,y,t){
    if(x<0||x>=WORLD_W||y<0||y>=WORLD_H) return;
    this.tiles[this.idx(x,y)] = t;
  }
  getWall(x,y){
    if(x<0||x>=WORLD_W||y<0||y>=WORLD_H) return 0;
    return this.walls[this.idx(x,y)];
  }
  isSolid(x,y){ return TileInfo[this.get(x,y)].solid; }

  generate(){
    const surfBase = Math.floor(WORLD_H*0.35);
    const h = noise1D(this.rng, WORLD_W, 4, 14, 60);
    for(let x=0;x<WORLD_W;x++){
      this.surface[x] = Math.floor(surfBase + h[x]);
    }
    const stoneOff = noise1D(this.rng, WORLD_W, 2, 4, 30);
    for(let x=0;x<WORLD_W;x++){
      const s = this.surface[x];
      const stoneStart = s + 8 + Math.floor(stoneOff[x]);
      for(let y=s;y<WORLD_H;y++){
        if(y===s) this.set(x,y,T.GRASS);
        else if(y<stoneStart) this.set(x,y,T.DIRT);
        else this.set(x,y,T.STONE);
        // 背景墙
        if(y>s){
          this.walls[this.idx(x,y)] = y<stoneStart?1:2;
        }
      }
    }
    this.carveCaves();
    this.placeOres();
    this.placeTrees();
    this.placeSandPatches();
  }

  carveCaves(){
    // 随机游走洞穴
    const count = 40;
    for(let i=0;i<count;i++){
      let x = Math.floor(this.rng()*WORLD_W);
      let y = this.surface[Math.floor(x)]+15+Math.floor(this.rng()*(WORLD_H*0.55));
      let len = 40+Math.floor(this.rng()*80);
      let dir = this.rng()*Math.PI*2;
      for(let j=0;j<len;j++){
        const r = 1+Math.floor(this.rng()*2.5);
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
          if(dx*dx+dy*dy<=r*r){
            const tx=Math.floor(x+dx), ty=Math.floor(y+dy);
            if(ty>this.surface[Math.max(0,Math.min(WORLD_W-1,tx))]+3) this.set(tx,ty,T.AIR);
          }
        }
        dir += (this.rng()-0.5)*1.2;
        x += Math.cos(dir)*1.8; y += Math.sin(dir)*1.2;
        if(y<0||y>=WORLD_H||x<0||x>=WORLD_W) break;
      }
    }
  }

  placeOres(){
    const veins = [
      {t:T.COAL,   n:110, minY:0.40, maxY:0.95, size:6},
      {t:T.IRON,   n:80,  minY:0.50, maxY:0.95, size:5},
      {t:T.GOLD,   n:45,  minY:0.65, maxY:0.98, size:4},
      {t:T.DIAMOND,n:22,  minY:0.80, maxY:1.0,  size:3},
    ];
    for(const v of veins){
      for(let i=0;i<v.n;i++){
        let x = Math.floor(this.rng()*WORLD_W);
        let y = Math.floor(WORLD_H*(v.minY + this.rng()*(v.maxY-v.minY)));
        for(let j=0;j<v.size;j++){
          if(this.get(x,y)===T.STONE) this.set(x,y,v.t);
          x += Math.floor(this.rng()*3)-1; y += Math.floor(this.rng()*3)-1;
        }
      }
    }
  }

  placeTrees(){
    for(let x=4;x<WORLD_W-4;x++){
      if(this.rng()<0.12 && this.get(x,this.surface[x])===T.GRASS){
        const h = 5+Math.floor(this.rng()*4);
        const top = this.surface[x]-h;
        for(let y=this.surface[x]-1;y>top;y--) this.set(x,y,T.WOOD_LOG);
        // 树冠
        for(let dy=-2;dy<=1;dy++)for(let dx=-2;dx<=2;dx++){
          if(Math.abs(dx)+Math.abs(dy)<=3 && this.get(x+dx,top+dy)===T.AIR)
            this.set(x+dx,top+dy,T.LEAF);
        }
        x += 3; // 树间距
      }
    }
  }

  placeSandPatches(){
    for(let i=0;i<10;i++){
      const cx = Math.floor(this.rng()*WORLD_W);
      const w = 6+Math.floor(this.rng()*10);
      for(let x=cx;x<Math.min(WORLD_W,cx+w);x++){
        const s=this.surface[x];
        for(let y=s;y<s+3+Math.floor(this.rng()*3);y++){
          const t=this.get(x,y);
          if(t===T.GRASS||t===T.DIRT) this.set(x,y,T.SAND);
        }
      }
    }
  }

  // 挖掘：返回被挖掉的方块类型(掉落)，未挖穿返回 null
  mine(x,y,power){
    const t = this.get(x,y);
    if(t===T.AIR) return null;
    const key = x+','+y;
    const info = TileInfo[t];
    this.damage[key] = (this.damage[key]||0) + power;
    if(this.damage[key] >= info.hp){
      delete this.damage[key];
      this.set(x,y,T.AIR);
      // 砍树：上方原木连锁掉落
      if(t===T.WOOD_LOG){
        let yy=y-1, extra=0;
        while(this.get(x,yy)===T.WOOD_LOG && extra<20){ this.set(x,yy,T.AIR); extra++; yy--; }
        return {drop:T.WOOD_LOG, count:1+extra};
      }
      const d = 'drops' in info ? info.drops : t;
      return d===null ? {drop:null,count:0} : {drop:d, count:1};
    }
    return null;
  }
  getDamageRatio(x,y){
    const t=this.get(x,y);
    if(t===T.AIR) return 0;
    return (this.damage[x+','+y]||0)/TileInfo[t].hp;
  }
}
