export const GUIDE_SECTIONS = [
  {
    id: "start", title: "第一次使用", keywords: "开始 新手 首页 账号 登录 注册 导航 星盘",
    summary: "先注册账号，再从首页星盘或顶部导航进入各板块。每个页面只处理自己的数据。",
    steps: ["注册/登录后先完善个人信息，至少填姓名、城市、方向", "首页星盘可展开 17 个板块，也可用顶部“功能说明”随时查", "不懂某个按钮时，直接问看板娘；看板娘有项目说明工具"],
  },
  {
    id: "profile", title: "个人信息与简历", keywords: "个人 资料 简历 导入 word pdf 图片 教育 项目 技能",
    summary: "个人信息用于生成简历和岗位匹配；简历工作室用于编辑、排版、导出。",
    steps: ["个人信息：填城市/方向/教育/项目/技能，保存", "上传已有简历：支持 PDF/DOCX/PNG/JPEG，AI 只生成待确认草稿", "简历工作室：双击文字编辑，回车确认，Esc 取消；可复制版本/导出 Word/PDF"],
  },
  {
    id: "jobs", title: "岗位与投递方案", keywords: "岗位 搜索 求职 投递 意向 方案 定制 简历 话术",
    summary: "岗位目录按城市/方向筛选；加入投递意向后可生成话术和岗位定制简历。",
    steps: ["发现岗位：搜索或筛选，打开详情看来源", "加入投递意向", "方案页保存话术草稿；生成定制简历不会覆盖原简历"],
  },
  {
    id: "data", title: "数据空间与上传", keywords: "数据 上传 csv excel json 岗位 租房 企业 面经 文件",
    summary: "私人数据按账号隔离；支持 CSV/Excel/JSON/XML 等表格数据。",
    steps: ["数据空间选文件→选分类→上传并解析", "解析后核对字段映射和原始行，再使用地图/岗位匹配", "简历导入在个人信息页，题库导入在上传题库页"],
  },
  {
    id: "learning", title: "学习、刷题与题库", keywords: "学习 刷题 题库 知识点 简答题 选择题 判断题 收藏 错题 卡片 科目 版本",
    summary: "题库按科目/版本组织；卡片记忆和刷题都从同一套题来。",
    steps: ["上传题库：新建科目/版本，平台题库或文件导入", "刷题：选择题/判断题/简答题/代码填空按题型切换", "卡片记忆直接显示全部卡片，不再区分知识点/简答", "AI 工具在刷题页右侧，生成选择题/判断题/简化答案都在那里"],
  },
  {
    id: "interview", title: "模拟面试", keywords: "面试 模拟 摄像头 麦克风 视频 反馈 历史",
    summary: "可选 AI 面试官或 AI 当求职者；摄像头不可用时自动降级文字。",
    steps: ["选岗位/风格/难度", "允许摄像头麦克风；不行就打字", "结束面试查看反馈；原始音视频不落盘"],
  },
  {
    id: "chat", title: "AI 协作空间与看板娘", keywords: "AI agent 看板娘 对话 文件 图片 知识库 工具 屏幕 手势",
    summary: "AI 协作空间支持多 agent、图片和文档；看板娘是常驻入口。",
    steps: ["AI 协作空间可上传图片/PDF/Word/Excel/文本，解析后作为上下文", "看板娘可切 Agent 模式或知识库模式，但两者是独立模式", "屏幕观察是可选授权，不会自动读屏；手势是本地摄像头彩蛋"],
  },
  {
    id: "map", title: "城市与通勤地图", keywords: "地图 通勤 地铁 租房 岗位 路线 高德 工具箱",
    summary: "地图把投递岗位、私人租房和公开 POI 放到同一张图；地铁站按当前城市动态加载。",
    steps: ["勾选岗位/租房/地铁站/酒店图层", "地铁站按当前岗位或租房所在城市加载，不再固定 25 个", "工具箱可拖动；选岗位/住房地址后规划通勤"],
  },
  {
    id: "wish", title: "心愿池与审核", keywords: "心愿 建议 审核 采纳 退回 撤销 管理员",
    summary: "用户提交建议后进入待审核；管理员采纳后才公开展示。",
    steps: ["用户提交后显示“审核中”，可撤销", "管理员在管理中心→心愿池审核队列里采纳/退回", "采纳后用户不能再删除；长文本可展开/收起"],
  },
  {
    id: "admin", title: "管理中心", keywords: "管理员 后台 用户 统计 心愿 通告 隐私",
    summary: "管理中心只给管理员，普通用户从登录/注册的管理员角色进入，不在用户端 header 显示。",
    steps: ["登录时选管理员入口", "概览看服务状态；用户账号只看元数据", "心愿池审核、通告发布、系统隐私说明"],
  },
  {
    id: "notice", title: "站内通告", keywords: "通告 公告 通知 官方 已阅 顶部",
    summary: "管理员可发布全局通告，用户在顶部通告入口查看并点已阅。",
    steps: ["管理员→通告：新增并发布", "用户顶部“通告”出现未读数，点开阅读并已阅", "已阅状态保存在本机"],
  },
];
export function allGuide() {
  return GUIDE_SECTIONS;
}
export function guideFor(query = "") {
  const q = String(query || "").toLowerCase();
  if (!q) return GUIDE_SECTIONS;
  const hit = GUIDE_SECTIONS.filter((s) => (s.title + " " + s.summary + " " + s.steps.join(" ") + " " + s.keywords).toLowerCase().includes(q));
  if (hit.length) return hit;
  const tokens = q.match(/[a-z0-9]+|[一-鿿]{2}/g) || [];
  return GUIDE_SECTIONS.filter((s) => tokens.some((t) => (s.title + s.keywords + s.summary).toLowerCase().includes(t))).slice(0, 4);
}
export function guideText(query = "") {
  return guideFor(query).map((s) => "【" + s.title + "】" + s.summary + "\n" + s.steps.map((x, i) => (i + 1) + ". " + x).join("\n")).join("\n\n");
}
