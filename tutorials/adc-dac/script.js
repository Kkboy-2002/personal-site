"use strict";

/* ================= 工具函数 ================= */
const $ = (id) => document.getElementById(id);

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { ctx, w, h };
}

/* ================= 1. 采样与混叠 ================= */
(function () {
  const cv = $("samplingCanvas");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;

  const sigFreq = $("sigFreq"), sampFreq = $("sampFreq"), showRecon = $("showRecon");
  const sigFreqVal = $("sigFreqVal"), sampFreqVal = $("sampFreqVal"), status = $("nyquistStatus");

  function draw() {
    const fin = +sigFreq.value;
    const fs = +sampFreq.value;
    sigFreqVal.textContent = fin;
    sampFreqVal.textContent = fs;

    ctx.clearRect(0, 0, W, H);

    // 坐标轴
    ctx.strokeStyle = "#2e3a55";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, H / 2); ctx.lineTo(W - 10, H / 2);
    ctx.moveTo(40, 20); ctx.lineTo(40, H - 20);
    ctx.stroke();
    ctx.fillStyle = "#9aa7bd";
    ctx.font = "12px Consolas";
    ctx.fillText("t", W - 22, H / 2 + 16);
    ctx.fillText("V", 26, 18);

    const T = 1; // 显示 1 秒
    const amp = (H / 2 - 30);
    const xOf = (t) => 40 + (t / T) * (W - 60);
    const yOf = (v) => H / 2 - v * amp;

    // 原始信号
    ctx.strokeStyle = "#4fc3f7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= W - 60; px++) {
      const t = (px / (W - 60)) * T;
      const v = Math.sin(2 * Math.PI * fin * t);
      const x = xOf(t), y = yOf(v);
      px === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 采样点
    const dt = 1 / fs;
    ctx.fillStyle = "#ffb74d";
    const samples = [];
    for (let t = 0; t <= T + 1e-9; t += dt) {
      const v = Math.sin(2 * Math.PI * fin * t);
      samples.push({ t, v });
      ctx.beginPath();
      ctx.arc(xOf(t), yOf(v), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,183,77,.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xOf(t), yOf(v)); ctx.lineTo(xOf(t), H / 2);
      ctx.stroke();
    }

    // 重建波形（混叠后的表观频率）
    if (showRecon.checked) {
      const apparent = fin > fs / 2 ? Math.abs(fin - Math.round(fin / fs) * fs) : fin;
      ctx.strokeStyle = "#e57373";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      for (let px = 0; px <= W - 60; px++) {
        const t = (px / (W - 60)) * T;
        const v = Math.sin(2 * Math.PI * apparent * t +
          (apparent !== fin ? Math.PI / 2 : 0));
        const x = xOf(t), y = yOf(v);
        px === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (apparent !== fin) {
        ctx.fillStyle = "#e57373";
        ctx.font = "13px sans-serif";
        ctx.fillText(`表观(混叠)频率 ≈ ${apparent.toFixed(1)} Hz`, W - 260, 30);
      }
    }

    // 图例
    ctx.fillStyle = "#4fc3f7";
    ctx.font = "13px sans-serif";
    ctx.fillText("— 原始模拟信号", 50, 22);
    ctx.fillStyle = "#ffb74d";
    ctx.fillText("● 采样点", 190, 22);
    if (showRecon.checked) {
      ctx.fillStyle = "#e57373";
      ctx.fillText("--- 重建波形", 280, 22);
    }

    // 状态
    if (fs > 2 * fin) {
      status.className = "status ok";
      status.textContent = `✓ fs = ${fs} Hz > 2·fin = ${2 * fin} Hz —— 满足奈奎斯特定理，可无失真恢复`;
    } else if (fs === 2 * fin) {
      status.className = "status bad";
      status.textContent = `✗ fs = 2·fin（临界）—— 理论上临界，实际无法保证恢复`;
    } else {
      status.className = "status bad";
      status.textContent = `✗ fs = ${fs} Hz < 2·fin = ${2 * fin} Hz —— 发生混叠！高频成分伪装成低频`;
    }
  }

  sigFreq.addEventListener("input", draw);
  sampFreq.addEventListener("input", draw);
  showRecon.addEventListener("change", draw);
  draw();
})();

