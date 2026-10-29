/**
 * 备考帮 · 主题管理器
 * 十套完整设计语言（六经典 + 四原创动态主题），运行时可切换，
 * 选择持久化到 localStorage。
 * 主题的视觉定义集中在 src/assets/styles/themes.css（CSS 变量），
 * 这里只负责注册表 / 持久化 / 应用 / 事件通知。
 */
import { ref } from 'vue'

export const THEMES = [
  {
    id: 'paper',
    name: '纸质笔记',
    desc: '暖纸底 · 靛蓝墨水 · 琥珀标记，安静的书卷气',
    emoji: '📔',
    swatches: ['#2c3e6b', '#d97706', '#faf8f3'],
    dark: false
  },
  {
    id: 'midnight',
    name: '深夜自习',
    desc: '深蓝夜幕 · 青色荧光 · 等宽数字，熬夜刷题专用',
    emoji: '🌙',
    swatches: ['#0d1526', '#5cc8f5', '#182742'],
    dark: true
  },
  {
    id: 'mint',
    name: '清新薄荷',
    desc: '白色浮卡 · 薄荷绿 · 大圆角，轻盈通透',
    emoji: '🌿',
    swatches: ['#0ca678', '#f76707', '#f4f8f6'],
    dark: false
  },
  {
    id: 'sunset',
    name: '活力日落',
    desc: '珊瑚渐变 · 暖阳橙，元气满满的冲刺感',
    emoji: '🌅',
    swatches: ['#f0576b', '#ffb347', '#fff8f3'],
    dark: false
  },
  {
    id: 'mono',
    name: '极简黑白',
    desc: '黑白灰 · 衬线标题 · 直角硬边，冷静的编辑部风',
    emoji: '⬛',
    swatches: ['#0a0a0a', '#525252', '#ffffff'],
    dark: false
  },
  {
    id: 'sakura',
    name: '樱花初雪',
    desc: '樱粉渐变 · 薰衣草点缀 · 超大圆角，柔软治愈',
    emoji: '🌸',
    swatches: ['#ef7ca2', '#8a7fd6', '#fdf3f6'],
    dark: false
  },
  {
    id: 'stellar',
    name: '星穹终端',
    desc: '深空黑 · 霓虹青紫 · 流动网格背景，未来感操作台',
    emoji: '🛰️',
    swatches: ['#22d3ee', '#a78bfa', '#05070f'],
    dark: true
  },
  {
    id: 'candy',
    name: '奶油糖霜',
    desc: '奶油底 · 糖果粉蓝 · 波点头部与果冻按钮，软萌治愈',
    emoji: '🍬',
    swatches: ['#e2648f', '#4aa3e8', '#fff8ef'],
    dark: false
  },
  {
    id: 'ink',
    name: '墨韵书窗',
    desc: '宣纸白 · 墨色 · 朱砂印章与楷体标题，会呼吸的书卷气',
    emoji: '✒️',
    swatches: ['#26333d', '#b8452e', '#f7f3e9'],
    dark: false
  },
  {
    id: 'aurora',
    name: '极光之夜',
    desc: '极光流动 · 星空闪烁 · 玻璃卡片，深夜也浪漫',
    emoji: '🌌',
    swatches: ['#6ee7b7', '#93c5fd', '#070d1a'],
    dark: true
  }
]

const STORAGE_KEY = 'kb-theme'

function readStored() {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    return THEMES.some(t => t.id === id) ? id : 'paper'
  } catch (e) {
    return 'paper'
  }
}

/** 当前主题 id（响应式，供界面高亮与依赖主题色的计算属性） */
const current = ref(readStored())

export function useTheme() {
  return current
}

export function getThemeMeta(id = current.value) {
  return THEMES.find(t => t.id === id) || THEMES[0]
}

/** 将主题写入 <html data-theme="..."> 并广播事件 */
export function applyTheme() {
  document.documentElement.setAttribute('data-theme', current.value)
  // 让依赖主题色的 JS 计算属性（如科目页渐变头部）刷新
  window.dispatchEvent(new CustomEvent('kaoshibang:theme'))
}

export function setTheme(id) {
  if (!THEMES.some(t => t.id === id)) return
  current.value = id
  try { localStorage.setItem(STORAGE_KEY, id) } catch (e) { /* ignore */ }
  applyTheme()
}

export function initTheme() {
  applyTheme()
}

/** 读取当前主题下的 CSS 变量（用于 JS 侧生成颜色） */
export function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
