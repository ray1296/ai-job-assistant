import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadCatalog, listJobs, getJob, facets, cityArray, safeHttpUrl } from "../server/jobs-catalog.mjs";

const read = (name) => JSON.parse(fs.readFileSync(new URL("../data/" + name, import.meta.url), "utf8"));
const artifact = read("jobs-catalog.json");
const manifest = read("jobs-manifest.json");
const identities = read("jobs-identities.json").identities;
const jobs = loadCatalog();

test("107 original jobs retain compatible IDs, all raw fields and six direction counts", () => {
  assert.equal(jobs.length, 107);
  assert.equal(new Set(jobs.map(j => j.id)).size, 107);
  assert.equal(manifest.identitiesReused, 107);
  assert.deepEqual(manifest.directionCounts, {"Agent开发":26,"Java后端":16,"前端":13,"数据分析":15,"软件测试":24,"运维":13});
  for (const record of artifact.jobs) {
    const key = JSON.stringify(["公司", "来源平台", "岗位名称", "方向"].map(k => record.raw[k].trim()));
    assert.equal(record.id, identities[key]);
    assert.equal(Object.keys(record.raw).length, 21);
    assert.equal(getJob(record.id).title, record.raw["岗位名称"]);
  }
  assert.equal(getJob("absent"), null);
});

test("all 107 official/sourced links are safe; 99 relationships and 8 cell URLs are preserved", () => {
  assert.equal(jobs.filter(j => j.url).length, 107);
  assert.deepEqual(manifest.urlSourceCounts, {relationship:99,cell:8});
  assert.deepEqual(manifest.missingLinks, []);
  for (const record of artifact.jobs) {
    assert.equal(getJob(record.id).url, record.raw["职位链接"]);
    if (record.provenance.urlSource === "relationship") assert.equal(record.url, record.provenance.hyperlink.target);
    assert.equal(safeHttpUrl(record.url), record.url);
  }
});

test("salary raw values stay exact: 23 stated, 83 undisclosed and one unmarked", () => {
  assert.equal(manifest.missingSalary.length, 84);
  assert.equal(manifest.blankSalary.length, 0);
  assert.equal(jobs.filter(j => j.salary === "未公示（企业官网不公开）").length, 83);
  assert.equal(jobs.filter(j => j.salary === "未标注").length, 1);
  assert.equal(jobs.filter(j => /\d/.test(j.salary)).length, 23);
  assert.equal(jobs.find(j => j.salary === "未标注").title, "通用软件开发工程师");
  for (const record of artifact.jobs) assert.equal(getJob(record.id).salary, record.raw["薪资"]);
});

test("cities split individually before deduplication; every city filter works", () => {
  assert.deepEqual(cityArray("上海", "上海"), ["上海"]);
  assert.deepEqual(cityArray("深圳市（部门总部）", "深圳"), ["深圳"]);
  assert.deepEqual(cityArray("重庆·两江新区·空港新城", "重庆"), ["重庆"]);
  assert.equal(listJobs({city:"上海"}).total, 36);
  assert.ok(!facets().cities.includes("上海 上海"));
  assert.ok(!facets().cities.some(c => /[\s/、，,·（）]|市$|等$/.test(c)));
  for (const city of facets().cities) assert.equal(listJobs({city}).total, jobs.filter(j => j.cities.includes(city)).length);
});

test("pagination always returns finite positive bounded integers", () => {
  for (const value of [NaN, Infinity, -Infinity, "Infinity", "NaN", -2, 0, 1.5, "2.5", {}, [], true, ""]) {
    const result = listJobs({page:value,pageSize:value});
    assert.equal(result.page,1);
    assert.equal(result.pageSize,20);
  }
  const large = listJobs({page:1e100,pageSize:1e100});
  assert.equal(large.page,1000000);
  assert.equal(large.pageSize,50);
  assert.equal(large.jobs.length,0);
  assert.equal(listJobs({page:"2",pageSize:"10"}).jobs[0].id,jobs[10].id);
});

test("unsafe URLs cannot reach clickable runtime field", () => {
  for (const value of ["javascript:alert(1)","data:text/html,a","file:///etc/passwd","//example.com","https:///example.com","https://user:pass@example.com","https://example.com/a\nb","https://example.com/with space","https://example.com/\\evil","http://example.com:99999"]) assert.equal(safeHttpUrl(value), "",value);
  for (const value of ["https://example.com/jobs/1?q=a#x","http://example.com:8080/a"]) assert.equal(safeHttpUrl(value),value);
});