/* ================= 2. 量化 ================= */
(function () {
  const cv = $("quantCanvas");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;

  const bits = $("bits"), vref = $("vref"), amp = $("amp");
  const bitsVal = $("bitsVal"), levelsVal = $("levelsVal"), vrefVal = $("vrefVal"),
    ampVal = $("ampVal"), status = $("quantStatus");

  function draw() {
    const N = +bits.value;
    const V = +vref.value;
    const A = +amp.value / 100;
    bitsVal.textContent = N;
    levelsVal.textContent = 2 ** N;
    vrefVal.textContent = V.toFixed(1);
    ampVal.textContent = Math.round(A * 100);

    const lsb = V / 2 ** N;
    ctx.clearRect(0, 0, W, H);

    // 坐标
    const pad = 44;
    const xOf = (t) => pad + t * (W - pad - 12);
    const yOf = (v) => H - 26 - (v / V) * (H - 46);

    ctx.strokeStyle = "#2e3a55";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, 14); ctx.lineTo(pad, H - 26); ctx.lineTo(W - 12, H - 26);
    ctx.stroke();
    ctx.fillStyle = "#9aa7bd";
    ctx.font = "12px Consolas";
    ctx.fillText("0V", 10, yOf(0) + 4);
    ctx.fillText(V.toFixed(1) + "V", 4, yOf(V) + 4);

    // 量化电平线
    ctx.strokeStyle = "rgba(129,199,132,.18)";
    for (let k = 0; k <= 2 ** N; k++) {
      const y = yOf(k * lsb);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - 12, y); ctx.stroke();
    }

    const T = 1;
    const vIn = (t) => V / 2 * (1 + A * Math.sin(2 * Math.PI * 2 * t));

    // 原始信号
    ctx.strokeStyle = "#4fc3f7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= W - pad - 12; px++) {
      const t = px / (W - pad - 12);
      const x = xOf(t), y = yOf(vIn(t));
      px === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 量化阶梯
    ctx.strokeStyle = "#ffb74d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let prevY = null;
    const steps = 400;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const code = Math.min(2 ** N - 1, Math.floor(vIn(t) / lsb));
      const y = yOf((code + 0.5) * lsb);
      const x = xOf(t);
      if (prevY === null) ctx.moveTo(x, y);
      else if (Math.abs(y - prevY) > 0.5) { ctx.lineTo(x, prevY); ctx.lineTo(x, y); }
      else ctx.lineTo(x, y);
      prevY = y;
    }
    ctx.stroke();

    // 图例
    ctx.fillStyle = "#4fc3f7";
    ctx.font = "13px sans-serif";
    ctx.fillText("— 原始信号", pad + 10, 26);
    ctx.fillStyle = "#ffb74d";
    ctx.fillText("— 量化输出（阶梯）", pad + 120, 26);

    const snr = (6.02 * N + 1.76).toFixed(1);
    status.className = "status";
    status.textContent =
      `${N} bit：共 ${2 ** N} 级 | 1 LSB = ${(lsb * 1000).toFixed(2)} mV | 最大量化误差 ±${(lsb / 2 * 1000).toFixed(2)} mV | 理论 SNR ≈ ${snr} dB`;
  }

  bits.addEventListener("input", draw);
  vref.addEventListener("input", draw);
  amp.addEventListener("input", draw);
  draw();
})();

