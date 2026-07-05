import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Hash, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCreateGroup, useJoinGroup } from '@/features/group/api/useGroupMutations'

export default function GroupCreatePage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const createGroup = useCreateGroup()
    const joinGroup = useJoinGroup()
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [code, setCode] = useState('')
    const [createError, setCreateError] = useState('')
    const [joinError, setJoinError] = useState('')

    const handleCreate = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault()
        const trimmedName = name.trim()
        const trimmedDescription = description.trim()

        if (!trimmedName) {
            setCreateError(t('group.nameRequired'))
            return
        }
        if (trimmedName.length > 50) {
            setCreateError(t('group.nameTooLong'))
            return
        }

        setCreateError('')
        try {
            const groupId = await createGroup.mutateAsync({
                name: trimmedName,
                description: trimmedDescription || undefined
            })
            toast.success(t('group.createSuccessNoCode'))
            void navigate({ to: '/groups/$id', params: { id: groupId } })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('group.createError'))
        }
    }

    const handleJoin = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault()
        const invitationCode = code.trim().toUpperCase()

        if (!invitationCode) {
            setJoinError(t('group.codeRequired'))
            return
        }

        setJoinError('')
        try {
            await joinGroup.mutateAsync(invitationCode)
            toast.success(t('group.joinSuccess'))
            void navigate({ to: '/dashboard' })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('group.joinError'))
        }
    }

    return (
        <main className="px-4 pt-6 pb-28">
            <Tabs defaultValue="create" className="w-full">
                <TabsList className="glass-light mb-6 grid w-full grid-cols-2 rounded-full p-1">
                    <TabsTrigger
                        value="create"
                        className="rounded-full transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                    >
                        {t('group.createGroup')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="join"
                        className="rounded-full transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                    >
                        {t('group.joinGroup')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="create">
                    <section className="glass-elevated rounded-2xl p-6">
                        <form className="space-y-5" onSubmit={handleCreate}>
                            <div className="mb-2 flex justify-center">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                                    <Users className="h-8 w-8 text-brand-primary" />
                                </div>
                            </div>

                            <div className="mb-4 space-y-1 text-center">
                                <h2 className="text-lg font-semibold text-foreground">{t('group.createGroupTitle')}</h2>
                                <p className="text-sm text-muted-foreground">{t('group.createGroupDesc')}</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="group-name">
                                    {t('group.groupName')}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="group-name"
                                    value={name}
                                    maxLength={50}
                                    aria-invalid={!!createError}
                                    placeholder={t('group.groupNamePlaceholder')}
                                    onChange={(event) => {
                                        setName(event.target.value)
                                        if (createError) setCreateError('')
                                    }}
                                />
                                <div className="flex items-center justify-between">
                                    {createError ? (
                                        <p className="text-xs text-destructive">{createError}</p>
                                    ) : (
                                        <span />
                                    )}
                                    <span className="text-xs text-muted-foreground">{name.length}/50</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="group-description">
                                    {t('group.groupDescription')}
                                    <span className="ml-1 text-xs text-muted-foreground">({t('common.optional')})</span>
                                </Label>
                                <textarea
                                    id="group-description"
                                    value={description}
                                    rows={3}
                                    className="min-h-20 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    placeholder={t('group.groupDescriptionPlaceholder')}
                                    onChange={(event) => setDescription(event.target.value)}
                                />
                            </div>

                            <Button
                                type="submit"
                                className="press-feedback w-full bg-brand-primary text-primary-foreground hover:bg-brand-primary/90"
                                disabled={createGroup.isPending}
                            >
                                {createGroup.isPending ? t('common.processing') : t('group.createGroup')}
                            </Button>
                        </form>
                    </section>
                </TabsContent>

                <TabsContent value="join">
                    <section className="glass-elevated rounded-2xl p-6">
                        <form className="space-y-5" onSubmit={handleJoin}>
                            <div className="mb-2 flex justify-center">
                                <div className="glass-light flex h-16 w-16 items-center justify-center rounded-2xl">
                                    <Hash className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                                </div>
                            </div>

                            <div className="mb-4 space-y-1 text-center">
                                <h2 className="text-lg font-semibold text-foreground">{t('group.joinGroupTitle')}</h2>
                                <p className="text-sm text-muted-foreground">{t('group.joinGroupDesc')}</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="join-code">
                                    {t('group.invitationCode')}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="join-code"
                                    value={code}
                                    aria-invalid={!!joinError}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    className="h-14 border-2 text-center font-mono text-2xl tracking-[0.5em] uppercase"
                                    placeholder={t('group.invitationCodePlaceholder')}
                                    onChange={(event) => {
                                        setCode(event.target.value)
                                        if (joinError) setJoinError('')
                                    }}
                                />
                                {joinError ? (
                                    <p className="text-xs text-destructive">{joinError}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">{t('group.invitationCodeHint')}</p>
                                )}
                            </div>

                            <Button
                                type="submit"
                                className="press-feedback w-full bg-brand-primary text-primary-foreground hover:bg-brand-primary/90"
                                disabled={joinGroup.isPending}
                            >
                                {joinGroup.isPending ? t('common.processing') : t('group.joinGroup')}
                            </Button>
                        </form>
                    </section>
                </TabsContent>
            </Tabs>
        </main>
    )
}
