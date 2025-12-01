<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-vue-next'

defineEmits<{
  click: []
}>()
</script>

<template>
  <Button
    @click="$emit('click')"
    class="fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-lg z-50
           bg-primary hover:bg-primary/90 transition-all duration-300 hover:scale-110
           flex items-center justify-center"
    aria-label="新增支出"
  >
    <Plus class="h-6 w-6" />
  </Button>
</template>
