// Pin DMs' sheets: the "Pin DM" sheet (from a DM's long-press menu) and the category editor
// (create / edit). Mobile take on PinDMs' context menus and category modal.

import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import { findAssetId } from "@/lib/assets";
import { findByProps } from "@/metro";
import { ActionSheet, Button, Stack, TableRow, TableRowGroup, Text, TextInput } from "@/ui/components";

import {
    addToCategory,
    canMoveCategory,
    canMoveChannel,
    categories,
    categoryOf,
    createCategory,
    deleteCategory,
    editCategory,
    getCategory,
    moveCategory,
    moveChannel,
    removeFromCategory,
} from "./data";
import { DEFAULT_COLOR, hex, settings, SWATCHES } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;
const sheets = () => findByProps("openLazy", "hideActionSheet");
const hide = () => sheets()?.hideActionSheet?.();

function open(key: string, Component: React.ComponentType<any>, props: object) {
    sheets()?.openLazy?.(Promise.resolve({ default: Component }), key, props);
}

const Dot = ({ color, size = 14 }: { color: number; size?: number }) => (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hex(color) }} />
);

function PinSheet({ channelId }: { channelId: string }) {
    const current = categoryOf(channelId);
    const custom = settings.pinOrder === "custom";
    const act = (fn: () => void) => () => {
        fn();
        hide();
    };

    return (
        <ActionSheet>
            <ScrollView style={{ maxHeight: 520 }}>
                <Stack spacing={16} style={{ paddingBottom: 16 }}>
                    <Text variant="heading-lg/bold" style={{ textAlign: "center" }}>{current ? "Pinned DM" : "Pin DM"}</Text>
                    {current ? (
                        <TableRowGroup>
                            <TableRow label="Unpin" icon={<Icon name="PinIcon" />} onPress={act(() => removeFromCategory(channelId))} />
                            {custom && canMoveChannel(channelId, -1) ? <TableRow label="Move up" icon={<Icon name="ArrowSmallUpIcon" />} onPress={act(() => moveChannel(channelId, -1))} /> : null}
                            {custom && canMoveChannel(channelId, 1) ? <TableRow label="Move down" icon={<Icon name="ArrowSmallDownIcon" />} onPress={act(() => moveChannel(channelId, 1))} /> : null}
                        </TableRowGroup>
                    ) : null}
                    <TableRowGroup title={current ? "Move to category" : "Pin to category"}>
                        {categories().map(category => (
                            <TableRow
                                key={category.id}
                                label={category.name}
                                icon={<Dot color={category.color} />}
                                trailing={current?.id === category.id ? <Icon name="CheckmarkLargeIcon" /> : undefined}
                                onPress={act(() => addToCategory(channelId, category.id))}
                            />
                        ))}
                        <TableRow
                            label="New category"
                            icon={<Icon name="PlusSmallIcon" />}
                            arrow
                            onPress={() => {
                                hide();
                                setTimeout(() => openCategoryEditor({ channelId }), 350);
                            }}
                        />
                    </TableRowGroup>
                </Stack>
            </ScrollView>
        </ActionSheet>
    );
}

function CategoryEditor({ categoryId, channelId }: { categoryId?: string; channelId?: string }) {
    const existing = categoryId ? getCategory(categoryId) : undefined;
    const [name, setName] = useState(existing?.name ?? "");
    const [color, setColor] = useState(existing?.color ?? SWATCHES[0] ?? DEFAULT_COLOR);

    const save = () => {
        const trimmed = name.trim();
        if (!trimmed) return Alert.alert("Category name", "Give the category a name.");
        if (existing) editCategory(existing.id, { name: trimmed, color });
        else createCategory(trimmed, color, channelId);
        hide();
    };

    return (
        <ActionSheet>
            <Stack spacing={16} style={{ paddingBottom: 16 }}>
                <Text variant="heading-lg/bold" style={{ textAlign: "center" }}>{existing ? "Edit category" : "New category"}</Text>
                <TextInput label="Name" placeholder="Category name" defaultValue={name} onChange={(value: string) => setName(value)} isClearable autoFocus={!existing} />
                <Text variant="text-sm/semibold" color="text-muted">Colour</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                    {SWATCHES.map(swatch => (
                        <Pressable
                            key={swatch}
                            accessibilityRole="button"
                            accessibilityLabel={`Colour ${hex(swatch)}`}
                            accessibilityState={{ selected: swatch === color }}
                            onPress={() => setColor(swatch)}
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 17,
                                backgroundColor: hex(swatch),
                                borderWidth: swatch === color ? 3 : 0,
                                borderColor: "#ffffff",
                            }}
                        />
                    ))}
                </View>
                <Button text={existing ? "Save" : "Create and pin"} variant="primary" size="lg" onPress={save} />
            </Stack>
        </ActionSheet>
    );
}

export const openPinSheet = (channelId: string) => open("DistraPinDmsPin", PinSheet, { channelId });
export const openCategoryEditor = (props: { categoryId?: string; channelId?: string }) => open("DistraPinDmsCategory", CategoryEditor, props);

/** Long-press on a category header. */
export function openCategoryActions(categoryId: string) {
    const category = getCategory(categoryId);
    if (!category) return;
    Alert.alert(category.name, `${category.channels.length} pinned DM${category.channels.length === 1 ? "" : "s"}`, [
        { text: "Edit", onPress: () => openCategoryEditor({ categoryId }) },
        ...(canMoveCategory(categoryId, -1) ? [{ text: "Move up", onPress: () => moveCategory(categoryId, -1) }] : []),
        ...(canMoveCategory(categoryId, 1) ? [{ text: "Move down", onPress: () => moveCategory(categoryId, 1) }] : []),
        { text: "Delete", style: "destructive" as const, onPress: () => deleteCategory(categoryId) },
        { text: "Cancel", style: "cancel" as const },
    ]);
}
