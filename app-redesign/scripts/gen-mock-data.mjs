// 生成演示用模拟数据：填充「就业数据大屏」与「通勤地图」的数据密度。
// 原始收录数据保持不变；新增记录都带 provenance.synthetic = true，
// 并且来源平台/来源类型写「模拟数据」，方便核对与一键清理。
//
// 用法：node scripts/gen-mock-data.mjs [--jobs-per-city=14] [--housing-per-city=45]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../data/", import.meta.url);
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const JOBS_PER_CITY = Number(argv["jobs-per-city"] || 30);
const HOUSING_PER_CITY = Number(argv["housing-per-city"] || 70);
const TODAY = new Date().toISOString().slice(0, 10);

const CITIES = ["北京","上海","广州","深圳","杭州","成都","南京","武汉","西安","苏州","天津","重庆","长沙","郑州","合肥","厦门","福州","济南","青岛","宁波","无锡","东莞","佛山","珠海","昆明","南昌","贵阳","太原","石家庄","沈阳","大连","长春","哈尔滨","南宁","海口","兰州","乌鲁木齐","呼和浩特","银川","西宁","香港","澳门","台湾"];

const DIRECTIONS = [
  { name: "Java后端", category: "后端", jd: "负责服务端接口设计与开发，参与微服务拆分、性能优化与高并发场景治理；熟悉 Java、Spring，了解 MySQL、Redis、Kafka。" },
  { name: "前端开发", category: "前端", jd: "负责 Web 前端开发，使用 Vue/React 与 TypeScript 构建中后台与移动端页面；关注首屏性能、组件化与可访问性。" },
  { name: "算法工程", category: "算法", jd: "负责推荐与搜索排序算法，参与大模型应用与 RAG 检索增强；熟悉 Python、机器学习、深度学习与特征工程。" },
  { name: "数据分析", category: "数据", jd: "负责业务数据分析与指标体系建设，使用 SQL、Python 完成数据挖掘与可视化，支持经营决策。" },
  { name: "测试开发", category: "测试", jd: "负责接口自动化测试与质量保障体系建设，编写自动化用例，参与性能测试与稳定性治理。" },
  { name: "云原生运维", category: "运维", jd: "负责容器化与云原生平台运维，管理 Docker、K8s 集群，完善监控告警与持续交付流程。" },
  { name: "产品经理", category: "产品", jd: "负责产品需求分析与方案设计，输出 PRD，跟进项目落地与数据复盘，协调设计与研发资源。" },
  { name: "增长运营", category: "运营", jd: "负责用户增长与活动运营，制定运营策略，分析转化漏斗，推动内容与社区生态建设。" },
];
const COMPANIES = ["星澜科技","云杉数据","合流智能","青禾信息","北辰云图","零点科技","拾光网络","南栀软件","九州算力","澄明数据","拾贝科技","木石互联","澈水信息","同途数字","灰鲸科技","长川软件","浮云智算","墨白网络","律动信息","第七城科技"];
const SCALES = ["100-499人", "500-999人", "1000-9999人", "10000人以上（大厂）"];
const EDUS = ["本科", "硕士", "不限"];
const LAYOUTS = ["1室1厅1卫", "2室1厅1卫", "2室2厅1卫", "3室1厅1卫", "开间"];
const DISTRICTS = ["高新区", "经开区", "滨江区", "城南新区", "科技园", "大学城", "金融城", "老城区"];

const pick = (arr, i) => arr[i % arr.length];
const hex24 = (...parts) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
const money = (i) => {
  const base = 8 + (i % 9) * 3;
  return base + "-" + (base + 6 + (i % 5) * 2) + "K·" + (13 + (i % 3)) + "薪";
};

