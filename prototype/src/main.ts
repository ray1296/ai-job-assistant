type Page = {
  id: string;
  name: string;
  icon: string;
  group: string;
  sub: string;
};
const pages: Page[] = [
  ["home", "求职工作台", "✦", "开始求职", "让每一步，都离理想更近"],
  ["profile", "个人信息", "◎", "开始求职", "先选择城市或方向，再整理你的经历"],
  ["resume", "简历工作室", "▤", "开始求职", "从零制作，也能继续打磨已有简历"],
  ["data", "我的数据空间", "▧", "开始求职", "让你自己的数据，也成为求职的助力"],
  ["jobs", "发现岗位", "▦", "探索机会", "找到值得认真准备的下一站"],
  ["dashboard", "就业数据大屏", "◴", "探索机会", "从数据里，看见更多可能"],
  ["map", "城市与通勤地图", "◇", "探索机会", "把工作与生活，放在同一张地图上"],
  ["companies", "企业观察", "▥", "探索机会", "了解机会，也了解机会背后的公司"],
  ["housing", "租房与生活", "⌂", "探索机会", "找到工作，也安顿好自己"],
  [
    "knowledge",
    "面经与八股",
    "▣",
    "准备出发",
    "有针对性地准备，每一份心仪的机会",
  ],
  ["practice", "学习与刷题", "✎", "准备出发", "把不会的，变成下一次的底气"],
  ["interview", "模拟面试", "◉", "准备出发", "在真正的面试之前，先练习一次"],
  ["plan", "投递意向与方案", "↗", "准备出发", "让每一次投递，都更有准备"],
  ["chat", "AI 协作空间", "✧", "更多空间", "你的求职团队，一直在这里"],
  [
    "community",
    "互助社区 · 心愿池",
    "☷",
    "更多空间",
    "分享经验，也为彼此加一点油",
  ],
  ["settings", "个性化设置", "⚙", "更多空间", "让你的助手，更像你的伙伴"],
  ["admin", "管理中心", "⊞", "更多空间", "内容、数据与服务管理"],
].map(([id, name, icon, group, sub]) => ({ id, name, icon, group, sub }));
const agents = [
  ["小光", "主理人", "陪你梳理下一步", "☀", "#e9e2ff"],
  ["知简", "简历顾问", "让经历被看见", "✿", "#dcece6"],
  ["寻星", "岗位向导", "发现适合的机会", "✧", "#ffead1"],
  ["小研", "学习教练", "一起攻克难题", "✎", "#e2ebff"],
  ["星语", "面试官", "准备好再出发", "◈", "#ffe1e7"],
];
let active = "home",
  aiFilter = false,
  intents = new Set<number>(),
  selectedAgent = 0;
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const btn = (text: string, action = "preview", cls = "") =>
  '<button class="btn ' +
  cls +
  '" data-action="' +
  action +
  '">' +
  text +
  "</button>";
const card = (title: string, body: string, cls = "") =>
  '<section class="card ' +
  cls +
  '"><h3>' +
  title +
  "</h3>" +
  body +
  "</section>";
const tag = (s: string) => '<span class="tag">' + s + "</span>";
const inputs = (label: string, placeholder: string) =>
  '<label class="field">' +
  label +
  '<input placeholder="' +
  placeholder +
  '" list="uncertain"><datalist id="uncertain"><option value="不确定，想听听建议"></datalist></label>';
const tabs = (names: string[]) =>
  '<div class="tabs">' +
  names
    .map(
      (n, i) =>
        '<button class="tab ' +
        (!i ? "chosen" : "") +
        '" data-action="tab">' +
        n +
        "</button>",
    )
    .join("") +
  "</div>";
const emptyUpload = (title: string, note: string) =>
  '<div class="upload"><span>↥</span><h3>' +
  title +
  "</h3><p>" +
  note +
  "</p>" +
  btn("选择文件 · 原型占位") +
  "</div>";
const mapArt = () =>
  '<div class="map-art"><div class="river"></div><div class="map-label a">滨江创新园</div><div class="map-label b">城市生活区</div><div class="map-label c">科技大道</div><div class="metro-line"></div>' +
  [
    [18, 25, "▦"],
    [54, 34, "▦"],
    [36, 65, "⌂"],
    [75, 57, "⌂"],
    [59, 75, "M"],
    [23, 50, "M"],
    [81, 26, "H"],
  ]
    .map(
      ([x, y, t]) =>
        '<button class="pin ' +
        (t === "▦" ? "purple" : t === "⌂" ? "green" : "orange") +
        '" style="left:' +
        x +
        "%;top:" +
        y +
        '%" data-action="mapdetail">' +
        t +
        "</button>",
    )
    .join("") +
  '<span class="map-watermark">布局示意图 · 非真实地理位置</span></div>';
