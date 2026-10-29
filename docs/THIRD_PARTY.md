# 第三方组件与素材说明

> 竞赛要求作品原创、不得直接包装开源项目。本文件用于如实披露第三方依赖与素材来源，提交前请团队核对授权。

## 运行依赖

| 组件 | 用途 | 许可证 |
|---|---|---|
| Vue 3 / Vue Router / Pinia | 前端框架与状态 | MIT |
| Vant | 移动端组件 | MIT |
| ECharts | 数据可视化 | Apache-2.0 |
| Three.js | 3D / 图形 | MIT |
| docx | Word 导出 | MIT |
| MediaPipe Tasks Vision | 端侧人脸/姿态 | Apache-2.0 |
| 高德地图 JS SDK | 地图/地理编码 | 高德开放平台服务条款 |
| 阿里云百炼 / 通义千问 | LLM、向量、重排、TTS/ASR | 阿里云服务条款 |
| uuapi / DeepSeek 兼容接口 | 主对话模型 | 以实际服务条款为准 |

## Live2D 素材

- 路径：app/public/live2d/live2d-widget-models/
- 模型包 package.json 标注 **GPL-2.0**（miku、chitose、wanko、z16、izumi、haruto、shizuku、koharu 等）。
- 这意味着：如果公开仓库/分发包含这些模型，需遵守 GPL-2.0 的相应义务；如未来闭源商业化，应替换为有明确商业授权的模型或购买授权。
- 模型仅用于看板娘展示，不参与核心业务逻辑。

## 借鉴的界面/交互参考

| 项目/素材 | 用途 | 使用方式与改动 | 来源 |
|---|---|---|---|
| Live2D 看板娘模型 | 看板娘展示 | 仅加载模型，不参与业务；模型包标注 GPL-2.0 | https://github.com/xiazeyu/live2d-widget-models |
| Tendril 鼠标拖尾（Lights & Motion: Ultraviolet） | 首页鼠标跟随特效 | 原作者 Nik Rowell；参考 20 条 × 50 节点弹簧拖尾思路，重写为 Vue 组件；透明 canvas、不拦截点击、支持 reduced-motion | http://labs.nikrowell.com/lightsandmotion/ultraviolet/；收集仓库 https://gitee.com/susuhhhhhh/css_demos |
| DSH 桌宠气泡 | 四 agent 工作气泡/对话入口 | 参考气泡队列、工作气泡与持久汇报的交互形态，按本项目组件与状态重写；未引入其业务页面 | https://github.com/yanzwzz/dsh-whale-girl-pet |

以上为当前代码中可核对的来源；如果后续替换实现或素材，请同步更新本表与技术文档附录 A。

## 题库与公开数据

- 面经/八股来自公开 Gitee/GitHub/牛客/CodeFather 等页面，catalog 中保留 source 与 sourceUrl。
- 岗位、企业、房源为公开 catalog 的整理数据，保留来源字段。
- 题目答案中标注了 AI 生成（详细版）或 原文有答案，不把 AI 生成内容冒充原文。
- 这些数据用于学习检索与展示，不声明为团队原创；提交前请确认目标赛事的引用/转载要求。

## 原项目与参考

- 本项目在团队原有 Web 项目基础上重构；核心页面、服务端、RAG、Tool RAG、面试、管理端为后续开发。
- 旧原型仅用于布局参考；未直接复制往届国奖项目代码。
- 若评审需要，可提供 Git 历史与文件级来源说明。

## 字体/图标

- Vant 图标字体来自 at.alicdn.com；CSP 只放行该字体域。
- 其他图标以 CSS/emoji/内联 SVG 为主。

## 提交前动作

1. 确认 Live2D 模型是否允许随公开仓库分发；不允许则替换/移除。
2. 检查题库/岗位/房源数据的转载许可与来源链接是否完整。
3. README 增加“原创与第三方”链接到本文件。
4. 不提交 app/private 下的 API Key、数据库、管理员密码。
