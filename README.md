# 逐光 · AI求职助手

## 当前状态

逐光是一个以 AI 为核心的求职工作台：简历/投递、岗位与企业、学习刷题、模拟面试、AI 协作空间、心愿池和管理中心。

已接通：

- 账号/会话、资料与多版本简历、PDF/Word 导入识别、投递方案与事实校验
- 岗位、企业风评、租房地图与数据空间
- 学习刷题：1761 道面经/八股，来源、答案来源标记、收藏、错题、进度
- AI 协作空间：四个 agent、图片/文本附件、多 agent 规划与只读工具
- 模拟面试：难度、半双工/全双工实时、端侧 MediaPipe + 关键帧 VLM 四层视频理解
- **RAG 知识库问答**：混合检索（BM25 + text-embedding-v4）→ RRF → qwen3-rerank → qwen-plus，带引用和拒答；只检索公开题库/岗位/企业/房源
- **Tool RAG**：工具注册表按问题检索 top3，不再每次塞完整工具表
- 心愿池、独立管理中心、AI 页面、实时地图、Live2D 兜底
- 生产硬化：CSP、iframe sandbox、会话撤销、RAG/登录/写接口限流、并发 guard

说明：

- 微调**不是本竞赛的评分项**，当前无明确应用场景，暂不做；RAG、Agent、MCP、多模态和安全才是得分点。
- 本地可用 HTTP；需要摄像头/麦克风或远程访问时必须 HTTPS。HTTPS 证书放在 `app/private/https/`，服务启动时自动启用；配置私有的 `app/private/ai-config.json`。
- 原始音视频不落盘；RAG 不索引个人资料、简历、聊天记录或用户上传文件。

## 查看

- 本地验收：有 `app/private/https/` 证书时 `https://127.0.0.1:5173/`（HTTP 兜底 5174）；无证书时 `http://127.0.0.1:5173/`。
- 岗位 / 投递方案：`#jobs` / `#plan`
- 学习：`#knowledge` / `#practice`
- RAG / Tool RAG 说明：[RAG.md](docs/RAG.md) / [TOOL_RAG.md](docs/TOOL_RAG.md)
- 生产审查记录：[REVIEW_2026-10-26.md](docs/REVIEW_2026-10-26.md)
- 竞赛要求核对：[COMPETITION_REQUIREMENTS.md](docs/COMPETITION_REQUIREMENTS.md)
- 国奖对比/扣分加分：[COMPETITION_GAP_ANALYSIS.md](docs/COMPETITION_GAP_ANALYSIS.md)
- 功能清单：[FEATURES.md](docs/FEATURES.md)
- 完整测试报告：[TEST_REPORT.md](docs/TEST_REPORT.md)
- 手动测试流程/素材：[MANUAL_TESTING.md](docs/MANUAL_TESTING.md) / [fixtures](app/tests/fixtures/README.md)
- 全站点击审计：[CLICK_AUDIT.md](docs/CLICK_AUDIT.md)
- 产品价值：[PRODUCT_VALUE.md](docs/PRODUCT_VALUE.md)
- 第三方与原创说明：[THIRD_PARTY.md](docs/THIRD_PARTY.md)
- 保留旧外观：`/preview/index.html`
- 注册自己的测试账号。本地/测试环境请勿输入真实敏感资料或常用密码；未实现邮件验证/密码找回。

## 在其他电脑上首次运行

### 1. 环境要求

推荐 **Ubuntu/Debian Linux**：

- Node.js **22.13+**（项目使用 `node:sqlite`），npm
- Python 3
- Chromium 或 Google Chrome（服务端生成 PDF 用；也可设置 `CHROME_PATH`）
- OCR/PDF 导入需要：`bwrap`、`prlimit`、`nice`、`pdfinfo`、`pdftotext`、`pdftoppm`、`apt-get`、`dpkg-deb`
- HTTPS 证书需要 `openssl`
- 不需要 Docker；不需要全局安装 Playwright 浏览器，但服务端必须能找到 Chromium
- `npm ci` 不会自动下载 Chromium；可安装系统 Chromium/Chrome，或用 `CHROME_PATH=/path/to/chrome` 指定。Ubuntu 可用 `sudo apt install chromium-browser`（包名随发行版可能不同）

