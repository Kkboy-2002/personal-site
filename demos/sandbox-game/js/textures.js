// textures.js — 程序化生成像素贴图（32x32 精细版），无需外部图片
const TILE = 32;      // 屏幕上每格像素
const TEX = 32;       // 贴图分辨率 32x32

// 简单可重复的伪随机
function makeRng(seed){
  let s = seed >>> 0;
  return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeTex(draw, w=TEX, h=TEX){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g);
  return c;
}

// 基础噪点填充：主色 + 多级明暗变化 + 2x2 色块让颗粒更自然
function noisyFill(g, base, dark, light, seed, darkChance=0.16, lightChance=0.12){
  const rng = makeRng(seed);
  g.fillStyle = base; g.fillRect(0,0,TEX,TEX);
  for(let y=0;y<TEX;y+=2)for(let x=0;x<TEX;x+=2){
    const r = rng();
    if(r < darkChance){ g.fillStyle = dark; g.fillRect(x,y,2,2); }
    else if(r < darkChance+lightChance){ g.fillStyle = light; g.fillRect(x,y,2,2); }
  }
  // 细颗粒
  for(let i=0;i<70;i++){
    const x=Math.floor(rng()*TEX), y=Math.floor(rng()*TEX);
    g.fillStyle = rng()<0.5?dark:light;
    g.fillRect(x,y,1,1);
  }
}

// 顶部高光 + 底部阴影，增强立体感
function bevel(g, lightA=0.10, darkA=0.18){
  g.fillStyle=`rgba(255,255,255,${lightA})`; g.fillRect(0,0,TEX,2); g.fillRect(0,0,2,TEX);
  g.fillStyle=`rgba(0,0,0,${darkA})`; g.fillRect(0,TEX-2,TEX,2); g.fillRect(TEX-2,0,2,TEX);
}

// 矿石：石头底 + 矿物晶簇（带高光和暗边）
function oreTex(oreDark, oreColor, oreLight, seed){
  return makeTex(g=>{
    noisyFill(g,'#6b6b6b','#565656','#7d7d7d',seed);
    const rng = makeRng(seed*7+3);
    for(let i=0;i<5;i++){
      const cx = 3+Math.floor(rng()*24), cy = 3+Math.floor(rng()*24);
      const s = 3+Math.floor(rng()*3);
      g.fillStyle = oreDark;  g.fillRect(cx-1,cy-1,s+2,s+2);
      g.fillStyle = oreColor; g.fillRect(cx,cy,s,s);
      g.fillStyle = oreLight; g.fillRect(cx,cy,Math.ceil(s/2),Math.ceil(s/2));
      g.fillStyle = '#ffffff'; g.fillRect(cx,cy,1,1);
      if(rng()<0.6){ g.fillStyle=oreColor; g.fillRect(cx+s,cy+1,2,2); }
    }
    bevel(g,0.06,0.14);
  });
}

const Textures = {};

Textures.dirt = makeTex(g=>{
  noisyFill(g,'#8b5a2b','#6e4522','#a06a35',11);
  // 小石子
  const rng=makeRng(12);
  for(let i=0;i<5;i++){
    const x=Math.floor(rng()*28),y=Math.floor(rng()*28);
    g.fillStyle='#77797c'; g.fillRect(x,y,3,2);
    g.fillStyle='#9a9da0'; g.fillRect(x,y,2,1);
  }
  bevel(g,0.05,0.12);
});

Textures.grass = makeTex(g=>{
  noisyFill(g,'#8b5a2b','#6e4522','#a06a35',22);
  const rng = makeRng(99);
  // 顶部草层（带锯齿过渡）
  g.fillStyle='#3faf3f'; g.fillRect(0,0,TEX,7);
  g.fillStyle='#2e8b2e';
  for(let x=0;x<TEX;x+=2){
    const d = 6+Math.floor(rng()*4);
    g.fillRect(x,d,2,2);
    g.fillRect(x,5,2,2);
  }
  // 草叶明暗
  g.fillStyle='#5ecf5e';
  for(let x=0;x<TEX;x+=2){ if(rng()<0.5) g.fillRect(x,0,2,2+Math.floor(rng()*2)); }
  g.fillStyle='#7fe87f';
  for(let x=0;x<TEX;x+=3){ if(rng()<0.4) g.fillRect(x,0,1,2); }
  // 伸出的草尖
  g.fillStyle='#4cbf4c';
  for(let x=2;x<TEX-2;x+=5){ if(rng()<0.6) g.fillRect(x, -0, 1, 1); }
  bevel(g,0.04,0.12);
});

