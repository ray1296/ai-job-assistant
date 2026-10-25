/**
 * ============================================================
 * 语音合成工具（TTS）—— 音色库与合成逻辑
 * ============================================================
 * 两路合成通道，均由后端代理（浏览器不直接暴露 API Key）：
 *
 * 1) 阿里云百炼（provider: 'aliyun'）
 *    - 端点：POST /api/ai/tts-aliyun
 *    - 模型：qwen3-tts-flash（系统音色 47 个，含真人音色 / 角色音 / 方言）
 *    - 免费额度：百炼开通后 90 天内 100 万字符，超出后 0.8 元/万字符
 *    - 特色：支持 instruction 指令控制（自然语言描述情绪/语速/音调）
 *    - 音色来源文档：https://help.aliyun.com/zh/model-studio/qwen-tts
 *
 * 2) 微软 Edge TTS（provider: 'edge'）
 *    - 端点：POST /api/ai/tts
 *    - 协议：edge-tts WebSocket 协议，完全免费，无 Key
 *    - 特色：voice/rate/pitch/volume 参数调音，无指令控制
 *    - 中文可用音色 14 个（其余大量音色实测 502 不可用）
 *
 * 音色数据结构（每项字段说明）：
 *   id         唯一标识（英文小写，用于 localStorage 记忆）
 *   label      显示名称（中文）
 *   desc       一句话描述（展示在卡片副标题）
 *   emoji      卡片图标
 *   provider   'aliyun' | 'edge'（选择合成通道）
 *   voice      通道内的音色名（阿里云为 voice 参数，Edge 为 voice 参数）
 *   category   分类：'loli' | 'yujie' | 'tianmei' | 'fangyan' | 'male' | 'edge' 等
 *   rate       Edge 专用：语速（如 '+0%'）
 *   pitch      Edge 专用：音调（如 '+0Hz'）
 *   instruction 阿里云专用：指令控制文本（自然语言）
 * ============================================================
 */

/* ===== 快捷预设（默认三个方向，可随时换音色） ===== */
export const VOICE_PRESETS = [
  {
    id: 'loli',
    label: '萝莉音（更尖锐）',
    desc: '二次元虚拟女友千雪，音调高语速快，撒娇发嗲',
    emoji: '🍡',
    provider: 'aliyun',
    voice: 'Chelsie',
    instruction: '音调偏高，语速较快，撒娇可爱的萝莉音，语气嗲嗲的，像发嗲的小妹妹',
  },
  {
    id: 'yujie',
    label: '御姐音',
    desc: '卡捷琳娜御姐音色，成熟知性沉稳有气场',
    emoji: '🌹',
    provider: 'aliyun',
    voice: 'Katerina',
    instruction: '成熟知性的御姐音，语速稍慢，语调沉稳有气场，带一点慵懒自信',
  },
  {
    id: 'fangyan',
    label: '川渝方言（甜妹风）',
    desc: '四川-晴儿川妹子，西南官话近似重庆话，俏皮可爱',
    emoji: '🥟',
    provider: 'aliyun',
    voice: 'Sunny',
    instruction: '用四川话口音说话，甜妹风格，俏皮可爱，带川渝味道',
  },
]

export const DEFAULT_VOICE = VOICE_PRESETS[0]
const VOICE_STORAGE_KEY = 'live2d-voice'

/* ===== 全部音色库（阿里云 47 个官方音色 + Edge 14 个可用音色） =====
 * 已逐一直播实测可用（2026-09-11）。
 * 新增音色只需在下方数组加一行；Edge 音色需先用后端 /api/ai/tts 实测可用再加入。
 */
