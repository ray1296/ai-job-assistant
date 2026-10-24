<template>
  <div v-if="open" class="gesture-cam" @click.self="close">
    <div class="gc-panel">
      <div class="gc-head">
        <span class="gc-title">📷 手势彩蛋</span>
        <span class="gc-hint">比个手势试试：✌️ 👍 👋 🤟 ✊ ☝️</span>
        <button class="gc-close" @click="close">✕</button>
      </div>
      <video ref="videoRef" class="gc-video" autoplay playsinline muted></video>
      <div class="gc-status" :class="{ ready: modelReady }">
        {{ modelReady ? '🟢 识别中：' + lastGesture : '⏳ 正在加载手势模型…' }}
      </div>
      <p class="gc-note">摄像头画面只在本机处理，不上传任何数据（模型运行在浏览器本地）</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted, nextTick } from 'vue'

const emit = defineEmits(['gesture', 'close'])

const open = ref(false)
const videoRef = ref(null)
const modelReady = ref(false)
const lastGesture = ref('—')
let stream = null
let recognizer = null
let rafId = null
let lastTrigger = 0
let stableCount = 0
let stableGesture = 'None'
let running = false
let lastVideoTime = -1

const GESTURE_LABELS = {
  Thumb_Up: '👍 点赞',
  Victory: '✌️ 胜利',
  Open_Palm: '👋 你好',
  Closed_Fist: '✊ 握拳',
  ILoveYou: '🤟 爱你',
  Pointing_Up: '☝️ 有话说',
  None: '没有手势',
}

async function openCam() {
  open.value = true
  modelReady.value = false
  lastGesture.value = '—'
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: { ideal: 15 } } })
    await nextTick()
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      // 防御：play 卡死时超时继续（部分环境 video.play 永不 resolve）
      await Promise.race([
        videoRef.value.play(),
        new Promise(r => setTimeout(r, 3000)),
      ])
    }
    // 防御：模型加载 20s 超时兜底
    await Promise.race([
      initModel(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('模型加载超时')), 20000)),
    ])
    loop()
  } catch (e) {
    close()
    alert('无法打开摄像头：' + (e?.message || '权限被拒绝'))
  }
}

async function initModel() {
  // 运行时从后端静态目录加载（变量形式避免 Vite 构建期解析）
  const bundleUrl = '/mediapipe/vision_bundle.mjs'
  const { FilesetResolver, GestureRecognizer } = await import(/* @vite-ignore */ bundleUrl)
  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/mediapipe/gesture_recognizer.task',
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  })
  modelReady.value = true
}

function loop() {
  if (!open.value) return
  rafId = requestAnimationFrame(loop)
  const video = videoRef.value
  if (!video || video.readyState < 2) return
  if (video.currentTime === lastVideoTime) return
  lastVideoTime = video.currentTime
  if (!recognizer) return
  if (running) return
  running = true
  try {
    const result = recognizer.recognizeForVideo(video, performance.now())
    const cat = result.gestures?.[0]?.[0]?.categoryName || 'None'
    lastGesture.value = GESTURE_LABELS[cat] || cat
    // 去抖：连续 3 帧同一手势才触发，冷却 1.6s
    if (cat !== 'None') {
      if (cat === stableGesture) {
        stableCount++
        if (stableCount === 3 && Date.now() - lastTrigger > 1600) {
          lastTrigger = Date.now()
          emit('gesture', cat)
        }
      } else {
        stableGesture = cat
        stableCount = 1
      }
    } else {
      stableGesture = 'None'
      stableCount = 0
    }
  } catch (e) { /* 单帧失败忽略 */ }
  running = false
}

function close() {
  open.value = false
  stableGesture = 'None'
  stableCount = 0
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    stream = null
  }
  recognizer = null
  modelReady.value = false
  emit('close')
}

onUnmounted(close)

defineExpose({ openCam, close })
</script>

<style scoped>
.gesture-cam {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.gc-panel {
  background: #fff; border-radius: 16px; padding: 14px;
  width: min(92vw, 380px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
}
.gc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.gc-title { font-weight: 700; font-size: 15px; color: #333; }
.gc-hint { font-size: 11px; color: #999; flex: 1; }
.gc-close {
  width: 26px; height: 26px; border-radius: 50%; border: none;
  background: #f0f0f5; cursor: pointer; font-size: 13px; color: #666;
}
.gc-video {
  width: 100%; border-radius: 12px; background: #111;
  transform: scaleX(-1); /* 镜像，像照镜子 */
}
.gc-status {
  margin-top: 10px; font-size: 13px; color: #999; text-align: center;
  padding: 8px; border-radius: 10px; background: #f7f7fb;
}
.gc-status.ready { color: #2e9e5b; background: #eef9f2; font-weight: 600; }
.gc-note { font-size: 11px; color: #bbb; text-align: center; margin-top: 8px; }
</style>
