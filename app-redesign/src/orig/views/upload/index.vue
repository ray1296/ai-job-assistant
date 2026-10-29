<template>
  <div class="page upload-page">
    <!-- 主题化Header -->
    <div class="page-header upload-header">
      <h1>上传中心</h1>
      <p>粘贴资料，自动生成知识点和题目</p>
    </div>

    <div class="content-card">
      <!-- 类型选择 -->
      <div class="upload-type-toggle">
        <button class="type-btn" :class="{ active: uploadType === 'knowledge' }" @click="uploadType = 'knowledge'">
          <van-icon name="bookmark-o" size="20" />
          上传知识点
        </button>
        <button class="type-btn" :class="{ active: uploadType === 'questions' }" @click="uploadType = 'questions'">
          <van-icon name="question-o" size="20" />
          上传题库
        </button>
      </div>

      <!-- 上传知识点表单 -->
      <div v-if="uploadType === 'knowledge'" class="form-section">
        <van-form @submit="handleKnowledgeUpload">
          <van-cell-group inset>
            <van-field name="subjectId" label="所属科目" required>
              <template #input>
                <select v-model="knowledgeForm.subjectId" class="select-field" @change="onSubjectChange(knowledgeForm.subjectId)">
                  <option value="">请选择科目</option>
                  <option v-for="s in userStore.subjects" :key="s.id" :value="s.id">
                    {{ s.icon }} {{ s.name }}
                  </option>
                </select>
              </template>
            </van-field>
            <van-field name="versionId" label="复习版本" required>
              <template #input>
                <div class="version-select-wrap">
                  <select v-model="knowledgeForm.versionId" class="select-field">
                    <option value="">请选择版本</option>
                    <option v-for="v in versionList" :key="v.id" :value="v.id">{{ v.name }} ({{ v.questionCount }}题/{{ v.cardCount }}卡)</option>
                  </select>
                  <button type="button" class="version-new-btn" @click="showNewVersion = true; newVersionSubjectId = knowledgeForm.subjectId">+ 新建</button>
                </div>
              </template>
            </van-field>
            <van-field
              v-model="knowledgeForm.title"
              label="标题"
              placeholder="如：第三章 知识点汇总"
            />
          </van-cell-group>

          <!-- 格式示例 -->
          <div class="format-example">
            <div class="format-header" @click="showKnowledgeFormat = !showKnowledgeFormat">
              <van-icon name="question-o" />
              <span>数据格式示例</span>
              <van-icon :name="showKnowledgeFormat ? 'arrow-up' : 'arrow-down'" class="format-arrow" />
            </div>
            <transition name="slide-down">
              <div v-show="showKnowledgeFormat" class="format-body">
                <p class="format-tip">每行一个知识点，格式：标题 | 完整答案 | 简化答案（可选）</p>
                <pre class="format-code">机器学习的定义 | 机器学习是研究计算机怎样模拟人类学习活动的学科，包括监督学习、无监督学习和强化学习等 | 研究计算机模拟人类学习的学科
