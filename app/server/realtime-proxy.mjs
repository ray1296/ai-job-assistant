import { createHash } from "node:crypto";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MODEL = "qwen3.8-omni-flash-realtime";
const REALTIME_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=" + MODEL;
const VOICES = { yanzhou: "Tina", xingye: "Tina", zhiwei: "Serena", qichi: "Tina" };
const MAX_MESSAGE = 2 * 1024 * 1024;

function acceptKey(key) {
  return createHash("sha1").update(key + WS_GUID).digest("base64");
}
function frame(data, opcode = 1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  let header;
  if (payload.length < 126) header = Buffer.from([0x80 | opcode, payload.length]);
  else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}
function reject(socket, status, message) {
  try {
    socket.write("HTTP/1.1 " + status + " " + message + "\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  } catch {}
  try { socket.destroy(); } catch {}
}

export function attachRealtimeProxy(server, deps) {
  server.on("upgrade", (req, socket, head) => {
    try {
    if (req.url !== "/api/interview/realtime") return reject(socket, 404, "Not Found");
    const origin = req.headers.origin;
    if (origin) {
      try {
        const u = new URL(origin);
        if (u.host !== req.headers.host) return reject(socket, 403, "Forbidden");
      } catch { return reject(socket, 403, "Forbidden"); }
    }
    const key = req.headers["sec-websocket-key"];
    if (!key || req.headers.upgrade?.toLowerCase() !== "websocket") return reject(socket, 400, "Bad Request");
    // WebSocket 不能带自定义 header，靠同源 cookie 鉴权
    let s = null;
    try {
      s = deps.session(req);
    } catch (e) { console.error("[rt] session", String(e?.message || e)); }
    if (!s) return reject(socket, 401, "Unauthorized");
    try {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        "Sec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n",
      );
    } catch { return; }

    let buf = Buffer.alloc(0);
    let closed = false;
    let sticky = false;
    let started = false;
    let ali = null;
    let aliReady = false;

    const send = (obj) => {
      if (closed) return;
      try { socket.write(frame(JSON.stringify(obj), 1)); } catch {}
    };
    const close = (code = 1000, reason = "") => {
      if (closed) return;
      closed = true;
      try { socket.write(frame(Buffer.concat([Buffer.from([code >> 8, code & 255]), Buffer.from(reason)]), 8)); } catch {}
      try { socket.destroy(); } catch {}
      try { ali?.close(); } catch {}
      ali = null;
    };
    const sendAli = (obj) => {
      if (!ali || ali.readyState !== WebSocket.OPEN) return false;
      try { ali.send(JSON.stringify(obj)); return true; } catch { return false; }
    };

    function onClientMessage(opcode, payload) {
      if (opcode === 8) return close(1000);
      if (opcode === 9) { try { socket.write(frame(payload, 10)); } catch {} return; }
      if (opcode === 10) return;
      if (opcode === 2) {
        if (!aliReady || !started) return;
        const b64 = payload.toString("base64");
        sendAli({ type: "input_audio_buffer.append", audio: b64 });
        return;
      }
      if (opcode !== 1) return;
      let msg = null;
      try { msg = JSON.parse(payload.toString("utf8")); } catch { return; }
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "stop") return close(1000);
      if (msg.type === "clear") { sendAli({ type: "input_audio_buffer.clear" }); return; }
      if (msg.type === "text" && typeof msg.text === "string" && msg.text.trim()) {
        // 实时模式也允许打字；用户文字会作为一条 user 消息
        if (!aliReady) return;
        sendAli({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: msg.text.slice(0, 800) }] } });
        sendAli({ type: "response.create" });
        return;
      }
      if (msg.type !== "start" || started) return;
      started = true;
      void (async () => {
        try {
          const job = msg.jobId ? deps.getJob(String(msg.jobId)) : null;
          if (msg.jobId && !job) throw new Error("岗位不存在");
          const mode = msg.mode === "candidate" ? "candidate" : "interviewer";
          const style = String(msg.style || "综合").slice(0, 20);
          const difficulty = deps.normalizeDifficulty(msg.difficulty);
          let agentId = String(msg.agentId || "yanzhou");
          if (!deps.AGENT_NAME_BY_ID[agentId]) agentId = "yanzhou";
          const resume = deps.resumeById?.(s.user_id, msg.resumeId) || deps.latestResume(s.user_id);
          if (mode === "candidate" && !resume) throw new Error("请先在简历工作室创建一份简历");
          const cfg = await deps.aiGateway.realtimeConfig();
          if (!cfg?.key) throw new Error("服务端没有可用的实时模型密钥");
          const system = deps.interviewSystem(
            agentId, mode, style, deps.jobBrief(job),
            resume ? deps.documentText(resume.document) : "", true, difficulty,
          ) + "\n这是实时语音面试：用户可能随时打断你；被打断就立刻停下听用户说。回答口语化，不要 markdown，不要念出括号里的动作。";
          ali = new WebSocket(REALTIME_URL, { headers: { Authorization: "Bearer " + cfg.key } });
          ali.onopen = () => {
            sendAli({
              type: "session.update",
              session: {
                modalities: ["text", "audio"],
                voice: VOICES[agentId] || "Tina",
                instructions: system,
                input_audio_format: "pcm16",
                output_audio_format: "pcm24",
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 800,
                  create_response: true,
                  interrupt_response: true,
                },
              },
            });
          };
          ali.onmessage = (ev) => {
            let d = null;
            try { d = JSON.parse(String(ev.data)); } catch { return; }
            if (!d || !d.type) return;
            const t = d.type;
            if (t === "session.updated") {
              aliReady = true;
              send({ type: "ready" });
              setTimeout(() => {
                if (!aliReady) return;
                sendAli({
                  type: "response.create",
                  response: {
                    instructions: mode === "candidate"
                      ? "请以求职者身份做 1 分钟自我介绍。"
                      : "开始面试：先简短问候，并请用户做 1 分钟自我介绍。",
                  },
                });
              }, 120);
              return;
            }
            if (t === "response.audio.delta") return send({ type: "audio", data: d.delta || "" });
            if (t === "response.audio_transcript.delta") return send({ type: "ai_delta", text: d.delta || "" });
            if (t === "response.audio_transcript.done") return send({ type: "ai_done", text: d.transcript || "" });
            if (t === "conversation.item.input_audio_transcription.completed") return send({ type: "user_text", text: d.transcript || "" });
            if (t === "input_audio_buffer.speech_started") return send({ type: "speech_started" });
            if (t === "input_audio_buffer.speech_stopped") return send({ type: "speech_stopped" });
            if (t === "response.done") return send({ type: "response_done" });
            if (t === "error") {
              send({ type: "error", message: String(d.error?.message || "实时模型出错").slice(0, 300) });
              return;
            }
          };
          ali.onerror = () => send({ type: "error", message: "实时模型连接失败" });
          ali.onclose = () => { aliReady = false; if (!closed) send({ type: "closed" }); };
        } catch (e) {
          send({ type: "error", message: String(e?.message || "实时模式启动失败").slice(0, 300) });
        }
      })();
    }

    function parse() {
      while (buf.length >= 2 && !closed) {
        const b0 = buf[0], b1 = buf[1];
        const fin = !!(b0 & 0x80), opcode = b0 & 0x0f;
        const masked = !!(b1 & 0x80);
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (len > MAX_MESSAGE) return close(1009, "too large");
        if (buf.length < off + len + (masked ? 4 : 0)) return;
        let mask = null;
        if (masked) { mask = buf.subarray(off, off + 4); off += 4; }
        let payload = buf.subarray(off, off + len);
        if (mask) {
          payload = Buffer.from(payload);
          for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        }
        buf = buf.subarray(off + len);
        if (!fin) { sticky = true; continue; }
        if (sticky) { sticky = false; continue; }
        onClientMessage(opcode, payload);
      }
    }

    socket.on("data", (chunk) => {
      if (closed) return;
      buf = Buffer.concat([buf, chunk]);
      parse();
    });
    socket.on("error", () => close(1011));
    socket.on("close", () => { closed = true; try { ali?.close(); } catch {} ali = null; });
    if (head?.length) { buf = Buffer.concat([buf, head]); parse(); }
    } catch (e) {
      console.error("[rt] fatal", String(e?.stack || e));
      reject(socket, 500, "Internal Server Error");
    }
  });
}
