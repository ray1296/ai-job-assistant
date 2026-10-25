<template>
  <div class="page subject-page">
    <!-- 主题化Header（渐变跟随当前主题） -->
    <div class="page-header subject-header" :style="{ background: headerGradient }">
      <span class="back-btn" @click="router.back()">←</span>
      <div class="subject-icon">{{ subject.icon }}</div>
    <AiStudyTools :subject-id="subjectId" :version-id="versionId" :questions="allQuestions" @changed="loadData" />
      <h1>{{ subject.name }}</h1>
      <div class="stats-bar">
        <div class="stat-chip"><strong class="num-mono">{{ flashcards.length }}</strong> 卡片</div>
        <div class="stat-chip"><strong class="num-mono">{{ totalQuestions }}</strong> 道题</div>
      </div>
    </div>

    <!-- 市场预览模式提示 -->
    <div v-if="isMarketMode" class="market-banner">
      <span>👁 预览模式 · 分享人：{{ marketOwner }}</span>
      <button class="banner-import-btn" @click="goMarketDetail">去收录</button>
    </div>

    <!-- Tab导航 -->
    <div class="nav-tabs">
      <button v-for="tab in tabs" :key="tab.key" class="nav-btn" :class="{ active: activeTab === tab.key }" @click="switchTab(tab.key)">
        {{ tab.icon }} {{ tab.label }}
      </button>
    </div>

    <!-- 内容区 -->
    <div class="content-card">
      <!-- ===== 卡片记忆 ===== -->
      <div v-show="activeTab === 'cards'" class="page active">
        <!-- 筛选 + 操作按钮 -->
        <div class="cards-controls">
          <button v-for="cat in cardCategories" :key="cat.key" class="cards-filter" :class="{ active: cardFilter === cat.key }" @click="filterCards(cat.key)">{{ cat.label }}</button>
          <button class="btn btn-success" @click="shuffleCards">🔀 重新洗牌</button>
          <button class="btn btn-secondary" @click="flipAllCards">🔄 全部翻转</button>
          <button class="btn btn-secondary" @click="resetCards">↩️ 重置</button>
        </div>
        <div class="cards-stats">
          已复习: <span>{{ cardsReviewed.size }}</span> / <span>{{ filteredCards.length }}</span> | 进度: <span>{{ Math.round(cardsReviewed.size / Math.max(filteredCards.length,1) * 100) }}%</span>
        </div>

        <div class="cards-grid" v-if="filteredCards.length">
          <div
            v-for="(card, idx) in filteredCards"
            :key="card.id"
            :id="'flash-card-' + card.id"
            class="flash-card short-card"
            :class="cardFlipClass(card.id)"
            :data-state="cardState(card.id)"
            @click="handleCardClick(card.id, $event)"
          >
            <div class="flash-card-inner">
              <!-- 正面 -->
              <div class="flash-card-front" :style="{ background: cardFrontBg(card) }">
                <div class="card-question-num">{{ idx + 1 }}</div>
                <div class="card-type-badge">{{ card.topic || '知识点' }}</div>
                <div class="card-question-text">{{ card.front }}</div>
                <span v-if="card.answerSource" class="answer-source-badge" :class="{ ai: isAiSource(card.answerSource) }">{{ answerSourceLabel(card.answerSource) }}</span>
                <button class="ask-ai-btn card-ask-btn" @click.stop="askCardAI(card)">🤖 问问AI</button>
                <div v-if="card.hint" class="hint-bulb" @click.stop="showHint(card.id)">💡</div>
                <div class="hint-popup" :class="{ show: showingHint === card.id }">{{ card.hint }}</div>
                <div class="front-hint">← 左翻简化答案 | 右翻完整答案 →</div>
              </div>
              <!-- 背面左（简化答案） -->
              <div class="flash-card-back short-back">
                <div class="card-answer-header">📝 简化答案 <span v-if="card.answerSource" class="answer-source-badge" :class="{ ai: isAiSource(card.answerSource) }">{{ answerSourceLabel(card.answerSource) }}</span></div>
                <div class="card-answer-content"><pre>{{ card.quickAnswer || card.quick_answer || card.back }}</pre></div>
                <div class="card-nav-hints">
                  <span @click.stop="setCardState(card.id, 'front')">← 翻回题目</span>
                  <span @click.stop="setCardState(card.id, 'right')">看完整答案 →</span>
                </div>
              </div>
              <!-- 背面右（完整答案） -->
              <div class="flash-card-back-right short-back">
                <div class="card-answer-header" style="background:var(--primary-dark)">📖 完整答案 <span v-if="card.answerSource" class="answer-source-badge" :class="{ ai: isAiSource(card.answerSource) }">{{ answerSourceLabel(card.answerSource) }}</span></div>
                <div class="card-answer-content"><pre>{{ card.fullAnswer || card.full_answer || card.back }}</pre></div>
                <div class="card-nav-hints">
                  <span @click.stop="setCardState(card.id, 'left')">← 看简化答案</span>
                  <span @click.stop="setCardState(card.id, 'front')">翻回题目 →</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state"><div class="icon">🃏</div><p>暂无卡片</p></div>
      </div>

      <!-- ===== 刷题 ===== -->
      <div v-show="activeTab === 'quiz'" class="page active">
        <!-- 题型Tab -->
        <div class="quiz-type-tabs">
          <button v-for="t in quizTypeTabs" :key="t.value" class="qtab-btn" :class="{ active: quizType === t.value }" @click="switchQuizType(t.value)">{{ t.label }} ({{ t.count }})</button>
        </div>

        <!-- 代码完形填空 -->
        <div v-if="quizType === 'code_fill'" id="quiz-area-code_fill" class="quiz-area code-fill-quiz">
          <div v-if="codeFillQuestions.length > 0">
            <div class="quiz-progress"><div class="quiz-progress-fill" :style="{ width: codeFillProgress + '%' }"></div></div>
            <div class="quiz-header">
              <span class="q-type" style="background:var(--danger)">代码完形填空</span>
              <span class="q-num">第 {{ codeFillIndex + 1 }} / {{ codeFillQuestions.length }} 题</span>
              <button v-if="!isMarketMode" class="fav-btn" :class="{ active: isFavorited(currentCodeFill.id) }" @click="handleFavorite(currentCodeFill.id)">{{ isFavorited(currentCodeFill.id) ? '★' : '☆' }}</button><button class="wrong-add-btn" @click="addWrongQuestion(currentCodeFill.id)">📕 错题</button>
              <button class="ask-ai-btn" @click="askQuizAI()">🤖 问问AI</button>
              <span class="blank-count" style="margin-left:auto;color:var(--text-light);font-size:13px;">
                已填: {{ codeFillFilledCount }} / {{ currentCodeFill.blanks?.length || 0 }}
              </span>
            </div>
            <div class="quiz-toolbar">
              <label class="auto-toggle"><input type="checkbox" v-model="shuffleQuestions"> 题目乱序</label>
            </div>
            <div class="q-text">{{ currentCodeFill.stem || currentCodeFill.question }}</div>
            <div class="fill-code" ref="codeFillContainer" @click="handleCodeFillClick">
              <template v-for="(part, idx) in codeFillParts" :key="idx">
                <span v-html="part"></span>
                <span
                  v-if="idx < currentCodeFill.blanks?.length"
                  class="blank-button"
                  :class="getBlankButtonClass(idx)"
                  :data-blank="idx"
                >
                  {{ getBlankDisplayText(idx) }}
                </span>
              </template>
            </div>

            <!-- 选项弹窗 -->
            <div
              v-if="popupVisible"
              class="options-popup"
              :style="{ left: popupStyle.left + 'px', top: popupStyle.top + 'px' }"
              @click.stop
            >
              <div class="popup-title">{{ currentCodeFill.blanks?.[activeBlankIndex] || '选择答案' }}</div>
              <div class="popup-options">
                <div
                  v-for="(opt, i) in currentBlankOptions"
                  :key="i"
                  class="popup-option"
                  :class="{ selected: getBlankAnswer(activeBlankIndex) === i }"
                  @click="selectBlankOption(i)"
                >
                  <span class="option-idx">{{ String.fromCharCode(65 + i) }}</span>
                  <span class="option-text">{{ opt }}</span>
                </div>
              </div>
            </div>

            <div class="code-fill-actions">
              <button class="btn btn-primary" @click="submitCodeFill" v-if="!codeFillAnswered">
                ✅ 提交答案
              </button>
              <button class="btn btn-success" @click="showCodeFillAnswer = !showCodeFillAnswer" v-else>
                {{ showCodeFillAnswer ? '隐藏解析' : '查看解析' }}
              </button>
            </div>
            <div v-if="codeFillAnswered && showCodeFillAnswer" class="answer-area show">
              <div class="answer-label">{{ codeFillCorrect ? '✅ 全部正确！' : '❌ 部分错误' }}</div>
              <div class="answer-explanation">{{ currentCodeFill.analysis || currentCodeFill.explanation }}</div>
            </div>
            <div class="btn-group">
              <button class="btn btn-warning" @click="resetCurrentQuiz">🔄 清空</button>
              <button class="btn btn-info" @click="showAnswerCard = true">📋 答题卡</button>
              <button class="btn btn-secondary" @click="prevCodeFill">← 上一题</button>
              <button class="btn btn-primary" @click="nextCodeFill">下一题 →</button>
            </div>
          </div>
          <div v-else class="empty-state"><div class="icon">💻</div><p>该科目暂无代码填空题</p></div>
        </div>

        <!-- 选择题 -->
        <div v-else-if="quizType === 'choice'" id="quiz-area-choice" class="quiz-area">
          <div v-if="choiceQuestions.length > 0">
            <div class="quiz-progress"><div class="quiz-progress-fill" :style="{ width: choiceProgress + '%' }"></div></div>
            <div class="quiz-header">
              <span class="q-type" style="background:var(--primary)">选择题</span>
              <span class="q-num">第 {{ choiceIndex + 1 }} / {{ choiceQuestions.length }} 题</span>
              <button v-if="!isMarketMode" class="fav-btn" :class="{ active: isFavorited(currentChoice.id) }" @click="handleFavorite(currentChoice.id)">{{ isFavorited(currentChoice.id) ? '★' : '☆' }}</button><button class="wrong-add-btn" @click="addWrongQuestion(currentChoice.id)">📕 错题</button>
              <button class="ask-ai-btn" @click="askQuizAI()">🤖 问问AI</button>
              <label class="auto-toggle" style="margin-left:auto"><input type="checkbox" v-model="shuffleQuestions"> 题目乱序</label>
              <label class="auto-toggle"><input type="checkbox" v-model="shuffleOptions"> 选项乱序</label>
            </div>
            <div class="q-text">{{ currentChoice.stem }}</div>
            <div class="options">
              <div
                v-for="(opt, i) in currentChoiceDisplayOpts"
                :key="i"
                class="option"
                :class="getChoiceOptionClass(i)"
                @click="answerChoice(i)"
              >
                <span class="option-letter">{{ String.fromCharCode(65 + i) }}</span>
                <span>{{ opt }}</span>
              </div>
            </div>
            <div v-if="choiceAnsweredMap[currentChoice.id]" class="answer-area show">
              <div class="answer-label" :style="{ color: lastCorrect ? 'var(--success)' : 'var(--danger)' }">
                {{ lastCorrect ? '✅ 回答正确！' : '❌ 回答错误' }}
              </div>
              <div class="answer-explanation">{{ currentChoice.analysis }}</div>
            </div>
            <div class="btn-group">
              <label class="auto-toggle"><input type="checkbox" v-model="autoNext"> 自动下一题</label>
              <button class="btn btn-warning" @click="resetCurrentQuiz">🔄 清空</button>
              <button class="btn btn-info" @click="showAnswerCard = true">📋 答题卡</button>
              <button class="btn btn-secondary" @click="prevChoice">← 上一题</button>
              <button class="btn btn-primary" @click="nextChoice">下一题 →</button>
            </div>
          </div>
          <div v-else class="empty-state"><div class="icon">📝</div><p>该科目暂无选择题</p></div>
        </div>

        <!-- 判断题 -->
        <div v-else-if="quizType === 'judge'" id="quiz-area-judge" class="quiz-area">
          <div v-if="judgeQuestions.length > 0">
            <div class="quiz-progress"><div class="quiz-progress-fill" :style="{ width: judgeProgress + '%' }"></div></div>
            <div class="quiz-header">
              <span class="q-type" style="background:var(--warning)">判断题</span>
              <span class="q-num">第 {{ judgeIndex + 1 }} / {{ judgeQuestions.length }} 题</span>
              <button v-if="!isMarketMode" class="fav-btn" :class="{ active: isFavorited(currentJudge.id) }" @click="handleFavorite(currentJudge.id)">{{ isFavorited(currentJudge.id) ? '★' : '☆' }}</button><button class="wrong-add-btn" @click="addWrongQuestion(currentJudge.id)">📕 错题</button>
              <button class="ask-ai-btn" @click="askQuizAI()">🤖 问问AI</button>
              <label class="auto-toggle" style="margin-left:auto"><input type="checkbox" v-model="shuffleQuestions"> 题目乱序</label>
            </div>
            <div class="q-text">{{ currentJudge.stem }}</div>
            <div class="judge-options">
              <button class="judge-btn" :class="getJudgeClass(true)" @click="answerJudge(true)">✓ 正确</button>
              <button class="judge-btn" :class="getJudgeClass(false)" @click="answerJudge(false)">✗ 错误</button>
            </div>
            <div v-if="judgeAnswered" class="answer-area show">
              <div class="answer-label" :style="{ color: lastCorrect ? 'var(--success)' : 'var(--danger)' }">
                {{ lastCorrect ? '✅ 回答正确！' : '❌ 回答错误' }}
              </div>
              <div class="answer-explanation">{{ currentJudge.analysis }}</div>
            </div>
            <div class="btn-group">
              <label class="auto-toggle"><input type="checkbox" v-model="autoNext"> 自动下一题</label>
              <button class="btn btn-warning" @click="resetCurrentQuiz">🔄 清空</button>
              <button class="btn btn-info" @click="showAnswerCard = true">📋 答题卡</button>
              <button class="btn btn-secondary" @click="prevJudge">← 上一题</button>
              <button class="btn btn-primary" @click="nextJudge">下一题 →</button>
            </div>
          </div>
          <div v-else class="empty-state"><div class="icon">✓✗</div><p>该科目暂无判断题</p></div>
        </div>

        <!-- 简答题 -->
        <div v-else-if="quizType === 'short'" id="quiz-area-short" class="quiz-area">
          <div v-if="shortQuestions.length > 0">
            <div class="quiz-progress"><div class="quiz-progress-fill" :style="{ width: shortProgress + '%' }"></div></div>
            <div class="quiz-header">
              <span class="q-type" style="background:var(--success)">简答题</span>
              <span class="q-num">第 {{ shortIndex + 1 }} / {{ shortQuestions.length }} 题</span>
              <button v-if="!isMarketMode" class="fav-btn" :class="{ active: isFavorited(currentShort.id) }" @click="handleFavorite(currentShort.id)">{{ isFavorited(currentShort.id) ? '★' : '☆' }}</button><button class="wrong-add-btn" @click="addWrongQuestion(currentShort.id)">📕 错题</button>
              <button class="ask-ai-btn" @click="askQuizAI()">🤖 问问AI</button>
              <label class="auto-toggle" style="margin-left:auto"><input type="checkbox" v-model="shuffleQuestions"> 题目乱序</label>
            </div>
            <div class="q-text">{{ currentShort.stem }}</div>
            <div class="short-input-area">
              <textarea v-model="shortAnswer" placeholder="请输入你的答案..." rows="5"></textarea>
              <div style="text-align:center;margin-top:15px;display:flex;gap:10px;justify-content:center;">
                <button class="btn btn-success" @click="toggleShortAnswer">
                  📖 {{ showShortAnswer ? '隐藏答案' : '查看参考答案' }}
                </button>
              </div>
            </div>
            <div v-if="showShortAnswer" class="answer-area show">
              <div class="answer-label">✓ 参考答案 <span v-if="currentShort.answerSource" class="answer-source-badge" :class="{ ai: isAiSource(currentShort.answerSource) }">{{ answerSourceLabel(currentShort.answerSource) }}</span></div>
              <div class="answer-explanation" style="white-space:pre-wrap">{{ currentShort.answer }}</div>
            </div>
            <div class="btn-group">
              <button class="btn btn-warning" @click="resetCurrentQuiz">🔄 清空</button>
              <button class="btn btn-info" @click="showAnswerCard = true">📋 答题卡</button>
              <button class="btn btn-secondary" @click="prevShort">← 上一题</button>
              <button class="btn btn-primary" @click="nextShort">下一题 →</button>
            </div>
          </div>
          <div v-else class="empty-state"><div class="icon">✍️</div><p>该科目暂无简答题</p></div>
        </div>
      </div>

      <!-- ===== 收藏 ===== -->
      <div v-show="activeTab === 'wrong' && !isMarketMode" class="page active">
        <div class="wrong-list" v-if="favorites.length">
          <div class="wrong-item fav-item" v-for="q in favorites" :key="q.id" :id="'fav-item-' + q.id">
            <div class="fav-content" @click="goToQuestion(q)">
              <div class="wt">{{ q.stem }}</div>
              <div v-if="q.type === 'choice' && q.options && q.options.length" class="wopts">
                <span v-for="(o, i) in q.options" :key="i" class="wopt" :class="{ correct: String.fromCharCode(65 + i) === q.answer }">{{ String.fromCharCode(65 + i) }}. {{ o }}</span>
              </div>
              <div class="wm">
                <span class="q-type" :style="{ background: getTypeColor(q.type) }">{{ getTypeName(q.type) }}</span>
                <span>答案: {{ q.answer }}</span>
              </div>
            </div>
            <button class="ask-ai-btn" @click.stop="askQuestionAI(q)">🤖 问问AI</button>
            <button class="unfav-btn" @click.stop="handleFavorite(q.id)">取消收藏</button>
          </div>
        </div>
        <div v-else class="empty-state"><div class="icon">⭐</div><p>暂无收藏题目，刷题时点击 ☆ 即可收藏</p></div>
      </div>

      <!-- ===== 错题 ===== -->
      <div v-show="activeTab === 'wrongbook' && !isMarketMode" class="page active">
        <div class="wrong-list" v-if="wrongQuestions.length">
          <div class="wrong-item fav-item" v-for="q in wrongQuestions" :key="q.id" :id="'wrong-item-' + q.id">
            <div class="fav-content">
              <div class="wt">{{ q.stem }}</div>
              <div v-if="q.type === 'choice' && q.options && q.options.length" class="wopts">
                <span v-for="(o, i) in q.options" :key="i" class="wopt" :class="{ correct: String.fromCharCode(65 + i) === q.answer }">{{ String.fromCharCode(65 + i) }}. {{ o }}</span>
              </div>
              <div class="wm">
                <span class="q-type" :style="{ background: getTypeColor(q.type) }">{{ getTypeName(q.type) }}</span>
                <span>答案: {{ q.answer }}</span>
              </div>
            </div>
            <div class="wrong-actions">
              <button class="unfav-btn" @click="markWrongLearned(q.id)">✅ 已学会</button>
              <button class="unfav-btn danger-btn" @click="removeWrong(q.id)">🗑 删除</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state"><div class="icon">📕</div><p>暂无错题，刷题答错的题目会出现在这里</p></div>
      </div>
    </div>

    <!-- 答题卡弹窗 -->
    <div class="card-modal" :class="{ show: showAnswerCard }" @click.self="showAnswerCard = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>📋 答题卡</h3>
          <button class="modal-close" @click="showAnswerCard = false">&times;</button>
        </div>
        <div class="card-stats">
          <div class="card-stat"><div class="card-stat-num" style="color:var(--primary)">{{ currentQuizTotal }}</div><div class="card-stat-label">总题数</div></div>
          <div class="card-stat"><div class="card-stat-num" style="color:var(--warning)">{{ answeredCount }}</div><div class="card-stat-label">已答</div></div>
          <div class="card-stat"><div class="card-stat-num" style="color:var(--success)">{{ correctCount }}</div><div class="card-stat-label">正确</div></div>
          <div class="card-stat"><div class="card-stat-num" style="color:var(--danger)">{{ wrongCount }}</div><div class="card-stat-label">错误</div></div>
        </div>
        <div class="card-grid">
          <div
            v-for="(qid, i) in currentQuizOrder"
            :key="i"
            class="card-item"
            :class="getCardItemClass(qid)"
            @click="jumpToQuestion(i)"
          >{{ i + 1 }}</div>
        </div>
      </div>
    </div>

    <!-- ===== 看板娘 AI 小帮：悬浮动作菜单（可拖动，位置记忆） ===== -->
    <div class="ai-assistant-fab" :class="{ 'menu-down': !menuUp }" :style="{ left: fabPos.left + 'px', bottom: fabPos.bottom + 'px' }">
      <transition name="ai-menu-pop">
        <div v-if="aiMenuOpen" class="ai-assistant-menu" :style="{ maxHeight: menuMaxHeight + 'px' }">
          <div class="ai-menu-title">小帮帮你复习 ✨<small>按住圆钮可拖动</small></div>
          <button class="ai-menu-item" :disabled="aiLoading" @click="aiAction('summary')">
            <span class="ai-menu-emoji">📊</span> 总结考点
          </button>
          <button class="ai-menu-item" :disabled="aiLoading" @click="aiAction('steps')">
            <span class="ai-menu-emoji">📕</span> 错题精讲
          </button>
          <button class="ai-menu-item" :disabled="aiLoading" @click="aiAction('memo')">
            <span class="ai-menu-emoji">✍️</span> 简答记忆
          </button>
          <button class="ai-menu-item" :disabled="aiLoading" @click="aiAction('link')">
            <span class="ai-menu-emoji">🔗</span> 科目关联
          </button>
          <button class="ai-menu-item ai-menu-page" :disabled="aiLoading" @click="aiAction('page')">
            <span class="ai-menu-emoji">📄</span> 生成报告页
          </button>
          <div class="ai-menu-divider"></div>
          <button class="ai-menu-item" :disabled="aiLoading" @click="aiAction('rag')">
            <span class="ai-menu-emoji">🔍</span> 知识库问答
          </button>
          <button class="ai-menu-item" :disabled="aiLoading" @click="aiAction('agent')">
            <span class="ai-menu-emoji">🧭</span> Agent 任务
          </button>
        </div>
      </transition>
      <button class="ai-assistant-btn" :class="{ active: aiMenuOpen, loading: aiLoading }" title="单击打开工具箱，按住可拖动" @pointerdown="fabPointerDown">
        <span v-if="!aiLoading">🤖</span>
        <span v-else class="ai-spinner"></span>
      </button>
    </div>

    <!-- 工具箱结果面板：iframe 独立浮层，不再依赖父页面看板娘气泡 -->
    <transition name="ai-menu-pop">
      <div v-if="aiPanel" class="ai-result-mask" @click.self="closeAiPanel">
        <div class="ai-result-card" role="dialog" aria-modal="true">
          <header class="ai-result-head">
            <strong>{{ aiPanel.title }}</strong>
            <button class="ai-result-close" title="关闭" @click="closeAiPanel">✕</button>
          </header>
          <div v-if="aiPanel.type === 'rag'" class="rag-tool">
            <div class="rag-tool-row">
              <input v-model="ragQuery" type="search" maxlength="500" placeholder="问平台题库里的知识，例如：Nacos 的作用？" @keyup.enter="askRag" />
              <button class="btn btn-primary" :disabled="ragLoading || !ragQuery.trim()" @click="askRag">{{ ragLoading ? '检索中…' : '检索问答' }}</button>
            </div>
            <p class="rag-tool-hint">只检索平台公开题库 / 岗位 / 企业 / 房源；不会读取你的简历、投递话术、聊天记录或上传文件。回答会带来源编号。</p>
            <div v-if="ragLoading" class="ai-result-loading"><span class="ai-spinner dark"></span> 正在混合检索 + 重排 + 生成…</div>
            <div v-else-if="ragError" class="error" role="alert">{{ ragError }}</div>
            <div v-else-if="ragAnswer" class="rag-answer">{{ ragAnswer }}</div>
            <div v-if="ragSources.length" class="rag-sources">
              <h4>来源（可核对）</h4>
              <div v-for="s in ragSources" :key="s.index" class="rag-source">
                <div class="rag-source-head">
                  <span class="rag-source-index">[{{ s.index }}]</span>
                  <strong>{{ s.title }}</strong>
                  <span v-if="s.answerSource" class="answer-source-badge" :class="{ ai: isAiSource(s.answerSource) }">{{ answerSourceLabel(s.answerSource) }}</span>
                </div>
                <p>{{ s.content }}</p>
                <a v-if="s.sourceUrl" :href="s.sourceUrl" target="_blank" rel="noopener noreferrer">查看原始来源 ↗</a>
                <small v-else>{{ s.source || '平台公开资料' }}</small>
              </div>
            </div>
          </div>
          <div v-else-if="aiPanel.loading" class="ai-result-loading">
            <span class="ai-spinner dark"></span> 小帮正在整理，请稍等～
          </div>
          <iframe v-else-if="aiPanel.html" class="ai-result-frame" :srcdoc="aiPanel.html" sandbox=""></iframe>
          <div v-else class="ai-result-text">{{ aiPanel.text }}</div>
          <footer v-if="aiPanel.action" class="ai-result-foot">
            <button class="ai-result-action" @click="runAiAction">{{ aiPanel.action.label }}</button>
          </footer>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from "vue-router"
