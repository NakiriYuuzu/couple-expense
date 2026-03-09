<script setup lang="ts">
import TopBar from '@/shared/components/TopBar.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
    <div class="min-h-screen bg-background">
        <TopBar title="帳務" />
        <main class="px-4 pb-24 pt-6">
            <p class="text-center text-muted-foreground">帳務頁面（即將推出）</p>
        </main>
    </div>
</template>
