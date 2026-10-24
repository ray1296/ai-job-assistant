<template>
  <div class="app-layout">
    <!-- 桌面端侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-mark">考</div>
        <div class="logo-text-group">
          <span class="logo-text">备考帮</span>
          <span class="logo-sub">期末冲刺笔记</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/home" class="nav-item" active-class="active">
          <van-icon name="home-o" size="20" />
          <span>首页</span>
        </router-link>
        <router-link to="/review" class="nav-item" active-class="active">
          <van-icon name="bookmark-o" size="20" />
          <span>复习</span>
        </router-link>
        <router-link to="/upload" class="nav-item" active-class="active">
          <van-icon name="add-o" size="20" />
          <span>上传</span>
        </router-link>
        <router-link to="/stats" class="nav-item" active-class="active">
          <van-icon name="chart-trending-o" size="20" />
          <span>统计</span>
        </router-link>
        <router-link to="/market" class="nav-item" active-class="active">
          <van-icon name="shop-o" size="20" />
          <span>合作社</span>
        </router-link>
        <router-link to="/wallpaper" class="nav-item" active-class="active">
          <van-icon name="photo-o" size="20" />
          <span>壁纸</span>
        </router-link>
        <router-link to="/suggest" class="nav-item" active-class="active">
          <van-icon name="bulb-o" size="20" />
          <span>心愿池</span>
        </router-link>
        <router-link to="/guide" class="nav-item nav-item-guide" active-class="active">
          <van-icon name="guide-o" size="20" />
          <span>探索图鉴</span>
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <router-link to="/user/profile" class="nav-item">
          <div class="user-avatar">{{ userInitial }}</div>
          <span class="user-name">{{ userStore.userInfo.nickname || '我的' }}</span>
        </router-link>
      </div>
    </aside>

    <!-- 内容区 -->
    <div class="content-area">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['Home', 'ReviewList', 'UploadCenter', 'Stats', 'Market']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>

    <!-- 移动端底部TabBar（颜色由主题 CSS 驱动） -->
    <van-tabbar v-model="active" route class="mobile-tabbar">
      <van-tabbar-item to="/home" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item to="/review" icon="bookmark-o">复习</van-tabbar-item>
      <van-tabbar-item to="/upload" icon="add-o">上传</van-tabbar-item>
      <van-tabbar-item to="/stats" icon="chart-trending-o">统计</van-tabbar-item>
      <van-tabbar-item to="/market" icon="shop-o">合作社</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '../stores/userStore'

const active = ref(0)
const userStore = useUserStore()

const userInitial = computed(() => userStore.userInfo.nickname?.charAt(0) || 'U')
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  /* 透明底：壁纸 / 主题动态背景从 .app-bg 层透出 */
  background: transparent;
}

/* ===== 桌面端侧边栏 ===== */
.sidebar {
  display: none;
}

.content-area {
  width: 100%;
  min-height: 100vh;
}

.mobile-tabbar {
  display: flex;
}

/* ===== 桌面端响应式 (>=768px) ===== */
@media (min-width: 768px) {
  .app-layout {
    display: flex;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    width: 220px;
    min-height: 100vh;
    background: var(--card);
    border-right: 1px solid var(--border);
    position: sticky;
    top: 0;
    flex-shrink: 0;
  }

  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 20px 16px;
    border-bottom: 1px solid var(--border);
  }

  .logo-mark {
    width: 36px;
    height: 36px;
    background: var(--primary);
    color: var(--on-primary);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .logo-text-group {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .logo-text {
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
  }

  .logo-sub {
    font-size: 11px;
    color: var(--text-light);
    margin-top: 2px;
  }

  .sidebar-nav {
    flex: 1;
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-secondary);
    transition: all 0.15s;
  }

  .nav-item:hover {
    background: var(--bg-alt);
    color: var(--primary);
  }

  .nav-item.active {
    background: var(--primary-bg);
    color: var(--primary);
    font-weight: 600;
  }

  .sidebar-footer {
    padding: 10px;
    border-top: 1px solid var(--border);
  }

  .sidebar-footer .nav-item {
    padding: 8px 14px;
  }

  .user-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--primary);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .user-name {
    font-size: 13px;
  }

  .content-area {
    flex: 1;
    min-width: 0;
    max-width: 900px;
    margin: 0 auto;
    padding-bottom: 0;
  }

  .mobile-tabbar {
    display: none;
  }
}

/* ===== 大屏 (>=1200px) ===== */
@media (min-width: 1200px) {
  .content-area {
    max-width: 1080px;
  }
}
</style>
