/**
 * Category Icon Mapping
 *
 * 統一管理所有類別的圖示映射，確保整個應用程式的一致性
 */

import {
    Utensils,
    Cat,
    ShoppingBag,
    Car,
    Home,
    Package
} from 'lucide-vue-next'
import type { Component } from 'vue'

/**
 * Icon key 到 Lucide 組件的映射
 */
export const CATEGORY_ICON_MAP: Record<string, Component> = {
    restaurant: Utensils,  // food category
    heart: Cat,            // pet category
    shopping: ShoppingBag, // shopping category
    transport: Car,        // transport category
    home: Home,            // home category
    package: Package       // other category
} as const

/**
 * Category ID 到 icon key 的映射
 * 用於從 category 轉換為對應的 icon key
 */
export const CATEGORY_TO_ICON_KEY: Record<string, string> = {
    food: 'restaurant',
    pet: 'heart',
    shopping: 'shopping',
    transport: 'transport',
    home: 'home',
    other: 'package'
} as const

/**
 * Category 類型定義
 */
export type CategoryId = 'food' | 'pet' | 'shopping' | 'transport' | 'home' | 'other'
export type IconKey = 'restaurant' | 'heart' | 'shopping' | 'transport' | 'home' | 'package'

/**
 * 獲取類別對應的 icon 組件
 */
export function getCategoryIcon(categoryId: string): Component {
    const iconKey = CATEGORY_TO_ICON_KEY[categoryId]
    return CATEGORY_ICON_MAP[iconKey] || Package
}

/**
 * 獲取類別對應的 icon key
 */
export function getCategoryIconKey(categoryId: string): string {
    return CATEGORY_TO_ICON_KEY[categoryId] || 'package'
}
