<template>
  <div v-if="watching" class="screen-watcher">
    <div class="sw-panel">
      <div class="sw-head">
        <span class="sw-dot" :class="{ busy: analyzing }"></span>
        <span class="sw-title">🖥️ 星野在看当前画面</span>
        <button class="sw-close" title="停止观察" @click="closeWatch">✕</button>
      </div>
      <div class="sw-status">{{ analyzing ? '🔍 正在描述当前画面…' : '👀 观察中 · 每 5~10 分钟看 3 帧，只描述不预测' }}</div>
      <div v-if="summary" class="sw-summary">{{ summary }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'

/**
 * 屏幕观察者：共享屏幕后自动连续截帧（3 帧一组，随机 5~10 分钟一组），
 * 交给后端 qwen-vl 分析用户当前在做什么，摘要通过 summary 事件抛给父组件。
 * 截图全程内存 blob，不落盘；关闭即释放。
 */
const emit = defineEmits(['summary', 'error'])

const watching = ref(false)
const analyzing = ref(false)
const summary = ref('')

let stream = null
let videoEl = null
let canvas = null
let timerId = null
let closed = false
let lastEncourageAt = 0
try { lastEncourageAt = Number(localStorage.getItem("zg.screenEncourageAt") || 0) || 0 } catch {}
const MIN_INTERVAL = 300000
const MAX_INTERVAL = 600000
const FRAME_GAP_MS = 2500
const ENCOURAGE_COOLDOWN = 8 * 60 * 1000

function randInterval() {
  return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function openWatch() {
  if (watching.value) return
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    emit('error', '当前浏览器不支持屏幕共享（请用桌面端 Chrome/Edge）')
    return
  }
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false })
    // 用户在浏览器自带的共享提示条上点"停止共享"时自动收尾
    stream.getVideoTracks().forEach(t => t.addEventListener('ended', closeWatch))
  } catch (e) {
    const name = e && e.name
    if (name === 'NotAllowedError') emit('error', '你取消了屏幕共享')
    else emit('error', '无法开始屏幕共享：' + ((e && e.message) || '未知错误'))
    return
  }

  videoEl = document.createElement('video')
  videoEl.muted = true
  videoEl.srcObject = stream
  try {
    await Promise.race([videoEl.play(), new Promise(r => setTimeout(r, 3000))])
  } catch (e) { /* 播放失败不阻断，抓帧时再判断 readyState */ }
  canvas = document.createElement('canvas')

  watching.value = true
  closed = false
  scheduleNext()
}

function scheduleNext() {
  if (!watching.value || closed) return
  timerId = setTimeout(captureBatch, randInterval())
}

async function captureBatch() {
  if (!watching.value || closed) return
  // 视频流还没出画面：3 秒后重试，不浪费请求
  if (!videoEl || videoEl.readyState < 2) {
    timerId = setTimeout(captureBatch, 3000)
    return
  }
  analyzing.value = true
  const blobs = []
  try {
    for (let i = 0; i < 3; i++) {
      if (i > 0) await sleep(FRAME_GAP_MS)
      if (!watching.value || closed) break
      const blob = await grabFrame()
      if (blob) blobs.push(blob)
    }
    if (blobs.length > 0 && watching.value && !closed) {
      await sendFrames(blobs)
    }
  } catch (e) {
    emit('error', '屏幕分析失败：' + ((e && e.message) || '未知错误'))
  } finally {
    // 立即释放 blob 引用，交给 GC（全程不落盘）
    blobs.length = 0
    analyzing.value = false
    if (watching.value && !closed) scheduleNext()
  }
}

function grabFrame() {
  const vw = videoEl.videoWidth || 1280
  const vh = videoEl.videoHeight || 720
  const scale = Math.min(1, 1280 / vw)
  canvas.width = Math.max(1, Math.round(vw * scale))
  canvas.height = Math.max(1, Math.round(vh * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.75))
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader()
    rd.onload = () => resolve(String(rd.result || ''))
    rd.onerror = () => reject(new Error('读取截图失败'))
    rd.readAsDataURL(blob)
  })
}

async function sendFrames(blobs) {
  const images = []
  for (const b of blobs) images.push(await blobToDataUrl(b))
  const res = await fetch('/api/ai/vision-frames', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.__zgCsrf || '' },
    body: JSON.stringify({
      images,
      question: '这是用户屏幕连续3帧（间隔2.5秒）。只输出 JSON：{"observe":"一句话描述当前画面","encourage":"一句不超过40字的星野式鼓励；如果用户正在学习、求职、认真工作或明显卡住，才给；否则为空"}。不要输出 JSON 之外的文字，不要猜隐私。',
    }),
  })
  const json = await res.json()
  if (json.code !== 200) throw new Error(json.message || '分析失败')
  const raw = String((json.data && json.data.description) || '').trim().replace(/^```(?:json)?/, '').replace(/```$/, '').trim()
  let data = null
  try { data = JSON.parse(raw) } catch {}
  const observe = data?.observe ? String(data.observe).trim() : ''
  const encourage = data?.encourage ? String(data.encourage).trim().slice(0, 60) : ''
  const now = Date.now()
  // 只有模型判断值得鼓励，且距离上次鼓励至少 8 分钟，才弹一次；否则只更新状态，不打扰。
  if (observe) summary.value = observe
  if (encourage && now - lastEncourageAt >= ENCOURAGE_COOLDOWN) {
    const text = encourage.startsWith('星野') ? encourage : '星野：' + encourage
    summary.value = text
    lastEncourageAt = now
    try { localStorage.setItem('zg.screenEncourageAt', String(now)) } catch {}
    emit('summary', text)
  }
}

function closeWatch() {
  closed = true
  if (timerId) { clearTimeout(timerId); timerId = null }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
  if (videoEl) { videoEl.srcObject = null; videoEl = null }
  canvas = null
  analyzing.value = false
  watching.value = false
}

onUnmounted(closeWatch)

defineExpose({ openWatch, closeWatch, watching })
</script>

<style scoped>
.screen-watcher {
  position: fixed;
  right: 12px;
  bottom: 158px;
  z-index: 9995;
  pointer-events: auto;
}
.sw-panel {
  width: 230px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #e3e6f2;
  border-radius: 14px;
  padding: 10px 12px;
  box-shadow: 0 10px 32px rgba(80, 90, 180, 0.2);
  backdrop-filter: blur(8px);
  animation: sw-in 0.3s ease both;
}
@keyframes sw-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.sw-head {
  display: flex;
  align-items: center;
  gap: 7px;
}
.sw-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4ade80;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.18);
}
.sw-dot.busy {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
  animation: sw-blink 1s ease-in-out infinite;
}
@keyframes sw-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.sw-title {
  flex: 1;
  font-size: 12.5px;
  font-weight: 700;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sw-close {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: #f0f0f5;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.sw-close:hover { background: #e6e6f0; }
.sw-status {
  margin-top: 7px;
  font-size: 11px;
  color: #999;
}
.sw-summary {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.6;
  color: #555;
  background: #f7f8fd;
  border-radius: 10px;
  padding: 8px 10px;
  max-height: 88px;
  overflow-y: auto;
  word-break: break-word;
}
</style>
