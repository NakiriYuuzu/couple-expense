<template>
    <!-- 底部導航欄 -->
    <nav class="fixed bottom-0 left-0 right-0 z-50 bg-nav-background border-t border-nav-border shadow-[0_-4px_20px_rgba(145,128,209,0.15)] backdrop-blur-md">
        <!-- 浮動的 Add Button (在 bottom bar 上方中間) -->
        <Button
            class="absolute left-1/2 -translate-x-1/2 -top-7 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 transition-all duration-300 hover:scale-110 z-10"
            @click="handleAddClick"
        >
            <Plus class="h-7 w-7 text-primary-foreground" />
        </Button>

        <div class="grid grid-cols-4 items-center px-2 py-2">
            <!-- Dashboard -->
            <div class="flex flex-col items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-12 w-12 rounded-xl hover:bg-brand-accent"
                    @click="handleNavigation('dashboard')"
                >
                    <LayoutDashboard :class="['h-6 w-6', activeTab === 'dashboard' ? 'text-brand-primary' : 'text-muted-foreground']" />
                </Button>
                <span :class="['text-xs mt-0.5', activeTab === 'dashboard' ? 'text-brand-primary font-medium' : 'text-muted-foreground']">
                    {{ t('nav.dashboard') }}
                </span>
            </div>

            <!-- Expenses -->
            <div class="flex flex-col items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-12 w-12 rounded-xl hover:bg-accent"
                    @click="handleNavigation('expenses')"
                >
                    <Receipt :class="['h-6 w-6', activeTab === 'expenses' ? 'text-brand-primary' : 'text-muted-foreground']" />
                </Button>
                <span :class="['text-xs mt-0.5', activeTab === 'expenses' ? 'text-brand-primary font-medium' : 'text-muted-foreground']">
                    {{ t('nav.expenses') }}
                </span>
            </div>

            <!-- Statistics -->
            <div class="flex flex-col items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-12 w-12 rounded-xl hover:bg-accent"
                    @click="handleNavigation('statistics')"
                >
                    <BarChart3 :class="['h-6 w-6', activeTab === 'statistics' ? 'text-brand-primary' : 'text-muted-foreground']" />
                </Button>
                <span :class="['text-xs mt-0.5', activeTab === 'statistics' ? 'text-brand-primary font-medium' : 'text-muted-foreground']">
                    {{ t('nav.statistics') }}
                </span>
            </div>

            <!-- Settings -->
            <div class="flex flex-col items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-12 w-12 rounded-xl hover:bg-accent"
                    @click="handleNavigation('settings')"
                >
                    <Settings :class="['h-6 w-6', activeTab === 'settings' ? 'text-brand-primary' : 'text-muted-foreground']" />
                </Button>
                <span :class="['text-xs mt-0.5', activeTab === 'settings' ? 'text-brand-primary font-medium' : 'text-muted-foreground']">
                    {{ t('nav.settings') }}
                </span>
            </div>
        </div>
    </nav>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import {
    LayoutDashboard,
    Receipt,
    BarChart3,
    Settings,
    Plus
} from 'lucide-vue-next'

const { t } = useI18n()

interface Props {
    activeTab?: string
}

withDefaults(defineProps<Props>(), {
    activeTab: 'dashboard'
})

const emit = defineEmits<{
    navigate: [tab: string]
    addClick: []
}>()

const handleNavigation = (tab: string) => {
    emit('navigate', tab)
}

const handleAddClick = () => {
    emit('addClick')
}
</script>