import { getSubjectReview } from '../../api/material'
import { getFavoriteList, toggleFavorite } from '../../api/question'
import { getWrongQuestions, removeWrongQuestion, addWrongQuestion as apiAddWrongQuestion } from '../../api/exam'
import { getMarketDetail } from '../../api/market'
import { askAI } from '../../utils/askAI'
import { useTheme, cssVar } from '../../utils/theme'
import AiStudyTools from '../../components/AiStudyTools.vue'
import { showConfirmDialog, showToast } from 'vant'
import {
  aiStudySummary, aiWrongSteps, aiShortMemo, aiSubjectLink, aiGeneratePage, aiPageSave, aiRagAsk
} from '../../api/ai'

defineOptions({ name: 'SubjectReview' })

const route = useRoute()
const router = useRouter()
const subjectId = route.params.subjectId
const versionId = route.query.versionId || null
const isMarketMode = route.query.mode === 'market'

// 数据
const subject = ref({ icon: '📚', name: '' })
const flashcards = ref([])
const allQuestions = ref([])
const favorites = ref([])
const wrongQuestions = ref([])
const totalQuestions = ref(0)
const marketOwner = ref('')

// Tab
const activeTab = ref('cards')
const tabs = computed(() => {
  const base = [
    { key: 'cards', label: '卡片记忆', icon: '🃏' },
    { key: 'quiz', label: '刷题', icon: '🎯' },
  ]
  if (!isMarketMode) {
    base.push({ key: 'wrong', label: '收藏', icon: '⭐' })
    base.push({ key: 'wrongbook', label: '错题', icon: '📕' })
  }
  return base
})

