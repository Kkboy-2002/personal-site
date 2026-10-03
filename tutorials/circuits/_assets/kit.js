/* 硬件电路面试图解 · 共用脚本（非模块，普通 <script src> 引入） */
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const show = (el, on) => el.toggleAttribute('hidden', !on);

/* 分段按钮组：<div class="seg" id="x"><button data-v="a" aria-pressed="true">…</button>…</div> */
function seg(id, cb) {
  const g = $(id);
  g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    cb(b.dataset.v);
  });
}

/* 数值格式化 */
function fmtA(a) { const s = a < 0 ? '−' : ''; a = Math.abs(a);
  if (a >= 1) return s + a.toFixed(a >= 10 ? 1 : 2) + ' A';
  if (a >= 1e-3) return s + (a * 1e3).toFixed(a >= 1e-2 ? 1 : 2) + ' mA';
  if (a >= 1e-6) return s + (a * 1e6).toFixed(a >= 1e-5 ? 0 : 1) + ' µA';
  return s + (a * 1e9).toFixed(1) + ' nA'; }
function fmtV(v, d = 2) { return (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + ' V'; }
function fmtT(s) { if (s >= 1e-3) return (s * 1e3).toFixed(s >= 1e-2 ? 1 : 2) + ' ms';
  if (s >= 1e-6) return (s * 1e6).toFixed(s >= 1e-5 ? 1 : 2) + ' µs';
  return (s * 1e9).toFixed(0) + ' ns'; }
function fmtR(r) { if (r >= 1e6) return +(r / 1e6).toFixed(2) + ' MΩ'; if (r >= 1e3) return +(r / 1e3).toFixed(2) + ' kΩ';
  if (r >= 1) return +r.toFixed(2) + ' Ω'; return +(r * 1e3).toFixed(1) + ' mΩ'; }
function fmtF(f) { if (f >= 1e6) return +(f / 1e6).toFixed(2) + ' MHz'; if (f >= 1e3) return +(f / 1e3).toFixed(1) + ' kHz'; return +f.toFixed(1) + ' Hz'; }
function fmtP(p) { if (p >= 1) return p.toFixed(2) + ' W'; return (p * 1e3).toFixed(p >= 1e-2 ? 0 : 1) + ' mW'; }

/* 高低电平着色：文字 fill 与导线 stroke 同步 */
function setLv(textEl, wireEl, hi) {
  if (textEl) { textEl.classList.toggle('hi', hi); textEl.classList.toggle('lo', !hi); }
  if (wireEl) { wireEl.classList.toggle('s-hi', hi); wireEl.classList.toggle('s-lo', !hi); }
}
/* 状态胶囊：cls = on | off | bad | warn */
function chip(el, txt, cls) { el.textContent = txt; el.className = 'chip ' + cls; }

/* 坐标映射：返回 {X, Y}，把数据值映射到 SVG 坐标 */
function scale(x0, x1, px0, px1) { return v => px0 + (v - x0) / (x1 - x0) * (px1 - px0); }
/* 生成 polyline points 字符串：fn(x) 在 [a,b] 上采样 n 段 */
function plot(fn, a, b, X, Y, n = 160) {
  const p = []; for (let k = 0; k <= n; k++) { const x = a + (b - a) * k / n; const y = fn(x);
    if (isFinite(y)) p.push(X(x).toFixed(1) + ',' + Y(y).toFixed(1)); }
  return p.join(' ');
}
/* 创建 SVG 元素 */
function svgEl(tag, attrs, text) { const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
