import fs from "node:fs";
import path from "node:path";

const DEFAULTS = [
  { id: "xingye", name: "星野", role: "主理人", desc: "统筹全局，解答求职与学习问题，兜底所有未分类请求", model: "deepseek-v4.1-flash" },
  { id: "zhiwei", name: "知微", role: "学习助教", desc: "讲题、拆知识点、制定复习节奏", model: "glm-5.3-flash" },
  { id: "yanzhou", name: "砚舟", role: "求职顾问", desc: "简历、岗位匹配、面试准备", model: "kimi-k3" },
  { id: "qichi", name: "栖迟", role: "生活管家", desc: "租房、通勤、城市生活", model: "deepseek-v4.1-flash" },
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
