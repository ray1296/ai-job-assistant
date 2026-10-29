<template>
  <div class="live2d-pet-container" ref="petContainer">
    <!-- 对话气泡（AI回答/状态） -->
    <div class="pet-dialog" :class="{ show: dialogVisible, pinned: persistentDialog, working: workingActive }" @click.stop="onDialogClick">
      <div v-if="persistentDialog" class="pet-dialog-pin" title="点击人物可关闭">📌</div>
      <div class="pet-dialog-text"><span v-if="workingActive && !noticeActive">🖥️ </span>{{ workingActive && !noticeActive ? workingDisplayText : dialogText }}<span v-if="workingActive && !noticeActive" class="pet-working-cursor">▍</span></div>
      <button v-if="dialogAction" class="pet-dialog-action" @click.stop="runDialogAction">{{ dialogAction.label }}</button>
      <div class="pet-dialog-tail"></div>
    </div>

    <!-- 输入框（contenteditable：占位符为不可分割的 chip） -->
    <div class="pet-input-box" :class="{ show: inputVisible }">
      <div class="pet-session-bar">
        <button type="button" @mousedown.prevent @click.stop="sessionMenu = !sessionMenu">会话</button>
        <button type="button" @mousedown.prevent @click.stop="newSession">＋ 新会话</button>
      </div>
      <div v-if="sessionMenu" class="pet-session-menu">
        <div v-for="s in sessions" :key="s.id" class="pet-session-item" :class="{ on: s.id === activeSession }">
          <button type="button" class="pet-session-open" @mousedown.prevent @click.stop="switchSession(s.id)">
            <strong>{{ s.title || '新会话' }}</strong>
            <small>{{ new Date(s.updatedAt || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</small>
          </button>
          <button type="button" class="pet-session-del" title="删除会话" aria-label="删除会话" @mousedown.prevent @click.stop="deleteSession(s.id)">×</button>
        </div>
      </div>
      <div
        ref="inputRef"
        class="pet-input norem"
        contenteditable="true"
        :data-placeholder="inputPlaceholder"
        @input="onInput"
        @keydown="handleKeydown"
        @mousedown="onInputMousedown"
        @paste="onPaste"
      ></div>
      <div v-if="pendingDoc" class="pet-img-chip pet-file-chip">
        <span>📄 {{ pendingDoc.name }}</span>
        <small>{{ pendingDoc.dataFile ? '数据文件，可直接导入' : Math.ceil(pendingDoc.chars / 1000) + 'k 字上下文' }}</small>
        <button title="移除文件" @mousedown.prevent @click.stop="removeDoc">✕</button>
      </div>
      <div v-if="pendingImage" class="pet-img-chip">
        <img :src="pendingImage" alt="待发送图片" />
        <span title="图片已附上，写完问题点发送">图片已附上</span>
        <button title="移除图片" @mousedown.prevent @click.stop="pendingImage = ''">✕</button>
      </div>
      <!-- 输入工具栏：语音 / 说话人分离 / 发图 / 知识库 / Agent -->
      <div class="pet-input-tools">
        <button class="pet-tool-btn" title="发图 / 粘贴截图（Ctrl+V）" @mousedown.prevent @click.stop="pickImage">
          🖼️
        </button>
        <input ref="imgInput" type="file" accept="image/*" style="display: none" @change="onPickImage" />
        <input ref="docInput" type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.json,.xml,.txt,.pptx" style="display: none" @change="onPickDoc" />
        <button class="pet-tool-btn" title="上传 PDF/Word/Excel/PPT（解析文字后作为上下文）" @mousedown.prevent @click.stop="pickDoc">
          📎
        </button>
        <button class="pet-tool-btn" :class="{ recording: isRecording }" :title="isRecording ? '点击停止录音' : '点击开始语音输入'" @mousedown.prevent @click.stop="toggleMic">
          {{ isRecording ? '⏹' : '🎤' }}
        </button>
        <button class="pet-tool-btn" :class="{ on: screenWatching }" title="屏幕观察（授权共享屏幕，每 5–10 分钟描述当前画面；不预测意图）" @mousedown.prevent @click.stop="toggleScreenWatch">
          🖥️
        </button>
        <button class="pet-tool-btn" title="手势彩蛋（开摄像头比手势，星野有反应）" @mousedown.prevent @click.stop="toggleGestureCam">
          📷
        </button>
      </div>
      <div v-if="isRecording" class="pet-rec-hint">正在聆听… 再点 🎤 结束</div>
    </div>

    <!-- Live2D Canvas（点击/长按拖动） -->
    <div class="pet-canvas-wrap" ref="canvasWrap">
      <button class="pet-wardrobe" title="换装" @click.stop="nextModel">👗</button>
      <img v-if="!modelReady" class="pet-loading-avatar" :src="fallbackAvatar" alt="角色立绘" />
      <canvas :id="canvasId" class="live2d-canvas" width="200" height="250" @click="handleClick" @mousedown="onPointerDown" @touchstart="onPointerDown"></canvas>
    </div>

    <!-- 摄像头手势彩蛋 -->
    <GestureCam ref="gestureCam" @gesture="onGesture" @close="onGestureClose" />
    <!-- 屏幕观察者（自动连续截帧分析） -->
    <ScreenWatcher ref="screenWatcher" @summary="onScreenSummary" @error="onScreenError" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from '../router'
import { showToast } from 'vant'
import { aiWrongReview } from '../api/ai'
import { extractFile } from '../../extract-file'
import { importDataset, isDatasetDataFile, detectDatasetCategory, wantsDatasetImport } from '../../dataset-import'
import { confirmPendingAction } from '../../agent-action'
import GestureCam from './GestureCam.vue'
import ScreenWatcher from './ScreenWatcher.vue'
import { edgeTTSSynthesize, getVoiceConfig } from '../utils/edgeTTS'
import { addMemory, clearMemory, memoryEntries, memoryStats, memoryText } from '../../agent-memory'
import { readAIDrafts, saveAIDrafts, getAIDraft, clearAIDraft, clearAIDrafts } from '../utils/askAI'

const props = defineProps({
  canvasId: { type: String, default: "pio" },
  modelStart: { type: Number, default: 0 },
  persona: { type: String, default: "" },
})

const router = useRouter()

// 本站写接口要求 CSRF；原项目页面的裸 fetch 容易漏带
const csrfHeaders = () => ({ 'X-CSRF-Token': window.__zgCsrf || '' })

const inputVisible = ref(false)
const dialogVisible = ref(false)
const dialogText = ref('')
const sessionMenu = ref(false)
const sessions = ref([])
const activeSession = ref('')
const inputRef = ref(null)
const petContainer = ref(null)
// 待发送图片（粘贴截图或本地选图），发送后清空
const pendingImage = ref('')
const pendingDoc = ref(null)
// File 不能放进 Vue 深层响应式对象：Proxy 传给 fetch 可能导致上传请求一直 pending。
let pendingDocRaw = null
const docInput = ref(null)
// 持久显示：重要 AI 分析（考点总结/错题精讲等）不自动消失，点击人物才关
const persistentDialog = ref(false)
// 持久气泡可带一个动作按钮（如"查看报告"跳转 AI 生成的页面）
const dialogAction = ref(null)

// ===== 输入模式：chat 闲聊 / rag 知识库问答 / agent 工具调用任务 =====
const mode = ref('chat')
const ragAsking = ref(false)
const sending = ref(false)
const inputPlaceholder = computed(() => {
  if (mode.value === 'rag') return '问我题库/资料里的知识…'
  if (mode.value === 'agent') return '给我派个任务，比如：帮我出一套机器学习小测验'
  return '和我说说话...'
})

// ===== 语音输入（ASR） =====
const isRecording = ref(false)

/* ===== 工作气泡轮播系统（移植自 dsh-whale-girl-pet） ===== */
const workingActive = ref(false)
const workingTool = ref('')
const noticeActive = ref(false)   // 通知气泡（showBubble）正在显示时为 true
let workingTimer = null
let workingCharIndex = 0
let workingPhraseIndex = 0
const workingDisplayText = ref('')


const WORK_POOL_A_PREFIX = '正在调用「'
const WORK_POOL_A_SUFFIX = '」…'
const WORK_POOL_B = [
  '星野努力干活中~',
  '哒哒哒哒哒……',
  '这段资料再翻翻…',
  '快好啦快好啦…',
]

function getWorkingPhrases(toolName) {
  if (toolName) {
    return [
      WORK_POOL_A_PREFIX + toolName + WORK_POOL_A_SUFFIX,
      '哒哒哒哒哒……',
      '这段资料再翻翻…',
      '快好啦快好啦…',
    ]
  }
  return WORK_POOL_B
}

function startWorkingBubble(toolName) {
  stopWorkingBubble()
  workingTool.value = toolName || ''
  workingActive.value = true
  workingPhraseIndex = 0
  workingCharIndex = 0
  // 立即显示第一句的第一个字
  const phrases = getWorkingPhrases(workingTool.value)
  workingDisplayText.value = phrases[0][0] || ''
  // 90ms/字 打字
  workingTimer = setInterval(() => {
    const phrases = getWorkingPhrases(workingTool.value)
    const currentPhrase = phrases[workingPhraseIndex]
    if (workingCharIndex < currentPhrase.length - 1) {
      workingCharIndex++
      workingDisplayText.value = currentPhrase.slice(0, workingCharIndex + 1)
    } else {
      // 当前句打完，切下一句（循环）
      workingPhraseIndex = (workingPhraseIndex + 1) % phrases.length
      workingCharIndex = 0
      workingDisplayText.value = ''
    }
  }, 90)
}

function stopWorkingBubble() {
  if (workingTimer) {
    clearInterval(workingTimer)
    workingTimer = null
  }
  workingActive.value = false
  workingTool.value = ''
  workingCharIndex = 0
  workingPhraseIndex = 0
  workingDisplayText.value = ''
}

// workingDisplayText: 工作轮播当前显示的文字（在 setInterval 里更新）

/* ===== 空闲小剧场系统 ===== */
let idleTheaterTimer = null
let lastTheaterTime = Date.now()
let nextTheaterInterval = 120000 + Math.random() * 240000  // 120000~360000ms

const THEATER_LINES = [
  '（小声）今天也没摸鱼，真的…',
  '要不要来杯奶茶？半糖去冰。',
  '刚才有个知识点飞过去了，抓到了没？',
  '（伸懒腰）啊——坐麻了，起来活动一下～',
  '键盘声真好听，像下雨。',
  '背了这么久，休息两分钟吧～',
  '让我看看你在复习什么…',
  '我不是只会说加油的大肥鱼！',
]

function startIdleTheater() {
  stopIdleTheater()
  idleTheaterTimer = setInterval(() => {
    // 空闲条件检查
    if (workingActive.value) return
    if (isTypingActive) return
    if (inputVisible.value) return
    if (isRecording.value) return
    if (persistentDialog.value) return
    if (noticeActive.value) return
    // 检查是否到了小剧场时间
    const now = Date.now()
    if (now - lastTheaterTime >= nextTheaterInterval) {
      const line = THEATER_LINES[Math.floor(Math.random() * THEATER_LINES.length)]
      showBubble(line, { duration: 6000 })
      lastTheaterTime = now
      nextTheaterInterval = 120000 + Math.random() * 240000
    }
  }, 60000)  // 每 60 秒检查一次
}

function stopIdleTheater() {
  if (idleTheaterTimer) {
    clearInterval(idleTheaterTimer)
    idleTheaterTimer = null
  }
}
let mediaRecorder = null
let audioChunks = []

// 与原始 banniang 资源一致的模型列表
const MODELS = [
  '/live2d/live2d-widget-models/live2d-widget-model-miku/assets/miku.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-shizuku/assets/shizuku.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-chitose/assets/chitose.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-koharu/assets/koharu.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-haru/01/assets/haru01.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-wanko/assets/wanko.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-vert/vert_classic/vert_classic.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-nepgear_extra/nepgear_extra/nepgear_extra.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-haruto/assets/haruto.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-haru/02/assets/haru02.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-histoire/histoire/histoire.model.json',
  '/live2d/live2d-widget-models/live2d-widget-model-blanc_normal/blanc_normal/blanc_normal.model.json',
]
const MODEL_NAMES = ['miku', 'shizuku', 'chitose', 'koharu', 'haru', 'wanko', 'vert', 'nepgear', 'haruto', 'haru2', 'histoire', 'blanc']
const MODEL_STORAGE_KEY = 'live2d-pet-model'
// 对话上下文记忆：localStorage 持久化最近 6 轮对话，让小帮记得刚才聊过什么
const CHAT_HISTORY_KEY = 'live2d-chat-history'
const CHAT_HISTORY_MAX = 12 // 6 轮 = 12 条（user+assistant 成对）

function loadChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

function saveChatHistory(arr) {
  try {
    // 只保留最近 CHAT_HISTORY_MAX 条，控制体积
    const trimmed = arr.slice(-CHAT_HISTORY_MAX)
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed))
  } catch (e) {
    /* localStorage 满了就算了 */
  }
}

function pushChatHistory(role, content) {
  if (!content) return
  const arr = loadChatHistory()
  arr.push({ role, content: String(content).slice(0, 300) })
  saveChatHistory(arr)
  persistSession()
}

/* ===== 会话：新会话 / 历史会话 ===== */
const SESSION_STORE_KEY = 'live2d-chat-sessions.v1'
function saveSessionStore() {
  try {
    localStorage.setItem(SESSION_STORE_KEY, JSON.stringify({ active: activeSession.value, sessions: sessions.value.slice(0, 20) }))
  } catch (e) { /* ignore */ }
}
function sessionTitle(messages) {
  const first = (messages || []).find(m => m.role === 'user')
  return first ? String(first.content || '').replace(/\s+/g, ' ').slice(0, 22) : '新会话'
}
function persistSession() {
  if (!activeSession.value) return
  const s = sessions.value.find(x => x.id === activeSession.value)
  if (!s) return
  s.messages = loadChatHistory().slice(-80)
  s.title = sessionTitle(s.messages)
  s.updatedAt = Date.now()
  saveSessionStore()
}
function initSessions() {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_STORE_KEY) || 'null')
    if (data && Array.isArray(data.sessions) && data.sessions.length) {
      sessions.value = data.sessions
      activeSession.value = data.active && data.sessions.some(s => s.id === data.active) ? data.active : data.sessions[0].id
      const active = data.sessions.find(s => s.id === activeSession.value)
      if (active?.messages?.length) saveChatHistory(active.messages)
      return
    }
  } catch (e) { /* ignore */ }
  const messages = loadChatHistory()
  const id = 's' + Date.now()
  sessions.value = [{ id, title: sessionTitle(messages), messages, updatedAt: Date.now() }]
  activeSession.value = id
  saveSessionStore()
}
function newSession() {
  persistSession()
  const id = 's' + Date.now() + Math.floor(Math.random() * 1000)
  sessions.value = [{ id, title: '新会话', messages: [], updatedAt: Date.now() }, ...sessions.value].slice(0, 20)
  activeSession.value = id
  saveSessionStore()
  clearChatHistory()
  dialogText.value = ''
  dialogVisible.value = false
  persistentDialog.value = false
  dialogAction.value = null
  sessionMenu.value = false
  inputVisible.value = true
  nextTick(() => { inputRef.value?.focus(); autoResize() })
}
function switchSession(id) {
  persistSession()
  const s = sessions.value.find(x => x.id === id)
  if (!s) return
  activeSession.value = id
  saveSessionStore()
  saveChatHistory(s.messages || [])
  sessionMenu.value = false
  persistentDialog.value = false
  dialogAction.value = null
  const last = [...(s.messages || [])].reverse().find(m => m.role === 'assistant')
  dialogText.value = last?.content || ''
  dialogVisible.value = !!last
  if (last) persistentDialog.value = true
  nextTick(() => { inputVisible.value = true; inputRef.value?.focus(); autoResize() })
}
function deleteSession(id) {
  const target = sessions.value.find(x => x.id === id)
  if (!target || !confirm('删除会话「' + (target.title || '新会话') + '」？此操作不可撤销。')) return
  const wasActive = activeSession.value === id
  const rest = sessions.value.filter(x => x.id !== id)
  if (!rest.length) {
    const nid = 's' + Date.now() + Math.floor(Math.random() * 1000)
    sessions.value = [{ id: nid, title: '新会话', messages: [], updatedAt: Date.now() }]
    activeSession.value = nid
    clearChatHistory()
    dialogText.value = ''
    dialogVisible.value = false
  } else {
    sessions.value = rest
    if (wasActive) {
      activeSession.value = rest[0].id
      saveChatHistory(rest[0].messages || [])
      const last = [...(rest[0].messages || [])].reverse().find(m => m.role === 'assistant')
      dialogText.value = last?.content || ''
      dialogVisible.value = !!last
      persistentDialog.value = !!last
    }
  }
  dialogAction.value = null
  saveSessionStore()
}

