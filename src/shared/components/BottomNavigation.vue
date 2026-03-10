<template>
    <!-- 浮動膠囊導航列 -->
    <nav
        :class="[
            'fixed left-1/2 -translate-x-1/2 z-50 glass-nav rounded-full transition-transform duration-300 ease-out',
            isNavHidden ? 'translate-y-24' : 'translate-y-0'
        ]"
        :style="{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }"
    >
        <div class="flex items-center gap-1 px-2 py-1.5">
            <!-- Dashboard -->
            <button
                class="nav-item press-feedback hover-transition"
                @click="handleNavigation('dashboard')"
            >
                <LayoutDashboard
                    :class="['h-5 w-5 transition-colors duration-150', activeTab === 'dashboard' ? 'text-brand-primary' : 'text-muted-foreground']"
                />
                <span
                    :class="['nav-dot transition-all duration-200', activeTab === 'dashboard' ? 'opacity-100 scale-100' : 'opacity-0 scale-0']"
                />
            </button>

            <!-- Expenses -->
            <button
                class="nav-item press-feedback hover-transition"
                @click="handleNavigation('expenses')"
            >
                <Receipt
                    :class="['h-5 w-5 transition-colors duration-150', activeTab === 'expenses' ? 'text-brand-primary' : 'text-muted-foreground']"
                />
                <span
                    :class="['nav-dot transition-all duration-200', activeTab === 'expenses' ? 'opacity-100 scale-100' : 'opacity-0 scale-0']"
                />
            </button>

            <!-- Add Button (center) -->
            <button
                class="flex items-center justify-center h-11 w-11 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg press-feedback hover-transition mx-1"
                @click="handleAddClick"
            >
                <Plus class="h-5 w-5 text-primary-foreground" />
            </button>

            <!-- Overview -->
            <button
                class="nav-item press-feedback hover-transition"
                @click="handleNavigation('overview')"
            >
                <PieChart
                    :class="['h-5 w-5 transition-colors duration-150', activeTab === 'overview' ? 'text-brand-primary' : 'text-muted-foreground']"
                />
                <span
                    :class="['nav-dot transition-all duration-200', activeTab === 'overview' ? 'opacity-100 scale-100' : 'opacity-0 scale-0']"
                />
            </button>

            <!-- Settings -->
            <button
                class="nav-item press-feedback hover-transition"
                @click="handleNavigation('settings')"
            >
                <Settings
                    :class="['h-5 w-5 transition-colors duration-150', activeTab === 'settings' ? 'text-brand-primary' : 'text-muted-foreground']"
                />
                <span
                    :class="['nav-dot transition-all duration-200', activeTab === 'settings' ? 'opacity-100 scale-100' : 'opacity-0 scale-0']"
                />
            </button>
        </div>
    </nav>
</template>

<script setup lang="ts">
import {
    LayoutDashboard,
    Receipt,
    PieChart,
    Settings,
    Plus
} from 'lucide-vue-next'
import { useScrollDirection } from '@/shared/composables/useScrollDirection'

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

const { isNavHidden } = useScrollDirection()

const handleNavigation = (tab: string) => {
    emit('navigate', tab)
}

const handleAddClick = () => {
    emit('addClick')
}
</script>

<style scoped>
.nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 9999px;
    position: relative;
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0;
}

.nav-dot {
    position: absolute;
    bottom: 2px;
    width: 4px;
    height: 4px;
    border-radius: 9999px;
    background-color: var(--brand-primary);
}
</style>