function home() {
  return (
    '<section class="journey-hero"><span class="eyebrow">YOUR NEXT CHAPTER</span><h1>下一站，<br>由你<span>慢慢探索。</span></h1><p>不必一开始就有答案。先看看世界，也重新认识自己。</p><div class="journey-choices"><button data-action="explorecity"><span>01 / CITY</span><h2>去喜欢的城市</h2><p>在地图上看看机会与生活</p><b>探索城市 ↗</b></button><button data-action="explorecareer"><span>02 / CAREER</span><h2>找自己的方向</h2><p>从岗位、技能与分布看可能性</p><b>探索职业 ↗</b></button><button data-page="profile"><span>03 / YOUR STORY</span><h2>写下你的故事</h2><p>整理经历，让下一步更清晰</p><b>填写个人信息 ↗</b></button></div></section><section class="journey-path"><span>你的求职旅程</span>' +
    [
      ["profile", "认识自己"],
      ["resume", "整理简历"],
      ["jobs", "收藏机会"],
      ["practice", "积蓄能力"],
      ["interview", "练习表达"],
      ["plan", "认真投递"],
    ]
      .map(
        ([id, t], i) =>
          '<button data-page="' +
          id +
          '"><small>0' +
          (i + 1) +
          "</small>" +
          t +
          " <span>↗</span></button>",
      )
      .join("") +
    '</section><p class="muted journey-note">随时展开左下角「星盘」，去任何一个空间。旅程没有固定顺序。</p>'
  );
}
const preferences: Record<string, string[]> = { city: [], job: [] };
const longField = (label: string) =>
  '<label class="field full-field">' +
  label +
  '<textarea class="grow-text" rows="3" placeholder="自由描述你的真实经历与收获"></textarea></label>';
