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
import { Button } from '@/components/ui/button'
import { Sun, Moon } from 'lucide-vue-next'
import { useThemeStore } from '@/stores'

// 使用 theme store
const themeStore = useThemeStore()
const { isDark, toggleDark } = themeStore
</script>