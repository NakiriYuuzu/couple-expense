<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import TopBar from '@/shared/components/TopBar.vue'

const router = useRouter()
const route = useRoute()
const groupId = route.params.id as string
</script>

<template>
    <div class="min-h-screen bg-background">
        <TopBar title="群組設定" :show-back-button="true" @back="router.back()" />
        <main class="px-4 pb-24 pt-6">
            <p class="text-center text-muted-foreground">群組設定頁面 - {{ groupId }}</p>
        </main>
    </div>
</template>
