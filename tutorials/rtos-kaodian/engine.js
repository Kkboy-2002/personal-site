// RTOS 考点实验台 — 迷你 FreeRTOS 内核模拟器（教学用，行为按 FreeRTOS 语义近似）
// 约定：1 步 = 运行任务执行 1 行 C 代码 = 1 个 tick（中断服务程序不消耗 tick）
window.RTOS = (function () {
  const STATE_CN = { RUNNING: '运行', READY: '就绪', BLOCKED: '阻塞', SUSPENDED: '挂起', DELETED: '已删除' };
  const pdTRUE = 1, pdFALSE = 0, INF = Infinity;

  // ---------- 记录构造器（生成器里 yield 的对象） ----------
  function mkK(sim) {
    const r = (where, op, a) => Object.assign({ where, op }, a || {});
    return {
      pdTRUE, pdFALSE, portMAX_DELAY: INF,
      L: (w) => r(w, 'nop'),
      exec: (w, fn) => r(w, 'exec', { fn }),
      printf: (w, text) => r(w, 'printf', { text }),
      delay: (w, n) => r(w, 'delay', { n }),
      delayUntil: (w, n) => r(w, 'delayUntil', { n }),
      qSend: (w, q, val, t) => r(w, 'qSend', { q, val, t }),
      qSendFront: (w, q, val, t) => r(w, 'qSend', { q, val, t, front: true }),
      qRecv: (w, q, into, t) => r(w, 'qRecv', { q, into, t }),
      semTake: (w, s, t) => r(w, 'semTake', { s, t }),
      semGive: (w, s) => r(w, 'semGive', { s }),
      egWait: (w, eg, bits, all, clear, t) => r(w, 'egWait', { eg, bits, all, clear, t }),
      egSet: (w, eg, bits) => r(w, 'egSet', { eg, bits }),
      notifyGive: (w, task) => r(w, 'notifyGive', { task }),
      notifyTake: (w, clearAll, t) => r(w, 'notifyTake', { clearAll, t }),
      notifySet: (w, task, val, action) => r(w, 'notifySet', { task, val, action }),
      notifyWait: (w, clearOnExit, into, t) => r(w, 'notifyWait', { clearOnExit, into, t }),
      suspend: (w, task) => r(w, 'suspend', { task }),
      resume: (w, task) => r(w, 'resume', { task }),
      del: (w, task) => r(w, 'del', { task }),
      setPrio: (w, task, p) => r(w, 'setPrio', { task, p }),
      enterCritical: (w) => r(w, 'enterCritical'),
      exitCritical: (w) => r(w, 'exitCritical'),
      suspendAll: (w) => r(w, 'suspendAll'),
      resumeAll: (w) => r(w, 'resumeAll'),
      yield: (w) => r(w, 'yield'),
      timerStart: (w, tm) => r(w, 'timerStart', { tm }),
      timerStop: (w, tm) => r(w, 'timerStop', { tm }),
      timerReset: (w, tm) => r(w, 'timerStart', { tm }),
      stackUse: (w, n) => r(w, 'stackUse', { n }),
      stackFree: (w, n) => r(w, 'stackUse', { n: -n }),
      malloc: (w, name, n) => r(w, 'malloc', { name, n }),
      free: (w, name) => r(w, 'free', { name }),
      halt: (w, msg) => r(w, 'halt', { msg }),
      sleep: (w) => r(w, 'sleep'),
      // 中断上下文
      qSendISR: (w, q, val, woken) => r(w, 'qSendISR', { q, val, woken }),
      semGiveISR: (w, s, woken) => r(w, 'semGiveISR', { s, woken }),
      notifyGiveISR: (w, task, woken) => r(w, 'notifyGiveISR', { task, woken }),
      egSetISR: (w, eg, bits, woken) => r(w, 'egSetISR', { eg, bits, woken }),
      yieldFromISR: (w, woken) => r(w, 'yieldFromISR', { woken }),
      illegalBlockInISR: (w, s) => r(w, 'illegalBlock', { s }),
    };
  }

  // ---------- 内核对象 ----------
  function mkObj(sim, spec) {
    const o = { kind: spec.kind, name: spec.name, addr: sim.alloc(spec.size || 80, spec.name), waiting: [], waitingSend: [] };
    switch (spec.kind) {
      case 'queue': o.kindCN = '队列'; o.len = spec.len; o.items = []; break;
      case 'sem': o.kindCN = '二值信号量'; o.count = spec.init || 0; o.max = 1; break;
      case 'csem': o.kindCN = '计数信号量'; o.count = spec.init || 0; o.max = spec.max; break;
      case 'mutex': o.kindCN = '互斥量'; o.count = 1; o.max = 1; o.holder = null; break;
      case 'rmutex': o.kindCN = '递归互斥量'; o.count = 1; o.max = 1; o.holder = null; o.depth = 0; break;
      case 'eg': o.kindCN = '事件组'; o.bits = 0; break;
      case 'timer': o.kindCN = '软件定时器'; o.period = spec.period; o.auto = spec.auto !== false; o.cb = spec.cb; o.remaining = null; o.active = false; if (spec.start) { o.active = true; o.remaining = o.period; } break;
    }
    o.describe = function () {
      const w = this.waiting.map(t => t.name).join(',') || '无';
      switch (this.kind) {
        case 'queue': return [['长度', `${this.items.length} / ${this.len}`], ['内容', this.items.length ? '[' + this.items.join(', ') + ']' : '[]'], ['等待接收', w], ['等待发送', this.waitingSend.map(t => t.name).join(',') || '无']];
        case 'sem': return [['计数', `${this.count} (${this.count ? '可用' : '不可用'})`], ['等待', w]];
        case 'csem': return [['计数', `${this.count} / ${this.max}`], ['等待', w]];
        case 'mutex': return [['持有者', this.holder ? this.holder.name : '无(空闲)'], ['等待', w]];
        case 'rmutex': return [['持有者', this.holder ? this.holder.name : '无'], ['递归深度', this.depth], ['等待', w]];
        case 'eg': return [['事件位', '0b' + this.bits.toString(2).padStart(8, '0')], ['等待', this.waiting.map(t => `${t.name}(0b${t.egBits.toString(2)})`).join(',') || '无']];
        case 'timer': return [['周期', `${this.period} tick ${this.auto ? '自动重载' : '单次'}`], ['状态', this.active ? `运行中，剩余 ${this.remaining}` : '停止']];
      }
      return [];
    };
    return o;
  }

  function createSim(topic) {
    const spec = topic.sim;
    const sim = {
      tick: 0, stepNo: 0, log: [], timeline: [], tasks: [], objs: [], mem: [], running: null,
      critical: 0, schedSuspended: 0, halted: null, isrMasked: false, pendingISR: 0,
      heapSize: spec.heap || 10240, heapUsed: 0, heapNext: 0x20001000, ramNext: 0x20000000,
      forceSwitch: false, deferOnce: false, preempted: null, slicing: spec.slice !== false, colorSeq: 0,
      lines: topic.code.replace(/\n$/, '').split('\n'),
    };
    const O = {}; // 对象名 → 对象
    const M = { // 变量访问器
      get: n => { const c = sim.cell(n); return c ? c.val : undefined; },
      set: (n, v) => { const c = sim.cell(n); if (!c) return; c.val = v; c.changedAt = sim.stepNo + 1; return v; },
      obj: n => O[n],
    };
    sim.cell = n => sim.mem.find(c => c.name === n);
    sim.declare = (name, type, val) => { const size = /64|double/.test(type) ? 8 : /char|bool|8/.test(type) ? 1 : /16/.test(type) ? 2 : 4; const c = { name, type, val, addr: sim.ramNext, size, changedAt: -1 }; sim.mem.push(c); sim.ramNext += Math.max(4, size); return c; };
    sim.fmt = c => { if (typeof c.val === 'string') return c.val; if (c.type.includes('*') || /Handle/.test(c.type)) return c.val === 0 ? 'NULL' : '0x' + Number(c.val).toString(16).toUpperCase().padStart(8, '0'); return String(c.val); };
    sim.alloc = (n, what) => { const a = sim.heapNext; sim.heapNext += Math.ceil(n / 8) * 8; sim.heapUsed += n; if (sim.heapUsed > sim.heapSize) { sim.klog(`pvPortMalloc 失败：堆不足（申请 ${n} B，剩余 ${sim.heapSize - sim.heapUsed + n} B）`, 'e'); } return a; };
    sim.byName = n => sim.tasks.find(t => t.name === n);
    sim.klog = (text, kind) => sim.log.push({ tick: sim.tick, text, kind: kind || 'k' });
    sim.plog = text => sim.log.push({ tick: sim.tick, text, kind: 'p' });
    const K = mkK(sim);

    // 行号解析：'子串' 或 '子串#2'（第 2 次出现）
    function lineOf(where) {
      if (!where) return 0; if (typeof where === 'number') return where;
      let n = 1, key = where; const m = /^(.*)#(\d+)$/.exec(where); if (m) { key = m[1]; n = +m[2]; }
      for (let i = 0; i < sim.lines.length; i++) if (sim.lines[i].includes(key) && --n === 0) return i + 1;
      console.warn('未找到代码行:', where); return 0;
    }

    // 变量、对象、任务
    (spec.vars || []).forEach(([name, type, val]) => sim.declare(name, type, val));
    (spec.objs || []).forEach(s => { const o = mkObj(sim, s); sim.objs.push(o); O[s.name] = o; const c = sim.cell(s.name); if (c) c.val = o.addr; });
    function mkTask(t, pseudo) {
      const task = {
        name: t.name, prio: t.prio, basePrio: t.prio, state: 'READY', stackSize: t.stack || 512, stackUsed: Math.round((t.stack || 512) * 0.2), colorIdx: pseudo ? 0 : sim.colorSeq++,
        pseudo: !!pseudo, isISR: !!t.isISR, waitObj: null, waitKind: null, wakeTick: null, waitDesc: '', notifyVal: 0, lastRun: -1, egBits: 0, ret: undefined,
      };
      task.stackMax = task.stackUsed;
      if (!pseudo) { task.tcbAddr = sim.alloc(96, 'TCB ' + t.name); task.stackAddr = sim.alloc(task.stackSize, 'stack ' + t.name); const c = sim.cell(t.name + 'Handle') || sim.cell('h' + t.name); if (c) c.val = task.tcbAddr; }
      task.gen = t.run(K, M);
      const first = task.gen.next(); task.pc = first.done ? null : Object.assign({ line: lineOf(first.value.where) }, first.value);
      return task;
    }
    (spec.tasks || []).forEach(t => sim.tasks.push(mkTask(t)));
    sim.tasks.push(mkTask({ name: 'IDLE', prio: 0, stack: 128, run: function* (k, m) { while (true) { if (spec.idleHook) yield* spec.idleHook(k, m); else yield k.L(null); } } }));
    sim.tasks.forEach(t => { if (t.name === 'IDLE') t.colorIdx = 99; });

    // ---------- 阻塞 / 唤醒 ----------
    function block(t, obj, kind, timeout, desc, list) {
      t.state = 'BLOCKED'; t.waitObj = obj; t.waitKind = kind; t.waitDesc = desc; t.wakeTick = timeout === INF ? null : sim.tick + timeout;
      if (obj) { const l = list || obj.waiting; l.push(t); l.sort((a, b) => b.prio - a.prio); }
      if (sim.schedSuspended > 0 && !t.pseudo) sim.halt('configASSERT 失败：调度器挂起期间（vTaskSuspendAll 之后）调用了会阻塞的 API');
      return true;
    }
    function wake(t, ret, why) {
      if (t.state !== 'BLOCKED') return;
      if (t.waitObj) { const rm = l => { const i = l.indexOf(t); if (i >= 0) l.splice(i, 1); }; rm(t.waitObj.waiting); rm(t.waitObj.waitingSend); }
      t.state = 'READY'; t.waitObj = null; t.waitKind = null; t.waitDesc = ''; t.wakeTick = null;
      if (why) sim.klog(`${t.name} 就绪：${why}`);
      advance(t, ret);
      if (sim.running && !sim.running.isISR && t.prio > sim.running.prio && sim.schedSuspended === 0) sim.forceSwitch = true;
    }
    function advance(t, ret) {
      if (!t.gen) return;
      const n = t.gen.next(ret);
      if (n.done) { t.pc = null; if (t.pseudo) { t.state = 'DELETED'; } else { sim.halt(`任务 ${t.name} 的函数返回了！FreeRTOS 任务函数绝不能 return，必须 vTaskDelete(NULL)`); } return; }
      t.pc = Object.assign({ line: lineOf(n.value.where) }, n.value);
    }
    sim.halt = msg => { sim.halted = msg; sim.klog(msg, 'e'); };
    const findTask = ref => (ref == null ? sim.running : (typeof ref === 'string' ? sim.byName(ref) : ref));
    const cur = () => sim.running;

    // ---------- 执行一条记录 ----------
    function exec(t, rec) {
      const inISR = t.isISR;
      const badInISR = () => { sim.halt(`在中断里调用了非 FromISR 的 API（${rec.op}），可能阻塞或触发 configASSERT`); return pdFALSE; };
      switch (rec.op) {
        case 'nop': return;
        case 'exec': return rec.fn(M, t, sim);
        case 'printf': sim.plog(typeof rec.text === 'function' ? rec.text(M, t) : rec.text); return;
        case 'sleep': sim.klog('__WFI(): CPU 进入睡眠，等待中断/tick 唤醒'); return;
        case 'halt': sim.halt(rec.msg); return;
        case 'delay': if (inISR) return badInISR(); if (rec.n <= 0) return; block(t, null, 'delay', rec.n, `延时到 tick ${sim.tick + rec.n}`); return;
        case 'delayUntil': { if (t.lastWake == null) t.lastWake = sim.tick; const w = t.lastWake + rec.n; t.lastWake = w; if (w <= sim.tick) { sim.klog(`${t.name} vTaskDelayUntil：唤醒时刻已过，不阻塞直接返回`); return pdFALSE; } block(t, null, 'delay', w - sim.tick, `绝对延时到 tick ${w}`); return pdTRUE; }
        case 'qSend': { if (inISR) return badInISR(); const q = O[rec.q]; const v = typeof rec.val === 'function' ? rec.val(M) : rec.val;
          if (q.waiting.length) { const r = q.waiting[0]; M.set(r.waitInto, v); wake(r, pdTRUE, `收到 ${rec.q} 数据 ${v}`); return pdTRUE; }
          if (q.items.length < q.len) { rec.front ? q.items.unshift(v) : q.items.push(v); return pdTRUE; }
          if (rec.t === 0) { sim.klog(`${rec.q} 已满，${t.name} 立即返回 errQUEUE_FULL`); return pdFALSE; }
          t.pendVal = v; block(t, q, 'qSend', rec.t, `等待 ${rec.q} 有空位`, q.waitingSend); return; }
        case 'qRecv': { if (inISR) return badInISR(); const q = O[rec.q];
          if (q.items.length) { const v = q.items.shift(); M.set(rec.into, v); if (q.waitingSend.length) { const s = q.waitingSend[0]; q.items.push(s.pendVal); wake(s, pdTRUE, `${rec.q} 有空位，数据 ${s.pendVal} 已入队`); } return pdTRUE; }
          if (rec.t === 0) return pdFALSE;
          t.waitInto = rec.into; block(t, q, 'qRecv', rec.t, `等待 ${rec.q} 有数据`); return; }
        case 'semTake': { if (inISR) return badInISR(); const s = O[rec.s];
          if (s.kind === 'rmutex' && s.holder === t) { s.depth++; return pdTRUE; }
          if (s.count > 0) { s.count--; if (s.holder !== undefined) { s.holder = t; if (s.kind === 'rmutex') s.depth = 1; } return pdTRUE; }
          if (rec.t === 0) return pdFALSE;
          if (s.holder && s.holder.prio < t.prio) { sim.klog(`优先级继承：${s.holder.name} 的优先级 ${s.holder.prio} → ${t.prio}（因 ${t.name} 等待 ${rec.s}）`); s.holder.prio = t.prio; }
          if (s.holder === t) sim.klog(`${t.name} 重复获取自己持有的互斥量 ${rec.s}，将永久阻塞（自死锁）`, 'e');
          block(t, s, 'sem', rec.t, `等待 ${rec.s}`); return; }
        case 'semGive': { if (inISR) return badInISR(); const s = O[rec.s];
          if (s.holder !== undefined) { if (s.holder !== t) { sim.klog(`${t.name} 释放不属于自己的互斥量 ${rec.s}，返回 pdFALSE`, 'e'); return pdFALSE; }
            if (s.kind === 'rmutex' && --s.depth > 0) return pdTRUE;
            if (t.prio !== t.basePrio) { sim.klog(`取消继承：${t.name} 优先级恢复 ${t.prio} → ${t.basePrio}`); t.prio = t.basePrio; sim.forceSwitch = true; } }
          return give(s, t, rec.s); }
        case 'egWait': { if (inISR) return badInISR(); const eg = O[rec.eg]; const ok = rec.all ? (eg.bits & rec.bits) === rec.bits : (eg.bits & rec.bits) !== 0;
          if (ok) { const got = eg.bits; if (rec.clear) eg.bits &= ~rec.bits; return got; }
          if (rec.t === 0) return eg.bits;
          t.egBits = rec.bits; t.egAll = rec.all; t.egClear = rec.clear; block(t, eg, 'eg', rec.t, `等待事件位 0b${rec.bits.toString(2)}${rec.all ? '(全部)' : '(任一)'}`); return; }
        case 'egSet': { if (inISR) return badInISR(); egSet(O[rec.eg], rec.bits); return; }
        case 'notifyGive': { if (inISR) return badInISR(); const d = findTask(rec.task); d.notifyVal++; if (d.state === 'BLOCKED' && d.waitKind === 'notify') { const v = d.notifyVal; d.notifyVal = d.clearAll ? 0 : v - 1; wake(d, v, '收到任务通知'); } return; }
        case 'notifyTake': { if (inISR) return badInISR(); if (t.notifyVal > 0) { const v = t.notifyVal; t.notifyVal = rec.clearAll ? 0 : v - 1; return v; } if (rec.t === 0) return 0; t.clearAll = rec.clearAll; block(t, null, 'notify', rec.t, '等待任务通知'); return; }
        case 'notifySet': { if (inISR) return badInISR(); const d = findTask(rec.task); if (rec.action === 'eSetBits') d.notifyVal |= rec.val; else if (rec.action === 'eIncrement') d.notifyVal++; else d.notifyVal = rec.val;
          if (d.state === 'BLOCKED' && d.waitKind === 'notify') { const v = d.notifyVal; M.set(d.waitInto, v); if (d.clearOnExit) d.notifyVal &= ~d.clearOnExit; wake(d, pdTRUE, '收到任务通知'); } return pdTRUE; }
        case 'notifyWait': { if (inISR) return badInISR(); if (t.notifyVal) { const v = t.notifyVal; M.set(rec.into, v); t.notifyVal &= ~rec.clearOnExit; return pdTRUE; } if (rec.t === 0) return pdFALSE; t.waitInto = rec.into; t.clearOnExit = rec.clearOnExit; block(t, null, 'notify', rec.t, '等待任务通知'); return; }
        case 'suspend': { const d = findTask(rec.task); if (d.state === 'BLOCKED') wake(d, pdFALSE); d.state = 'SUSPENDED'; d.waitDesc = '等待 vTaskResume'; sim.klog(`${d.name} 被挂起`); if (d === t) { d.selfSusp = true; sim.forceSwitch = true; } return; }
        case 'resume': { const d = findTask(rec.task); if (d.state === 'SUSPENDED') { d.state = 'READY'; d.waitDesc = ''; sim.klog(`${d.name} 被恢复为就绪`); if (d.selfSusp) { d.selfSusp = false; advance(d, undefined); } if (d.prio > t.prio) sim.forceSwitch = true; } return; }
        case 'del': { const d = findTask(rec.task); if (d.state === 'BLOCKED') wake(d, pdFALSE); d.state = 'DELETED'; d.pc = null; d.gen = null;
          if (d === t) { d.waitDesc = '等待空闲任务回收 TCB/栈'; d.pendingFree = true; sim.klog(`${d.name} 删除自己，TCB 与栈由空闲任务释放`); sim.forceSwitch = true; }
          else { sim.heapUsed -= 96 + d.stackSize; sim.klog(`${d.name} 被 ${t.name} 删除，TCB 与栈立即释放`); } return; }
        case 'setPrio': { const d = findTask(rec.task); sim.klog(`${d.name} 优先级 ${d.prio} → ${rec.p}`); d.prio = d.basePrio = rec.p; sim.forceSwitch = true; return; }
        case 'enterCritical': sim.critical++; if (sim.critical === 1) sim.klog('taskENTER_CRITICAL：BASEPRI 抬高，屏蔽 ≤configMAX_SYSCALL_INTERRUPT_PRIORITY 的中断'); return;
        case 'exitCritical': if (sim.critical > 0) sim.critical--; if (sim.critical === 0) { sim.klog('taskEXIT_CRITICAL：恢复中断'); if (sim.pendingISR) { sim.pendingISR = 0; sim.isrMasked = false; sim.klog('被屏蔽的中断现在响应'); sim.triggerISR(); } } return;
        case 'suspendAll': sim.schedSuspended++; sim.klog('vTaskSuspendAll：调度器挂起，中断仍开启，但不会切换任务'); return;
        case 'resumeAll': if (sim.schedSuspended > 0) sim.schedSuspended--; if (sim.schedSuspended === 0) { sim.klog('xTaskResumeAll：调度器恢复，处理挂起期间就绪的任务'); sim.forceSwitch = true; } return;
        case 'yield': sim.forceSwitch = true; sim.yieldRR = true; return;
        case 'timerStart': { const tm = O[rec.tm]; tm.active = true; tm.remaining = tm.period; sim.klog(`${rec.tm} 启动/复位，${tm.period} tick 后到期`); return pdTRUE; }
        case 'timerStop': { O[rec.tm].active = false; return pdTRUE; }
        case 'stackUse': { t.stackUsed += rec.n; if (t.stackUsed > t.stackMax) t.stackMax = t.stackUsed; if (t.stackUsed > t.stackSize) { if (spec.stackCheck) sim.halt(`vApplicationStackOverflowHook(${t.name})：栈溢出被检测到（configCHECK_FOR_STACK_OVERFLOW=2）`); else sim.klog(`${t.name} 栈溢出 ${t.stackUsed - t.stackSize} B，未开启检测——正在悄悄踩坏相邻内存！`, 'e'); } return; }
        case 'malloc': { if (sim.heapUsed + rec.n > sim.heapSize) { M.set(rec.name, 0); sim.klog(`pvPortMalloc(${rec.n}) 返回 NULL：堆剩余 ${sim.heapSize - sim.heapUsed} B`, 'e'); return 0; } const a = sim.alloc(rec.n); M.set(rec.name, a); t.blocks = t.blocks || {}; t.blocks[rec.name] = rec.n; return a; }
        case 'free': { const n = t.blocks && t.blocks[rec.name]; if (n) { sim.heapUsed -= n; delete t.blocks[rec.name]; } M.set(rec.name, 0); return; }
        // ---- 中断上下文 ----
        case 'qSendISR': { const q = O[rec.q]; const v = typeof rec.val === 'function' ? rec.val(M) : rec.val; if (q.waiting.length) { const r = q.waiting[0]; M.set(r.waitInto, v); wokenCheck(r, rec.woken); wake(r, pdTRUE, `中断送来 ${rec.q} 数据 ${v}`); return pdTRUE; } if (q.items.length < q.len) { q.items.push(v); return pdTRUE; } sim.klog(`${rec.q} 已满，中断里的数据 ${v} 被丢弃`, 'e'); return pdFALSE; }
        case 'semGiveISR': { const s = O[rec.s]; if (s.holder !== undefined) { sim.halt('互斥量不能在中断里使用（没有 xSemaphoreGiveFromISR 对应的互斥语义）'); return; } if (s.waiting.length) { const r = s.waiting[0]; wokenCheck(r, rec.woken); wake(r, pdTRUE, `中断释放 ${rec.s}`); return pdTRUE; } if (s.count < s.max) { s.count++; return pdTRUE; } return pdFALSE; }
        case 'notifyGiveISR': { const d = findTask(rec.task); d.notifyVal++; if (d.state === 'BLOCKED' && d.waitKind === 'notify') { const v = d.notifyVal; d.notifyVal = d.clearAll ? 0 : v - 1; wokenCheck(d, rec.woken); wake(d, v, '中断发来任务通知'); } return; }
        case 'egSetISR': { egSet(O[rec.eg], rec.bits, rec.woken); return; }
        case 'yieldFromISR': { const w = M.get(rec.woken); if (w) { sim.isrYield = true; sim.klog('portYIELD_FROM_ISR(pdTRUE)：挂起 PendSV，中断退出后立即切换到被唤醒的高优先级任务'); } else sim.klog('portYIELD_FROM_ISR(pdFALSE)：不切换，被唤醒的任务等下一个 tick'); return; }
        case 'illegalBlock': { sim.halt(`在中断里调用 xSemaphoreTake(${rec.s}, portMAX_DELAY)：中断没有任务上下文，无法阻塞，configASSERT 触发 / 系统挂死`); return; }
      }
      function wokenCheck(readied, wokenVar) { const p = sim.preempted || sim.running; if (wokenVar && p && readied.prio > p.prio) { M.set(wokenVar, 1); sim.klog(`${readied.name}(优先级 ${readied.prio}) 高于被打断的 ${p.name}(${p.prio})，xHigherPriorityTaskWoken = pdTRUE`); } }
      function give(s, t, name) { if (s.waiting.length) { const r = s.waiting[0]; if (s.holder !== undefined) { s.holder = r; if (s.kind === 'rmutex') s.depth = 1; } wake(r, pdTRUE, `获得 ${name}`); return pdTRUE; } if (s.holder !== undefined) s.holder = null; if (s.count < s.max) { s.count++; return pdTRUE; } sim.klog(`${name} 计数已达上限 ${s.max}，Give 返回 pdFALSE`); return pdFALSE; }
      function egSet(eg, bits, wokenVar) { eg.bits |= bits; const ws = eg.waiting.slice(); let clr = 0; ws.forEach(w => { const ok = w.egAll ? (eg.bits & w.egBits) === w.egBits : (eg.bits & w.egBits) !== 0; if (ok) { if (w.egClear) clr |= w.egBits; if (wokenVar) wokenCheck(w, wokenVar); wake(w, eg.bits, `事件位满足 0b${w.egBits.toString(2)}`); } }); eg.bits &= ~clr; }
    }

    // ---------- 中断 ----------
    sim.triggerISR = function () {
      if (!spec.isr || sim.halted) return;
      if (sim.critical > 0) { sim.pendingISR = 1; sim.isrMasked = true; sim.klog(`${spec.isr.name} 触发，但处于临界区，中断被 BASEPRI 屏蔽，挂起等待`); return; }
      if (sim.tasks.some(t => t.isISR && t.state !== 'DELETED')) return;
      const isr = mkTask({ name: spec.isr.name, prio: 1e9, isISR: true, run: spec.isr.run }, true);
      const w = sim.cell('xHigherPriorityTaskWoken'); if (w) { w.val = 0; }
      sim.preempted = sim.running; if (sim.running) sim.running.state = 'READY'; sim.isrYield = false;
      sim.tasks.push(isr); sim.running = isr; isr.state = 'RUNNING';
      sim.klog(`⚡ ${spec.isr.name} 进入（打断了 ${sim.preempted ? sim.preempted.name : '—'}，硬件自动压栈 R0-R3,R12,LR,PC,xPSR）`);
    };

    // ---------- 调度 ----------
    function pick() {
      const isr = sim.tasks.find(t => t.isISR && t.state !== 'DELETED'); if (isr) return isr;
      const ready = sim.tasks.filter(t => (t.state === 'READY' || t.state === 'RUNNING') && !t.isISR);
      if (!ready.length) return null;
      const top = Math.max(...ready.map(t => t.prio));
      const cands = ready.filter(t => t.prio === top);
      const prev = sim.running;
      if (sim.schedSuspended > 0 && prev && !prev.isISR && (prev.state === 'READY' || prev.state === 'RUNNING')) return prev;
      if (sim.deferOnce && prev && (prev.state === 'READY' || prev.state === 'RUNNING') && !prev.isISR) { sim.deferOnce = false; sim.klog(`没有 portYIELD_FROM_ISR，${prev.name} 先继续执行到下一个 tick`); return prev; }
      if (cands.length === 1) return cands[0];
      if (prev && cands.includes(prev) && !sim.slicing && !sim.yieldRR) return prev;
      return cands.reduce((a, b) => (a.lastRun <= b.lastRun ? a : b));
    }
    function reschedule() {
      const n = pick();
      if (n !== sim.running) {
        if (sim.running && sim.running.state === 'RUNNING') sim.running.state = 'READY';
        if (n && sim.running && !sim.running.isISR && n && !n.isISR) sim.klog(`PendSV 上下文切换：${sim.running.name} → ${n.name}`);
        sim.running = n;
      }
      if (sim.running) sim.running.state = 'RUNNING';
      sim.forceSwitch = false; sim.yieldRR = false;
    }
    function onTick() {
      sim.tick++;
      if (spec.tickHook) spec.tickHook(sim, M);
      sim.tasks.forEach(t => { if (t.state === 'BLOCKED' && t.wakeTick != null && t.wakeTick <= sim.tick) { const why = t.waitKind === 'delay' ? '延时到期' : `等待超时(${t.waitDesc})`; wake(t, t.waitKind === 'delay' ? undefined : (t.waitKind === 'notify' ? 0 : pdFALSE), why); } });
      sim.objs.forEach(tm => { if (tm.kind === 'timer' && tm.active && --tm.remaining <= 0) { if (tm.auto) tm.remaining = tm.period; else tm.active = false; sim.klog(`${tm.name} 到期 → 回调在定时器守护任务 TmrSvc 中执行`); const d = mkTask({ name: 'TmrSvc(' + tm.name + ')', prio: spec.timerPrio || 3, run: tm.cb }, true); sim.tasks.push(d); if (d.prio > (sim.running ? sim.running.prio : -1)) sim.forceSwitch = true; } });
    }

    sim.step = function () {
      if (sim.halted) return;
      if (!sim.running) reschedule();
      const t = sim.running; if (!t) return;
      sim.stepNo++;
      const rec = t.pc;
      if (rec) { const ret = exec(t, rec); if (t.state !== 'BLOCKED' && t.state !== 'SUSPENDED' && t.state !== 'DELETED') advance(t, ret); }
      t.lastRun = sim.stepNo;
      if (t.isISR) {
        if (t.state === 'DELETED' || !t.pc) { t.state = 'DELETED'; sim.klog(`${t.name} 退出`); if (sim.isrYield) sim.forceSwitch = true; else if (sim.tasks.some(x => x.state === 'READY' && sim.preempted && x.prio > sim.preempted.prio)) sim.deferOnce = true; sim.running = sim.preempted; if (sim.running && sim.running.state === 'READY') sim.running.state = 'RUNNING'; sim.preempted = null; sim.tasks.splice(sim.tasks.indexOf(t), 1); reschedule(); }
        return;
      }
      if (t.pseudo && (t.state === 'DELETED' || !t.pc)) { t.state = 'DELETED'; sim.tasks.splice(sim.tasks.indexOf(t), 1); }
      sim.timeline.push(t.name);
      if (t.name === 'IDLE') sim.tasks.filter(x => x.pendingFree).forEach(x => { x.pendingFree = false; x.waitDesc = '已回收'; sim.heapUsed -= 96 + x.stackSize; sim.klog(`空闲任务回收了 ${x.name} 的 TCB 与栈（释放 ${96 + x.stackSize} B）`); });
      onTick();
      reschedule();
    };
    reschedule();
    return sim;
  }
  return { createSim, STATE_CN };
})();
