<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePointerSwipe, useScroll } from '@vueuse/core'
import { LoaderCircle } from 'lucide-vue-next'

interface Props {
    onRefresh: () => Promise<void>
    threshold?: number
    disabled?: boolean
    /* 用於支持有固定頭部的頁面 */
    offsetTop?: number
}

const props = withDefaults(defineProps<Props>(), {
    threshold: 80,
    disabled: false,
    offsetTop: 0
})

const emit = defineEmits<{
    'refresh-start': []
    'refresh-end': []
}>()

const containerRef = ref<HTMLElement>()
const scrollableRef = ref<HTMLElement>()
const pullDistance = ref(0)
const isRefreshing = ref(false)
const touchStartY = ref(0)

const { y: scrollY } = useScroll(scrollableRef)

const {
    distanceY,
    isSwiping,
    direction
} = usePointerSwipe(containerRef, {
    onSwipeStart: (e) => {
        if (props.disabled || isRefreshing.value) return
        touchStartY.value = e.y
    },
    onSwipe: (e) => {
        if (props.disabled || isRefreshing.value) return
        
        if (direction.value === 'down' && distanceY.value > 0) {
            const distance = Math.min(distanceY.value * 0.5, props.threshold * 1.5)
            pullDistance.value = distance
            e.preventDefault()
        }
    },
    onSwipeEnd: async () => {
        if (props.disabled || isRefreshing.value) {
            pullDistance.value = 0
            return
        }

        if (pullDistance.value >= props.threshold) {
            await triggerRefresh()
        } else {
            pullDistance.value = 0
        }
    }
})

const pullProgress = computed(() => {
    return Math.min(pullDistance.value / props.threshold, 1)
})

const indicatorStyle = computed(() => {
    const opacity = pullProgress.value
    const scale = 0.5 + pullProgress.value * 0.5
    const rotate = pullProgress.value * 360
    
    return {
        opacity,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        transition: isRefreshing.value ? 'transform 0.3s' : 'none'
    }
})

const containerStyle = computed(() => {
    if (isRefreshing.value) {
        return {
            transform: `translateY(${props.threshold}px)`,
            transition: 'transform 0.3s'
        }
    }
    
    return {
        transform: `translateY(${pullDistance.value}px)`,
        transition: isSwiping.value ? 'none' : 'transform 0.3s'
    }
})

async function triggerRefresh() {
    if (isRefreshing.value) return
    
    isRefreshing.value = true
    pullDistance.value = props.threshold
    emit('refresh-start')
    
    try {
        await props.onRefresh()
    } finally {
        isRefreshing.value = false
        pullDistance.value = 0
        emit('refresh-end')
    }
}

// 防止在 iOS 上的橡皮筋效果
let passiveSupported = false
try {
    const options = {
        get passive() {
            passiveSupported = true
            return false
        }
    }
    window.addEventListener('test', null as any, options)
    window.removeEventListener('test', null as any)
} catch (err) {}

function preventDefault(e: TouchEvent) {
    if (e.touches[0].clientY > touchStartY.value) {
        e.preventDefault()
    }
}

onMounted(() => {
    if (containerRef.value) {
        containerRef.value.addEventListener(
            'touchmove',
            preventDefault,
            passiveSupported ? { passive: false } : false
        )
    }
})

onUnmounted(() => {
    if (containerRef.value) {
        containerRef.value.removeEventListener('touchmove', preventDefault)
    }
})
</script>

<template>
    <div ref="containerRef" class="pull-to-refresh">
        <!-- 下拉指示器 -->
        <div class="pull-indicator" :style="{ height: `${pullDistance}px` }">
            <div class="pull-indicator-content" :style="indicatorStyle">
                <LoaderCircle 
                    class="w-6 h-6"
                    :class="{ 'animate-spin': isRefreshing }"
                />
            </div>
        </div>
        
        <!-- 可滾動內容 -->
        <div 
            ref="scrollableRef"
            class="pull-content"
            :style="containerStyle"
        >
            <slot />
        </div>
    </div>
</template>

<style scoped>
.pull-to-refresh {
    position: relative;
    overflow: hidden;
    height: 100%;
}

.pull-indicator {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: height 0.3s;
}

.pull-indicator-content {
    color: var(--brand-primary);
}

.pull-content {
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    will-change: transform;
    /* 為 sticky 元素預留空間 */
    position: relative;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

.animate-spin {
    animation: spin 1s linear infinite;
}
</style>