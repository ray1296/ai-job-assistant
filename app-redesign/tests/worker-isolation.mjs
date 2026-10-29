import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";
import {
  workerArgs,
  createExtractionService,
} from "../server/resume-extraction.mjs";
const folder = await fs.mkdtemp(
  path.join(os.tmpdir(), "zhuguang-sandbox-probe-"),
);
await fs.writeFile(path.join(folder, "probe"), "owned");
async function exec(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("/usr/bin/prlimit", args, {
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
    });
    let out = "",
      err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}
try {
  const args = workerArgs(folder, path.join(folder, "probe"), "png");
  const result = await exec([
    ...args.slice(0, -3),
    "-c",
    'import os,socket; assert os.path.isfile("/work/probe"); assert not os.path.exists("/home/ubuntu/workspaces/competition/app/private"); assert not os.path.exists("/home/ubuntu/linux/dsh-home"); s=socket.socket(); s.settimeout(1); assert s.connect_ex(("1.1.1.1",53))!=0; print("private DB and DSH invisible; outbound network blocked")',
  ]);
  assert.equal(result.code, 0, result.err);
  console.log("PASS", result.out.trim());
  const svc = createExtractionService(folder);
  const data = await fs.readFile("artifacts/intake-fixtures/resume.png");
  const req = Readable.from([data]);
  req.headers = {
    "content-length": String(data.length),
    "content-type": "image/png",
  };
  await svc.create(req, "probe-owner");
  await svc.close();
  assert.equal(
    (await fs.readdir(path.join(folder, "extraction-tmp"))).length,
    0,
  );
  console.log(
    "PASS close awaits active OCR termination and source-file cleanup",
  );
} finally {
  await fs.rm(folder, { recursive: true, force: true });
}
