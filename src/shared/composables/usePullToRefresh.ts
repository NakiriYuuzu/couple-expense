import { onMounted, onUnmounted, nextTick } from 'vue'
import PullToRefresh, { type PullToRefreshInstance } from 'pulltorefreshjs'

export function usePullToRefresh(options: {
    onRefresh: () => Promise<void>
    selector?: string
    disabled?: boolean
    mainElement?: string
}) {
    const { onRefresh, selector, disabled = false, mainElement } = options
    
    let instance: PullToRefreshInstance | null = null
    
    onMounted(async () => {
        if (disabled) return
        
        // 等待 DOM 更新
        await nextTick()
        
        // 確定要使用的主元素
        // 如果有 mainElement，使用它；如果有 selector，查找該元素；否則使用 body
        let targetElement = 'body'
        
        if (mainElement) {
            targetElement = mainElement
        } else if (selector) {
            // 檢查 selector 元素是否存在
            const element = document.querySelector(selector)
            if (element) {
                targetElement = selector
            }
        }
        
        // 初始化 PullToRefresh
        instance = PullToRefresh.init({
            mainElement: targetElement,
            onRefresh: async () => {
                try {
                    await onRefresh()
                } catch (error) {
                    console.error('Refresh failed:', error)
                }
            },
            // 自定義選項
            distThreshold: 60, // 觸發刷新的下拉距離
            distMax: 80, // 最大下拉距離
            distReload: 50, // 刷新時保持的距離
            distIgnore: 10, // 開始追踪的最小距離，避免誤觸
            resistanceFunction: (t: number) => Math.min(1, t / 2.5), // 阻力函數
            // 樣式相關
            iconArrow: '&#8675;', // 下箭頭
            iconRefreshing: '&hellip;', // 刷新中的圖標
            instructionsPullToRefresh: '下拉刷新',
            instructionsReleaseToRefresh: '鬆開刷新',
            instructionsRefreshing: '正在刷新...',
            // 支持所有方向的滾動容器
            shouldPullToRefresh: function() {
                // 檢查頁面或主元素是否在頂部
                const el = document.querySelector(targetElement)
                
                // 如果是 body，檢查 window 滾動
                if (targetElement === 'body' || !el) {
                    // 只有在頁面完全在頂部時才允許下拉刷新
                    return window.scrollY === 0
                }
                
                // 否則檢查元素本身的滾動
                return el.scrollTop === 0
            },
            // 獲取觸發器元素，考慮 sticky 元素
            getMarkup: function() {
                return '\
                <div class="__PREFIX__box" style="pointer-events: none;">\
                    <div class="__PREFIX__content">\
                        <div class="__PREFIX__icon"></div>\
                        <div class="__PREFIX__text"></div>\
                    </div>\
                </div>'
            },
            // 自定義插入位置，確保在正確的容器內
            classPrefix: 'ptr--',
            cssProp: 'min-height',
            // 確保 pulltorefresh 容器在正確的位置
            getStyles: function() {
                return '\
                .__PREFIX__ptr {\
                    pointer-events: none;\
                    font-size: 0.85em;\
                    font-weight: bold;\
                    top: 0;\
                    height: 0;\
                    transition: height 0.3s, min-height 0.3s;\
                    text-align: center;\
                    width: 100%;\
                    overflow: hidden;\
                    display: flex;\
                    align-items: flex-end;\
                    align-content: stretch;\
                }\
                .__PREFIX__box {\
                    padding: 10px;\
                    flex-basis: 100%;\
                }\
                .__PREFIX__pull {\
                    transition: none;\
                }\
                .__PREFIX__text {\
                    margin-top: .33em;\
                    color: var(--brand-primary);\
                }\
                .__PREFIX__icon {\
                    color: var(--brand-primary);\
                    transition: transform .3s;\
                }\
                .__PREFIX__top {\
                    touch-action: pan-y;\
                }\
                .__PREFIX__release .__PREFIX__icon {\
                    transform: rotate(180deg);\
                }\
                '
            }
        })
    })
    
    onUnmounted(() => {
        // 清理
        if (instance) {
            instance.destroy()
            instance = null
        }
    })
    
    return {
        destroy: () => {
            if (instance) {
                instance.destroy()
                instance = null
            }
        }
    }
}