function clearChatHistory() {
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY)
  } catch (e) { /* ignore */ }
}

/* ===== 见缝插针复习点（功能5）：把 AI 分析过的要点存起来，定时主动弹出 ===== */
const REVIEW_POINTS_KEY = 'live2d-review-points'
const REVIEW_POINTS_MAX = 20
const PROACTIVE_REVIEW_KEY = 'live2d-proactive-review-enabled'
let proactiveTimer = null

function loadReviewPoints() {
  try {
    const raw = localStorage.getItem(REVIEW_POINTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) { return [] }
}

function pushReviewPoint(text) {
  if (!text) return
  const arr = loadReviewPoints()
  arr.push({ text: String(text).slice(0, 400), ts: Date.now() })
  // 只保留最近 REVIEW_POINTS_MAX 条
  localStorage.setItem(REVIEW_POINTS_KEY, JSON.stringify(arr.slice(-REVIEW_POINTS_MAX)))
}

/* 主动复习定时器：每隔一段时间挑一个最近复习点，主动弹出+语音朗读 */
function startProactiveReview() {
  stopProactiveReview()
  if (localStorage.getItem(PROACTIVE_REVIEW_KEY) !== '1') return
  // 每 8 分钟主动复习一次（仅当用户开启该功能）
  proactiveTimer = setInterval(() => {
    if (localStorage.getItem(PROACTIVE_REVIEW_KEY) !== '1') return
    const arr = loadReviewPoints()
    if (!arr.length) return
    // 不打扰正在输入/对话的用户
    if (inputVisible.value || dialogVisible.value) return
    const pick = arr[Math.floor(Math.random() * arr.length)]
    const intro = '复习时间到啦～帮你回忆一个知识点：'
    const cheer = ' 记得不错吧，继续加油哦٩(๑•̀ω•́๑)۶'
    showBubble(intro + pick.text + cheer)
  }, 8 * 60 * 1000)
}

function stopProactiveReview() {
  if (proactiveTimer) {
    clearInterval(proactiveTimer)
    proactiveTimer = null
  }
}

const currentModelIndex = ref(props.modelStart || 0)
const modelReady = ref(false)
const fallbackAvatar = computed(() => '/assets/companions/model-' + MODEL_NAMES[currentModelIndex.value] + '.png')
let modelCheckToken = 0
let modelCheckCount = 0
function checkModelPixels(token) {
  if (token !== modelCheckToken || modelReady.value) return
  const canvas = document.getElementById(props.canvasId)
  if (!canvas) return
  try {
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl) {
      const buf = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buf)
      let nonEmpty = 0
      for (let i = 3; i < buf.length; i += 4) if (buf[i] > 8) nonEmpty++
      if (nonEmpty > 500) { modelReady.value = true; return }
    }
  } catch (e) {}
  if (++modelCheckCount < 40) setTimeout(() => checkModelPixels(token), 250)
}

// 输入框尺寸：初始小小，随输入自适应宽度，宽到限度后变长（增高）
const INPUT_MIN_W = 120   // 初始最小宽度
const INPUT_MAX_W = 300   // 宽度上限，达到后改为增高
const INPUT_MIN_H = 36
const INPUT_MAX_H = 140

// 类型 → emoji 图标（渲染 chip 与恢复输入共用）
const TOKEN_EMOJI = {
  卡片: '📇',
  选择题: '☑️',
  判断题: '⚖️',
  简答题: '✍️',
  代码填空题: '💻',
  题目: '📝',
  知识点: '💡',
}

// 拖动参数：长按 350ms 进入拖动，移动超过阈值视为拖动/点击判定
const LONG_PRESS_MS = 350
const DRAG_THRESHOLD = 8

