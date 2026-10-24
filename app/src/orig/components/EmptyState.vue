<template>
  <div class="empty-state">
    <van-icon :name="icon" size="64" color="var(--text-light)" />
    <p class="empty-text">{{ text }}</p>
    <van-button v-if="actionText" type="primary" size="small" round @click="$emit('action')">{{ actionText }}</van-button>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'info-o' },
  text: { type: String, default: '暂无数据' },
  actionText: { type: String, default: '' }
})

defineEmits(['action'])
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
}

.empty-text {
  font-size: 14px;
  color: var(--text-light);
}
</style>
