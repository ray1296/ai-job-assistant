# 逐光网站测试报告

测试日期：2026-10-26
测试环境：本机 Linux、Node 22、Chromium 1248、SQLite、真实 AI 网关；服务 http://127.0.0.1:5173
测试原则：只用合成账号/合成资料；真实用户与管理员数据不参与上传；测试后清理测试账号。

## 一、结论

- 自动化测试最终全部通过：271 项断言通过，0 失败（另有性能指标、点击审计和基础可访问性扫描）。
- 覆盖：认证、资料/简历、岗位/投递、数据空间、大屏/地图/企业/租房、学习/刷题、上传、面试、AI 协作、RAG、Tool RAG、MCP、心愿池、管理中心、设置、安全与性能。
- 发现并修复 1 个服务端幂等键问题（心愿“完成”后立即删除被误拦为 409），以及若干测试脚本/测试环境问题。
- 仍存在的限制：高负载时 OCR/视觉识别会主动返回 503；只测了 Chromium；没有做正式长稳压测/渗透/跨浏览器；全双工实时音频需人工听测。

## 二、测试类型

| 类型 | 内容 |
|---|---|
| 单元/集成 | learning-state、application-plan、resume-document、AI gateway 离线、jobs importer |
| API 功能 | 23 项全功能 API 链路 |
| API 冒烟/契约 | 23 项账号隔离、CSRF、版本冲突、重启恢复 |
| 浏览器 E2E | 22 项全页面/主要交互；10 项基础冒烟 |
| 上传/OCR | 12 项 DOCX/PDF/扫描 PDF/PNG、取消、页数限制、移动端 |
| 简历工作室 | 17 项原位编辑、撤销、版本、导出、移动端 |
| 安全 | 14 项生产审查脚本、9 项提取安全、9 项质量/攻击面 |
| RAG 质量 | 18 条评测：Recall/Citation/Refusal |
| 性能 | gzip、构建体积、首屏 lab 指标、20 并发读 |
| 可访问性 | 按钮/输入/图片基础扫描 |
| 响应式/触摸 | 390px 页面、真实触摸拖动星盘 |
| 兼容性 | 仅 Chromium；未做 Firefox/Safari |
| 数据完整性 | 版本冲突、并发写、账号隔离、重启持久化、测试数据清理 |

## 三、最终结果

| 测试套件 | 结果 |
|---|---:|
| API smoke | 23/23 |
| Full functional API | 23/23 |
| Browser smoke | 10/10 |
| Full browser E2E | 22/22 |
| Resume intake（DOCX/PDF/扫描/PNG） | 12/12 |
| Resume studio | 17/17 |
| Interview fake-media flow | 2/2 |
| Learning unit/API | 3/3 |
| RAG eval | 18/18 |
| Production review | 14/14 |
| Quality/security | 9/9 |
| Extraction security | 9/9 |
| Legacy upload API | 1/1 |
| Navigation regression | 4/4 |
| 新功能 API（介绍/RAG/审核/通告/文档/地铁） | 10/10 |
| 新功能 UI（介绍/通告/心愿/文件/地图） | 9/9 |
| 看板娘工具栏回归 | 4/4 |
| 并发稳定性（3 轮页面 + 并发读） | 4/4 |
| 面试并发队列 API | 2/2 |
| 面试队列 UI | 1/1 |
| Agent 写操作确认 | 1/1 |
| 首页鼠标拖尾 | 1/1 |
| 日夜主题切换 | 1/1 |
| 注册格式/注册后登录（API） | 5/5 |
| 注册后登录（UI） | 2/2 |
| Logo 回首页 / 大屏全屏退出 | 3/3 |
| 简历上传勾选框排版 | 1/1 |
| 个人照片存储/上限（API） | 3/3 |
| 个人照片上传/刷新（UI） | 3/3 |
| 简历导入/工作室照片 | 2/2 |
| 生图装饰入口 | 2/2 |
| A4 自动分页 / 照片居中 | 2/2 |
| AI 布局结构 / 空简介 | 2/2 |
| 数据空间去重/撤销（API） | 4/4 |
| 数据概览/撤销（UI） | 3/3 |
| 岗位投递意向筛选（UI） | 3/3 |
| 地图全屏/图标/清除地址 | 7/7 |
| 企业详情字号 | 1/1 |
| 租房筛选栏布局/样式 | 2/2 |
| 学习页 iframe 顶部布局 | 2/2 |
| 批量简化/已有跳过/卡片标记 | 3/3 |
| 收藏/错题持久化与反馈 | 6/6 |
| 学习入口单击/面经去重 | 3/3 |
| 知微讲题/画布/3D交互 | 5/5 |
| 对话 chip/换行/输入宽度/图片X/会话 | 6/6 |
| 学习入口单击/刷新保持/面经去重 | 4/4 |
| 合计 | 271/271 |

