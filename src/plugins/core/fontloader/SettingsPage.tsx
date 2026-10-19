import { useEffect, useRef, useState } from "react";
import { ScrollView } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { confirm, prompt } from "@/ui/alerts";
import { Card, Stack, TableRadioGroup, TableRadioRow, TableRow, TableRowGroup, TableSwitchRow, Text, TextInput } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import {
    applyFonts, checkNativeSupport, describeFaces, googleFontId, installFontFromUrl, installGoogleFont, nativeSupport, previewName,
    removeFont, searchGoogleFonts, SUGGESTED,
} from "./fonts";
import { type InstalledFont, settings } from "./settings";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;
const SAMPLE = "The quick brown fox jumps over the lazy dog";

const errorText = (e: unknown) => String((e as Error)?.message ?? e).replace(/^\w+Error: /, "");

async function apply() {
    try {
        const problems = await applyFonts();
        if (problems.length) showToast(problems[0], findAssetId("ic_warning_24px"));
    } catch (e) {
        showToast(`Couldn't apply the font: ${errorText(e)}`, findAssetId("ic_warning_24px"));
    }
}

function Preview({ font, code }: { font?: InstalledFont; code?: boolean }) {
    const family = font ? previewName(font) : undefined;
    return (
        <Text variant={code ? "text-sm/medium" : "text-md/medium"} color="text-default" style={family ? { fontFamily: family } : undefined}>
            {code ? "const fox = jump(over, lazyDog);" : SAMPLE}
        </Text>
    );
}

function Unsupported() {
    return (
        <TableRowGroup title="Font Loader">
            <TableRow
                label="Needs a Distra tweak update"
                subLabel="Custom fonts have to be registered by the Distra tweak, and the one installed doesn't support that yet. Install a newer Distra tweak (or IPA), then come back here."
                icon={<Icon name="ic_warning_24px" />}
            />
        </TableRowGroup>
    );
}

