// The folder icon editor: an image URL or a picture from Photos, its size, and a preview.

import { useState } from "react";
import { ScrollView, View } from "react-native";

import { findAssetId } from "@/lib/assets";
import { Logger } from "@/lib/logger";
import { findByProps } from "@/metro";
import { ActionSheet, Button, Stack, TableRow, TableRowGroup, Text, TextInput } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { getFolder, getIcon, resetIcon, setIcon } from "./data";
import { CustomIcon } from "./FolderIconView";
import { SIZES } from "./settings";

const logger = new Logger("CustomFolderIcons");
const sheets = () => findByProps("openLazy", "hideActionSheet");
const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

/** Picked pictures are cropped square to this many pixels (a folder tile is 48pt, 144px at 3x). */
const PICKED_SIZE = 192;

/** Discord's own photo picker (the one for server icons): crops to a square and returns it as base64. */
async function pickFromPhotos(): Promise<string | undefined> {
    const picker = findByProps("openImagePicker", "openImagePickerUnhandled");
    if (!picker?.openImagePicker) {
        showToast("Photo picker not found");
        return undefined;
    }
    try {
        const result = await picker.openImagePicker({ size: PICKED_SIZE });
        const base64: string | undefined = result?.base64;
        if (!base64) return undefined;
        return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
    } catch (e) {
        logger.warn("Picking a photo failed", e);
        return undefined;
    }
}

function EditorSheet({ folderId }: { folderId: string }) {
    const folder = getFolder(folderId);
    const existing = getIcon(folderId);
    const [url, setUrl] = useState(existing?.url ?? "");
    const [size, setSize] = useState(existing?.size ?? 100);
    const [inputKey, setInputKey] = useState(0);
    const picked = url.startsWith("data:");
    const valid = picked || /^https?:\/\/\S+$/i.test(url.trim());

    const choosePhoto = async () => {
        const data = await pickFromPhotos();
        if (!data) return;
        setUrl(data);
        setInputKey(key => key + 1);
    };

    const save = () => {
        if (!valid) return showToast("Enter an image link starting with https://");
        setIcon(folderId, { url: url.trim(), size });
        sheets()?.hideActionSheet?.();
    };

    const reset = () => {
        resetIcon(folderId);
        sheets()?.hideActionSheet?.();
    };

    return (
        <ActionSheet>
            <ScrollView style={{ maxHeight: 600 }} keyboardShouldPersistTaps="handled">
                <Stack spacing={16} style={{ paddingBottom: 16 }}>
                    <Text variant="heading-lg/bold" style={{ textAlign: "center" }}>{folder?.name ? `${folder.name} icon` : "Folder icon"}</Text>
                    <View style={{ alignItems: "center", minHeight: 96, justifyContent: "center" }}>
                        {valid ? (
                            <CustomIcon icon={{ url: url.trim(), size }} color={folder?.color} size={96} radius={32} />
                        ) : (
                            <Text variant="text-sm/medium" color="text-muted">Add an image to see it here</Text>
                        )}
                    </View>
                    <TextInput
                        key={inputKey}
                        label="Image link"
                        placeholder="https://example.com/icon.png"
                        defaultValue={picked ? "" : url}
                        onChange={(value: string) => setUrl(value)}
                        isClearable
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                    />
                    <TableRowGroup>
                        <TableRow
                            label={picked ? "Picked from Photos" : "Choose from Photos"}
                            subLabel={picked ? "Tap to choose another" : undefined}
                            icon={<Icon name="ImageIcon" />}
                            arrow
                            onPress={choosePhoto}
                        />
                    </TableRowGroup>
                    <TableRowGroup title="Size">
                        {SIZES.map(option => (
                            <TableRow
                                key={option.value}
                                label={option.label}
                                trailing={size === option.value ? <Icon name="CheckmarkLargeIcon" /> : undefined}
                                onPress={() => setSize(option.value)}
                            />
                        ))}
                    </TableRowGroup>
                    <Button text="Save" variant="primary" size="lg" onPress={save} disabled={!valid} />
                    {existing ? <Button text="Reset to default" variant="destructive" size="lg" onPress={reset} /> : null}
                </Stack>
            </ScrollView>
        </ActionSheet>
    );
}

export function openEditor(folderId: string | number) {
    sheets()?.openLazy?.(Promise.resolve({ default: EditorSheet }), "DistraFolderIcon", { folderId: String(folderId) });
}