// ==================== 卡片 ====================
const cardFilter = ref('all')
const cardStates = reactive({})  // id -> 'front' | 'left' | 'right'
const cardsReviewed = ref(new Set())
const showingHint = ref(null)
const shuffledCards = ref([])

const cardCategories = computed(() => [
  { key: 'all', label: '全部' },
  { key: 'knowledge', label: '知识点' },
  { key: 'short', label: '简答' },
])

const filteredCards = computed(() => {
  const source = shuffledCards.value.length ? shuffledCards.value : flashcards.value
  if (cardFilter.value === 'all') return source
  if (cardFilter.value === 'knowledge') {
    return source.filter(c => !c.fullAnswer && !c.full_answer)
  }
  if (cardFilter.value === 'short') {
    return source.filter(c => c.fullAnswer || c.full_answer)
  }
  return source
})

function cardFrontBg(card) {
  if (card.topic_color) return `linear-gradient(135deg, ${card.topic_color} 0%, ${adjustColor(card.topic_color, -20)} 100%)`
  return cssVar('--primary', '#2c3e6b')
}

function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.min(255, (num >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount))
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount))
  return '#' + (r * 65536 + g * 256 + b).toString(16).padStart(6, '0')
}

function cardState(id) {
  return cardStates[id] || 'front'
}

function cardFlipClass(id) {
  const s = cardStates[id] || 'front'
  if (s === 'left') return 'flip-left'
  if (s === 'right') return 'flip-right'
  return ''
}

function setCardState(id, state) {
  cardStates[id] = state
  if (state !== 'front') cardsReviewed.value.add(id)
}

function handleCardClick(id, event) {
  const currentState = cardStates[id] || 'front'
  const card = event.currentTarget
  const rect = card.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const isLeftHalf = clickX < rect.width / 2

  if (currentState === 'front') {
    setCardState(id, isLeftHalf ? 'left' : 'right')
  } else if (currentState === 'left') {
    setCardState(id, isLeftHalf ? 'front' : 'right')
  } else {
    setCardState(id, isLeftHalf ? 'left' : 'front')
  }
}

function showHint(id) {
  showingHint.value = showingHint.value === id ? null : id
}

function filterCards(key) {
  cardFilter.value = key
}

function shuffleCards() {
  const arr = [...filteredCards.value]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  shuffledCards.value = arr
}

function flipAllCards() {
  filteredCards.value.forEach(card => {
    if ((cardStates[card.id] || 'front') === 'front') {
      setCardState(card.id, 'left')
    }
  })
}

function resetCards() {
  for (const id of Object.keys(cardStates)) {
    delete cardStates[id]
  }
  cardsReviewed.value.clear()
}

// ==================== 刷题 ====================
const quizType = ref('choice')
const autoNext = ref(false)
const lastCorrect = ref(false)
const showAnswerCard = ref(false)
const showShortAnswer = ref(false)
const shortAnswer = ref('')

function isAiSource(value) { return /AI/i.test(String(value || '')) }
function answerSourceLabel(value) { return isAiSource(value) ? 'AI 生成' : '原文有答案' }

// ===== 看板娘 AI 小帮：悬浮菜单状态 =====
const aiMenuOpen = ref(false)
const aiLoading = ref(false)
// 工具箱结果面板（iframe 里的独立浮层；父页面的看板娘气泡在 iframe 外，收不到 window 事件）
const aiPanel = ref(null)
const ragQuery = ref('')
const ragAnswer = ref('')
const ragSources = ref([])
const ragLoading = ref(false)
const ragError = ref('')
let lastRagAt = 0
const FAB_POS_KEY = 'zg.studyFab.v1'
const fabPos = ref(readFabPos())
function readFabPos() {
  try {
    const p = JSON.parse(localStorage.getItem(FAB_POS_KEY) || 'null')
    if (p && Number.isFinite(p.left) && Number.isFinite(p.bottom)) return p
  } catch (e) { /* ignore */ }
  return { left: Math.min(244, Math.max(12, window.innerWidth - 72)), bottom: 80 }
}
function fabPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return
  e.preventDefault()
  const sx = e.clientX, sy = e.clientY
  const ox = fabPos.value.left, oy = fabPos.value.bottom
  let moved = false
  const move = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true
    if (!moved) return
    fabPos.value = {
      left: Math.min(window.innerWidth - 64, Math.max(8, ox + dx)),
      bottom: Math.min(window.innerHeight - 64, Math.max(8, oy - dy)),
    }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (moved) {
      try { localStorage.setItem(FAB_POS_KEY, JSON.stringify(fabPos.value)) } catch (e) { /* ignore */ }
      aiMenuOpen.value = false
    } else {
      aiMenuOpen.value = !aiMenuOpen.value
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up, { once: true })
}
// 菜单默认向上展开；上方空间不足时改为向下，并限制高度避免顶出 iframe
const menuUp = computed(() => window.innerHeight - fabPos.value.bottom - 62 >= 180)
const menuMaxHeight = computed(() => {
  const up = window.innerHeight - fabPos.value.bottom - 62
  const down = fabPos.value.bottom - 62
  return Math.max(150, Math.min(420, menuUp.value ? up : down))
})
function openAiPanel(title) {
  aiPanel.value = { title, loading: true, text: '', html: '', action: null }
}
function closeAiPanel() { aiPanel.value = null }
function runAiAction() {
  const action = aiPanel.value && aiPanel.value.action
  if (!action) return
  closeAiPanel()
  if (action.type === 'navigate') router.push(action.path)
}
function notifyParent(payload) {
  try { window.parent.postMessage(payload, '*') } catch (e) { /* ignore */ }
}
// 简答题用户答案记录（qid -> 用户输入），供"简答记忆"功能对比分析
const shortUserAnswers = reactive({})
const shuffleOptions = ref(false)
const shuffleQuestions = ref(false)

// 题目乱序切换时重置当前题型进度
watch(shuffleQuestions, () => {
  choiceIndex.value = 0
  judgeIndex.value = 0
  shortIndex.value = 0
  codeFillIndex.value = 0
})

// Fisher-Yates 洗牌算法
function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 按题型分类（支持乱序）
const codeFillQuestions = computed(() => {
  const list = allQuestions.value.filter(q => q.type === 'code_fill')
  return shuffleQuestions.value ? shuffleArray(list) : list
})
const choiceQuestions = computed(() => {
  const list = allQuestions.value.filter(q => q.type === 'choice' || q.type === 'multi')
  return shuffleQuestions.value ? shuffleArray(list) : list
})
const judgeQuestions = computed(() => {
  const list = allQuestions.value.filter(q => q.type === 'judge')
  return shuffleQuestions.value ? shuffleArray(list) : list
})
const shortQuestions = computed(() => {
  const list = allQuestions.value.filter(q => q.type === 'short' || q.type === 'comprehensive')
  return shuffleQuestions.value ? shuffleArray(list) : list
})

const quizTypeTabs = computed(() => [
  { value: 'choice', label: '选择题', count: choiceQuestions.value.length },
  { value: 'judge', label: '判断题', count: judgeQuestions.value.length },
  { value: 'short', label: '简答题', count: shortQuestions.value.length },
  { value: 'code_fill', label: '代码填空', count: codeFillQuestions.value.length },
])

