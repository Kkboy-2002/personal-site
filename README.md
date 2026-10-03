# 任佳欢 · 个人站

静态个人网站:项目作品集 + 自制交互式教程 + 在线 Demo。纯 HTML/CSS/JS,无构建步骤。

## 目录结构

```
personal-site/
├── index.html            主页(关于 / 项目 / 教程 / 竞赛 / 定制案例 / Demo)
├── tutorials/            交互式教程(84 个自制 HTML 页面)
│   ├── cdc-lab.html      CDC 跨时钟域实验台
│   ├── fpga-interview.html  FPGA 面试图解
│   ├── verilog/          Verilog 十二课
│   ├── protocols/        通信协议动态图解(UART/SPI/I2C/CAN…)
│   ├── circuits/         元器件原理图解(二极管/三极管/MOS/运放…)
│   ├── adc-dac/ topology/ c/ rtos-kaodian/ …
├── demos/
│   ├── sandbox-game/     像素沙盒游戏(纯 JS)
│   └── student-ms/       学生管理系统
└── .nojekyll             关闭 GitHub Pages 的 Jekyll 处理(必须保留)
```

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库,如 `personal-site`(公开)。
2. 推送本目录全部内容:

   ```bash
   cd personal-site
   git init
   git add -A
   git commit -m "init: personal site"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/personal-site.git
   git push -u origin main
   ```

3. 仓库 Settings → Pages → Source 选 `Deploy from a branch`,Branch 选 `main` / `(root)`,保存。
4. 一两分钟后访问 `https://<你的用户名>.github.io/personal-site/`。

绑定自定义域名(可选):在仓库根目录加 `CNAME` 文件写入域名,并在 DNS 加 CNAME 记录指向 `<你的用户名>.github.io`。

## 本地预览

```bash
cd personal-site
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 上线前须知(重要)

- 全站已排除:凭据文件、账号池数据、涉密方案(110 辐射参数测试、光电校准装置、投标标书)、代做委托人身份信息。
- `index.html` 页脚邮箱为真实联系方式,如不想公开可删除或改为表单/GitHub 链接。
- 简历 PDF 未包含在站内;如需上传请自行脱敏后放入。
