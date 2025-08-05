<template>
  <Button
    variant="outline"
    size="icon"
    @click="toggleTheme"
    class="relative"
  >
    <!-- Light mode icon -->
    <Sun
      class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
    />
    <!-- Dark mode icon -->
    <Moon
      class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
    />
    <span class="sr-only">切換主題</span>
  </Button>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-vue-next'

const theme = ref<'light' | 'dark'>('light')

// 初始化主題
onMounted(() => {
  // 檢查 localStorage 中保存的主題
  const savedTheme = localStorage.getItem('theme')
  
  if (savedTheme) {
    theme.value = savedTheme as 'light' | 'dark'
  } else {
    // 檢查系統偏好
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    theme.value = prefersDark ? 'dark' : 'light'
  }
  
  applyTheme()
})

// 應用主題
const applyTheme = () => {
  if (theme.value === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  localStorage.setItem('theme', theme.value)
}

// 切換主題
const toggleTheme = () => {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  applyTheme()
}
</script>