let pressTimer = null
let autoHideTimer = null
let mouthTimer = null
let isDragging = false
let hasDragged = false
let startX = 0
let startY = 0
let petStartX = 0
let petStartY = 0
// 流式打字：取消标记（关闭/换装/收起时停止）
let typingCancel = false

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function onAgentBubble(e) {
  if (e?.detail?.agentId !== 'xingye') return
  showBubble(String(e.detail.text || '').slice(0, 180), { type: 'info', duration: Number(e.detail.duration) || 15000 })
}

onMounted(async () => {
  try {
    await loadScript('/live2d/js/l2d.js?v=2')
    await nextTick()
    initPet()
    // 监听"问问AI"事件（其他页面把题目/知识点/卡片添加到对话）
    window.addEventListener('kaoshibang:ask-ai', onAskAI)
    window.addEventListener('zg:agent-bubble', onAgentBubble)
    // 监听"错题知识点讲解"事件（进入科目复习时，根据错题主动讲解）
    window.addEventListener('kaoshibang:wrong-review', onWrongReview)
    // 监听"AI展示"事件（其他页面调用AI后，把回复交给看板娘显示+TTS）
    window.addEventListener('kaoshibang:ai-show', onAiShow)
    // 监听"切换输入模式"事件（科目页菜单：知识库问答 / Agent 任务）
    window.addEventListener('kaoshibang:set-mode', onSetMode)
    // 监听"主动复习开关"事件：壁纸页切换时立即生效
    window.addEventListener('kaoshibang:proactive-review-toggle', startProactiveReview)
    window.addEventListener('kaoshibang:activity', onActivity)
    window.addEventListener('kaoshibang:upload-done', onUploadDone)
    window.addEventListener('kaoshibang:quiz-correct', onQuizCorrect)
    window.addEventListener('kaoshibang:quiz-wrong', onQuizWrong)
    window.addEventListener('kaoshibang:exam-submitted', onExamSubmitted)
    window.addEventListener('kaoshibang:favorited', onFavorited)
    // 监听 AI 忙碌状态（工作气泡轮播）
    window.addEventListener('kaoshibang:ai-busy', onAiBusy)
    // 设置页切换默认形象后立即生效
    window.addEventListener('zg:pet-model', onPetModelChange)
    // 启动见缝插针主动复习定时器（用户在壁纸页勾选后才生效）
    startProactiveReview()
    // 本地会话 + 服务端对话记忆
    initSessions()
    loadRemoteChatHistory()
    // 本地记忆快到上限时主动提醒（可对看板娘说「上传记忆」「清空记忆」）
    const mem = memoryStats('星野')
    if (mem.pct >= 0.8) {
      setTimeout(() => showBubble('我的长期记忆快满了（' + Math.round(mem.pct * 100) + '%），可以对我说「上传记忆」或「清空记忆」哦～', { type: 'info', duration: 12000 }), 3500)
    }
    // 预热语音列表（部分浏览器首次 getVoices 为空，需触发一次）
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => {}
    }
    // 拖拽输入：把网页文本 / 文件 / 图片拖到看板娘身上
    const c = petContainer.value
    if (c) {
      c.addEventListener('dragover', onDragOver)
      c.addEventListener('dragleave', onDragLeave)
      c.addEventListener('drop', onDrop)
    }
  } catch (e) {
    console.error('Live2D加载失败:', e)
  }
})

/* ===== 图片：本地选图 / 粘贴截图（多模态识图） ===== */
async function fileToDataUrl(file) {
  const bmp = await createImageBitmap(file)
  const max = 1100
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  try { bmp.close() } catch (e) { /* ignore */ }
  return c.toDataURL('image/jpeg', 0.84)
}
async function acceptImage(file) {
  if (!file || !(file.type || '').startsWith('image/')) return
  try {
    pendingImage.value = await fileToDataUrl(file)
    inputVisible.value = true
    nextTick(() => inputRef.value && inputRef.value.focus())
    showToast('图片已附上，写完问题点发送（或直接发送让我看图）')
  } catch (e) {
    showToast('这张图读不出来，换一张试试')
  }
}
function pickImage() {
  if (imgInput.value) imgInput.value.click()
}
function onPickImage(e) {
  const f = e.target.files && e.target.files[0]
  if (f) acceptImage(f)
  e.target.value = ''
}
function pickDoc() {
  if (docInput.value) docInput.value.click()
}
function removeDoc() {
  pendingDoc.value = null
  pendingDocRaw = null
}
async function onPickDoc(e) {
  const f = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!f) return
  if (isDatasetDataFile(f.name)) {
    pendingDocRaw = f
    pendingDoc.value = { name: f.name, text: '', chars: 0, dataFile: true }
    if (!inputVisible.value) inputVisible.value = true
    showToast('已附上数据文件；可以说“导入岗位数据到我的账号”')
    return
  }
  showToast('正在解析 ' + f.name + '…')
  try {
    const d = await extractFile(f)
    pendingDocRaw = f
    pendingDoc.value = { name: d.name, text: d.text, chars: d.chars }
    if (!inputVisible.value) inputVisible.value = true
    showToast(d.truncated ? '文件较长，已截取前 3 万字' : '已附上文件，输入问题后发送')
  } catch (err) {
    showToast('文件解析失败：' + ((err && err.message) || '格式不支持'))
  }
}
function onPaste(e) {
  const items = Array.from((e.clipboardData && e.clipboardData.items) || [])
  const hit = items.find(it => (it.type || '').startsWith('image/'))
  if (!hit) {
    // 纯文本粘贴走 insertText，避免浏览器插入 div/br 后 buildMessage 读不到内容。
    const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''
    if (text) {
      e.preventDefault()
      try { document.execCommand('insertText', false, text) } catch (err) {}
      setTimeout(() => { autoResize(); const el = inputRef.value; if (el) el.scrollTop = el.scrollHeight }, 0)
    }
    return
  }
  const f = hit.getAsFile()
  if (!f) return
  e.preventDefault()
  acceptImage(f)
}

/* ===== 拖拽输入 ===== */
function onDragOver(e) {
  e.preventDefault()
  e.stopPropagation()
  if (petContainer.value) petContainer.value.classList.add('pet-drag-over')
}
function onDragLeave(e) {
  e.preventDefault()
  if (petContainer.value) petContainer.value.classList.remove('pet-drag-over')
}
async function onDrop(e) {
  e.preventDefault()
  e.stopPropagation()
  if (petContainer.value) petContainer.value.classList.remove('pet-drag-over')

  const files = Array.from(e.dataTransfer?.files || [])
  const text = e.dataTransfer?.getData('text/plain') || ''
  const uri = e.dataTransfer?.getData('text/uri-list') || ''

  // 图片 → 附到输入框，随问题一起走多模态识图
  const imgFile = files.find(f => (f.type || '').startsWith('image/'))
  if (imgFile) {
    await acceptImage(imgFile)
    return
  }

  // 文本文件 → 读内容进输入框
  const textFile = files.find(f => /text\/|json|md|csv|txt/i.test(f.type || '') || /\.(txt|md|json|csv|js|java|py|c|cpp|html|css|xml|yml|yaml|log)$/i.test(f.name || ''))
  if (textFile) {
    try {
      const content = await textFile.text()
      insertIntoInput((content || '').slice(0, 3000))
      showToast('已放入输入框（' + content.length + ' 字）')
      return
    } catch (err) {
      showToast('文件读取失败')
      return
    }
  }

  // 其他文件（docx/pdf 等）→ 引导去上传中心
  if (files.length) {
    showToast('这类文件去「上传」页解析更好哦，我收下了链接～')
    return
  }

  // 网页文本 / URL
  const dropText = (text || uri).trim()
  if (dropText) {
    insertIntoInput(dropText.slice(0, 3000))
    showToast('已放入输入框')
  }
}

function insertIntoInput(content) {
  inputVisible.value = true
  nextTick(() => {
    const el = inputRef.value
    if (!el) return
    const existed = el.textContent || ''
    el.textContent = existed ? existed + ' ' + content : content
    focusEnd()
    autoResize()
  })
}

function initPet() {
  if (!window.loadlive2d) return
  // 优先使用用户上次选择的形象；首次进入用固定的默认形象（与设置页高亮一致），并立即记住
  let idx = parseInt(localStorage.getItem(MODEL_STORAGE_KEY) || '', 10)
  if (!(idx >= 0 && idx < MODELS.length)) {
    idx = Number.isFinite(props.modelStart) && props.modelStart >= 0 && props.modelStart < MODELS.length ? props.modelStart : 0
    try { localStorage.setItem(MODEL_STORAGE_KEY, String(idx)) } catch (e) { /* ignore */ }
  }
  currentModelIndex.value = idx
  loadModel(idx)
}

function onPetModelChange(e) {
  const i = Number(e && e.detail && e.detail.index)
  if (!(i >= 0 && i < MODELS.length)) return
  currentModelIndex.value = i
  try { localStorage.setItem(MODEL_STORAGE_KEY, String(i)) } catch (err) { /* ignore */ }
  loadModel(i)
}

function loadModel(idx) {
  modelReady.value = false
  modelCheckCount = 0
  const token = ++modelCheckToken
  try {
    window.loadlive2d(props.canvasId, MODELS[idx])
  } catch (e) {
    console.warn('[pet] Live2D load failed, keep fallback', e)
  }
  setTimeout(() => checkModelPixels(token), 300)
}

/* ===== 换装：点击按钮切换形象，记住用户选择 ===== */
function nextModel() {
  stopSpeech()
  const next = (currentModelIndex.value + 1) % MODELS.length
  currentModelIndex.value = next
  localStorage.setItem(MODEL_STORAGE_KEY, String(next))
  loadModel(next)
  showToast(`换装成功：${MODEL_NAMES[next]}`)
}

/* ===== 点击切换输入框/收起 ===== */
function handleClick() {
  if (hasDragged) {
    hasDragged = false
    return
  }
  toggleInput()
}

function toggleInput() {
  if (inputVisible.value || dialogVisible.value) {
    // 再次点击：输入框和显示框一起收起（持久消息也一并关闭）
    inputVisible.value = false
    dialogVisible.value = false
    persistentDialog.value = false
    dialogAction.value = null
    stopSpeech()
    clearAutoHide()
  } else {
    inputVisible.value = true
    nextTick(() => {
      renderPendingTokens()
      inputRef.value?.focus()
      focusEnd()
      autoResize()
    })
  }
}