/* ================= 3. R-2R DAC 仿真 ================= */
(function () {
  const N = 8;
  let code = 0;
  const box = $("dacSwitches");
  const vrefSl = $("dacVref"), vrefVal = $("dacVrefVal");
  const dOut = $("dacD"), vOut = $("dacVout"), lsbOut = $("dacLsb");
  const bar = $("dacBar");
  const cv = $("dacCanvas");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  let rampTimer = null;

  // 创建开关
  const toggles = [];
  for (let i = N - 1; i >= 0; i--) {
    const div = document.createElement("div");
    div.className = "dac-bit";
    div.innerHTML =
      `<div class="bit-label">b${i}${i === N - 1 ? " (MSB)" : i === 0 ? " (LSB)" : ""}</div>` +
      `<div class="dac-toggle" data-bit="${i}">0</div>` +
      `<div class="bit-weight">×${(Math.pow(2, -(i + 1))).toFixed(4)}</div>`;
    box.appendChild(div);
    toggles[i] = div.querySelector(".dac-toggle");
    toggles[i].addEventListener("click", () => {
      code ^= (1 << i);
      update();
    });
  }

  function update() {
    const V = +vrefSl.value;
    vrefVal.textContent = V.toFixed(1);
    dOut.textContent = code;
    const v = V * code / 256;
    vOut.textContent = v.toFixed(4);
    lsbOut.textContent = (V / 256).toFixed(4);
    bar.style.width = (code / 255 * 100) + "%";
    for (let i = 0; i < N; i++) {
      const on = (code >> i) & 1;
      toggles[i].textContent = on;
      toggles[i].classList.toggle("on", !!on);
    }
    drawTransfer(v, V);
  }

  // 传输特性曲线
  function drawTransfer(vNow, V) {
    ctx.clearRect(0, 0, W, H);
    const pad = 40;
    const xOf = (d) => pad + (d / 255) * (W - pad - 12);
    const yOf = (x) => H - 22 - (x / V) * (H - 36);

    ctx.strokeStyle = "#2e3a55";
    ctx.beginPath();
    ctx.moveTo(pad, 10); ctx.lineTo(pad, H - 22); ctx.lineTo(W - 12, H - 22);
    ctx.stroke();
    ctx.fillStyle = "#9aa7bd";
    ctx.font = "11px Consolas";
    ctx.fillText("D (0~255)", W - 90, H - 6);
    ctx.fillText(V.toFixed(1) + "V", 4, yOf(V) + 4);
    ctx.fillText("0V", 12, yOf(0) + 4);

    // 阶梯传输曲线
    ctx.strokeStyle = "#81c784";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let d = 0; d < 256; d++) {
      const x1 = xOf(d), x2 = d < 255 ? xOf(d + 1) : W - 12;
      const y = yOf(V * d / 256);
      if (d === 0) ctx.moveTo(x1, y);
      else ctx.lineTo(x1, y);
      ctx.lineTo(x2, y);
    }
    ctx.stroke();

    // 当前工作点
    ctx.fillStyle = "#ffb74d";
    ctx.beginPath();
    ctx.arc(xOf(code), yOf(vNow), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffb74d";
    ctx.font = "12px Consolas";
    ctx.fillText(`(${code}, ${vNow.toFixed(3)}V)`, Math.min(xOf(code) + 10, W - 130), yOf(vNow) - 8);
  }

  $("dacZero").onclick = () => { stopRamp(); code = 0; update(); };
  $("dacFull").onclick = () => { stopRamp(); code = 255; update(); };
  $("dacHalf").onclick = () => { stopRamp(); code = 128; update(); };
  $("dacRandom").onclick = () => { stopRamp(); code = Math.floor(Math.random() * 256); update(); };
  $("dacRamp").onclick = () => {
    stopRamp();
    code = 0;
    rampTimer = setInterval(() => {
      code = (code + 1) % 256;
      update();
    }, 40);
  };
  function stopRamp() { if (rampTimer) { clearInterval(rampTimer); rampTimer = null; } }

  vrefSl.addEventListener("input", update);
  update();
})();

