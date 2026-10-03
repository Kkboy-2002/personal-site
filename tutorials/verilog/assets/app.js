/* ============================================================
   FPGA 课堂 · 页面脚本(普通脚本,可直接以 file:// 打开)
   职责:课程导航 / 本页路线 / Verilog 着色 / 行号 / 复制 / 主题
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 课程清单:唯一数据源 ---------- */
  var LESSONS = [
    { n: "00", f: "lesson00.html", t: "环境搭建与第一次仿真", s: "iverilog · GTKWave · 工程结构" },
    { n: "01", f: "lesson01.html", t: "模块、端口与 Testbench", s: "module · 端口方向 · 激励与断言" },
    { n: "02", f: "lesson02.html", t: "组合逻辑:wire 与 assign", s: "运算符 · 全加器 · 优先编码器" },
    { n: "03", f: "lesson03.html", t: "时序逻辑:always 与两种赋值", s: "触发器 · 阻塞与非阻塞 · 复位" },
    { n: "04", f: "lesson04.html", t: "计数器、分频与流水灯", s: "时钟使能 · 参数化缩短仿真" },
    { n: "05", f: "lesson05.html", t: "if 与 case:译码与显示", s: "锁存器陷阱 · 数码管扫描" },
    { n: "06", f: "lesson06.html", t: "边沿检测与按键消抖", s: "打拍 · 同步 · 消抖计数器" },
    { n: "07", f: "lesson07.html", t: "状态机:三段式写法", s: "序列检测 · 交通灯 · 编码方式" },
    { n: "08", f: "lesson08.html", t: "参数化与 generate", s: "层次化设计 · 批量例化" },
    { n: "09", f: "lesson09.html", t: "存储器:RAM、ROM 与 FIFO", s: "$readmemh · 综合属性 · 空满判断" },
    { n: "10", f: "lesson10.html", t: "综合项目:UART 收发器", s: "波特率 · 过采样 · 回环自检" },
    { n: "11", f: "lesson11.html", t: "读懂时序图:SDRAM 初始化", s: "手册标签 · tRP/tRFC · 行为模型" }
  ];

  var here = document.body.getAttribute("data-lesson");   // "00".."10",首页为 null
  var root = document.body.getAttribute("data-root") || "";  // 首页 "" / 课程页 "../"

  /* ---------- 侧栏 ---------- */
  function sidebar() {
    var host = document.querySelector(".side ol");
    if (!host) return;
    LESSONS.forEach(function (L) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = root + "lessons/" + L.f;
      a.innerHTML = "<b>" + L.n + "</b><span>" + L.t + "</span>";
      if (L.n === here) a.setAttribute("aria-current", "page");
      li.appendChild(a);
      host.appendChild(li);
    });
  }

  /* ---------- 上一课 / 下一课 ---------- */
  function pager() {
    var host = document.querySelector(".pager");
    if (!host || here === null) return;
    var i = -1;
    LESSONS.forEach(function (L, k) { if (L.n === here) i = k; });
    if (i < 0) return;
    function cell(L, dir, label) {
      if (!L) return '<span class="ph ' + dir + '"><span>' + label + '</span><b>—</b></span>';
      return '<a class="' + dir + '" href="' + L.f + '"><span>' + label +
             " · " + L.n + '</span><b>' + L.t + "</b></a>";
    }
    host.innerHTML = cell(LESSONS[i - 1], "prev", "上一课") +
                     cell(LESSONS[i + 1], "next", "下一课");
  }

  /* ---------- 本页路线:由 main 下的 h2[id] 生成 ---------- */
  function toc() {
    var host = document.querySelector(".toc ol");
    if (!host) return;
    var hs = document.querySelectorAll("main h2[id]");
    if (!hs.length) { var t = document.querySelector(".toc"); if (t) t.remove(); return; }
    Array.prototype.forEach.call(hs, function (h) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      host.appendChild(li);
    });
  }

  /* ---------- Verilog 词法着色 ---------- */
  var KW = ("module endmodule input output inout wire reg logic integer genvar parameter localparam " +
    "assign always always_ff always_comb always_latch initial begin end if else case casez casex " +
    "endcase default for while repeat forever function endfunction task endtask return generate " +
    "endgenerate posedge negedge signed unsigned real realtime time event fork join wait disable " +
    "force release automatic typedef enum struct union packed unique priority void bit byte int " +
    "shortint longint const static import export package endpackage interface endinterface modport " +
    "defparam specify endspecify primitive endprimitive table endtable tri tri0 tri1 wand wor " +
    "supply0 supply1 edge and or not nand nor xor xnor buf macromodule scalared vectored"
  ).split(" ");

  var RE = new RegExp(
    "(?<cm>\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)" +                       // 注释
    "|(?<st>\"(?:[^\"\\\\\\n]|\\\\.)*\")" +                               // 字符串
    "|(?<dr>`[A-Za-z_]\\w*)" +                                            // 编译指令
    "|(?<sy>\\$[A-Za-z_]\\w*)" +                                          // 系统任务
    "|(?<pt>\\.[A-Za-z_]\\w*(?=\\s*\\())" +                               // 例化端口名
    "|(?<nu>(?:\\b\\d[\\d_]*)?'[sS]?[bBoOdDhH][0-9a-fA-FxXzZ_?]+|\\b\\d[\\d_]*(?:\\.\\d+)?\\b)" +
    "|(?<kw>\\b(?:" + KW.join("|") + ")\\b)", "g");

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function paint(src) {
    return esc(src).replace(RE, function (m) {
      var g = arguments[arguments.length - 1];
      for (var k in g) {
        if (g[k] !== undefined) return '<span class="tk-' + k + '">' + m + "</span>";
      }
      return m;
    });
  }

  /* ---------- 代码块:着色 + 行号 + 复制 ---------- */
  function code() {
    Array.prototype.forEach.call(document.querySelectorAll(".file"), function (fig) {
      var el = fig.querySelector(".body pre code");
      if (!el) return;
      var raw = el.textContent.replace(/\s+$/, "");
      el.innerHTML = paint(raw);

      var lines = raw.split("\n").length, nums = [];
      for (var i = 1; i <= lines; i++) nums.push(i);
      var g = document.createElement("div");
      g.className = "gutter";
      g.setAttribute("aria-hidden", "true");
      g.textContent = nums.join("\n");
      fig.querySelector(".body").insertBefore(g, fig.querySelector(".body").firstChild);

      var cap = fig.querySelector("figcaption");
      if (!cap) return;
      var btn = document.createElement("button");
      btn.className = "copy";
      btn.type = "button";
      btn.textContent = "复制";
      btn.addEventListener("click", function () {
        var done = function () {
          btn.textContent = "已复制";
          btn.setAttribute("data-done", "1");
          setTimeout(function () { btn.textContent = "复制"; btn.removeAttribute("data-done"); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(raw).then(done, fallback);
        } else { fallback(); }
        function fallback() {
          var ta = document.createElement("textarea");
          ta.value = raw;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); done(); } catch (e) { btn.textContent = "请手动选择"; }
          document.body.removeChild(ta);
        }
      });
      cap.appendChild(btn);
    });
  }

  /* ---------- 主题:系统 → 浅色 → 深色 循环 ---------- */
  function theme() {
    var KEY = "fpga-theme", order = ["", "light", "dark"];
    var label = { "": "主题 · 跟随系统", light: "主题 · 浅色", dark: "主题 · 深色" };
    var cur = "";
    try { cur = localStorage.getItem(KEY) || ""; } catch (e) { cur = ""; }

    function apply(v) {
      if (v) document.documentElement.setAttribute("data-theme", v);
      else document.documentElement.removeAttribute("data-theme");
      Array.prototype.forEach.call(document.querySelectorAll(".themer"), function (b) {
        b.textContent = label[v];
      });
    }
    apply(cur);

    Array.prototype.forEach.call(document.querySelectorAll(".themer"), function (b) {
      b.addEventListener("click", function () {
        cur = order[(order.indexOf(cur) + 1) % order.length];
        try { localStorage.setItem(KEY, cur); } catch (e) { /* file:// 下可能不可用 */ }
        apply(cur);
      });
    });
  }

  /* ---------- 网页步进台入口 ---------- */
  function stepEntry() {
    var url = root + "playground.html" + (here !== null ? "?lesson=" + here : "");
    var foot = document.querySelector(".side .foot");
    if (foot) {
      var shortcut = document.createElement("a");
      shortcut.className = "step-shortcut";
      shortcut.href = url;
      shortcut.textContent = "打开寄存器步进台 →";
      foot.insertBefore(shortcut, foot.firstChild);
    }
    var goals = document.querySelector("main .goals");
    if (here !== null && goals) {
      var entry = document.createElement("div");
      entry.className = "step-entry";
      entry.innerHTML = '<div><strong>把本课的电路一步步跑起来</strong>' +
        '<p>前进一拍，看寄存器旧值 → 新值；回退、对照代码，再看波形。</p></div>' +
        '<a class="step-button" href="' + url + '">逐拍观察本课 →</a>';
      goals.insertAdjacentElement("afterend", entry);
    }
  }

  // Shared with the register step player; the course remains usable via file://.
  window.FPGACode = { highlight: paint };

  sidebar();
  pager();
  toc();
  code();
  theme();
  stepEntry();
})();
