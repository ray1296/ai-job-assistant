# 逐光 · AI求职助手

## 当前状态
- 已保存里程碑：`0837c28 · 原型框架确定`。
- 已实现待用户验收：账号/会话、资料保存，以及恢复原型布局的 **单文档简历双击原位编辑**（板块增删/移动、撤销重做、模板/字号/色、多版本复制保存、Word导出/PDF打印另存）；顶部旅程地图/密码显隐已恢复。
- 本批新增：**星盘鼠标/触屏拖动与位置记忆**；**PDF/DOCX/PNG/JPEG本地识别→原文核对→显式选择资料字段或创建独立简历版本**。识别不是AI理解，不能保证OCR准确率或原排版还原。
- AI理解/简历优化、生图、真实Live2D与语音、视频面试、数据与岗位业务等 **尚未接通**，不能把计划当已完成。PDF目前走浏览器打印另存，不冒称服务器直出。

## 查看
- 当前批次3： http://127.0.0.1:5173/
- 保留旧外观： http://127.0.0.1:5173/preview/index.html
- 注册自己的测试账号。当前是HTTP开发验收环境，请勿输入真实敏感资料或常用密码；未实现邮件验证/密码找回。

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
TEST_BASE_URL=http://127.0.0.1:5173 npm run test:studio
TEST_BASE_URL=http://127.0.0.1:5173 npm run test:intake
TEST_BASE_URL=http://127.0.0.1:5173 npm run test:extraction
node tests/worker-isolation.mjs
```
- 23项API/安全/持久化/小规模并发正确性冒烟：两账号越权读写删除拒绝、CSRF、版本冲突、进程重启后数据/会话保留等。测试用临时目录，结束自动清理。
- 基础10项 + 文档工作室17项真实Chromium浏览器冒烟：注册/资料与多段教育/意向chip/刷新还原/简历版本切换/安全文本渲染/退出/移动端/外观页。浏览器脚本目前使用当前公网地址与本机Chromium路径。
- 本批新增12项上传/确认/拖动真实浏览器检查，10项提取安全检查，2项原生worker隔离/退出清理探针；检查仅使用合成测试简历。
- 尚无全量自动化、并发压测、完整安全审计；前期用户手测为主。用户已延期跨账号隔离验收，必须全功能完成后重新回归，不能以本轮自检替代。

## 计划与约束
- [完整功能计划](docs/FEATURE_PLAN.md)
- [分批验收与结果](docs/DELIVERY_BATCHES.md)

每批完成即停止等待用户检查。比赛正式视频、PDF、商业材料待全部功能审核通过后制作。保留真实Git贡献，不保证奖项。

外观原型参考用户已有项目；legacy仅用于布局预览，正式产品需原创实现及复用许可核对。参考项目原件、国奖资料、附件原件和密钥均不提交。
