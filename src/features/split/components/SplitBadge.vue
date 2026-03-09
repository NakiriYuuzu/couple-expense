<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/shared/components/ui/badge'
import type { SplitMethod } from '@/shared/lib/database.types'

interface Props {
    method?: SplitMethod | null
}

const props = defineProps<Props>()

const { t } = useI18n()

const methodLabel = computed(() => {
    switch (props.method) {
        case 'equal':
            return t('split.methods.equal', '均分')
        case 'exact':
            return t('split.methods.exact', '指定')
        case 'percentage':
            return t('split.methods.percentage', '比例')
        case 'shares':
            return t('split.methods.shares', '份數')
        default:
            return null
    }
})
</script>

<template>
    <Badge
        v-if="method && methodLabel"
        variant="secondary"
        class="text-[10px] px-1.5 py-0"
    >
        {{ methodLabel }}
    </Badge>
</template>
