<template>
  <div class="min-h-screen bg-background">
    <!-- 頂部導航欄 -->
    <TopBar :title="$t('couple.title')" :show-back-button="true" @back="handleBack" />

    <!-- 主要內容區域 -->
    <main class="px-4 pb-20">
      <div class="mt-6">
        <CoupleManagement />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import TopBar from '@/components/TopBar.vue'
import CoupleManagement from '@/components/CoupleManagement.vue'

const router = useRouter()

// 處理返回按鈕
const handleBack = () => {
  router.back()
}
</script>

<style scoped>
</style>