/* ===== 问问AI：接收其他页面添加的内容，立即弹出输入框并渲染 chip ===== */
function onAskAI() {
  // 收起旧对话气泡，弹出输入框
  dialogVisible.value = false
  persistentDialog.value = false
  dialogAction.value = null
  stopSpeech()
  clearAutoHide()
  inputVisible.value = true
  nextTick(() => {
    renderPendingTokens()
    inputRef.value?.focus()
    focusEnd()
    autoResize()
  })
}

/* ===== 错题知识点主动讲解：进入科目复习时，根据错题生成核心知识点 + 鼓励语，显示并朗读 ===== */
async function onWrongReview(e) {
  const detail = e?.detail || {}
  const subjectName = detail.subjectName || ''
  const wrongQuestions = Array.isArray(detail.wrongQuestions) ? detail.wrongQuestions : []

  // 收起输入框、停止正在播放的语音/打字
  inputVisible.value = false
  stopSpeech()
  clearAutoHide()
  dialogText.value = '我看看你的错题...'
  dialogVisible.value = true

  try {
    // 精简错题数据，只保留必要字段，节省 token
    const payload = wrongQuestions.slice(0, 12).map(q => ({
      type: q.type || '',
      topic: q.topic || '',
      stem: (q.stem || '').slice(0, 120),
      answer: (q.answer || '').slice(0, 60),
    }))
    const res = await aiWrongReview(subjectName, payload)
    const reply = (res && res.data && res.data.reply) || '嗯嗯，这几题的考点我整理好啦～'
    pushReviewPoint(reply) // 存为复习点，供见缝插针主动复习
    await showReplyStreaming(reply, { persistent: true })
  } catch (err) {
    dialogText.value = '呜，错题解析开小差了，稍后再试试吧~'
    persistentDialog.value = false
  }
  if (!persistentDialog.value) scheduleAutoHide()
}

/* ===== AI 展示（统一入口）：其他页面调用 AI 后把回复交给看板娘显示+TTS =====
 * detail: { text, persistent?, action?:{label,type,path} }
 * - persistent=true：持久显示，点击人物才关（用于重要分析）
 * - action：气泡内附一个按钮（如"查看报告"跳转 AI 生成的页面）
 */
async function onAiShow(e) {
  const detail = e?.detail || {}
  const text = detail.text || ''
  if (!text) return
  inputVisible.value = false
  stopSpeech()
  clearAutoHide()
  // 先显示"正在思考"，再流式展示
  dialogText.value = '正在思考...'
  dialogVisible.value = true
  persistentDialog.value = false
  dialogAction.value = null
  try {
    await showReplyStreaming(text, { persistent: !!detail.persistent, action: detail.action || null })
    if (detail.persistent) {
      // 持久消息存为复习点，供见缝插针主动复习
      pushReviewPoint(text)
    }
  } catch (err) {
    dialogText.value = '呜，开小差了，稍后再试吧~'
    persistentDialog.value = false
    scheduleAutoHide()
  }
}

/* 持久气泡内动作按钮（如跳转 AI 报告页） */
function runDialogAction() {
  const a = dialogAction.value
  if (!a) return
  if (a.type === 'open' && a.url) {
    window.open(a.url, '_blank', 'noopener')
    return
  }
  if (a.type === 'navigate' && a.path) {
    router.push(a.path)
    // 跳转后收起气泡
    dialogVisible.value = false
    persistentDialog.value = false
    dialogAction.value = null
    stopSpeech()
    clearAutoHide()
  }
}

/* 点击持久气泡本身：若带动作则执行，否则不处理（关闭靠点击人物） */
function onDialogClick() {
  noticeActive.value = false  // 点击关闭通知气泡
  if (dialogAction.value) {
    runDialogAction()
  }
}

/* ===== contenteditable 输入框：占位符 chip（整体不可分割） ===== */
function onInput() {
  autoResize()
  syncDraftsFromDom()
  const el = inputRef.value
  if (el) {
    // contenteditable 在高度变化时可能保留 scrollTop=0，导致光标在下方但看不到新字。
    requestAnimationFrame(() => { try { el.scrollTop = el.scrollHeight } catch (e) {} })
  }
}

// 点击输入框空白处（chip 间隙/两侧）：手动把光标放到对应 chip 之后
// （Chrome 对 contenteditable=false 元素末尾空白的点击会把光标跳到容器开头）
function onInputMousedown(e) {
  const el = inputRef.value
  if (!el) return
  if (e.target !== el) return // 点击 chip / 文本：走默认行为
  const chips = el.querySelectorAll('.pet-token')
  if (!chips.length) return // 无 chip：默认行为
  e.preventDefault()
  el.focus()
  let after = null
  for (const c of chips) {
    if (e.clientX > c.getBoundingClientRect().right) after = c
  }
  const range = document.createRange()
  if (after) range.setStartAfter(after)
  else range.setStartBefore(chips[0])
  range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// 创建 chip 元素（renderPendingTokens / restoreInput 共用）
function createTokenSpan(id) {
  const d = getAIDraft(id)
  if (!d) return null
  const span = document.createElement('span')
  span.className = 'pet-token'
  span.setAttribute('contenteditable', 'false')
  span.dataset.rid = String(d.id)
  span.title = d.ref && d.ref.path ? '点击跳转到来源位置' : ''
  const em = document.createElement('span')
  em.className = 'pet-token-emoji'
  em.textContent = TOKEN_EMOJI[d.type] || '📌'
  span.appendChild(em)
  // 文字：去掉方括号 → "卡片1"
  span.appendChild(document.createTextNode(d.placeholder.replace(/[\[\]]/g, '')))
  // 点击 chip 本体：contenteditable=false 原生阻止光标进入中间，click 触发跳转
  span.addEventListener('click', () => onTokenClick(d.id))
  return span
}

// 把草稿队列中尚未渲染的 chip 追加到输入框（原生 DOM 创建，避免与 Vue 渲染冲突）
function renderPendingTokens() {
  const el = inputRef.value
  if (!el) return
  const drafts = readAIDrafts()
  const existing = new Set()
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('pet-token')) {
      existing.add(Number(node.dataset.rid))
    }
  }
  for (const d of drafts) {
    if (existing.has(d.id)) continue
    const span = createTokenSpan(d.id)
    if (span) el.appendChild(span)
  }
}

// 输入框结构快照（发送失败时原样恢复：文字 + chip 顺序）
function snapshotInput() {
  const el = inputRef.value
  if (!el) return []
  const snap = []
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      snap.push({ type: 'text', text: node.textContent })
    } else if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('pet-token')) {
      snap.push({ type: 'chip', id: Number(node.dataset.rid) })
    }
  }
  return snap
}

// 恢复输入框（草稿 + 文字 + chip），重新弹出输入框
function restoreInput(drafts, snap) {
  if (drafts.length) saveAIDrafts(drafts)
  const el = inputRef.value
  if (!el) return
  el.innerHTML = ''
  for (const item of snap) {
    if (item.type === 'text') {
      el.appendChild(document.createTextNode(item.text))
    } else if (item.type === 'chip') {
      const span = createTokenSpan(item.id)
      if (span) el.appendChild(span)
    }
  }
  inputVisible.value = true
  nextTick(() => {
    focusEnd()
    autoResize()
  })
}

// 删除 chip（点 ×），该条不参与发送
// 键盘删除 chip（Backspace/Delete）后同步草稿：把 DOM 中已不存在的 chip 从草稿队列删掉，
// 避免下次添加时"已删除的占位符又出现"
function syncDraftsFromDom() {
  const el = inputRef.value
  if (!el) return
  const domIds = new Set()
  for (const node of el.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('pet-token')) {
      domIds.add(Number(node.dataset.rid))
    }
  }
  const drafts = readAIDrafts()
  for (const d of drafts) {
    if (!domIds.has(d.id)) clearAIDraft(d.id)
  }
}

// 点击 chip 本体 → 跳转到来源位置（收起输入框，草稿保留，可继续添加）
function onTokenClick(id) {
  const d = getAIDraft(id)
  if (!d || !d.ref || !d.ref.path) return
  inputVisible.value = false
  dialogVisible.value = false
  clearAutoHide()
  const query = { tab: d.ref.tab }
  if (d.ref.sel) query.sel = d.ref.sel
  if (d.ref.quizType) query.qtype = d.ref.quizType
  if (d.ref.qidx !== undefined) query.qidx = d.ref.qidx
  const target = router.resolve({ path: d.ref.path, query })
  if (target.fullPath === router.currentRoute.value.fullPath) {
    // 已在同一位置（重复点击同一 chip 时 URL 不变，watch 不触发）→ 直接滚动高亮
    scrollToSource(d.ref.sel)
    return
  }
  router.push({ path: d.ref.path, query })
}

// 滚动到目标元素并闪烁高亮（与 subject.vue 的 flashScroll 一致，供同 URL 场景使用）
function scrollToSource(sel) {
  if (!sel) return
  const deadline = Date.now() + 6000
  const timer = setInterval(() => {
    const el = document.querySelector(sel)
    if (el) {
      clearInterval(timer)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const y0 = window.scrollY
      setTimeout(() => {
        if (Math.abs(window.scrollY - y0) < 2) {
          el.scrollIntoView({ behavior: 'auto', block: 'center' })
        }
        el.classList.add('ask-ai-flash')
        setTimeout(() => el.classList.remove('ask-ai-flash'), 2400)
      }, 500)
    } else if (Date.now() > deadline) {
      clearInterval(timer)
    }
  }, 120)
}

// 光标移到末尾
function focusEnd() {
  const el = inputRef.value
  if (!el) return
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// 组装发送内容：DOM 遍历，chip 原位替换为完整原文，用户文字保留
function buildMessage() {
  const el = inputRef.value
  if (!el) return ''
  const parts = []
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) parts.push(node.textContent)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (node.classList && node.classList.contains('pet-token')) {
      const d = getAIDraft(Number(node.dataset.rid))
      if (d) parts.push(d.content)
      return
    }
    if (node.tagName === 'BR') { parts.push('\n'); return }
    const block = /^(DIV|P|LI|UL|OL)$/.test(node.tagName)
    if (block && parts.length && !String(parts[parts.length - 1]).endsWith('\n')) parts.push('\n')
    for (const ch of Array.from(node.childNodes)) walk(ch)
    if (block && parts.length && !String(parts[parts.length - 1]).endsWith('\n')) parts.push('\n')
  }
  walk(el)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/* ===== 长按拖动 ===== */
