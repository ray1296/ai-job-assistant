import fs from "node:fs";
import path from "node:path";

const DEFAULTS = [
  {
    id: "xingye", name: "星野", role: "主理人", desc: "统筹全局，解答求职与学习问题，兜底所有未分类请求", model: "deepseek-v4.1-flash",
    prompt: "你负责兜底与调度：用户没有明确归属的问题都由你回答。你也是识图入口——用户发来题目截图、简历截图或界面截图时，先准确读出图里的文字和题目，再讲清楚；看不清就直说。判断问题属于学习就 @知微，属于求职就 @砚舟，属于租房通勤就 @栖迟；交接时用一句话说明为什么交给对方。",
  },
  {
    id: "zhiwei", name: "知微", role: "学习助教", desc: "讲题、拆知识点、制定复习节奏", model: "glm-5.3-flash",
    prompt: "你负责学习板块：刷题、讲题、错题复盘、复习节奏和题库整理。讲题先给结论，再分步推理；一次只讲一步，等学生说“懂了，继续”再进入下一步。引用题目时不得改写题干、选项或答案事实，材料不足就说不足。用户发来题目截图时，先逐字读题再讲解。",
  },
  {
    id: "yanzhou", name: "砚舟", role: "求职顾问", desc: "简历、岗位匹配、面试准备", model: "kimi-k3",
    prompt: "你负责求职板块：简历结构、措辞、岗位匹配、投递节奏和面试准备。改简历只给可核对的建议，必须逐字引用原文；不编造经历、公司、学校、指标或时间。岗位与公司信息只能引用工具返回的数据，没有数据就说明没有。",
  },
  {
    id: "qichi", name: "栖迟", role: "生活管家", desc: "租房、通勤、城市生活", model: "deepseek-v4.1-flash",
    prompt: "你负责生活板块：租房、通勤、城市生活成本与安全提醒。租金、地址、电话等信息只引用平台数据，缺失就明确说缺失；不推荐没有来源的房源，不编造价格或距离。通勤建议要说清取舍（时间、租金、便利性）。",
  },
];

export function createAgents(privateDir) {
  const root = path.join(privateDir, "agents");
  fs.mkdirSync(root, { recursive: true });

  const file = (id) => path.join(root, id + ".json");
  const memFile = (id) => path.join(root, id + ".memory.md");
  const ws = (id) => {
    const d = path.join(root, id + ".workspace");
    fs.mkdirSync(d, { recursive: true });
    return d;
  };

  function ensure(id) {
    const d = DEFAULTS.find((x) => x.id === id);
    if (!d) return null;
    if (!fs.existsSync(file(id))) fs.writeFileSync(file(id), JSON.stringify(d, null, 2));
    else {
      // 老配置没有板块 prompt 的，补上默认版本（用户已自定义的不覆盖）。
      try {
        const cfg = JSON.parse(fs.readFileSync(file(id), "utf8"));
        if (!cfg.prompt && d.prompt) {
          cfg.prompt = d.prompt;
          fs.writeFileSync(file(id), JSON.stringify(cfg, null, 2));
        }
      } catch {}
    }
    if (!fs.existsSync(memFile(id))) fs.writeFileSync(memFile(id), "# " + d.name + " 的记忆\n\n");
    ws(id);
    return d;
  }
  function list() {
    for (const d of DEFAULTS) ensure(d.id);
    return DEFAULTS.map((d) => {
      const cfg = JSON.parse(fs.readFileSync(file(d.id), "utf8"));
      const mem = fs.readFileSync(memFile(d.id), "utf8");
      return { ...cfg, memoryLines: mem.split("\n").filter((l) => l.trim().startsWith("- ")).length };
    });
  }
  function read(id) {
    ensure(id);
    if (!fs.existsSync(file(id))) return null;
    return {
      config: JSON.parse(fs.readFileSync(file(id), "utf8")),
      memory: fs.readFileSync(memFile(id), "utf8"),
      workspace: fs.readdirSync(ws(id)).slice(0, 50),
    };
  }
  function update(id, patch) {
    ensure(id);
    if (!fs.existsSync(file(id))) return null;
    const cfg = JSON.parse(fs.readFileSync(file(id), "utf8"));
    for (const k of ["name", "role", "desc", "model", "prompt"]) {
      if (typeof patch?.[k] === "string") cfg[k] = patch[k].slice(0, 4000);
    }
    fs.writeFileSync(file(id), JSON.stringify(cfg, null, 2));
    return cfg;
  }
  function remember(id, text) {
    ensure(id);
    if (!fs.existsSync(memFile(id))) return null;
    const line = "- [" + new Date().toISOString().slice(0, 10) + "] " + String(text).replace(/\s+/g, " ").slice(0, 300);
    fs.appendFileSync(memFile(id), line + "\n");
    return { ok: true, line };
  }
  function context(id) {
    ensure(id);
    if (!fs.existsSync(file(id))) return { system: "", memory: "" };
    const cfg = JSON.parse(fs.readFileSync(file(id), "utf8"));
    const mem = fs.existsSync(memFile(id)) ? fs.readFileSync(memFile(id), "utf8") : "";
    const memLines = mem.split("\n").filter((l) => l.trim().startsWith("- ")).slice(-20).join("\n");
    const system = "你是「" + (cfg.name || id) + "」，角色是" + (cfg.role || "") + "。" + (cfg.desc || "") +
      (cfg.prompt ? "\n" + cfg.prompt : "") +
      (memLines ? "\n你记得这些历史要点：\n" + memLines : "");
    return { system, memory: mem };
  }
  return { list, read, update, remember, context };
}
