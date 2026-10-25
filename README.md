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
- 当前本地验收是 HTTP；正式部署必须 HTTPS + `CAREER_SECURE_COOKIE=true`，并配置私有的 `app/private/ai-config.json`。
- 原始音视频不落盘；RAG 不索引个人资料、简历、聊天记录或用户上传文件。

## 查看

- 本地验收：`http://127.0.0.1:5173/`
- 岗位 / 投递方案：`#jobs` / `#plan`
- 学习：`#knowledge` / `#practice`
- RAG / Tool RAG 说明：[RAG.md](docs/RAG.md) / [TOOL_RAG.md](docs/TOOL_RAG.md)
- 生产审查记录：[REVIEW_2026-10-26.md](docs/REVIEW_2026-10-26.md)
- 竞赛要求核对：[COMPETITION_REQUIREMENTS.md](docs/COMPETITION_REQUIREMENTS.md)
- 国奖对比/扣分加分：[COMPETITION_GAP_ANALYSIS.md](docs/COMPETITION_GAP_ANALYSIS.md)
- 产品价值：[PRODUCT_VALUE.md](docs/PRODUCT_VALUE.md)
- 第三方与原创说明：[THIRD_PARTY.md](docs/THIRD_PARTY.md)
- 保留旧外观：`/preview/index.html`
- 注册自己的测试账号。当前本地 HTTP 环境请勿输入真实敏感资料或常用密码；未实现邮件验证/密码找回。

## 本地运行
```sh
cd prototype
npm ci
npm run build
cd ../app
npm ci
npm run setup:ocr # Ubuntu: 私有展开OCR工具，无sudo/系统安装/服务重启
npm run typecheck
npm run build
HOST=0.0.0.0 PORT=5173 npm start
```
Vue3+TypeScript组件，esbuild路由模块分包；Node22原生SQLite（该Node版本仍提示实验性），小规模验收持久层使用WAL与索引。不是已压测的高并发/高可用生产集群，后续迁移/容量/备份与HTTPS仍待专项。

数据默认存`app/private/`，不被静态服务器提供，不进入Git。密码scrypt散列，服务端会话、CSRF/Origin校验、账号所有权检查、乐观版本冲突校验。生产需HTTPS后开启Secure Cookie、配置可信代理与限流、备份与恢复验证。

## AI审阅配置与保护
- 服务端支持OpenAI兼容的`/chat/completions`端点，配置参考 `app/ai-config.example.json`（复制到 `app/private/ai-config.json`，权限 600，真实密钥不提交）；用户已提供项目凭据，具体可用性以私有运行时配置及请求结果为准；未配置会明确提示，不能把离线测试或模型列表响应当真实AI效果。
- 简历审阅限制为1个上游请求、队列最多2个、每账号每分钟3次、单请求45秒；投递话术另有独立1个上游槽，二者合计可达2，并非全应用全局1个；输入约50KB；返回必须是结构化前后建议，服务端校验后才展示。未来视觉模型另设更严的图片/费用预算。

## 简历识别运行条件与保护
- 需要Linux、Python3、prlimit、nice、bwrap（namespace可用）、pdfinfo、pdftotext、pdftoppm；OCR工具和中文/英文模型通过setup:ocr私有展开到app/.tools/ocr，缺能力会报错，不回退裸进程。二进制/模型不提交Git。
- 原件仅临时私有保存，完成/失败/取消后删除；识别结果仅内存、15分钟有效（最迟约16分钟清理）、重启即丢；只有显式确认资料/版本持久保存。
- 默认全站1个任务、≤5MiB、PDF≤4页、图片≤1200万像素且长边≤6000；时间/进程资源有上限，繁忙拒绝重任务而不排无限队列。详见[资源预算](docs/CAPACITY_BUDGET.md)。

## 验证
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

- **ray1296（GitHub: ray1296）**：项目负责人，架构、AI、全栈主要开发。
- **Hxixi111**：团队成员，协作方向：测试与前端体验。
- **YIN-YU-CJENG**：团队成员，协作方向：文档与演示材料。
- 具体贡献以 GitHub 提交/PR 记录为准；不把未发生的贡献写成已发生。
- 公开仓库不要写手机号、邮箱、身份证等个人敏感信息；评审如需登录，用单独测试账号。

## 计划与约束
- [完整功能计划](docs/FEATURE_PLAN.md)
- [分批验收与结果](docs/DELIVERY_BATCHES.md)

每批完成即停止等待用户检查。比赛正式视频、PDF、商业材料待全部功能审核通过后制作。保留真实Git贡献，不保证奖项。

外观原型参考用户已有项目；legacy仅用于布局预览，正式产品需原创实现及复用许可核对。参考项目原件、国奖资料、附件原件和密钥均不提交。
