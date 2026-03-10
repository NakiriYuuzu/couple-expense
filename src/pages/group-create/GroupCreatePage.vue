<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { toast } from 'vue-sonner'
import TopBar from '@/shared/components/TopBar.vue'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Spinner } from '@/shared/components/ui/spinner'
import { useGroupStore } from '@/features/group/stores/group'
import { routes } from '@/app/router/routes/index.ts'
import { Users, Hash } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const groupStore = useGroupStore()

interface CreateFormValues {
    name: string
    description: string
}

interface JoinFormValues {
    code: string
}

const createLoading = ref(false)
const joinLoading = ref(false)

const createFormSchema = toTypedSchema(z.object({
    name: z.string().trim().min(1, t('group.nameRequired')).max(50, t('group.nameTooLong')),
    description: z.string()
}))

const joinFormSchema = toTypedSchema(z.object({
    code: z.string().trim().min(1, t('group.codeRequired'))
}))

const createForm = useForm<CreateFormValues>({
    validationSchema: createFormSchema,
    initialValues: {
        name: '',
        description: ''
    }
})

const joinForm = useForm<JoinFormValues>({
    validationSchema: joinFormSchema,
    initialValues: {
        code: ''
    }
})

const [createName, createNameAttrs] = createForm.defineField('name')
const [createDescription, createDescriptionAttrs] = createForm.defineField('description')
const [joinCode, joinCodeAttrs] = joinForm.defineField('code')

const createNameError = computed(() => createForm.errors.value.name ?? '')
const joinCodeError = computed(() => joinForm.errors.value.code ?? '')
const createNameLength = computed(() => String(createName.value ?? '').length)

const handleCreate = createForm.handleSubmit(async (values) => {
    createLoading.value = true

    try {
        const groupId = await groupStore.createGroup(
            values.name,
            values.description.trim() || undefined
        )

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
})

const handleJoin = joinForm.handleSubmit(async (values) => {
    joinLoading.value = true

    try {
        await groupStore.joinGroupWithCode(values.code.toUpperCase())
        toast.success(t('group.joinSuccess'))
        router.push({ name: routes.dashboard.name })
    } catch (err) {
        const message = err instanceof Error ? err.message : t('common.error')
        toast.error(message)
    } finally {
        joinLoading.value = false
    }
})
</script>

<template>
    <div class="min-h-screen bg-background glass-page-bg">
        <TopBar
            :title="t('group.createOrJoin')"
            :show-back-button="true"
            @back="router.back()"
        />

        <main class="px-4 pb-28 pt-6">
            <Tabs default-value="create" class="w-full">
                <TabsList class="grid w-full grid-cols-2 mb-6 glass-light rounded-full p-1">
                    <TabsTrigger
                        value="create"
                        class="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all duration-200"
                    >
                        {{ t('group.createGroup') }}
                    </TabsTrigger>
                    <TabsTrigger
                        value="join"
                        class="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all duration-200"
                    >
                        {{ t('group.joinGroup') }}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="create">
                    <div class="glass-elevated rounded-2xl p-6">
                        <form class="space-y-5" @submit="handleCreate">
                            <div class="flex justify-center mb-2">
                                <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
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

                            <div class="space-y-2">
                                <Label for="group-name">
                                    {{ t('group.groupName') }}
                                    <span class="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="group-name"
                                    v-model="createName"
                                    v-bind="createNameAttrs"
                                    :placeholder="t('group.groupNamePlaceholder')"
                                    maxlength="50"
                                    :class="createNameError ? 'border-destructive' : ''"
                                />
                                <div class="flex justify-between items-center">
                                    <p v-if="createNameError" class="text-xs text-destructive">
                                        {{ createNameError }}
                                    </p>
                                    <span v-else class="flex-1" />
                                    <span class="text-xs text-muted-foreground">
                                        {{ createNameLength }}/50
                                    </span>
                                </div>
                            </div>

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
                                    v-bind="createDescriptionAttrs"
                                    :placeholder="t('group.groupDescriptionPlaceholder')"
                                    rows="3"
                                    class="resize-none"
                                />
                            </div>

                            <Button
                                type="submit"
                                class="w-full bg-brand-primary hover:bg-brand-primary/90 text-primary-foreground"
                                :disabled="createLoading"
                            >
                                <Spinner v-if="createLoading" class="mr-2 h-4 w-4" />
                                {{ t('group.createGroup') }}
                            </Button>
                        </form>
                    </div>
                </TabsContent>

                <TabsContent value="join">
                    <div class="glass-elevated rounded-2xl p-6">
                        <form class="space-y-5" @submit="handleJoin">
                            <div class="flex justify-center mb-2">
                                <div class="flex h-16 w-16 items-center justify-center rounded-2xl glass-light">
                                    <Hash class="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
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

                            <div class="space-y-2">
                                <Label for="join-code">
                                    {{ t('group.invitationCode') }}
                                    <span class="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="join-code"
                                    v-model="joinCode"
                                    v-bind="joinCodeAttrs"
                                    :placeholder="t('group.invitationCodePlaceholder')"
                                    class="font-mono text-2xl tracking-[0.5em] text-center uppercase h-14 border-2"
                                    :class="joinCodeError ? 'border-destructive' : ''"
                                    autocomplete="off"
                                    autocorrect="off"
                                    autocapitalize="characters"
                                    spellcheck="false"
                                />
                                <p v-if="joinCodeError" class="text-xs text-destructive">
                                    {{ joinCodeError }}
                                </p>
                                <p v-else class="text-xs text-muted-foreground">
                                    {{ t('group.invitationCodeHint') }}
                                </p>
                            </div>

                            <Button
                                type="submit"
                                class="w-full bg-brand-primary hover:bg-brand-primary/90 text-primary-foreground"
                                :disabled="joinLoading"
                            >
                                <Spinner v-if="joinLoading" class="mr-2 h-4 w-4" />
                                {{ t('group.joinGroup') }}
                            </Button>
                        </form>
                    </div>
                </TabsContent>
            </Tabs>
        </main>
    </div>
</template>
