<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Copy, Check } from 'lucide-vue-next'

const { t } = useI18n()

interface Props {
    invitationCode: string
}

const props = defineProps<Props>()

const copied = ref(false)

const copyCode = async () => {
    try {
        await navigator.clipboard.writeText(props.invitationCode)
        copied.value = true
        toast.success(t('group.copySuccess'))
        setTimeout(() => { copied.value = false }, 2000)
    } catch {
        toast.error(t('group.copyError'))
    }
}
</script>

<template>
    <div class="space-y-2">
        <label class="text-sm font-medium text-foreground">{{ t('group.invitationCode') }}</label>
        <div class="flex items-center gap-2">
            <Input
                :model-value="invitationCode"
                readonly
                class="font-mono text-lg tracking-widest text-center"
            />
            <Button variant="outline" size="icon" @click="copyCode">
                <component :is="copied ? Check : Copy" class="h-4 w-4" />
            </Button>
        </div>
        <p class="text-xs text-muted-foreground">{{ t('group.shareCode') }}</p>
    </div>
</template>