function getPoint(e) {
  if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
  return { x: e.clientX, y: e.clientY }
}

function onPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return
  const pt = getPoint(e)
  if (!pt) return
  hasDragged = false
  isDragging = false
  startX = pt.x
  startY = pt.y
  const rect = petContainer.value.getBoundingClientRect()
  petStartX = rect.left
  petStartY = rect.top

  clearTimeout(pressTimer)
  // 长按后进入拖动模式
  pressTimer = setTimeout(() => {
    isDragging = true
    petContainer.value.style.cursor = 'grabbing'
  }, LONG_PRESS_MS)

  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', onPointerUp)
  window.addEventListener('touchmove', onPointerMove, { passive: false })
  window.addEventListener('touchend', onPointerUp)
  window.addEventListener('touchcancel', onPointerUp)
}

function onPointerMove(e) {
  const pt = getPoint(e)
  if (!pt) return

  if (!isDragging) {
    // 未长按就移动：视为普通点击（可能有轻微抖动），取消长按
    if (Math.abs(pt.x - startX) > DRAG_THRESHOLD || Math.abs(pt.y - startY) > DRAG_THRESHOLD) {
      clearTimeout(pressTimer)
      hasDragged = true
    }
    return
  }

  // 拖动中
  if (e.cancelable) e.preventDefault()
  if (Math.abs(pt.x - startX) > 2 || Math.abs(pt.y - startY) > 2) {
    hasDragged = true
  }
  const dx = pt.x - startX
  const dy = pt.y - startY
  petContainer.value.style.left = (petStartX + dx) + 'px'
  petContainer.value.style.top = (petStartY + dy) + 'px'
  petContainer.value.style.right = 'auto'
  petContainer.value.style.bottom = 'auto'
}

function onPointerUp() {
  clearTimeout(pressTimer)
  if (isDragging) {
    isDragging = false
    petContainer.value.style.cursor = 'grab'
  }
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
  window.removeEventListener('touchmove', onPointerMove)
  window.removeEventListener('touchend', onPointerUp)
  window.removeEventListener('touchcancel', onPointerUp)
}

/* ===== 输入框：宽度自适应，达到上限后增高 ===== */
function autoResize() {
  const el = inputRef.value
  if (!el) return
  el.style.width = 'auto'
  el.style.whiteSpace = 'pre'
  el.style.height = 'auto'
  el.style.overflowY = 'hidden'
  const want = el.scrollWidth
  if (want <= INPUT_MAX_W) {
    // 宽度自适应
    el.style.width = Math.max(INPUT_MIN_W, want) + 'px'
    el.style.height = INPUT_MIN_H + 'px'
  } else {
    // 宽度到顶，改为增高
    el.style.whiteSpace = 'pre-wrap'
    el.style.width = INPUT_MAX_W + 'px'
    const h = Math.min(el.scrollHeight, INPUT_MAX_H)
    el.style.height = h + 'px'
    el.style.overflowY = el.scrollHeight > INPUT_MAX_H ? 'auto' : 'hidden'
  }
}

/* ===== 发送 / 回复 ===== */
function handleKeydown(e) {
  // 回车发送，Shift+回车换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
    return
  }
  // Backspace/Delete：默认行为会删除光标前的 chip，删除后同步草稿队列
  if (e.key === 'Backspace' || e.key === 'Delete') {
    setTimeout(() => {
      syncDraftsFromDom()
      autoResize()
    }, 0)
  }
}

async function uploadMemory() {
  const entries = memoryEntries('星野')
  if (!entries.length) {
    showBubble('本地还没有需要上传的记忆哦～')
    return
  }
  try {
    const r = await fetch('/api/agents/xingye/memories', {
      method: 'POST',
      credentials: 'same-origin',
      headers: Object.assign({ 'Content-Type': 'application/json' }, csrfHeaders()),
      body: JSON.stringify({ entries }),
    })
    if (!r.ok) throw new Error('上传失败')
    const j = await r.json()
    clearMemory('星野')
    showBubble('已把 ' + (j.added || entries.length) + ' 条记忆上传到服务器，保留 30 天；本地记忆已清空。', { type: 'success', duration: 10000 })
  } catch (e) {
    showBubble('上传失败了，稍后再试一次吧～', { type: 'error' })
  }
}

const COLLAB_IDS = { 星野: "xingye", 知微: "zhiwei", 砚舟: "yanzhou", 栖迟: "qichi" }

function looksLikeCollaboration(msg) {
  const text = String(msg || "")
  const domains = [/学习|刷题|进度|错题|复习/, /岗位|招聘|求职|简历|面试/, /租房|房租|通勤|城市|生活/]
    .filter((r) => r.test(text)).length
  return domains >= 2 || /(团队|协作|一起|分配|汇总|让\s*(知微|砚舟|栖迟))/.test(text)
}

function isReportRequest(text) {
  return /(报告页|报告|网页|页面|HTML|站点)/i.test(String(text || ""))
}

