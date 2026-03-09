<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import TopBar from '@/shared/components/TopBar.vue'

const router = useRouter()
const route = useRoute()
const expenseId = route.params.id as string
</script>

<template>
    <div class="min-h-screen bg-background">
        <TopBar title="支出詳情" :show-back-button="true" @back="router.back()" />
        <main class="px-4 pb-24 pt-6">
            <p class="text-center text-muted-foreground">支出詳情頁面 - {{ expenseId }}</p>
        </main>
    </div>
</template>