/* ================= 4. SAR ADC 仿真 ================= */
(function () {
  const N = 8;
  const VREF = 5;
  const vinSl = $("sarVin"), vinVal = $("sarVinVal");
  const codeEl = $("sarCode"), dacVEl = $("sarDacV"), cmpEl = $("sarCmp");
  const stepsBox = $("sarSteps"), resultEl = $("sarResult");

  let bitIdx = N - 1;   // 当前试探位
  let trial = 0;        // 当前试探码
  let running = false;
  let autoTimer = null;
  let stepRows = [];

  function buildRows() {
    stepsBox.innerHTML = "";
    stepRows = [];
    for (let i = N - 1; i >= 0; i--) {
      const row = document.createElement("div");
      row.className = "sar-step";
      row.innerHTML =
        `<span class="head">测 b${i}</span>` +
        `<span class="code">----------</span>` +
        `<span class="dacv">DAC: --</span>` +
        `<span class="cmp">--</span>` +
        `<span class="res">--</span>`;
      stepsBox.appendChild(row);
      stepRows[i] = row;
    }
  }

  function reset() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    running = false;
    bitIdx = N - 1;
    trial = 0;
    buildRows();
    codeEl.textContent = "-".repeat(N);
    dacVEl.textContent = "0.000";
    cmpEl.textContent = "—";
    resultEl.className = "sar-result";
    resultEl.textContent = "点击\"开始转换\"观看 8 位逐次逼近过程";
  }

  function vin() { return +vinSl.value; }

  function doStep() {
    if (bitIdx < 0) { finish(); return; }
    const bit = bitIdx;
    const candidate = trial | (1 << bit);
    const dacV = VREF * candidate / 256;
    const keep = dacV <= vin() + 1e-9;
    if (keep) trial = candidate;

    const row = stepRows[bit];
    row.classList.add("done");
    row.classList.remove("active");
    row.querySelector(".code").textContent = "0b" + trial.toString(2).padStart(N, "0");
    row.querySelector(".dacv").textContent = `DAC: ${dacV.toFixed(3)}V`;
    row.querySelector(".cmp").textContent = keep ? "DAC≤Vin" : "DAC>Vin";
    const res = row.querySelector(".res");
    res.textContent = keep ? `b${bit}=1 保留` : `b${bit}=0 清除`;
    res.className = "res " + (keep ? "keep" : "drop");

    codeEl.textContent = trial.toString(2).padStart(N, "0");
    dacVEl.textContent = dacV.toFixed(3);
    cmpEl.textContent = keep ? "✓ 保留该位" : "✗ 清除该位";

    bitIdx--;
    if (bitIdx < 0) finish();
  }

  function finish() {
    running = false;
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    const vq = VREF * trial / 256;
    resultEl.className = "sar-result final";
    resultEl.textContent =
      `转换完成：Vin = ${vin().toFixed(2)} V → 数字码 0b${trial.toString(2).padStart(N, "0")} = ${trial} → 量化电压 ${vq.toFixed(3)} V（误差 ${(vq - vin()).toFixed(3)} V，≤ 1 LSB = ${(VREF / 256 * 1000).toFixed(1)} mV）`;
  }

  $("sarStart").onclick = () => {
    if (running) return;
    reset();
    running = true;
    // 高亮当前行
    autoTimer = setInterval(() => {
      if (bitIdx >= 0) stepRows[bitIdx].classList.add("active");
      doStep();
    }, 700);
  };
  $("sarStep").onclick = () => {
    if (!running && bitIdx === N - 1 && trial === 0 && !resultEl.classList.contains("final")) {
      running = true;
    }
    if (resultEl.classList.contains("final")) return;
    if (bitIdx >= 0) stepRows[bitIdx].classList.add("active");
    doStep();
  };
  $("sarReset").onclick = reset;
  vinSl.addEventListener("input", () => {
    vinVal.textContent = (+vinSl.value).toFixed(2);
    reset();
  });

  reset();
})();

