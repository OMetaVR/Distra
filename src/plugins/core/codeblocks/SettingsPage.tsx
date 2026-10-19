import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { Stack, TableRadioGroup, TableRadioRow, TableRow, TableRowGroup, TableSwitchRow, Text } from "@/ui/components";

import type { PaletteId } from "./palettes";
import { hasNativeHook } from "./render";
import { type CodeBlockSettings, settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

function Switch({ label, subLabel, field, icon, disabled }: { label: string; subLabel?: string; field: keyof CodeBlockSettings; icon: string; disabled?: boolean }) {
    return (
        <TableSwitchRow
            label={label}
            subLabel={subLabel}
            icon={<Icon name={icon} />}
            value={settings[field]}
            disabled={disabled}
            onValueChange={(value: boolean) => void ((settings as any)[field] = value)}
        />
    );
}

export default function SettingsPage() {
    useProxy(settings);
    const native = hasNativeHook();
    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Highlighting">
                    <Switch label="Syntax highlighting" subLabel="Colour code by the language after the ``` (js, py, sh, json, ansi, ...)" field="highlight" icon="PaintPaletteIcon" />
                    {!native && (
                        <Switch
                            label="Code font"
                            subLabel="Monospace highlighted code. Without the tweak's code block support, iOS draws every coloured word as its own inline code, so words get small gaps and backgrounds."
                            field="monospace"
                            icon="TextIcon"
                            disabled={!settings.highlight}
                        />
                    )}
                </TableRowGroup>
                <TableRadioGroup title="Colours" value={settings.palette} onChange={(value: PaletteId) => void (settings.palette = value)}>
                    <TableRadioRow label="Discord" subLabel="Desktop Discord's code colours for your theme (dark, darker, midnight or light)" value="discord" />
                    <TableRadioRow label="VS Code" subLabel="Dark+ / Light+, the ShikiCodeblocks look" value="vscode" />
                    <TableRadioRow label="GitHub" subLabel="GitHub's syntax colours" value="github" />
                    <TableRadioRow label="Theme" subLabel="Built from your theme's accent colours (follows custom themes)" value="theme" />
                </TableRadioGroup>
                <TableRowGroup title="Language label">
                    <Switch
                        label="Language header"
                        subLabel={native ? "The language as a strip at the top of the code box" : "A small label above code blocks that name a language"}
                        field="header"
                        icon="TagIcon"
                    />
                    <Switch label="Full language name" subLabel={'"JavaScript" instead of "js"'} field="fullName" icon="InfoIcon" disabled={!settings.header} />
                </TableRowGroup>
                <TableRowGroup title="Copying">
                    {!native && <Switch label="Tap to copy" subLabel="Tap the label or highlighted code to copy the whole block" field="tapToCopy" icon="CopyIcon" />}
                    <Switch label="Copy Code in message menu" subLabel="Hold a message with code to copy a block" field="copyMenu" icon="CopyIcon" />
                </TableRowGroup>
                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    {native
                        ? "Code is coloured inside Discord's own code box. Long lines wrap (the chat can't scroll code sideways); very long blocks stay plain."
                        : "This version of the tweak can't colour Discord's code box, so highlighted code is drawn as coloured message text instead; it wraps like text. Very long blocks keep Discord's own box."}
                </Text>
            </Stack>
        </ScrollView>
    );
}