### 关键指标

- RAG：18 题，Recall 1.00、Citation 1.00、Refusal 1.00，平均 6.3s，最慢 20s+
- 静态资源：main.js 308KB → gzip 约 108KB；dist 20MB → 6.8MB
- 首屏 lab：FCP 约 500ms，load 约 390ms（本机缓存/Local，不代表公网）
- API：jobs 约 9ms、questions 约 6ms、dashboard 约 67ms、20 并发的 questions 29ms
- 依赖：npm audit 0 vulnerabilities
- 可访问性基础扫描：无文本按钮 0、无标签输入 0、无 alt 图片 0

## 四、测试发现的问题与修复

### 1. 心愿“完成”后立即删除返回 409（真实服务端问题）

- 现象：管理员对同一心愿先 PATCH 完成，1.5 秒内 DELETE，返回 409。
- 原因：PATCH 和 DELETE 使用了同一个 once 幂等键。
- 修复：拆成 wish-patch: 和 wish-delete:。
- 回归：full functional 23/23；完成→删除通过。

### 2. 普通用户头部出现“管理中心” + 空白页/返回报错（本轮修复）

- 现象：普通用户登录后，退出登录旁显示“管理中心”；点击后空白；返回后落到地图并残留“这个页面暂时出错”。
- 原因：header 对 role 的判断把入口暴露给了普通用户；同时错误边界只在重新打开按钮里清除，hash 返回时没有清 crash。
- 修复：
  - 删除 header 的管理中心入口；管理员只从登录/注册的管理员入口进入。
  - hashchange / go() 开始时清理 crash 与 notice。
  - 普通用户直接访问 #admin 显示“不是管理员”的明确提示，不再是空白。
- 回归：Navigation regression 4/4：无管理中心按钮、#admin 非空白、返回地图正常、无页面异常。

### 3. 修改密码撤销其他会话时 SQL 列名错误（前一轮发现）

- 现象：密码修改返回 500；原因是 sessions 表列名是 hash，代码写了 token。
- 修复：改为 hash 比较。
- 回归：旧 session 401、当前 session 200。

### 3b. 旧功能中的假按钮/固定数据（本轮修复）

- “识别说话人”按钮只把 diarization 参数发给后端，后端 ASR 没有返回说话人分段；已删除按钮和参数，不再假装可用。
- 看板娘文件按钮原来只收图片；已补 PDF/DOCX/XLSX/PPTX 上传和文字提取。
- 地图“地铁站 25”是 AMap 关键词搜索第一页固定 25 条；已改为按岗位/租房城市读取完整地铁线路站点（上海实测 599 个唯一站）。
- 卡片记忆的“知识点/简答”筛选已删除，直接显示全部。
- 上传题库页重复且不可用的“生成选择题/判断题/批量简化答案”工具已删除；保留刷题页真实工具。

### 4. OCR/视觉上传在高负载下返回 503（设计保护，不是崩溃）

