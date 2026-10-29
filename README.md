# AI求职助手 · AI Career Assistant

> 面向大学生的 **AI 求职工作台**：把「认识自己 → 打磨简历 → 探索岗位 → 针对性准备 → 模拟面试」做成一条能真正走完的路径，并用 Agent、RAG、多模态把每一步自动化。
>
> 参赛作品 · 全国大学生计算机应用能力与数字素养大赛暨第八届传智杯全国 IT 技能大赛 **AI Web 网页开发挑战赛**

---

## 1. 项目简介

求职难，难在**信息散、路径乱、没人陪**：岗位散在十几个招聘站，简历不知道改哪，面试前不知道练什么，租在哪、通勤多久也得自己算。

AI求职助手把这些问题拆成 18 个板块，按求职先后顺序组织成一条流程：

| 阶段 | 板块 |
|---|---|
| **前置工作** | 求职工作台 · 项目介绍 · 个人信息 · 简历工作室 · 数据空间 |
| **投递岗位** | 发现岗位 · 企业观察 · 租房生活 · 数据大屏 · 通勤地图 · 投递方案 |
| **准备面试** | 上传题库 · 面经八股 · 学习刷题 · 模拟面试 |
| **工具栏** | AI协作 · 心愿池 · 设置 |

左下角「展开求职导航」按流程进入任意板块。

**核心差异**：不是「给招聘网站加一个聊天框」，而是把 AI 放进每一步的具体决策——
职位推荐解释为什么匹配、简历审阅给出可核对证据、面试复盘指出原话问题、通勤地图算清住哪上班多久。

## 2. 功能总览

**求职与简历**：结构化个人信息（最多 3 张照片）；多版本简历、AI 排版、AI 审阅（P0–P4 / STAR / 量化 / 技能证据校验）、导出 PDF 与 Word；投递方案生成与事实校验；数据空间支持 CSV/XLSX/MD 导入与去重。

**岗位与市场**：平台岗位库（667 条 / 40 城）多维筛选；企业档案与风评；数据大屏（省份分布、薪资、学历、词云、数据浏览）；通勤地图（岗位 / 租房 / 地铁 / 酒店图层与路线耗时）；租房库（3340 条）。

**学习与面试**：面经八股（1761 题 + 我上传的题库，上传即同步）；学习刷题（收藏 / 错题 / 进度 / AI 简化答案 / AI 讲题含 3D 模型）；模拟面试（文字与语音全双工、逐轮追问、端侧 MediaPipe + 关键帧视觉分析、结构化复盘）。

**AI 协作**：四位 Agent（星野 · 知微 · 砚舟 · 栖迟）独立会话与独立音色；多 Agent 协作（计划 → 分派 → 回传 → 汇总）；工具调用（岗位检索、方案生成、报告页）；一句话生成可保存的报告页。

## 3. 技术架构

### 3.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | **Vue 3.5 + TypeScript** | 组合式 API，页面级异步分包 |
| 构建 | **esbuild** | 秒级构建，输出 `dist/` |
| 图表 / 3D | ECharts 6 / three.js | 数据大屏、讲题 3D 模型 |
| 端侧视觉 | **MediaPipe Tasks Vision** | 面试姿态与手势，本地推理 |
| 服务端 | **Node.js 22 + node:sqlite** | 单进程 HTTP(S) 服务，WAL |
| 大模型 | **DeepSeek 官方 API** | 文本 `deepseek-v4-pro`，视觉 `deepseek-flash` |
| 语音 | 阿里云 DashScope | TTS `qwen3-tts-flash` 与 ASR |
| 地图 | 高德 JS API | Key 只在服务端下发 |
| 测试 | Node test + Playwright | 接口与浏览器端到端 |

### 3.2 AI 技术方案

| 能力 | 实现 |
|---|---|
| **RAG 知识问答** | 混合检索（BM25 + embedding）→ RRF → rerank → 生成，带引用与拒答；只索引公开题库/岗位/企业/房源 |
| **Tool RAG** | 工具注册表按问题检索 Top-K 工具，避免全量工具塞入上下文 |
| **多 Agent 编排** | 计划拆解 → 角色分派 → 并行执行 → 汇总，步骤带工具数据兜底 |
| **结构化输出** | 简历审阅 / 投递方案 / 面试反馈走 JSON schema + 校验 + 重试 |
| **多模态** | 文档内嵌图片抽取、面试关键帧视觉分析、图片问答 |
| **端云协同** | MediaPipe 本地推理，只把关键结论上传 |
| **稳定性** | 单通道并发队列 + 超时 + 降级；AI 不可用时显式报错而非静默失败 |

### 3.3 结构

```
浏览器（Vue 3 SPA）
  ├─ 主壳：页头 / 求职导航 / 四个 Agent / 路由
  ├─ 18 个页面模块（按需分包）
  └─ 学习页 iframe（独立小应用，登录后常驻）
        │ HTTPS + Cookie 会话 + CSRF
        ▼
Node 服务端
  ├─ 认证 / 会话 / CSRF / 限流
  ├─ 业务：resume · application-plan · datasets · study · interview · geo · dashboard
  ├─ ai-gateway：对话 / 结构化 / 视觉 / 语音
  └─ RAG · Tool RAG · Agent 编排
        │
        ▼
SQLite + 平台数据（data/*.json）+ 私有密钥（private/，不进仓库）
```

## 4. 目录结构

