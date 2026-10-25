<template>
  <div class="app-bg"><div class="app-bg-mask"></div></div>
  <router-view />
</template>
<script setup>
import { onMounted } from "vue";
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
    // 报告页自带返回按钮，悬浮上传入口会盖住它
    a.style.display = onReport ? "none" : "";
    a.textContent = onUpload ? "← 继续刷题" : "⬆ 上传题库";
    a.href = onUpload ? "#/review" : "#/upload";
  };
  sync();
  window.addEventListener("hashchange", sync);
});
</script>