export const VOICE_LIBRARY = [
  /* ---- 阿里云 · 萝莉/少女系（甜、萌、嗲） ---- */
  { id: 'al_chelsi',  label: '千雪 · 二次元女友',   desc: '二次元虚拟女友，甜系少女',       emoji: '🎀', provider: 'aliyun', voice: 'Chelsie', category: 'loli', instruction: '音调偏高，语速较快，撒娇可爱的萝莉音，语气嗲嗲的' },
  { id: 'al_bella',   label: '萌宝 · 小萝莉',       desc: '天然呆小萝莉，萌系',             emoji: '🍼', provider: 'aliyun', voice: 'Bella',   category: 'loli', instruction: '音调偏高，语速较快，可爱天真的小萝莉音' },
  { id: 'al_bunny',   label: '萌小姬 · 萌属性',     desc: '萌属性爆棚的小萝莉',             emoji: '🐰', provider: 'aliyun', voice: 'Bunny',   category: 'loli', instruction: '音调偏高，软萌可爱的萝莉音，语气活泼' },
  { id: 'al_momo',    label: '茉兔 · 撒娇搞怪',     desc: '撒娇搞怪，逗你开心',             emoji: '🐇', provider: 'aliyun', voice: 'Momo',    category: 'loli', instruction: '撒娇搞怪的少女音，语气俏皮，带一点点小任性' },
  { id: 'al_nini',    label: '邻家妹妹',            desc: '又软又黏，甜到骨子里',           emoji: '🍬', provider: 'aliyun', voice: 'Nini',    category: 'loli', instruction: '软软糯糯的少女音，语气黏人甜美，像邻家妹妹撒娇' },
  { id: 'al_vivian',  label: '十三 · 小暴躁',       desc: '拽拽的、可爱的小暴躁',           emoji: '😼', provider: 'aliyun', voice: 'Vivian',  category: 'loli', instruction: '可爱又带点小暴躁的少女音，语气拽拽的' },
  { id: 'al_stella',  label: '少女阿月',            desc: '甜到发腻的迷糊少女',             emoji: '🌙', provider: 'aliyun', voice: 'Stella',  category: 'loli', instruction: '甜腻的迷糊少女音，语气软萌' },
  { id: 'al_onoanna', label: '小野杏 · 青梅竹马',   desc: '鬼灵精怪的青梅竹马',             emoji: '🍑', provider: 'aliyun', voice: 'Ono Anna', category: 'loli', instruction: '活泼灵动的少女音，像青梅竹马一样俏皮' },
  { id: 'al_mia',     label: '乖小妹',              desc: '温顺如春水，乖巧如初雪',         emoji: '🌷', provider: 'aliyun', voice: 'Mia',     category: 'loli', instruction: '温柔乖巧的少女音，语气轻柔' },
  { id: 'al_seren',   label: '小婉 · 治愈',         desc: '温和舒缓，像睡前故事',           emoji: '💤', provider: 'aliyun', voice: 'Seren',   category: 'loli', instruction: '温和舒缓的少女音，语气轻柔治愈' },

  /* ---- 阿里云 · 甜妹/日常系（自然、阳光） ---- */
  { id: 'al_cherry',  label: '芊悦 · 阳光小姐姐',   desc: '阳光积极、亲切自然',             emoji: '🍒', provider: 'aliyun', voice: 'Cherry',  category: 'tianmei', instruction: '阳光亲切的女声，语速适中，语气自然有活力' },
  { id: 'al_serena',  label: '苏瑶 · 温柔',         desc: '温柔小姐姐，知性柔和',           emoji: '🌸', provider: 'aliyun', voice: 'Serena',  category: 'tianmei', instruction: '温柔知性的女声，语速平缓，语气柔和' },
  { id: 'al_jennifer', label: '詹妮弗 · 美语腔',    desc: '品牌级电影质感美语女声',         emoji: '🇺🇸', provider: 'aliyun', voice: 'Jennifer', category: 'tianmei', instruction: '自然流畅的女声，带一点美语腔' },
  { id: 'al_sohee',   label: '素熙 · 韩国欧尼',     desc: '温柔开朗，情绪丰富',             emoji: '🇰🇷', provider: 'aliyun', voice: 'Sohee',   category: 'tianmei', instruction: '温柔开朗的女声，语气亲切' },
  { id: 'al_sonrisa', label: '索尼莎 · 拉美大姐',   desc: '热情开朗的拉美大姐',             emoji: '🌺', provider: 'aliyun', voice: 'Sonrisa', category: 'tianmei', instruction: '热情开朗的女声，语气明快' },

  /* ---- 阿里云 · 御姐/知性系（气场、成熟） ---- */
  { id: 'al_katerina', label: '卡捷琳娜 · 御姐',    desc: '官方御姐音色，韵律回味十足',     emoji: '🌹', provider: 'aliyun', voice: 'Katerina', category: 'yujie', instruction: '成熟知性的御姐音，语速稍慢，语调沉稳有气场，带一点慵懒自信' },
  { id: 'al_maia',    label: '四月 · 知性',         desc: '知性与温柔的碰撞',               emoji: '📖', provider: 'aliyun', voice: 'Maia',    category: 'yujie', instruction: '知性温柔的女声，语速适中，语气沉稳' },
  { id: 'al_bellona', label: '燕铮莺 · 大气',       desc: '声音洪亮，吐字清晰有气场',       emoji: '⚔️', provider: 'aliyun', voice: 'Bellona', category: 'yujie', instruction: '声音洪亮清晰的女声，语气大气有气场' },
  { id: 'al_elias',   label: '墨讲师 · 知性',       desc: '学科严谨的叙事型讲师',           emoji: '🎓', provider: 'aliyun', voice: 'Elias',   category: 'yujie', instruction: '专业知性的女声，像讲师一样清晰有条理' },

  /* ---- 阿里云 · 方言系 ---- */
  { id: 'al_sunny',   label: '四川-晴儿 · 川妹',    desc: '甜到你心里的川妹子（近似重庆话）', emoji: '🥟', provider: 'aliyun', voice: 'Sunny',   category: 'fangyan', instruction: '用四川话口音说话，甜妹风格，俏皮可爱，带川渝味道' },
  { id: 'al_kiki',    label: '粤语-阿清 · 港妹',    desc: '甜美的港妹闺蜜',                 emoji: '🇭🇰', provider: 'aliyun', voice: 'Kiki',    category: 'fangyan', instruction: '用粤语口音说话，甜美亲切，像港妹闺蜜' },
  { id: 'al_jada',    label: '上海-阿珍',           desc: '风风火火的沪上阿姐',             emoji: '🏮', provider: 'aliyun', voice: 'Jada',    category: 'fangyan', instruction: '用上海话口音说话，风风火火' },
  { id: 'al_eric',    label: '四川-程川 · 川男',    desc: '跳脱市井的成都男子',             emoji: '🍜', provider: 'aliyun', voice: 'Eric',    category: 'fangyan', instruction: '用四川话口音说话，跳脱市井，幽默' },
  { id: 'al_rocky',   label: '粤语-阿强',           desc: '幽默风趣的粤语男生',             emoji: '🎤', provider: 'aliyun', voice: 'Rocky',   category: 'fangyan', instruction: '用粤语口音说话，幽默风趣' },

  /* ---- 阿里云 · 男声系 ---- */
  { id: 'al_ethan',   label: '晨煦 · 阳光男',       desc: '阳光温暖、活力朝气的男生',       emoji: '☀️', provider: 'aliyun', voice: 'Ethan',   category: 'male', instruction: '阳光温暖的男生，语气有活力' },
  { id: 'al_andre',   label: '安德雷 · 磁性男',     desc: '声音磁性，自然沉稳',             emoji: '🎧', provider: 'aliyun', voice: 'Andre',   category: 'male', instruction: '声音磁性的沉稳男声，语气自然' },
  { id: 'al_ryan',    label: '甜茶 · 戏感男',       desc: '节奏拉满，戏感炸裂',             emoji: '☕', provider: 'aliyun', voice: 'Ryan',    category: 'male', instruction: '有张力的男声，节奏感强，语气生动' },
  { id: 'al_moon',    label: '月白 · 帅气男',       desc: '率性帅气的男声',                 emoji: '🌙', provider: 'aliyun', voice: 'Moon',    category: 'male', instruction: '率性帅气的男声，语气自然' },
  { id: 'al_kai',     label: '凯 · 男声',           desc: '标准男声',                       emoji: '👨', provider: 'aliyun', voice: 'Kai',     category: 'male', instruction: '标准的男声，语气平稳' },
  { id: 'al_neil',    label: '阿闻 · 播音男',       desc: '字正腔圆的新闻主持人',           emoji: '📰', provider: 'aliyun', voice: 'Neil',    category: 'male', instruction: '字正腔圆的播音男声，专业清晰' },
  { id: 'al_vincent', label: '田叔 · 烟嗓',         desc: '独特的沙哑烟嗓',                 emoji: '🚬', provider: 'aliyun', voice: 'Vincent', category: 'male', instruction: '沙哑有磁性的烟嗓，带江湖气' },
  { id: 'al_arthur',  label: '徐大爷',              desc: '质朴的乡村大爷',                 emoji: '🌾', provider: 'aliyun', voice: 'Arthur',  category: 'male', instruction: '质朴的老年男声，慢悠悠的' },
  { id: 'al_eldsage', label: '沧明子 · 沉稳老者',   desc: '沉稳睿智的老者',                 emoji: '🏔️', provider: 'aliyun', voice: 'Eldric Sage', category: 'male', instruction: '沉稳睿智的老年男声' },
  { id: 'al_aiden',   label: '艾登 · 大男孩',       desc: '精通厨艺的美语大男孩',           emoji: '👨‍🍳', provider: 'aliyun', voice: 'Aiden',   category: 'male', instruction: '阳光大男孩男声，语气轻松' },
  { id: 'al_mochi',   label: '沙小弥 · 小大人',     desc: '童真未泯却早慧如禅',             emoji: '🧒', provider: 'aliyun', voice: 'Mochi',   category: 'male', instruction: '童真又早慧的男童音' },
  { id: 'al_pip',     label: '顽屁小孩',            desc: '调皮捣蛋充满童真',               emoji: '🤪', provider: 'aliyun', voice: 'Pip',     category: 'male', instruction: '调皮捣蛋的男童音' },
  { id: 'al_bodega',  label: '博德加 · 大叔',       desc: '热情的西班牙大叔',               emoji: '🥘', provider: 'aliyun', voice: 'Bodega',  category: 'male', instruction: '热情的大叔男声' },
  { id: 'al_alek',    label: '阿列克',              desc: '战斗民族冷面暖男',               emoji: '🧊', provider: 'aliyun', voice: 'Alek',    category: 'male', instruction: '沉稳的男声' },
  { id: 'al_dolce',   label: '多尔切 · 意大利',     desc: '慵懒的意大利大叔',               emoji: '🍝', provider: 'aliyun', voice: 'Dolce',   category: 'male', instruction: '慵懒的意大利腔男声' },
  { id: 'al_lenn',    label: '莱恩',                desc: '理性又叛逆的德国青年',           emoji: '🎸', provider: 'aliyun', voice: 'Lenn',    category: 'male', instruction: '理性沉稳的男声' },
  { id: 'al_emilien', label: '埃米尔安 · 法国',     desc: '浪漫的法国大哥哥',               emoji: '🥖', provider: 'aliyun', voice: 'Emilien', category: 'male', instruction: '浪漫的男声' },
  { id: 'al_radiogol', label: '拉迪奥 · 解说',      desc: '足球诗人解说风',                 emoji: '⚽', provider: 'aliyun', voice: 'Radio Gol', category: 'male', instruction: '激情解说风的男声' },
  { id: 'al_dylan',   label: '北京-晓东',           desc: '北京胡同里长大的少年',           emoji: '🏮', provider: 'aliyun', voice: 'Dylan',   category: 'male', instruction: '北京口音的男声，胡同味' },
  { id: 'al_li',      label: '南京-老李',           desc: '耐心的瑜伽老师',                 emoji: '🧘', provider: 'aliyun', voice: 'Li',      category: 'male', instruction: '南京口音男声，耐心平和' },
  { id: 'al_marcus',  label: '陕西-秦川',           desc: '面宽话短心实的老陕',             emoji: '🥣', provider: 'aliyun', voice: 'Marcus',  category: 'male', instruction: '陕西口音男声，朴实' },
  { id: 'al_peter',   label: '天津-李彼得',         desc: '天津相声专业捧哏',               emoji: '🎭', provider: 'aliyun', voice: 'Peter',   category: 'male', instruction: '天津口音男声，像说相声' },
  { id: 'al_roy',     label: '闽南-阿杰',           desc: '诙谐直爽的台湾哥仔',             emoji: '🌊', provider: 'aliyun', voice: 'Roy',     category: 'male', instruction: '闽南口音男声，诙谐直爽' },

  /* ---- Edge TTS · 普通话/方言女声（免费备用通道） ---- */
  { id: 'ed_xiaoxiao', label: '晓晓 · 自然女声',    desc: '微软最自然的女声，抖音同款',     emoji: '🎙️', provider: 'edge', voice: 'zh-CN-XiaoxiaoNeural', category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_xiaoyi',  label: '晓伊 · 清脆少女',     desc: '清脆活泼的少女音',               emoji: '🌱', provider: 'edge', voice: 'zh-CN-XiaoyiNeural',    category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_xiaoxuan', label: '晓萱 · 温柔',        desc: '柔和温婉的女声',                 emoji: '🌿', provider: 'edge', voice: 'zh-CN-XiaoxuanNeural',  category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_hsiaoyu', label: '晓雨 · 台湾嗲腔',     desc: '软萌台湾腔，可调高音更嗲',       emoji: '🫧', provider: 'edge', voice: 'zh-TW-HsiaoYuNeural',   category: 'edge', rate: '+15%', pitch: '+30Hz' },
  { id: 'ed_hsiaochen', label: '晓臻 · 台湾御姐',   desc: '温柔知性的台湾御姐',             emoji: '🌹', provider: 'edge', voice: 'zh-TW-HsiaoChenNeural', category: 'edge', rate: '-5%', pitch: '-5Hz' },
  { id: 'ed_xiaobei', label: '小北 · 东北话',       desc: '东北大碴子味女声',               emoji: '⛄', provider: 'edge', voice: 'zh-CN-liaoning-XiaobeiNeural', category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_xiaoni',  label: '晓妮 · 陕西话',       desc: '陕西话女声',                     emoji: '🥟', provider: 'edge', voice: 'zh-CN-shaanxi-XiaoniNeural',   category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_yunxi',   label: '云希 · 男声',         desc: '温暖男声',                       emoji: '👦', provider: 'edge', voice: 'zh-CN-YunxiNeural',      category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_yunjian', label: '云健 · 男声',         desc: '沉稳男声',                       emoji: '👨', provider: 'edge', voice: 'zh-CN-YunjianNeural',    category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_yunyang', label: '云扬 · 男声',         desc: '阳光男声',                       emoji: '🌞', provider: 'edge', voice: 'zh-CN-YunyangNeural',    category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_yunjhe',  label: '云哲 · 台湾男声',     desc: '台湾普通话男声',                 emoji: '🧢', provider: 'edge', voice: 'zh-TW-YunJheNeural',     category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_hiugaai', label: '晓佳 · 粤语女',       desc: '粤语女声',                       emoji: '🇭🇰', provider: 'edge', voice: 'zh-HK-HiuGaaiNeural',    category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_hiukaan', label: '晓雯 · 粤语女',       desc: '粤语女声（温柔）',               emoji: '🌸', provider: 'edge', voice: 'zh-HK-HiuMaanNeural',    category: 'edge', rate: '+0%', pitch: '+0Hz' },
  { id: 'ed_wanlung', label: '云龙 · 粤语男',       desc: '粤语男声',                       emoji: '🎬', provider: 'edge', voice: 'zh-HK-WanLungNeural',    category: 'edge', rate: '+0%', pitch: '+0Hz' },
]

/** 读取用户选择的声音配置（localStorage），没有则用默认萝莉音；始终合并最新预设参数 */
export function getVoiceConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_STORAGE_KEY) || 'null')
    if (saved && saved.id) {
      // 先查预设
      const preset = VOICE_PRESETS.find(v => v.id === saved.id)
      if (preset) return { ...preset }
      // 再查音色库
      const lib = VOICE_LIBRARY.find(v => v.id === saved.id)
      if (lib) return { ...lib }
    }
  } catch (e) {
    /* ignore */
  }
  return DEFAULT_VOICE
}