监督学习 | 从有标注的训练数据中学习输入到输出的映射关系 | 从有标注数据学习映射关系
无监督学习 | 从无标注数据中发现隐藏结构和模式 | 从无标注数据发现结构模式</pre>
                <p class="format-tip">也支持JSON格式（每行一个JSON对象）：</p>
                <pre class="format-code">{"title":"过拟合","content":"模型在训练集上表现好但泛化能力差","quickAnswer":"训练集好但泛化差"}
{"title":"正则化","content":"通过惩罚复杂模型防止过拟合","quickAnswer":"惩罚复杂模型防过拟合"}</pre>
                <p class="format-tip">字段说明：content=完整答案，quickAnswer=简化答案（可选，没有可以不填）</p>
              </div>
            </transition>
          </div>

          <van-cell-group inset>
            <van-field
              v-model="knowledgeForm.content"
              type="textarea"
              label="知识点内容"
              placeholder="按格式粘贴知识点数据，每行一个知识点"
              rows="8"
              autosize
              :rules="[{ required: true, message: '请输入知识点内容' }]"
            />
          </van-cell-group>

          <!-- 文件上传 + AI识别 -->
          <div class="file-upload-area">
            <input type="file" ref="knowledgeFileInput" accept=".txt,.json,.md,.docx,.pdf" style="display:none" @change="handleKnowledgeFile" />
            <van-button round block plain type="primary" size="small" :loading="knowledgeFileLoading" @click="$refs.knowledgeFileInput.click()">
              📎 从文件导入（Word/PDF/TXT）
            </van-button>
            <span class="file-hint">支持 .docx / .pdf / .txt / .md / .json</span>
          </div>

          <!-- AI智能识别 -->
          <div class="option-box">
            <div class="ai-recognize-box">
              <button type="button" class="zg-ai-btn" :disabled="aiRecognizeLoading" @click="handleAiRecognize">
                🤖 {{ aiRecognizeLoading ? '识别中…' : 'AI 智能识别' }}
              </button>
              <span class="option-desc">输入≤3000字，AI自动提取知识点</span>
            </div>
            <div v-if="aiRecognizeResult.length" class="ai-recognize-result">
              <div class="ai-result-header">AI识别结果（点击应用到输入框）</div>
              <div v-for="(item, idx) in aiRecognizeResult" :key="idx" class="ai-result-item" @click="applyRecognizeItem(item)">
                <span class="ai-result-title">{{ item.title }}</span>
                <span class="ai-result-content">{{ item.content }}</span>
                <span v-if="item.quickAnswer" class="ai-result-quick">[简: {{ item.quickAnswer }}]</span>
                <button class="ask-ai-btn" @click.stop="askPointAI(item)">🤖 问问AI</button>
              </div>
              <van-button round plain type="primary" size="mini" @click="applyAllRecognize">全部应用</van-button>
            </div>
          </div>

          <!-- 智能出题选项 -->
          <div class="option-box">
            <van-checkbox v-model="knowledgeForm.generateQuiz" shape="square">
              <span class="option-label">🤖 智能出题</span>
              <span class="option-desc">AI根据知识点自动生成题目（取前10个知识点）</span>
            </van-checkbox>
          </div>

          <div class="auto-tip">
            <van-icon name="info-o" />
            <span>上传后自动制作翻转卡片，方便记忆</span>
          </div>

          <div class="form-btn">
            <van-button round block type="primary" native-type="submit" :loading="loading" loading-text="上传中...">
              上传知识点
            </van-button>
          </div>
        </van-form>
      </div>

      <!-- 上传题库表单 -->
      <div v-else class="form-section">
        <!-- 题型子Tab -->
        <div class="question-type-tabs">
          <button
            v-for="t in questionTypes"
            :key="t.value"
            class="qtype-btn"
            :class="{ active: questionType === t.value }"
            @click="questionType = t.value"
          >
            {{ t.icon }} {{ t.label }}
          </button>
        </div>

        <van-form @submit="handleQuestionsUpload">
          <van-cell-group inset>
            <van-field name="subjectId" label="所属科目" required>
              <template #input>
                <select v-model="questionsForm.subjectId" class="select-field" @change="onSubjectChange(questionsForm.subjectId)">
                  <option value="">请选择科目</option>
                  <option v-for="s in userStore.subjects" :key="s.id" :value="s.id">
                    {{ s.icon }} {{ s.name }}
                  </option>
                </select>
              </template>
            </van-field>
            <van-field name="versionId" label="复习版本" required>
              <template #input>
                <div class="version-select-wrap">
                  <select v-model="questionsForm.versionId" class="select-field">
                    <option value="">请选择版本</option>
                    <option v-for="v in versionList" :key="v.id" :value="v.id">{{ v.name }} ({{ v.questionCount }}题/{{ v.cardCount }}卡)</option>
                  </select>
                  <button type="button" class="version-new-btn" @click="showNewVersion = true; newVersionSubjectId = questionsForm.subjectId">+ 新建</button>
                </div>
              </template>
            </van-field>
            <van-field
              v-model="questionsForm.title"
              label="标题"
              :placeholder="currentTypePlaceholder"
            />
          </van-cell-group>

          <!-- 格式示例 -->
          <div class="format-example">
            <div class="format-header" @click="showQuestionsFormat = !showQuestionsFormat">
              <van-icon name="question-o" />
              <span>{{ currentTypeLabel }}格式示例</span>
              <van-icon :name="showQuestionsFormat ? 'arrow-up' : 'arrow-down'" class="format-arrow" />
            </div>
            <transition name="slide-down">
              <div v-show="showQuestionsFormat" class="format-body">
                <!-- 选择题 -->
                <template v-if="questionType === 'choice'">
                  <p class="format-tip">单选题格式（用 | 分隔）：</p>
                  <pre class="format-code">题干 | A选项|B选项|C选项|D选项 | A | 解析</pre>
                  <p class="format-tip">JSON格式：</p>
                  <pre class="format-code">{"stem":"题目","options":["A","B","C","D"],"answer":"A","analysis":"解析"}</pre>
                </template>

                <!-- 判断题 -->
                <template v-else-if="questionType === 'judge'">
                  <p class="format-tip">判断题格式（A=正确，B=错误）：</p>
                  <pre class="format-code">题干 | A | 解析说明</pre>
                  <p class="format-tip">JSON格式：</p>
                  <pre class="format-code">{"stem":"判断题干","answer":"A","analysis":"解析"}</pre>
                </template>

                <!-- 简答题 -->
                <template v-else-if="questionType === 'short'">
                  <p class="format-tip">简答题格式（用 | 分隔）：</p>
                  <pre class="format-code">题干 | 完整答案 | 简化答案 | 解析（可选）</pre>
                  <p class="format-tip">简化答案可以不填，留空即可：</p>
                  <pre class="format-code">简述什么是瀑布模型 | 瀑布模型是线性顺序的开发模型，按阶段依次进行 | 线性顺序开发模型</pre>
                  <p class="format-tip">JSON格式（quickAnswer可选）：</p>
                  <pre class="format-code">{"stem":"简答题干","answer":"完整答案","quickAnswer":"简化答案","analysis":"解析"}</pre>
                </template>

                <!-- 代码填空 -->
                <template v-else-if="questionType === 'code_fill'">
                  <p class="format-tip">代码填空题使用JSON格式（每题一个JSON对象）：</p>
                  <pre class="format-code">{"stem":"题目描述","code":"代码中用____表示空格","blanks":["空1说明","空2说明"],"options":[["选项A","选项B"],["选项C","选项D"]],"answers":[0,1],"analysis":"解析"}</pre>
                  <p class="format-tip">字段说明：</p>
                  <ul class="format-list">
                    <li><b>stem</b>: 题目标题/描述</li>
                    <li><b>code</b>: 代码内容，空白处用 ____ 表示</li>
                    <li><b>blanks</b>: 每个空白的说明文字（数组）</li>
                    <li><b>options</b>: 每个空白的选项（二维数组）</li>
                    <li><b>answers</b>: 正确答案索引（数组，从0开始）</li>
                    <li><b>analysis</b>: 答案解析（可选）</li>
                  </ul>
                </template>
              </div>
            </transition>
          </div>

          <van-cell-group inset>
            <van-field
              v-model="questionsForm.content"
              type="textarea"
              label="题目内容"
              :placeholder="currentTypeTextPlaceholder"
              rows="8"
              autosize
              :rules="[{ required: true, message: '请输入题目内容' }]"
            />
          </van-cell-group>

          <!-- 文件上传 -->
          <div class="file-upload-area">
            <input type="file" ref="questionsFileInput" accept=".txt,.json,.md,.docx,.pdf" style="display:none" @change="handleQuestionsFile" />
            <van-button round block plain type="primary" size="small" :loading="questionsFileLoading" @click="$refs.questionsFileInput.click()">
              📎 从文件导入（Word/PDF/TXT）
            </van-button>
            <span class="file-hint">支持 .docx / .pdf / .txt / .md / .json</span>
          </div>

          <!-- AI智能识别题目 -->
          <div class="option-box">
            <div class="ai-recognize-box">
              <button type="button" class="zg-ai-btn" :disabled="aiQuestionRecognizeLoading" @click="handleAiQuestionRecognize">
                🤖 AI智能识别题目
              </van-button>
              <span class="option-desc">输入≤3000字，AI生成1道{{ currentTypeLabel }}</span>
            </div>
            <div v-if="aiQuestionResult" class="ai-recognize-result">
              <div class="ai-result-header">AI识别结果（点击应用到输入框）</div>
              <div class="ai-result-item" @click="applyAiQuestion">
                <span class="ai-result-title">{{ aiQuestionResult.stem }}</span>
                <span v-if="aiQuestionResult.options && aiQuestionResult.options.length" class="ai-result-content">
                  选项：{{ aiQuestionResult.options.join(' / ') }}
                </span>
                <span v-if="aiQuestionResult.answer !== undefined" class="ai-result-quick">[答案: {{ aiQuestionResult.answer }}]</span>
                <button class="ask-ai-btn" @click.stop="askAiQuestionAI">🤖 问问AI</button>
              </div>
              <van-button round plain type="primary" size="mini" @click="applyAiQuestion">应用题目</van-button>
            </div>
          </div>

          <div class="form-btn">
            <van-button round block type="primary" native-type="submit" :loading="loading" loading-text="上传中...">
              上传{{ currentTypeLabel }}
            </van-button>
          </div>
        </van-form>
      </div>

      <!-- 新建科目 -->
      <div class="new-subject-section">
        <div class="section-title">没有科目？新建一个</div>
        <van-cell-group inset>
          <van-field v-model="newSubject.name" placeholder="科目名称（如：高等数学）" />
          <van-field v-model="newSubject.icon" placeholder="图标emoji（如：📐）" />
        </van-cell-group>
        <div class="form-btn">
          <van-button round block plain type="primary" @click="addSubject">添加科目</van-button>
        </div>
      </div>
    </div>

    <!-- 新建版本弹窗 -->
    <div class="version-modal" :class="{ show: showNewVersion }" @click.self="showNewVersion = false">
      <div class="version-modal-content">
        <div class="version-modal-header">
          <h3>新建复习版本</h3>
          <button class="modal-close" @click="showNewVersion = false">&times;</button>
        </div>
        <div class="version-modal-body">
          <input v-model="newVersionName" placeholder="版本名称（如：第二次考试）" class="version-input" />
          <div class="version-modal-actions">
            <van-button round block type="primary" @click="handleCreateVersion">创建</van-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 版本管理弹窗 -->
    <div class="version-modal" :class="{ show: showVersionManage }" @click.self="showVersionManage = false">
      <div class="version-modal-content">
        <div class="version-modal-header">
          <h3>管理版本</h3>
          <button class="modal-close" @click="showVersionManage = false">&times;</button>
        </div>
        <div class="version-modal-body">
          <div v-if="versionList.length === 0" class="version-empty">暂无版本</div>
          <div v-for="v in versionList" :key="v.id" class="version-manage-item">
            <div class="version-manage-info">
              <span class="version-name">{{ v.name }}</span>
              <span class="version-stats">{{ v.questionCount }}题 / {{ v.cardCount }}卡</span>
            </div>
            <div class="version-manage-actions">
              <button class="version-edit-btn" @click="startRename(v)">改名</button>
              <button class="version-del-btn" @click="handleDeleteVersion(v)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 重命名弹窗 -->
    <div class="version-modal" :class="{ show: showRename }" @click.self="showRename = false">
      <div class="version-modal-content">
        <div class="version-modal-header">
          <h3>修改版本名称</h3>
          <button class="modal-close" @click="showRename = false">&times;</button>
        </div>
        <div class="version-modal-body">
          <input v-model="renameValue" placeholder="新的版本名称" class="version-input" />
          <div class="version-modal-actions">
            <van-button round block type="primary" @click="handleRename">保存</van-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from "vue-router"