async function generateReportPage(prompt, plan) {
  const summary = (plan || []).map((s) => s.agent + "：" + (s.ok ? (s.summary || "已完成") : "暂未拿到结果")).join("\n").slice(0, 2200)
  const pagePrompt = "根据以下多智能体执行结果，生成一个简洁、可直接阅读的求职行动清单报告页。不要编造执行结果里没有的数据；页面使用中文，自包含 HTML，不要外部依赖。\n\n用户原话：" + prompt + "\n\n执行结果：\n" + summary
  const r = await fetch("/api/ai/custom-page", {
    method: "POST",
    credentials: "same-origin",
    headers: Object.assign({ "Content-Type": "application/json" }, csrfHeaders()),
    body: JSON.stringify({ prompt: pagePrompt }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || "报告页生成失败")
  const html = String(j.html || "")
  if (!/<html[\s>]/i.test(html)) throw new Error("报告页内容无效")
  const title = String(j.title || "多智能体行动清单").slice(0, 80)
  const saved = await fetch("/api/ai/pages", {
    method: "POST",
    credentials: "same-origin",
    headers: Object.assign({ "Content-Type": "application/json" }, csrfHeaders()),
    body: JSON.stringify({ title, html, subjectId: "" }),
  })
  const sj = await saved.json().catch(() => ({}))
  return { id: sj.id || "", url: sj.id ? "/orig/#/ai-page/" + sj.id : "", title }
}

function emitAgentBubble(name, text, duration = 15000) {
  const agentId = COLLAB_IDS[name]
  if (!agentId) return
  window.dispatchEvent(new CustomEvent("zg:agent-bubble", { detail: { agentId, text, duration } }))
}

async function runReportOnly(msg) {
  startWorkingBubble("生成报告页")
  try {
    const page = await generateReportPage(msg, [])
    const reply = "报告页已生成，点击下方按钮查看。"
    stopWorkingBubble()
    await showReplyStreaming(reply, { speak: false, persistent: true, action: page.url ? { label: "查看报告页", type: "open", url: page.url } : null })
    return reply
  } finally {
    stopWorkingBubble()
  }
}
async function runCollaboration(msg, history, image) {
  startWorkingBubble("多智能体协作")
  try {
    const res = await fetch("/api/companion/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: Object.assign({ "Content-Type": "application/json" }, csrfHeaders()),
      body: JSON.stringify({
        message: msg,
        persona: "星野",
        page: location.hash.replace(/^#/, "") || "home",
        history: (history || []).slice(-6).map((x) => ({ role: x.role, text: x.content || x.text })),
        image: image || undefined,
        memory: memoryText("星野") || undefined,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || "协作任务失败")
    const plan = Array.isArray(j.plan) ? j.plan : []
    const delegation = j.delegation || null
    if (plan.length) {
      for (const step of plan) {
        const peer = String(step.agent || "")
        const task = String(step.task || "协作处理").slice(0, 90)
        if (peer && peer !== "星野") emitAgentBubble(peer, "收到「星野」分配的任务：" + task)
        if (step.ok && step.summary) emitAgentBubble(peer, "「" + peer + "」已完成，结果回传中…", 9000)
      }
    } else if (delegation) {
      const peer = String(delegation.agent || "")
      if (peer) emitAgentBubble(peer, "收到「星野」的任务：" + String(delegation.task || "查询资料").slice(0, 90))
    }
    if (j.handoff?.reply) {
      const peer = String(j.handoff.to || "队友")
      emitAgentBubble(peer, String(j.handoff.reply).slice(0, 160))
    }
    let reply = String(j.reply || "").trim() || "任务已完成，但我没有拿到可展示的结果。"
    let action = null
    if (isReportRequest(msg)) {
      try {
        const page = await generateReportPage(msg, plan)
        reply += "\n\n报告页已生成。"
        if (page.url) action = { label: "查看报告页", type: "open", url: page.url }
      } catch (e) {
        reply += "\n\n报告页生成失败：" + ((e && e.message) || "上游暂时不可用")
      }
    }
    stopWorkingBubble()
    bubbleQueue.length = 0
    noticeActive.value = false
    await showReplyStreaming(reply, { speak: false, persistent: true, action })
    return reply
  } finally {
    stopWorkingBubble()
  }
}

async function sendMessage() {
  if (mode.value === 'rag') {
    if (ragAsking.value) return
    const ragText = buildMessage().trim()
    if (!ragText) { showToast('先输入要问知识库的问题'); return }
    if (pendingImage.value || pendingDoc.value) { showToast('知识库问答先只接受文字，图片/文件请切回普通对话'); return }
    ragAsking.value = true
    showBubble('正在检索平台知识库…', { duration: 2000 })
    try {
      const r = await fetch('/api/ai/rag/ask', {
        method: 'POST', credentials: 'same-origin',
        headers: Object.assign({ 'Content-Type': 'application/json' }, csrfHeaders()),
        body: JSON.stringify({ query: ragText, limit: 6 }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || '知识库问答失败')
      const refs = (Array.isArray(j.sources) ? j.sources : []).map(s => '[' + s.index + '] ' + s.title).join('\n')
      showBubble(String(j.answer || '没有找到依据。') + (refs ? '\n\n来源：\n' + refs : ''), { persistent: true, duration: 20000 })
      if (inputRef.value) inputRef.value.innerHTML = ''
      inputVisible.value = false
    } catch (e) {
      showBubble((e && e.message) || '知识库问答失败，请稍后重试', { type: 'error', duration: 8000 })
    } finally { ragAsking.value = false }
    return
  }
  // 发送时把 chip 原位替换为完整原文，一并交给 AI（已删除的 chip 不参与）
  if (sending.value) return
  const msg = buildMessage().trim()
  const image = pendingImage.value
  const doc = pendingDoc.value
  if (!msg && !image && !doc) return
  sending.value = true
  // 记忆管理口令：不调用模型，直接执行
  const plainCmd = msg.replace(/\s+/g, '')
  if (/^(清空|清除|忘记)(一下)?(我的)?记忆$/.test(plainCmd)) {
    clearMemory('星野')
    if (inputRef.value) inputRef.value.innerHTML = ''
    inputVisible.value = false
    showBubble('本地记忆已清空；服务器副本（如果有）会在 30 天后自动删除。', { type: 'success', duration: 9000 })
    return
  }
  if (/^(上传|保存)(我的)?记忆(到服务器)?$/.test(plainCmd)) {
    if (inputRef.value) inputRef.value.innerHTML = ''
    inputVisible.value = false
    await uploadMemory()
    return
  }

  // 数据文件 + 明确“导入到我的账号”：直接走数据空间导入，不让 AI 只做文本总结。
  const importCategory = pendingDocRaw && wantsDatasetImport(msg) ? detectDatasetCategory(msg, doc?.name || pendingDocRaw.name) : null
  if (importCategory && pendingDocRaw) {
    const rawDoc = doc
    const rawFile = pendingDocRaw
    inputVisible.value = false
    if (inputRef.value) inputRef.value.innerHTML = ''
    clearAIDrafts()
    pendingImage.value = ''
    pendingDoc.value = null
    pendingDocRaw = null
    stopSpeech()
    startWorkingBubble('导入数据空间')
    try {
      const ds = await importDataset(rawFile, importCategory)
      const labels = { jobs: '岗位', companies: '企业', housing: '租房', knowledge: '知识' }
      const text = '已导入「' + rawDoc.name + '」到' + (labels[importCategory] || '数据') + '数据，共 ' + ds.rowCount + ' 行' +
        (ds.deduped ? '，去重 ' + ds.deduped + ' 行' : '') + '。可在「我的数据空间」查看、核对字段或撤销。'
      stopWorkingBubble()
      await showReplyStreaming(text, { speak: false, persistent: true, action: { label: '打开我的数据空间', type: 'navigate', path: '/data' } })
    } catch (e) {
      stopWorkingBubble()
      pendingDoc.value = rawDoc
      pendingDocRaw = rawFile
      dialogText.value = '导入失败：' + ((e && e.message) || '文件格式或数据内容不支持') + '。文件已保留，可修正后重试。'
    } finally {
      sending.value = false
    }
    return
  }

  // 快照输入内容（草稿 + 文字/chip 顺序）：发送失败时原样恢复，避免重新输入
  const draftBackup = JSON.parse(JSON.stringify(readAIDrafts()))
  const inputSnap = snapshotInput()

  inputVisible.value = false
  if (inputRef.value) inputRef.value.innerHTML = ''
  clearAIDrafts()
  pendingImage.value = ''
  pendingDoc.value = null
  pendingDocRaw = null

  stopSpeech()
  clearAutoHide()
  dialogText.value = '正在思考...'
  dialogVisible.value = true

  try {
    const asked = (msg || (doc ? '请阅读这个文件并帮我分析。' : '请看看这张图，帮我讲解一下。')) + (doc ? '\n\n【附件：' + doc.name + '】\n' + doc.text : '')
    const history = loadChatHistory()
    const reply = looksLikeCollaboration(asked)
      ? await runCollaboration(asked, history, image)
      : isReportRequest(asked)
        ? await runReportOnly(asked)
        : await streamChatSSE(asked, history, image)
    // 记录本轮对话到上下文记忆（user + assistant 成对）
    pushChatHistory('user', asked)
    pushChatHistory('assistant', reply)
    mode.value = 'chat'
  } catch (e) {
    dialogText.value = '发送失败：' + ((e && e.message) || '网络或 AI 上游暂时不可用') + '。内容已放回输入框，请稍后重试。'
    pendingImage.value = image
    // 发送失败：把刚才的内容原样放回输入框，用户不用重写
    restoreInput(draftBackup, inputSnap)
  } finally {
    sending.value = false
  }
  scheduleAutoHide()
}

/* ===== SSE 流式聊天：逐 token 实时渲染 + 结束后 TTS 朗读 ===== */
async function streamChatSSE(msg, history, image) {
  const res = await fetch('/api/ai/chat-stream', {
    method: 'POST',
    credentials: 'same-origin',
    headers: Object.assign({ 'Content-Type': 'application/json' }, csrfHeaders()),
    body: JSON.stringify({ message: msg, history, image: image || undefined, memory: memoryText('星野') || undefined }),
  })
  if (!res.ok || !res.body) throw new Error('网络错误')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''
  dialogVisible.value = true
  dialogText.value = ''
  typingCancel = false
  let ev = ''
  let dataLines = []
  let pendingAction = null
  const flush = () => {
    if (!ev && !dataLines.length) return
    const text = dataLines.join('\n')
    if (ev === 'token') {
      if (!typingCancel) {
        full += text
        dialogText.value = full
      }
    } else if (ev === 'memory') {
      if (text) addMemory('星野', text)
    } else if (ev === 'error') {
      throw new Error(text || 'AI失败')
    } else if (ev === 'action') {
      try { pendingAction = JSON.parse(text) } catch {}
    }
    ev = ''
    dataLines = []
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
      if (line === '') flush()
      else if (line.startsWith('event:')) ev = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  flush()
  if (pendingAction) {
    const done = await confirmPendingAction(pendingAction)
    const extra = done.cancelled ? '已取消写入。' : done.ok ? '已执行写入：' + JSON.stringify(done.result || {}).slice(0, 200) : '写入失败：' + (done.error || '未知错误')
    full += (full ? '\n\n' : '') + extra
    dialogText.value = full
  }
  if (!full) throw new Error('AI返回为空')
  const plain = full.replace(/[#*`~_]/g, '').replace(/\s+/g, ' ')
  await speakReply(plain)
  return full
}

async function loadRemoteChatHistory() {
  try {
    const r = await fetch('/api/companion/history?agent=xingye', { credentials: 'same-origin' })
    if (!r.ok) return
    const j = await r.json()
    const list = (j.messages || []).slice(-CHAT_HISTORY_MAX).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.text || '').slice(0, 300),
    }))
    if (list.length) { saveChatHistory(list); persistSession() }
  } catch (e) { /* 离线时保留本地记忆 */ }
}

/* ===== 输入模式切换 ===== */
function onSetMode(e) {
  const m = e?.detail?.mode
  if (!m) return
  inputVisible.value = true
  dialogVisible.value = false
  persistentDialog.value = false
  dialogAction.value = null
  stopSpeech()
  clearAutoHide()
  setMode(m)
  showToast(m === 'rag' ? '知识库模式：问我题库/资料里的知识' : 'Agent 模式：给看板娘派任务')
}

function setMode(m) {
  if (mode.value === m) {
    mode.value = 'chat'
  } else {
    mode.value = m
    if (m === 'rag') showToast('知识库问答模式：只检索平台公开资料，不调用 Agent 工具')
    if (m === 'agent') showToast('Agent 模式：调用只读工具；不自动检索知识库，两种模式二选一')
  }
  nextTick(() => {
    inputRef.value?.focus()
    focusEnd()
  })
}

/* ===== 语音输入：手动启停录音 → 后端 ASR（可区分说话人） ===== */
async function toggleMic() {
  if (isRecording.value) {
    stopRecording()
    return
  }
  const SR = window.MediaRecorder
  if (!SR || !navigator.mediaDevices) {
    showToast('当前浏览器不支持录音（请用 Chrome/Edge）')
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => SR.isTypeSupported(t)) || ''
    mediaRecorder = new SR(stream, mime ? { mimeType: mime } : undefined)
    audioChunks = []
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data) }
    mediaRecorder.onstop = onRecordingStop
    mediaRecorder.start()
    isRecording.value = true
    if (!inputVisible.value) {
      inputVisible.value = true
      nextTick(() => { inputRef.value?.focus(); focusEnd() })
    }
    showToast('开始录音，再点 🎤 结束')
  } catch (e) {
    showToast('麦克风权限被拒绝')
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
    mediaRecorder.stream.getTracks().forEach(t => t.stop())
  }
  isRecording.value = false
}

async function onRecordingStop() {
  try {
    const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
    if (blob.size < 1000) {
      showToast('没录到声音，靠近一点再说哦')
      return
    }
    dialogText.value = '正在听你说话...'
    dialogVisible.value = true
    clearAutoHide()
    const form = new FormData()
    form.append('file', blob, 'voice.webm')
    const res = await fetch('/api/ai/asr', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('exam_prep_token') || '') },
      body: form,
    })
    const json = await res.json()
    if (json.code !== 200) throw new Error(json.message || '识别失败')
    const data = json.data || {}
    const text = (data.text || '').trim()
    if (!text) {
      dialogText.value = '没听清呢，再说一遍吧～'
      scheduleAutoHide()
      return
    }
    // 说话人分离展示：不同说话人用不同前缀
    let display = text
    const sentences = Array.isArray(data.sentences) ? data.sentences : []
    const speakers = new Set(sentences.filter(s => s.speaker >= 0).map(s => s.speaker))
    if (speakers.size > 1) {
      display = sentences.map(s => {
        const label = s.speaker >= 0 ? (s.speaker === 0 ? '🗣️甲' : '🗣️乙') : ''
        return (label ? label + '：' : '') + s.text
      }).join('\n')
      await showReplyStreaming('我听到大家这么说：\n' + display, { persistent: true })
    } else {
      await showReplyStreaming('我听到：' + display, { persistent: true })
    }
    // 把识别文本放进输入框，用户确认后发送
    dialogVisible.value = false
    persistentDialog.value = false
    inputVisible.value = true
    nextTick(() => {
      const el = inputRef.value
      if (!el) return
      el.textContent = text.replace(/\n/g, ' ')
      focusEnd()
      autoResize()
    })
  } catch (e) {
    dialogText.value = '语音识别开小差了：' + (e.message || '')
    scheduleAutoHide()
  }
}

