# 模型微调：工具路由（SFT）方案

## 结论先行

把「完整工具表」直接塞进模型权重，不是 2026 年做 Agent 的主流方案，原因：

1. 工具 schema 会变，微调一次就过期；
2. 模型会「记住」旧工具名，运行时反而更容易幻觉调用不存在的工具；
3. 工具参数校验、权限、幂等必须在服务端做，不能交给模型权重；
4. 原生 function calling / 工具检索 / prompt caching 更便宜、更可控。

更合适的做法是：**微调一个小型工具路由器**，只负责「用户这句话该选哪个工具 + 抽参数」，真正的工具 schema、权限、参数校验仍由服务端提供。这样既减少每次塞完整工具表的 token，又保留可变更能力。

## 当前项目工具

- search_jobs(keyword?, city?, limit?)
- company_review(name)
- find_housing(city?, maxRent?)
- my_progress()

## 数据集

- 文件：`app/data/finetune/tool-router.jsonl`
- 生成脚本：`app/scripts/build-tool-router-sft.mjs`
- 格式：ChatML messages（system / user / assistant），assistant 只输出一个 JSON。
- 当前 197 条，覆盖 4 个工具、无工具、跨工具请求。
- 不包含用户隐私数据，全部是模板化合成样本。

## 阿里云百炼 SFT

当前北京地域 Key 已能访问：

```text
POST https://dashscope.aliyuncs.com/api/v1/fine-tunes
```

（探测返回的是 “Missing training files”，不是 401，说明鉴权通过。）

正式训练前需要确认：

1. 在百炼控制台确认可用模型（如 Qwen3.5-9B / Qwen3-8B）的 SFT 高效训练权限；
2. 训练集格式和最小条数符合控制台要求；
3. 训练时长、费用、部署后的模型 ID；
4. 训练完成后的模型是否支持 OpenAI 兼容调用。

## 推荐执行顺序

1. 先保持线上 function calling + 工具表（现有逻辑），不动；
2. 用 197 条样本做一次小 SFT，产出 `tool-router` 模型；
3. 只把「路由」切到微调模型，工具执行仍走现有 `server/tools.mjs`；
4. 用固定 100 条评测集比较：工具命中率、参数正确率、无工具误触发率、延迟、token；
5. 达标再切换，保留原路由作为 fallback。

## 备注

- 不把简历、投递记录、聊天内容、上传文件放进训练集。
- 不把工具执行权限下放给微调模型。
- 真正训练会产生云端费用和训练时长；先报预算再跑。