Textures.stone = makeTex(g=>{
  noisyFill(g,'#6b6b6b','#565656','#7d7d7d',33);
  const rng = makeRng(34);
  // 石块拼合缝
  g.fillStyle='#4e4e4e';
  g.fillRect(0,10,14,1); g.fillRect(14,10,1,12); g.fillRect(15,21,17,1);
  g.fillRect(20,0,1,10); g.fillRect(6,22,1,10);
  // 裂纹
  for(let i=0;i<3;i++){
    let x=Math.floor(rng()*TEX), y=Math.floor(rng()*TEX);
    for(let j=0;j<7;j++){ g.fillRect(x,y,1,1); x=(x+(rng()<0.5?1:0))%TEX; y=(y+1)%TEX; }
  }
  // 高光棱
  g.fillStyle='#8a8a8a';
  g.fillRect(1,11,12,1); g.fillRect(16,22,14,1);
  bevel(g,0.06,0.16);
});

Textures.log = makeTex(g=>{
  noisyFill(g,'#6b4423','#54351b','#7d522b',55,0.12,0.1);
  const rng=makeRng(56);
  // 树皮竖纹
  g.fillStyle='#4a2e17';
  g.fillRect(0,0,3,TEX); g.fillRect(TEX-3,0,3,TEX);
  for(let x=7;x<TEX-4;x+=6){
    for(let y=0;y<TEX;y+=2){ if(rng()<0.7) g.fillRect(x+(rng()<0.3?1:0),y,1,2); }
  }
  // 节疤
  g.fillStyle='#3d2512'; g.fillRect(12,14,6,4);
  g.fillStyle='#54351b'; g.fillRect(13,15,4,2);
  bevel(g,0.05,0.14);
});

Textures.leaf = makeTex(g=>{
  noisyFill(g,'#2e8b2e','#1f661f','#4cbf4c',66,0.22,0.2);
  const rng=makeRng(67);
  // 叶片簇高光
  for(let i=0;i<10;i++){
    const x=Math.floor(rng()*28),y=Math.floor(rng()*28);
    g.fillStyle='#63d963'; g.fillRect(x,y,3,2);
    g.fillStyle='#8cf08c'; g.fillRect(x,y,1,1);
  }
  // 缝隙
  for(let i=0;i<6;i++){
    g.fillStyle='rgba(10,40,10,0.7)';
    g.fillRect(Math.floor(rng()*30),Math.floor(rng()*30),2,2);
  }
});

Textures.sand = makeTex(g=>{
  noisyFill(g,'#dbc478','#c4ab5f','#ecd98f',77);
  const rng=makeRng(78);
  // 波纹
  g.fillStyle='#c4ab5f';
  for(let y=6;y<TEX;y+=9){
    for(let x=0;x<TEX;x+=2) g.fillRect(x,y+Math.floor(Math.sin(x*0.5)*1.5),2,1);
  }
  bevel(g,0.06,0.1);
});

Textures.coal    = oreTex('#101014','#26262e','#42424e',101);
Textures.iron    = oreTex('#8a5f42','#b88a6a','#dcb28d',102);
Textures.gold    = oreTex('#a5811a','#e2b933','#ffe066',103);
Textures.diamond = oreTex('#1e8fa0','#4dd8e6','#aef5fd',104);

