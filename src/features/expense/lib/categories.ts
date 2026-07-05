import { Utensils, Cat, ShoppingBag, Car, Home, Package } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CategoryId } from '@/entities/expense/types'

// 類別常數層（Phase 4）：自 Vue useCategories.ts 移植的「純常數」部分，去掉 i18n（名稱由頁面
// 在 Phase 5 以 t('expense.categories.*') 補上）。icon 換成 lucide-react 元件。

// 資料庫儲存用的 icon 字串
export type IconKey = 'restaurant' | 'heart' | 'shopping' | 'car' | 'home' | 'package'

export const categoryIds: readonly CategoryId[] = ['food', 'pet', 'shopping', 'transport', 'home', 'other']

const categoryToIconKey: Record<CategoryId, IconKey> = {
    food: 'restaurant',
    pet: 'heart',
    shopping: 'shopping',
    transport: 'car',
    home: 'home',
    other: 'package'
}

const iconKeyToComponent: Record<IconKey, LucideIcon> = {
    restaurant: Utensils,
    heart: Cat,
    shopping: ShoppingBag,
    car: Car,
    home: Home,
    package: Package
}

const categoryToComponent: Record<CategoryId, LucideIcon> = {
    food: Utensils,
    pet: Cat,
    shopping: ShoppingBag,
    transport: Car,
    home: Home,
    other: Package
}

// 類別顏色映射 — Single Source of Truth（CSS variable tokens，對齊設計系統）
export const categoryColors: Record<CategoryId, {
    color: string
    bg: string
    tailwind: { bg: string; text: string }
}> = {
    food: { color: 'var(--category-food)', bg: 'var(--category-food-bg)', tailwind: { bg: 'bg-category-food-bg', text: 'text-category-food' } },
    pet: { color: 'var(--category-pet)', bg: 'var(--category-pet-bg)', tailwind: { bg: 'bg-category-pet-bg', text: 'text-category-pet' } },
    shopping: { color: 'var(--category-shopping)', bg: 'var(--category-shopping-bg)', tailwind: { bg: 'bg-category-shopping-bg', text: 'text-category-shopping' } },
    transport: { color: 'var(--category-transport)', bg: 'var(--category-transport-bg)', tailwind: { bg: 'bg-category-transport-bg', text: 'text-category-transport' } },
    home: { color: 'var(--category-home)', bg: 'var(--category-home-bg)', tailwind: { bg: 'bg-category-home-bg', text: 'text-category-home' } },
    other: { color: 'var(--category-other)', bg: 'var(--category-other-bg)', tailwind: { bg: 'bg-category-other-bg', text: 'text-category-other' } }
}

const defaultTailwind = { bg: 'bg-category-other-bg', text: 'text-category-other' }

// 靜態輔助（不需 i18n 時使用；對齊 Vue CategoryUtils）
export const CategoryUtils = {
    getIconByCategory: (categoryId: string): LucideIcon =>
        categoryToComponent[categoryId as CategoryId] ?? Package,
    getIconByKey: (iconKey: string): LucideIcon =>
        iconKeyToComponent[iconKey as IconKey] ?? Package,
    getIconKey: (categoryId: string): IconKey =>
        categoryToIconKey[categoryId as CategoryId] ?? 'package',
    getCategoryColor: (id: string): string =>
        categoryColors[id as CategoryId]?.color ?? 'var(--category-other)',
    getCategoryBgColor: (id: string): string =>
        categoryColors[id as CategoryId]?.bg ?? 'var(--category-other-bg)',
    getCategoryTailwindClasses: (id: string): { bg: string; text: string } =>
        categoryColors[id as CategoryId]?.tailwind ?? defaultTailwind
}
