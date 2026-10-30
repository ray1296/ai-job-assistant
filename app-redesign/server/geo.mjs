import fs from "node:fs";
import { loadPlatformHousing } from "./data-catalog.mjs";
import path from "node:path";

const fail = (status, message) => Object.assign(new Error(message), { status });
const REST = "https://restapi.amap.com";
const TTL = 10 * 60 * 1000;
const MAX_CACHE = 600;

// 高德 REST 代理：key 只在服务端；带内存缓存，避免重复计费与 QPS 打爆。
export function createGeo(privateDir, deps) {
  let key = "";
  let jsKey = "";
  let jsSecurity = "";
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(privateDir, "geo-config.json"), "utf8"));
    key = String(cfg.amapKey || "");
    jsKey = String(cfg.amapJsKey || "");
    jsSecurity = String(cfg.amapJsSecurity || "");
  } catch {
    key = String(process.env.AMAP_KEY || "");
  }
  const cache = new Map();
  // 地址→坐标持久化缓存（sqlite），跨进程复用；高德有 QPS/日调用限制
  const db = deps.db;
  if (db) db.exec("CREATE TABLE IF NOT EXISTS geo_cache(address TEXT PRIMARY KEY, lng REAL, lat REAL, formatted TEXT, updated_at INTEGER)");
  const cacheGet = (addr, city) => {
    if (!db) return null;
    try {
      const row = db.prepare("SELECT lng,lat,formatted,updated_at FROM geo_cache WHERE address=?").get((city || "") + "|" + addr);
      if (!row) return null;
      if (Date.now() - row.updated_at > 30 * 24 * 3600 * 1000) return null;
      return { lng: row.lng, lat: row.lat, address: row.formatted, level: "" };
    } catch { return null; }
  };
  const cachePut = (addr, city, hit) => {
    if (!db || !hit) return;
    try {
      db.prepare("INSERT INTO geo_cache(address,lng,lat,formatted,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(address) DO UPDATE SET lng=excluded.lng,lat=excluded.lat,formatted=excluded.formatted,updated_at=excluded.updated_at")
        .run((city || "") + "|" + addr, hit.lng, hit.lat, hit.address || "", Date.now());
    } catch {}
  };

  function cached(name, params, ttl = TTL) {
    const k = name + "|" + JSON.stringify(params);
    const hit = cache.get(k);
    if (hit && hit.until > Date.now()) return hit.value;
    return null;
  }
  function remember(name, params, value) {
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(name + "|" + JSON.stringify(params), { value, until: Date.now() + TTL });
    return value;
  }

  async function get(name, params, signal) {
    if (!key) throw fail(503, "未配置高德地图 key");
    const hit = cached(name, params);
    if (hit) return hit;
    const url = new URL(REST + "/v3/" + name);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    url.searchParams.set("key", key);
    const r = await fetch(url, { signal });
    if (!r.ok) throw fail(502, "高德服务暂时不可用（" + r.status + "）");
    const data = await r.json();
    if (data.status !== "1") {
      const info = String(data.info || "");
      if (/SERVICE_NOT_AVAILABLE/.test(info + data.infocode))
        throw fail(501, "当前高德 key 未开通这项服务（例如骑行规划），请改用步行或驾车");
      if (/INVALID_USER_KEY|USERKEY_PLAT_NOMATCH/.test(info + data.infocode))
        throw fail(503, "高德 key 不可用：" + info);
      throw fail(502, "高德返回错误：" + (info || data.infocode || "未知"));
    }
    return remember(name, params, data);
  }

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  async function geocode(address, city, signal) {
    const text = String(address || "").trim();
    if (!text) return null;
    const cachedHit = cacheGet(text, city);
    if (cachedHit) return cachedHit;
    const data = await get("geocode/geo", { address: text.slice(0, 200), city: city || "" }, signal);
    const g = data.geocodes?.[0];
    if (!g?.location) return null;
    const [lng, lat] = String(g.location).split(",").map(num);
    const hit = { lng, lat, address: g.formatted_address || text, level: g.level || "" };
    cachePut(text, city, hit);
    return hit;
  }

  async function around(lng, lat, radius, types, signal) {
    const data = await get("place/around", {
      location: lng + "," + lat,
      radius: Math.min(Math.max(Number(radius) || 2000, 200), 50000),
      types,
      offset: 25,
      page: 1,
      extensions: "all",
      sortrule: "distance",
    }, signal);
    return (data.pois || []).map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address === [] ? "" : p.address || "",
      lng: num(String(p.location || "").split(",")[0]),
      lat: num(String(p.location || "").split(",")[1]),
      tel: Array.isArray(p.tel) ? "" : String(p.tel || ""),
      type: String(p.type || "").split(";").pop() || "",
      distance: num(p.distance),
    })).filter((x) => x.lng && x.lat);
  }

  async function subway(city, signal) {
    const data = await get("place/text", {
      keywords: "地铁站",
      types: "150500",
      city: city || "全国",
      offset: 25,
      page: 1,
      extensions: "base",
    }, signal, 30 * 60 * 1000);
    return (data.pois || []).map((p) => ({
      id: p.id,
      name: p.name,
      address: Array.isArray(p.address) ? "" : p.address || "",
      lng: num(String(p.location || "").split(",")[0]),
      lat: num(String(p.location || "").split(",")[1]),
    })).filter((x) => x.lng && x.lat);
  }

  const ROUTE = {
    drive: { path: "direction/driving", pick: (d) => d.route?.paths?.[0] },
    walk: { path: "direction/walking", pick: (d) => d.route?.paths?.[0] },
    transit: { path: "direction/transit/integrated", pick: (d) => d.route?.transits?.[0] },
    bicycle: { path: "direction/bicycling", pick: (d) => d.route?.paths?.[0] },
  };

  async function route(mode, origin, destination, city, signal) {
    const spec = ROUTE[mode] || ROUTE.drive;
    const params = {
      origin: origin.lng + "," + origin.lat,
      destination: destination.lng + "," + destination.lat,
      city: city || "",
      strategy: mode === "transit" ? 0 : 0,
      extensions: "all",
    };
    const data = await get(spec.path, params, signal);
    let p = spec.pick(data);
    // 短距离常常没有公交班次，退回步行方案而不是直接报错。
    if (!p && mode === "transit") {
      const walk = await get("direction/walking", {
        origin: params.origin,
        destination: params.destination,
        extensions: "all",
      }, signal).catch(() => null);
      const wp = walk?.route?.paths?.[0];
      if (wp) {
        return {
          mode: "walk",
          distance: num(wp.distance),
          duration: num(wp.duration),
          cost: 0,
          polyline: (wp.steps || []).flatMap((st) => parseLine(st.polyline)),
          summary: "距离较近，公共交通无班次，已给出步行方案",
        };
      }
    }
    if (!p) throw fail(502, "没有规划出可用路线，换个方式或换对起终点试试");
    let polyline = [];
    if (mode === "transit") {
      for (const seg of p.segments || []) {
        if (seg.walking?.steps) for (const st of seg.walking.steps) polyline.push(...parseLine(st.polyline));
        if (seg.bus?.buslines?.[0]?.polyline) polyline.push(...parseLine(seg.bus.buslines[0].polyline));
      }
    } else {
      for (const st of p.steps || []) polyline.push(...parseLine(st.polyline));
    }
    return {
      mode,
      distance: num(p.distance),
      duration: num(p.duration),
      cost: mode === "transit" ? num(p.cost) : num(data.route?.taxi_cost),
      polyline,
      summary:
        mode === "transit"
          ? (p.segments || []).map((s) => s.bus?.buslines?.[0]?.name || (s.walking ? "步行" : "")).filter(Boolean).join(" → ")
          : mode === "walk" ? "步行路线" : mode === "bicycle" ? "骑行路线" : "驾车路线",
    };
  }

  function parseLine(text) {
    return String(text || "")
      .split(";")
      .map((pair) => pair.split(",").map(num))
      .filter((p) => p.length === 2 && p[0] && p[1])
      .map(([lng, lat]) => [lng, lat]);
  }