// 选择题状态
const choiceIndex = ref(0)
const choiceAnsweredMap = reactive({})
const choiceShuffleMap = reactive({})
const choiceProgress = computed(() => Math.round((choiceIndex.value / Math.max(choiceQuestions.value.length, 1)) * 100))
const currentChoice = computed(() => choiceQuestions.value[choiceIndex.value] || {})
const currentChoiceDisplayOpts = computed(() => {
  const q = currentChoice.value
  if (!q.id) return []
  if (shuffleOptions.value && choiceShuffleMap[q.id]) return choiceShuffleMap[q.id].opts
  return q.options || []
})

// 判断题状态
const judgeIndex = ref(0)
const judgeAnsweredMap = reactive({})
const judgeProgress = computed(() => Math.round((judgeIndex.value / Math.max(judgeQuestions.value.length, 1)) * 100))
const currentJudge = computed(() => judgeQuestions.value[judgeIndex.value] || {})

// 简答题状态
const shortIndex = ref(0)
const shortAnsweredMap = reactive({})  // qid -> true (表示已查看答案)
const shortProgress = computed(() => Math.round((shortIndex.value / Math.max(shortQuestions.value.length, 1)) * 100))
const currentShort = computed(() => shortQuestions.value[shortIndex.value] || {})

// 同步当前简答题输入到记录（供"简答记忆"对比分析用）
watch([shortAnswer, currentShort], () => {
  if (currentShort.value && currentShort.value.id) {
    shortUserAnswers[currentShort.value.id] = shortAnswer.value
  }
})

// 代码填空状态
const codeFillIndex = ref(0)
const codeFillAnswers = reactive({})  // qid -> [optIdx, ...]
const codeFillAnsweredMap = reactive({})  // qid -> true/false
const codeFillAnswered = computed(() => codeFillAnsweredMap[currentCodeFill.value?.id] !== undefined)
const codeFillCorrect = ref(false)
const showCodeFillAnswer = ref(false)
const currentCodeFill = computed(() => codeFillQuestions.value[codeFillIndex.value] || {})
const codeFillContainer = ref(null)
const popupVisible = ref(false)
const activeBlankIndex = ref(0)
const popupStyle = reactive({ left: 0, top: 0 })

const codeFillProgress = computed(() => Math.round((codeFillIndex.value / Math.max(codeFillQuestions.value.length, 1)) * 100))

const codeFillParts = computed(() => {
  const q = currentCodeFill.value
  if (!q.code) return []
  const parts = q.code.split('____')
  return parts.map(p => escapeHtml(p).replace(/\n/g, '<br>'))
})

const currentBlankOptions = computed(() => {
  const q = currentCodeFill.value
  if (!q.options || !q.options[activeBlankIndex.value]) return []
  return q.options[activeBlankIndex.value]
})

const codeFillFilledCount = computed(() => {
  const q = currentCodeFill.value
  if (!q.id || !q.blanks) return 0
  const answers = codeFillAnswers[q.id] || []
  return answers.filter(a => a !== undefined).length
})

// 答题卡相关（根据当前题型动态切换）
const currentQuizTotal = computed(() => {
  switch (quizType.value) {
    case 'choice': return choiceQuestions.value.length
    case 'judge': return judgeQuestions.value.length
    case 'short': return shortQuestions.value.length
    case 'code_fill': return codeFillQuestions.value.length
    default: return 0
  }
})

const currentQuizOrder = computed(() => {
  switch (quizType.value) {
    case 'choice': return choiceQuestions.value.map(q => q.id)
    case 'judge': return judgeQuestions.value.map(q => q.id)
    case 'short': return shortQuestions.value.map(q => q.id)
    case 'code_fill': return codeFillQuestions.value.map(q => q.id)
    default: return []
  }
})

const currentAnsweredMap = computed(() => {
  switch (quizType.value) {
    case 'choice': return choiceAnsweredMap
    case 'judge': return judgeAnsweredMap
    case 'short': return shortAnsweredMap
    case 'code_fill': return codeFillAnsweredMap
    default: return {}
  }
})

const answeredCount = computed(() => Object.keys(currentAnsweredMap.value).length)

const correctCount = computed(() => {
  const map = currentAnsweredMap.value
  return Object.values(map).filter(a => a === true || (a && a.correct)).length
})

const wrongCount = computed(() => answeredCount.value - correctCount.value)

function switchQuizType(type) {
  quizType.value = type
  showShortAnswer.value = false
  shortAnswer.value = ''
  showCodeFillAnswer.value = false
}

function getTypeName(t) {
  const map = { choice: '选择题', judge: '判断题', short: '简答题', comprehensive: '综合分析', fill: '填空题', code_fill: '代码填空', multi: '多选题' }
  return map[t] || t
}

function getTypeColor(t) {
  const map = {
    choice: cssVar('--primary', '#2c3e6b'),
    judge: cssVar('--warning', '#d97706'),
    short: cssVar('--success', '#4d7c5f'),
    comprehensive: cssVar('--danger', '#b91c1c'),
    fill: cssVar('--primary', '#2c3e6b'),
    code_fill: cssVar('--danger', '#b91c1c'),
    multi: cssVar('--info', '#7c5cbf')
  }
  return map[t] || cssVar('--primary', '#2c3e6b')
}

function parseAnswer(ans) {
  if (!ans) return 0
  const s = String(ans).trim()
  if (/^\d+$/.test(s)) return parseInt(s)
  if (/^[A-H]$/i.test(s)) return s.toUpperCase().charCodeAt(0) - 65
  if (s === 'true' || s === '对' || s === '正确' || s === 'A') return true
  if (s === 'false' || s === '错' || s === '错误' || s === 'B') return false
  return s
}

function getChoiceOptionClass(i) {
  const q = currentChoice.value
  if (!q.id) return ''
  const answered = choiceAnsweredMap[q.id]
  if (!answered) return 'option'
  const correctIdx = parseAnswer(q.answer)
  let cls = 'option'
  if (i === correctIdx) cls += ' correct'
  else if (answered.ans === i && i !== correctIdx) cls += ' wrong'
  return cls
}

function answerChoice(i) {
  const q = currentChoice.value
  if (!q.id || choiceAnsweredMap[q.id]) return

  // 选项乱序
  if (shuffleOptions.value && !choiceShuffleMap[q.id]) {
    const opts = q.options || []
    const indices = opts.map((_, idx) => idx)
    for (let k = indices.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1))
      ;[indices[k], indices[j]] = [indices[j], indices[k]]
    }
    const correctIdx = parseAnswer(q.answer)
    choiceShuffleMap[q.id] = {
      opts: indices.map(idx => opts[idx]),
      mapping: indices,
      correctIdx: indices.indexOf(correctIdx)
    }
  }

  const correctIdx = choiceShuffleMap[q.id] ? choiceShuffleMap[q.id].correctIdx : parseAnswer(q.answer)
  const isCorrect = i === correctIdx
  choiceAnsweredMap[q.id] = { ans: i, correct: isCorrect }
  lastCorrect.value = isCorrect
  window.dispatchEvent(new CustomEvent(isCorrect ? 'kaoshibang:quiz-correct' : 'kaoshibang:quiz-wrong'))

  if (autoNext.value && isCorrect) setTimeout(nextChoice, 1000)
}

function nextChoice() {
  if (choiceIndex.value < choiceQuestions.value.length - 1) {
    choiceIndex.value++
  } else {
    choiceIndex.value = 0
  }
}

function prevChoice() {
  if (choiceIndex.value > 0) choiceIndex.value--
  else choiceIndex.value = choiceQuestions.value.length - 1
}

function getJudgeClass(val) {
  const q = currentJudge.value
  if (!q.id) return ''
  const answered = judgeAnsweredMap[q.id]
  if (!answered) return 'judge-btn'
  const correctAns = parseAnswer(q.answer)
  let cls = 'judge-btn'
  if (val === correctAns) cls += ' correct'
  else if (answered.ans === val && val !== correctAns) cls += ' wrong'
  return cls
}

function answerJudge(val) {
  const q = currentJudge.value
  if (!q.id || judgeAnsweredMap[q.id]) return
  const correctAns = parseAnswer(q.answer)
  const isCorrect = val === correctAns
  judgeAnsweredMap[q.id] = { ans: val, correct: isCorrect }
  lastCorrect.value = isCorrect
  window.dispatchEvent(new CustomEvent(isCorrect ? 'kaoshibang:quiz-correct' : 'kaoshibang:quiz-wrong'))
  if (autoNext.value && isCorrect) setTimeout(nextJudge, 1000)
}

function nextJudge() {
  if (judgeIndex.value < judgeQuestions.value.length - 1) judgeIndex.value++
  else judgeIndex.value = 0
}

function prevJudge() {
  if (judgeIndex.value > 0) judgeIndex.value--
  else judgeIndex.value = judgeQuestions.value.length - 1
}

function nextShort() {
  if (shortIndex.value < shortQuestions.value.length - 1) shortIndex.value++
  else shortIndex.value = 0
  showShortAnswer.value = false
  shortAnswer.value = ''
}

function prevShort() {
  if (shortIndex.value > 0) shortIndex.value--
  else shortIndex.value = shortQuestions.value.length - 1
  showShortAnswer.value = false
  shortAnswer.value = ''
}

function toggleShortAnswer() {
  showShortAnswer.value = !showShortAnswer.value
  // 查看答案后标记为已答（简答题以查看答案为已完成）
  if (showShortAnswer.value && currentShort.value.id) {
    shortAnsweredMap[currentShort.value.id] = true
  }
}