// ---------- 岗位 ----------
const jobsFile = new URL("jobs-catalog.json", ROOT);
const jobsDoc = JSON.parse(readFileSync(jobsFile, "utf8"));
if (jobsDoc.schemaVersion !== 1 || !Array.isArray(jobsDoc.jobs)) throw new Error("jobs-catalog.json 结构不符合预期");
const before = jobsDoc.jobs.length;
jobsDoc.jobs = jobsDoc.jobs.filter((j) => !(j.provenance && j.provenance.synthetic));
let added = 0;
let globalIdx = 0;
// 每个城市的岗位量按城市序号浮动（0.6~1.4 倍），避免每城一个数字看起来很假
const cityJobCount = (ci) => Math.max(6, Math.round(JOBS_PER_CITY * (0.6 + ((ci * 37) % 9) / 10)));
CITIES.forEach((city, ci) => {
  const perCity = cityJobCount(ci);
  for (let i = 0; i < perCity; i++) {
    const dir = pick(DIRECTIONS, i + city.length);
    // 公司分布也不均匀：不同城市的岗位会自然偏向不同的几家公司
    const company = COMPANIES[(ci * 7 + i * 13 + ((ci * ci + i * i) % 11)) % COMPANIES.length];
    const raw = {
      "方向": dir.name,
      "公司": company,
      "公司规模": pick(SCALES, i),
      "来源平台": "模拟数据（演示用）",
      "岗位名称": dir.name + " · " + city + (i % 3 === 0 ? "（实习转正）" : "（2026 届校招）"),
      "岗位类别": dir.category,
      "城市": city,
      "覆盖城市": city,
      "详细地址": city + pick(DISTRICTS, i) + "科技大道 " + (10 + i * 7) + " 号",
      "地址精度": "园区级（模拟）",
      "招聘类型": i % 4 === 0 ? "实习" : "校园招聘（应届）",
      "学历": pick(EDUS, i),
      "薪资": money(globalIdx),
      "岗位职责/JD": dir.jd + " 工作城市：" + city + "。",
      "任职要求": "2026 届本科及以上，扎实的计算机基础，良好的沟通与协作能力。",
      "加分项/其他信息": "有开源项目、竞赛获奖或实习经历者优先。",
      "数据来源类型": "模拟数据",
      "抓取日期": TODAY,
    };
    const id = hex24("mock-job", city, String(i));
    globalIdx++;
    jobsDoc.jobs.push({ id, raw, url: "", provenance: { synthetic: true, generator: "scripts/gen-mock-data.mjs", note: "演示用模拟岗位，不是真实招聘信息" } });
    added++;
  }
});
jobsDoc.generatedAt = TODAY;
writeFileSync(jobsFile, JSON.stringify(jobsDoc, null, 2) + "\n");

// ---------- 租房 ----------
const housingFile = new URL("housing-catalog.json", ROOT);
const housingDoc = JSON.parse(readFileSync(housingFile, "utf8"));
if (!Array.isArray(housingDoc.items)) throw new Error("housing-catalog.json 结构不符合预期");
const housingBefore = housingDoc.items.length;
housingDoc.items = housingDoc.items.filter((h) => h.platform !== "模拟数据");
const perCity = new Map();
for (const h of housingDoc.items) perCity.set(h.city, (perCity.get(h.city) || 0) + 1);
let hAdded = 0;
for (const city of CITIES) {
  const have = perCity.get(city) || 0;
  for (let i = have; i < HOUSING_PER_CITY; i++) {
    const layout = pick(LAYOUTS, i);
    const area = 38 + (i % 9) * 9;
    const district = pick(DISTRICTS, i + city.length);
    housingDoc.items.push({
      id: "mock-h-" + hex24("mock-housing", city, String(i)).slice(0, 18),
      city,
      district,
      businessArea: district + "商圈",
      community: city + pick(["锦绣", "春江", "云栖", "望京", "汇金", "麓山"], i) + "里",
      layout,
      area: String(area),
      rent: String(1800 + (i % 12) * 450),
      title: "整租·" + city + district + " " + layout + " " + area + "㎡",
      url: "",
      platform: "模拟数据",
      address: city + district + "示范路 " + (6 + i) + " 号",
    });
    hAdded++;
  }
}
housingDoc.generatedAt = TODAY;
writeFileSync(housingFile, JSON.stringify(housingDoc, null, 2) + "\n");

console.log("岗位：原有 " + before + "（含上次生成）→ 清理后 " + (jobsDoc.jobs.length - added) + " → 新增 " + added + " → 合计 " + jobsDoc.jobs.length);
console.log("租房：原有 " + housingBefore + "（含上次生成）→ 新增 " + hAdded + " → 合计 " + housingDoc.items.length);
