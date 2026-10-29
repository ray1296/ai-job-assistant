export function formatDate(date, fmt = 'YYYY-MM-DD HH:mm') {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const map = {
    YYYY: d.getFullYear(),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    DD: String(d.getDate()).padStart(2, '0'),
    HH: String(d.getHours()).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0')
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, m => map[m])
}

export function daysBetween(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target - now) / 86400000)
}

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0分钟'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}小时${m}分钟`
  return `${m}分钟`
}

export function typeLabel(type) {
  const map = {
    choice: '单选题', single: '单选题', judge: '判断题', fill: '填空题',
    short: '简答题', multi: '多选题', comprehensive: '综合分析题',
    program_analysis: '程序分析题', calc: '计算题', code_fill: '代码填空题'
  }
  return map[type] || type
}

export function normalizeType(type) {
  const map = {
    single: 'choice', program_analysis: 'comprehensive', calc: 'short', code_fill: 'fill'
  }
  return map[type] || type
}

export function difficultyLabel(level) {
  const map = { 1: '简单', 2: '中等', 3: '困难' }
  return map[level] || '中等'
}

export function difficultyColor(level) {
  const map = { 1: 'var(--success)', 2: 'var(--warning)', 3: 'var(--danger)' }
  return map[level] || 'var(--warning)'
}