Textures.plank = makeTex(g=>{
  noisyFill(g,'#b3803f','#96692f','#c69350',88,0.08,0.1);
  // 板缝 + 钉子
  g.fillStyle='#7c5527';
  g.fillRect(0,10,TEX,2); g.fillRect(0,22,TEX,2);
  g.fillRect(8,0,2,10); g.fillRect(20,12,2,10); g.fillRect(12,24,2,8);
  g.fillStyle='#5c5c5c';
  g.fillRect(3,3,2,2); g.fillRect(27,15,2,2); g.fillRect(5,27,2,2);
  bevel(g,0.08,0.14);
});

Textures.torch = makeTex(g=>{
  g.clearRect(0,0,TEX,TEX);
  // 柄
  g.fillStyle='#7c5227'; g.fillRect(14,16,4,15);
  g.fillStyle='#5c3b1a'; g.fillRect(17,16,1,15);
  // 火焰（三层）
  g.fillStyle='#ff5a1f'; g.fillRect(12,8,8,9);
  g.fillStyle='#ff9a1f'; g.fillRect(13,9,6,7);
  g.fillStyle='#ffd21f'; g.fillRect(14,10,4,5);
  g.fillStyle='#fff3a0'; g.fillRect(15,12,2,2);
  g.fillStyle='#ff9a1f'; g.fillRect(14,6,3,2); // 火苗尖
});

// 背景墙（较暗，带砖缝）
Textures.dirtWall = makeTex(g=>{
  noisyFill(g,'#5a3a1c','#4a2f16','#684423',111,0.2,0.08);
  g.fillStyle='rgba(0,0,0,0.25)';
  g.fillRect(0,15,TEX,1); g.fillRect(10,0,1,15); g.fillRect(22,16,1,16);
});
Textures.stoneWall= makeTex(g=>{
  noisyFill(g,'#454545','#383838','#525252',112,0.2,0.08);
  g.fillStyle='rgba(0,0,0,0.3)';
  g.fillRect(0,10,TEX,1); g.fillRect(0,21,TEX,1);
  g.fillRect(8,0,1,10); g.fillRect(24,11,1,10); g.fillRect(14,22,1,10);
});

// ============ 角色精灵 ============
// 玩家（20x30，两帧行走动画 + 站立帧）
function drawPlayerFrame(g, legPose){
  // legPose: 0站立 1左腿前 2右腿前
  g.clearRect(0,0,20,30);
  // 头发
  g.fillStyle='#5a3a1c'; g.fillRect(5,0,10,4);
  g.fillRect(4,2,2,6); g.fillRect(14,2,2,5);
  // 脸
  g.fillStyle='#f0c8a0'; g.fillRect(6,3,8,6);
  g.fillStyle='#e0b088'; g.fillRect(6,8,8,1);
  // 眼睛
  g.fillStyle='#fff'; g.fillRect(11,5,2,2);
  g.fillStyle='#2a4a8a'; g.fillRect(12,5,1,2);
  // 上衣
  g.fillStyle='#3a6ea5'; g.fillRect(5,9,10,10);
  g.fillStyle='#2c5480'; g.fillRect(5,9,2,10); g.fillRect(13,9,2,10);
  g.fillStyle='#4a86c5'; g.fillRect(7,10,6,2); // 胸口高光
  // 手
  g.fillStyle='#f0c8a0'; g.fillRect(5,17,2,3); g.fillRect(13,17,2,3);
  // 裤子 + 腿
  g.fillStyle='#556b2f';
  if(legPose===0){ g.fillRect(6,19,8,7); }
  else if(legPose===1){ g.fillRect(5,19,4,7); g.fillRect(11,19,4,6); }
  else { g.fillRect(5,19,4,6); g.fillRect(11,19,4,7); }
  // 鞋
  g.fillStyle='#3d2817';
  if(legPose===0){ g.fillRect(6,26,3,4); g.fillRect(11,26,3,4); }
  else if(legPose===1){ g.fillRect(4,26,4,4); g.fillRect(12,25,3,4); }
  else { g.fillRect(4,25,3,4); g.fillRect(12,26,4,4); }
}
Textures.playerFrames = [0,1,2].map(p=>makeTex(g=>drawPlayerFrame(g,p),20,30));

