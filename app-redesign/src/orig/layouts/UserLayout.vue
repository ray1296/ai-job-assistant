<template>
  <div class="user-layout">
    <van-nav-bar title="个人中心" left-arrow @click-left="router.back()" />
    <div class="sidebar">
      <div class="sidebar-item" :class="{ active: route.path === '/user/profile' }" @click="router.push('/user/profile')">
        <van-icon name="contact" size="20" />
        <span>个人资料</span>
      </div>
      <div class="sidebar-item" :class="{ active: route.path === '/user/favorites' }" @click="router.push('/user/favorites')">
        <van-icon name="star-o" size="20" />
        <span>我的收藏</span>
      </div>
      <div class="sidebar-item" :class="{ active: route.path === '/user/settings' }" @click="router.push('/user/settings')">
        <van-icon name="setting-o" size="20" />
        <span>设置</span>
      </div>
      <!-- 管理员专属入口：跳转到独立的管理端站点 -->
      <div v-if="isAdmin" class="sidebar-item admin-entry" @click="openAdmin">
        <van-icon name="setting" size="20" />
        <span>管理后台</span>
      </div>
    </div>
    <div class="content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '../stores/userStore'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// 管理端是独立站点（默认 5174 端口），可用 VITE_ADMIN_URL 覆盖
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || 'http://localhost:5174'

const isAdmin = computed(() => userStore.userInfo?.role === 'admin')

function openAdmin() {
  window.open(ADMIN_URL, '_blank')
}
</script>

<style scoped>
.user-layout {
  min-height: 100vh;
  /* 透明底：壁纸 / 主题动态背景从 .app-bg 层透出 */
  background: transparent;
  display: flex;
  flex-direction: column;
}

.sidebar {
  display: flex;
  background: var(--card);
  padding: 0 8px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.sidebar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  font-size: 12px;
  color: var(--text-secondary);
  transition: color 0.2s;
  white-space: nowrap;
}

.sidebar-item.active {
  color: var(--primary);
  font-weight: 600;
}

.sidebar-item.active::after {
  content: '';
  width: 24px;
  height: 3px;
  background: var(--primary);
  border-radius: 2px;
  margin-top: 2px;
}

/* 管理员入口：用主色描边与其他项区分 */
.sidebar-item.admin-entry {
  color: var(--primary);
}
.sidebar-item.admin-entry::after { display: none; }

.content {
  flex: 1;
}
</style>
