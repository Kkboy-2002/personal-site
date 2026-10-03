/* Actual VCD playback. Playback never evaluates or guesses the edited RTL. */
(function () {
  'use strict';

  const byId = function (id) { return document.getElementById(id); };
  const data = window.VERILOG_LAB;
  if (!data || !data.scenes || !data.scenes.length) {
    byId('load-error').hidden = false;
    byId('load-error').textContent = '示例数据未加载，请保留 assets 目录后重新打开。';
    return;
  }
  const originals = new Map(data.scenes.map(function (scene) { return [scene.id, scene]; }));
  let recordings = new Map(originals);
  let state = {
    trace: data.scenes[0], cursor: 0, mode: 'clock', radix: 'bin',
    focused: 0, watched: [], file: '', editing: false, compiling: false,
    ready: false, timer: null, drafts: {}, request: null, revision: 0
  };
  const labels = { register: '时序寄存器', memory: '存储单元 / 流水级', signal: '输入与组合信号' };
  const svgNS = 'http://www.w3.org/2000/svg';

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function escapeRegExp(value) {
    return value.replace(/[^a-zA-Z0-9_]/g, '\\$&');
  }

  function formatValue(bits) {
    if (bits === null || bits === undefined) return '—';
    if (/[xz]/i.test(bits)) return state.radix === 'bin' ? bits : bits.replace(/^(x+|z+)$/i, function (value) { return value[0]; });
    if (state.radix === 'hex') return '0x' + BigInt('0b' + bits).toString(16).toUpperCase().padStart(Math.ceil(bits.length / 4), '0');
    if (state.radix === 'dec') return BigInt('0b' + bits).toString(10);
    return bits;
  }

  function timeText(time) {
    return Number(time.toFixed(3)).toLocaleString('en-US', { maximumFractionDigits: 3 }) + ' ns';
  }

  function stepIndices() {
    return state.mode === 'clock' && state.trace.hasClock ? state.trace.steps
      : state.trace.events.map(function (_, index) { return index; });
  }

  function frame() {
    const index = stepIndices()[state.cursor];
    return { index: index, event: state.trace.events[index],
      before: index > 0 ? state.trace.events[index - 1].values : null };
  }

  function changedSignals(current) {
    if (!current.before) return [];
    return state.trace.signals.map(function (_, index) { return index; }).filter(function (index) {
      return current.before[index] !== current.event.values[index];
    });
  }

  function shortName(signal) {
    const roots = new Set(state.trace.signals.map(function (item) { return item.scope.split('.')[0]; }));
    return roots.size > 1 ? signal.scope.split('.')[0] + '.' + signal.name : signal.name;
  }

  function loadDrafts(scene) {
    try {
      const saved = JSON.parse(localStorage.getItem('verilog-lab.draft.' + scene.id) || '{}');
      return Object.fromEntries(Object.entries(scene.sources).map(function (entry) {
        const value = saved && saved[entry[0]];
        return [entry[0], typeof value === 'string' && value.length <= 100000 ? value : entry[1]];
      }));
    } catch (_) {
      return { ...scene.sources };
    }
  }

  function storeDraft() {
    if (!state.editing) return;
    state = { ...state, drafts: { ...state.drafts, [state.file]: byId('code-editor').value } };
    try {
      localStorage.setItem('verilog-lab.draft.' + state.trace.id, JSON.stringify(state.drafts));
    } catch (_) {
      byId('draft-status').textContent = '草稿暂存于当前页面';
    }
  }

  function hasDraft() {
    return Object.keys(state.trace.sources).some(function (name) {
      return state.drafts[name] !== state.trace.sources[name];
    });
  }

  function pause() {
    if (state.timer !== null) clearInterval(state.timer);
    state = { ...state, timer: null };
    byId('play').textContent = '连续播放';
    byId('play').setAttribute('aria-pressed', 'false');
  }

  function selectScene(id) {
    const trace = recordings.get(id) || data.scenes[0];
    storeDraft();
    pause();
    if (state.request) state.request.abort();
    state = {
      ...state, trace: trace, cursor: 0, mode: trace.hasClock ? 'clock' : 'event',
      focused: trace.watch.find(function (index) { return trace.signals[index].kind === 'register'; }) ?? trace.watch[0] ?? 0,
      watched: trace.watch.slice(0, 8), file: Object.keys(trace.sources)[0],
      editing: false, compiling: false, drafts: loadDrafts(trace), request: null,
      revision: state.revision + 1
    };
    byId('scene-select').value = trace.id;
    byId('step-mode').value = state.mode;
    byId('step-mode').options[0].disabled = !trace.hasClock;
    byId('parameters').textContent = trace.parameters || '观察输入与寄存器的变化';
    byId('lesson-link').href = 'lessons/lesson' + trace.lesson + '.html';
    byId('lesson-link').textContent = '第 ' + trace.lesson + ' 课讲解';
    byId('scene-note').textContent = trace.note;
    byId('compile-error').hidden = true;
    byId('simulation-output').textContent = trace.output;
    const verdict = byId('result-status');
    verdict.className = 'result-status ' + trace.verdict;
    verdict.textContent = { pass: '整段仿真 PASS', fail: '整段仿真 FAIL', observe: '观察型示例' }[trace.verdict];
    populateFiles();
    renderSource();
    render();
    try { history.replaceState(null, '', '#' + trace.id); } catch (_) { /* file:// restrictions */ }
  }

  function populateExamples() {
    const lessons = Array.from(new Set(data.scenes.map(function (scene) { return scene.lesson; })));
    byId('scene-select').innerHTML = lessons.map(function (lesson) {
      return '<optgroup label="第 ' + lesson + ' 课">' +
        data.scenes.filter(function (scene) { return scene.lesson === lesson; }).map(function (scene) {
          return '<option value="' + scene.id + '">' + scene.lesson + ' · ' + escapeHTML(scene.title) + '</option>';
        }).join('') + '</optgroup>';
    }).join('');
  }

  function populateFiles() {
    byId('file-select').innerHTML = Object.keys(state.trace.sources).map(function (name) {
      return '<option value="' + escapeHTML(name) + '">' + escapeHTML(name) + '</option>';
    }).join('') + '<option value="@testbench">' + escapeHTML(state.trace.testbench.name) + ' · 测试激励</option>';
    byId('file-select').value = state.file;
  }

  function activeSource() {
    return state.file === '@testbench' ? state.trace.testbench.text : state.trace.sources[state.file];
  }

  function renderSource() {
    const highlight = window.FPGACode ? window.FPGACode.highlight : escapeHTML;
    byId('code-view').innerHTML = activeSource().split('\n').map(function (line, index) {
      return '<div class="code-line" data-line="' + (index + 1) + '"><span class="line-number">' +
        (index + 1) + '</span><span class="line-text">' + (highlight(line) || ' ') + '</span></div>';
    }).join('');
    byId('code-view').scrollTop = 0;
    highlightRelated(frame());
  }

  function highlightRelated(current) {
    const focused = state.trace.signals[state.focused];
    const relevant = focused.file === state.file;
    const pattern = new RegExp('\\b' + escapeRegExp(focused.name.split('[')[0]) + '\\b');
    const changes = changedSignals(current).filter(function (index) {
      return state.trace.signals[index].file === state.file;
    }).map(function (index) {
      return new RegExp('\\b' + escapeRegExp(state.trace.signals[index].name.split('[')[0]) + '\\b');
    });
    const lines = activeSource().split('\n');
    byId('code-view').querySelectorAll('.code-line').forEach(function (element, index) {
      const code = lines[index].split('//')[0];
      element.classList.toggle('related', relevant && pattern.test(code));
      const declaration = /^\s*(?:input|output|inout|reg|wire|logic|integer)\b/.test(code);
      element.classList.toggle('updated', declaration && changes.some(function (expression) { return expression.test(code); }));
    });
    byId('source-caption').textContent = state.file === '@testbench'
      ? '只读激励 · 输入在什么时刻变化，由这份 Testbench 决定'
      : '蓝色：关注信号的引用 · 黄色：本步变化的变量声明';
  }

  function valueMarkup(bits, className) {
    return '<span class="' + className + (bits && /[xz]/i.test(bits) ? ' unknown' : '') +
      '">' + escapeHTML(formatValue(bits)) + '</span>';
  }

  function bitsMarkup(bits, before) {
    if (bits.length > 16 || bits.length === 1) return '';
    return '<span class="bits" aria-hidden="true">' + bits.split('').map(function (bit, index) {
      return '<span class="bit' + (bit === '1' ? ' high' : '') +
        (before && before[index] !== bit ? ' flipped' : '') + '">' + bit + '</span>';
    }).join('') + '</span>';
  }

  function signalRow(index, current) {
    const signal = state.trace.signals[index];
    const before = current.before ? current.before[index] : null;
    const after = current.event.values[index];
    const changed = before !== null && before !== after;
    return '<div class="signal-row' + (changed ? ' changed' : '') + (state.focused === index ? ' focused' : '') +
      '" data-signal-id="' + escapeHTML(signal.id) + '">' +
      '<button type="button" class="watch-toggle" data-action="watch" data-signal="' + index +
      '" aria-pressed="' + state.watched.includes(index) + '" aria-label="波形显示 ' + escapeHTML(signal.id) + '"></button>' +
      '<button type="button" class="signal-name" data-action="focus" data-signal="' + index +
      '" aria-label="关注 ' + escapeHTML(signal.id) + '">' + escapeHTML(signal.name) +
      '<small>' + signal.width + ' bit' + (changed ? ' · 已变化' : '') + '</small></button>' +
      valueMarkup(before, 'before-value') + '<span class="value-arrow" aria-hidden="true">→</span>' +
      '<span>' + valueMarkup(after, 'after-value') + bitsMarkup(after, before) + '</span></div>';
  }

  function memoryCell(index, current) {
    const signal = state.trace.signals[index];
    const before = current.before ? current.before[index] : null;
    const after = current.event.values[index];
    return '<button type="button" class="memory-cell' + (before !== null && before !== after ? ' changed' : '') +
      (state.focused === index ? ' focused' : '') + '" data-action="focus" data-signal="' + index +
      '" aria-label="关注 ' + escapeHTML(signal.id) + '"><small>' + escapeHTML(signal.name) + '</small>' +
      valueMarkup(after, 'after-value') + '<small>' + escapeHTML(formatValue(before)) + ' → ' +
      escapeHTML(formatValue(after)) + '</small></button>';
  }

  function renderRegisters(current) {
    const active = document.activeElement;
    const activeAction = active && active.dataset.action;
    const activeSignal = active && active.dataset.signal;
    const changed = changedSignals(current);
    const indices = state.trace.signals.map(function (_, index) { return index; }).filter(function (index) {
      return !byId('changed-only').checked || changed.includes(index);
    });
    const groups = Array.from(new Set(indices.map(function (index) {
      const signal = state.trace.signals[index];
      return signal.kind + ':' + signal.scope;
    })));
    byId('registers').innerHTML = groups.map(function (group) {
      const separator = group.indexOf(':');
      const kind = group.slice(0, separator), scope = group.slice(separator + 1);
      const rows = indices.filter(function (index) {
        const signal = state.trace.signals[index];
        return signal.kind === kind && signal.scope === scope;
      });
      return '<section class="signal-group"><div class="group-heading"><span>' +
        labels[kind] + ' · ' + escapeHTML(scope) + '</span><span>' +
        (current.event.edges ? '沿前 → 沿后' : '变化前 → 变化后') + '</span></div>' +
        (kind === 'memory' ? '<div class="memory-grid">' + rows.map(function (index) {
          return memoryCell(index, current);
        }).join('') + '</div>' : rows.map(function (index) { return signalRow(index, current); }).join('')) +
        '</section>';
    }).join('') || '<p class="empty-hint">这一步没有信号变化。取消「只看变化」可查看全部数值。</p>';
    if (activeAction && activeSignal) {
      const replacement = byId('registers').querySelector('[data-action="' + activeAction + '"][data-signal="' + activeSignal + '"]');
      if (replacement) replacement.focus({ preventScroll: true });
    }
    byId('changed-count').textContent = changed.length + ' 个信号变化';
    byId('focused-name').textContent = shortName(state.trace.signals[state.focused]);
  }

  function describeStep(current) {
    const edges = current.event.edges || [];
    byId('edge-label').textContent = edges.length ? edges.map(function (name) { return '↑ ' + name; }).join(' / ')
      : state.cursor === 0 ? '仿真起点' : '信号变化';
    let text;
    if (!current.before) {
      text = '这是仿真起点。x 表示尚未确定的值；继续步进，观察复位如何把寄存器清零。';
      if (!state.trace.hasClock) text = '从第一组输入开始。逐步改变输入，观察组合输出，不需要等待时钟。';
    } else {
      const updates = changedSignals(current).filter(function (index) {
        return !['clk', 'wclk', 'rclk'].includes(state.trace.signals[index].name);
      });
      text = updates.slice(0, 4).map(function (index) {
        return shortName(state.trace.signals[index]) + '：' + formatValue(current.before[index]) +
          ' → ' + formatValue(current.event.values[index]);
      }).join('；') || '本步寄存器和组合输出保持不变。';
      if (updates.length > 4) text += '；另有 ' + (updates.length - 4) + ' 个信号变化。';
      const resets = state.trace.signals.map(function (signal, index) {
        return /^(?:[wr]?rst_n)$/.test(signal.name) && current.event.values[index] === '0' ? signal.name : null;
      }).filter(Boolean);
      if (resets.length) text = '复位有效（' + resets.join('、') + ' = 0）。' + text;
    }
    byId('step-description').textContent = text;
  }

  function renderControls() {
    const steps = stepIndices(), current = frame();
    const locked = state.editing || state.compiling;
    byId('previous').disabled = locked || state.cursor === 0;
    byId('reset').disabled = locked || state.cursor === 0;
    byId('next').disabled = locked || state.cursor === steps.length - 1;
    byId('play').disabled = locked || steps.length < 2;
    byId('timeline').disabled = locked;
    byId('step-mode').disabled = locked;
    byId('scene-select').disabled = state.compiling;
    byId('file-select').disabled = state.compiling;
    byId('timeline').max = String(steps.length - 1);
    byId('timeline').value = String(state.cursor);
    byId('timeline').setAttribute('aria-valuetext', '第 ' + state.cursor + ' 步，' + timeText(current.event.time));
    byId('step-counter').textContent = '第 ' + state.cursor + ' / ' + (steps.length - 1) + ' 步';
    byId('time-label').textContent = timeText(current.event.time);
    byId('duration-label').textContent = '共 ' + timeText(state.trace.duration);
    byId('next').innerHTML = (state.mode === 'clock' && state.trace.hasClock ? '下一拍' : '下一步') +
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M14 4v12M5 4l7 6-7 6z"/></svg>';
    byId('edit').hidden = state.editing;
    byId('edit').disabled = !state.ready || state.file === '@testbench' || state.compiling;
    byId('compile').hidden = !state.editing;
    byId('compile').disabled = state.compiling;
    byId('compile').textContent = state.compiling ? '正在编译仿真…' : '编译并更新波形';
    byId('cancel-edit').hidden = !state.editing;
    byId('cancel-edit').disabled = state.compiling;
    byId('restore').disabled = state.compiling;
    byId('code-editor').hidden = !state.editing;
    byId('code-editor').readOnly = state.compiling;
    byId('code-view').hidden = state.editing;
    byId('stale-notice').hidden = !state.editing;
    byId('draft-status').textContent = state.compiling ? '将使用当前源码生成新波形' : hasDraft() ? '有代码草稿' : '';
    byId('next-change').disabled = locked || findNextChange() === -1;
  }

  function render() {
    const current = frame();
    renderControls();
    renderRegisters(current);
    highlightRelated(current);
    describeStep(current);
    renderWaveform(current);
  }

  function goTo(cursor, manual) {
    if (state.editing || state.compiling) return;
    if (manual !== false) pause();
    state = { ...state, cursor: Math.max(0, Math.min(cursor, stepIndices().length - 1)) };
    if (state.cursor === stepIndices().length - 1) pause();
    render();
  }

  function play() {
    if (state.timer !== null) { pause(); return; }
    if (state.cursor === stepIndices().length - 1) goTo(0);
    const timer = setInterval(function () { goTo(state.cursor + 1, false); }, Number(byId('speed').value));
    state = { ...state, timer: timer };
    byId('play').textContent = '暂停';
    byId('play').setAttribute('aria-pressed', 'true');
  }

  function findNextChange() {
    const steps = stepIndices();
    for (let cursor = state.cursor + 1; cursor < steps.length; cursor++) {
      const index = steps[cursor];
      if (index > 0 && state.trace.events[index].values[state.focused] !== state.trace.events[index - 1].values[state.focused]) return cursor;
    }
    return -1;
  }

  function focusSignal(index) {
    state = { ...state, focused: index };
    const file = state.trace.signals[index].file;
    if (!state.editing && file !== state.file) {
      state = { ...state, file: file };
      byId('file-select').value = file;
      renderSource();
    }
    if (!state.watched.includes(index)) state = { ...state, watched: [...state.watched.slice(-7), index] };
    render();
    const related = byId('code-view').querySelector('.code-line.related');
    if (related && !state.editing) {
      byId('code-view').scrollTop = Math.max(0, related.offsetTop - byId('code-view').offsetTop - 60);
    }
  }

  function svgElement(tag, attributes, parent, text) {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attributes).forEach(function (entry) { element.setAttribute(entry[0], entry[1]); });
    if (text !== undefined) element.textContent = text;
    if (parent) parent.appendChild(element);
    return element;
  }

  function renderWaveform(current) {
    const host = byId('waveform'), steps = stepIndices();
    const requested = byId('wave-window').value;
    const count = requested === 'all' ? steps.length : Math.min(Number(requested), steps.length);
    const begin = requested === 'all' ? 0 : Math.max(0, Math.min(state.cursor - 3, steps.length - count));
    const end = Math.min(steps.length - 1, begin + count - 1);
    const startTime = state.trace.events[steps[begin]].time;
    const lastTime = state.trace.events[steps[end]].time;
    const range = Math.max(lastTime - startTime, 10);
    const padding = range * .018;
    const width = Math.max(host.clientWidth, 740), left = 160, right = width - 22;
    const x = function (time) { return left + (time - startTime + padding) / (range + 2 * padding) * (right - left); };
    const height = 42 + state.watched.length * 36;
    const svg = svgElement('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'group',
      'aria-label': '数字波形。横轴为仿真时间，竖线为当前步进位置。可用上方进度滑块选择时刻。' });
    const windowEvents = state.trace.events.filter(function (event) { return event.time >= startTime && event.time <= lastTime; });
    svgElement('rect', { x: x(current.event.time) - 3, y: 0, width: 6, height: height, class: 'wave-cursor-bg' }, svg);
    const tickStride = Math.max(1, Math.ceil(count / 14));
    for (let cursor = begin; cursor <= end; cursor++) {
      const time = state.trace.events[steps[cursor]].time, position = x(time);
      if ((cursor - begin) % tickStride === 0 || cursor === end) {
        svgElement('line', { x1: position, x2: position, y1: 23, y2: height, class: 'wave-grid' }, svg);
        svgElement('text', { x: position, y: 15, 'text-anchor': 'middle', class: 'wave-time' }, svg, String(Number(time.toFixed(2))));
      }
    }
    svgElement('text', { x: 14, y: 15, class: 'wave-time' }, svg, '信号 / 时间 ns');
    state.watched.forEach(function (signalIndex, row) {
      const signal = state.trace.signals[signalIndex], top = 30 + row * 36;
      svgElement('text', { x: 14, y: top + 16, class: 'wave-name' }, svg, shortName(signal));
      const segments = [];
      windowEvents.forEach(function (event) {
        const value = event.values[signalIndex];
        if (!segments.length || segments[segments.length - 1].value !== value) {
          segments.push({ start: event.time, value: value });
        }
      });
      if (!segments.length) segments.push({ start: startTime, value: current.event.values[signalIndex] });
      let lineParts = [];
      segments.forEach(function (segment, index) {
        const finish = index + 1 < segments.length ? segments[index + 1].start : startTime + range;
        const a = x(segment.start), b = x(finish), span = b - a;
        if (signal.width === 1 && /^[01]$/.test(segment.value)) {
          const y = top + (segment.value === '1' ? 3 : 22);
          lineParts.push((lineParts.length ? 'L' : 'M') + a + ' ' + y + 'H' + b);
        } else {
          if (lineParts.length) { svgElement('path', { d: lineParts.join(''), class: 'wave-line' }, svg); lineParts = []; }
          const unknown = /[xz]/.test(segment.value);
          svgElement('path', { d: 'M' + a + ' ' + (top + 12) + 'l3 -10H' + Math.max(a + 3, b - 3) +
            'l3 10-3 10H' + (a + 3) + 'Z', class: unknown ? 'wave-x' : 'wave-bus' }, svg);
          const value = signal.width > 1 && !unknown ? '0x' + BigInt('0b' + segment.value).toString(16).toUpperCase() : segment.value;
          if (span > Math.max(22, value.length * 7)) svgElement('text', {
            x: (a + b) / 2, y: top + 16, class: 'wave-bus-label', 'text-anchor': 'middle'
          }, svg, value);
        }
      });
      if (lineParts.length) svgElement('path', { d: lineParts.join(''), class: 'wave-line' }, svg);
    });
    svgElement('line', { x1: x(current.event.time), x2: x(current.event.time), y1: 22, y2: height, class: 'wave-cursor' }, svg);
    for (let cursor = begin; cursor <= end; cursor++) {
      const time = state.trace.events[steps[cursor]].time;
      const target = svgElement('rect', {
        x: x(time) - 8, y: 0, width: 16, height: height, class: 'wave-target',
        tabindex: count <= 32 ? '0' : '-1', role: 'button', 'data-cursor': cursor,
        'aria-label': '跳到第 ' + cursor + ' 步，' + timeText(time)
      }, svg);
      target.addEventListener('click', function () { goTo(cursor); });
      target.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); goTo(cursor); }
      });
    }
    host.replaceChildren(svg);
  }

  function enterEdit() {
    if (!state.ready || state.file === '@testbench') return;
    pause();
    state = { ...state, editing: true };
    byId('compile-error').hidden = true;
    byId('code-editor').value = state.drafts[state.file];
    renderControls();
    byId('code-editor').focus();
  }

  async function compile() {
    if (state.compiling || !state.ready) return;
    storeDraft();
    pause();
    const request = new AbortController(), revision = state.revision;
    state = { ...state, compiling: true, request: request };
    byId('compile-error').hidden = true;
    renderControls();
    const timeout = setTimeout(function () { request.abort(); }, 70000);
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: state.trace.id, sources: state.drafts }), signal: request.signal
      });
      const result = await response.json();
      if (revision !== state.revision) return;
      if (!response.ok) {
        byId('compile-error').textContent = result.error + (result.output ? '\n' + result.output : '');
        byId('compile-error').hidden = false;
        const diagnostic = (result.diagnostics || []).find(function (item) { return item.file === state.file; });
        if (diagnostic) {
          const editor = byId('code-editor'), lines = editor.value.split('\n');
          const start = lines.slice(0, diagnostic.line - 1).reduce(function (length, line) { return length + line.length + 1; }, 0);
          editor.focus();
          editor.setSelectionRange(start, start + (lines[diagnostic.line - 1] || '').length);
          editor.scrollTop = Math.max(0, (diagnostic.line - 4) * 21);
        }
        return;
      }
      recordings = new Map(recordings).set(result.id, result);
      state = { ...state, editing: false, compiling: false, request: null };
      selectScene(result.id);
    } catch (error) {
      if (revision !== state.revision) return;
      byId('compile-error').textContent = error.name === 'AbortError'
        ? '等待仿真超时。请检查代码，并查看网页版启动窗口的输出。'
        : '无法连接仿真服务。请双击 start-web.bat 启动后重试。';
      byId('compile-error').hidden = false;
    } finally {
      clearTimeout(timeout);
      if (revision === state.revision) {
        state = { ...state, compiling: false, request: null };
        renderControls();
      }
    }
  }

  async function detectService() {
    if (!/^https?:$/.test(location.protocol)) {
      byId('service-note').textContent = '直接打开即可逐拍查看全部示例。需要修改代码时，双击项目里的 start-web.bat。';
      byId('service-note').hidden = false;
      renderControls();
      return;
    }
    try {
      const response = await fetch('/api/status', { signal: AbortSignal.timeout(4000) });
      const status = await response.json();
      state = { ...state, ready: status.app === 'verilog-step-lab' && status.ready };
      byId('service-status').textContent = state.ready ? '本地仿真就绪 · 可编辑' : '示例回放 · 编译器未就绪';
      byId('service-status').classList.toggle('ready', state.ready);
      if (!state.ready) {
        byId('service-note').textContent = '已载入课程波形。修改后重新仿真需要安装 iverilog / vvp，再重启 start-web.bat。';
        byId('service-note').hidden = false;
      }
    } catch (_) {
      byId('service-note').textContent = '可以查看内置波形。需要修改代码时，请双击项目里的 start-web.bat。';
      byId('service-note').hidden = false;
    }
    renderControls();
  }

  byId('scene-select').addEventListener('change', function (event) { selectScene(event.target.value); });
  byId('file-select').addEventListener('change', function (event) {
    storeDraft();
    state = { ...state, file: event.target.value, editing: false };
    byId('compile-error').hidden = true;
    renderSource();
    renderControls();
  });
  byId('previous').addEventListener('click', function () { goTo(state.cursor - 1); });
  byId('next').addEventListener('click', function () { goTo(state.cursor + 1); });
  byId('reset').addEventListener('click', function () { goTo(0); });
  byId('play').addEventListener('click', play);
  byId('timeline').addEventListener('input', function (event) { goTo(Number(event.target.value)); });
  byId('speed').addEventListener('change', function () { if (state.timer !== null) { pause(); play(); } });
  byId('step-mode').addEventListener('change', function (event) {
    pause();
    const index = frame().index;
    state = { ...state, mode: event.target.value };
    const cursor = stepIndices().findIndex(function (step) { return step >= index; });
    goTo(cursor === -1 ? stepIndices().length - 1 : cursor);
  });
  byId('radix').addEventListener('change', function (event) {
    state = { ...state, radix: event.target.value };
    render();
  });
  byId('changed-only').addEventListener('change', render);
  byId('wave-window').addEventListener('change', function () { renderWaveform(frame()); });
  byId('next-change').addEventListener('click', function () {
    const cursor = findNextChange();
    if (cursor !== -1) goTo(cursor);
  });
  byId('registers').addEventListener('click', function (event) {
    const button = event.target.closest('button[data-signal]');
    if (!button) return;
    const index = Number(button.dataset.signal);
    if (button.dataset.action === 'focus') focusSignal(index);
    else {
      state = { ...state, watched: state.watched.includes(index)
        ? state.watched.filter(function (value) { return value !== index; }) : [...state.watched.slice(-7), index] };
      render();
    }
  });
  byId('edit').addEventListener('click', enterEdit);
  byId('compile').addEventListener('click', compile);
  byId('code-editor').addEventListener('input', function () { storeDraft(); renderControls(); });
  byId('code-editor').addEventListener('keydown', function (event) {
    if (event.key === 'Tab') {
      event.preventDefault();
      const editor = event.target;
      editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end');
      storeDraft();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); compile(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); storeDraft(); }
  });
  byId('cancel-edit').addEventListener('click', function () {
    storeDraft();
    state = { ...state, editing: false };
    byId('compile-error').hidden = true;
    renderControls();
  });
  byId('restore').addEventListener('click', function () {
    pause();
    try { localStorage.removeItem('verilog-lab.draft.' + state.trace.id); } catch (_) { /* optional persistence */ }
    state = { ...state, editing: false };
    recordings = new Map(recordings).set(state.trace.id, originals.get(state.trace.id));
    selectScene(state.trace.id);
  });
  byId('copy').addEventListener('click', async function () {
    const source = state.editing ? byId('code-editor').value : activeSource();
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(source);
      else {
        const temporary = document.createElement('textarea');
        temporary.value = source;
        temporary.style.position = 'fixed'; temporary.style.opacity = '0';
        document.body.appendChild(temporary); temporary.select();
        const copied = document.execCommand('copy'); temporary.remove();
        if (!copied) throw new Error('copy failed');
      }
      byId('copy').textContent = '已复制';
    } catch (_) { byId('copy').textContent = '请手动复制'; }
    setTimeout(function () { byId('copy').textContent = '复制'; }, 1600);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'F10' && !event.target.closest('input, textarea, select')) {
      event.preventDefault(); goTo(state.cursor + (event.shiftKey ? -1 : 1)); return;
    }
    if (event.target.closest('input, textarea, select, button, a, summary, [role="button"]')) return;
    if (event.key === ' ' && !state.editing && !state.compiling) { event.preventDefault(); play(); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('beforeunload', storeDraft);
  window.addEventListener('hashchange', function () {
    const id = location.hash.slice(1);
    if (originals.has(id) && id !== state.trace.id) selectScene(id);
  });
  populateExamples();
  const hash = location.hash.slice(1), lesson = new URLSearchParams(location.search).get('lesson');
  const initial = originals.has(hash) ? hash : (data.scenes.find(function (scene) { return scene.lesson === lesson; }) || data.scenes[0]).id;
  selectScene(initial);
  let waveWidth = byId('waveform').clientWidth;
  new ResizeObserver(function () {
    const nextWidth = byId('waveform').clientWidth;
    if (nextWidth === waveWidth) return;
    waveWidth = nextWidth;
    requestAnimationFrame(function () { renderWaveform(frame()); });
  }).observe(byId('waveform'));
  detectService();
})();
