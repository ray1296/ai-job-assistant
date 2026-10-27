<template>
  <div class="page review-page">
    <!-- 头部 -->
    <div class="page-header review-header">
      <h1>知识冲刺</h1>
      <p>选一个岗位方向，直接开始刷题</p>
      <div class="stats-bar" v-if="subjects.length">
        <div class="stat-chip"><strong>{{ subjects.length }}</strong> 科目</div>
        <div class="stat-chip"><strong class="num-mono">{{ stats?.questions || 0 }}</strong> 题目</div>
        <div class="stat-chip"><strong class="num-mono">{{ stats?.materials || 0 }}</strong> 资料</div>
        <div class="stat-chip"><strong class="num-mono">{{ stats?.flashcards || 0 }}</strong> 卡片</div>
      </div>
    </div>

    <div class="subject-grid" v-if="subjects.length">
      <div
        v-for="s in subjects"
        :key="s.id"
        class="subject-card"
        @click="goSubject(s)"
      >
        <div class="card-icon">{{ s.icon || '📖' }}</div>
        <div class="card-name">{{ s.name }}</div>
        <div class="card-stats">
          <span>{{ getStat(s.id, 'questions') }} 题</span>
          <span>{{ getStat(s.id, 'knowledge') }} 知识点</span>
          <span>{{ getStat(s.id, 'cards') }} 卡</span>
        </div>
        <van-icon name="arrow" class="card-arrow" size="14" color="var(--text-light)" />
        <van-icon name="cross" class="card-delete" @click.stop="handleDeleteSubject(s)" />
      </div>

      <div class="subject-card add-card" @click="router.push('/upload')">
        <van-icon name="plus" size="28" color="var(--text-light)" />
        <div class="card-name">新建科目</div>
      </div>
    </div>

    <EmptyState v-else-if="!loading" icon="bookmark-o" text="还没有科目" action-text="去上传资料" @action="router.push('/upload')" />

    <div v-if="loading" class="loading-wrap">
      <van-loading size="32px">加载中...</van-loading>
    </div>

    <!-- 版本选择弹窗 -->
    <div class="version-popup" :class="{ show: showVersionPopup }" @click.self="showVersionPopup = false">
      <div class="version-popup-content">
        <div class="version-popup-header">
          <div class="vp-icon">{{ popupSubject.icon || '📖' }}</div>
          <div class="vp-name">{{ popupSubject.name }}</div>
          <button class="vp-close" @click="showVersionPopup = false">&times;</button>
        </div>
        <div class="version-popup-body">
          <div v-if="versionPopupLoading" class="vp-loading">
            <van-loading size="24px">加载中...</van-loading>
          </div>
          <div v-else-if="popupVersions.length === 0" class="vp-empty">暂无版本，请先上传资料</div>
          <div v-else class="vp-version-list">
            <div
              v-for="v in popupVersions"
              :key="v.id"
              class="vp-version-item"
              @click="goVersion(popupSubject.id, v)"
            >
              <div class="vp-version-info">
                <span class="vp-version-name">{{ v.name }}</span>
                <span class="vp-version-stats">{{ v.questionCount }}题 / {{ v.cardCount }}卡</span>
              </div>
              <van-icon name="arrow" color="var(--text-light)" size="14" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onActivated } from 'vue'
import { useRouter } from "vue-router"
import { showConfirmDialog, showToast } from 'vant'
import { useUserStore } from '../../stores/userStore'
import { useStatsStore } from '../../stores/statsStore'
import { getQuestionStats } from '../../api/question'
import { getSubjectReview, getVersionList } from '../../api/material'
import EmptyState from '../../components/EmptyState.vue'

defineOptions({ name: 'ReviewList' })

const router = useRouter()
const userStore = useUserStore()
const statsStore = useStatsStore()

const loading = ref(false)
const subjects = ref([])
const statsMap = ref({})
const stats = ref(null)

const showVersionPopup = ref(false)
const versionPopupLoading = ref(false)
const popupSubject = reactive({ id: null, name: '', icon: '' })
const popupVersions = ref([])

async function goSubject(s) {
  popupSubject.id = s.id
  popupSubject.name = s.name
  popupSubject.icon = s.icon
  showVersionPopup.value = true
  versionPopupLoading.value = true
  popupVersions.value = []
  try {
    const res = await getVersionList(s.id)
    popupVersions.value = res.data || []
  } catch (e) {
    showToast('加载版本失败')
  }
  versionPopupLoading.value = false
}