macOS/Windows 可以运行页面和普通接口，但本项目 OCR 的 `bwrap` 沙箱和资源限制按 Linux 设计；Windows/macOS 上简历 OCR/部分 PDF 导入可能不可用。

### 2. 安装、构建、启动

```sh
cd app
npm ci
npm run typecheck          # 可选，先检查 TypeScript
npm run build
npm run setup:ocr          # 可选；需要 PDF/OCR 时执行，Linux 无 sudo
HOST=0.0.0.0 PORT=5173 npm start
```

只启动产品主壳不需要先构建 `prototype`。`prototype` 只是旧版 `/preview` 布局和兼容静态资源，可选：

```sh
cd prototype
npm ci
npm run build
```

### 3. 配置 AI

AI 功能需要私有配置，不要把密钥提交到 Git：

```sh
cd app
mkdir -p private
cp ai-config.example.json private/ai-config.json
chmod 600 private/ai-config.json
```

编辑 `private/ai-config.json`，至少填：

- `baseUrl`、`apiKey`、`model`：文本/规划/面试等 AI 功能
- `visionModel`：图片理解（若使用视觉能力）
- `imageBaseUrl`、`imageApiKey`、`imageModel`：AI 生图/装饰（可选）
- `aliyunKey`、`aliyunTtsModel`、`aliyunTtsVoice`：阿里云 TTS/ASR（可选，但语音功能需要）

未配置时应用仍能启动，但相关 AI 接口会明确报“AI 未配置/上游不可用”，不会把离线结果伪装成 AI 结果。

高德地图是可选配置：

```sh
mkdir -p private
cp geo-config.example.json private/geo-config.json
chmod 600 private/geo-config.json
```

填入 `amapKey`、`amapJsKey`、`amapJsSecurity`；未配置时地图功能不可用或退回占位。

### 4. HTTPS 与端口

需要摄像头/麦克风、或从另一台电脑通过局域网 IP 访问时，必须使用 HTTPS。生成自签名证书：

```sh
cd app
mkdir -p private/https
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout private/https/key.pem \
  -out private/https/cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
chmod 600 private/https/key.pem private/https/cert.pem
```

如果从另一台电脑访问，把证书的 `subjectAltName` 改成实际域名/局域网 IP，并在浏览器信任该证书。重启服务后：

- 有证书：主站 `https://<host>:5173`，HTTP 兜底 `http://<host>:5174`
- 无证书：`http://<host>:5173`

不要把自签名证书用于公网正式服务；正式部署应使用受信任证书和反向代理。服务端在 HTTPS 连接上会自动写 Secure Cookie，反向代理后用 `CAREER_SECURE_COOKIE=true`。

### 5. 数据、管理员和备份

- 数据默认在 `app/private/career.sqlite`，不进入 Git；第一次启动自动建表。
- 首次启动自动创建管理员，随机密码在 `app/private/admin-initial.txt`；可用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 指定。
- 迁移电脑时复制整个 `app/private/`（数据库、配置、证书）并保持权限 600；不要只复制数据库而漏掉 WAL 文件。
- 没有数据库备份/恢复演练前，不要把它当作高可用生产集群；这是小规模验收实现。

### 6. 可选环境变量

```sh
HOST=0.0.0.0
PORT=5173
HTTP_PORT=5174          # 有 HTTPS 时的 HTTP 兜底端口
HTTPS_PORT=5173         # HTTPS 端口
CAREER_DATA_DIR=./private
CHROME_PATH=/usr/bin/chromium
CAREER_SECURE_COOKIE=false
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=至少10位密码
```

`.env` 不会自动加载；请在 shell 中 export，或使用进程管理器注入。

### 7. 构建与运行原理

Vue3+TypeScript 组件由 esbuild 路由分包；Node22 原生 SQLite，持久层使用 WAL 与索引。`npm run build` 清理并重建 `app/dist`，服务默认从 `dist` 静态提供；`CAREER_STATIC_DIR` 可覆盖。密码 scrypt 散列，服务端会话、CSRF/Origin 校验、账号所有权检查、乐观版本冲突校验。