import { showToast, showConfirmDialog } from 'vant'
import { useUserStore } from '../../stores/userStore'
import { uploadKnowledge, uploadQuestions, parseFile, getVersionList, createVersion, renameVersion, deleteVersion } from '../../api/material'
import { aiRecognize, aiGenerateQuiz, aiRecognizeQuestion } from '../../api/ai'
import { askAI } from '../../utils/askAI'

defineOptions({ name: 'UploadCenter' })

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const uploadType = ref('knowledge')
const questionType = ref('choice')
const showKnowledgeFormat = ref(false)
const showQuestionsFormat = ref(false)
const knowledgeFileInput = ref(null)
const questionsFileInput = ref(null)
const knowledgeFileLoading = ref(false)
const questionsFileLoading = ref(false)
const aiRecognizeLoading = ref(false)
const aiRecognizeResult = ref([])
const aiQuestionRecognizeLoading = ref(false)
const aiQuestionResult = ref(null)

// 判断是否需要后端解析的文件类型
function needsBackendParse(filename) {
  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase()
  return ['docx', 'doc', 'pdf'].includes(ext)
}

// 纯文本文件前端直接读取
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = e => reject(e)
    reader.readAsText(file, 'UTF-8')
  })
}

async function handleKnowledgeFile(e) {
  const file = e.target.files[0]
  if (!file) return
  knowledgeFileLoading.value = true
  try {
    if (needsBackendParse(file.name)) {
      const res = await parseFile(file)
      knowledgeForm.content = (res.data.content || '').trim()
    } else {
      const text = await readTextFile(file)
      knowledgeForm.content = text.trim()
    }
    showToast(`已导入文件：${file.name}`)
  } catch (err) {
    showToast(err.message || '文件读取失败')
  }
  knowledgeFileLoading.value = false
  e.target.value = ''
}