```
.
├── app-redesign/          # 当前版本（提交与演示以此为准）
│   ├── src/               # 前端：18 个页面模块、导航、Agent、样式
│   ├── server/            # 服务端：路由、AI 网关、RAG、业务模块
│   ├── data/              # 平台数据（岗位 / 租房 / 题库 / 企业）
│   ├── tests/             # 接口与浏览器测试
│   ├── scripts/           # 工具脚本（含模拟数据生成）
│   └── build.mjs
├── app/                   # 早期版本（保留开发历史，不建议据此部署）
├── docs/                  # 技术文档（RAG、Tool RAG、测试报告、第三方声明）
└── README.md
```

## 5. 快速开始

**环境**：Node.js 22.13+（`node:sqlite`）、Python 3（文档解析）、Chromium/Chrome（导出 PDF，可用 `CHROME_PATH` 指定）、可选 openssl（自签证书）。Linux 上 OCR 另需 `bwrap`、`prlimit`、`pdfinfo`、`pdftotext`、`pdftoppm`。

```bash
cd app-redesign
npm ci                 # 或 pnpm install
node build.mjs         # 构建前端到 dist/

PORT=5173 HOST=0.0.0.0 node server/index.mjs                        # 仅 HTTP
HTTPS_PORT=5175 HTTP_PORT=5176 HOST=0.0.0.0 node server/index.mjs   # HTTPS（摄像头/麦克风需要）
```

打开 `http://127.0.0.1:5173/`，首次登录会引导新手教程。

## 6. 配置说明

### 6.1 环境变量（完整见 `app-redesign/.env.example`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 5173 | HTTP 端口（未启用 HTTPS 时） |
| `HTTPS_PORT` / `HTTP_PORT` | — | 同时监听 HTTPS 与 HTTP 兜底 |
| `HOST` | 127.0.0.1 | 监听地址 |
| `CAREER_DATA_DIR` | `./private` | 私有数据目录（数据库、证书、密钥） |
| `CAREER_STATIC_DIR` | `./dist` | 前端构建产物目录 |
| `CAREER_SECURE_COOKIE` | false | 仅在 HTTPS 反代后开启 |
| `CAREER_MAX_LOAD` | 1.8 | 负载超限时拒绝 OCR/视觉任务 |
| `CHROME_PATH` | — | Chromium 路径（PDF 导出） |
| `AMAP_KEY` | — | 高德 REST Key（也可写入 `private/geo-config.json`） |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | 初始化管理员 |
| `INTERVIEW_MAX_ACTIVE` | — | 面试并发上限 |

### 6.2 私有文件（**不要提交**）

| 文件 | 作用 | 模板 |
|---|---|---|
| `app-redesign/private/ai-config.json` | 大模型 / 语音 / 生图密钥 | `ai-config.example.json` |
| `app-redesign/private/geo-config.json` | 高德 Key | `geo-config.example.json` |
| `app-redesign/private/https/` | HTTPS 证书 | 自行生成 |

> 仓库中**不含任何真实密钥**，`private/` 已被 `.gitignore` 排除。

## 7. 团队信息

| 成员 | 角色 | 主要负责 |
|---|---|---|
| [@ray1296](https://github.com/ray1296) | 项目负责人 / 架构 | 产品方向、前端架构与导航、简历与投递链路、仓库与发布 |
| [@Hxixi111](https://github.com/Hxixi111) | 视觉与交互 | 设计规范、页面视觉、AI 伙伴与动效、地图交互 |
| [@YIN-YU-CJENG](https://github.com/YIN-YU-CJENG) | 数据与 AI | 数据空间与数据大屏、模拟数据、模型接入与效果验证 |

> 为保护隐私，公开仓库只展示 GitHub 账号与分工；真实姓名与院校以大赛报名信息为准。
> 三名成员共用 AI 编程助手协作开发，按「谁提出需求/提示词」归属提交，AI 生成内容均经评审与测试后合入。

## 8. 开发与提交约定

- 提交信息格式：`类型(范围): 说明`，如 `feat(ai): ...`、`fix(map): ...`
- 前端改动执行 `node build.mjs` 后刷新；服务端改动需重启
- 测试：`cd app-redesign && node tests/<name>.mjs`；关键回归 `nav-map`、`uploaded-bank`、`pets-and-trail`、`ai-provider-live`

## 9. 数据与隐私说明

- **模拟数据**：为演示数据密度，部分岗位/房源为合成数据，记录带 `provenance.synthetic = true`、来源标注「模拟数据（演示用）」，由 `app-redesign/scripts/gen-mock-data.mjs` 生成，可一键清理。
- **平台数据**：题库/岗位/企业/房源来自公开渠道整理，保留来源字段供核对。
- **不收集**：原始音视频不落盘；简历与个人资料不进入 RAG 索引；不向模型发送与任务无关的个人信息。
- **密钥**：只存在于服务端 `private/`，前端不接触。

## 10. 第三方与原创声明

- 依赖清单见 `app-redesign/package.json`，许可与来源见 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)
- 地图由高德提供，模型能力由 DeepSeek 与阿里云 DashScope 提供
- 本项目代码由团队原创，AI 辅助生成部分均经成员评审与测试

## 11. 免责声明

本项目为竞赛作品，岗位、企业、房源、题库等数据用于演示与研究，**不构成任何招聘、投资或租赁建议**。请勿在演示环境输入真实身份证号、银行卡号或常用密码。