function escapeHtml(s) {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getBlankAnswer(blankIdx) {
  const q = currentCodeFill.value
  if (!q.id) return undefined
  return codeFillAnswers[q.id]?.[blankIdx]
}

function getBlankDisplayText(blankIdx) {
  const q = currentCodeFill.value
  if (!q.id || !q.options) return `[${q.blanks?.[blankIdx] || '空'}]`
  const answerIdx = getBlankAnswer(blankIdx)
  if (answerIdx !== undefined && q.options[blankIdx]) {
    return q.options[blankIdx][answerIdx]
  }
  return `[${q.blanks?.[blankIdx] || '空'}]`
}

function getBlankButtonClass(blankIdx) {
  const q = currentCodeFill.value
  if (!q.id) return 'blank-button'
  let cls = 'blank-button'
  const answerIdx = getBlankAnswer(blankIdx)
  if (answerIdx !== undefined) {
    cls += ' selected'
  }
  if (codeFillAnsweredMap[q.id] !== undefined) {
    if (q.answers[blankIdx] === answerIdx) {
      cls += ' correct'
    } else {
      cls += ' wrong'
    }
  }
  return cls
}

function handleCodeFillClick(e) {
  if (codeFillAnswered.value) return
  const target = e.target
  if (target.classList.contains('blank-button')) {
    const blankIdx = parseInt(target.dataset.blank)
    activeBlankIndex.value = blankIdx
    // 计算弹窗位置
    const rect = target.getBoundingClientRect()
    const containerRect = codeFillContainer.value.getBoundingClientRect()
    popupStyle.left = rect.left - containerRect.left
    popupStyle.top = rect.bottom - containerRect.top + 5
    popupVisible.value = true
  } else {
    popupVisible.value = false
  }
}

function selectBlankOption(optIdx) {
  const q = currentCodeFill.value
  if (!q.id) return
  if (!codeFillAnswers[q.id]) {
    codeFillAnswers[q.id] = []
  }
  codeFillAnswers[q.id][activeBlankIndex.value] = optIdx
  popupVisible.value = false
}

function submitCodeFill() {
  const q = currentCodeFill.value
  if (!q.id || codeFillAnsweredMap[q.id] !== undefined) return
  const answers = codeFillAnswers[q.id] || []
  let allCorrect = true
  for (let i = 0; i < q.answers.length; i++) {
    if (answers[i] !== q.answers[i]) allCorrect = false
  }
  codeFillAnsweredMap[q.id] = allCorrect
  codeFillCorrect.value = allCorrect
  showCodeFillAnswer.value = true
  popupVisible.value = false
}

function nextCodeFill() {
  if (codeFillIndex.value < codeFillQuestions.value.length - 1) codeFillIndex.value++
  else codeFillIndex.value = 0
  showCodeFillAnswer.value = false
  popupVisible.value = false
}

function prevCodeFill() {
  if (codeFillIndex.value > 0) codeFillIndex.value--
  else codeFillIndex.value = codeFillQuestions.value.length - 1
  showCodeFillAnswer.value = false
  popupVisible.value = false
}

function getCardItemClass(qid) {
  const map = currentAnsweredMap.value
  const a = map[qid]
  let cls = 'card-item'
  if (!a) cls += ' u'
  else if (a === true || (a && a.correct)) cls += ' c'
  else cls += ' w'
  return cls
}

function jumpToQuestion(idx) {
  switch (quizType.value) {
    case 'choice': choiceIndex.value = idx; break
    case 'judge': judgeIndex.value = idx; break
    case 'short': 
      shortIndex.value = idx
      showShortAnswer.value = false
      shortAnswer.value = ''
      break
    case 'code_fill': 
      codeFillIndex.value = idx
      showCodeFillAnswer.value = false
      popupVisible.value = false
      break
  }
  showAnswerCard.value = false
}

// 清空当前题型的答题记录
function resetCurrentQuiz() {
  switch (quizType.value) {
    case 'choice':
      for (const k of Object.keys(choiceAnsweredMap)) delete choiceAnsweredMap[k]
      for (const k of Object.keys(choiceShuffleMap)) delete choiceShuffleMap[k]
      choiceIndex.value = 0
      break
    case 'judge':
      for (const k of Object.keys(judgeAnsweredMap)) delete judgeAnsweredMap[k]
      judgeIndex.value = 0
      break
    case 'short':
      for (const k of Object.keys(shortAnsweredMap)) delete shortAnsweredMap[k]
      shortIndex.value = 0
      showShortAnswer.value = false
      shortAnswer.value = ''
      break
    case 'code_fill':
      for (const k of Object.keys(codeFillAnsweredMap)) delete codeFillAnsweredMap[k]
      for (const k of Object.keys(codeFillAnswers)) delete codeFillAnswers[k]
      codeFillIndex.value = 0
      showCodeFillAnswer.value = false
      popupVisible.value = false
      break
  }
}

// 收藏相关
const favoriteIds = ref(new Set())

function isFavorited(qid) {
  return favoriteIds.value.has(qid)
}

async function handleFavorite(qid) {
  if (!qid) return
  try {
    await toggleFavorite(qid)
    if (favoriteIds.value.has(qid)) {
      favoriteIds.value.delete(qid)
    } else {
      favoriteIds.value.add(qid)
      window.dispatchEvent(new CustomEvent('kaoshibang:favorited'))
    }
    // 更新收藏列表
    const favRes = await getFavoriteList()
    favorites.value = (favRes.data || []).filter(q => q.subjectId == subjectId || q.subject_id == subjectId)
  } catch (e) {
    console.error('收藏失败:', e)
  }
}

function goToQuestion(q) {
  // 跳转到对应题型的该题
  const allQ = allQuestions.value
  const idx = allQ.findIndex(item => item.id === q.id)
  if (idx < 0) return
  const type = q.type
  if (type === 'choice' || type === 'multi') {
    const qIdx = choiceQuestions.value.findIndex(item => item.id === q.id)
    if (qIdx >= 0) { quizType.value = 'choice'; choiceIndex.value = qIdx }
  } else if (type === 'judge') {
    const qIdx = judgeQuestions.value.findIndex(item => item.id === q.id)
    if (qIdx >= 0) { quizType.value = 'judge'; judgeIndex.value = qIdx }
  } else if (type === 'short' || type === 'comprehensive') {
    const qIdx = shortQuestions.value.findIndex(item => item.id === q.id)
    if (qIdx >= 0) { quizType.value = 'short'; shortIndex.value = qIdx }
  } else if (type === 'code_fill') {
    const qIdx = codeFillQuestions.value.findIndex(item => item.id === q.id)
    if (qIdx >= 0) { quizType.value = 'code_fill'; codeFillIndex.value = qIdx }
  }
  activeTab.value = 'quiz'
}

// 头部背景：随主题取色板（主题切换时自动重算），按科目轮换
const themeId = useTheme()
const headerGradient = computed(() => {
  void themeId.value // 依赖当前主题，切换时重算
  const gradients = [
    cssVar('--header-grad-a', '#2c3e6b'),
    cssVar('--warning', '#d97706'),
    cssVar('--primary', '#2c3e6b'),
    cssVar('--success', '#4d7c5f'),
    cssVar('--accent', '#d97706'),
    cssVar('--info', '#7c5cbf'),
    cssVar('--header-grad-b', '#1e2d50'),
  ]
  const idx = Number(subjectId) % gradients.length
  const c = gradients[idx] || gradients[0]
  return `linear-gradient(150deg, ${c} 0%, ${adjustColor(c.replace('#', '#'), -18)} 100%)`
})

// 加载数据
async function loadData() {
  try {
    let d
    if (isMarketMode) {
      // 市场预览模式：从市场接口取数据
      const res = await getMarketDetail(subjectId)
      const md = res.data
      d = {
        subject: { id: md.subjectId, name: md.subjectName, icon: md.subjectIcon },
        flashcards: md.flashcards || [],
        questions: md.questions || [],
        totalQuestions: md.totalQuestions || 0,
        knowledgePoints: [],
      }
      marketOwner.value = md.ownerName
    } else {
      // 正常模式：从复习接口取数据
      const res = await getSubjectReview(subjectId, versionId)
      d = res.data
    }

    subject.value = d.subject
    flashcards.value = d.flashcards || []
    allQuestions.value = d.questions || []
    totalQuestions.value = d.totalQuestions || 0
    // 记录最近复习的科目（供"科目关联分析"使用）
    trackRecentSubject()

    // 市场模式下不加载收藏
    if (!isMarketMode) {
      try {
        const favRes = await getFavoriteList()
        favorites.value = (favRes.data || []).filter(q => q.subjectId == subjectId || q.subject_id == subjectId)
        favoriteIds.value = new Set(favorites.value.map(q => q.id))
      } catch (e) {}
      try {
        const wrongRes = await getWrongQuestions()
        wrongQuestions.value = (wrongRes.data || []).filter(q => Number(q.subjectId) === Number(subjectId))
      } catch (e) {}

      // 看板娘错题知识点主动讲解：用户在人物壁纸页勾选后才触发，节省 token
      try {
        if (localStorage.getItem('live2d-wrong-review-enabled') === '1') {
          window.dispatchEvent(new CustomEvent('kaoshibang:wrong-review', {
            detail: {
              subjectName: subject.value.name || '',
              wrongQuestions: wrongQuestions.value,
            },
          }))
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error('加载失败:', e)
  }
}

onMounted(loadData)

/* ===== 看板娘 AI 小帮：5 个分析动作 + 报告页生成 =====
 * 各动作调用后端 AI，把回复通过 kaoshibang:ai-show 事件交给看板娘持久显示+TTS。
 * 科目关联（link）需要"最近复习科目"列表，从 localStorage 读取（进入科目页时记录）。
 */
const RECENT_SUBJECTS_KEY = 'live2d-recent-subjects'

function trackRecentSubject() {
  try {
    const raw = localStorage.getItem(RECENT_SUBJECTS_KEY)
    let arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) arr = []
    // 收集本科目的知识点主题（去重）
    const topics = [...new Set(
      allQuestions.value.map(q => q.topic).filter(t => t && t.trim())
    )].slice(0, 8)
    const id = Number(subjectId)
    arr = arr.filter(s => s.id !== id)
    arr.unshift({ id, name: subject.value.name || '', topics, ts: Date.now() })
    // 只保留最近 6 个科目
    arr = arr.slice(0, 6)
    localStorage.setItem(RECENT_SUBJECTS_KEY, JSON.stringify(arr))
  } catch (e) { /* ignore */ }
}

function getRecentSubjects() {
  try {
    const raw = localStorage.getItem(RECENT_SUBJECTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) { return [] }
}

// 把回复交给看板娘持久显示 + TTS
function showAiReply(text, action) {
  window.dispatchEvent(new CustomEvent('kaoshibang:ai-show', {
    detail: { text, persistent: true, action: action || null }
  }))
}

// 精简题目数据，发给 AI（控 token）
function slimQuestions(list, max = 25) {
  if (!Array.isArray(list)) return []
  return list.slice(0, max).map(q => ({
    type: q.type || '',
    topic: q.topic || '',
    stem: (q.stem || '').slice(0, 120),
    answer: (q.answer || '').slice(0, 80),
    options: q.options || '',
  }))
}

async function askRag() {
  const q = ragQuery.value.trim()
  if (!q || ragLoading.value || Date.now() - lastRagAt < 900) return
  lastRagAt = Date.now()
  ragLoading.value = true
  ragError.value = ''
  ragAnswer.value = ''
  ragSources.value = []
  try {
    const res = await aiRagAsk(q, subjectId)
    const r = res?.data || res || {}
    ragAnswer.value = String(r.answer || '').trim() || '没有拿到回答，请稍后重试。'
    ragSources.value = Array.isArray(r.sources) ? r.sources : []
  } catch (e) {
    ragError.value = e?.message || '知识库问答失败，请稍后重试。'
  } finally {
    ragLoading.value = false
  }
}

async function aiAction(type) {
  if (aiLoading.value) return
  // 市场预览模式下不允许（无错题/答题数据）
  if (isMarketMode) {
    showToast('预览模式下小帮帮不了你，收录科目后再来吧~')
    return
  }
  aiMenuOpen.value = false
  const name = subject.value.name || '这科'
  const toolName = { summary: '总结考点', steps: '错题精讲', memo: '简答记忆', link: '科目关联', page: '生成报告页', rag: '知识库问答', agent: 'Agent 任务' }[type] || '小帮'

  // 知识库问答（RAG）：只检索平台公开题库/岗位/企业/房源，不读个人资料和用户上传文件
  if (type === 'rag') {
    ragAnswer.value = ''
    ragSources.value = []
    ragError.value = ''
    ragQuery.value = ''
    aiPanel.value = { title: '知识库问答', type: 'rag', loading: false, html: '', text: '', action: null }
    return
  }
  // Agent 任务：交给父页面的看板娘输入框（iframe 里的 window 事件传不到父页面，得用 postMessage）
  if (type === 'agent') {
    notifyParent({ type: 'zg:study-mode', mode: 'agent' })
    showToast('已把看板娘切到 Agent 模式，去输入框派任务吧～')
    return
  }

  // 先做数据检查，避免打开一个永远转圈的面板
  let memoItems = []
  let recents = []
  if (type === 'memo') {
    memoItems = shortQuestions.value
      .filter(q => q.id && shortUserAnswers[q.id] && shortUserAnswers[q.id].trim())
      .slice(0, 4)
      .map(q => ({
        stem: (q.stem || '').slice(0, 100),
        userAnswer: (shortUserAnswers[q.id] || '').slice(0, 150),
        correctAnswer: (q.answer || '').slice(0, 200),
      }))
    if (!memoItems.length) {
      aiPanel.value = { title: toolName, loading: false, html: '', text: '先去做几道简答题并写下答案，小帮才能对比你的答案帮你记牢哦～', action: null }
      return
    }
  }
  if (type === 'link') {
    recents = getRecentSubjects()
    if (recents.length < 2) {
      aiPanel.value = { title: toolName, loading: false, html: '', text: '再多复习一个科目吧，两个以上我才能帮你找出它们之间的关联呀～', action: null }
      return
    }
  }
  // 报告页最贵（约 30 秒、输出一整页 HTML），先让用户确认
  if (type === 'page') {
    try {
      await showConfirmDialog({
        title: '生成 AI 复习报告',
        message: '会根据当前科目题库生成一整页网页报告，约 30 秒，消耗的 token 较多。继续吗？',
        confirmButtonText: '开始生成',
        cancelButtonText: '先不生成',
      })
    } catch (e) {
      return
    }
  }

  openAiPanel(toolName)
  aiLoading.value = true
  window.dispatchEvent(new CustomEvent('kaoshibang:ai-busy', { detail: { active: true, tool: toolName } }))
  notifyParent({ type: 'zg:ai-busy', active: true, tool: toolName })
  try {
    if (type === 'summary') {
      const res = await aiStudySummary(name, slimQuestions(allQuestions.value, 25))
      aiPanel.value = { ...aiPanel.value, loading: false, text: res.data.reply || '总结好啦~' }
    } else if (type === 'steps') {
      const res = await aiWrongSteps(name, slimQuestions(wrongQuestions.value, 5))
      aiPanel.value = { ...aiPanel.value, loading: false, text: res.data.reply || '解题步骤整理好啦~' }
    } else if (type === 'memo') {
      const res = await aiShortMemo(name, memoItems)
      aiPanel.value = { ...aiPanel.value, loading: false, text: res.data.reply || '记忆顺口溜编好啦~' }
    } else if (type === 'link') {
      const res = await aiSubjectLink(recents.map(s => ({ name: s.name, topics: s.topics || [] })))
      aiPanel.value = { ...aiPanel.value, loading: false, text: res.data.reply || '科目关联分析好啦~' }
    } else if (type === 'page') {
      const res = await aiGeneratePage(name, slimQuestions(allQuestions.value, 20), slimQuestions(wrongQuestions.value, 8))
      const html = res.data.html || ''
      if (!html) throw new Error('报告生成失败')
      const title = res.data.title || (name + ' AI 复习报告')
      let pageId = 'r' + Date.now()
      try {
        const saveRes = await aiPageSave({ title, html, subjectId: subjectId })
        if (saveRes.code === 200 && saveRes.data?.id) pageId = String(saveRes.data.id)
      } catch (e) { /* 云端失败走本地兜底 */ }
      try {
        localStorage.setItem('ai-page-' + pageId, JSON.stringify({ html, title, ts: Date.now() }))
        const idxRaw = localStorage.getItem('ai-page-index')
        const idx = idxRaw ? JSON.parse(idxRaw) : []
        idx.unshift({ id: pageId, title, time: new Date().toLocaleString('zh-CN') })
        localStorage.setItem('ai-page-index', JSON.stringify(idx.slice(0, 20)))
      } catch (e) { /* ignore */ }
      aiPanel.value = {
        ...aiPanel.value,
        loading: false,
        text: '',
        html,
        action: { label: '📄 打开独立报告页', type: 'navigate', path: '/ai-page/' + pageId },
      }
    }
  } catch (e) {
    if (aiPanel.value) {
      aiPanel.value = { ...aiPanel.value, loading: false, text: '小帮开小差了：' + ((e && e.message) || '稍后再试～') }
    } else {
      showToast('小帮开小差了，稍后再试~')
    }
  } finally {
    aiLoading.value = false
    window.dispatchEvent(new CustomEvent('kaoshibang:ai-busy', { detail: { active: false } }))
    notifyParent({ type: 'zg:ai-busy', active: false })
  }
}

/* ===== 错题操作：已学会 / 删除 ===== */
async function markWrongLearned(qid) {
  try {
    await showConfirmDialog({ title: '已学会', message: '标记为已学会？将从错题本移除' })
    await removeWrongQuestion(qid)
    wrongQuestions.value = wrongQuestions.value.filter(q => q.id !== qid)
    showToast('已从错题本移除')
  } catch (e) {}
}
async function addWrongQuestion(qid) {
  try {
    const res = await apiAddWrongQuestion(qid)
    showToast(res.message || '已加入错题集')
    const wrongRes = await getWrongQuestions()
    wrongQuestions.value = (wrongRes.data || []).filter(q => Number(q.subjectId) === Number(subjectId))
  } catch (e) {
    showToast('加入失败')
  }
}
async function removeWrong(qid) {
  try {
    await showConfirmDialog({ title: '删除错题', message: '确定删除这条错题记录？' })
    await removeWrongQuestion(qid)
    wrongQuestions.value = wrongQuestions.value.filter(q => q.id !== qid)
    showToast('已删除')
  } catch (e) {}
}
/* ===== 从"问问AI"chip 跳回：精确定位（tab + 题型 + 题目索引 + 滚动到元素） ===== */
// tab 切换按钮：同步更新 URL（保证 URL 与当前 tab 一致，chip 跳回时 query.tab 才会变化触发定位）
function switchTab(key) {
  activeTab.value = key
  router.replace({ query: { ...route.query, tab: key, sel: undefined } })
}

watch(() => route.query.tab, (t) => {
  if (['cards', 'quiz', 'wrong'].includes(t)) activeTab.value = t
}, { immediate: true })

watch(() => route.query.qtype, (t) => {
  if (['choice', 'judge', 'short', 'code_fill'].includes(t)) {
    // 兜底：确保 tab 也被切到刷题（可能 URL 中 tab 值未变化导致 watch 未触发）
    if (route.query.tab === 'quiz') activeTab.value = 'quiz'
    quizType.value = t
  }
}, { immediate: true })

watch(() => route.query.qidx, (v) => {
  if (v === undefined || v === null || v === '') return
  const n = Number(v)
  if (isNaN(n) || n < 0) return
  if (route.query.tab === 'quiz') activeTab.value = 'quiz'
  if (quizType.value === 'choice' && choiceQuestions.value[n]) choiceIndex.value = n
  else if (quizType.value === 'judge' && judgeQuestions.value[n]) judgeIndex.value = n
  else if (quizType.value === 'short' && shortQuestions.value[n]) shortIndex.value = n
  else if (quizType.value === 'code_fill' && codeFillQuestions.value[n]) codeFillIndex.value = n
}, { immediate: true })

// 滚动到目标元素并闪烁高亮（数据/渲染异步，轮询等待元素出现）
function flashScroll(sel) {
  const deadline = Date.now() + 6000
  const timer = setInterval(() => {
    const el = document.querySelector(sel)
    if (el) {
      clearInterval(timer)
      scrollToElement(el)
    } else if (Date.now() > deadline) {
      clearInterval(timer)
    }
  }, 120)
}

// smooth 滚动 + 失效回退（部分环境下 smooth 不执行，检测后改 auto 立即定位）
function scrollToElement(el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const y0 = window.scrollY
  setTimeout(() => {
    if (Math.abs(window.scrollY - y0) < 2) {
      el.scrollIntoView({ behavior: 'auto', block: 'center' })
    }
    el.classList.add('ask-ai-flash')
    setTimeout(() => el.classList.remove('ask-ai-flash'), 2400)
  }, 500)
}

watch(() => route.query.sel, (sel) => {
  if (!sel) return
  // 兜底：URL 中 tab 值可能未变化（watch tab 未触发），这里强制切到 chip 目标 tab
  const t = route.query.tab
  if (['cards', 'quiz', 'wrong'].includes(t)) activeTab.value = t
  flashScroll(sel)
}, { immediate: true })

// 市场模式下确保不在收藏tab
watch(() => isMarketMode, (val) => {
  if (val && activeTab.value === 'wrong') {
    activeTab.value = 'cards'
  }
}, { immediate: true })

function goMarketDetail() {
  router.push(`/market/${subjectId}`)
}

/* ==================== 问问AI ==================== */
// 卡片 → 问AI（带上正反面内容，让AI讲解；chip 点击跳回具体卡片）
function askCardAI(card) {
  const arg = card;
  const stem = arg?.front || arg?.stem || arg?.question || arg?.content || String(arg || "");
  const answer = arg?.back || arg?.answer || arg?.quickAnswer || "";
  window.dispatchEvent(new CustomEvent("zg:tutor", { detail: { stem, answer } }));
  if (typeof showToast === "function") showToast("AI 老师准备中…");
}

// 当前刷题 → 问AI（按当前题型组装题干+选项）
function askQuizAI() {
  let content = ''
  let typeLabel = '题目'
  if (quizType.value === 'choice') {
    const q = currentChoice.value
    if (q && q.stem) {
      const opts = (q.options && q.options.length)
        ? '\n选项：' + q.options.map((o, i) => `${String.fromCharCode(65 + i)}.${o}`).join('  ')
        : ''
      content = `帮我解答这道选择题：${q.stem}${opts}`
      typeLabel = '选择题'
    }
  } else if (quizType.value === 'judge') {
    const q = currentJudge.value
    if (q && q.stem) {
      content = `帮我判断这道题：${q.stem}`
      typeLabel = '判断题'
    }
  } else if (quizType.value === 'short') {
    const q = currentShort.value
    if (q && q.stem) {
      content = `帮我解答这道简答题：${q.stem}`
      typeLabel = '简答题'
    }
  } else if (quizType.value === 'code_fill') {
    const q = currentCodeFill.value
    if (q && q.stem) {
      content = `帮我解答这道代码填空题：${q.stem}${q.code ? `\n代码：\n${q.code}` : ''}`
      typeLabel = '代码填空题'
    }
  }
  if (content) {
    // 记录当前题型和题目索引，chip 点击跳回时精确定位到该题
    let qidx = 0
    if (quizType.value === 'choice') qidx = choiceIndex.value
    else if (quizType.value === 'judge') qidx = judgeIndex.value
    else if (quizType.value === 'short') qidx = shortIndex.value
    else if (quizType.value === 'code_fill') qidx = codeFillIndex.value
    askAI(content, typeLabel, {
      path: `/review/${subjectId}`,
      tab: 'quiz',
      sel: `#quiz-area-${quizType.value}`,
      quizType: quizType.value,
      qidx,
    })
  }
}

// 收藏列表的题目 → 问AI
function askQuestionAI(q) {
  if (!q || !q.stem) return
  const opts = (q.options && q.options.length)
    ? '\n选项：' + q.options.map((o, i) => `${String.fromCharCode(65 + i)}.${o}`).join('  ')
    : ''
  askAI(`帮我解答这道题：${q.stem}${opts}`, '题目', {
    path: `/review/${subjectId}`,
    tab: 'wrong',
    sel: `#fav-item-${q.id}`,
  })
}
</script>

<style scoped>
.subject-page {
  min-height: 100vh;
  background: var(--bg);
}

.subject-header {
  text-align: center;
  color: var(--header-fg);
  padding: 36px 20px 28px;
  position: relative;
}

.back-btn {
  position: absolute;
  left: 16px;
  top: 16px;
  color: inherit;
  cursor: pointer;
  font-size: 20px;
  z-index: 2;
}

.subject-icon { font-size: 48px; margin-bottom: 8px; position: relative; }
.subject-header h1 { font-size: 1.6em; margin-bottom: 12px; }

.stats-bar {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  position: relative;
  z-index: 1;
}

/* Tab导航 */
.nav-tabs {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding: 20px 16px 12px;
  flex-wrap: wrap;
}

.nav-btn {
  padding: 8px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  box-shadow: var(--shadow);
  transition: all 0.2s;
}

.nav-btn:hover { transform: translateY(-2px); color: var(--primary); }

.nav-btn.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
  font-weight: 600;
}

/* 内容卡片 */
.content-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin: 0 16px 24px;
  padding: 20px;
  box-shadow: var(--shadow-md);
  min-height: 400px;
}

/* 市场预览横幅 */
.market-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 14px 16px 0;
  padding: 10px 16px;
  background: var(--warning-bg);
  border: 1px solid var(--warning);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--warning);
}

