<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TopBar from '@/shared/components/TopBar.vue'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Card } from '@/shared/components/ui/card'
import { Spinner } from '@/shared/components/ui/spinner'
import { useGroupStore } from '@/features/group/stores/group'
import { routes } from '@/app/router/routes/index.ts'
import { Users, Hash } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const groupStore = useGroupStore()

// Create tab state
const createName = ref('')
const createDescription = ref('')
const createLoading = ref(false)
const createNameError = ref('')

// Join tab state
const joinCode = ref('')
const joinLoading = ref(false)
const joinCodeError = ref('')

const validateCreateForm = () => {
    createNameError.value = ''
    if (!createName.value.trim()) {
        createNameError.value = t('group.nameRequired')
        return false
    }
    if (createName.value.trim().length > 50) {
        createNameError.value = t('group.nameTooLong')
        return false
    }
    return true
}

const validateJoinForm = () => {
    joinCodeError.value = ''
    if (!joinCode.value.trim()) {
        joinCodeError.value = t('group.codeRequired')
        return false
    }
    return true
}

const handleCreate = async () => {
    if (!validateCreateForm()) return

    createLoading.value = true
    try {
        const groupId = await groupStore.createGroup(
            createName.value.trim(),
            createDescription.value.trim() || undefined
        )

        // Fetch the newly created group to get its invitation code
        const newGroup = groupStore.groups.find(g => g.id === groupId)
        const invCode = newGroup?.invitation_code ?? ''

        if (invCode) {
            toast.success(t('group.createSuccess', { code: invCode }))
        } else {
            toast.success(t('group.createSuccessNoCode'))
        }

        router.push({ name: routes.groupSettings.name, params: { id: groupId } })
    } catch (err) {
        const message = err instanceof Error ? err.message : t('common.error')
        toast.error(message)
    } finally {
        createLoading.value = false
    }
}

const handleJoin = async () => {
    if (!validateJoinForm()) return

    joinLoading.value = true
    try {
        await groupStore.joinGroupWithCode(joinCode.value.trim().toUpperCase())
        toast.success(t('group.joinSuccess'))
        router.push({ name: routes.dashboard.name })
    } catch (err) {
        const message = err instanceof Error ? err.message : t('common.error')
        toast.error(message)
    } finally {
        joinLoading.value = false
    }
}
</script>

<template>
    <div class="min-h-screen bg-background">
        <TopBar
            :title="t('group.createOrJoin')"
            :show-back-button="true"
            @back="router.back()"
        />

        <main class="px-4 pb-24 pt-6">
            <Tabs default-value="create" class="w-full">
                <TabsList class="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="create">
                        {{ t('group.createGroup') }}
                    </TabsTrigger>
                    <TabsTrigger value="join">
                        {{ t('group.joinGroup') }}
                    </TabsTrigger>
                </TabsList>

                <!-- Create tab -->
                <TabsContent value="create">
                    <Card class="p-6">
                        <div class="space-y-5">
                            <!-- Icon illustration -->
                            <div class="flex justify-center mb-2">
                                <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-accent">
                                    <Users class="h-8 w-8 text-brand-primary" />
                                </div>
                            </div>

                            <div class="text-center space-y-1 mb-4">
                                <h2 class="text-lg font-semibold text-foreground">
                                    {{ t('group.createGroupTitle') }}
                                </h2>
                                <p class="text-sm text-muted-foreground">
                                    {{ t('group.createGroupDesc') }}
                                </p>
                            </div>

                            <!-- Group name -->
                            <div class="space-y-2">
                                <Label for="group-name">
                                    {{ t('group.groupName') }}
                                    <span class="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="group-name"
                                    v-model="createName"
                                    :placeholder="t('group.groupNamePlaceholder')"
                                    maxlength="50"
                                    :class="createNameError ? 'border-destructive' : ''"
                                    @input="createNameError = ''"
                                />
                                <div class="flex justify-between items-center">
                                    <p v-if="createNameError" class="text-xs text-destructive">
                                        {{ createNameError }}
                                    </p>
                                    <span v-else class="flex-1" />
                                    <span class="text-xs text-muted-foreground">
                                        {{ createName.length }}/50
                                    </span>
                                </div>
                            </div>

                            <!-- Description -->
                            <div class="space-y-2">
                                <Label for="group-description">
                                    {{ t('group.groupDescription') }}
                                    <span class="text-xs text-muted-foreground ml-1">
                                        ({{ t('common.optional') }})
                                    </span>
                                </Label>
                                <Textarea
                                    id="group-description"
                                    v-model="createDescription"
                                    :placeholder="t('group.groupDescriptionPlaceholder')"
                                    rows="3"
                                    class="resize-none"
                                />
                            </div>

                            <!-- Submit -->
                            <Button
                                class="w-full bg-brand-primary hover:bg-brand-primary/90 text-primary-foreground"
                                :disabled="createLoading"
                                @click="handleCreate"
                            >
                                <Spinner v-if="createLoading" class="mr-2 h-4 w-4" />
                                {{ t('group.createGroup') }}
                            </Button>
                        </div>
                    </Card>
                </TabsContent>

                <!-- Join tab -->
                <TabsContent value="join">
                    <Card class="p-6">
                        <div class="space-y-5">
                            <!-- Icon illustration -->
                            <div class="flex justify-center mb-2">
                                <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-accent">
                                    <Hash class="h-8 w-8 text-brand-primary" />
                                </div>
                            </div>

                            <div class="text-center space-y-1 mb-4">
                                <h2 class="text-lg font-semibold text-foreground">
                                    {{ t('group.joinGroupTitle') }}
                                </h2>
                                <p class="text-sm text-muted-foreground">
                                    {{ t('group.joinGroupDesc') }}
                                </p>
                            </div>

                            <!-- Invitation code input -->
                            <div class="space-y-2">
                                <Label for="join-code">
                                    {{ t('group.invitationCode') }}
                                    <span class="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="join-code"
                                    v-model="joinCode"
                                    :placeholder="t('group.invitationCodePlaceholder')"
                                    class="font-mono text-lg tracking-widest text-center uppercase"
                                    :class="joinCodeError ? 'border-destructive' : ''"
                                    autocomplete="off"
                                    autocorrect="off"
                                    autocapitalize="characters"
                                    spellcheck="false"
                                    @input="joinCodeError = ''"
                                />
                                <p v-if="joinCodeError" class="text-xs text-destructive">
                                    {{ joinCodeError }}
                                </p>
                                <p v-else class="text-xs text-muted-foreground">
                                    {{ t('group.invitationCodeHint') }}
                                </p>
                            </div>

                            <!-- Submit -->
                            <Button
                                class="w-full bg-brand-primary hover:bg-brand-primary/90 text-primary-foreground"
                                :disabled="joinLoading"
                                @click="handleJoin"
                            >
                                <Spinner v-if="joinLoading" class="mr-2 h-4 w-4" />
                                {{ t('group.joinGroup') }}
                            </Button>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>
        </main>
    </div>
</template>
