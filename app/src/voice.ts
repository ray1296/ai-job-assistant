import { ref } from "vue";
import { VOICE_LIBRARY } from "./orig/utils/edgeTTS.js";

/** 阿里云 qwen3-tts-flash 音色（Edge 通道本服务未实现，只展示可用的阿里云音色）。 */
export const ALIYUN_VOICES: any[] = (VOICE_LIBRARY || []).filter(
  (v: any) => v && v.provider === "aliyun" && v.voice,
);

const ON_KEY = "zg.voiceAuto";
export const voiceOn = ref(localStorage.getItem(ON_KEY) !== "0");
export function setVoiceOn(v: boolean) {
  voiceOn.value = !!v;
  try { localStorage.setItem(ON_KEY, v ? "1" : "0"); } catch {}
  if (!v) stopSpeech();
}

/** 读取某个 agent 的音色；兼容早期设置里存的裸 voice 名（Cherry/Serena/Ethan）。 */
export function voiceFor(name: string) {
  let raw = "";
  try { raw = localStorage.getItem("zg.voice." + name) || ""; } catch {}
  const hit =
    ALIYUN_VOICES.find((v) => v.id === raw) ||
    ALIYUN_VOICES.find((v) => v.voice === raw) ||
    ALIYUN_VOICES[0];
  return hit;
}

let audio: HTMLAudioElement | null = null;
let seq = 0;
let waiters: Array<() => void> = [];
function flushWaiters() {
  const list = waiters;
  waiters = [];
  for (const done of list) { try { done(); } catch {} }
}
export function stopSpeech() {
  seq++;
  try {
    if (audio) {
      const u = (audio as any).__zgUrl;
      if (u) URL.revokeObjectURL(u);
      (audio as any).__zgUrl = "";
      audio.pause();
    }
  } catch {}
  audio = null;
  flushWaiters();
  try { window.speechSynthesis?.cancel(); } catch {}
}

function fallbackSpeak(text: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 220));
    u.lang = "zh-CN";
    window.speechSynthesis.speak(u);
  } catch {}
}

/**
 * 用指定 agent 的音色朗读。force=true 时忽略全局静音（设置页试听用）。
 * 新语音开始前会停掉上一条，避免多个 chip 同时说话。
 */
export async function speakAs(name: string, text: string, force = false): Promise<void> {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  if (!voiceOn.value && !force) return;
  const voice = voiceFor(name);
  stopSpeech();
  const mine = ++seq;
  try { audio?.pause(); } catch {}
  try {
    const res = await fetch("/api/ai/tts-aliyun", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": (window as any).__zgCsrf || "",
      },
      body: JSON.stringify({
        text: clean.slice(0, 320),
        voice: voice.voice,
        instruction: voice.instruction || "",
      }),
    });
    if (!res.ok) throw new Error("TTS " + res.status);
    const blob = await res.blob();
    if (!blob.size) throw new Error("TTS 空响应");
    if (mine !== seq) return;
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    // 保持音色/音高不变，只略快播放；比等待更快的 TTS 上游更直接。
    el.playbackRate = 1.12;
    el.preservesPitch = true;
    (el as any).__zgUrl = url;
    audio = el;
    const done = () => {
      URL.revokeObjectURL(url);
      (el as any).__zgUrl = "";
      if (audio === el) audio = null;
    };
    el.onended = done;
    el.onerror = done;
    await el.play().catch(() => {
      // 浏览器拦截自动播放时退回系统语音（仍是本机，不花钱）。
      if (mine === seq) fallbackSpeak(clean);
    });
    // 面试需要等 AI 说完再重新开麦；chip 里不 await，行为不变
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
      el.addEventListener("ended", () => resolve(), { once: true });
      el.addEventListener("error", () => resolve(), { once: true });
    });
  } catch (e) {
    console.warn("[voice] TTS 不可用，改用系统语音", e);
    if (mine === seq && (voiceOn.value || force)) fallbackSpeak(clean);
  }
}
