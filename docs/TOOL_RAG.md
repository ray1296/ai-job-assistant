# Tool RAG：让工具表可检索、可更新

## 为什么

把完整工具表每次塞进系统提示词有两个问题：

1. 工具少时还好，工具变多后 token 线性增长；
2. 工具 schema 一改，所有提示词/微调数据都要跟着改。

现在改成 **工具注册表本身就是检索语料**：先按用户问题检索最相关的工具，只把命中的 1~3 个工具注入提示词。

## 实现

- server/tool-rag.mjs
- 数据源：server/tools.mjs 的 TOOLS（名称、描述、JSON Schema）+ ALIASES（中文别名/触发词）。
- 检索：中文 bigram + 英文单词重叠 + 别名 substring + 企业名命中；不依赖向量库。
- 默认 top 3；没有命中时返回明确提示“本轮没有匹配工具”，不让模型编造。
- 注入位置：
  - /api/companion/chat 的提示词工具路由
  - 多 agent 规划器 planSteps

## 好处

- 工具更新只改 TOOLS / ALIASES，不需要重建索引。
- 4 个工具时保持确定性，不引入额外向量依赖。
- 工具数量增长后，只需把 retrieveTools() 换成向量召回，调用方不变。

## 验证

- “帮我找上海前端岗位” → search_jobs
- “查一下字节跳动的风评” → company_review
- “我现在刷了多少题” → my_progress
- “杭州 3000 以内租房” → find_housing
- 跨域：“学习进度 + 杭州房子” → my_progress + find_housing

## 后续

- 工具超过 20 个时，给工具描述做 embedding，和知识 RAG 分索引。
- 工具调用结果做成结构化 tool message，不要只拼字符串。
- 工具路由准确率需要单独评测集（当前只有 4 个工具，先用确定性关键词兜底）。