/* ================= 5. 自测题 ================= */
(function () {
  const quiz = [
    {
      q: "奈奎斯特采样定理要求采样频率 fs 与信号最高频率 fin 满足什么关系？",
      opts: ["fs > 2·fin", "fs > fin", "fs = fin", "fs > fin/2"],
      ans: 0,
      exp: "采样频率必须大于信号最高频率的 2 倍，否则会发生混叠，无法无失真恢复原信号。"
    },
    {
      q: "一个 12 位 ADC，参考电压 3.3 V，它的 1 LSB 约为多少？",
      opts: ["0.81 mV", "8.1 mV", "1.6 mV", "0.16 mV"],
      ans: 0,
      exp: "1 LSB = VREF / 2^N = 3.3 V / 4096 ≈ 0.806 mV。"
    },
    {
      q: "下列哪种 ADC 转换速度最快，但分辨率通常较低？",
      opts: ["Flash 闪存型", "SAR 逐次逼近型", "双积分型", "Σ-Δ 型"],
      ans: 0,
      exp: "Flash ADC 用 2^N−1 个比较器并行比较，一个时钟周期出结果，可达 GSPS 级，但位数一多比较器数量爆炸，一般不超过 10 bit。"
    },
    {
      q: "SAR ADC 完成一次 N 位转换大约需要多少个比较周期？",
      opts: ["N 个", "2N 个", "1 个", "2^N 个"],
      ans: 0,
      exp: "SAR 从 MSB 到 LSB 逐位试探，每位比较一次，共 N 次。"
    },
    {
      q: "R-2R 梯形网络 DAC 的最大优点是什么？",
      opts: ["只需要两种阻值的电阻", "不需要参考电压", "转换速度无限快", "完全没有误差"],
      ans: 0,
      exp: "R-2R 只用 R 和 2R 两种阻值，避免了权电阻型阻值范围过大的问题，易于集成且精度好。"
    },
    {
      q: "N 位理想 ADC 的理论最大信噪比 SNR 约为？",
      opts: ["6.02N + 1.76 dB", "20·log(N) dB", "N dB", "6.02N dB"],
      ans: 0,
      exp: "SNR_max ≈ 6.02N + 1.76 dB，每增加 1 bit 约提升 6 dB。"
    },
    {
      q: "用 8 kHz 采样一个 5 kHz 的正弦波，会出现什么现象？",
      opts: ["混叠，表观频率约 3 kHz", "正常无失真恢复", "信号被完全滤除", "表观频率为 10 kHz"],
      ans: 0,
      exp: "8 kHz < 2×5 kHz=10 kHz，不满足采样定理。混叠后的表观频率 |fin − fs| = |5−8| = 3 kHz。"
    },
    {
      q: "DNL（微分非线性）小于 −1 LSB 时会导致什么问题？",
      opts: ["失码（某些输出码永远不会出现）", "转换速度下降", "功耗增加", "参考电压漂移"],
      ans: 0,
      exp: "DNL < −1 LSB 意味着某一步进小于 0，对应的码在传输曲线上消失，即失码。"
    }
  ];

  const box = $("quizBox");
  const scoreEl = $("quizScore");
  let answered = 0, correct = 0;

  quiz.forEach((item, qi) => {
    const div = document.createElement("div");
    div.className = "quiz-item";
    const h = document.createElement("h4");
    h.textContent = `${qi + 1}. ${item.q}`;
    div.appendChild(h);
    const opts = document.createElement("div");
    opts.className = "quiz-opts";
    const explain = document.createElement("div");
    explain.className = "quiz-explain";
    explain.textContent = "解析：" + item.exp;

    let done = false;
    item.opts.forEach((text, oi) => {
      const btn = document.createElement("button");
      btn.className = "quiz-opt";
      btn.textContent = String.fromCharCode(65 + oi) + ". " + text;
      btn.onclick = () => {
        if (done) return;
        done = true;
        answered++;
        if (oi === item.ans) { btn.classList.add("correct"); correct++; }
        else {
          btn.classList.add("wrong");
          opts.children[item.ans].classList.add("correct");
        }
        explain.classList.add("show");
        scoreEl.textContent = `已答 ${answered}/${quiz.length} 题，正确 ${correct} 题`;
        if (answered === quiz.length) {
          scoreEl.textContent += correct === quiz.length ? " —— 满分，全部掌握！" : " —— 可回顾上文对应章节再试。";
        }
      };
      opts.appendChild(btn);
    });
    div.appendChild(opts);
    div.appendChild(explain);
    box.appendChild(div);
  });
})();
