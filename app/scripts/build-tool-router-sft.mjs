import fs from "node:fs";
import path from "node:path";

const system = "你是逐光求职站的工具路由器。根据用户请求，只决定是否调用一个工具，并抽取参数。只输出一个 JSON 对象，格式为 {\"tool\":\"工具名或none\",\"args\":{}}。不要输出解释、Markdown 或多余文字。可用工具：search_jobs(keyword?,city?,limit?)、company_review(name)、find_housing(city?,maxRent?)、my_progress()。";
const rows = [];
const add = (user, tool, args = {}) => rows.push({
  messages: [
    { role: "system", content: system },
    { role: "user", content: user },
    { role: "assistant", content: JSON.stringify({ tool, args }) },
  ],
});
const cities = ["北京", "上海", "杭州", "深圳", "广州", "成都"];
const roles = ["前端", "Java后端", "软件测试", "数据分析", "运维", "Agent开发"];
for (const c of cities) for (const r of roles) {
  add("帮我找" + c + "的" + r + "岗位", "search_jobs", { keyword: r, city: c });
  add(c + "有哪些" + r + "机会", "search_jobs", { keyword: r, city: c });
  add("我想去" + c + "做" + r, "search_jobs", { keyword: r, city: c });
}
for (const r of roles) {
  add("最近有哪些" + r + "的校招机会", "search_jobs", { keyword: r });
  add("推荐一些" + r + "岗位", "search_jobs", { keyword: r });
}
for (const c of cities) for (const rent of [2000, 3000, 4500, 6000]) {
  add(c + "月租 " + rent + " 以内的房子", "find_housing", { city: c, maxRent: rent });
  add("帮我找" + c + " " + rent + " 元以下的租房", "find_housing", { city: c, maxRent: rent });
}
add("上海 3 公里内、月租 4000 以内的房子", "find_housing", { city: "上海", maxRent: 4000 });
add("杭州 2500 元以下合租", "find_housing", { city: "杭州", maxRent: 2500 });
add("看看成都的租房", "find_housing", { city: "成都" });
for (const n of ["字节跳动", "腾讯", "阿里巴巴", "美团", "小红书", "华为"]) {
  add(n + "这家公司怎么样？", "company_review", { name: n });
  add("帮我查一下" + n + "的企业风评", "company_review", { name: n });
}
add("我现在刷了多少题？", "my_progress", {});
add("查看我的学习进度", "my_progress", {});
add("我这周复习得怎么样", "my_progress", {});
for (const q of ["你好", "今天天气怎么样", "帮我写一份简历", "我该怎么准备秋招", "谢谢", "你是谁", "给我讲个笑话", "帮我改一下这句话"]) add(q, "none", {});
for (const q of ["我想找上海的前端工作，顺便看看附近租房", "先查字节跳动，再找北京 Java 岗位", "我学习进度如何，另外推荐杭州的房子"]) add(q, "none", {});
fs.mkdirSync("data/finetune", { recursive: true });
const out = "data/finetune/tool-router.jsonl";
fs.writeFileSync(out, rows.map((x) => JSON.stringify(x)).join("\n") + "\n", "utf8");
console.log(JSON.stringify({ out, rows: rows.length, bytes: fs.statSync(out).size }));