## AI审阅配置与保护
- 服务端支持OpenAI兼容的`/chat/completions`端点，配置参考 `app/ai-config.example.json`（复制到 `app/private/ai-config.json`，权限 600，真实密钥不提交）；用户已提供项目凭据，具体可用性以私有运行时配置及请求结果为准；未配置会明确提示，不能把离线测试或模型列表响应当真实AI效果。
- 简历审阅限制为1个上游请求、队列最多2个、每账号每分钟3次、单请求45秒；投递话术另有独立1个上游槽，二者合计可达2，并非全应用全局1个；输入约50KB；返回必须是结构化前后建议，服务端校验后才展示。未来视觉模型另设更严的图片/费用预算。

## 简历识别运行条件与保护
- 需要Linux、Python3、prlimit、nice、bwrap（namespace可用）、pdfinfo、pdftotext、pdftoppm；OCR工具和中文/英文模型通过setup:ocr私有展开到app/.tools/ocr，缺能力会报错，不回退裸进程。二进制/模型不提交Git。
- 原件仅临时私有保存，完成/失败/取消后删除；识别结果仅内存、15分钟有效（最迟约16分钟清理）、重启即丢；只有显式确认资料/版本持久保存。
- 默认全站1个任务、≤5MiB、PDF≤4页、图片≤1200万像素且长边≤6000；时间/进程资源有上限，繁忙拒绝重任务而不排无限队列。详见[资源预算](docs/CAPACITY_BUDGET.md)。

## 验证

先按上面的方式启动服务；有 HTTPS 时把 `TEST_BASE_URL` 改成 `https://127.0.0.1:5173`。测试脚本默认使用本机 Chromium 路径，只用于开发验收，不是运行时必需。

```sh
cd app
npm run typecheck
npm run test:smoke
npm run test:browser
npm run test:review
node tests/rag-eval.mjs
TEST_BASE_URL=http://127.0.0.1:5173 npm run test:studio
TEST_BASE_URL=http://127.0.0.1:5173 npm run test:intake
TEST_BASE_URL=http://127.0.0.1:5173 npm run test:extraction
node tests/worker-isolation.mjs
```
- 23项API/安全/持久化/小规模并发正确性冒烟：两账号越权读写删除拒绝、CSRF、版本冲突、进程重启后数据/会话保留等。测试用临时目录，结束自动清理。
- 基础10项 + 文档工作室17项真实Chromium浏览器冒烟：注册/资料与多段教育/意向chip/刷新还原/简历版本切换/安全文本渲染/退出/移动端/外观页。浏览器脚本目前使用本机地址与本机Chromium路径。
- 本批新增12项上传/确认/拖动真实浏览器检查，10项提取安全检查，2项原生worker隔离/退出清理探针；检查仅使用合成测试简历。
- 2026-10-26 已做一轮生产级安全/性能审查：CSP、iframe sandbox、会话撤销、RAG/Tool RAG、路径穿越、限流、双击并发；记录与残余风险见 [REVIEW_2026-10-26.md](docs/REVIEW_2026-10-26.md)。尚无全量自动化、长稳压测和第三方渗透测试，不能以自检替代正式验收。
- 竞赛评分与“微调不是必需项”的核对见 [COMPETITION_REQUIREMENTS.md](docs/COMPETITION_REQUIREMENTS.md)；RAG 评测见 [RAG_EVAL.md](docs/RAG_EVAL.md)。

## 团队信息

- **ray1296**：项目负责人，架构、AI、全栈主要开发。
- **Hxixi111**：团队成员，协作方向：测试与前端体验。
- **YIN-YU-CJENG**：团队成员，协作方向：文档与演示材料。
- 具体贡献以 GitHub 提交/PR 记录为准；不把未发生的贡献写成已发生。
- 公开仓库不要写手机号、邮箱、身份证等个人敏感信息；评审如需登录，用单独测试账号。

## 计划与约束
- [完整功能计划](docs/FEATURE_PLAN.md)
- [分批验收与结果](docs/DELIVERY_BATCHES.md)

每批完成即停止等待用户检查。比赛正式视频、PDF、商业材料待全部功能审核通过后制作。保留真实Git贡献，不保证奖项。

外观原型参考用户已有项目；legacy仅用于布局预览，正式产品需原创实现及复用许可核对。参考项目原件、国奖资料、附件原件和密钥均不提交。
