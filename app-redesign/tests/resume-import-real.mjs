// Explicit opt-in: only a synthetic resume is ever sent by this test.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createResumeImports } from "../server/resume-import.mjs";
import { profileData } from "../server/profile-data.mjs";
import { chromium } from "playwright-core";
if (process.env.ALLOW_PAID_SYNTHETIC_AI !== "true")
  throw Error(
    "Set ALLOW_PAID_SYNTHETIC_AI=true for authorized real synthetic model test",
  );
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
let image;
try {
  const p = await browser.newPage({ viewport: { width: 850, height: 850 } });
  await p.setContent(
    '<body style="font:26px Arial;padding:35px"><h1>Lin Example</h1><p>Email: lin@example.invalid</p><h2>Education</h2><p>Example University</p><p>Computer Science | 2022-2026</p><h2>Project</h2><p>Inventory Tracker</p><p>2025</p><p>Built a Vue and Node.js inventory app. Added 12 automated tests.</p><h2>Skills</h2><p>Vue, TypeScript, Node.js, SQLite</p></body>',
  );
  image = await p.screenshot();
} finally {
  await browser.close();
}
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-ai-real-"));
await fs.copyFile(
  process.env.AI_CONFIG_PATH ||
    new URL("../private/ai-config.json", import.meta.url),
  path.join(dir, "ai-config.json"),
);
await fs.chmod(path.join(dir, "ai-config.json"), 0o600);
const db = new DatabaseSync(path.join(dir, "synthetic.sqlite"));
db.exec(
  "PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('synthetic-only')",
);
const service = createResumeImports(db, dir, profileData);
try {
  const d = await service.recognize("synthetic-only", {
    images: [{ mime: "image/png", data: image.toString("base64") }],
    filename: "synthetic-resume.png",
  });
  assert.equal(d.profile.name, "Lin Example");
  assert.equal(d.profile.email, "lin@example.invalid");
  assert.ok(JSON.stringify(d.profile).includes("Inventory Tracker"));
  assert.ok(d.evidence.length >= 6);
  assert.equal(d.mode, "vision");
  console.log(
    JSON.stringify({
      ok: true,
      mode: d.mode,
      name: d.profile.name,
      email: d.profile.email,
      projects: d.profile.projects,
      skills: d.profile.skills,
      evidenceCount: d.evidence.length,
      sections: d.document.sections.length,
      durable: service.get(d.id, "synthetic-only").id === d.id,
    }),
  );
} finally {
  service.close();
  db.close();
  await fs.rm(dir, { recursive: true, force: true });
}
