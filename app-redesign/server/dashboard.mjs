import { loadCatalog } from "./jobs-catalog.mjs";

// 与 bigdata_analysis/static/assets/js/huatu/map.js 的 geoCoordMap 保持一致
const PROVINCE_COORD = {
  北京市: [116.405285, 39.904989], 天津市: [117.190182, 39.125596], 河北省: [114.502461, 38.045474],
  山西省: [112.549248, 37.857014], 内蒙古自治区: [111.670801, 40.818311], 辽宁省: [123.429096, 41.796767],
  吉林省: [125.3245, 43.886841], 黑龙江省: [126.642464, 45.756967], 上海市: [121.472644, 31.231706],
  江苏省: [118.767413, 32.041544], 浙江省: [120.153576, 30.287459], 安徽省: [117.283042, 31.86119],
  福建省: [119.306239, 26.075302], 江西省: [115.892151, 28.676493], 山东省: [117.000923, 36.675807],
  河南省: [113.665412, 34.757975], 湖北省: [114.298572, 30.584355], 湖南省: [112.982279, 28.19409],
  广东省: [113.280637, 23.125178], 广西壮族自治区: [108.320004, 22.82402], 海南省: [110.33119, 20.031971],
  重庆市: [106.504962, 29.533155], 四川省: [104.065735, 30.659462], 贵州省: [106.713478, 26.578343],
  云南省: [102.712251, 25.040609], 西藏自治区: [91.132212, 29.660361], 陕西省: [108.948024, 34.263161],
  甘肃省: [103.823557, 36.058039], 青海省: [101.778916, 36.623178], 宁夏回族自治区: [106.278179, 38.46637],
  新疆维吾尔自治区: [87.617733, 43.792818], 香港特别行政区: [114.173355, 22.320048],
  澳门特别行政区: [113.54909, 22.198951], 台湾省: [121.509062, 25.044332],
};
const CITY_PROVINCE = {
  北京: "北京市", 上海: "上海市", 天津: "天津市", 重庆: "重庆市",
  深圳: "广东省", 广州: "广东省", 东莞: "广东省", 佛山: "广东省", 珠海: "广东省",
  杭州: "浙江省", 宁波: "浙江省", 温州: "浙江省",
  南京: "江苏省", 苏州: "江苏省", 无锡: "江苏省", 合肥: "安徽省",
  成都: "四川省", 武汉: "湖北省", 西安: "陕西省", 长沙: "湖南省",
  济南: "山东省", 青岛: "山东省", 厦门: "福建省", 福州: "福建省",
  郑州: "河南省", 大连: "辽宁省", 沈阳: "辽宁省", 长春: "吉林省",
  哈尔滨: "黑龙江省", 昆明: "云南省", 贵阳: "贵州省", 南昌: "江西省",
  太原: "山西省", 石家庄: "河北省", 兰州: "甘肃省", 乌鲁木齐: "新疆维吾尔自治区",
  呼和浩特: "内蒙古自治区", 南宁: "广西壮族自治区", 海口: "海南省",
  银川: "宁夏回族自治区", 西宁: "青海省", 拉萨: "西藏自治区",
};
const provinceOf = (city) => {
  const c = String(city || "").replace(/市$/, "").trim();
  if (!c) return "未标注";
  if (CITY_PROVINCE[c]) return CITY_PROVINCE[c];
  const hit = Object.keys(PROVINCE_COORD).find((p) => p.startsWith(c));
  return hit || "其他";
};

// 词云用的关键词表：命中 JD/标题/方向即计数（中文没有分词器，用词表更稳）
const KEYWORDS = ["Java","Python","Go","C++","JavaScript","TypeScript","Vue","React","前端","后端","全栈","算法","机器学习","深度学习","大模型","LLM","Agent","RAG","多模态","推荐","搜索","广告","电商","支付","风控","数据挖掘","数据分析","数据治理","SQL","数据库","MySQL","Redis","Kafka","Hadoop","Spark","Flink","ETL","数仓","云原生","K8s","Docker","微服务","分布式","高并发","中间件","Linux","运维","测试","自动化测试","接口测试","安全","网络","架构","性能优化","团队管理","项目管理","产品","运营","供应链","物流","财务","风控建模","NLP","CV","强化学习","推理","训练","AIGC"];
const normJd = (s) => String(s || "");
const STOP = new Set(["其他", "未标注"]);

const cleanEdu = (raw) => {
  const t = String(raw || "").trim();
  if (!t || /未(标注|明确)/.test(t)) return "未标注";
  if (/硕士|研究生/.test(t)) return "硕士";
  if (/本科/.test(t)) return "本科";
  if (/大专|专科/.test(t)) return "大专";
  if (/不限/.test(t)) return "不限";
  return "其他";
};

