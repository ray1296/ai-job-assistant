<template>
  <div class="app-bg"><div class="app-bg-mask"></div></div>
  <router-view />
  <MouseTrail />
</template>
<script setup>
import { onMounted } from "vue";
import MouseTrail from "../mouse-trail";
onMounted(() => {
  const a = document.createElement("a");
  a.className = "zg-upload-entry";
  document.body.appendChild(a);
  const style = document.createElement("style");
  style.textContent = ".zg-upload-entry{position:fixed;left:16px;top:16px;z-index:60;background:#fff;border:1px solid var(--border,#e6def0);border-radius:999px;padding:8px 14px;font-size:13px;color:var(--primary,#2c3e6b);text-decoration:none;box-shadow:0 6px 18px rgba(60,40,90,.12)}";
  document.head.appendChild(style);
  const sync = () => {
    const onUpload = location.hash.startsWith("#/upload");
    const onReport = location.hash.startsWith("#/ai-page");
    const onSubject = /^#\/review\/[a-z0-9]+/.test(location.hash);
    // 报告页自带返回按钮，悬浮上传入口会盖住它
    a.style.display = onReport ? "none" : "";
    // 选择科目列表页右上角已有历史报告，上传入口保持左上；
    // 科目刷题页左上角是返回键，把上传入口移到右上角。
    a.style.left = onSubject ? "auto" : "16px";
    a.style.right = onSubject ? "16px" : "auto";
    a.textContent = onUpload ? "← 继续刷题" : "⬆ 上传题库";
    a.href = onUpload ? "#/review" : "#/upload";
  };
  sync();
  window.addEventListener("hashchange", sync);
  // vue-router 的 pushState/replaceState 不一定触发 hashchange；报告页加载后
  // 悬浮上传入口要立即隐藏，否则会盖住报告页左上角返回/标题。
  window.addEventListener("popstate", sync);
  setInterval(sync, 400);
});
</script>
