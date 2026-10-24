<template>
  <div class="app-bg"><div class="app-bg-mask"></div></div>
  <router-view />
</template>
<script setup>
import { onMounted } from "vue";
onMounted(() => {
  // 左上角悬浮「上传题库」入口
  const a = document.createElement("a");
  a.href = "#/upload";
  a.className = "zg-upload-entry";
  a.textContent = "⬆ 上传题库";
  document.body.appendChild(a);
  const s = document.createElement("style");
  s.textContent = ".zg-upload-entry{position:fixed;left:16px;top:16px;z-index:60;background:#fff;border:1px solid var(--border,#e6def0);border-radius:999px;padding:8px 14px;font-size:13px;color:var(--primary,#2c3e6b);text-decoration:none;box-shadow:0 6px 18px rgba(60,40,90,.12)}";
  document.head.appendChild(s);
});
</script>