function profile() {
  return (
    '<section class="resume-import"><div><span class="eyebrow">START WITH YOUR STORY</span><h2>已经有简历？从这里开始</h2><p>上传已有简历，少填一些信息。也可以直接在下方慢慢整理。</p></div>' +
    '<button class="btn primary big-upload" data-action="preview">↥ 上传已有简历 · 可选</button>' +
    "</section>" +
    card(
      "你想去哪里，做什么？",
      '<div class="grid two">' +
        ["city", "job"]
          .map(
            (k) =>
              '<section><label class="field">' +
              (k === "city" ? "意向城市" : "意向岗位") +
              '<div class="preference-input"><input id="pref-' +
              k +
              '" placeholder="' +
              (k === "city" ? "例如：杭州" : "例如：Java 后端开发") +
              '"><button class="btn primary" data-confirm="' +
              k +
              '">确认添加</button></div></label><div id="tags-' +
              k +
              '" class="preference-tags">' +
              preferenceTags(k) +
              "</div></section>",
          )
          .join("") +
        '</div><p class="muted">可分别添加多个城市和岗位，也可以暂时留空。悬停标签可删除。</p>',
    ) +
    card(
      "基本信息",
      '<div class="grid three">' +
        inputs("姓名 / 称呼", "你的名字") +
        inputs("联系方式", "电话 / 邮箱") +
        inputs("当前状态", "应届 / 实习 / 在职 / 不确定") +
        "</div>",
    ) +
    experienceBlock(
      "教育经历",
      ["学校", "学历", "专业", "就读时间"],
      "在校经历与收获",
    ) +
    experienceBlock(
      "项目经历",
      ["项目名称", "担任角色", "项目时间"],
      "工作内容、解决的问题与成果",
    ) +
    experienceBlock(
      "实习与工作经历",
      ["公司名称", "岗位", "起止时间"],
      "工作内容与成果",
    ) +
    card("掌握技能", longField("你掌握的技能、熟练程度与实践")) +
    experienceBlock("荣誉与证书", ["荣誉 / 证书名称", "获得时间"], "补充说明") +
    '<div class="actions">' +
    btn("保存个人信息", "preview", "primary") +
    btn("前往简历工作室", "resume") +
    "</div>"
  );
}
function preferenceTags(k: string) {
  return preferences[k]
    .map(
      (v, i) =>
        '<span class="preference-tag">' +
        escapeText(v) +
        '<button data-remove-pref="' +
        k +
        '" data-index="' +
        i +
        '" aria-label="删除' +
        escapeText(v) +
        '">×</button></span>',
    )
    .join("");
}
function escapeText(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function experienceBlock(t: string, fields: string[], description: string) {
  return card(
    t,
    '<div class="experience-entry"><div class="grid three">' +
      fields.map((f) => inputs(f, "自由填写")).join("") +
      "</div>" +
      longField(description) +
      "</div>" +
      btn("＋ 添加一条" + t, "addexperience"),
  );
}
let resumeVersions = ["通用简历", "岗位定向版本"],
  resumeVersion = 0;
function resume() {
  return (
    '<div class="resume-toolbar"><div class="version-switch">' +
    resumeVersions
      .map(
        (v, i) =>
          '<button class="btn ' +
          (i === resumeVersion ? "primary" : "") +
          '" data-version="' +
          i +
          '">' +
          v +
          "</button>",
      )
      .join("") +
    btn("＋ 新增版本", "newversion") +
    '</div><div class="actions">' +
    btn("✦ AI 优化内容") +
    btn("✧ AI 调整布局 / 外观") +
    btn("下载 Word") +
    btn("下载 PDF") +
    '</div></div>' +
    '<div class="ai-help-strip"><div class="ai-help-title">✦ AI 助手能帮你</div><div class="ai-help-items">' +
    '<button class="ai-help" data-action="aidescribe">＋ 描述新板块，AI 帮你添加</button>' +
    '<button class="ai-help" data-action="aicontent">✎ AI 补全 / 优化内容</button>' +
    '<button class="ai-help" data-action="ailayout">✧ AI 调整布局与外观</button>' +
    '</div><label class="decor-toggle"><input type="checkbox" data-action="decorate"><span>🖼 生图装饰简历（可选，默认关闭）</span></label></div>' +
    '<div class="document-ribbon">文件　 /　 编辑　 /　 排版　 /　 模板　 <span>HTML 简历 · 可编辑预览</span></div><div class="resume-desk"><article class="paper resume-document" contenteditable="true" spellcheck="false"><h1>你的姓名</h1><p>意向岗位 · 意向城市</p><p>电话 / 邮箱</p><h4>教育经历</h4><p>学校名称　｜　学历 · 专业　｜　就读时间</p><h4>掌握技能</h4><p>根据个人信息整理你的技能与实践。</p><h4>项目经历</h4><p><b>项目名称　｜　担任角色</b></p><p>描述你做过的工作、解决的问题与真实成果。</p><h4>实习与工作经历</h4><p>公司 · 岗位 · 时间</p><h4>荣誉与证书</h4><p>展示与你申请方向相关的荣誉和证书。</p></article></div><p class="muted">内容可临时编辑体验，版本和内容尚未保存；个人资料统一在「个人信息」录入。</p>'
  );
}
function data() {
  return (
    '<div class="toolbar">' +
    btn("岗位 / 企业 / 租房上传") +
    btn("学习资料 / 题库上传", "studyupload") +
    "</div>" +
    '<div class="notice">♧ 私人数据仅在你的账号中展示；助手可代你解析、检索和匹配，不会共享给其他用户。（功能待接入）</div>' +
    tabs(["我的数据", "上传记录", "数据获取指南", "平台数据"]) +
    '<div class="grid two">' +
    emptyUpload(
      "把你的数据放进来",
      "岗位 / 企业 / 租房 / 面经 · CSV、Excel、JSON",
    ) +
    card(
      "不知道从哪里获取数据？",
      '<p class="muted">你可以使用 Tabbit 或其他 Agent，获取自己关注的公开信息，整理后上传。</p><ol class="guide"><li>确定方向、城市和目标信息渠道</li><li>让工具保留原链接、地址与采集日期</li><li>检查字段与来源，再上传到私人空间</li></ol>' +
        btn("查看字段模板") +
        btn("浏览推荐渠道"),
    ) +
    "</div>" +
    card(
      "数据集概览",
      '<div class="table"><div class="tr head"><span>数据类型</span><span>可用字段</span><span>来源范围</span><span>状态</span></div>' +
        [
          [
            "岗位",
            "方向 / 城市 / 详细地址 / JD / 链接",
            "用户本次提供",
            "已收资料",
          ],
          ["企业与风评", "工商 / 口碑 / 核验状态", "用户本次提供", "已收资料"],
          ["面经八股", "方向 / 问题 / 要点 / 来源", "用户本次提供", "已收资料"],
          ["片区租房", "地址 / 房源 / 渠道", "用户本次提供", "待解析接入"],
        ]
          .map(
            (r) =>
              '<div class="tr">' +
              r.map((c) => "<span>" + c + "</span>").join("") +
              "</div>",
          )
          .join("") +
        "</div>",
    )
  );
}
const sampleJobs = [
  [
    "AI Agent 算法专家 · 国际电商",
    "字节跳动",
    "上海",
    "Agent开发",
    "官网岗位展示示例",
  ],
  [
    "Java 后端开发 · 校园招聘",
    "企业占位",
    "杭州",
    "Java后端",
    "布局示例，非真实招聘",
  ],
  ["前端开发工程师 · 实习", "企业占位", "深圳", "前端", "布局示例，非真实招聘"],
];
function jobs() {
  return (
    '<div class="toolbar"><input class="search" placeholder="搜索岗位、公司、技能或城市">' +
    btn("✦ AI 帮我匹配", "match", "primary") +
    '</div><div class="filters">' +
    [
      "城市 · 不限",
      "方向 · 不限",
      "学历 · 不限",
      "招聘类型 · 不限",
      "平台 + 我的数据",
    ]
      .map((s) => btn(s))
      .join("") +
    (aiFilter
      ? '<button class="tag ai-tag" data-action="removefilter">✦ AI 匹配 <span>×</span></button>'
      : "") +
    '</div><div class="notice">♡ 勾选多个投递意向，后续可为单个或全部岗位定制学习、面试与投递方案。</div>' +
    sampleJobs
      .map(
        (j, i) =>
          '<section class="job-card"><div class="company-logo">' +
          j[1].slice(0, 1) +
          '</div><div class="job-body"><div class="job-top"><h3>' +
          j[0] +
          '</h3><span class="salary">薪资以官网为准</span></div><p>' +
          j[1] +
          ' <span class="muted"> · ' +
          j[2] +
          ' · 校招 / 实习</span></p><div class="tags">' +
          tag(j[3]) +
          tag("本科及以上") +
          tag(j[4]) +
          '</div></div><div class="job-actions"><button class="btn ' +
          (intents.has(i) ? "selected" : "") +
          '" data-intent="' +
          i +
          '">' +
          (intents.has(i) ? "♥ 已加入意向" : "♡ 投递意向") +
          "</button>" +
          btn("查看详情 ↗", "jobdetail") +
          "</div></section>",
      )
      .join("") +
    '<p class="muted">原型仅展示卡片排版；正式接入后将使用原始岗位链接，不编造岗位或匹配结果。</p>'
  );
}
const allCities = [
  "全国", "北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉",
  "西安", "苏州", "长沙", "重庆", "天津", "合肥", "郑州", "厦门", "济南",
  "青岛", "宁波", "大连", "无锡", "福州", "昆明", "沈阳", "佛山", "东莞",
  "珠海", "石家庄", "太原", "南昌", "贵阳", "南宁", "哈尔滨", "长春", "兰州",
];
const directions = [
  "全部方向", "Agent 开发", "Java 后端", "前端开发", "数据分析",
  "软件测试", "运维 / 网络", "算法", "产品经理",
];
let dashboardFocus: "city" | "career" = "city";
let dashboardCity = "全国";
let dashboardDirection = "全部方向";
function dashboard() {
  return (
    '<div class="dashboard-controls"><div class="dashboard-focus">' +
    '<button class="btn ' +
    (dashboardFocus === "city" ? "primary" : "") +
    '" data-action="dashfocus" data-mode="city">🏙 按城市探索</button>' +
    '<button class="btn ' +
    (dashboardFocus === "career" ? "primary" : "") +
    '" data-action="dashfocus" data-mode="career">🧭 按职业方向探索</button>' +
    '</div><label class="direction-select">职业方向<select data-action="dashdirection">' +
    directions
      .map(
        (d) =>
          "<option" + (d === dashboardDirection ? " selected" : "") + ">" + d + "</option>",
      )
      .join("") +
    "</select></label></div>" +
    '<div class="city-scroll"><span class="city-scroll-label">城市</span><div class="city-scroll-track">' +
    allCities
      .map(
        (c) =>
          '<button class="city-choice ' +
          (c === dashboardCity ? "selected" : "") +
          '" data-action="citychoice" data-city="' +
          c +
          '">' +
          c +
          "</button>",
      )
      .join("") +
    '</div></div><div class="dashboard-actions">' +
    btn("✦ AI 个性化匹配", "match", "primary") +
    (aiFilter
      ? '<button class="tag" data-action="removefilter">AI 匹配 ×</button>'
      : "") +
    btn("⤢ 全屏大屏", "fullscreen") +
    '</div><p class="muted" id="dashboard-status">当前展示：' +
    dashboardCity +
    " · " +
    dashboardDirection +
    "。筛选仅演示交互，统计数据待接入。</p>" +
    '<div class="dashboard-stage"><iframe class="legacy-frame dashboard-frame" title="横向就业数据大屏" src="/legacy.html?screen=dashboard"></iframe></div>'
  );
}
function mapPage() {
  return (
    '<div class="toolbar"><input class="search" placeholder="输入城市、公司、片区或地铁站">' +
    btn("查看我的投递意向") +
    btn("通勤路线") +
    btn("✦ AI 辅助选择") +
    '</div><div class="map-layout">' +
    mapArt() +
    '<section class="card map-side"><h3>工作与生活，一眼看清</h3><div class="legend">' +
    ["🟣 岗位", "🟢 租房", "🟠 地铁站", "🟠 周边酒店"]
      .map((t) => '<label><input type="checkbox" checked> ' + t + "</label>")
      .join("") +
    '</div><hr><p class="muted">点击标记，查看来源、地址、联系方式及详细链接。</p>' +
    btn("附近酒店与电话") +
    btn("地铁沿线房源") +
    '<div class="notice">地图布局占位 · 高德地图、地理编码与真实路线待接入</div></section></div>'
  );
}
function channels(kind: string) {
  let housing = kind === "housing";
  return (
    tabs(
      housing
        ? ["平台 + 我的房源", "推荐渠道", "通勤对比"]
        : ["企业资料", "公开风评证据", "信息查询渠道"],
    ) +
    '<div class="grid three">' +
    (housing
      ? [
          ["⌂", "片区租房信息", "按地址定位，结合岗位与地铁寻找房源。"],
          ["◇", "我的私人房源", "上传你收集的信息，仅自己和助手可见。"],
          ["↗", "房源渠道导航", "链家、安居客等信息渠道，跳转后自行沟通。"],
        ]
      : [
          ["▥", "企业基本信息", "经营状态、规模与工商核验情况。"],
          ["◎", "风评与证据", "观点与事实分开，保留来源和核验状态。"],
          ["↗", "查询渠道导航", "企业官网、公开信息与用户自主查询入口。"],
        ]
    )
      .map(([i, t, d]) =>
        card(i + " " + t, '<p class="muted">' + d + "</p>" + btn("查看信息")),
      )
      .join("") +
    "</div>" +
    card(
      housing ? "选工作，也看看生活半径" : "关于数据与结论",
      '<p class="muted">' +
        (housing
          ? "有详细地址即可后续定位。平台数据和你上传的数据共同展示；信息不足时，可从推荐渠道补充。"
          : "当前资料包含企业基本信息与风评。所有评分、口碑和风险提示应核验来源，不把样本观点当作客观事实。") +
        "</p>" +
        btn("上传我的数据", "data") +
        btn("打开城市地图", "map"),
    )
  );
}
function knowledge() {
  return (
    '<div class="toolbar"><input class="search" placeholder="搜索问题、知识点、岗位或公司">' +
    btn("✦ 根据意向岗位整理题库") +
    "</div>" +
    tabs([
      "全部面经",
      "Agent开发",
      "Java后端",
      "前端",
      "数据分析",
      "软件测试",
      "运维",
    ]) +
    '<div class="grid two">' +
    [
      "Nacos 在微服务架构中主要起到什么作用？",
      "MyBatis-Plus 跟 MyBatis 有什么区别？",
      "如何设计一个可控的 Agent 工具调用流程？",
      "如何定位一次前端页面性能问题？",
    ]
      .map((q, i) =>
        card(
          q,
          '<div class="tags">' +
            tag(i < 2 ? "已提供题库示例" : "外观示例") +
            tag("来源与要点") +
            '</div><p class="muted">查看答题要点、来源证据，或加入自己的学习计划。</p>' +
            btn("查看解析") +
            btn("加入题库"),
        ),
      )
      .join("") +
    "</div>" +
    card(
      "从投递意向，生成有针对性的准备",
      "<p>支持选择某一个岗位，或总结全部意向岗位的面经与技能要求。</p>" +
        btn("选择意向岗位") +
        btn("前往学习刷题", "practice", "primary"),
    )
  );
}
function practice() {
  return (
    '<div class="toolbar"><span class="muted">沿用备考帮 · 选择科目 → 选择版本 → 进入复习</span><div>' +
    btn("上传学习资料 / 题库", "studyupload") +
    " " +
    btn("✦ AI 讲题 / 双人画布", "canvas") +
    '</div></div><iframe class="legacy-frame study-frame" title="备考帮复习中心" src="/legacy.html?screen=study"></iframe>'
  );
}
function interview() {
  return (
    '<div class="notice">◉ 计划接入实时 AI 视频面试 · 原型不申请摄像头、麦克风或建立模型连接</div>' +
    tabs(["实时视频面试", "面试设置", "历史与反馈", "上传视频分析"]) +
    '<div class="grid interview-grid"><section class="video-stage"><span class="live-label">AI INTERVIEW STUDIO</span><div class="interviewer">◈</div><h2>星语 · 你的 AI 面试官</h2><p>可以扮演 HR，也可以扮演求职者，双向练习。</p><div class="self-video">你的画面<br><small>摄像头未开启</small></div><div class="video-controls">' +
    btn("🎙 麦克风") +
    btn("▣ 摄像头") +
    btn("开始面试", "preview", "primary") +
    btn("结束") +
    "</div></section>" +
    card(
      "这一次，练习什么？",
      inputs("目标岗位", "从投递意向选择，或自由输入") +
        inputs("面试角色", "技术面试 / HR / 求职者") +
        inputs("面试侧重", "项目追问 / 技术 / 表达") +
        '<h4>实时反馈区</h4><p class="muted">转写、提问、工具状态和面试反馈会在这里展示。</p>',
    ) +
    "</div>"
  );
}
let selectedIntent: number | null = null;
const drafts: Record<number, string> = {};
function plan() {
  const ids = [...intents];
  if (!ids.includes(selectedIntent as number)) selectedIntent = ids[0] ?? null;
  return (
    '<div class="notice">左侧只显示你已勾选的投递意向。选择岗位后，在右侧编辑该岗位专属话术。</div><div class="application-layout"><section class="card intention-panel"><h3>我的意向岗位 <span class="tag">' +
    ids.length +
    '</span></h3><div class="intention-scroll">' +
    (ids.length
      ? ids
          .map(
            (i) =>
              '<button class="intention-item ' +
              (selectedIntent === i ? "chosen" : "") +
              '" data-pick="' +
              i +
              '"><b>' +
              sampleJobs[i][0] +
              "</b><p>" +
              sampleJobs[i][1] +
              " · " +
              sampleJobs[i][2] +
              "</p><small>意向岗位 · 查看并编辑话术 →</small></button>",
          )
          .join("")
      : '<div class="empty-intent"><p>还没有勾选投递意向</p>' +
        btn("前往发现岗位", "jobs") +
        "</div>") +
    '</div></section><section class="card application-editor"><div class="application-actions">' +
    btn("✦ AI 生成专属话术", "draftai", "primary") +
    btn("打开岗位并复制话术") +
    '</div><label class="field">' +
    (selectedIntent === null
      ? "选择一个意向岗位"
      : sampleJobs[selectedIntent][0]) +
    '<textarea id="draft" placeholder="空白时生成，有内容时优化。你也可以在这里自由修改。"></textarea></label><small class="muted">当前仅演示界面与岗位切换，不调用模型或执行复制。</small></section></div>'
  );
}
function chat() {
  return (
    '<div class="chat-layout">' +
    card(
      "协作任务",
      '<div class="tool-list">' +
        agents.map((a) => btn(a[0] + " · " + a[1])).join("") +
        "</div>",
    ) +
    '<section class="card conversation"><div class="chat-greeting">✦<h2>你好，我是小光。</h2><p>想先聊聊方向，还是看看喜欢的城市？</p></div><div class="prompt-chips">' +
    btn("我还不知道适合什么岗位") +
    btn("帮我梳理杭州的机会") +
    btn("从零做一份简历") +
    '</div><div class="chat-input"><textarea placeholder="告诉我你现在的想法…"></textarea><div>' +
    btn("＋ 文件") +
    btn("🎙 语音") +
    btn("发送 ↗") +
    "</div></div></section></div>"
  );
}
function community() {
  return (
    tabs(["经验互助", "面经分享", "心愿池", "我的收藏"]) +
    '<div class="grid three">' +
    [
      ["一起准备秋招", "分享准备节奏，也交换真实经验。"],
      ["我的求职心愿", "想在喜欢的城市，做自己擅长的事。"],
      ["新手提问区", "不懂就问，一起把求职信息差补上。"],
    ]
      .map(([t, d]) =>
        card(t, '<p class="muted">' + d + "</p>" + btn("看看大家怎么说")),
      )
      .join("") +
    "</div>" +
    btn("＋ 分享 / 许愿")
  );
}
function settings() {
  return (
    '<div class="grid two">' +
    card(
      "看板娘与声音",
      inputs("默认音色", "选择喜欢的 TTS 音色") +
        inputs("形象与动作", "主看板娘 / 各职责角色") +
        '<div class="tool-list">' +
        [
          "语音播报",
          "ASR 语音输入",
          "主动提醒（仅首次引导）",
          "看板娘随机动作",
          "鼠标拖尾特效",
        ]
          .map(
            (t) =>
              '<label class="switch-row">' +
              t +
              '<input type="checkbox" checked></label>',
          )
          .join("") +
        "</div>",
    ) +
    card(
      "账号与隐私",
      '<p class="muted">个人资料、私人数据、会话和媒体的管理入口。</p><div class="tool-list">' +
        ["管理私人数据", "导出我的数据", "删除记录", "媒体清理设置", "退出登录"]
          .map((s) => btn(s))
          .join("") +
        "</div>",
    ) +
    "</div>"
  );
}
function admin() {
  return (
    tabs([
      "数据看板",
      "用户管理",
      "岗位与企业",
      "题库审核",
      "社区治理",
      "AI 服务设置",
      "运行日志",
    ]) +
    '<div class="grid three">' +
    ["数据治理", "权限与账号", "模型与服务"]
      .map((s) =>
        card(
          s,
          '<p class="muted">管理入口占位，正式功能确认后实现。</p>' +
            btn("进入管理"),
        ),
      )
      .join("") +
    "</div>"
  );
}
const views: Record<string, () => string> = {
  home,
  profile,
  resume,
  data,
  jobs,
  dashboard,
  map: mapPage,
  companies: () => channels("companies"),
  housing: () => channels("housing"),
  knowledge,
  practice,
  interview,
  plan,
  chat,
  community,
  settings,
  admin,
};
function avatar(i: number, large = false) {
  const a = agents[i];
  return (
    '<div class="avatar ' +
    (large ? "large" : "") +
    '" style="--avatar:' +
    a[4] +
    '"><span class="hair"></span><span class="face">•‿•</span><span class="body"></span><i>' +
    a[3] +
    "</i></div>"
  );
}
function render() {
  mountPets();
  let page = pages.find((p) => p.id === active)!;
  $("#app").innerHTML =
    '<main class="immersive-main"><header class="sky-header"><a class="sky-brand" href="#home"><span>✦</span><div>逐光<small>CAREER COMPANION</small></div></a><span class="sky-now">' +
    page.name +
    '</span><div class="sky-actions">' +
    btn("旅程地图", "journeymap") +
    btn("使用引导", "tutorial") +
    '<button class="admin-portal" data-page="admin">管理员入口 ↗</button>' +
    '</div></header><div class="page-content"><div class="scene-heading"><span class="eyebrow">' +
    (active === "home"
      ? "A LITTLE CLOSER TO YOUR FUTURE"
      : "YOUR CAREER, YOUR WAY") +
    "</span><h1>" +
    page.name +
    "</h1><p>" +
    page.sub +
    "</p></div>" +
    views[active]() +
    '<footer class="page-footer">逐光 · AI 求职助手 <span>当前仅供界面与布局审核，所有业务能力尚未接入</span></footer></div></main>' +
    '<button class="orbit-trigger" data-action="orbit" aria-expanded="false"><i>☯</i><span>星盘导航</span></button>' +
    '<section class="orbit-overlay" hidden><div class="orbit-head"><span>选择下一站</span><button class="orbit-close" data-action="orbit">收起 ×</button></div><div class="orbit-links">' +
    pages
      .filter((p) => p.id !== "admin")
      .map(
        (p, i) =>
          '<button class="orbit-item ' +
          (p.id === active ? "selected" : "") +
          '" data-page="' +
          p.id +
          '"><small>0' +
          (i + 1) +
          "</small><i>" +
          p.icon +
          "</i>" +
          p.name +
          "</button>",
      )
      .join("") +
    '</div><button class="admin-portal orbit-admin" data-page="admin">管理员入口 ↗</button></section>';
  if (active === "plan") {
    const t = document.querySelector("#draft") as HTMLTextAreaElement;
    if (t) t.value = selectedIntent === null ? "" : drafts[selectedIntent] || "";
    updateDraftButton();
  }
}
function go(id: string) {
  if (!views[id]) return;
  if (id === active) {
    render();
    return;
  }
  const veil = document.createElement("div");
  veil.className = "fog-veil";
  document.body.appendChild(veil);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      veil.classList.add("in");
      setTimeout(() => {
        active = id;
        location.hash = id;
        render();
        window.scrollTo(0, 0);
        veil.classList.remove("in");
        veil.classList.add("out");
        setTimeout(() => veil.remove(), 760);
      }, 430);
    });
  });
}
function modal(title: string, body: string) {
  $("#modal").innerHTML =
    '<div class="modal-backdrop"><section class="modal-card"><button class="close" data-action="close">×</button><h2>' +
    title +
    "</h2>" +
    body +
    "</section></div>";
}
function toast(s = "这是外观原型，业务功能将在布局确认后接入。") {
  const t = $("#toast");
  t.textContent = s;
  t.classList.add("visible");
  setTimeout(() => t.classList.remove("visible"), 3000);
}
document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest("button") as HTMLElement;
  if (!el) return;
  if (el.dataset.page) {
    go(el.dataset.page);
    return;
  }
  if (el.dataset.agent) {
    selectedAgent = Number(el.dataset.agent);
    render();
    return;
  }
  if (el.dataset.intent) {
    let i = Number(el.dataset.intent);
    intents.has(i) ? intents.delete(i) : intents.add(i);
    render();
    return;
  }
  if (el.dataset.confirm) {
    const k = el.dataset.confirm;
    const inp = document.querySelector("#pref-" + k) as HTMLInputElement;
    const v = inp.value.trim();
    if (v) {
      preferences[k].push(v);
      inp.value = "";
      const box = document.querySelector("#tags-" + k);
      if (box) box.innerHTML = preferenceTags(k);
      toast("已添加「" + v + "」");
    }
    return;
  }
  if (el.dataset.removePref) {
    const k = el.dataset.removePref;
    preferences[k].splice(Number(el.dataset.index), 1);
    const box = document.querySelector("#tags-" + k);
    if (box) box.innerHTML = preferenceTags(k);
    return;
  }
  let a = el.dataset.action;
  if (a === "match") {
    aiFilter = true;
    render();
    toast("已展示「AI 匹配」筛选外观；尚未进行真实匹配。");
  } else if (a === "removefilter") {
    aiFilter = false;
    render();
  } else if (a === "explorecity") {
    dashboardFocus = "city";
    go("dashboard");
  } else if (a === "explorecareer") {
    dashboardFocus = "career";
    go("dashboard");
  } else if (a === "orbit") {
    const ov = document.querySelector(".orbit-overlay") as HTMLElement;
    const tri = document.querySelector(".orbit-trigger") as HTMLElement;
    const hidden = ov.hidden;
    ov.hidden = !hidden;
    tri.setAttribute("aria-expanded", String(!hidden));
  } else if (a === "dashfocus") {
    dashboardFocus = el.dataset.mode as "city" | "career";
    render();
  } else if (a === "citychoice") {
    dashboardCity = el.dataset.city!;
    render();
  } else if (a === "fullscreen") {
    const stage = document.querySelector(".dashboard-stage") as HTMLElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else stage?.requestFullscreen?.();
  } else if (a === "journeymap") {
    const ov = document.querySelector(".orbit-overlay") as HTMLElement;
    ov.hidden = false;
  } else if (a === "city" || a === "direction") {
    go("profile");
    toast(
      a === "city"
        ? "从意向城市开始，也可以选择不确定。"
        : "从职业方向开始，自由填写你的想法。",
    );
  } else if (
    a === "data" ||
    a === "map" ||
    a === "practice" ||
    a === "chat" ||
    a === "resume" ||
    a === "jobs"
  )
    go(a);
  else if (a === "close") $("#modal").innerHTML = "";
  else if (a === "tab") {
    el.parentElement!.querySelectorAll("button").forEach((b) =>
      b.classList.remove("chosen"),
    );
    el.classList.add("chosen");
  } else if (a === "addfield") {
    el.insertAdjacentHTML(
      "beforebegin",
      inputs("更多信息", "自由填写，可保留不确定"),
    );
  } else if (a === "education")
    el.insertAdjacentHTML(
      "beforebegin",
      '<div class="grid three">' +
        inputs("学校", "本科 / 专科等学校名称") +
        inputs("学历 / 专业", "自由填写") +
        inputs("就读时间", "自由填写") +
        "</div>",
    );
  else if (a === "canvas")
    modal(
      "AI 讲题 · 双人画布",
      '<div class="toolbar">' +
        tag("紫色：AI") +
        tag("青色：你") +
        btn("撤销") +
        btn("清空") +
        btn("语音讲解") +
        '</div><div class="canvas-demo"><span class="ai-writing">解题思路：拆解问题 → 画出关系 → 验证结果</span><span class="user-writing">我想问：这一步为什么成立？</span></div><p class="muted">书写、颜色区分与撤销入口示意，尚未接入绘制和 AI。</p>',
    );
  else if (a === "login")
    modal(
      "欢迎来到逐光",
      tabs(["登录", "注册"]) +
        inputs("账号", "输入账号") +
        inputs("密码", "输入密码") +
        btn("进入个人空间", "preview", "primary") +
        '<p class="muted">当前为免登录外观审核，不会提交账号或密码。</p>',
    );
  else if (a === "tutorial")
    modal(
      "按自己的节奏开始",
      '<div class="timeline">' +
        [
          "先选城市，或先选职业方向",
          "整理个人信息，从零制作简历",
          "可选上传自己的数据",
          "寻找岗位并勾选投递意向",
          "学习、面试，再生成投递方案",
        ]
          .map((t) => "<p>✦ " + t + "</p>")
          .join("") +
        "</div><p>所有页面都可以自由进入，不需要强制完成前一步。</p>",
    );
  else if (a === "pet")
    modal(
      "看板娘工具箱",
      '<div class="grid two">' +
        [
          "切换形象",
          "随机动作",
          "ASR 语音输入",
          "TTS 音色",
          "多模态附件",
          "生成页面",
          "主动引导偏好",
          "协作任务",
        ]
          .map((t) => btn(t))
          .join("") +
        "</div>",
    );
  else if (a === "jobdetail" || a === "mapdetail")
    modal(
      "信息详情卡片",
      '<p>这里展示岗位 / 房源 / 企业信息、详细地址和原始来源。</p><div class="notice">原型不提供虚构的招聘链接。正式接入后可直接打开对应原始页面。</div>' +
        btn("加入投递意向") +
        btn("打开来源链接 ↗"),
    );
  else toast();
});

