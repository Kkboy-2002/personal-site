"""整站一致性检查：python sitecheck.py
核对 SPEC.md 清单里的每一页：文件是否存在、面包屑页码与锚点、上一页/下一页链接是否指向相邻页面，以及 index.html 的链接。"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = io.open(os.path.join(ROOT, '_assets', 'SPEC.md'), encoding='utf-8').read()
cats = []
for line in spec.split('## 全站清单')[1].strip().split('\n')[1:]:
    m = re.match(r'(\S+) #(\w+)：(.*)', line.strip())
    if m:
        folder, anchor, items = m.groups()
        cats.append((folder, anchor, [re.sub(r'\(已完成\)', '', x.strip()) for x in items.split(',')]))

errs, missing, total = [], [], 0
for folder, anchor, items in cats:
    n = len(items)
    for i, name in enumerate(items):
        total += 1
        p = os.path.join(ROOT, folder, name + '.html')
        tag = f'{folder}/{name}'
        if not os.path.exists(p):
            missing.append(tag)
            continue
        h = io.open(p, encoding='utf-8').read()
        crumb = re.search(r'<nav class="crumb">(.*?)</nav>', h, re.S)
        if not crumb:
            errs.append(f'{tag}: 没有面包屑')
        else:
            c = crumb.group(1)
            if f'../index.html#{anchor}' not in c:
                errs.append(f'{tag}: 面包屑锚点不是 #{anchor}')
            want = f'{i + 1:02d} / {n:02d}'
            got = re.search(r'(\d+)\s*/\s*(\d+)\s*</span>\s*$', c.strip())
            if not got or f'{int(got.group(1)):02d} / {int(got.group(2)):02d}' != want:
                errs.append(f'{tag}: 页码应为 {want}，实际 {got.group(0) if got else "缺失"}')
        pager = re.search(r'<nav class="pager">(.*?)</nav>', h, re.S)
        if not pager:
            errs.append(f'{tag}: 没有翻页')
            continue
        pg = pager.group(1)
        prev = re.search(r'class="prev" href="([^"]+)"', pg)
        nxt = re.search(r'class="next" href="([^"]+)"', pg)
        want_prev = items[i - 1] + '.html' if i > 0 else None
        want_next = items[i + 1] + '.html' if i < n - 1 else f'../index.html#{anchor}'
        if want_prev is None and prev:
            errs.append(f'{tag}: 第一页不该有上一页')
        if want_prev and (not prev or prev.group(1) != want_prev):
            errs.append(f'{tag}: 上一页应指向 {want_prev}，实际 {prev.group(1) if prev else "缺失"}')
        if not nxt or nxt.group(1) != want_next:
            errs.append(f'{tag}: 下一页应指向 {want_next}，实际 {nxt.group(1) if nxt else "缺失"}')

idx = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
for href in re.findall(r'href="(\d\d-[^"#]+\.html)"', idx):
    if not os.path.exists(os.path.join(ROOT, href)):
        errs.append(f'index.html: 链接目标不存在 {href}')

print(f'清单共 {total} 页，已存在 {total - len(missing)} 页')
for m in missing:
    print('  缺页  ' + m)
for e in errs:
    print('  问题  ' + e)
sys.exit(1 if (errs or missing) else 0)
