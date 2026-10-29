import fs from "node:fs";

const housingUrl = new URL("../data/housing-catalog.json", import.meta.url);
let housingCache = null;

export function loadPlatformHousing(city) {
  if (!housingCache) {
    try {
      housingCache = JSON.parse(fs.readFileSync(housingUrl, "utf8")).items || [];
    } catch {
      housingCache = [];
    }
  }
  if (!city) return housingCache;
  const c = String(city).replace(/市$/, "").trim();
  return housingCache.filter((h) => String(h.city || "").includes(c) || c.includes(String(h.city || "")));
}

const companiesUrl = new URL("../data/companies-catalog.json", import.meta.url);
let companiesCache = null;
export function loadCompanies() {
  if (!companiesCache) {
    try { companiesCache = JSON.parse(fs.readFileSync(companiesUrl, "utf8")).items || []; }
    catch { companiesCache = []; }
  }
  return companiesCache;
}
export function getCompany(id) {
  return loadCompanies().find((c) => c.id === id) || null;
}