async function handleQuestionsFile(e) {
  const file = e.target.files[0]
  if (!file) return
  questionsFileLoading.value = true
  try {
    if (needsBackendParse(file.name)) {
      const res = await parseFile(file)
      questionsForm.content = (res.data.content || '').trim()
    } else {
      const text = await readTextFile(file)
      questionsForm.content = text.trim()
    }
    showToast(`已导入文件：${file.name}`)
  } catch (err) {
    showToast(err.message || '文件读取失败')
  }
  questionsFileLoading.value = false
  e.target.value = ''
}

const questionTypes = [
  { value: 'choice', label: '选择题', icon: '📝' },
  { value: 'judge', label: '判断题', icon: '✓✗' },
  { value: 'short', label: '简答题', icon: '✍️' },
  { value: 'code_fill', label: '代码填空', icon: '💻' },
]

const currentTypeLabel = computed(() => {
  const t = questionTypes.find(t => t.value === questionType.value)
  return t ? t.label : '题目'
})

const currentTypePlaceholder = computed(() => {
  const map = {
    choice: '如：第一章 选择题',
    judge: '如：第一章 判断题',
    short: '如：第一章 简答题',
    code_fill: '如：Java代码填空题',
  }
  return map[questionType.value] || '如：第一章 练习题'
})

