import request from './request'

// AI 接口统一长超时（解除 token 限制后，长任务如报告生成可能耗时 30s+；全局 15s 会误杀）
const AI_TIMEOUT = 180000

// AI智能识别知识点（上限已放宽到 1000 字）
export const aiRecognize = (text) => request.post('/ai/recognize', { text }, { timeout: AI_TIMEOUT })

// AI智能识别题目（按题型生成1道题）
export const aiRecognizeQuestion = (type, text) => request.post('/ai/recognize-question', { type, text }, { timeout: AI_TIMEOUT })

// AI智能出题（传知识点数组，后端截取前30个）
export const aiGenerateQuiz = (items) => request.post('/ai/generate-quiz', { items }, { timeout: AI_TIMEOUT })

// AI对话（网站宠物用，带上下文记忆）
// history: [{role:'user'|'assistant', content:'...'}] 按时间正序
export const aiChat = (message, history) =>
  request.post('/ai/chat', { message, history }, { timeout: AI_TIMEOUT })

// 错题知识点主动讲解（进入科目复习时，根据历史错题提炼核心知识点+鼓励语）
export const aiWrongReview = (subjectName, wrongQuestions) =>
  request.post('/ai/wrong-review', { subjectName, wrongQuestions }, { timeout: AI_TIMEOUT })

// 功能1：加工学习资料（题型分类 + 知识点 + 公式总结）
export const aiStudySummary = (subjectName, questions) =>
  request.post('/ai/study-summary', { subjectName, questions }, { timeout: AI_TIMEOUT })

// 功能2：错题解题步骤生成（面向小白详细步骤）
export const aiWrongSteps = (subjectName, wrongQuestions) =>
  request.post('/ai/wrong-steps', { subjectName, wrongQuestions }, { timeout: AI_TIMEOUT })

// 功能4：简答题对比分析 + 顺口溜
// items: [{ stem, userAnswer, correctAnswer }]
export const aiShortMemo = (subjectName, items) =>
  request.post('/ai/short-memo', { subjectName, items }, { timeout: AI_TIMEOUT })

// 功能3：科目间关联分析
// subjects: [{ name, topics: [...] }]
export const aiSubjectLink = (subjects) =>
  request.post('/ai/subject-link', { subjects }, { timeout: AI_TIMEOUT })

// 功能8b：Agent 生成 AI 复习报告页（自包含 HTML）
// 返回 { html, title }
export const aiGeneratePage = (subjectName, questions, wrongQuestions) =>
  request.post('/ai/generate-page', { subjectName, questions, wrongQuestions }, { timeout: AI_TIMEOUT })

// ===== RAG 本地知识库 =====
// 检索增强问答：返回 { answer, sources:[{refType, refId, subjectId, title, content}] }
export const aiRagAsk = (query, subjectId) =>
  request.post('/ai/rag/ask', { query, subjectId }, { timeout: AI_TIMEOUT })

// 纯检索（调试/展示）
export const aiRagSearch = (query, subjectId) =>
  request.post('/ai/rag/search', { query, subjectId }, { timeout: AI_TIMEOUT })

// 重建知识库索引（后台全量）
export const aiRagRebuild = () =>
  request.post('/ai/rag/rebuild', {}, { timeout: AI_TIMEOUT })

// 索引状态
export const aiRagStats = () =>
  request.get('/ai/rag/stats')

// ===== AI Agent（Function Calling 工具调用） =====
// 返回 { answer, rounds, steps:[{tool, args, ok, result}] }
export const aiAgentRun = (message) =>
  request.post('/ai/agent/run', { message }, { timeout: AI_TIMEOUT })

// ===== AI 复习报告页持久化（云端存储） =====
export const aiPageSave = (data) => request.post('/ai/pages', data, { timeout: AI_TIMEOUT })
export const aiPageList = () => request.get('/ai/pages')
export const aiPageDetail = (id) => request.get('/ai/pages/' + id)
export const aiPageDelete = (id) => request.delete('/ai/pages/' + id)