// 蓝史莱姆 / 绿史莱姆
function slimeTex(body, hi, eye){
  return makeTex(g=>{
    g.fillStyle=body;
    g.fillRect(4,8,24,14); g.fillRect(8,4,16,4); g.fillRect(2,12,28,8);
    g.fillStyle=hi; g.fillRect(8,8,6,4); g.fillRect(10,6,3,2);
    g.fillStyle=eye; g.fillRect(20,12,4,4); g.fillRect(14,13,3,3);
    g.fillStyle='rgba(255,255,255,0.6)'; g.fillRect(21,13,1,1);
  },32,24);
}
Textures.slimeBlue  = slimeTex('rgba(60,120,255,0.85)','rgba(150,200,255,0.9)','#102040');
Textures.slimeGreen = slimeTex('rgba(70,200,90,0.85)','rgba(160,255,170,0.9)','#0a3010');

// 僵尸（20x30）
Textures.zombie = makeTex(g=>{
  // 头
  g.fillStyle='#7aa05a'; g.fillRect(5,0,10,9);
  g.fillStyle='#5c7a42'; g.fillRect(5,0,10,3);
  g.fillStyle='#c03030'; g.fillRect(11,4,2,2); // 红眼
  g.fillStyle='#4a6034'; g.fillRect(6,8,8,1);
  // 破烂衣服
  g.fillStyle='#6a5a3a'; g.fillRect(5,9,10,10);
  g.fillStyle='#544628'; g.fillRect(5,9,2,10); g.fillRect(13,9,2,10);
  g.fillStyle='#7aa05a'; g.fillRect(3,10,2,6); g.fillRect(15,10,2,6); // 前伸手臂
  g.fillRect(5,17,2,2); g.fillRect(13,17,2,2);
  // 裤子
  g.fillStyle='#3a4a5a'; g.fillRect(6,19,3,8); g.fillRect(11,19,3,8);
  g.fillStyle='#2a3644'; g.fillRect(6,27,3,3); g.fillRect(11,27,3,3);
},20,30);

// 蝙蝠（24x16）
Textures.bat = makeTex(g=>{
  g.fillStyle='#3a2a4a';
  g.fillRect(0,4,6,6); g.fillRect(18,4,6,6);       // 翅膀
  g.fillRect(2,2,5,3); g.fillRect(17,2,5,3);
  g.fillStyle='#54406a'; g.fillRect(9,4,6,8);       // 身体
  g.fillStyle='#3a2a4a'; g.fillRect(8,2,2,3); g.fillRect(14,2,2,3); // 耳朵
  g.fillStyle='#ff4040'; g.fillRect(10,6,1,2); g.fillRect(13,6,1,2); // 眼
  g.fillStyle='#fff'; g.fillRect(10,11,1,2); g.fillRect(13,11,1,2);  // 牙
},24,16);

// Boss：克苏鲁之眼（56x56，两个阶段）
function eyeTex(phase2){
  return makeTex(g=>{
    const cx=28, cy=28;
    // 眼球本体
    g.fillStyle= phase2 ? '#8a2020' : '#d8d8e0';
    g.beginPath(); g.arc(cx,cy,24,0,7); g.fill();
    g.fillStyle= phase2 ? '#a83030' : '#f0f0f5';
    g.beginPath(); g.arc(cx-5,cy-5,18,0,7); g.fill();
    // 血丝
    g.strokeStyle= phase2 ? '#5a0808' : '#c04040'; g.lineWidth=1.5;
    for(let i=0;i<7;i++){
      const a=i/7*Math.PI*2;
      g.beginPath();
      g.moveTo(cx+Math.cos(a)*23, cy+Math.sin(a)*23);
      g.lineTo(cx+Math.cos(a+0.35)*13, cy+Math.sin(a+0.35)*13);
      g.stroke();
    }
    if(phase2){
      // 第二阶段：巨口獠牙
      g.fillStyle='#3a0505';
      g.beginPath(); g.arc(cx,cy,12,0,7); g.fill();
      g.fillStyle='#f0f0e0';
      for(let i=0;i<6;i++){
        const a=i/6*Math.PI*2+0.3;
        const tx=cx+Math.cos(a)*10, ty=cy+Math.sin(a)*10;
        g.beginPath();
        g.moveTo(tx-2,ty-2); g.lineTo(tx+2,ty-2); g.lineTo(tx,ty+4); g.closePath(); g.fill();
      }
    } else {
      // 第一阶段：绿瞳
      g.fillStyle='#2a7a3a'; g.beginPath(); g.arc(cx,cy,11,0,7); g.fill();
      g.fillStyle='#48b858'; g.beginPath(); g.arc(cx,cy,8,0,7); g.fill();
      g.fillStyle='#0a2a10'; g.beginPath(); g.arc(cx,cy,4,0,7); g.fill();
      g.fillStyle='rgba(255,255,255,0.85)'; g.beginPath(); g.arc(cx-3,cy-4,2.5,0,7); g.fill();
    }
    // 后部触须
    g.fillStyle= phase2 ? '#6a1515' : '#b0b0bc';
    for(let i=0;i<4;i++){
      g.fillRect(2, 16+i*7, 6, 3);
    }
  },56,56);
}
Textures.bossEye1 = eyeTex(false);
Textures.bossEye2 = eyeTex(true);

