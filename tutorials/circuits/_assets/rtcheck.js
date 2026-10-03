// 运行时检查：node rtcheck.js <html 文件或文件夹>...
// 用无头 Chrome/Edge 真实打开每一页，依次检查：
//   1. 脚本异常、console.error、本地资源加载失败（Google 字体除外）
//   2. 点击所有按钮、拖遍所有滑块、切换复选框和下拉框后，文字和 SVG 属性里有没有 NaN / undefined / Infinity
//   3. 默认状态下 SVG 里的文字有没有互相重叠、有没有超出画布被裁掉
//   4. 400px 手机宽度下页面有没有横向溢出
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const BROWSER = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => p && fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function collect(args) {
  const out = [];
  for (const a of args) {
    if (fs.statSync(a).isDirectory()) out.push(...fs.readdirSync(a).filter(f => f.endsWith('.html')).sort().map(f => path.join(a, f)));
    else out.push(a);
  }
  return out;
}

/* 在页面里执行：交互 + 数值检查 + 文字重叠检查 */
async function probe() {
  const bad = [];
  const RE = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object /;
  const scan = tag => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: x => /^(SCRIPT|STYLE)$/.test(x.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }); let n;
    while ((n = w.nextNode())) if (RE.test(n.nodeValue)) bad.push(`${tag}文本异常: "${n.nodeValue.trim().slice(0, 50)}"`);
    document.querySelectorAll('svg, svg *').forEach(el => {
      for (const a of el.attributes) if (RE.test(a.value)) bad.push(`${tag}SVG 属性异常: ${el.id || el.tagName}.${a.name}="${a.value.slice(0, 40)}"`);
    });
  };
  const visible = el => el.getClientRects().length > 0 && !el.closest('[hidden]');
  const label = t => '"' + t.textContent.trim().slice(0, 14) + '"';
  document.querySelectorAll('svg').forEach((svg, si) => {
    if (!visible(svg)) return;
    const sr = svg.getBoundingClientRect(); if (!sr.width) return;
    const rs = [...svg.querySelectorAll('text')].filter(t => visible(t) && t.textContent.trim()).map(t => ({ t, r: t.getBoundingClientRect() }));
    rs.forEach(({ t, r }) => {
      if (r.left < sr.left - 2 || r.right > sr.right + 2 || r.top < sr.top - 2 || r.bottom > sr.bottom + 2) bad.push(`图${si + 1} 文字超出画布: ${label(t)}`);
    });
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i].r, b = rs[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 1 && h > 1 && w * h > 0.3 * Math.min(a.width * a.height, b.width * b.height)) bad.push(`图${si + 1} 文字重叠: ${label(rs[i].t)} 与 ${label(rs[j].t)}`);
    }
  });
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const ranges = [...document.querySelectorAll('input[type=range]')];
  const sweep = () => ranges.forEach(r => {
    const lo = r.min === '' ? 0 : +r.min, hi = r.max === '' ? 100 : +r.max, orig = r.value;
    for (let k = 0; k <= 6; k++) { r.value = String(lo + (hi - lo) * k / 6); fire(r, 'input'); fire(r, 'change'); }
    r.value = orig; fire(r, 'input'); fire(r, 'change');
  });
  scan('初始');
  sweep(); scan('拖滑块后');
  for (const b of document.querySelectorAll('button')) { try { b.click(); } catch (e) { bad.push('点击异常: ' + e.message); } sweep(); }
  document.querySelectorAll('input[type=checkbox], input[type=radio]').forEach(c => { c.click(); sweep(); c.click(); sweep(); });
  document.querySelectorAll('select').forEach(s => { for (let i = 0; i < s.options.length; i++) { s.selectedIndex = i; fire(s, 'change'); fire(s, 'input'); sweep(); } });
  scan('点按钮后');
  await new Promise(r => setTimeout(r, 500));
  scan('结束');
  return [...new Set(bad)];
}

/* 在页面里执行：手机宽度横向溢出检查 */
function overflow() {
  const de = document.documentElement, vw = de.clientWidth;
  if (de.scrollWidth <= vw + 1) return [];
  const off = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.right > vw + 1)) return;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) return;
    }
    off.push(el);
  });
  const outer = off.filter(el => !off.some(o => o !== el && o.contains(el)));
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '');
  return [`手机宽度下横向溢出 ${de.scrollWidth - vw}px: ` + outer.slice(0, 4).map(name).join('，')];
}

async function main() {
  const files = collect(process.argv.slice(2));
  if (!BROWSER) throw new Error('找不到 Chrome 或 Edge');
  const port = 9300 + Math.floor(Math.random() * 600);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rtcheck-'));
  const br = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = j.find(t => t.type === 'page'); if (p) wsUrl = p.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(150);
  }
  if (!wsUrl) { br.kill(); throw new Error('浏览器没有启动'); }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0, cur = null, onLoad = null;
  const pend = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Page.loadEventFired' && onLoad) { onLoad(); return; }
    if (!cur) return;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      cur.push('脚本异常: ' + String((d.exception && d.exception.description) || d.text).split('\n')[0] + (d.lineNumber != null ? `（第 ${d.lineNumber + 1} 行）` : ''));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      cur.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 120));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      const e = m.params.entry; if (!/fonts\.(googleapis|gstatic)\.com/.test((e.url || '') + e.text)) cur.push('加载错误: ' + e.text.slice(0, 100) + ' ' + (e.url || ''));
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++seq; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalIn = async (fn, awaitPromise) => {
    const r = await send('Runtime.evaluate', { expression: `(${fn})()`, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) return ['检查脚本自身出错: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]];
    return r.result.value || [];
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  let failed = 0;
  for (const f of files) {
    cur = [];
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const loaded = new Promise(r => { onLoad = r; });
    await send('Page.navigate', { url: pathToFileURL(path.resolve(f)).href });
    await Promise.race([loaded, sleep(15000)]);
    await sleep(300);
    cur.push(...await evalIn(probe, true));
    await send('Page.reload', {});
    await sleep(800);
    await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    cur.push(...await evalIn(overflow, false));
    const uniq = [...new Set(cur)];
    console.log((uniq.length ? 'FAIL ' : 'OK   ') + path.basename(path.dirname(f)) + '/' + path.basename(f));
    uniq.slice(0, 14).forEach(x => console.log('     - ' + x));
    if (uniq.length > 14) console.log(`     - ……另有 ${uniq.length - 14} 条`);
    if (uniq.length) failed++;
  }
  cur = null; ws.close(); br.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
  console.log(`\n共 ${files.length} 页，${failed} 页有问题`);
  process.exitCode = failed ? 1 : 0;
}
main().catch(e => { console.error(e); process.exit(2); });