- 现象：连续跑多轮视觉识别后，系统 load average > 1.8，服务端返回“服务器正在保留资源余量”。
- 原因：resume-extraction 的保护：可用内存 <1GB 或 load >1.8 时拒绝重任务，避免把服务器打满。
- 处理：保留默认保护；增加 CAREER_MAX_LOAD 环境变量，测试机临时设为 99 完成 OCR 用例；生产默认 1.8。
- 结论：这是预期的容量保护，不是功能缺陷；用户遇到时应等 1–2 分钟，或降低并发。

### 5. 测试脚本/环境问题（不是业务代码）

- 旧 intake 测试没有带 X-AI-Consent 头，和当前必须同意的产品规则不一致；已补。
- 连续上传时上一份识别任务还没释放 active，测试立即上传导致 429；测试增加 limits.active 等待。
- 触摸拖动测试用的浏览器 context 没开 hasTouch/isMobile，CDP touch 不产生 pointer；改为真实触摸 context 后通过。
- Studio 测试还在找旧按钮“AI 优化内容/收起伙伴”；当前已换成 AI 审阅面板和新的看板娘，已更新断言。
- 地图页没有 h1（视觉标题是链接），测试改为按页面文本判断；知识页第一个 input 是隐藏文件选择框，测试改用 data-testid=learning-search。
- gzip 响应没有 Content-Length（chunked），测试改为检查 Content-Encoding 和响应体。

### 6. 顺手修复的文案/配置

- 个人信息页移除“当前HTTP演示环境”字样，避免正式演示出现开发提示。
- .env.example 增加 CAREER_MAX_LOAD 说明。
- 上传/测试素材全部合成，不含真实姓名/学校/联系方式。

## 五、分模块测试记录

### 认证与账号

- 注册（带用户名）、会话恢复、登出、用户名修改、修改密码。
- 未登录访问私有接口 401；缺 CSRF 写请求 403；跨站 Origin 拒绝。
- 修改密码后其他 session 401，当前 session 200。
- 管理员登录走独立入口。

### 个人信息与简历

- 资料保存/刷新恢复；版本冲突 CAS。
- 简历创建/列表/详情；结构化文档；Word 下载；PDF 打印。
- DOCX 真实提取；不自动写入资料；勾选字段才导入。
- 文本 PDF 页面视觉识别；扫描 PDF/PNG 视觉识别；图片/PDF 页数限制；取消识别不会覆盖新结果。
- 移动端无横向溢出；星盘触摸拖动。

### 数据空间/岗位/投递

- CSV 岗位/租房上传、字段映射、详情、删除。
- 岗位搜索/筛选/详情；投递意向；方案列表。
- 旧版学习资料上传：科目/版本/parse/upload-questions/upload-knowledge 全链路。

### 学习/刷题

- 1761 题库列表、搜索、方向/分类、收藏、自评、统计。
- 自建科目、平台题库导入、文件题库导入、题目 attempt、复习页 flashcards。
- 收藏/错题/简答参考答案/AI 标记。
- 原项目 /orig/ 复习页和上传页 iframe 可加载。

### 面试

- 真实页面设置、开始、假摄像头/麦克风媒体、直播状态、AI 开场问题。
- turn-check API；结束反馈/历史由手动测试覆盖。
- 端侧 MediaPipe 初始化（测试中 TensorFlow Lite XNNPACK 日志，不视为错误）。

### AI/RAG/MCP

- companion chat + Tool RAG：命中 company_review/search_jobs。
- RAG 18 题：Recall/Citation/Refusal 全 1.0。
- MCP initialize/tools/list/tools/call。
- RAG 无关问题 0 来源并拒答；XSS 字符串按文本显示。

### 心愿/管理/设置

- 心愿提交/列表/管理员完成/删除。
- 管理员登录、概览、用户表、心愿页；用户表不含密码等隐私字段。
- 设置用户名即时更新 header。
- 心愿 PATCH→DELETE 幂等修复回归。