// 城市中心坐标：地址地理编码失败时（例如演示用模拟数据、只有城市没有门牌）把点落在城市中心附近，
// 避免地图上完全看不到这一条数据。
const CITY_CENTER = {
  北京: [116.407, 39.905], 上海: [121.474, 31.230], 广州: [113.264, 23.129], 深圳: [114.057, 22.543],
  杭州: [120.155, 30.274], 成都: [104.066, 30.572], 南京: [118.796, 32.060], 武汉: [114.305, 30.593],
  西安: [108.940, 34.341], 苏州: [120.585, 31.299], 天津: [117.190, 39.126], 重庆: [106.551, 29.563],
  长沙: [112.938, 28.228], 郑州: [113.625, 34.746], 合肥: [117.283, 31.861], 厦门: [118.089, 24.479],
  福州: [119.306, 26.075], 济南: [117.000, 36.675], 青岛: [120.382, 36.067], 宁波: [121.550, 29.874],
  无锡: [120.312, 31.491], 东莞: [113.751, 23.020], 佛山: [113.121, 23.021], 珠海: [113.552, 22.271],
  昆明: [102.712, 25.040], 南昌: [115.892, 28.676], 贵阳: [106.713, 26.578], 太原: [112.549, 37.857],
  石家庄: [114.502, 38.045], 沈阳: [123.429, 41.796], 大连: [121.618, 38.914], 长春: [125.324, 43.886],
  哈尔滨: [126.642, 45.756], 南宁: [108.320, 22.824], 海口: [110.331, 20.031], 兰州: [103.823, 36.058],
  乌鲁木齐: [87.617, 43.792], 呼和浩特: [111.670, 40.818], 银川: [106.278, 38.466], 西宁: [101.778, 36.623],
};
function centerPos(city, seed) {
  const key = String(city || "").replace(/市$/, "").replace(/·.*$/, "").trim();
  const c = CITY_CENTER[key];
  if (!c) return null;
  // 用 seed 生成稳定的偏移，避免所有点叠在同一个坐标上
  let h = 0;
  const s = String(seed || key);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  // 偏移范围放宽到城市级别（约 ±0.12° 经度 / ±0.10° 纬度），避免模拟数据全叠在市中心
  // 均匀撒在城市半径内（圆盘分布），避免所有点挤在市中心一个角落
  const angle = ((h % 360) * Math.PI) / 180;
  const radius = Math.sqrt(((Math.floor(h / 360) % 1000) / 1000)) * 0.085;
  const dx = Math.cos(angle) * radius;
  const dy = Math.sin(angle) * radius * 0.8;
  return { lng: +(c[0] + dx).toFixed(6), lat: +(c[1] + dy).toFixed(6) };
}

  // 汇总该账号地图图层：投递意向岗位（没有则用平台岗位兜底）+ 租房数据（地址地理编码后缓存）
  async function layers(userId, city, signal, options = {}) {
    const jobs = [];
    const ids = deps.intentJobIds(userId);
    for (const id of ids.slice(0, 20)) {
      const job = deps.getJob(id);
      if (!job) continue;
      const address = job.address || [job.city, job.title].filter(Boolean).join(" ");
      // 模拟数据不做地理编码（地址是编的，编不出去还占 QPS），直接用城市中心 + 稳定偏移
      const synthetic = /模拟数据/.test(String(job.platform || ""));
      const pos = synthetic ? centerPos(job.city, job.id) : (await geocode(address, job.city, signal).catch(() => null)) || centerPos(job.city, job.id);
      if (!pos) continue;
      jobs.push({
        id: job.id,
        title: job.title,
        company: job.company,
        city: job.city,
        address: job.address || "",
        url: job.url || "",
        pos,
      });
    }
    // 重点城市：显式传入 > 投递意向所在城市 > 上海（地图默认视野）
    const focusCity = String(city || jobs.find((j) => j.city)?.city || "上海").replace(/市$/, "").trim() || "上海";
    // 「全部岗位」图层：全国每个城市都取几条平台岗位，把中国地图铺满。
    // 这是一条独立的图层，和「意向岗位」互不影响（不再改动 jobs）。
    const platformJobs = [];
    if (typeof deps.platformJobsAll === "function") {
      const perCity = 5;
      const cap = 240;
      const byCityMap = new Map();
      for (const job of deps.platformJobsAll()) {
        if (platformJobs.length >= cap) break;
        const c = String(job.city || "").trim();
        if (!c) continue;
        const arr = byCityMap.get(c) || [];
        if (arr.length >= perCity) continue;
        const pos = centerPos(c, job.id);
        if (!pos) continue;
        arr.push({
          id: job.id,
          title: job.title,
          company: job.company,
          city: c,
          address: job.address || "",
          url: job.url || "",
          platform: true,
          pos,
        });
        byCityMap.set(c, arr);
        platformJobs.push(arr[arr.length - 1]);
      }
    }
    const housing = [];
    // 平台内置租房（所有账号可见）：只取当前城市附近的前 N 条，避免一次地理编码上百条
    // 按城市抽样，保证不同城市都能看到一些平台房源（否则前 40 条全是北京）
    // 租房图层同样铺到全国：重点城市铺满，其它城市各留几条，保证缩到全国视角也有房源
    const byCity = new Map();
    for (const h of loadPlatformHousing("")) {
      if (!h.rent || !Number(h.rent)) continue;
      const arr = byCity.get(h.city) || [];
      if (arr.length < (String(h.city).includes(focusCity) ? 80 : 3)) arr.push(h);
      byCity.set(h.city, arr);
    }
    const platform = [...byCity.values()].flat().slice(0, 320);
    for (const h of platform) {
      const hSynthetic = /模拟数据/.test(String(h.platform || ""));
      const pos = hSynthetic ? centerPos(h.city, h.id) : (await geocode(h.address, h.city, signal).catch(() => null)) || centerPos(h.city, h.id);
      if (!pos) continue;
      housing.push({
        id: h.id,
        datasetId: "platform",
        source: "platform",
        title: h.title || h.community,
        address: h.address,
        rent: h.rent,
        layout: h.layout,
        phone: "",
        url: h.url || "",
        pos,
      });
    }
    for (const set of deps.housingSets(userId)) {
      const addressCol = set.mapping?.address;
      for (const row of set.rows.slice(0, 40)) {
        const address = addressCol ? row[addressCol] : Object.values(row).find((v) => /路|街|号|小区|区/.test(String(v)));
        if (!address) continue;
        const pos = await geocode(address, city, signal).catch(() => null);
        housing.push({
          id: set.datasetId + "-" + housing.length,
          datasetId: set.datasetId,
          title: (set.mapping?.title && row[set.mapping.title]) || address,
          address,
          rent: (set.mapping?.rent && row[set.mapping.rent]) || "",
          layout: (set.mapping?.layout && row[set.mapping.layout]) || "",
          phone: (set.mapping?.phone && row[set.mapping.phone]) || "",
          pos,
        });
      }
    }
    return {
      jobs,
      platformJobs,
      housing,
      platformJobTotal: platformJobs.length,
      geocoded: jobs.filter((j) => j.pos).length + housing.filter((h) => h.pos).length,
    };
  }

  // POI 详情：列表接口有时不给电话，详情接口更全
  async function poiDetail(id, signal) {
    const data = await get("place/detail", { id: String(id).slice(0, 40), extensions: "all" }, signal);
    const p = (data.pois || [])[0];
    if (!p) throw fail(404, "地点不存在或已下线");
    return {
      id: p.id,
      name: p.name,
      address: Array.isArray(p.address) ? "" : String(p.address || ""),
      tel: Array.isArray(p.tel) ? "" : String(p.tel || ""),
      type: String(p.type || "").split(";").pop() || "",
      lng: Number(String(p.location || "").split(",")[0]),
      lat: Number(String(p.location || "").split(",")[1]),
    };
  }

  // 地铁线路：高德地铁图的数据接口，按城市 adcode 取线路与站点
  const CITY_SUBWAY = {
    上海: { code: "3100", py: "shanghai" }, 北京: { code: "1100", py: "beijing" },
    深圳: { code: "4403", py: "shenzhen" }, 广州: { code: "4401", py: "guangzhou" },
    杭州: { code: "3301", py: "hangzhou" }, 成都: { code: "5101", py: "chengdu" },
    重庆: { code: "5000", py: "chongqing" }, 南京: { code: "3201", py: "nanjing" },
    武汉: { code: "4201", py: "wuhan" }, 西安: { code: "6101", py: "xian" },
    天津: { code: "1200", py: "tianjin" }, 苏州: { code: "3205", py: "suzhou" },
    合肥: { code: "3401", py: "hefei" }, 长沙: { code: "4301", py: "changsha" },
    郑州: { code: "4101", py: "zhengzhou" }, 青岛: { code: "3702", py: "qingdao" },
    大连: { code: "2102", py: "dalian" }, 昆明: { code: "5301", py: "kunming" },
    南昌: { code: "3601", py: "nanchang" }, 厦门: { code: "3502", py: "xiamen" },
    沈阳: { code: "2101", py: "shenyang" }, 长春: { code: "2201", py: "changchun" },
    哈尔滨: { code: "2301", py: "haerbin" }, 济南: { code: "3701", py: "jinan" },
    无锡: { code: "3202", py: "wuxi" }, 福州: { code: "3501", py: "fuzhou" },
  };
  const subwayLineCache = new Map();
  async function subwayLines(city, signal) {
    const key2 = String(city || "").replace(/市$/, "").trim();
    const spec = CITY_SUBWAY[key2];
    if (!spec) throw fail(404, "暂不支持该城市的地铁线路（已支持上海/北京/深圳/广州/杭州/成都/重庆/南京/武汉/西安等）");
    const hit = subwayLineCache.get(key2);
    if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.data;
    const url = "https://map.amap.com/service/subway?srhdata=" + spec.code + "_drw_" + spec.py + ".json";
    const r = await fetch(url, {
      signal,
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://map.amap.com/subway/" },
    });
    if (!r.ok) throw fail(502, "地铁线路数据获取失败");
    const j = await r.json();
    const lines = (j.l || []).map((l) => ({
      name: String(l.kn || l.ln || "地铁线"),
      color: /^#?[0-9a-fA-F]{6}$/.test(String(l.cl || "")) ? "#" + String(l.cl).replace("#", "") : "#2f9e8f",
      path: (l.st || []).map((st) => String(st.sl || "").split(",").map(Number)).filter((p) => p.length === 2 && p[0] && p[1]),
      stations: (l.st || []).map((st) => ({ name: String(st.n || ""), pos: String(st.sl || "").split(",").map(Number) }))
        .filter((s) => s.pos.length === 2 && s.pos[0] && s.pos[1]),
    })).filter((l) => l.path.length > 1);
    const data = { city: key2, lines };
    subwayLineCache.set(key2, { at: Date.now(), data });
    return data;
  }

  return {
    configured: !!key,
    geocode, around, subway, route, layers,
    subwayLines,
    poiDetail,
    hasKey: !!key,
    key: () => key,
    js: () => ({ key: jsKey, security: jsSecurity, ready: !!jsKey }),
  };
}
