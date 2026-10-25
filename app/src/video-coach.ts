/**
 * 端侧 CV：MediaPipe FaceLandmarker + 轻量画面统计。
 * 只输出结构化指标/事件，不上传原始视频；关键帧由面试页按事件/档位决定。
 */
export type CvMetrics = {
  at: number;
  face: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  gazeX: number;
  gazeY: number;
  brightness: number;
  motion: number;
  faceSize: number;
  centerX: number;
  centerY: number;
  smile: number;
  blink: number;
  pose: boolean;
  shoulderTilt: number;
  torsoLean: number;
};
export type CvEvent = { type: string; at: number; text: string; metrics: CvMetrics };
export type CvStatus = "idle" | "loading" | "ready" | "basic" | "unavailable" | "stopped";

type Opts = {
  onMetrics?: (m: CvMetrics) => void;
  onEvent?: (e: CvEvent) => void;
  onStatus?: (s: CvStatus, detail?: string) => void;
};

const empty = (at: number): CvMetrics => ({
  at, face: false, yaw: 0, pitch: 0, roll: 0, gazeX: 0, gazeY: 0,
  brightness: 0, motion: 0, faceSize: 0, centerX: 0.5, centerY: 0.5,
  smile: 0, blink: 0, pose: false, shoulderTilt: 0, torsoLean: 0,
});

export class VideoCoach {
  private video: HTMLVideoElement | null = null;
  private landmarker: any = null;
  private poseLandmarker: any = null;
  private tickCount = 0;
  private timer = 0;
  private running = false;
  private opts: Opts = {};
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private prevGray: Float32Array | null = null;
  private lastBrightness = 0;
  private lastMotion = 0;
  private lastBrightnessAt = 0;
  private samples: CvMetrics[] = [];
  private events: CvEvent[] = [];
  private lostSince = 0;
  private awaySince = 0;
  private darkSince = 0;
  private offSince = 0;
  private lastEventAt: Record<string, number> = {};
  private startedAt = 0;
  private status: CvStatus = "idle";

  getStatus() { return this.status; }
  getMetrics(): CvMetrics {
    return this.samples[this.samples.length - 1] || empty(Date.now());
  }
  getEvents(): CvEvent[] { return this.events.slice(); }

  private setStatus(s: CvStatus, detail?: string) {
    this.status = s;
    this.opts.onStatus?.(s, detail);
  }

  async start(video: HTMLVideoElement, opts: Opts = {}) {
    this.stop();
    this.video = video;
    this.opts = opts;
    this.running = true;
    this.startedAt = Date.now();
    this.samples = [];
    this.events = [];
    this.prevGray = null;
    this.lostSince = 0;
    this.awaySince = 0;
    this.darkSince = 0;
    this.offSince = 0;
    this.lastEventAt = {};
    this.canvas = document.createElement("canvas");
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.setStatus("loading", "正在加载端侧视觉模型");
    await this.load();
    if (!this.running) return;
    this.setStatus(this.landmarker ? "ready" : "basic", this.landmarker ? "端侧视觉已就绪" : "视觉模型不可用，仅做光线/动作检测");
    this.loop();
  }

