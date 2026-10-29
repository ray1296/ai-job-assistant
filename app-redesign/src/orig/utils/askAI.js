/**
 * 「问问AI」工具：把题目/知识点/卡片内容添加到 AI 对话（看板娘输入框草稿）
 *
 * 交互设计（类似 Trae 的"添加到对话"）：
 *  1. 点击"问问AI" → 内容存入草稿队列 + toast 短提示"已添加到AI对话"
 *  2. 看板娘输入框只显示【占位符 chip】（如 [卡片1]），不显示原文
 *     —— 避免题目/知识点文字长时占据对话框空间
 *  3. chip 是一个整体：光标无法进入中间，只能放在两侧
 *  4. 鼠标悬浮 chip 左上角出现 ×，点击删除该条，发送时不带这部分内容
 *  5. 点击 chip 本体 → 跳转到该题目/知识点所在位置
 *  6. 发送时：chip 原位替换为完整原文，一并发给 AI；发送后草稿清空
 */
import { showToast } from 'vant'

const DRAFTS_KEY = 'live2d-ai-drafts'

/** 读取草稿队列 */
export function readAIDrafts() {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter(d => d && d.content) : []
  } catch (e) {
    return []
  }
}

/** 整体写入草稿队列（发送失败恢复时用） */
export function saveAIDrafts(list) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(Array.isArray(list) ? list : []))
  } catch (e) {
    /* ignore */
  }
}

function saveDrafts(list) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list))
}

/**
 * 触发"问问AI"：追加到草稿队列 + 短提示 + 通知看板娘（若存在则立即弹出输入框）
 * @param {string} content 要发给 AI 的完整原文
 * @param {string} type 来源类型文案：'题目' | '知识点' | '卡片'
 * @param {object} ref 跳转信息 { path, tab }：点击 chip 时跳回来源位置
 * @returns {number} 草稿项 id（供渲染 chip 用）
 */
export function askAI(content, type, ref) {
  const text = (content || '').trim()
  if (!text) return 0
  const drafts = readAIDrafts()
  const seq = drafts.length + 1
  const id = Date.now() + Math.floor(Math.random() * 1000)
  drafts.push({
    id,
    placeholder: `[${type}${seq}]`,
    type,
    content: text,
    ref: ref || null,
  })
  saveDrafts(drafts)
  // 短提示，只描述位置，不展示完整内容
  showToast({ message: `${type}已添加到AI对话`, duration: 1500 })
  // 通知看板娘（若当前页面挂载了 Live2DPet 则立即弹出输入框显示 chip）
  window.dispatchEvent(new CustomEvent('kaoshibang:ask-ai', { detail: { id } }))
  // 我们的 AI 讲题：直接以题干触发
  window.dispatchEvent(new CustomEvent('zg:tutor', { detail: { stem: text, answer: '' } }))
  return id
}

/** 按 id 查草稿项 */
export function getAIDraft(id) {
  return readAIDrafts().find(d => d.id === id) || null
}

/** 删除单个草稿（点击 chip 的 ×） */
export function clearAIDraft(id) {
  saveDrafts(readAIDrafts().filter(d => d.id !== id))
}

/** 发送后清空全部草稿 */
export function clearAIDrafts() {
  localStorage.removeItem(DRAFTS_KEY)
}