/** 保存声音配置到 localStorage */
export function saveVoiceConfig(cfg) {
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(cfg))
  } catch (e) {
    /* ignore */
  }
}

/**
 * 合成语音，返回音频 blob URL（Edge=audio/mpeg，阿里云=audio/wav）
 * @param {string} text 要朗读的文本
 * @param {{provider?:string, voice?:string, rate?:string, pitch?:string, volume?:string, instruction?:string}} opts
 * @returns {Promise<string>} blob URL，失败 reject
 */
export async function edgeTTSSynthesize(text, opts = {}) {
  const clean = (text || '').trim()
  if (!clean) throw new Error('empty text')

  const provider = opts.provider || DEFAULT_VOICE.provider || 'edge'
  const voice = opts.voice || DEFAULT_VOICE.voice
  const rate = opts.rate || '+0%'
  const pitch = opts.pitch || '+0Hz'
  const volume = opts.volume || '+0%'
  const instruction = opts.instruction || ''

  // 本站写接口要求 CSRF；缺少时服务端会 403
  const csrf = (typeof window !== 'undefined' && window.__zgCsrf) || ''
  const headers = { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }
  let resp
  if (provider === 'aliyun') {
    resp = await fetch('/api/ai/tts-aliyun', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: clean, voice, instruction }),
    })
  } else {
    resp = await fetch('/api/ai/tts', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: clean, voice, rate, pitch, volume }),
    })
  }
  if (!resp.ok) {
    let msg = 'TTS 服务不可用'
    try {
      msg = (await resp.text()) || msg
    } catch (e) { /* ignore */ }
    throw new Error(msg)
  }
  const blob = await resp.blob()
  if (!blob.size) throw new Error('TTS 未返回音频')
  return URL.createObjectURL(blob)
}

/* __shim: 没有后端 TTS 时用浏览器语音兜底 */
export async function edgeTTSSynthesizeFallback(text, opts = {}) {
  try {
    if (!('speechSynthesis' in window)) return null;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 200));
    u.lang = 'zh-CN';
    window.speechSynthesis.speak(u);
  } catch {}
  return null;
}
