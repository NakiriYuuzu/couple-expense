<template>
  <Button
    variant="outline"
    size="icon"
    @click="toggleDark()"
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
import { useDark, useToggle } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-vue-next'

// 使用 VueUse 的 useDark
const isDark = useDark({
  // 使用 'vueuse-theme' 作為存儲 key，避免與其他 key 衝突
  storageKey: 'vueuse-theme',
  // 儲存在 localStorage
  storage: localStorage
})

// 使用 useToggle 來切換主題
const toggleDark = useToggle(isDark)
</script>