<template>
  <div class="ai-history-view">
    <header class="ai-history-header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <div>
        <h1>历史报告</h1>
        <p>{{ list.length ? '共 ' + list.length + ' 份，点击查看或删除' : 'AI 生成的报告都会保存在这里' }}</p>
      </div>
    </header>

    <div v-if="loading" class="ai-history-empty">加载中…</div>
    <div v-else-if="!list.length" class="ai-history-empty">
      <div class="empty-icon">📄</div>
      <strong>还没有历史报告</strong>
      <span>去学习刷题页让看板娘生成一份吧</span>
    </div>
    <div v-else class="ai-history-grid">
      <article v-for="item in list" :key="item.id" class="ai-history-card" @click="open(item.id)">
        <div class="ai-history-icon">📄</div>
        <div class="ai-history-body">
          <strong>{{ item.title || 'AI 报告' }}</strong>
          <span>{{ item.time || '刚刚生成' }}</span>
        </div>
        <button class="ai-history-delete" title="删除这份报告" @click.stop="remove(item)">删除</button>
        <span class="ai-history-arrow">→</span>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { aiPageList, aiPageDelete } from '../../api/ai'

const router = useRouter()
const list = ref([])
const loading = ref(false)

function fmtTime(ts) {
  if (!ts) return ''
  try {
    const d = new Date(Number(ts) || ts)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

async function load() {
  loading.value = true
  try {
    const res = await aiPageList()
    const rows = res?.data
    list.value = (Array.isArray(rows) ? rows : []).map((p) => ({
      id: String(p.id),
      title: p.title || 'AI 报告',
      time: fmtTime(p.createdAt),
    }))
  } catch (e) {
    list.value = []
  } finally {
    loading.value = false
  }
}

function open(id) {
  router.push('/ai-page/' + id)
}

async function remove(item) {
  try {
    await aiPageDelete(item.id)
    list.value = list.value.filter((x) => x.id !== item.id)
    showToast('已删除')
  } catch (e) {
    showToast('删除失败，请重试')
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/review')
}

onMounted(load)
</script>

<style scoped>
.ai-history-view {
  min-height: 100vh;
  padding: 0 0 40px;
  background: var(--bg, #f7f6fc);
  color: var(--text, #2c3e6b);
}
.ai-history-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px clamp(16px, 4vw, 48px) 18px;
  background: rgba(255, 255, 255, .92);
  border-bottom: 1px solid #ece9f7;
  position: sticky;
  top: 0;
  z-index: 3;
  backdrop-filter: blur(10px);
}
.ai-history-header h1 { margin: 0; font-size: 22px; }
.ai-history-header p { margin: 4px 0 0; color: #8b8aa0; font-size: 12px; }
.back-btn {
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  background: linear-gradient(135deg, #6c8cff, #9d7bff);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.ai-history-grid {
  width: min(880px, calc(100% - 32px));
  margin: 22px auto 0;
  display: grid;
  gap: 10px;
}
.ai-history-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #ece9f7;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(108, 140, 255, .08);
  cursor: pointer;
  transition: transform .16s, box-shadow .16s, border-color .16s;
}
.ai-history-card:hover {
  transform: translateY(-1px);
  border-color: #cfc8f5;
  box-shadow: 0 8px 24px rgba(108, 140, 255, .14);
}
.ai-history-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #f1efff;
  font-size: 18px;
}
.ai-history-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ai-history-body strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.ai-history-body span { color: #9996ad; font-size: 11px; }
.ai-history-delete {
  border: 1px solid #f0e0e0;
  border-radius: 9px;
  padding: 5px 10px;
  background: #fff7f7;
  color: #d66;
  font-size: 12px;
  cursor: pointer;
  flex: 0 0 auto;
}
.ai-history-delete:hover { background: #ffecec; border-color: #e8b7b7; }
.ai-history-arrow { color: #b7b3cc; font-size: 18px; }
.ai-history-empty {
  width: min(520px, calc(100% - 32px));
  margin: 72px auto 0;
  padding: 42px 24px;
  border: 1px dashed #ded9f2;
  border-radius: 20px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #8b88a0;
  text-align: center;
}
.empty-icon { font-size: 40px; }
.ai-history-empty strong { color: #3f3b58; font-size: 15px; }
.ai-history-empty span { font-size: 12px; }
</style>