const currentTypeTextPlaceholder = computed(() => {
  const map = {
    choice: '按格式粘贴选择题数据，每行一题',
    judge: '按格式粘贴判断题数据，每行一题',
    short: '按格式粘贴简答题数据，每行一题',
    code_fill: '按JSON格式粘贴代码填空题数据，每行一题',
  }
  return map[questionType.value] || '按格式粘贴题目数据'
})

const knowledgeForm = reactive({
  subjectId: '',
  versionId: '',
  title: '',
  content: '',
  generateQuiz: false,
})

const questionsForm = reactive({
  subjectId: '',
  versionId: '',
  title: '',
  content: '',
})

// 版本相关
const versionList = ref([])
const showNewVersion = ref(false)
const showVersionManage = ref(false)
const showRename = ref(false)
const newVersionName = ref('')
const newVersionSubjectId = ref(null)
const renameValue = ref('')
const renamingVersion = ref(null)

async function onSubjectChange(subjectId) {
  if (!subjectId) { versionList.value = []; return }
  knowledgeForm.versionId = ''
  questionsForm.versionId = ''
  await loadVersions(subjectId)
}

async function loadVersions(subjectId) {
  try {
    const res = await getVersionList(subjectId)
    versionList.value = res.data || []
    // 自动选中第一版
    if (versionList.value.length > 0 && !knowledgeForm.versionId) {
      knowledgeForm.versionId = versionList.value[0].id
      questionsForm.versionId = versionList.value[0].id
    }
  } catch (e) {
    console.error('加载版本失败:', e)
  }
}

async function handleCreateVersion() {
  if (!newVersionSubjectId.value) {
    showToast('请先选择科目')
    return
  }
  if (!newVersionName.value.trim()) {
    showToast('请输入版本名称')
    return
  }
  try {
    const created = await createVersion({ subjectId: newVersionSubjectId.value, name: newVersionName.value.trim() })
    showToast('创建成功')
    await loadVersions(newVersionSubjectId.value)
    // 自动选中刚创建的版本；列表按创建时间倒序，不能取最后一项
    const createdId = created?.data?.id
    const newV = versionList.value.find((v) => String(v.id) === String(createdId)) || versionList.value[0]
    if (newV) {
      knowledgeForm.versionId = newV.id
      questionsForm.versionId = newV.id
    }
    showNewVersion.value = false
    newVersionName.value = ''
  } catch (e) {
    showToast('创建失败')
  }
}

function startRename(v) {
  renamingVersion.value = v
  renameValue.value = v.name
  showRename.value = true
}

async function handleRename() {
  if (!renamingVersion.value) return
  if (!renameValue.value.trim()) {
    showToast('请输入版本名称')
    return
  }
  try {
    await renameVersion(renamingVersion.value.id, { name: renameValue.value.trim() })
    showToast('修改成功')
    await loadVersions(newVersionSubjectId.value || knowledgeForm.subjectId || questionsForm.subjectId)
    showRename.value = false
  } catch (e) {
    showToast('修改失败')
  }
}

async function handleDeleteVersion(v) {
  try {
    await showConfirmDialog({ title: '删除版本', message: `确定删除「${v.name}」及其所有数据？` })
    await deleteVersion(v.id)
    showToast('删除成功')
    await loadVersions(newVersionSubjectId.value || knowledgeForm.subjectId || questionsForm.subjectId)
  } catch (e) {
    // 用户取消
  }
}

const newSubject = reactive({
  name: '',
  icon: '📚'
})

// 解析知识点内容
function parseKnowledgeContent(content) {
  const lines = content.trim().split('\n').filter(l => l.trim())
  const items = []

  for (const line of lines) {
    const trimmed = line.trim()

    // JSON格式
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed)
        if (obj.title || obj.term) {
          items.push({
            title: obj.title || obj.term,
            content: obj.content || obj.definition || obj.answer || '',
            quickAnswer: obj.quickAnswer || obj.quick_answer || ''
          })
        }
        continue
      } catch (e) {
        // not JSON, try pipe format
      }
    }

    // 管道分隔格式: 标题 | 完整答案 | 简化答案（可选）
    if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map(p => p.trim())
      if (parts.length >= 2) {
        const item = {
          title: parts[0],
          content: parts[1],
          quickAnswer: ''
        }
        if (parts.length >= 3 && parts[2]) {
          item.quickAnswer = parts[2]
        }
        items.push(item)
      }
    } else {
      // 纯文本，整行作为标题
      items.push({ title: trimmed, content: '', quickAnswer: '' })
    }
  }

  return items
}

