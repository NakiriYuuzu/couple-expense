import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Tracks scroll direction to auto-hide/show the floating navigation bar.
 * Returns isNavHidden: true when scrolling down, false when scrolling up.
 */
export function useScrollDirection(threshold = 5) {
    const isNavHidden = ref(false)
    let lastScrollY = 0
    let ticking = false

    const onScroll = () => {
        if (ticking) return
        ticking = true

        requestAnimationFrame(() => {
            const currentScrollY = window.scrollY
            const delta = currentScrollY - lastScrollY

            if (delta > threshold && currentScrollY > 60) {
                isNavHidden.value = true
            } else if (delta < -3) {
                isNavHidden.value = false
            }

            lastScrollY = currentScrollY
            ticking = false
        })
    }

    onMounted(() => {
        window.addEventListener('scroll', onScroll, { passive: true })
    })

    onUnmounted(() => {
        window.removeEventListener('scroll', onScroll)
    })

    return { isNavHidden }
}