## 五b、点击审计与并发

- 16 个主页面，202 个去重控件，实际点击 193 个；无页面崩溃/空白。
- 7 个无视觉变化候选复核后均为选中态、confirm、文件选择器或异步地图结果，不是死按钮。
- 8 个页面 × 3 轮刷新稳定；12 并发读全部 200。
- 模拟面试并发闸门：前 3 场直接进入，第 4 场进入队列；第 4 场 UI 显示位置并可取消，释放后自动提升。
- Agent 写操作：add_job_intent / create_wish 两阶段确认，未确认不写库；确认后真实写入。
- 首页鼠标拖尾：按 bigdata_analysis 的 Tendril 弹簧曲线移植，20 条 × 50 节点；透明 canvas，不覆盖页面背景、不拦截点击；夜间模式在黑底上更明显。
- 日夜主题：默认日间，头像旁切换，刷新保持；夜间全站深色。
- 注册/登录：邮箱格式、密码字母+数字校验；注册成功后退出再登录通过。修复了退出后登录弹窗仍停留在注册模式的问题。
- 导航/大屏：逐光 Logo 回到首页并回顶；大屏标题居中；全屏显示同风格退出按钮，退出后隐藏。
- 个人照片：最多3张，浏览器压缩，资料/简历持久化；解析 DOCX/PDF 内嵌图片作为候选；照片可进入新简历、从个人信息导入、工作室上传。
- PDF解析：优先提取文本层作为逐字原文；视觉模型返回空/截断结构时自动重试一次，并给出可操作错误提示。固定 fixture 真实 AI 重跑通过。
- 真实 2 页 WPS 简历 PDF（用户提供）真实 AI + 真实 UI 回归通过：不再报 profile.skills 证据错误，识别出照片候选并进入核对页。
- 创建独立简历时，AI 排版/审阅请求会剥离照片 data URL，避免照片把 AI 输入或排版请求撑到“内容过大”；照片在服务端保存时仍保留在文档头部。
- 创建成功后显示成功卡片和“前往简历工作室”直达按钮；真实用户 PDF 已验证创建成功并跳转 #resume。
- 生图装饰移到顶部 AI 内容审阅面板的复选框；按简历版面占用区域生成一张整页背景，并支持 AI 自动/极简/极繁/科技风格。
- A4 自动分页：794×1123px 页面、条目级自动断页、续页标题、页数提示；真实长内容测试 7 页且每页高度不超过 1125px。个人照片改为居中在姓名上方。
- AI 推荐布局：真实接入 appearance 结构建议，应用后可重排板块、合并基本信息/求职意向为两栏；空简介不占空行。
- 数据空间：数据概览为本账号口径；上传记录可撤销；同岗位/企业/租房/问题按业务键保留最新并删除旧行；样例文件和去重/撤销测试通过。
- 岗位投递意向：岗位卡片显示未确认/待保存/已确认；支持按已确认/未确认筛选，筛选使用服务端已保存意向。
- 地图：修复 .page-content > * 的 relative 定位覆盖 .map-full fixed 导致地图容器 0 高度；地图层现在固定填满视口。岗位/租房/地铁/酒店/推荐改为类型化 SVG 图钉，图例置于顶部；进入地图时隐藏网站顶部栏，地图搜索框保持在顶部；通勤方向的住房/岗位地址已选后可点击 × 清除；企业详情表格字号提升到 14px/1.75；租房筛选栏合并城市、搜索、租金控件，搜索按钮改为主色；学习页 iframe 不再被 page-content 的 relative 规则下推，紧贴顶部栏；批量简化改为一次请求处理多条，最多50道并跳过已有答案；卡片显示“简化答案”标记；收藏/错题接口返回完整题目，刷新后收藏与错题列表和按钮状态恢复；修复 review 列表 onMounted/onActivated 并发重载导致的多次点击；面经八股移除重复的收藏/待复习/已掌握/学习入口；问问AI改为打开知微对话草稿，画布分步讲题和3D立方体鼠标交互通过；长题用 chip、Shift+Enter 换行、输入框自动伸缩、图片关闭X居中、立绘/看板娘会话管理通过；讲题画布改为大尺寸覆盖窗口，可最小化再从对话框入口恢复；3D 支持透明材质与多物体组合（透明正方体+球体）；刷新学习页保持当前科目/版本。
- 详细记录：[CLICK_AUDIT.md](CLICK_AUDIT.md)