// 解析题库内容
function parseQuestionsContent(content) {
  const lines = content.trim().split('\n').filter(l => l.trim())
  const items = []
  const type = questionType.value

  for (const line of lines) {
    const trimmed = line.trim()

    // JSON格式（所有题型都支持）
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed)
        if (obj.stem || obj.question) {
          const item = {
            type: type,
            stem: obj.stem || obj.question || '',
            options: obj.options || [],
            answer: obj.answer !== undefined ? String(obj.answer) : '',
            analysis: obj.analysis || obj.explanation || '',
            chapter: obj.chapter,
            topic: obj.topic || '',
            quickAnswer: obj.quickAnswer || obj.quick_answer || ''
          }
          // 代码填空题额外字段
          if (type === 'code_fill') {
            item.code = obj.code || ''
            item.blanks = obj.blanks || []
            item.answers = obj.answers || []
            item.options = obj.options || []
          }
          items.push(item)
        }
        continue
      } catch (e) {
        // not JSON, try pipe format
      }
    }

    // 管道分隔格式（代码填空不支持）
    if (type !== 'code_fill' && trimmed.includes('|')) {
      const parts = trimmed.split('|').map(p => p.trim())

      if (type === 'choice' && parts.length >= 3) {
        items.push({
          type: 'choice',
          stem: parts[0],
          options: parts[1].split('|').map(o => o.trim()),
          answer: parts[2] || 'A',
          analysis: parts[3] || ''
        })
      } else if (type === 'judge' && parts.length >= 2) {
        items.push({
          type: 'judge',
          stem: parts[0],
          answer: parts[1] || 'A',
          analysis: parts[2] || ''
        })
      } else if (type === 'short' && parts.length >= 2) {
        const item = {
          type: 'short',
          stem: parts[0],
          answer: parts[1],
          quickAnswer: '',
          analysis: ''
        }
        if (parts.length >= 3 && parts[2]) {
          item.quickAnswer = parts[2]
        }
        if (parts.length >= 4 && parts[3]) {
          item.analysis = parts[3]
        } else if (parts.length >= 3 && parts[2]) {
          // 只有3段时，第3段可能是简化答案也可能是解析
          // 如果第3段较短（<50字符），当作简化答案；否则当作解析
          if (parts[2].length >= 50) {
            item.analysis = parts[2]
            item.quickAnswer = ''
          }
        }
        items.push(item)
      }
    }
  }

  return items
}

async function handleAiRecognize() {
  let text = knowledgeForm.content.trim()
  if (!text) {
    showToast('请先输入一些内容')
    return
  }
  // AI识别限制50字（节省token），超出只取前50字
  if (text.length > 50) {
    text = text.slice(0, 50)
    showToast('内容超过50字，已截取前50字进行识别')
  }
  aiRecognizeLoading.value = true
  try {
    const res = await aiRecognize(text)
    aiRecognizeResult.value = res.data.items || []
    if (aiRecognizeResult.value.length === 0) {
      showToast('未能识别出知识点')
    } else {
      showToast(`识别成功，共${aiRecognizeResult.value.length}个知识点`)
    }
  } catch (e) {
    showToast('AI识别失败: ' + (e.message || '未知错误'))
  } finally {
    aiRecognizeLoading.value = false
  }
}

function applyRecognizeItem(item) {
  const line = `${item.title} | ${item.content || ''} | ${item.quickAnswer || ''}`
  if (knowledgeForm.content.trim()) {
    knowledgeForm.content += '\n' + line
  } else {
    knowledgeForm.content = line
  }
  showToast('已应用：' + item.title)
}

function applyAllRecognize() {
  const lines = aiRecognizeResult.value.map(item =>
    `${item.title} | ${item.content || ''} | ${item.quickAnswer || ''}`
  )
  knowledgeForm.content = lines.join('\n')
  showToast('已全部应用')
}

async function handleAiQuestionRecognize() {
  let text = questionsForm.content.trim()
  if (!text) {
    showToast('请先输入一些题目内容')
    return
  }
  // AI识别限制50字（节省token），超出只取前50字
  if (text.length > 50) {
    text = text.slice(0, 50)
    showToast('内容超过50字，已截取前50字进行识别')
  }
  aiQuestionRecognizeLoading.value = true
  aiQuestionResult.value = null
  try {
    const res = await aiRecognizeQuestion(questionType.value, text)
    aiQuestionResult.value = res.data.item || null
    if (!aiQuestionResult.value || !aiQuestionResult.value.stem) {
      showToast('未能识别出题目')
    } else {
      showToast('识别成功，已生成1道' + currentTypeLabel.value)
    }
  } catch (e) {
    showToast('AI识别失败: ' + (e.message || '未知错误'))
  } finally {
    aiQuestionRecognizeLoading.value = false
  }
}

function applyAiQuestion() {
  if (!aiQuestionResult.value) return
  const line = JSON.stringify(aiQuestionResult.value)
  if (questionsForm.content.trim()) {
    questionsForm.content += '\n' + line
  } else {
    questionsForm.content = line
  }
  showToast('已应用：' + (aiQuestionResult.value.stem || '题目'))
  aiQuestionResult.value = null
}