function mountPets() {
  if (document.querySelector("#pets")) return;
  const host = document.createElement("div");
  host.id = "pets";
  host.innerHTML = agents
    .map(
      (a, i) =>
        '<div class="floating-pet ' +
        (!i ? "lead-pet" : "small-pet") +
        '" style="left:' +
        Math.max(12, window.innerWidth - 120 - i * 65) +
        "px;top:" +
        (i ? 90 : 140) +
        'px"><div class="pet-drag" title="按住自由拖动">' +
        avatar(i, !i) +
        "<span>" +
        a[0] +
        " · " +
        a[1] +
        '</span></div><button class="pet-menu" data-action="pet">⋯</button></div>',
    )
    .join("");
  document.body.append(host);
  host.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    const pet = target.closest(".floating-pet") as HTMLElement;
    if (!pet) return;
    const box = pet.getBoundingClientRect(),
      dx = e.clientX - box.left,
      dy = e.clientY - box.top;
    pet.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      pet.style.left =
        Math.max(0, Math.min(innerWidth - pet.offsetWidth, ev.clientX - dx)) +
        "px";
      pet.style.top =
        Math.max(0, Math.min(innerHeight - pet.offsetHeight, ev.clientY - dy)) +
        "px";
    };
    pet.addEventListener("pointermove", move);
    pet.addEventListener(
      "pointerup",
      () => pet.removeEventListener("pointermove", move),
      { once: true },
    );
  });
}
function updateDraftButton() {
  const b = document.querySelector('[data-action="draftai"]');
  if (b)
    b.textContent = (
      document.querySelector("#draft") as HTMLTextAreaElement
    )?.value.trim()
      ? "✦ AI 优化现有话术"
      : "✦ AI 生成专属话术";
}
document.addEventListener("input", (e) => {
  const t = e.target as HTMLElement;
  if (t.matches("textarea.grow-text")) {
    t.style.height = "auto";
    t.style.height = t.scrollHeight + "px";
  }
  if ((t as HTMLTextAreaElement).id === "draft") {
    if (selectedIntent !== null)
      drafts[selectedIntent] = (t as HTMLTextAreaElement).value;
    updateDraftButton();
  }
});
document.addEventListener("change", (e) => {
  const s = e.target as HTMLSelectElement;
  if (s.dataset.action === "dashdirection") {
    dashboardDirection = s.value;
    render();
  }
});
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  if (b.dataset.pick) {
    selectedIntent = Number(b.dataset.pick);
    render();
    const t = $("#draft") as HTMLTextAreaElement;
    t.value = drafts[selectedIntent] || "";
    updateDraftButton();
  } else if (b.dataset.version) {
    resumeVersion = Number(b.dataset.version);
    render();
  } else if (b.dataset.action === "newversion") {
    resumeVersions.push("新版本 " + (resumeVersions.length + 1));
    resumeVersion = resumeVersions.length - 1;
    render();
  } else if (b.dataset.action === "addentry") {
    b.insertAdjacentHTML(
      "beforebegin",
      '<div class="grid three">' +
        inputs("名称", "自由填写") +
        inputs("时间 / 角色", "自由填写") +
        inputs("内容与成果", "自由填写") +
        "</div>",
    );
  } else if (
    b.dataset.action === "focuscity" ||
    b.dataset.action === "focusjob"
  ) {
    const list = document.querySelectorAll(".field input");
    (
      list[b.dataset.action === "focuscity" ? 0 : 2] as HTMLInputElement
    )?.focus();
  } else if (b.dataset.action === "studyupload") {
    go("data");
    modal(
      "学习资料与题库上传",
      '<iframe class="legacy-frame" style="height:65vh" title="备考帮原上传页面" src="/legacy.html?screen=upload"></iframe>',
    );
  }
});
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.type === "prototype-frame-size") {
    document
      .querySelectorAll<HTMLIFrameElement>(".legacy-frame")
      .forEach((f) => {
        if (f.contentWindow === e.source)
          f.style.height = Math.max(700, e.data.height + 12) + "px";
      });
    return;
  }
  if (e.data?.type === "prototype-canvas")
    document
      .querySelector<HTMLButtonElement>('[data-action="canvas"]')
      ?.click();
  if (e.data?.type === "prototype-upload") {
    go("data");
    document
      .querySelector<HTMLButtonElement>('[data-action="studyupload"]')
      ?.click();
  }
});
window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (views[id] && id !== active) {
    active = id;
    render();
  }
});
active = views[location.hash.slice(1)] ? location.hash.slice(1) : "home";
render();
