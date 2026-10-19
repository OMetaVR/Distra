// Pinned DMs and their categories, for the signed-in account. Ported from Vencord/Equicord's PinDMs
// (data.ts, GPL-3.0-or-later, by Vendicated and contributors).

import { findByStoreName } from "@/metro";

import { type Category, settings } from "./settings";

const UserStore = findByStoreName("UserStore");
const PrivateChannelSortStore = findByStoreName("PrivateChannelSortStore");

const listeners = new Set<() => void>();
/** Re-renders the DM list (and anything else showing pins) after a change. */
export const onPinsChanged = (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener));
const changed = () => listeners.forEach(listener => listener());

/** The current account's categories (created on first use). */
export function categories(): Category[] {
    const userId = UserStore?.getCurrentUser?.()?.id;
    if (!userId) return [];
    return settings.categories[userId] ??= [];
}

export const getCategory = (id: string) => categories().find(category => category.id === id);
export const categoryOf = (channelId: string) => categories().find(category => category.channels.includes(channelId));
export const isPinned = (channelId: string) => categoryOf(channelId) != null;

export function createCategory(name: string, color: number, channelId?: string) {
    const category: Category = { id: Math.random().toString(36).slice(2, 10), name, color, channels: channelId ? [channelId] : [] };
    if (channelId) removeFromCategory(channelId);
    categories().push(category);
    changed();
    return category;
}

export function editCategory(id: string, patch: Partial<Pick<Category, "name" | "color">>) {
    const category = getCategory(id);
    if (!category) return;
    Object.assign(category, patch);
    changed();
}

export function deleteCategory(id: string) {
    const list = categories();
    const index = list.findIndex(category => category.id === id);
    if (index !== -1) list.splice(index, 1);
    changed();
}

export function addToCategory(channelId: string, categoryId: string) {
    const category = getCategory(categoryId);
    if (!category || category.channels.includes(channelId)) return;
    removeFromCategory(channelId, false);
    category.channels.push(channelId);
    changed();
}

export function removeFromCategory(channelId: string, notify = true) {
    const category = categoryOf(channelId);
    if (!category) return;
    category.channels = category.channels.filter(id => id !== channelId);
    if (notify) changed();
}

export function setCollapsed(id: string, collapsed: boolean) {
    const category = getCategory(id);
    if (!category) return;
    category.collapsed = collapsed;
    changed();
}

export function setDmSectionCollapsed(collapsed: boolean) {
    settings.dmSectionCollapsed = collapsed;
    changed();
}

/** A category's channels in display order (latest message first, unless custom order is on). */
export function channelsOf(category: Category): string[] {
    if (settings.pinOrder !== "recent" || category.channels.length < 2) return category.channels;
    const sorted: string[] = PrivateChannelSortStore?.getPrivateChannelIds?.() ?? [];
    const order = new Map(sorted.map((id, index) => [id, index]));
    return [...category.channels].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
}

// Reordering (custom order)
const swap = (array: unknown[], a: number, b: number) => {
    if (a < 0 || b < 0 || a >= array.length || b >= array.length) return false;
    [array[a], array[b]] = [array[b], array[a]];
    return true;
};

export const canMoveCategory = (id: string, direction: -1 | 1) => {
    const index = categories().findIndex(category => category.id === id);
    return index !== -1 && categories()[index + direction] != null;
};

export function moveCategory(id: string, direction: -1 | 1) {
    const list = categories();
    const index = list.findIndex(category => category.id === id);
    if (swap(list, index, index + direction)) changed();
}

export const canMoveChannel = (channelId: string, direction: -1 | 1) => {
    const category = categoryOf(channelId);
    if (!category) return false;
    return category.channels[category.channels.indexOf(channelId) + direction] != null;
};

export function moveChannel(channelId: string, direction: -1 | 1) {
    const category = categoryOf(channelId);
    if (!category) return;
    const index = category.channels.indexOf(channelId);
    if (swap(category.channels, index, index + direction)) changed();
}
