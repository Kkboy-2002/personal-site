# 硬件电路面试图解 · 页面规范

根目录：D:\desktop\learn\硬件电路
用户是准备硬件工程师面试的学生，刚在面试白板上没画出运放、buck、LDO、H 桥等拓扑。页面目的是看图理解并能在面试里说清楚。所有文字用简体中文。

## 目录结构
```
index.html              总目录
_assets/style.css       共用样式（颜色一律用 token）
_assets/kit.js          共用函数
_assets/check.py        静态检查：id 引用、重复声明、JS 语法、本地链接
_assets/sitecheck.py    整站检查：页码、面包屑锚点、前后翻页、目录链接
_assets/rtcheck.js      运行时检查：无头 Chrome 点遍所有按钮和滑块，
                        查脚本报错、NaN/undefined、文字重叠或出界、手机宽度横向溢出
01-二极管 … 10-保护电路   每页一个 html
```

## 常用命令
```
cd "D:/desktop/learn/硬件电路"
PYTHONIOENCODING=utf-8 python _assets/check.py "01-二极管"          # 单组静态检查
PYTHONIOENCODING=utf-8 python _assets/sitecheck.py                  # 整站结构检查
node _assets/rtcheck.js 01-二极管                                   # 单组运行时检查
node _assets/rtcheck.js                                              # 全站运行时检查
```

## 开工前必读（完整读完）
1. `D:\desktop\learn\硬件电路\02-三极管\09-上拉电阻配三极管.html` —— **样板页**。用户明确说"做得非常好，器件形状非常好，按照当前的风格做"。电路符号的画法（电阻是 18×40 的圆角矩形、三极管基极是粗竖线 .bar、箭头用小 polygon、接地是三条递减横线、电源用文字加短横线、导线交点用 r=3.5 的实心圆、电流路径用绿色流动虚线 .flow）、布局（左 figure 右 panel）、读数区 dl.read、状态胶囊 .chip、说明 .note，全部照这个来。
2. `_assets/style.css` —— 共用样式，所有 class 在这里。颜色只能用里面的 token（var(--copper) 等），禁止写死颜色值。
3. `_assets/kit.js` —— 共用函数：$, NS, show, seg, fmtA, fmtV, fmtT(秒), fmtR, fmtF, fmtP, setLv, chip, scale, plot, svgEl。**不要重新声明这些名字**，页面自己的脚本如需同名变量请换名。

## 每个文件的骨架
```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>模块名（2~8 个字的名字，不要加"详解""：xxx"之类后缀）</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@700&display=swap">
<link rel="stylesheet" href="../_assets/style.css">
<!-- 仅在确有需要时加页面私有 <style>，且只用 token -->
</head>
<body>
<div class="wrap">
<nav class="crumb"><a href="../index.html">硬件电路图解</a><span>/</span><a href="../index.html#锚点">大类名</a><span class="sp"></span><span>03 / 09</span></nav>
<header>
  <span class="eyebrow">大类名 · 本页关键词</span>
  <h1>标题</h1>
  <p class="lede">一两句话说清本页要回答的问题。</p>
</header>

<section>… 2~4 个知识小节，每节至少一张可交互图（figure + panel），也可以有纯表格或纯文字节 …</section>

<section id="qa">
  <span class="eyebrow">面试怎么答</span>
  <h2>常见追问</h2>
  <div class="qa">
    <details open><summary>问题</summary><div class="ans"><p>回答</p></div></details>
    … 共 3~5 条，第一条 open …
  </div>
</section>

<nav class="pager"><a class="prev" href="上一页文件名.html"><span>上一页</span>上一页标题</a><a class="next" href="下一页文件名.html"><span>下一页</span>下一页标题</a></nav>
</div>
<script src="../_assets/kit.js"></script>
<script>
/* 页面脚本 */
</script>
</body>
</html>
```
- 组内第一页没有上一页：prev 链接省略，只留 next。组内最后一页的 next 指向 `../index.html#锚点`，文字"返回目录"。
- 文件名、标题、页码、锚点严格按任务里给的清单，不要自己改名。

