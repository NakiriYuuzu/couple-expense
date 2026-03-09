<script setup lang="ts">
import { useRouter } from 'vue-router'
import TopBar from '@/shared/components/TopBar.vue'

const router = useRouter()
</script>

<template>
    <div class="min-h-screen bg-background">
        <TopBar title="建立/加入群組" :show-back-button="true" @back="router.back()" />
        <main class="px-4 pb-24 pt-6">
            <p class="text-center text-muted-foreground">建立或加入群組頁面（即將推出）</p>
        </main>
    </div>
</template>
