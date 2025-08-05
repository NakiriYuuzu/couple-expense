<template>
    <div class="relative h-screen w-full overflow-hidden bg-white">
        <!-- 背景漸層 -->
        <div
            class="absolute inset-0 bg-gradient-to-b from-[#BFC0D1] to-[#1E202C] opacity-0 animate-fade-in"/>

        <!-- 白色背景層 -->
        <div class="absolute inset-0 bg-white shadow-[0px_4px_4px_rgba(0,0,0,0.25)]"/>

        <!-- 紫色背景 U 形裝飾 -->
        <div class="absolute inset-0 z-0">
            <!-- 上方矩形部分 -->
            <div class="absolute inset-x-0 top-0 h-[40%] bg-[#9180D1] animate-fade-in"></div>
            <!-- U 形底部 -->
            <div class="absolute left-0 right-0 top-[40%] h-[100px] overflow-hidden">
                <div
                    class="absolute inset-x-0 -top-[50px] h-[150px] bg-[#9180D1] rounded-b-[50%] animate-expand-u"
                ></div>
            </div>
        </div>

        <!-- 主要內容 -->
        <div class="relative flex h-full items-center justify-center px-4 z-10">
            <div
                class="flex w-full max-w-[203px] flex-col items-center gap-12 sm:gap-16 md:gap-20 lg:gap-[90px]">
                <!-- Logo 區域 -->
                <div
                    class="flex flex-col items-center gap-8 sm:gap-10 md:gap-12 lg:gap-[50px] animate-slide-up">
                    <!-- Keep 文字 -->
                    <div class="flex items-center justify-center p-2 sm:p-[10px]">
                        <h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-[64px] font-normal leading-[1.09] text-[#E0D8FF] animate-text-glow">
                            Keep
                        </h1>
                    </div>

                    <!-- 貨幣圖標 -->
                    <div
                        class="money-icon relative h-24 w-24 sm:h-32 sm:w-32 md:h-36 md:w-36 lg:h-[147px] lg:w-[147px]">
                        <svg
                            class="w-full h-full"
                            viewBox="0 0 147 147"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <!-- 背景 -->
                            <rect width="147" height="147" fill="#7A32BE"/>

                            <!-- 信封外框 -->
                            <rect x="30.74" y="31.4" width="85.53" height="63.48" fill="#E2E4E5"/>

                            <!-- 信封內部 -->
                            <rect x="37.42" y="39.92" width="73.5" height="41.34" fill="#A68CE3"/>

                            <!-- 內容區域 -->
                            <rect x="42.01" y="44.52" width="64.31" height="32.15" fill="#60519B"/>

                            <!-- 右上角圓點 -->
                            <circle cx="100.69" cy="60.595" r="3.445" fill="#DCC2F8"/>

                            <!-- 左上角圓點 -->
                            <circle cx="54.75" cy="60.595" r="3.445" fill="#60519B"/>

                            <!-- 裝飾層 -->
                            <rect x="37.42" y="39.92" width="57.88" height="41.34" fill="#DCC2F8"/>
                            <rect x="42.01" y="44.52" width="48.69" height="32.15" fill="#9747FF"/>

                            <!-- 中央圓形 -->
                            <circle cx="74.165" cy="60.615" r="11.485" fill="#DCC2F8"/>

                            <!-- 斜線 -->
                            <path d="M70.25 54.65L77.79 66.63" stroke="#9747FF" stroke-width="2"/>

                            <!-- 白色區域 -->
                            <rect x="47.76" y="49.11" width="34.75" height="19.82" fill="white"/>
                            <rect x="30.74" y="57.27" width="85.53" height="58.99" fill="white"/>
                        </svg>
                    </div>
                </div>

                <!-- 登入選項 -->
                <div v-if="!authLoading" class="w-full max-w-[280px] space-y-4 animate-bounce-in">
                    <!-- Google 登入按鈕 -->
                    <Button
                        @click="handleGoogleSignIn"
                        :disabled="loading"
                        class="h-12 sm:h-14 md:h-[60px] w-full rounded-full bg-white text-[#31323E] border-2 border-gray-200 hover:bg-gray-50 hover:shadow-lg hover:-translate-y-1 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3"
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
                        <span class="text-base sm:text-lg font-medium">
                      {{ loading ? '登入中...' : '使用 Google 登入' }}
                    </span>
                    </Button>
                </div>

                <!-- 載入中狀態 -->
                <div v-else class="flex items-center justify-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { routes } from '@/routers/routes/index.ts'
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
import { supabase } from '@/lib/supabase'
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

/* 動畫定義 */
@keyframes float {
    0%, 100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-10px);
    }
}

@keyframes fade-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes fade-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes expand-u {
    from {
        transform: scaleY(0);
        opacity: 0;
    }
    to {
        transform: scaleY(1);
        opacity: 1;
    }
}

@keyframes slide-up {
    from {
        transform: translateY(50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

@keyframes bounce-in {
    0% {
        transform: scale(0.9);
        opacity: 0;
    }
    50% {
        transform: scale(1.05);
    }
    100% {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes text-glow {
    0%, 100% {
        text-shadow: 0 0 10px rgba(224, 216, 255, 0.5);
    }
    50% {
        text-shadow: 0 0 20px rgba(224, 216, 255, 0.8);
    }
}

/* 動畫類別 */
.animate-fade-in {
    animation: fade-in 1s ease-out forwards;
}

.animate-fade-in {
    animation: fade-in 0.6s ease-out forwards;
}

.animate-expand-u {
    animation: expand-u 0.8s ease-out 0.3s forwards;
    opacity: 0;
    transform-origin: center top;
}

.animate-slide-up {
    animation: slide-up 0.6s ease-out 0.3s forwards;
    opacity: 0;
}

.animate-bounce-in {
    animation: bounce-in 0.6s ease-out 0.6s forwards;
    opacity: 0;
}

.animate-text-glow {
    animation: text-glow 2s ease-in-out infinite;
}

/* 為貨幣圖標添加浮動動畫 */
.money-icon svg {
    animation: float 3s ease-in-out infinite;
    animation-delay: 0.5s;
}

/* 響應式設計 */
@media (max-width: 640px) {
    /* 手機版樣式調整 */
}
</style>