## 内容要求
- **准确第一**。这是面试备考材料，公式、典型值、结论必须正确。拿不准的数值宁可写范围并标"典型值"。示意数据在 figcaption 或 .note 里标明"示意"。
- **公式用纯文本**，不要 LaTeX。例如 `Vo = −(Rf / Rin)·Vin`，放在 `<p class="eq">` 里或正文里。用户终端和阅读习惯都不要 LaTeX。
- **每张交互图都要讲一个机制**：切换/拖动后，电路里的电流路径、电平颜色、波形、读数、状态胶囊、.note 文字要一起变，且数值由公式算出来，不是写死。参考样板里的 s1u/s3u/s4u 写法：一个 state 对象 + 一个 update 函数 + seg/range 事件。
- **页面加载即处于有意义的默认状态**（显示一种典型工作情况），不能是空白等待输入。
- 波形/特性曲线：用 scale/plot 画 polyline，有坐标轴 .ax、网格 .gl、刻度数值、轴名和单位；所有标签在 viewBox 内不重叠。多条曲线用 .real / .real2 / .real3 区分，并在线旁直接标注。
- 电路图：viewBox 按内容定；文字 12~13px；导线对齐网格；交点画点；元件旁写元件名和值；箭头与电流方向要符合物理事实（电流从高电位流向低电位）。SVG 加 role="img" 和 aria-label，figure 带 figcaption。
- 表格放在 `<div class="tbl"><table>…</table></div>` 里。
- 文字风格：短句，一句一个意思；多用"因为…所以…"讲清原因；少堆术语。可以适当点出"面试时这样说"。
- 跨页引用可以用相对链接，例如 `../07-电源相关/02-Buck拓扑.html`，只链接清单里存在的页面（完整清单见本文末尾）。
- 所有 button 和 input 都要有唯一 id；range 用 `<label for>`。
- 页面在 400px 手机宽度下也要可用（style.css 已处理 .demo 单列）。

## 自检（必须做）
每写完一个文件运行：
```
cd "D:/desktop/learn/硬件电路" && PYTHONIOENCODING=utf-8 python _assets/check.py "文件夹名/文件名.html"
```
（Bash 工具里执行。）修到只剩"链接目标不存在"且目标是本组尚未生成的页面或 ../index.html 为止。全部写完后对整个文件夹再跑一次。不要截图，不要反复打开浏览器。

运行时检查 `rtcheck.js` 很慢（每页约 15 秒），一次最多给一组或十几页。

**注意：写大文件时分段写。** 单次回复只能发一个写文件的工具调用，Write 或 Edit 的内容每次控制在约 4000 字以内。一页拆成骨架与第一节、其余各节、问答与翻页、脚本分几段追加。一次写整页会超出 32000 输出 token 上限而中断。

**注意：不要用 python heredoc 写含中文和引号的页面正文。** 中文会变成乱码，`)}))` 这类括号也可能被 shell 吃掉。要用 Edit 工具，或者把内容先写进单独文件再让 python 读取，读文件时用 `C:/Users/...` 这种 Windows 路径。

## 完成后回报
只回报：生成的文件列表、check.py 最终结果、有无偏离清单的地方。不要贴页面源码。

## 全站清单（文件夹 / 锚点 / 文件）
01-二极管 #diode：01-单向导电性与PN结, 02-伏安特性与正向压降, 03-反向击穿齐纳与雪崩, 04-续流二极管, 05-钳位电路, 06-稳压二极管应用, 07-反向恢复时间, 08-肖特基与普通二极管
02-三极管 #bjt：01-NPN与PNP结构, 02-三个工作区, 03-β放大倍数, 04-输入输出特性曲线, 05-静态工作点Q, 06-温度稳定性与热漂移, 07-三种组态对比, 08-饱和失真与截止失真, 09-上拉电阻配三极管(已完成)
03-MOS管 #mos：01-N沟道与P沟道, 02-增强型与耗尽型, 03-阈值电压与转移特性, 04-输出特性与三个工作区, 05-跨导gm, 06-栅极电容与米勒效应, 07-体二极管, 08-导通电阻Rdson, 09-驱动功耗
04-IGBT #igbt：01-结构BJT加MOS复合, 02-导通压降Vcesat, 03-开关频率对比, 04-拖尾电流, 05-短路耐受时间, 06-驱动要求正负压, 07-应用场景与选型
05-运放 #opamp：01-虚短与虚断, 02-反相放大器, 03-同相放大器, 04-差分放大器, 05-积分电路, 06-微分电路, 07-增益带宽积GBW, 08-压摆率SR, 09-失调电压与偏置电流, 10-CMRR与PSRR, 11-轨到轨输出, 12-单电源供电
06-基本电路 #basic：01-整流电路半波全波桥式, 02-电容滤波, 03-LC滤波, 04-稳压电路齐纳LDO开关, 05-分压偏置, 06-负反馈四种组态, 07-负反馈的作用
07-电源相关 #power：01-LDO与开关电源对比, 02-Buck拓扑, 03-Boost拓扑, 04-开关频率与效率, 05-纹波与噪声, 06-反馈环路稳定性, 07-电感选型, 08-续流二极管选择
08-PCB与调试 #pcb：01-去耦电容布局, 02-地平面与电源平面, 03-模拟地与数字地, 04-反射与阻抗匹配, 05-串扰, 06-热设计, 07-示波器带宽与采样率, 08-逻辑分析仪触发
09-通信接口 #bus：01-UART, 02-SPI, 03-I2C, 04-CAN, 05-RS485
10-保护电路 #protect：01-保险丝与自恢复保险丝, 02-采样电阻加比较器过流保护, 03-TVS与齐纳过压保护, 04-压敏电阻, 05-二极管防反接, 06-PMOS防反接, 07-ESD防护, 08-缓启动
