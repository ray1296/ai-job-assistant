import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
const base = path.dirname(fileURLToPath(import.meta.url));
const MAX = 5 * 1024 * 1024,
  TTL = 15 * 60 * 1000,
  MAX_LOAD = Number(process.env.CAREER_MAX_LOAD || 1.8);
const fail = (status, message) => Object.assign(new Error(message), { status });
export function workerArgs(folder, input, kind) {
  return [
    "--as=536870912",
    "--cpu=65",
    "--fsize=33554432",
    "--nofile=64",
    "--",
    "/usr/bin/nice",
    "-n",
    "10",
    "/usr/bin/bwrap",
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/lib",
    "/lib",
    "--ro-bind",
    "/lib64",
    "/lib64",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--ro-bind",
    path.join(base, "parse-resume.py"),
    "/worker/parse-resume.py",
    "--ro-bind",
    path.join(base, "../.tools/ocr/root/usr"),
    "/.tools/ocr/root/usr",
    "--bind",
    folder,
    "/work",
    "--chdir",
    "/work",
    "/usr/bin/python3",
    "/worker/parse-resume.py",
    "/work/" + path.basename(input),
    kind,
  ];
}
export function createExtractionService(privateDir, recognize) {
  const jobs = new Map();
  let active = null;
  let activePromise = null;
  let sweepTimer;
  const root = path.join(privateDir, "extraction-tmp");
  const ready = fs
    .mkdir(root, { recursive: true, mode: 0o700 })
    .then(async () => {
      await fs.chmod(root, 0o700);
      for (const f of await fs.readdir(root)) {
        await fs.rm(path.join(root, f), { recursive: true, force: true });
      }
    });
  ready.catch(() => {});
  function sweep() {
    const now = Date.now();
    for (const [id, j] of jobs) {
      if (now - j.created > TTL) {
        if (j === active) cancel(j);
        jobs.delete(id);
      }
    }
  }
  function stopChild(child) {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
  }
  function cancel(j) {
    j.cancelled = true;
    j.controller?.abort();
    stopChild(j.child);
    j.state = "cancelled";
  }
  sweepTimer = setInterval(sweep, 60000);
  sweepTimer.unref();
  const publicJob = (j) => ({
    id: j.id,
    name: j.name,
    state: j.state,
    created: j.created,
    ...(j.result ? { result: j.result } : {}),
    ...(j.error ? { error: j.error } : {}),
  });
  async function run(j, folder, input, kind) {
    let timeout;
    try {
      if (j.cancelled) return;
      j.state = "processing";
      const args = workerArgs(folder, input, kind);
      if (j.ai) args.push("vision");
      const child = spawn("/usr/bin/prlimit", args, {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: "/usr/bin:/bin",
          LANG: "C.UTF-8",
          OMP_THREAD_LIMIT: "1",
          OMP_NUM_THREADS: "1",
          OPENBLAS_NUM_THREADS: "1",
        },
      });
      j.child = child;
      let output = "",
        overflow = false;
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (b) => {
        if (
          Buffer.byteLength(output) + Buffer.byteLength(b) >
          (j.ai ? 36 * 1024 * 1024 : 600000)
        ) {
          overflow = true;
          stopChild(child);
        } else output += b.toString();
      });
      child.stderr.resume();
      timeout = setTimeout(
        () => {
          j.timedOut = true;
          j.controller?.abort();
          stopChild(child);
        },
        j.ai ? 120000 : 75000,
      );
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      if (j.cancelled) return;
      if (j.timedOut) throw Error("识别超时已终止，请缩小或减少页面后重试");
      if (overflow) throw Error("提取结果过大，请精简文件");
      let result;
      try {
        result = JSON.parse(output);
      } catch {
        throw Error("识别进程无法完成，请精简文件后重试");
      }
      if (code !== 0 || result.error)
        throw Error(result.error || "文件解析失败");
      if (j.ai) {
        if (!recognize) throw Error("AI识别未配置");
        j.controller = new AbortController();
        let draft;
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            draft = await recognize(
              j.owner,
              {
                text: result.text,
                images: result.images || [],
                photos: result.photos || [],
                pages: result.pages,
                filename: j.name,
              },
              j.controller.signal,
            );
            break;
          } catch (e) {
            lastError = e;
            // 视觉模型偶发返回空原文/截断结构。只在第一次失败时自动重试一次，
            // 不重试限流、取消、配额或明确的上游不可用。
            const retryable = e?.status === 502 && /原文|未返回|未采用/.test(String(e.message || ""));
            if (attempt === 0 && retryable && !j.cancelled) {
              await new Promise((r) => setTimeout(r, 700));
              continue;
            }
            throw e;
          }
        }
        if (!draft) throw lastError || Error("AI识别失败，请稍后重试");
        if (j.cancelled) return;
        result = {
          text: draft.sourceText,
          pages: result.pages,
          method: draft.method,
          warnings: draft.warnings,
          draftId: draft.id,
          draftRevision: draft.revision,
          photoCandidates: draft.photoCandidates || [],
          ai: {
            extras: draft.extras || [],
            profile: draft.profile,
            evidence: draft.evidence,
            provider: draft.provider,
            model: draft.model,
            mode: draft.mode,
            metrics: draft.metrics,
            provenance: draft.provenance,
          },
        };
      }
      j.result = result;
      j.state = "ready";
    } catch (e) {
      if (!j.cancelled) {
        j.state = "failed";
        j.error = e.message || "解析暂不可用";
      }
    } finally {
      clearTimeout(timeout);
      j.child = null;
      await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
      if (active === j) active = null;
    }
  }
  async function create(req, userId, ai = true) {
    // Legacy callers cannot opt into a local fallback.
    ai = true;
    sweep();
    if (active)
      throw fail(
        429,
        "当前有简历正在识别，请稍后重试；其他账号与编辑功能不受影响",
      );
    if (jobs.size >= 24)
      throw fail(429, "临时识别结果已满，请先清除旧结果或15分钟后重试");
    if ([...jobs.values()].filter((j) => j.owner === userId).length >= 4)
      throw fail(429, "你的临时识别结果已满，请先清除结果再上传");
    let available = os.freemem();
    try {
      const m = readFileSync("/proc/meminfo", "utf8").match(
        /^MemAvailable:\s+(\d+)/m,
      );
      if (m) available = Number(m[1]) * 1024;
    } catch {}
    if (available < 1024 * 1024 * 1024 || os.loadavg()[0] > MAX_LOAD)
      throw fail(503, "服务器正在保留资源余量，请稍后再识别");
    const length = Number(req.headers["content-length"]);
    if (!Number.isFinite(length) || length <= 0 || length > MAX)
      throw fail(413, "文件须为1字节至5MiB");
    const mime = req.headers["content-type"];
    if (
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
      ].includes(mime)
    )
      throw fail(415, "仅支持PDF、DOCX、PNG和JPEG，不接受含宏文件");
    const j = {
      id: randomUUID(),
      owner: userId,
      name: "上传的简历",
      state: "receiving",
      created: Date.now(),
      cancelled: false,
      ai,
    };
    try {
      j.name = decodeURIComponent(
        String(req.headers["x-file-name"] || "上传的简历"),
      )
        .replace(/[\x00-\x1f\x7f/\\]/g, "_")
        .slice(0, 120);
    } catch {}
    active = j;
    jobs.set(j.id, j);
    let folder;
    try {
      await ready;
      const disk = await fs.statfs(root);
      if (Number(disk.bavail) * Number(disk.bsize) < 1024 * 1024 * 1024)
        throw fail(503, "私有存储正在保留磁盘余量，请稍后重试");
      folder = await fs.mkdtemp(path.join(root, "resume-"));
      await fs.chmod(folder, 0o700);
      const chunks = [];
      let size = 0;
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        req.destroy();
      }, 15000);
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX) throw fail(413, "文件超过5MiB");
          chunks.push(chunk);
        }
      } finally {
        clearTimeout(timer);
      }
      if (expired || size !== length)
        throw fail(400, "文件上传不完整，请重新选择");
      const data = Buffer.concat(chunks);
      let kind;
      if (data.subarray(0, 5).toString() === "%PDF-") kind = "pdf";
      else if (data.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])))
        kind = "docx";
      else if (
        data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        kind = "png";
      else if (data[0] === 255 && data[1] === 216 && data[2] === 255)
        kind = "jpeg";
      else throw fail(415, "文件内容与支持格式不符，不能只更改后缀名");
      const expected = {
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        png: "image/png",
        jpeg: "image/jpeg",
      };
      if (mime !== expected[kind]) throw fail(415, "文件类型与内容不一致");
      const input = path.join(folder, "input." + kind);
      await fs.writeFile(input, data, { mode: 0o600 });
      activePromise = run(j, folder, input, kind);
      activePromise.finally(() => {
        if (active === null) activePromise = null;
      });
      return publicJob(j);
    } catch (e) {
      if (folder)
        await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
      jobs.delete(j.id);
      if (active === j) active = null;
      throw e;
    }
  }
  return {
    create,
    status() {
      return {
        active: !!active,
        maxActive: 1,
        maxBytes: MAX,
        maxPages: 4,
        ttlSeconds: TTL / 1000,
      };
    },
    get(id, owner) {
      sweep();
      const j = jobs.get(id);
      if (!j || j.owner !== owner) throw fail(404, "识别结果不存在或已过期");
      return publicJob(j);
    },
    delete(id, owner) {
      const j = jobs.get(id);
      if (!j || j.owner !== owner) throw fail(404, "识别结果不存在或已过期");
      cancel(j);
      jobs.delete(id);
    },
    async close() {
      clearInterval(sweepTimer);
      if (active) cancel(active);
      if (activePromise) await activePromise;
    },
    limits: {
      maxBytes: MAX,
      maxPages: 4,
      maxActive: 1,
      ttlSeconds: TTL / 1000,
    },
  };
}