// ============ 物品图标 ============
function swordTex(bladeDark, blade, bladeHi, guard){
  return makeTex(g=>{
    // 剑刃（斜向）
    for(let i=0;i<14;i++){
      g.fillStyle=blade;   g.fillRect(24-i, 4+i, 4, 2);
      g.fillStyle=bladeHi; g.fillRect(24-i, 4+i, 1, 2);
      g.fillStyle=bladeDark; g.fillRect(27-i, 4+i, 1, 2);
    }
    g.fillStyle=bladeHi; g.fillRect(26,3,3,3); // 尖
    // 护手
    g.fillStyle=guard;
    g.fillRect(8,17,7,3); g.fillRect(12,14,3,7);
    // 柄
    g.fillStyle='#5c3b1a'; g.fillRect(6,20,5,5);
    g.fillStyle='#7c5227'; g.fillRect(7,21,2,2);
    g.fillStyle='#e2b933'; g.fillRect(4,24,4,4); // 柄尾
  });
}
Textures.swordWood  = swordTex('#6e4522','#9a6a33','#c69350','#7c5227');
Textures.swordStone = swordTex('#4e4e4e','#7d7d7d','#a5a5a5','#565656');
Textures.swordIron  = swordTex('#8a5f42','#c9a488','#eed4bc','#7a5232');
Textures.swordGold  = swordTex('#a5811a','#e2b933','#ffe066','#8a6a15');
Textures.swordDiamond = swordTex('#1e8fa0','#4dd8e6','#c9f8ff','#2aa8ba');

// 石砖
Textures.stoneBrick = makeTex(g=>{
  noisyFill(g,'#7d7d7d','#666','#909090',201,0.1,0.1);
  g.fillStyle='#4a4a4a';
  g.fillRect(0,0,TEX,2); g.fillRect(0,15,TEX,2);
  g.fillRect(15,2,2,13); g.fillRect(7,17,2,15); g.fillRect(23,17,2,15);
  g.fillStyle='rgba(255,255,255,0.12)';
  g.fillRect(0,2,TEX,1); g.fillRect(0,17,TEX,1);
  bevel(g,0.06,0.16);
});

// 玻璃（半透明）
Textures.glass = makeTex(g=>{
  g.fillStyle='rgba(180,220,240,0.28)'; g.fillRect(0,0,TEX,TEX);
  g.strokeStyle='rgba(220,240,250,0.8)'; g.lineWidth=2;
  g.strokeRect(1,1,TEX-2,TEX-2);
  g.strokeStyle='rgba(255,255,255,0.55)'; g.lineWidth=2;
  g.beginPath(); g.moveTo(6,14); g.lineTo(14,6); g.stroke();
  g.beginPath(); g.moveTo(10,24); g.lineTo(24,10); g.stroke();
});