.banner-import-btn {
  padding: 5px 14px;
  border: none;
  border-radius: var(--chip-radius);
  background: var(--warning);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.banner-import-btn:hover { opacity: 0.88; }

/* 错题按钮（刷题头部） */
.wrong-add-btn {
  padding: 3px 10px;
  border: 1px solid var(--danger);
  border-radius: var(--chip-radius);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.wrong-add-btn:hover { background: var(--danger); color: #fff; }

/* ===== 卡片（大模型样式） ===== */
.cards-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.cards-filter {
  padding: 7px 14px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--chip-radius);
  background: var(--card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.3s;
}

.cards-filter:hover { border-color: var(--primary); color: var(--primary); }
.cards-filter.active { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }

.btn {
  padding: 7px 14px;
  border: none;
  border-radius: var(--chip-radius);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.3s;
}
.btn-success { background: var(--success); color: #fff; }
.btn-success:hover { background: var(--primary); }
.btn-secondary { background: var(--bg-alt); color: var(--text-secondary); }
.btn-secondary:hover { background: var(--border); }

.cards-stats {
  text-align: center;
  margin-bottom: 20px;
  font-size: 14px;
  color: var(--text-secondary);
}

.cards-stats span {
  background: var(--bg-alt);
  padding: 4px 10px;
  border-radius: var(--chip-radius);
  margin: 0 6px;
  font-weight: bold;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.flash-card {
  perspective: 1000px;
  height: 280px;
  cursor: pointer;
}

.flash-card.short-card {
  height: 400px;
}

.flash-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d;
}

.flash-card.flip-left .flash-card-inner {
  transform: rotateY(180deg);
}

.flash-card.flip-right .flash-card-inner {
  transform: rotateY(-180deg);
}

.flash-card-front,
.flash-card-back,
.flash-card-back-right {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-shadow: var(--shadow-md);
  box-sizing: border-box;
  border: 1px solid var(--border);
}

.flash-card-front {
  background: var(--primary);
  color: white;
  text-align: center;
}

.flash-card-back {
  background: var(--card);
  transform: rotateY(180deg);
  overflow-y: auto;
  text-align: left;
  align-items: flex-start;
  justify-content: flex-start;
}

.flash-card-back-right {
  background: var(--card);
  transform: rotateY(-180deg);
  overflow-y: auto;
  text-align: left;
  align-items: flex-start;
  justify-content: flex-start;
}

.flash-card-back.short-back {
  background: var(--card-alt);
}

.flash-card-back-right.short-back {
  background: var(--bg-alt);
}

.flash-card.flip-left .flash-card-back-right {
  visibility: hidden;
}

.flash-card.flip-right .flash-card-back {
  visibility: hidden;
}

.card-question-num {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(255, 255, 255, 0.3);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.card-type-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.3);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.card-question-text {
  font-size: 15px;
  line-height: 1.6;
  padding: 30px 10px;
  overflow-y: auto;
  max-height: calc(100% - 60px);
  white-space: pre-wrap;
  text-align: left;
}

.hint-bulb {
  position: absolute;
  top: 40px;
  left: 12px;
  font-size: 1.3em;
  cursor: pointer;
  z-index: 2;
}

.hint-popup {
  position: absolute;
  top: 70px;
  left: 12px;
  right: 12px;
  background: var(--card);
  border: 1px solid var(--warning);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.82em;
  color: var(--warning);
  line-height: 1.6;
  text-align: left;
  z-index: 3;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
  box-shadow: var(--shadow-md);
}

.hint-popup.show {
  opacity: 1;
  pointer-events: auto;
}

.front-hint {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
}

.card-answer-header {
  background: var(--primary-dark);
  color: var(--on-primary);
  padding: 10px 15px;
  font-weight: bold;
  font-size: 14px;
  width: 100%;
  text-align: center;
  margin-bottom: 10px;
  border-radius: var(--radius-sm);
  box-sizing: border-box;
}

.card-answer-content {
  flex: 1;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text);
  width: 100%;
}

.card-answer-content pre {
  white-space: pre-wrap;
  font-family: inherit;
  margin: 0;
}

.card-nav-hints {
  display: flex;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
  width: 100%;
}

.card-nav-hints span {
  flex: 1;
  text-align: center;
  padding: 6px 4px;
  background: var(--primary-bg);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
  color: var(--primary);
}

.card-nav-hints span:hover {
  background: var(--primary);
  color: var(--on-primary);
}

/* ===== 刷题 ===== */
.quiz-type-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 18px;
  flex-wrap: wrap;
  border-bottom: 2px solid var(--border-light);
  padding-bottom: 12px;
}

.qtab-btn {
  padding: 8px 16px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--chip-radius);
  background: var(--card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.3s;
}

.qtab-btn:hover { border-color: var(--primary); color: var(--primary); }
.qtab-btn.active { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }

.quiz-area { max-width: 700px; margin: 0 auto; }

.quiz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}

.quiz-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.q-type { color: var(--on-primary); padding: 4px 14px; border-radius: var(--chip-radius); font-size: 13px; }
.q-num { color: var(--text-secondary); font-size: 13px; }

.quiz-progress {
  width: 100%;
  height: 8px;
  background: var(--bg-alt);
  border-radius: var(--radius-pill);
  margin-bottom: 20px;
  overflow: hidden;
}

.quiz-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark));
  border-radius: var(--radius-pill);
  transition: width 0.3s;
}