/* ===== 摄像头手势彩蛋 ===== */
const gestureCam = ref(null)
const GESTURE_REACTIONS = {
  Thumb_Up: '收到你的赞啦！星野也要给你点赞 👍',
  Victory: '耶！胜利手势！考试必胜～٩(๑>◡<๑)۶',
  Open_Palm: '嗨～看到你啦！星野在挥手 👋',
  Closed_Fist: '握拳加油！我们一起冲鸭！✊',
  ILoveYou: '哇，收到爱意啦！星野也喜欢你 (｡♥‿♥｡)',
  Pointing_Up: '有什么要指示星野的呀？☝️',
}
let gestureOpen = false
function toggleGestureCam() {
  if (!gestureCam.value) return
  if (gestureOpen) {
    gestureCam.value.close()
  } else {
    gestureCam.value.openCam()
  }
  gestureOpen = !gestureOpen
}
function onGestureClose() {
  gestureOpen = false
}
function onGesture(cat) {
  const text = GESTURE_REACTIONS[cat]
  if (!text) return
  stopSpeech()
  clearAutoHide()
  dialogText.value = text
  dialogVisible.value = true
  showReplyStreaming(text)
}

/* ===== 屏幕陪伴：自动连续截帧观察（ScreenWatcher 组件） ===== */
const screenWatcher = ref(null)
const screenWatching = ref(false)

function toggleScreenWatch() {
  if (!screenWatcher.value) return
  if (screenWatching.value) {
    screenWatcher.value.closeWatch()
    screenWatching.value = false
    showToast('屏幕陪伴已关闭')
  } else {
    screenWatcher.value.openWatch()
    screenWatching.value = true
  }
}

function onScreenSummary(text) {
  if (!text) return
  // 交给看板娘气泡展示（不持久，避免刷屏）
  window.dispatchEvent(new CustomEvent('kaoshibang:ai-show', { detail: { text, persistent: false } }))
}

function onScreenError(msg) {
  screenWatching.value = false
  showToast(msg || '屏幕识别结束')
}


/* ===== 气泡队列系统：干活时自动弹气泡 ===== */
const bubbleQueue = []          // 排队等待显示的气泡
const bubbleDedup = new Map()   // text → 上次显示时间戳
let isTypingActive = false      // showReplyStreaming 正在打字时为 true

function showBubble(text, opts = {}) {
  if (!text) return
  const now = Date.now()
  // 去重：同一 text 10 秒内不重复显示
  if (bubbleDedup.has(text) && now - bubbleDedup.get(text) < 10000) return
  bubbleDedup.set(text, now)

  const type = opts.type || 'info'
  const duration = opts.duration || (type === 'success' ? 5000 : type === 'error' ? 8000 : 6000)
  const persistent = !!opts.persistent
  const item = { text, duration, persistent, type }

  // 队列最多排队 3 条，溢出丢弃最旧
  if (bubbleQueue.length >= 3) bubbleQueue.shift()

  if (isTypingActive) {
    bubbleQueue.push(item)
  } else {
    displayBubble(item)
  }
}

function displayBubble(item) {
  dialogText.value = item.text
  dialogVisible.value = true
  persistentDialog.value = item.persistent
  dialogAction.value = null
  noticeActive.value = true   // 通知气泡覆盖工作打字
  if (!item.persistent) {
    clearAutoHide()
    autoHideTimer = setTimeout(() => {
      dialogVisible.value = false
      noticeActive.value = false  // 通知气泡消失，恢复工作打字
      // 当前气泡自动隐藏后，处理队列里下一条
      processBubbleQueue()
    }, item.duration)
  } else {
    // 持久气泡：点击关闭时清除 noticeActive
    // 在 onDialogClick 里处理
  }
}

function processBubbleQueue() {
  if (isTypingActive) return
  if (bubbleQueue.length > 0) {
    const item = bubbleQueue.shift()
    displayBubble(item)
  }
}

// 事件处理函数
function onAiBusy(e) {
  const d = e.detail || {}
  if (d.active) {
    startWorkingBubble(d.tool || '')
  } else {
    stopWorkingBubble()
  }
}
function onActivity(e) {
  const d = e.detail || {}
  showBubble(d.text, { type: d.type, duration: d.duration, persistent: d.persistent })
}
function onUploadDone() {
  showBubble('资料上传好啦，去复习页看看吧～', { type: 'success' })
}
function onQuizCorrect() {
  showBubble('答对啦！继续保持哦～', { type: 'success' })
}
function onQuizWrong() {
  showBubble('这题记到错题本啦，稍后我帮你精讲', { type: 'info', duration: 8000 })
}
function onExamSubmitted() {
  showBubble('模拟考试交卷啦，看看成绩吧！', { type: 'success' })
}
function onFavorited() {
  showBubble('收藏成功，随时可以回顾～', { type: 'success' })
}

/* ===== 流式回复：等 TTS 生成完 → 逐字显示 + 语音同步播放 =====
 * opts.persistent=true 时不自动消失（点击人物才关），opts.action 为气泡动作按钮
 */
async function showReplyStreaming(reply, opts) {
  opts = opts || {}
  persistentDialog.value = !!opts.persistent
  dialogAction.value = opts.action || null
  // 1. 先等语音生成完成（TTS 失败则回退浏览器语音）
  const plain = (reply || '').replace(/[#*`~_]/g, '').replace(/\s+/g, ' ')
  if (opts.speak !== false) await speakReply(plain)
  // 2. 开始逐字打字 + 同步播放语音（语音在生成完成后才开始，和打字同时进行）
  dialogVisible.value = true
  dialogText.value = ''
  typingCancel = false
  isTypingActive = true
  stopWorkingBubble()  // 流式回复开始时停止工作轮播
  // 打字机：一个字一个字蹦出来
  const chars = Array.from(reply)
  for (let i = 0; i < chars.length; i++) {
    if (typingCancel) { isTypingActive = false; processBubbleQueue(); return }
    dialogText.value = chars.slice(0, i + 1).join('')
    await sleep(45)
  }
  isTypingActive = false
  processBubbleQueue()
}

/* 只做 TTS 朗读 + 口型动作，不改动已显示的文字（SSE 流式已实时渲染） */
async function speakReply(plain) {
  // 思考链 / 工具调用动画期间不朗读，避免和状态气泡抢声音
  if (workingActive.value) return
  const cfg = getVoiceConfig()
  let ttsUrl = null
  if (plain) {
    try {
      ttsUrl = await edgeTTSSynthesize(plain, {
        provider: cfg.provider,
        voice: cfg.voice,
        rate: cfg.rate,
        pitch: cfg.pitch,
        instruction: cfg.instruction,
      })
    } catch (e) {
      ttsUrl = null
    }
  }
  if (ttsUrl) {
    const audio = getAudioEl()
    audio.src = ttsUrl
    audio.onplay = () => {
      startMouth()
      triggerTapMotion()
    }
    audio.onended = () => {
      stopMouth()
      restoreMotionSound()
    }
    audio.onerror = () => {
      stopMouth()
      restoreMotionSound()
      fallbackSpeak(plain)
    }
    audio.play().catch(() => {
      restoreMotionSound()
      fallbackSpeak(plain)
    })
  } else if (plain) {
    fallbackSpeak(plain)
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function cancelTyping() {
  typingCancel = true
}

function scheduleAutoHide() {
  clearAutoHide()
  if (persistentDialog.value) return
  autoHideTimer = setTimeout(() => {
    dialogVisible.value = false
    stopSpeech()
  }, 20000)
}

function clearAutoHide() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
}

/* ===== 语音 + 口型动画 ===== */
function getLive2dModel() {
  try {
    const mgr = window.__live2dManager
    if (!mgr) return null
    const m = mgr.getModel(0)
    // setParamFloat 在 Live2D 核心对象 live2DModel 上
    return (m && m.live2DModel) ? m.live2DModel : null
  } catch (e) {
    return null
  }
}

/* ===== 语音（Edge TTS 真人音色 + 口型动画，失败回退浏览器语音） ===== */
let audioEl = null

function getAudioEl() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'auto'
  }
  return audioEl
}

// 触发人物特殊动作（tap_body：点击人物时的点头/挥手等），
// 没有该动作的模型会静默忽略，符合"有的就触发，没有就算了"。
// AI 回答场景：置 MUTE_MOTION_SOUND=true 让动作只播动画、不播人物自带语音，
// 语音只由 TTS 播放（避免两个声音叠加）。
function triggerTapMotion() {
  try {
    if (window.__l2dConfig) window.__l2dConfig.MUTE_MOTION_SOUND = true
    const mgr = window.__live2dManager
    if (!mgr) return
    const m = mgr.getModel(0)
    if (!m || typeof m.startRandomMotion !== 'function') return
    // PRIORITY_FORCE = 4：打断当前 idle，立即播放特殊动作
    m.startRandomMotion('tap_body', 4)
  } catch (e) {
    // 模型不支持则忽略
  }
}

// 恢复动作音效开关（AI 回答语音播完后恢复，平时点击人物的动作音效照常）
function restoreMotionSound() {
  try {
    if (window.__l2dConfig) window.__l2dConfig.MUTE_MOTION_SOUND = false
  } catch (e) {
    /* ignore */
  }
}

// 兜底：浏览器内置语音（免费，pitch 调高近似萝莉音）
function fallbackSpeak(plain) {
  if (!window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(plain)
    utter.lang = 'zh-CN'
    utter.rate = 1.05
    utter.pitch = 1.7
    const voices = window.speechSynthesis.getVoices() || []
    const zh = voices.filter(v => /^zh/i.test(v.lang || ''))
    const favOrder = ['yaoyao', 'xiaoxiao', 'xiaoyi', 'huihui', 'meijia', 'tingting', 'female', '女']
    let chosen = null
    for (const kw of favOrder) {
      chosen = zh.find(v => (v.name || '').toLowerCase().includes(kw))
      if (chosen) break
    }
    if (chosen || zh[0]) utter.voice = chosen || zh[0]
    utter.onstart = () => {
      startMouth()
      triggerTapMotion()
    }
    utter.onend = () => {
      stopMouth()
      restoreMotionSound()
    }
    utter.onerror = () => {
      stopMouth()
      restoreMotionSound()
    }
    window.speechSynthesis.speak(utter)
  } catch (e) {
    // 语音不可用就算了
  }
}

function startMouth() {
  stopMouth()
  const model = getLive2dModel()
  if (!model) return
  // 说话时随机开合嘴巴（PARAM_MOUTH_OPEN_Y），做出说话动画
  mouthTimer = setInterval(() => {
    const v = Math.random() < 0.25 ? 0 : 0.35 + Math.random() * 0.65
    try {
      model.setParamFloat('PARAM_MOUTH_OPEN_Y', v)
    } catch (e) {}
  }, 110)
}

function stopMouth() {
  if (mouthTimer) {
    clearInterval(mouthTimer)
    mouthTimer = null
  }
  const model = getLive2dModel()
  if (model) {
    try {
      model.setParamFloat('PARAM_MOUTH_OPEN_Y', 0)
    } catch (e) {}
  }
}

function stopSpeech() {
  cancelTyping()
  restoreMotionSound()
  if (audioEl) {
    try {
      audioEl.pause()
      audioEl.removeAttribute('src')
      audioEl.load()
    } catch (e) { /* ignore */ }
  }
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel()
    } catch (e) { /* ignore */ }
  }
  stopMouth()
}