// 生命药水
Textures.potion = makeTex(g=>{
  g.fillStyle='#c8a86a'; g.fillRect(13,2,6,3);      // 软木塞
  g.fillStyle='#b8d8e8'; g.fillRect(14,5,4,4);      // 瓶颈
  g.fillStyle='rgba(180,220,240,0.75)';             // 瓶身
  g.fillRect(9,9,14,18); g.fillRect(11,7,10,2); g.fillRect(7,13,18,12);
  g.fillStyle='#e02040';                            // 红药水
  g.fillRect(10,15,12,11); g.fillRect(8,17,16,8);
  g.fillStyle='#ff6080'; g.fillRect(11,16,4,3);
  g.fillStyle='rgba(255,255,255,0.6)'; g.fillRect(10,10,2,6);
});

// 凝胶（史莱姆掉落）
Textures.gel = makeTex(g=>{
  g.fillStyle='rgba(60,120,255,0.8)';
  g.fillRect(8,12,16,12); g.fillRect(11,9,10,3); g.fillRect(6,16,20,6);
  g.fillStyle='rgba(150,200,255,0.9)'; g.fillRect(11,12,5,4);
  g.fillStyle='rgba(30,70,180,0.8)'; g.fillRect(20,18,3,3);
});

// 召唤物品：可疑的眼球
Textures.summonEye = makeTex(g=>{
  g.fillStyle='#8a2020'; g.beginPath(); g.arc(16,17,11,0,7); g.fill();
  g.fillStyle='#c04040'; g.beginPath(); g.arc(14,15,8,0,7); g.fill();
  g.fillStyle='#f0e0e0'; g.beginPath(); g.arc(15,16,5,0,7); g.fill();
  g.fillStyle='#202040'; g.beginPath(); g.arc(16,17,2.5,0,7); g.fill();
  g.fillStyle='#6a1515';
  g.fillRect(14,3,2,4); g.fillRect(10,4,2,3); g.fillRect(19,4,2,3); // 神经
});

// ============ 环境装饰 ============
Textures.sun = makeTex(g=>{
  const gr=g.createRadialGradient(24,24,6,24,24,24);
  gr.addColorStop(0,'#fff7c0'); gr.addColorStop(0.5,'#ffd94d'); gr.addColorStop(1,'rgba(255,200,60,0)');
  g.fillStyle=gr; g.fillRect(0,0,48,48);
  g.fillStyle='#fff3a0'; g.beginPath(); g.arc(24,24,10,0,7); g.fill();
},48,48);

Textures.moon = makeTex(g=>{
  g.fillStyle='#e8e8f0'; g.beginPath(); g.arc(16,16,12,0,7); g.fill();
  g.fillStyle='#c8c8d8';
  g.beginPath(); g.arc(11,11,3,0,7); g.fill();
  g.beginPath(); g.arc(19,18,2,0,7); g.fill();
  g.beginPath(); g.arc(13,21,1.5,0,7); g.fill();
},32,32);

Textures.heart = makeTex(g=>{
  g.fillStyle='#a01020';
  g.fillRect(2,3,7,7); g.fillRect(11,3,7,7);
  g.fillRect(1,5,18,6); g.fillRect(3,11,14,3); g.fillRect(6,14,8,2); g.fillRect(8,16,4,2);
  g.fillStyle='#e02040';
  g.fillRect(3,4,5,5); g.fillRect(12,4,5,5); g.fillRect(2,6,16,4); g.fillRect(4,10,12,3) ;g.fillRect(7,13,6,2);
  g.fillStyle='#ff7090'; g.fillRect(4,5,2,2); g.fillRect(13,5,2,2);
},20,18);

// 云朵
Textures.cloud = makeTex(g=>{
  g.fillStyle='rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(20,22,12,0,7); g.arc(38,18,15,0,7); g.arc(56,22,11,0,7); g.arc(38,26,14,0,7);
  g.fill();
  g.fillStyle='rgba(230,235,245,0.8)';
  g.beginPath(); g.arc(38,28,12,0,7); g.arc(56,25,9,0,7); g.fill();
},72,40);