export default function SettingsPage() {
    useProxy(settings);
    const [support, setSupport] = useState(nativeSupport);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<{ family: string; authors: string[] }[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const searchId = useRef(0);

    useEffect(() => {
        if (support === "unknown") void checkNativeSupport().then(setSupport);
    }, []);

    useEffect(() => {
        const text = query.trim();
        const id = ++searchId.current;
        if (!text) return void setResults(null);
        const timer = setTimeout(() => {
            searchGoogleFonts(text)
                .then(found => id === searchId.current && setResults(found))
                .catch(e => id === searchId.current && (setResults([]), showToast(errorText(e), findAssetId("ic_warning_24px"))));
        }, 350);
        return () => clearTimeout(timer);
    }, [query]);

    if (support === "missing") {
        return (
            <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
                <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}><Unsupported /></Stack>
            </ScrollView>
        );
    }

    const fonts = Object.values(settings.fonts).sort((a, b) => a.name.localeCompare(b.name));
    const textFont = settings.text ? settings.fonts[settings.text] : undefined;
    const codeFont = settings.code === "text" ? textFont : settings.code ? settings.fonts[settings.code] : undefined;

    const install = async (label: string, run: () => Promise<InstalledFont>, select: boolean) => {
        if (busy) return;
        setBusy(label);
        try {
            const font = await run();
            if (select) {
                if (font.monospace) settings.code = font.id;
                else settings.text = font.id;
            }
            await apply();
            showToast(`Installed ${font.name}`, findAssetId("CheckmarkLargeIcon"));
        } catch (e) {
            showToast(errorText(e), findAssetId("ic_warning_24px"));
        } finally {
            setBusy(null);
        }
    };

    const installFromLink = async () => {
        const url = await prompt({ title: "Install a font", message: "Link to a .ttf or .otf file", confirmText: "Install" });
        if (url) void install(url, () => installFontFromUrl(url), true);
    };

    const choose = (field: "text" | "code", value: string) => {
        settings[field] = value || null;
        void apply();
    };

    const familyRow = (family: string, subLabel?: string) => {
        const installed = settings.fonts[googleFontId(family)];
        return (
            <TableRow
                key={family}
                label={family}
                subLabel={busy === family ? "Installing…" : installed ? "Installed" : subLabel}
                icon={<Icon name={installed ? "CheckmarkLargeIcon" : "DownloadIcon"} />}
                disabled={!!busy || !!installed}
                onPress={() => void install(family, () => installGoogleFont(family), true)}
            />
        );
    };

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRadioGroup title="Text font" value={settings.text ?? ""} onChange={(value: string) => choose("text", value)}>
                    <TableRadioRow label="Discord's (gg sans)" value="" />
                    {fonts.map(font => <TableRadioRow key={font.id} label={font.name} subLabel={describeFaces(font)} value={font.id} />)}
                </TableRadioGroup>

                <TableRadioGroup title="Code font" value={settings.code ?? ""} onChange={(value: string) => choose("code", value)}>
                    <TableRadioRow label="Discord's (gg mono)" value="" />
                    <TableRadioRow label="Same as the text font" value="text" />
                    {fonts.filter(font => font.monospace).map(font => <TableRadioRow key={font.id} label={font.name} subLabel={describeFaces(font)} value={font.id} />)}
                </TableRadioGroup>

                <Card>
                    <Stack spacing={8}>
                        <Preview font={textFont} />
                        <Preview font={codeFont} code />
                    </Stack>
                </Card>

                <TableRowGroup title="Options">
                    <TableSwitchRow
                        label="Headings too"
                        subLabel="Also replace the bold heading font Discord uses for big titles"
                        icon={<Icon name="TextIcon" />}
                        value={settings.headings}
                        onValueChange={(value: boolean) => {
                            settings.headings = value;
                            void apply();
                        }}
                    />
                </TableRowGroup>

                <TableRadioGroup
                    title="Apply to"
                    value={settings.scope}
                    onChange={(value: "app" | "messages") => {
                        settings.scope = value;
                        void apply();
                    }}
                >
                    <TableRadioRow label="Everywhere" subLabel="Messages and the rest of the app" value="app" />
                    <TableRadioRow label="Messages only" subLabel="Natively drawn text: the chat, not menus or settings" value="messages" />
                </TableRadioGroup>

                <TableRowGroup title="Add fonts">
                    <TableRow label="Install from a link" subLabel="A .ttf or .otf file" icon={<Icon name="LinkIcon" />} disabled={!!busy} onPress={installFromLink} />
                </TableRowGroup>

                <Stack spacing={8}>
                    <TextInput placeholder="Search Google Fonts" size="md" isClearable defaultValue={query} onChange={(value: string) => setQuery(value)} />
                    {results ? (
                        <TableRowGroup title="Google Fonts">
                            {results.length
                                ? results.map(font => familyRow(font.family, font.authors.length ? `by ${font.authors.join(", ")}` : undefined))
                                : <TableRow label="No fonts found" icon={<Icon name="MagnifyingGlassIcon" />} />}
                        </TableRowGroup>
                    ) : (
                        <TableRowGroup title="Popular on Google Fonts">
                            {SUGGESTED.map(family => familyRow(family))}
                        </TableRowGroup>
                    )}
                </Stack>

                {fonts.length ? (
                    <TableRowGroup title="Installed">
                        {fonts.map(font => (
                            <TableRow
                                key={font.id}
                                label={font.name}
                                subLabel={`${font.source === "google" ? "Google Fonts" : "From a link"} · ${describeFaces(font)}`}
                                icon={<Icon name="TrashIcon" />}
                                onPress={async () => {
                                    if (await confirm({ title: `Remove ${font.name}?`, confirmText: "Remove", destructive: true })) await removeFont(font.id);
                                }}
                            />
                        ))}
                    </TableRowGroup>
                ) : null}

                <Text variant="text-sm/medium" color="text-muted">
                    New fonts show up as text is drawn. Close Discord from the app switcher and reopen it to change
                    everything, including what's already on screen. Fonts are loaded by the Distra tweak at launch;
                    disabling this plugin restores Discord's fonts.
                </Text>
            </Stack>
        </ScrollView>
    );
}