.q-text { font-size: 17px; line-height: 1.8; margin-bottom: 20px; color: var(--text); }

.options { display: flex; flex-direction: column; gap: 10px; }

.option {
  padding: 14px 18px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--text);
}

.option:hover { border-color: var(--primary); background: var(--primary-bg); }
.option.correct { border-color: var(--success); background: var(--success-bg); }
.option.wrong { border-color: var(--danger); background: var(--danger-bg); }

.option-letter {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-pill);
  background: var(--bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
  font-size: 0.9em;
}

.option.correct .option-letter { background: var(--success); color: #fff; }
.option.wrong .option-letter { background: var(--danger); color: #fff; }

/* 判断题 */
.judge-options { display: flex; gap: 15px; justify-content: center; margin: 20px 0; }

.judge-btn {
  padding: 15px 50px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 1.1em;
  font-weight: bold;
  transition: all 0.3s;
  background: var(--card);
  color: var(--text);
}

.judge-btn:hover { border-color: var(--primary); background: var(--primary-bg); }
.judge-btn.correct { border-color: var(--success); background: var(--success-bg); color: var(--success); }
.judge-btn.wrong { border-color: var(--danger); background: var(--danger-bg); color: var(--danger); }

/* 简答题 */
.short-input-area textarea {
  width: 100%;
  min-height: 150px;
  padding: 18px;
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius);
  font-size: 14px;
  line-height: 1.8;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.3s;
  background: var(--bg-alt);
  color: var(--text);
  box-sizing: border-box;
}

.short-input-area textarea:focus {
  outline: none;
  border-color: var(--primary);
  border-style: solid;
  background: var(--card);
}

/* 答案区 */
.answer-area {
  margin-top: 20px;
  padding: 18px;
  background: var(--bg-alt);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  display: none;
}

.answer-area.show { display: block; }

.answer-label { font-weight: bold; color: var(--success); margin-bottom: 8px; }
.answer-explanation { color: var(--text-secondary); line-height: 1.8; }

.knowledge-tag {
  display: inline-block;
  background: var(--info-bg);
  color: var(--info);
  padding: 3px 10px;
  border-radius: var(--chip-radius);
  font-size: 12px;
  margin-top: 8px;
  margin-right: 6px;
}

/* 按钮组 */
.btn-group {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 14px 20px;
  background: var(--card);
  border-top: 1px solid var(--border-light);
  position: sticky;
  bottom: 0;
  z-index: 10;
  margin-top: 20px;
  flex-wrap: wrap;
}

.btn-primary { background: var(--primary); color: var(--on-primary); padding: 10px 25px; border-radius: var(--radius-pill); font-size: 15px; }
.btn-primary:hover { background: var(--primary-dark); transform: translateY(-2px); }
.btn-secondary { background: var(--bg-alt); color: var(--text-secondary); padding: 10px 25px; border-radius: var(--radius-pill); font-size: 15px; }
.btn-secondary:hover { background: var(--border); }
.btn-info { background: var(--primary); color: var(--on-primary); padding: 10px 25px; border-radius: var(--radius-pill); font-size: 15px; }
.btn-success { background: var(--success); color: #fff; padding: 10px 25px; border-radius: var(--radius-pill); font-size: 15px; }
.btn-warning { background: var(--warning); color: #fff; padding: 10px 25px; border-radius: var(--radius-pill); font-size: 15px; }
.btn-danger { background: var(--danger); color: #fff; padding: 10px 25px; border-radius: var(--radius-pill); font-size: 15px; }

.auto-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-light);
  cursor: pointer;
  user-select: none;
}

.auto-toggle input { accent-color: var(--primary); cursor: pointer; }

/* 代码填空 */
.code-fill-quiz {
  position: relative;
  max-width: 100% !important;
}

.fill-code {
  position: relative;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 24px 28px;
  border-radius: 12px;
  overflow-x: auto;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 15px;
  line-height: 2.0;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 15px 0;
  border: 1px solid #3a3a3a;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

/* 收藏按钮 */
.fav-btn {
  border: none;
  background: none;
  font-size: 22px;
  cursor: pointer;
  color: var(--text-light);
  transition: all 0.2s;
  padding: 2px 6px;
  border-radius: 50%;
  line-height: 1;
}

.fav-btn:hover {
  color: var(--warning);
  transform: scale(1.15);
}

.fav-btn.active {
  color: var(--warning);
  text-shadow: 0 0 8px rgba(128, 128, 128, 0.35);
}

/* 问问AI 按钮 */
.ask-ai-btn {
  padding: 5px 12px;
  border: none;
  border-radius: var(--chip-radius);
  background: linear-gradient(135deg, var(--header-grad-a), var(--header-grad-b));
  color: var(--header-fg);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s;
  box-shadow: var(--shadow);
}

.ask-ai-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

/* 卡片正面的问问AI按钮（右下角，避开底部提示） */
.card-ask-btn {
  position: absolute;
  bottom: 34px;
  right: 10px;
  z-index: 3;
  padding: 4px 10px;
  font-size: 11px;
}

.blank-button {
  display: inline-block;
  min-width: 100px;
  border: 2px dashed var(--warning);
  border-radius: var(--radius-sm);
  margin: 0 5px;
  padding: 2px 10px;
  background: var(--warning-bg);
  color: var(--warning);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
  font-size: 0.95em;
  vertical-align: middle;
}

.blank-button:hover {
  background: var(--warning);
  color: var(--card);
  transform: translateY(-1px);
  box-shadow: var(--shadow);
}

.blank-button.selected {
  background: var(--info);
  color: #fff;
  border-color: var(--info);
  border-style: solid;
}

.blank-button.correct {
  background: var(--success);
  color: #fff;
  border-color: var(--success);
  border-style: solid;
}

.blank-button.wrong {
  background: var(--danger);
  color: #fff;
  border-color: var(--danger);
  border-style: solid;
}

/* 选项弹窗 */
.options-popup {
  position: absolute;
  z-index: 100;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  min-width: 220px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
}

.popup-title {
  background: linear-gradient(135deg, var(--header-grad-a), var(--header-grad-b));
  color: var(--header-fg);
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
}

.popup-options {
  padding: 8px;
  max-height: 250px;
  overflow-y: auto;
}

.popup-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.popup-option:hover {
  background: var(--primary-bg);
}

.popup-option.selected {
  background: var(--primary-bg);
  color: var(--primary);
  font-weight: 600;
}

.popup-option .option-idx {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.popup-option.selected .option-idx {
  background: var(--primary);
  color: var(--on-primary);
}

.popup-option .option-text {
  flex: 1;
  color: var(--text);
}

.code-fill-actions {
  text-align: center;
  margin: 15px 0;
  display: flex;
  gap: 10px;
  justify-content: center;
}

/* 答题卡弹窗 */
.card-modal {
  display: none;
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: var(--mask);
  z-index: 1000;
  justify-content: center;
  align-items: center;
}

.card-modal.show { display: flex; }

.modal-content {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 28px;
  max-width: 800px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border-light);
}

.modal-header h3 { font-size: 18px; color: var(--text); }

.modal-close {
  background: none;
  border: none;
  font-size: 26px;
  cursor: pointer;
  color: var(--text-light);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(55px, 1fr));
  gap: 8px;
  margin-bottom: 18px;
}

.card-item {
  aspect-ratio: 1;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.85em;
  transition: all 0.3s;
}

.card-item:hover { transform: scale(1.08); }
.card-item.c { background: var(--success-bg); border-color: var(--success); color: var(--success); }
.card-item.w { background: var(--danger-bg); border-color: var(--danger); color: var(--danger); }
.card-item.u { background: var(--bg-alt); border-color: var(--border-strong); color: var(--text-light); }

.card-stats {
  display: flex;
  justify-content: space-around;
  padding: 18px;
  background: var(--bg-alt);
  border-radius: var(--radius);
}

.card-stat { text-align: center; }
.card-stat-num { font-size: 22px; font-weight: bold; margin-bottom: 4px; font-family: var(--font-mono); }
.card-stat-label { font-size: 12px; color: var(--text-secondary); }

/* 错题本/收藏 */
.wrong-list { display: flex; flex-direction: column; gap: 12px; }

.wrong-item {
  padding: 18px;
  background: var(--danger-bg);
  border-left: 4px solid var(--danger);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.3s;
}

.wrong-item:hover { background: var(--danger-bg); filter: brightness(0.98); }
.wrong-item .wt { color: var(--text); margin-bottom: 8px; word-break: break-word; line-height: 1.55; }
.wrong-item .wm { display: flex; gap: 8px; font-size: 12px; color: var(--text-light); align-items: center; }

/* 错题/收藏列表：选择题选项展示（正确答案高亮） */
.wopts { display: flex; flex-direction: column; gap: 3px; margin: 0 0 10px; padding-left: 4px; }
.wopt { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
.wopt.correct { color: var(--success); font-weight: 600; }
.wopt.correct::after { content: ' ✓'; font-size: 11px; }

.fav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  border-left-color: var(--warning);
  background: var(--warning-bg);
}

.fav-item:hover { background: var(--warning-bg); filter: brightness(0.98); }

.fav-content {
  flex: 1;
  cursor: pointer;
}

.unfav-btn {
  padding: 6px 14px;
  border: 1px solid var(--warning);
  background: transparent;
  color: var(--warning);
  border-radius: var(--chip-radius);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.unfav-btn:hover {
  background: var(--warning);
  color: #fff;
}

.danger-btn { border-color: var(--danger); color: var(--danger); }
.danger-btn:hover { background: var(--danger); }

/* 空状态 */
.empty-state { text-align: center; padding: 50px 20px; color: var(--text-light); }
.empty-state .icon { font-size: 50px; margin-bottom: 15px; }

/* 响应式 */
@media (max-width: 767px) {
  .content-card { margin: 0 8px 16px; padding: 16px; }
  .cards-grid { grid-template-columns: 1fr; }
  .flash-card.short-card { height: 340px; }
  .nav-btn { padding: 6px 14px; font-size: 13px; }
  .subject-header { padding: 28px 16px 22px; }
  .subject-header h1 { font-size: 1.3em; }
  .btn-group { flex-wrap: wrap; }
  .judge-btn { padding: 12px 35px; }
  .quiz-type-tabs { gap: 4px; }
  .qtab-btn { padding: 6px 12px; font-size: 12px; }
}

/* 从"问问AI"chip 跳回时的高亮闪烁 */
.ask-ai-flash {
  animation: askAIFlash 0.55s ease 3;
  border-radius: 10px;
}

@keyframes askAIFlash {
  0%, 100% { box-shadow: 0 0 0 0 rgba(108, 140, 255, 0); }
  50% { box-shadow: 0 0 0 4px rgba(108, 140, 255, 0.6); }
}

/* ===== 看板娘 AI 小帮：悬浮动作菜单 ===== */
.ai-assistant-fab {
  position: fixed;
  left: 244px;
  bottom: 80px;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  touch-action: none;
}

.ai-assistant-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #6c8cff, #9d7bff);
  color: #fff;
  font-size: 24px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  box-shadow: 0 6px 18px rgba(108, 140, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
}
.ai-assistant-btn:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 8px 24px rgba(108, 140, 255, 0.55);
}
.ai-assistant-btn:active { cursor: grabbing; }
.ai-assistant-btn.active {
  transform: rotate(90deg);
}
.ai-assistant-btn.loading {
  opacity: 0.85;
}

.ai-spinner {
  width: 22px;
  height: 22px;
  border: 3px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ai-spin 0.8s linear infinite;
}
@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

/* 菜单绝对定位在圆钮上方/下方，容器只占圆钮大小，避免整块被推出视口 */
.ai-assistant-fab { display: block; }
.ai-assistant-fab .ai-assistant-btn { position: relative; z-index: 1; }
.ai-assistant-fab.menu-down .ai-assistant-menu {
  bottom: auto;
  top: calc(100% + 10px);
  transform-origin: top left;
}

.ai-assistant-menu {
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border: 1px solid #ece9f7;
  border-radius: 18px;
  padding: 10px;
  box-shadow: 0 10px 30px rgba(108, 140, 255, 0.2);
  min-width: 178px;
  overflow-y: auto;
  overscroll-behavior: contain;
  transform-origin: bottom left;
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  z-index: 2;
}

.ai-menu-title {
  font-size: 13px;
  font-weight: 700;
  color: #6c8cff;
  padding: 4px 8px 8px;
  border-bottom: 1px solid #f0edff;
  margin-bottom: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ai-menu-title small {
  font-size: 10px;
  font-weight: 400;
  color: var(--text-light);
}

.ai-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  background: transparent;
  color: #444;
  font-size: 14px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  text-align: left;
}
.ai-menu-item:hover:not(:disabled) {
  background: linear-gradient(135deg, #f3f1ff, #faf0ff);
  color: #6c8cff;
}
.ai-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ai-menu-item.ai-menu-page {
  color: #9d7bff;
  font-weight: 600;
}
.ai-menu-divider {
  height: 1px;
  margin: 6px 10px;
  background: var(--border-light);
}
.ai-menu-emoji {
  font-size: 17px;
}

.ai-menu-pop-enter-active,
.ai-menu-pop-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.ai-menu-pop-enter-from,
.ai-menu-pop-leave-to {
  transform: scale(0.85) translateY(8px);
  opacity: 0;
}

/* ===== 工具箱结果面板（iframe 内浮层） ===== */
.ai-result-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(36, 28, 58, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}
.ai-result-card {
  width: min(760px, 94vw);
  max-height: min(84vh, 720px);
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(40, 30, 70, 0.32);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ai-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f2efff, #fbf7ff);
  border-bottom: 1px solid #f0edff;
  color: #4b3b63;
  font-size: 15px;
}
.ai-result-close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: #6b5c7d;
  cursor: pointer;
  font-size: 14px;
}
.ai-result-close:hover { background: #f0edff; }
.ai-result-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 28px 20px;
  color: #6b5c7d;
  font-size: 14px;
}
.ai-spinner.dark {
  border-color: rgba(108, 140, 255, 0.25);
  border-top-color: #6c8cff;
}
.ai-result-text {
  padding: 18px 20px 22px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.85;
  color: #3f3353;
}
.ai-result-frame {
  flex: 1;
  width: 100%;
  min-height: 280px;
  max-height: 56vh;
  border: 0;
  background: #fff;
}
.ai-result-foot {
  padding: 12px 16px;
  border-top: 1px solid #f3effa;
  display: flex;
  justify-content: flex-end;
}
.ai-result-action {
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #6c8cff, #9d7bff);
  color: #fff;
  padding: 9px 16px;
  font-size: 13px;
  cursor: pointer;
}

@media screen and (max-width: 768px) {
  .ai-assistant-fab {
    left: 14px;
    bottom: 78px;
  }
  .ai-assistant-btn {
    width: 46px;
    height: 46px;
    font-size: 21px;
  }
}

.answer-source-badge {
  display: inline-block;
  margin: 6px 0 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef5ec;
  color: #3f7a4f;
  border: 1px solid #cfe4d1;
  font-size: 10px;
  font-weight: 500;
  vertical-align: middle;
}
.answer-source-badge.ai {
  background: #fff6e6;
  color: #9a6326;
  border-color: #f0d9b5;
}
.card-answer-header .answer-source-badge {
  margin-left: 6px;
  background: rgba(255,255,255,.18);
  color: #fff;
  border-color: rgba(255,255,255,.35);
}

.rag-tool { padding: 4px 2px 8px; }
.rag-tool-row { display: flex; gap: 8px; align-items: center; }
.rag-tool-row input { flex: 1; min-width: 0; border: 1px solid var(--border-strong); border-radius: 8px; padding: 9px 10px; font: inherit; }
.rag-tool-hint { margin: 8px 0 10px; color: var(--text-secondary); font-size: 11px; line-height: 1.7; }
.rag-answer { white-space: pre-wrap; line-height: 1.8; color: var(--text); font-size: 14px; background: var(--bg-alt); border-radius: 10px; padding: 12px; }
.rag-sources { margin-top: 14px; }
.rag-sources h4 { font-size: 13px; margin-bottom: 8px; color: var(--text-secondary); }
.rag-source { border-top: 1px dashed var(--border); padding: 9px 0; }
.rag-source-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.rag-source-index { color: var(--primary); font-weight: 600; }
.rag-source-head strong { font-size: 12px; }
.rag-source p { color: var(--text-secondary); font-size: 12px; line-height: 1.7; margin: 4px 0; }
.rag-source a, .rag-source small { color: var(--primary); font-size: 11px; }
</style>