/* ===== 问问AI：把识别出的知识点/题目添加到AI对话（chip 点击跳回上传页） ===== */
function askPointAI(item) {
  if (!item || !item.title) return
  const content = `帮我讲解这个知识点：${item.title}${item.content ? `：${item.content}` : ''}${item.quickAnswer ? `（简化记忆：${item.quickAnswer}）` : ''}`
  askAI(content, '知识点', { path: '/upload' })
}

function askAiQuestionAI() {
  const q = aiQuestionResult.value
  if (!q || !q.stem) return
  const opts = (q.options && q.options.length)
    ? '\n选项：' + q.options.map((o, i) => `${String.fromCharCode(65 + i)}.${o}`).join('  ')
    : ''
  askAI(`帮我解答这道题：${q.stem}${opts}`, '题目', { path: '/upload' })
}

async function handleKnowledgeUpload() {
  if (!knowledgeForm.subjectId) {
    showToast('请选择科目')
    return
  }
  if (!knowledgeForm.versionId) {
    showToast('请选择版本')
    return
  }
  const items = parseKnowledgeContent(knowledgeForm.content)
  if (items.length === 0) {
    showToast('未能解析出知识点，请检查格式')
    return
  }

  loading.value = true
  try {
    let quizItems = []
    if (knowledgeForm.generateQuiz) {
      showToast('AI智能出题中，请稍候...')
      try {
        // 后端只截取前10个知识点发给AI，节省token
        const quizRes = await aiGenerateQuiz(items)
        quizItems = quizRes.data.questions || []
      } catch (e) {
        console.error('AI出题失败:', e)
      }
    }

    const res = await uploadKnowledge({
      subjectId: knowledgeForm.subjectId,
      versionId: knowledgeForm.versionId,
      title: knowledgeForm.title,
      items,
      // AI出题失败时回退到服务端模板出题，保证功能可用
      generateQuiz: knowledgeForm.generateQuiz && quizItems.length === 0
    })

    if (quizItems.length > 0) {
      try {
        await uploadQuestions({
          subjectId: knowledgeForm.subjectId,
          versionId: knowledgeForm.versionId,
          title: (knowledgeForm.title || 'AI智能出题') + ' - AI生成',
          items: quizItems,
        })
      } catch (e) {
        console.error('AI题目上传失败:', e)
      }
    }

    showToast(res.message + (quizItems.length > 0 ? `，AI生成${quizItems.length}道题目` : ''))
    window.dispatchEvent(new CustomEvent('kaoshibang:upload-done'))
    setTimeout(() => {
      router.push(`/review/${knowledgeForm.subjectId}`)
    }, 1500)
  } catch (e) {
    showToast('上传失败: ' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

async function handleQuestionsUpload() {
  if (!questionsForm.subjectId) {
    showToast('请选择科目')
    return
  }
  if (!questionsForm.versionId) {
    showToast('请选择版本')
    return
  }
  const items = parseQuestionsContent(questionsForm.content)
  if (items.length === 0) {
    showToast('未能解析出题目，请检查格式')
    return
  }

  loading.value = true
  try {
    const res = await uploadQuestions({
      subjectId: questionsForm.subjectId,
      versionId: questionsForm.versionId,
      title: questionsForm.title,
      items,
    })
    showToast(res.message)
    window.dispatchEvent(new CustomEvent('kaoshibang:upload-done'))
    setTimeout(() => {
      router.push(`/review/${questionsForm.subjectId}`)
    }, 1500)
  } catch (e) {
    showToast('上传失败: ' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

async function addSubject() {
  if (!newSubject.name) {
    showToast('请输入科目名称')
    return
  }
  await userStore.addSubject({ ...newSubject })
  showToast('科目已添加')
  newSubject.name = ''
  newSubject.icon = '📚'
}

onMounted(() => {
  if (!userStore.subjects.length) {
    userStore.fetchSubjects()
  }
})
</script>

<style scoped>
.upload-page {
  min-height: 100vh;
  background: var(--bg);
}

.upload-header {
  text-align: center;
  padding: 28px 20px 22px;
}

.upload-header h1 {
  font-size: 22px;
  margin-bottom: 6px;
}

.upload-header p {
  opacity: 0.9;
  font-size: 0.95em;
}

.file-upload-area {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 16px;
  flex-wrap: wrap;
}

.file-hint {
  font-size: 12px;
  color: var(--text-light);
}

.ai-recognize-box {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ai-recognize-result {
  margin-top: 10px;
  padding: 10px;
  background: var(--success-bg);
  border-radius: var(--radius);
  border: 1px solid var(--success);
}

.ai-result-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--success);
  margin-bottom: 8px;
}

.ai-result-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--card);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-result-item:hover {
  background: var(--bg-alt);
  transform: translateX(2px);
}

.ai-result-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}

.ai-result-content {
  font-size: 13px;
  color: var(--text-secondary);
}

.ai-result-quick {
  font-size: 12px;
  color: var(--text-light);
  font-style: italic;
}

/* 问问AI 按钮 */
.ask-ai-btn {
  margin-top: 6px;
  align-self: flex-start;
  padding: 4px 12px;
  border: none;
  border-radius: var(--chip-radius);
  background: linear-gradient(135deg, var(--header-grad-a), var(--header-grad-b));
  color: var(--header-fg);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow);
}

.ask-ai-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.version-select-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.version-new-btn {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 4px 12px;
  border: 1px solid var(--primary);
  background: var(--primary-bg);
  color: var(--primary);
  border-radius: var(--chip-radius);
  font-size: 13px;
  cursor: pointer;
}

.version-new-btn:hover {
  background: var(--primary);
  color: var(--on-primary);
}

.version-modal {
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

.version-modal.show {
  display: flex;
}

.version-modal-content {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 88%;
  max-width: 400px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.version-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.version-modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.modal-close {
  border: none;
  background: none;
  font-size: 24px;
  color: var(--text-light);
  cursor: pointer;
  line-height: 1;
}

.version-modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.version-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 15px;
  box-sizing: border-box;
  margin-bottom: 12px;
  background: var(--bg-alt);
  color: var(--text);
}

.version-modal-actions {
  margin-top: 4px;
}

.version-empty {
  text-align: center;
  color: var(--text-light);
  padding: 20px;
}

.version-manage-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-light);
}

.version-manage-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.version-name {
  font-size: 15px;
  font-weight: 500;
}

.version-stats {
  font-size: 12px;
  color: var(--text-light);
}

.version-manage-actions {
  display: flex;
  gap: 8px;
}

.version-edit-btn {
  padding: 4px 12px;
  border: 1px solid var(--primary);
  background: var(--primary-bg);
  color: var(--primary);
  border-radius: var(--chip-radius);
  font-size: 13px;
  cursor: pointer;
}

.version-del-btn {
  padding: 4px 12px;
  border: 1px solid var(--danger);
  background: var(--danger-bg);
  color: var(--danger);
  border-radius: var(--chip-radius);
  font-size: 13px;
  cursor: pointer;
}

.content-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin: -20px 16px 24px;
  padding: 20px;
  box-shadow: var(--shadow-md);
  position: relative;
  z-index: 1;
}

