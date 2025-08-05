<template>
    <!-- 底部導航欄 -->
    <nav class="fixed bottom-0 left-0 right-0 z-50 bg-nav-background border-t border-nav-border shadow-[0_-4px_20px_rgba(145,128,209,0.15)] backdrop-blur-md">
        <div class="relative flex items-center justify-around px-4 py-3">
            <!-- Home -->
            <div class="flex flex-col items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-12 w-12 rounded-xl hover:bg-brand-accent"
                    @click="handleNavigation('home')"
                >
                    <Home :class="['h-6 w-6', activeTab === 'home' ? 'text-brand-primary' : 'text-muted-foreground']" />
                </Button>
                <div 
                    :class="[
                        'h-0.5 w-6 rounded-full transition-all duration-200 mt-1',
                        activeTab === 'home' ? 'bg-brand-primary' : 'bg-transparent'
                    ]"
                />
            </div>

            <!-- Search (原本的 List) -->
            <div class="flex flex-col items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-12 w-12 rounded-xl hover:bg-accent"
                    @click="handleNavigation('search')"
                >
                    <Search :class="['h-6 w-6', activeTab === 'search' ? 'text-brand-primary' : 'text-muted-foreground']" />
                </Button>
                <div 
                    :class="[
                        'h-0.5 w-6 rounded-full transition-all duration-200 mt-1',
                        activeTab === 'search' ? 'bg-brand-primary' : 'bg-transparent'
                    ]"
                />
            </div>
            
            <!-- 新增按鈕 - 突出在頁面和導航欄之間 -->
            <Button
                variant="ghost"
                size="icon"
                class="h-16 w-16 -mt-18 rounded-full bg-brand-primary hover:bg-brand-primary/90 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                @click="handleAddNew"
            >
                <Plus class="h-8 w-8 text-brand-primary-foreground" />
            </Button>
            
            <!-- Statistics (原本的 Calendar) -->
            <div class="flex flex-col items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-12 w-12 rounded-xl hover:bg-accent"
                    @click="handleNavigation('statistics')"
                >
                    <BarChart3 :class="['h-6 w-6', activeTab === 'statistics' ? 'text-brand-primary' : 'text-muted-foreground']" />
                </Button>
                <div 
                    :class="[
                        'h-0.5 w-6 rounded-full transition-all duration-200 mt-1',
                        activeTab === 'statistics' ? 'bg-brand-primary' : 'bg-transparent'
                    ]"
                />
            </div>

            <!-- Settings (原本的 Search) -->
            <div class="flex flex-col items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-12 w-12 rounded-xl hover:bg-accent"
                    @click="handleNavigation('settings')"
                >
                    <Settings :class="['h-6 w-6', activeTab === 'settings' ? 'text-brand-primary' : 'text-muted-foreground']" />
                </Button>
                <div 
                    :class="[
                        'h-0.5 w-6 rounded-full transition-all duration-200 mt-1',
                        activeTab === 'settings' ? 'bg-brand-primary' : 'bg-transparent'
                    ]"
                />
            </div>
        </div>
    </nav>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { 
    Home, 
    Search,
    BarChart3,
    Settings, 
    Plus 
} from 'lucide-vue-next'

interface Props {
    activeTab?: string
}

const props = withDefaults(defineProps<Props>(), {
    activeTab: 'home'
})

const emit = defineEmits<{
    navigate: [tab: string]
    add: []
}>()

const handleNavigation = (tab: string) => {
    emit('navigate', tab)
}

const handleAddNew = () => {
    emit('add')
}
</script>