  private async load() {
    try {
      const vision: any = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const options = {
        baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: true,
      };
      try {
        this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, options);
      } catch {
        try {
          this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
            ...options,
            baseOptions: { ...options.baseOptions, delegate: "CPU" },
          });
        } catch { this.landmarker = null; }
      }
      const poseOptions = {
        baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      try {
        this.poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, poseOptions);
      } catch {
        try {
          this.poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
            ...poseOptions,
            baseOptions: { ...poseOptions.baseOptions, delegate: "CPU" },
          });
        } catch { this.poseLandmarker = null; }
      }
    } catch (e) {
      console.warn("[video-cv] 端侧视觉模型加载失败，降级为光线/动作检测", e);
      this.landmarker = null;
    }
  }

  private loop() {
    if (!this.running) return;
    this.timer = window.setTimeout(() => {
      this.tick();
      this.loop();
    }, 220);
  }

  private tick() {
    const video = this.video;
    if (!video || !this.running || !video.videoWidth) return;
    const now = Date.now();
    const m = empty(now);
    let landmarks: any[] = [];
    if (this.landmarker) {
      try {
        const result = this.landmarker.detectForVideo(video, performance.now());
        landmarks = result?.faceLandmarks?.[0] || [];
        if (landmarks.length) this.fillFace(m, landmarks, result?.faceBlendshapes?.[0]?.categories || []);
      } catch {}
    }
    this.tickCount++;
    if (this.poseLandmarker && this.tickCount % 2 === 0) {
      try {
        const pres = this.poseLandmarker.detectForVideo(video, performance.now());
        const plm = pres?.landmarks?.[0] || [];
        if (plm.length) this.fillPose(m, plm);
      } catch {}
    }
    this.fillPixels(m, now);
    m.at = now;
    this.samples.push(m);
    if (this.samples.length > 900) this.samples.shift();
    this.opts.onMetrics?.(m);
    this.detectEvents(m, now);
  }

  private fillFace(m: CvMetrics, lm: any[], blends: any[]) {
    m.face = true;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of lm) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const w = Math.max(0.001, maxX - minX), h = Math.max(0.001, maxY - minY);
    m.faceSize = Math.max(w, h);
    m.centerX = (minX + maxX) / 2;
    m.centerY = (minY + maxY) / 2;
    const leftEye = lm[33], rightEye = lm[263], nose = lm[1], chin = lm[152], forehead = lm[10];
    if (leftEye && rightEye && nose && chin && forehead) {
      const eyeW = Math.max(0.001, Math.abs(rightEye.x - leftEye.x));
      const eyeMidX = (leftEye.x + rightEye.x) / 2;
      const eyeMidY = (leftEye.y + rightEye.y) / 2;
      const faceH = Math.max(0.001, Math.abs(chin.y - forehead.y));
      m.yaw = Math.max(-90, Math.min(90, ((nose.x - eyeMidX) / eyeW) * 55));
      m.pitch = Math.max(-90, Math.min(90, ((nose.y - eyeMidY) / faceH - 0.22) * 120));
      m.roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI;
    }
    const bs = new Map<string, number>();
    for (const c of blends) if (c?.categoryName) bs.set(c.categoryName, Number(c.score) || 0);
    const get = (k: string) => bs.get(k) || 0;
    m.blink = (get("eyeBlinkLeft") + get("eyeBlinkRight")) / 2;
    m.smile = (get("mouthSmileLeft") + get("mouthSmileRight")) / 2;
    m.gazeX = (get("eyeLookOutLeft") + get("eyeLookInRight") - get("eyeLookInLeft") - get("eyeLookOutRight")) / 2;
    m.gazeY = (get("eyeLookUpLeft") + get("eyeLookUpRight") - get("eyeLookDownLeft") - get("eyeLookDownRight")) / 2;
  }

  private fillPose(m: CvMetrics, lm: any[]) {
    const ls = lm[11], rs = lm[12], lh = lm[23], rh = lm[24], nose = lm[0];
    if (!ls || !rs) return;
    m.pose = true;
    const sw = Math.max(0.001, Math.abs(rs.x - ls.x));
    m.shoulderTilt = Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180 / Math.PI;
    if (lh && rh && nose) {
      const midX = (ls.x + rs.x) / 2;
      m.torsoLean = Math.max(-45, Math.min(45, ((nose.x - midX) / sw) * 35));
    }
  }

  private fillPixels(m: CvMetrics, now: number) {
    const video = this.video, ctx = this.ctx, canvas = this.canvas;
    if (!video || !ctx || !canvas) return;
    if (now - this.lastBrightnessAt >= 450) {
      this.lastBrightnessAt = now;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        this.lastBrightness = sum / (data.length / 4);
        // 80x60 灰度差作为动作强度
        const gw = 80, gh = 60, gray = new Float32Array(gw * gh);
        const stepX = canvas.width / gw, stepY = canvas.height / gh;
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
          const px = Math.min(canvas.width - 1, Math.floor(x * stepX));
          const py = Math.min(canvas.height - 1, Math.floor(y * stepY));
          const i = (py * canvas.width + px) * 4;
          gray[y * gw + x] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }
        if (this.prevGray) {
          let diff = 0;
          for (let i = 0; i < gray.length; i++) diff += Math.abs(gray[i] - this.prevGray[i]);
          this.lastMotion = diff / gray.length / 255;
        }
        this.prevGray = gray;
      } catch {}
    }
    m.brightness = this.lastBrightness;
    m.motion = this.lastMotion;
  }

  private detectEvents(m: CvMetrics, now: number) {
    const fire = (type: string, text: string, gap = 8000) => {
      if (now - (this.lastEventAt[type] || 0) < gap) return;
      this.lastEventAt[type] = now;
      const e = { type, at: now, text, metrics: m };
      this.events.push(e);
      if (this.events.length > 80) this.events.shift();
      this.opts.onEvent?.(e);
    };
    if (!m.face) {
      if (!this.lostSince) this.lostSince = now;
      if (now - this.lostSince > 1500) fire("face_lost", "超过 1.5 秒没有识别到脸");
    } else {
      if (this.lostSince && now - this.lostSince > 1500) fire("face_back", "脸回到画面", 4000);
      this.lostSince = 0;
    }
    const lookingAway = m.face && (Math.abs(m.yaw) > 20 || Math.abs(m.gazeX) > 0.42);
    if (lookingAway) {
      if (!this.awaySince) this.awaySince = now;
      if (now - this.awaySince > 1800) fire("look_away", "视线/头转向偏离镜头超过 1.8 秒");
    } else this.awaySince = 0;
    if (m.brightness > 0 && m.brightness < 52) {
      if (!this.darkSince) this.darkSince = now;
      if (now - this.darkSince > 2500) fire("low_light", "画面偏暗，可能影响面试官观感");
    } else this.darkSince = 0;
    if (m.face && (Math.abs(m.centerX - 0.5) > 0.2 || Math.abs(m.centerY - 0.5) > 0.22)) {
      if (!this.offSince) this.offSince = now;
      if (now - this.offSince > 2000) fire("off_center", "人脸偏离画面中心");
    } else this.offSince = 0;
    if (m.motion > 0.16) fire("big_motion", "画面动作幅度较大", 7000);
    if (m.pose && Math.abs(m.shoulderTilt) > 10) {
      fire("shoulder_tilt", "肩线明显倾斜，可能坐姿歪了", 9000);
    }
    if (m.pose && Math.abs(m.torsoLean) > 18) {
      fire("lean", "身体偏离镜头中心较多", 9000);
    }
  }

  summary() {
    const s = this.samples;
    const n = Math.max(1, s.length);
    const avg = (k: keyof CvMetrics) => s.reduce((a, m) => a + Number(m[k] || 0), 0) / n;
    const faces = s.filter((m) => m.face).length;
    const events: Record<string, number> = {};
    for (const e of this.events) events[e.type] = (events[e.type] || 0) + 1;
    return {
      durationSec: Math.round((Date.now() - this.startedAt) / 1000),
      samples: s.length,
      faceRate: Math.round((faces / n) * 100),
      avgYaw: Math.round(avg("yaw")),
      avgPitch: Math.round(avg("pitch")),
      avgBrightness: Math.round(avg("brightness")),
      avgMotion: Number(avg("motion").toFixed(3)),
      smileRate: Number(avg("smile").toFixed(2)),
      poseRate: Math.round((s.filter((m) => m.pose).length / n) * 100),
      avgShoulderTilt: Math.round(avg("shoulderTilt")),
      avgTorsoLean: Math.round(avg("torsoLean")),
      events,
    };
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    this.timer = 0;
    try { this.landmarker?.close?.(); } catch {}
    try { this.poseLandmarker?.close?.(); } catch {}
    this.landmarker = null;
    this.poseLandmarker = null;
    if (this.status !== "idle") this.setStatus("stopped");
    this.video = null;
  }
}