function goVersion(subjectId, v) {
  showVersionPopup.value = false
  router.push(`/review/${subjectId}?versionId=${v.id}`)
}

function getStat(subjectId, field) {
  const s = statsMap.value[subjectId]
  if (!s) return 0
  if (field === 'questions') return s.totalQuestions || 0
  if (field === 'knowledge') return s.knowledgePoints || 0
  if (field === 'cards') return s.flashcards || 0
  return 0
}

async function handleDeleteSubject(s) {
  await showConfirmDialog({ title: '删除科目', message: `确认删除「${s.name}」？该科目下的所有资料、题目、卡片都会被删除！` })
  await userStore.removeSubject(s.id)
  showToast('科目已删除')
  await loadData()
}

async function loadStats() {
  statsMap.value = {}
  for (const s of subjects.value) {
    try {
      const res = await getSubjectReview(s.id)
      const d = res.data
      statsMap.value[s.id] = {
        totalQuestions: d.totalQuestions,
        knowledgePoints: d.knowledgePoints.length,
        flashcards: d.flashcards.length,
      }
    } catch (e) {
      // skip
    }
  }
}

let loadingData = false
async function loadData() {
  try { localStorage.setItem("zg.practiceRoute", "/orig/#/review") } catch (e) { /* ignore */ }
  // onMounted + onActivated 在 keep-alive 首屏会同时触发；
  // 并发重载会让科目卡片在用户点击时被替换，表现为“点几次才响应”。
  if (loadingData) return
  loadingData = true
  try {
    loading.value = true
    if (!userStore.subjects.length) {
      await userStore.fetchSubjects()
    }
    subjects.value = userStore.subjects
    const overview = await statsStore.fetchOverview()
    stats.value = overview
    await loadStats()
  } finally {
    loading.value = false
    loadingData = false
  }
}

onMounted(loadData)
onActivated(loadData)
</script>

<style scoped>
.review-page {
  min-height: 100vh;
  background: var(--bg);
}

.review-header {
  text-align: center;
}

.stats-bar {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.subject-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 20px 14px;
}

.subject-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 14px;
  text-align: center;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  overflow: hidden;
}

.subject-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--primary);
  opacity: 0.75;
}

.subject-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}

.card-icon {
  font-size: 32px;
  margin-bottom: 10px;
  line-height: 1;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.card-stats {
  display: flex;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-light);
  flex-wrap: wrap;
}

.card-stats span {
  padding: 2px 8px;
  background: var(--bg-alt);
  border-radius: var(--chip-radius);
}

.card-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.15s;
}

.subject-card:hover .card-arrow {
  opacity: 1;
}

.card-delete {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--danger-bg);
  border-radius: var(--radius-pill);
  color: var(--danger);
  font-size: 12px;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.15s;
}

.subject-card:hover .card-delete {
  opacity: 1;
}

.add-card {
  border: 2px dashed var(--border-strong);
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 130px;
  gap: 8px;
}

.add-card::before {
  display: none;
}

.add-card .card-name {
  color: var(--text-light);
  font-weight: 500;
  margin-bottom: 0;
}

.loading-wrap {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

/* 版本弹窗 */
.version-popup {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--mask);
  z-index: 999;
  display: none;
  align-items: center;
  justify-content: center;
}

.version-popup.show {
  display: flex;
}

.version-popup-content {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 88%;
  max-width: 380px;
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.version-popup-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}

.vp-icon {
  font-size: 24px;
}

.vp-name {
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  color: var(--text);
}

.vp-close {
  border: none;
  background: none;
  font-size: 22px;
  color: var(--text-light);
  cursor: pointer;
  line-height: 1;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
}

.vp-close:hover {
  background: var(--bg-alt);
}

.version-popup-body {
  padding: 10px 14px 16px;
  overflow-y: auto;
  flex: 1;
}

.vp-loading {
  display: flex;
  justify-content: center;
  padding: 28px;
}

.vp-empty {
  text-align: center;
  color: var(--text-light);
  padding: 28px;
  font-size: 13px;
}

.vp-version-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vp-version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.vp-version-item:hover {
  background: var(--primary-bg);
  border-color: var(--primary-light);
}

.vp-version-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.vp-version-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.vp-version-stats {
  font-size: 11px;
  color: var(--text-light);
}

@media (max-width: 767px) {
  .subject-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    padding: 16px 12px;
  }

  .card-icon {
    font-size: 28px;
  }

  .card-name {
    font-size: 14px;
  }

  .card-stats {
    flex-direction: column;
    gap: 4px;
    align-items: center;
  }
}
</style>
