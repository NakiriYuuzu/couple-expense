<template>
    <div class="startup-page">
        <!-- Aurora 背景 -->
        <div class="startup-bg" />

        <!-- 主要內容 -->
        <div class="relative flex h-full flex-col items-center justify-center px-6 z-10">
            <!-- Logo 區域 -->
            <div class="startup-logo">
                <h1 class="startup-logo-text">
                    Keep
                </h1>
            </div>

            <!-- 標語 -->
            <p class="startup-tagline">
                共同記帳，簡單生活
            </p>

            <!-- 登入選項 -->
            <div v-if="!authLoading" class="startup-button-wrapper">
                <Button
                    @click="handleGoogleSignIn"
                    :disabled="loading"
                    class="startup-login-btn glass-elevated"
                    variant="outline"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span class="text-base font-medium">
                        {{ loading ? '登入中...' : '使用 Google 登入' }}
                    </span>
                </Button>
            </div>

            <!-- 載入中狀態 -->
            <div v-else class="startup-button-wrapper flex items-center justify-center">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/features/auth/stores/auth'
import { Button } from '@/shared/components/ui/button'
import { routes } from '@/app/router/routes/index.ts'
import { toast } from 'vue-sonner'

const router = useRouter()
const authStore = useAuthStore()

const authLoading = ref(true)
const loading = ref(false)

// 檢查會話狀態
const checkAuthSession = async () => {
    try {
        authLoading.value = true

        // 等待 auth store 初始化完成
        let waitCount = 0
        while (!authStore.initialized && waitCount < 50) { // 最多等待5秒
            await new Promise(resolve => setTimeout(resolve, 100))
            waitCount++
        }

        if (authStore.isLoggedIn) {
            // 檢查是否有重定向參數
            const redirectPath = route.query.redirect as string

            if (redirectPath) {
                // 如果有重定向參數，跳轉到原本要去的頁面
                router.replace(redirectPath)
            } else {
                // 否則跳轉到主頁
                router.replace({ name: routes.index.name })
            }
            return
        }
    } catch (error) {
        console.error('檢查會話狀態失敗:', error)
    } finally {
        authLoading.value = false
    }
}

// Google 登入
const handleGoogleSignIn = async () => {
    try {
        loading.value = true
        await authStore.signInWithGoogle()
        // OAuth 會自動重定向，不需要手動跳轉
    } catch (error) {
        console.error('Google 登入失敗:', error)
        toast.error('Google 登入失敗，請稍後再試')
    } finally {
        loading.value = false
    }
}

// 監聽認證狀態變化
// 使用 Supabase 的 onAuthStateChange 直接監聽
import { supabase } from '@/shared/lib/supabase'
import { useRoute } from 'vue-router'

const route = useRoute()

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        // 檢查是否有重定向參數
        const redirectPath = route.query.redirect as string

        if (redirectPath) {
            // 如果有重定向參數，跳轉到原本要去的頁面
            router.replace(redirectPath)
        } else {
            // 否則跳轉到主頁
            router.replace({ name: routes.index.name })
        }
    }
})

onMounted(() => {
    checkAuthSession()
})
</script>

<style scoped>
/* ── Startup Page ── */

.startup-page {
    position: relative;
    height: 100vh;
    height: 100dvh;
    width: 100%;
    overflow: hidden;
}

/* ── Aurora background ── */

.startup-bg {
    position: absolute;
    inset: 0;
    background:
        radial-gradient(ellipse at 20% 50%, oklch(0.75 0.15 280 / 0.6) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, oklch(0.85 0.10 320 / 0.4) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 80%, oklch(0.70 0.12 260 / 0.3) 0%, transparent 50%),
        oklch(0.25 0.04 278);
    opacity: 0;
    animation: bg-fade-in 0.6s ease-out forwards;
}

/* ── Logo ── */

.startup-logo {
    opacity: 0;
    transform: translateY(24px);
    animation: logo-slide-up 0.5s ease-out 0.3s forwards;
}

.startup-logo-text {
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 700;
    font-size: clamp(3.5rem, 8vw, 4.5rem);
    line-height: 1;
    background: linear-gradient(135deg, oklch(0.85 0.12 278), oklch(0.75 0.15 310));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    user-select: none;
}

/* ── Tagline ── */

.startup-tagline {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 400;
    color: oklch(0.75 0.04 278);
    margin-top: 0.75rem;
    letter-spacing: 0.08em;
    opacity: 0;
    animation: tagline-fade-in 0.4s ease-out 0.6s forwards;
}

/* ── Login button wrapper ── */

.startup-button-wrapper {
    margin-top: 3rem;
    width: 100%;
    max-width: 280px;
    opacity: 0;
    animation: button-bounce-in 0.5s ease-out 0.8s forwards;
}

/* ── Login button ── */

.startup-login-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    height: 3.25rem;
    border-radius: 1rem;
    background: oklch(1 0 0 / 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: oklch(0.30 0.02 278);
    border: 1px solid oklch(1 0 0 / 0.3);
    box-shadow:
        0 4px 16px oklch(0.50 0.15 278 / 0.15),
        0 1px 3px oklch(0 0 0 / 0.08);
    cursor: pointer;
    transition: all 0.25s ease;
}

.startup-login-btn:hover:not(:disabled) {
    border-image: linear-gradient(135deg, oklch(0.70 0.15 278), oklch(0.65 0.18 310)) 1;
    border-image-slice: 1;
    box-shadow: 0 4px 20px oklch(0.50 0.15 278 / 0.25);
    transform: translateY(-2px);
}

.startup-login-btn:active:not(:disabled) {
    transform: translateY(0);
}

.startup-login-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* ── Keyframes ── */

@keyframes bg-fade-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes logo-slide-up {
    from {
        opacity: 0;
        transform: translateY(24px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes tagline-fade-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes button-bounce-in {
    0% {
        opacity: 0;
        transform: scale(0.92);
    }
    60% {
        opacity: 1;
        transform: scale(1.04);
    }
    100% {
        opacity: 1;
        transform: scale(1);
    }
}

/* ── Reduced motion ── */

@media (prefers-reduced-motion: reduce) {
    .startup-bg,
    .startup-logo,
    .startup-tagline,
    .startup-button-wrapper {
        animation: none;
        opacity: 1;
        transform: none;
    }
}
</style>