const SALARY_BUCKETS = [
  ["未公开", (k) => k === null],
  ["日薪/实习", (k) => k === 0],
  ["10K 以下", (k) => k > 0 && k < 10],
  ["10-20K", (k) => k >= 10 && k < 20],
  ["20-30K", (k) => k >= 20 && k < 30],
  ["30-50K", (k) => k >= 30 && k < 50],
  ["50K 以上", (k) => k >= 50],
];

// 统一换算成月薪中位数（K）：日薪/时薪/年薪/万 全部折算，无法解析的返回 null
const DAYS_PER_MONTH = 21.75;
const HOURS_PER_DAY = 8;
export function toMonthlyK(raw) {
  const text = String(raw || "").trim();
  if (!text || /未(公示|标注|明确)|面议/.test(text)) return null;
  // 日薪：100-150元/天
  const day = text.match(/(\d+(?:\.\d+)?)\s*(?:-|~|—|至)?\s*(\d+(?:\.\d+)?)?\s*元?\s*\/\s*(天|日)/);
  if (day) {
    const lo = Number(day[1]);
    const hi = day[2] ? Number(day[2]) : lo;
    return ((lo + hi) / 2) * DAYS_PER_MONTH / 1000;
  }
  // 时薪：30元/小时
  const hour = text.match(/(\d+(?:\.\d+)?)\s*(?:-|~|—|至)?\s*(\d+(?:\.\d+)?)?\s*元?\s*\/\s*(小时|时)/);
  if (hour) {
    const lo = Number(hour[1]);
    const hi = hour[2] ? Number(hour[2]) : lo;
    return ((lo + hi) / 2) * HOURS_PER_DAY * DAYS_PER_MONTH / 1000;
  }
  // "年薪40万"这类前缀写法，没有"万/年"结构，单独处理
  if (/年薪|年包/.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:-|~|—|至)?\s*(\d+(?:\.\d+)?)?\s*万/);
    if (m) {
      const lo = Number(m[1]);
      const hi = m[2] ? Number(m[2]) : lo;
      return ((lo + hi) / 2) * 10 / 12;
    }
  }
  // 年薪：30-40万/年、30万/年、40万每年
  const year = text.match(/(?:年薪|年包)?\s*(\d+(?:\.\d+)?)\s*(?:-|~|—|至)?\s*(\d+(?:\.\d+)?)?\s*万\s*(?:\/|每)?\s*年/);
  if (year && /年薪|年包|\/年|每年/.test(text)) {
    const lo = Number(year[1]);
    const hi = year[2] ? Number(year[2]) : lo;
    return ((lo + hi) / 2) * 10 / 12;
  }
  if (year) {
    const lo = Number(year[1]);
    const hi = year[2] ? Number(year[2]) : lo;
    return ((lo + hi) / 2) * 10 / 12;
  }
  // 月薪 K：10-15K / 10-15k·13薪
  const k = text.match(/(\d+(?:\.\d+)?)\s*(?:-|~|—|至)?\s*(\d+(?:\.\d+)?)?\s*[kK]/);
  if (k) {
    const lo = Number(k[1]);
    const hi = k[2] ? Number(k[2]) : lo;
    return (lo + hi) / 2;
  }
  // 月薪 万：1.5-2万
  const wan = text.match(/(\d+(?:\.\d+)?)\s*(?:-|~|—|至)?\s*(\d+(?:\.\d+)?)?\s*万/);
  if (wan) {
    const lo = Number(wan[1]);
    const hi = wan[2] ? Number(wan[2]) : lo;
    return ((lo + hi) / 2) * 10;
  }
  // 纯数字（元/月）
  const plain = text.match(/(\d{3,6})/);
  if (plain) return Number(plain[1]) / 1000;
  return null;
}
export const parseSalary = toMonthlyK;
export function createDashboard() {
  let normalized = null;
  function jobs() {
    if (normalized) return normalized;
    normalized = loadCatalog().map((j) => ({
      id: j.id,
      title: String(j.title || "").slice(0, 80),
      company: String(j.company || "").slice(0, 60),
      direction: String(j.direction || "").slice(0, 40),
      cities: Array.isArray(j.cities) && j.cities.length ? j.cities : [j.city || "未标注"],
      city: (Array.isArray(j.cities) && j.cities[0]) || j.city || "未标注",
      education: cleanEdu(j.education),
      salary: String(j.salary || "").slice(0, 40),
      salaryK: parseSalary(j.salary),
      recruit: String(j.recruitmentType || "").slice(0, 30),
      address: String(j.address || "").slice(0, 200),
      url: j.url || "",
      jd: normJd(j.jd).slice(0, 1200),
    }));
    return normalized;
  }
  function summary(city = "全国") {
    const all = jobs();
    const list = city === "全国" ? all : all.filter((j) => j.cities.includes(city));
    const count = (fn) => {
      const map = new Map();
      for (const item of list) {
        const key = fn(item);
        if (!key || STOP.has(key)) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
      return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };
    const salary = new Map(SALARY_BUCKETS.map(([name]) => [name, 0]));
    for (const item of list)
      for (const [name, test] of SALARY_BUCKETS)
        if (test(item.salaryK)) { salary.set(name, salary.get(name) + 1); break; }

    // 省份：岗位数 + 平均薪资（只统计公开薪资的）
    const byProvince = new Map();
    for (const item of list) {
      for (const c of item.cities) {
        const p = provinceOf(c);
        if (!PROVINCE_COORD[p]) continue;
        const cur = byProvince.get(p) || { jobs: 0, salarySum: 0, salaryN: 0 };
        cur.jobs += 1;
        if (item.salaryK && item.salaryK > 0) { cur.salarySum += item.salaryK; cur.salaryN += 1; }
        byProvince.set(p, cur);
      }
    }
    const provinces = Object.keys(PROVINCE_COORD).map((name) => {
      const v = byProvince.get(name) || { jobs: 0, salarySum: 0, salaryN: 0 };
      return {
        name,
        jobs: v.jobs,
        salaryJobs: v.salaryN,
        avgSalary: v.salaryN ? Math.round(v.salarySum / v.salaryN) : 0,
        coord: PROVINCE_COORD[name],
      };
    }).sort((a, b) => b.jobs - a.jobs);
    const topProvinces = provinces.slice(0, 5).reverse();

    // 各学历平均薪资
    const eduSalary = new Map();
    for (const item of list) {
      if (!item.salaryK || item.salaryK <= 0) continue;
      const cur = eduSalary.get(item.education) || { sum: 0, n: 0 };
      cur.sum += item.salaryK; cur.n += 1;
      eduSalary.set(item.education, cur);
    }
    const eduCount = new Map();
    for (const item of list) eduCount.set(item.education, (eduCount.get(item.education) || 0) + 1);
    const educationSalary = ["大专", "本科", "硕士", "不限", "未标注", "其他"]
      .filter((e) => eduCount.has(e) || eduSalary.has(e))
      .map((e) => ({
        name: e,
        jobs: eduCount.get(e) || 0,
        value: eduSalary.has(e) ? Math.round(eduSalary.get(e).sum / eduSalary.get(e).n) : null,
      }));

    // 词云：用 Node 内置 Intl.Segmenter 做中文分词，统计本账号可见数据（平台岗位 + 用户上传）
    const STOP = new Set(["的","了","和","与","及","或","在","对","把","被","为","是","有","无","不","等","中","上","下","个","我们","你们","他们","公司","岗位","职位","工作","经验","能力","要求","职责","负责","参与","熟悉","掌握","具备","相关","优先","以上","以及","能够","进行","支持","设计","开发","业务","团队","系统","平台","项目","产品","技术","方向","年限","学历","薪资","城市","地点","时间","情况","内容","部分","方面","问题","方法","流程","管理","服务","数据"]);
    const seg = new Intl.Segmenter("zh", { granularity: "word" });
    const wordMap = new Map();
    for (const item of list) {
      const text = item.jd || "";
      for (const part of seg.segment(text)) {
        if (!part.isWordLike) continue;
        const w = String(part.segment).trim();
        if (w.length < 2 || STOP.has(w)) continue;
        if (/^\d+$/.test(w)) continue;
        wordMap.set(w, (wordMap.get(w) || 0) + 1);
      }
    }
    const words = [...wordMap.entries()]
      .filter(([, v]) => v > 1)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 80);

    return {
      city,
      cities: count((j) => j.city).slice(0, 24),
      kpi: {
        jobs: list.length,
        companies: new Set(list.map((j) => j.company)).size,
        cities: new Set(list.flatMap((j) => j.cities)).size,
        withSalary: list.filter((j) => j.salaryK !== null).length,
        campus: list.filter((j) => /校/.test(j.recruit)).length,
        intern: list.filter((j) => /实习/.test(j.recruit)).length,
      },
      education: count((j) => j.education),
      direction: count((j) => j.direction).slice(0, 10),
      salary: [...salary.entries()].filter(([, v]) => v).map(([name, value]) => ({ name, value })),
      companies: count((j) => j.company).slice(0, 10),
      provinces,
      topProvinces,
      educationSalary,
      words,
      jobs: list.slice().sort((a, b) => (b.salaryK || 0) - (a.salaryK || 0)).slice(0, 12)
        .map(({ salaryK, cities, jd, ...rest }) => rest),
    };
  }
  return { summary, jobs, provinceCoord: PROVINCE_COORD };
}