.upload-type-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  cursor: pointer;
  font-size: 15px;
  transition: all 0.2s;
  color: var(--text-secondary);
}

.type-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.type-btn.active {
  border-color: var(--primary);
  background: var(--primary-bg);
  color: var(--primary);
  font-weight: 600;
}

.form-section {
  margin-bottom: 24px;
}

/* 题型子Tab */
.question-type-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.qtype-btn {
  flex: 1;
  min-width: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  color: var(--text-secondary);
}

.qtype-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.qtype-btn.active {
  border-color: var(--primary);
  background: var(--primary-bg);
  color: var(--primary);
  font-weight: 600;
}

.format-list {
  font-size: 12px;
  color: var(--text-secondary);
  padding-left: 18px;
  margin: 6px 0;
  line-height: 1.8;
}

.select-field {
  width: 100%;
  padding: 8px 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 14px;
}

/* 格式示例 */
.format-example {
  margin: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.format-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: var(--bg-alt);
  cursor: pointer;
  font-size: 13px;
  color: var(--primary);
  user-select: none;
}

.format-arrow {
  margin-left: auto;
}

.format-body {
  padding: 12px 14px;
}

.format-tip {
  font-size: 12px;
  color: var(--text-light);
  margin-bottom: 6px;
}

.format-code {
  background: #2d2d2d;
  color: #f8f8f2;
  padding: 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  font-family: var(--font-mono);
  white-space: pre-wrap;
  margin-bottom: 8px;
}

/* 智能出题选项 */
.option-box {
  margin: 12px 16px;
  padding: 14px;
  background: var(--bg-alt);
  border-radius: var(--radius);
  border: 1px dashed var(--border-strong);
}

.option-label {
  font-size: 15px;
  font-weight: 600;
  margin-right: 8px;
}

.option-desc {
  font-size: 12px;
  color: var(--text-light);
}

.auto-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-light);
}

.form-btn {
  padding: 12px 16px;
}

.new-subject-section {
  border-top: 1px solid #eee;
  padding-top: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  padding: 0 16px 8px;
}

.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}
.slide-down-enter-from, .slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
.slide-down-enter-to, .slide-down-leave-from {
  max-height: 500px;
  opacity: 1;
}
</style>
