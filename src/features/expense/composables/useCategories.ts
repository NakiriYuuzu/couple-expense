import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    Utensils,
    Cat,
    ShoppingBag,
    Car,
    Home,
    Package
} from 'lucide-vue-next'

// 類別 ID 類型
export type CategoryId = 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'

// 用於儲存的 icon 字串類型
export type IconKey = 'restaurant' | 'heart' | 'shopping' | 'car' | 'home' | 'package'

// 類別定義
export interface Category {
    id: CategoryId
    name: string
    icon: Component
    iconKey: IconKey
}

// Category ID 到 Icon Key 的映射（用於儲存到資料庫）
const categoryToIconKey: Record<CategoryId, IconKey> = {
    food: 'restaurant',
    pet: 'heart',
    shopping: 'shopping',
    transport: 'car',
    home: 'home',
    other: 'package'
}

// Icon Key 到 Lucide 元件的映射（用於顯示）
const iconKeyToComponent: Record<IconKey, Component> = {
    restaurant: Utensils,
    heart: Cat,
    shopping: ShoppingBag,
    car: Car,
    home: Home,
    package: Package
}

// Category ID 到 Lucide 元件的映射（直接使用）
const categoryToComponent: Record<CategoryId, Component> = {
    food: Utensils,
    pet: Cat,
    shopping: ShoppingBag,
    transport: Car,
    home: Home,
    other: Package
}

export function useCategories() {
    const { t } = useI18n()

    // 所有類別列表（含 i18n 名稱）
    const categories = computed<Category[]>(() => [
        { id: 'food', name: t('expense.categories.food'), icon: Utensils, iconKey: 'restaurant' },
        { id: 'pet', name: t('expense.categories.pet'), icon: Cat, iconKey: 'heart' },
        { id: 'shopping', name: t('expense.categories.shopping'), icon: ShoppingBag, iconKey: 'shopping' },
        { id: 'transport', name: t('expense.categories.transport'), icon: Car, iconKey: 'car' },
        { id: 'home', name: t('expense.categories.home'), icon: Home, iconKey: 'home' },
        { id: 'other', name: t('expense.categories.other'), icon: Package, iconKey: 'package' }
    ])

    // 根據 category ID 取得 icon 元件
    const getIconByCategory = (categoryId: string): Component => {
        return categoryToComponent[categoryId as CategoryId] || Package
    }

    // 根據 icon key 取得 icon 元件（用於從資料庫讀取後顯示）
    const getIconByKey = (iconKey: string): Component => {
        return iconKeyToComponent[iconKey as IconKey] || Package
    }

    // 根據 category ID 取得 icon key（用於儲存到資料庫）
    const getIconKey = (categoryId: string): IconKey => {
        return categoryToIconKey[categoryId as CategoryId] || 'package'
    }

    // 根據 category ID 取得類別名稱
    const getCategoryName = (categoryId: string): string => {
        const category = categories.value.find(c => c.id === categoryId)
        return category?.name || t('expense.categories.other')
    }

    // 根據 category ID 取得完整類別資訊
    const getCategoryById = (categoryId: string): Category | undefined => {
        return categories.value.find(c => c.id === categoryId)
    }

    // 所有類別 ID 列表
    const categoryIds: CategoryId[] = ['food', 'pet', 'shopping', 'transport', 'home', 'other']

    return {
        categories,
        categoryIds,
        getIconByCategory,
        getIconByKey,
        getIconKey,
        getCategoryName,
        getCategoryById
    }
}

// 靜態輔助函數（不需要 i18n 時使用）
export const CategoryUtils = {
    getIconByCategory: (categoryId: string): Component => {
        return categoryToComponent[categoryId as CategoryId] || Package
    },
    getIconByKey: (iconKey: string): Component => {
        return iconKeyToComponent[iconKey as IconKey] || Package
    },
    getIconKey: (categoryId: string): IconKey => {
        return categoryToIconKey[categoryId as CategoryId] || 'package'
    }
}
