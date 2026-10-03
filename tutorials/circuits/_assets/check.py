"""页面自检：python check.py <html 文件或文件夹>...
检查：1) 内联脚本 + kit.js 能否通过 node --check  2) $('id') 引用的 id 在页面里是否存在
3) 是否重复声明 kit.js 已有的全局名  4) 骨架要素是否齐全  5) 页内 href 链接的本地文件是否存在"""
import sys, re, os, subprocess, tempfile, glob, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = io.open(os.path.join(ROOT, '_assets', 'kit.js'), encoding='utf-8').read()
KIT_NAMES = ['$', 'NS', 'show', 'seg', 'fmtA', 'fmtV', 'fmtT', 'fmtR', 'fmtF', 'fmtP', 'setLv', 'chip', 'scale', 'plot', 'svgEl']

def check(path):
    errs = []
    html = io.open(path, encoding='utf-8').read()
    ids = set(re.findall(r'\bid="([^"]+)"', html))
    scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
    js = '\n'.join(scripts)
    for need in ['<meta charset="utf-8">', '../_assets/style.css', '../_assets/kit.js', 'class="crumb"', 'class="qa"', 'class="pager"', '<title>']:
        if need not in html:
            errs.append('缺少骨架要素: ' + need)
    # 重复声明
    for n in KIT_NAMES:
        if re.search(r'(^|[\s;{(,])(const|let|var|function)\s+' + re.escape(n) + r'\b', js):
            if not re.search(r'\(\s*\(\)\s*=>|\(function\s*\(', js):  # 放在 IIFE 里则允许
                errs.append('重复声明 kit.js 全局名: ' + n)
    # id 引用
    for m in set(re.findall(r"\$\(\s*'([^']+)'\s*\)", js)):
        if m not in ids and '${' not in m:
            errs.append('脚本引用了不存在的 id: ' + m)
    for m in set(re.findall(r"seg\(\s*'([^']+)'\s*,", js)):
        if m not in ids:
            errs.append('seg() 引用了不存在的 id: ' + m)
    # 语法
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(KIT + '\n;\n' + js)
        tmp = f.name
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True, encoding='utf-8')
    os.unlink(tmp)
    if r.returncode != 0:
        errs.append('JS 语法错误:\n' + r.stderr.strip()[:800])
    # 本地链接
    base = os.path.dirname(path)
    for href in sorted(set(re.findall(r'href="([^"#:]+\.html)(?:#[^"]*)?"', html))):
        if not os.path.exists(os.path.normpath(os.path.join(base, href))):
            errs.append('链接目标不存在（若是尚未生成的同组页面可忽略）: ' + href)
    return errs

files = []
for a in sys.argv[1:]:
    files += sorted(glob.glob(os.path.join(a, '*.html'))) if os.path.isdir(a) else [a]
bad = 0
for p in files:
    e = check(p)
    print(('OK   ' if not e else 'FAIL ') + os.path.basename(p))
    for x in e:
        print('     - ' + x)
    bad += bool(e)
sys.exit(1 if bad else 0)