onUnmounted(() => {
  clearTimeout(pressTimer)
  clearAutoHide()
  stopProactiveReview()
  stopSpeech()
  window.removeEventListener('zg:pet-model', onPetModelChange)
  window.removeEventListener('kaoshibang:ask-ai', onAskAI)
  window.removeEventListener('zg:agent-bubble', onAgentBubble)
  window.removeEventListener('kaoshibang:wrong-review', onWrongReview)
  window.removeEventListener('kaoshibang:ai-show', onAiShow)
  window.removeEventListener('kaoshibang:proactive-review-toggle', startProactiveReview)
  window.removeEventListener('kaoshibang:activity', onActivity)
  window.removeEventListener('kaoshibang:upload-done', onUploadDone)
  window.removeEventListener('kaoshibang:quiz-correct', onQuizCorrect)
  window.removeEventListener('kaoshibang:quiz-wrong', onQuizWrong)
  window.removeEventListener('kaoshibang:exam-submitted', onExamSubmitted)
  window.removeEventListener('kaoshibang:favorited', onFavorited)
  window.removeEventListener('kaoshibang:ai-busy', onAiBusy)
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
  window.removeEventListener('touchmove', onPointerMove)
  window.removeEventListener('touchend', onPointerUp)
  window.removeEventListener('touchcancel', onPointerUp)
})
</script>

<style scoped>
.live2d-pet-container {
  position: fixed;
  left: calc(16px + var(--pet-offset, 0px));
  bottom: 16px;
  bottom: calc(62px + env(safe-area-inset-bottom));
  right: 10px;
  z-index: 9990;
  user-select: none;
  -webkit-user-select: none;
}

.pet-canvas-wrap {
  cursor: grab;
  position: relative;
  /* 参赛版：轻微缩小并贴右下角，减少对操作区的遮挡 */
  transform: scale(0.9);
  transform-origin: bottom right;
}

.pet-canvas-wrap:active {
  cursor: grabbing;
}

/* 换装按钮 */
.pet-wardrobe {
  position: absolute;
  z-index: 3;
  top: -8px;
  right: -4px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #e6e6f0;
  background: rgba(255, 255, 255, 0.92);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(80, 90, 180, 0.18);
  transition: transform 0.15s;
}

.pet-wardrobe:hover {
  background: #fff;
  transform: scale(1.1);
}

.live2d-canvas {
  display: block;
  position: relative;
  z-index: 1;
  -webkit-user-drag: none;
  background: transparent;
}

.pet-loading-avatar {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: bottom center;
  z-index: 0;
  pointer-events: none;
  filter: drop-shadow(0 8px 18px rgba(30, 22, 55, 0.18));
}

/* 对话气泡 */
.pet-dialog {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  max-width: 260px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #e6e6f0;
  border-radius: 14px;
  box-shadow: 0 6px 20px rgba(80, 90, 180, 0.15);
  opacity: 0;
  visibility: hidden;
  transform: translateY(6px);
  transition: opacity 0.25s, transform 0.25s, visibility 0.25s;
  pointer-events: none;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
}

.pet-dialog.show {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  z-index: 10;
}

.pet-dialog-text {
  max-height: 180px;
  overflow-y: auto;
}

/* 持久气泡：带高亮边框 + 不自动消失 */
.pet-dialog.pinned {
  border-color: #9d7bff;
  box-shadow: 0 6px 22px rgba(157, 123, 255, 0.28);
  pointer-events: auto;
  cursor: pointer;
}

.pet-dialog-pin {
  position: absolute;
  top: -7px;
  right: 10px;
  font-size: 14px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
}

.pet-dialog-action {
  display: block;
  margin: 8px auto 0;
  padding: 5px 16px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #6c8cff, #9d7bff);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(108, 140, 255, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}
.pet-dialog-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(108, 140, 255, 0.5);
}

.pet-dialog-tail {
  position: absolute;
  top: 100%;
  right: 24px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid #fff;
  filter: drop-shadow(0 2px 1px rgba(80, 90, 180, 0.08));
}

/* 输入框（.norem：固定物理像素，避免 rem 适配放大字号/光标） */
.pet-input-box {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  opacity: 0;
  visibility: hidden;
  transform: translateY(6px);
  transition: opacity 0.25s, transform 0.25s, visibility 0.25s;
}

.pet-input-box.show {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.norem.pet-input {
  display: inline-block;
  min-width: 120px;
  max-width: 300px;
  min-height: 36px;
  max-height: 140px;
  padding: 8px 14px;
  border: 2px solid #6c8cff;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
  outline: none;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 4px 16px rgba(80, 90, 180, 0.18);
  white-space: pre;
  overflow-x: hidden;
  overflow-y: hidden;
  box-sizing: border-box;
  text-align: left;
  cursor: text;
  word-break: break-word;
}

.norem.pet-input:empty::before {
  content: attr(data-placeholder);
  color: #b0b3c0;
  pointer-events: none;
}

.norem.pet-input:focus {
  border-color: #2c3e6b;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

/* 待发送图片 */
.pet-img-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #e0e0f0;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(80, 90, 180, 0.12);
  font-size: 11px;
  color: #5a5f75;
}
.pet-img-chip img { width: 38px; height: 38px; object-fit: cover; border-radius: 8px; flex: 0 0 auto; }
.pet-file-chip { align-items: center; }
.pet-file-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pet-file-chip small { color: #8a7ba0; font-size: 9px; flex: none; }
.pet-img-chip span { flex: 1; min-width: 0; line-height: 1.35; }
.pet-img-chip button { flex: 0 0 auto; border: 0; background: #eef1ff; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; }

/* ===== 输入工具栏（语音/说话人/知识库/Agent） ===== */
.pet-input-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  justify-content: flex-end;
}

.pet-tool-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid #e0e0f0;
  background: rgba(255, 255, 255, 0.96);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(80, 90, 180, 0.12);
  transition: transform 0.15s, background 0.15s, box-shadow 0.2s;
}
.pet-tool-btn:hover { transform: translateY(-1px); background: #fff; }
.pet-tool-btn.on {
  background: #eef1ff;
  border-color: #6c8cff;
  box-shadow: 0 0 0 3px rgba(108, 140, 255, 0.18);
}
.pet-tool-btn.recording {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: #fff;
  animation: pet-mic-pulse 1.1s ease-in-out infinite;
}
@keyframes pet-mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.5); }
  50% { box-shadow: 0 0 0 8px rgba(255, 77, 79, 0); }
}

.pet-mode-tag {
  font-size: 12px;
  color: #6c8cff;
  background: #eef1ff;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}

.pet-rec-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #ff4d4f;
  text-align: right;
}

/* ===== 拖拽高亮 ===== */
.pet-drag-over .pet-canvas-wrap {
  outline: 3px dashed #6c8cff;
  outline-offset: 6px;
  border-radius: 16px;
}
.pet-drag-over::after {
  content: '松开交给我 📥';
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  background: #6c8cff;
  color: #fff;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 12px;
  white-space: nowrap;
  animation: pet-drag-bounce 0.8s ease-in-out infinite;
}
@keyframes pet-drag-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@media screen and (max-width: 768px) {
  .live2d-pet-container {
    bottom: calc(58px + env(safe-area-inset-bottom));
    right: 6px;
  }

  .live2d-canvas {
    width: 118px;
    height: 146px;
  }

  .pet-dialog {
    max-width: 220px;
    font-size: 13px;
  }
}

/* 工作态气泡：等宽蓝字 + 光标闪烁 */
.pet-dialog.working {
  border-color: #b8ccf0;
}
.pet-dialog.working .pet-dialog-text {
  font-family: var(--font-mono, 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace);
  color: #3b6fd4;
  text-align: left;
  font-size: 13px;
  line-height: 1.7;
  max-height: 4.8em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.pet-working-cursor {
  display: inline;
  animation: pet-cursor-blink 900ms step-end infinite;
  color: #3b6fd4;
  font-weight: bold;
}

@keyframes pet-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>

<!--
  chip 样式放非 scoped 块：chip 由 JS 动态创建，不带 Vue scoped 的 data-v 属性，
  scoped 规则无法命中；这里用 .norem 前缀同时避开 postcss-pxtorem 的 rem 转换。
-->
<style>
.norem .pet-token {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  position: relative;
  margin: 0 3px;
  padding: 1px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #6c8cff, #9d7bff);
  box-shadow: 0 2px 6px rgba(108, 140, 255, 0.35);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  vertical-align: middle;
  white-space: nowrap;
  transform: translateY(-4px);
  transition: transform 0.15s, box-shadow 0.15s;
}

.norem .pet-token:hover {
  transform: translateY(-5px);
  box-shadow: 0 3px 10px rgba(108, 140, 255, 0.5);
}

.norem .pet-token-emoji {
  font-size: 13px;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.15));
}
</style>