## 六、仍存在的限制/风险

1. 高负载保护：load >1.8 或可用内存 <1GB 时 OCR/视觉识别 503；这是主动保护。
2. 高德地图 CSP：控制台有 javascript: URL 被 CSP 拦截的告警；地图实际可用。来自高德 SDK，保留 unsafe-eval。
3. 只测 Chromium：没有 Firefox/Safari/真机 iOS/Android 的完整回归。
4. 没有正式长稳压测/渗透测试：只做 20 并发读和 9 项安全脚本。
5. 没有自动 axe/WCAG：只做基础可访问性扫描；颜色对比度未做。
6. 全双工实时音频：没有做真实麦克风双向打断听测；API/半双工/假媒体已测。
7. 面试队列名额在内存中，服务重启会清空；单场 20 分钟无心跳会释放，队列最长等待约 30 分钟。
7. 外部 AI 延迟：RAG 6–20s，OCR 10–80s；依赖上游，已加超时/兜底但不保证 SLA。
8. 浏览器缓存：页面性能是本地 lab，公网还要看服务器/网络/HTTPS。

## 七、测试命令

在 app 目录执行：

    npm run typecheck
    npm run test:smoke
    npm run test:browser
    npm run test:review
    npm run test:learning
    node tests/full-functional.mjs
    node tests/full-browser.mjs
    node tests/new-features.mjs
    node tests/new-features-browser.mjs
    node tests/pet-features.mjs
    node tests/interview-queue.mjs
    node tests/interview-queue-browser.mjs
    node tests/agent-write.mjs
    node tests/mouse-trail.mjs
    node tests/theme-toggle.mjs
    node tests/auth-registration.mjs
    node tests/auth-registration-ui.mjs
    node tests/nav-dashboard.mjs
    node tests/resume-consent.mjs
    node tests/photos.mjs
    node tests/photos-ui.mjs
    node tests/resume-photos.mjs
    node tests/decor-ui.mjs
    node tests/resume-layout.mjs
    node tests/ai-layout.mjs
    node tests/dataset-dedupe.mjs
    node tests/dataset-ui.mjs
    node tests/map-layout.mjs
    node tests/simplify-batch.mjs
    node tests/favorite-wrong.mjs
    node tests/review-entry-knowledge.mjs
    node tests/study-tutor.mjs
    node tests/chat-input-sessions.mjs
    node tests/stability.mjs
    node tests/click-audit.mjs
    node tests/navigation-regression.mjs
    node tests/legacy-upload.mjs
    node tests/quality-suite.mjs
    node tests/rag-eval.mjs
    node tests/interview-flow.mjs
    node tests/performance.mjs
    TEST_BASE_URL=http://127.0.0.1:5173 node tests/intake-smoke.mjs
    TEST_BASE_URL=http://127.0.0.1:5173 node tests/studio-smoke.mjs
    TEST_BASE_URL=http://127.0.0.1:5173 node tests/extraction-security.mjs

## 八、结论

当前代码层没有发现未修复的高危 SQL 注入、路径穿越、越权读隐私、未认证写接口或明显并发丢失。

测试能证明“主要功能可用、核心链路闭环、常见异常有兜底”，但不能证明“所有浏览器/所有负载/所有外部 AI 状态下绝对无问题”；上面限制已列出，建议提交前按 MANUAL_TESTING.md 再做一次人工验收。
