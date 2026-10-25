<template>
  <div class="ai-page-view">
    <div class="ai-page-header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2 class="ai-page-title">{{ title || 'AI 复习报告' }}</h2>
      <div class="ai-page-actions">
        <button class="ai-page-list-btn" @click="showList = !showList">📚 历史</button>
      </div>
    </div>

    <!-- 历史报告列表 -->
    <div v-if="showList" class="ai-page-history">
      <div class="history-title">已生成的报告（点击查看）</div>
      <div v-if="historyList.length === 0" class="history-empty">还没有历史报告</div>
      <div v-for="h in historyList" :key="h.id" class="history-item" @click="openHistory(h.id)">
        <span class="history-emoji">📄</span>
        <span class="history-name">{{ h.title }}</span>
        <span class="history-time">{{ h.time }}</span>
        <button class="history-del" @click.stop="delHistory(h.id)">✕</button>
      </div>
    </div>

    <div v-if="html" class="ai-page-frame-wrap">
      <iframe class="ai-page-frame" :srcdoc="html" sandbox=""></iframe>
    </div>
    <div v-else class="ai-page-empty">
      <div class="icon">📄</div>
      <p>报告不存在或已被清除</p>
      <p class="sub">去科目复习页让小帮生成一份吧～</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { aiPageDetail, aiPageList, aiPageDelete } from '../../api/ai'

const route = useRoute()
const router = useRouter()

const html = ref('')
const title = ref('')
const showList = ref(false)
const historyList = ref([])

const STORAGE_PREFIX = 'ai-page-'
const INDEX_KEY = 'ai-page-index'

// 云端优先加载，失败回退 localStorage（兼容旧数据）
async function loadPage(id) {
  try {
    const res = await aiPageDetail(id)
    if (res.code === 200 && res.data?.html) {
      html.value = res.data.html
      title.value = res.data.title || 'AI 复习报告'
      return
    }
  } catch (e) { /* 云端失败走本地 */ }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id)
    if (!raw) {
      html.value = ''
      title.value = ''
      return
    }
    const obj = JSON.parse(raw)
    html.value = obj.html || ''
    title.value = obj.title || 'AI 复习报告'
  } catch (e) {
    html.value = ''
    title.value = ''
  }
}

async function loadHistory() {
  // 云端列表优先，合并本地旧记录
  let cloud = []
  try {
    const res = await aiPageList()
    if (res.code === 200) {
      cloud = (res.data || []).map(p => ({ id: String(p.id), title: p.title, time: (p.createdAt || '').slice(0, 10) }))
    }
  } catch (e) { /* ignore */ }
  let local = []
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const arr = raw ? JSON.parse(raw) : []
    local = Array.isArray(arr) ? arr : []
  } catch (e) { local = [] }
  // 合并去重：云端优先，本地的 r 开头旧记录补齐
  const merged = [...cloud]
  for (const l of local) {
    if (!merged.some(m => String(m.id) === String(l.id))) merged.push(l)
  }
  historyList.value = merged
}

function openHistory(id) {
  router.replace('/ai-page/' + id)
  showList.value = false
}

async function delHistory(id) {
  try { await aiPageDelete(id) } catch (e) { /* 云端删除失败也继续清本地 */ }
  try { localStorage.removeItem(STORAGE_PREFIX + id) } catch (e) { /* ignore */ }
  const arr = historyList.value.filter(h => String(h.id) !== String(id))
  historyList.value = arr
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(arr.filter(h => String(h.id).startsWith('r'))))
  } catch (e) { /* ignore */ }
  if (String(route.params.id) === String(id)) {
    html.value = ''
    title.value = ''
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/review')
}

function refresh() {
  const id = route.params.id
  if (id) {
    loadPage(id)
  } else {
    html.value = ''
    title.value = ''
  }
  loadHistory()
}

onMounted(refresh)
watch(() => route.params.id, refresh)
</script>

<style scoped>
.ai-page-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f5f7ff 0%, #fef6ff 100%);
}

.ai-page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #ece9f7;
  box-shadow: 0 2px 12px rgba(108, 140, 255, 0.08);
}

.back-btn {
  border: none;
  background: linear-gradient(135deg, #6c8cff, #9d7bff);
  color: #fff;
  padding: 7px 14px;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.15s, box-shadow 0.15s;
}
.back-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(108, 140, 255, 0.35);
}

.ai-page-title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #2c3e6b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-page-list-btn {
  border: 1px solid #d8d4f0;
  background: #fff;
  color: #6c8cff;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.ai-page-list-btn:hover {
  background: #f3f1ff;
}

.ai-page-history {
  margin: 10px 16px;
  padding: 12px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #ece9f7;
  box-shadow: 0 4px 16px rgba(108, 140, 255, 0.1);
}
.history-title {
  font-size: 13px;
  color: #888;
  margin-bottom: 8px;
}
.history-empty {
  font-size: 13px;
  color: #bbb;
  text-align: center;
  padding: 10px;
}
.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}
.history-item:hover {
  background: #f5f3ff;
}
.history-emoji {
  font-size: 16px;
}
.history-name {
  flex: 1;
  font-size: 13px;
  color: #444;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-time {
  font-size: 11px;
  color: #aaa;
}
.history-del {
  border: none;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 8px;
}
.history-del:hover {
  background: #ffe0e0;
  color: #e74c3c;
}

.ai-page-frame-wrap {
  flex: 1;
  margin: 0 16px 16px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #ece9f7;
  box-shadow: 0 8px 28px rgba(108, 140, 255, 0.14);
  background: #fff;
}
.ai-page-frame {
  width: 100%;
  height: 100%;
  min-height: 70vh;
  border: none;
  display: block;
}

.ai-page-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
  gap: 6px;
}
.ai-page-empty .icon {
  font-size: 48px;
  margin-bottom: 8px;
}
.ai-page-empty .sub {
  font-size: 13px;
  color: #bbb;
}
</style>
