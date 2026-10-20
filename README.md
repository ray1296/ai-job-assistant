# 逐光 · AI求职助手

## 当前状态
- 已保存里程碑：`0837c28 · 原型框架确定`。
- 已实现待用户验收：第一批 **真实账号/会话与隔离、个人信息持久保存、简历版本编辑保存**。
- AI、简历OCR/优化/Word-PDF导出、真实Live2D与语音、视频面试、数据与岗位业务等 **尚未接通**，不能把计划当已完成。

## 查看
- 当前第一批： http://127.0.0.1:5173/
- 保留旧外观： http://127.0.0.1:5173/preview/index.html
- 注册自己的测试账号。当前是HTTP开发验收环境，请勿输入真实敏感资料或常用密码；未实现邮件验证/密码找回。

## 本地运行
```sh
cd prototype
npm ci
npm run build
cd ../app
npm ci
npm run typecheck
npm run build
HOST=0.0.0.0 PORT=5173 npm start
```
Vue3+TypeScript组件，esbuild路由模块分包；Node22原生SQLite（该Node版本仍提示实验性），小规模验收持久层使用WAL与索引。不是已压测的高并发/高可用生产集群，后续迁移/容量/备份与HTTPS仍待专项。

数据默认存`app/private/`，不被静态服务器提供，不进入Git。密码scrypt散列，服务端会话、CSRF/Origin校验、账号所有权检查、乐观版本冲突校验。生产需HTTPS后开启Secure Cookie、配置可信代理与限流、备份与恢复验证。

## 验证
```sh
cd app
npm run typecheck
npm run test:smoke
npm run test:browser
```
- 18项API/安全/持久化冒烟：两账号越权读写删除拒绝、CSRF、版本冲突、进程重启后数据/会话保留等。测试用临时目录，结束自动清理。
- 11项真实Chromium浏览器冒烟：注册/资料与多段教育/意向chip/刷新还原/简历版本切换/安全文本渲染/退出/移动端/外观页。浏览器脚本目前使用当前公网地址与本机Chromium路径。
- 尚无全量自动化、并发压测、完整安全审计；前期用户手测为主。

## 计划与约束
- [完整功能计划](docs/FEATURE_PLAN.md)
- [分批验收与结果](docs/DELIVERY_BATCHES.md)

每批完成即停止等待用户检查。比赛正式视频、PDF、商业材料待全部功能审核通过后制作。保留真实Git贡献，不保证奖项。

外观原型参考用户已有项目；legacy仅用于布局预览，正式产品需原创实现及复用许可核对。参考项目原件、国奖资料、附件原件和密钥均不提交。
