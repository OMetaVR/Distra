import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { confirm, prompt } from "@/ui/alerts";
import { findProp } from "@/metro/common";
import { Card, Stack, TableRadioGroup, TableRadioRow, TableRow, TableRowGroup, TableSwitchRow, Text, TextInput } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import {
    adjustment, applyFonts, autoMatch, checkNativeSupport, describeFaces, faceFor, googleFontId, groupFont, installFontFromUrl,
    installGoogleFont, nativeSupport, refreshAutoMatch, removeFont, searchGoogleFonts, SUGGESTED, supports, weightsOf,
} from "./fonts";
import { type FontAdjust, type FontGroup, type InstalledFont, settings } from "./settings";

const Slider = findProp("Slider") as React.ComponentType<any>;

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;
const SAMPLE = "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.";
const CODE_SAMPLE = "const fox = jump(over, lazyDog);\nreturn fox.speed * 2;";

const errorText = (e: unknown) => String((e as Error)?.message ?? e).replace(/^\w+Error: /, "");

async function apply() {
    try {
        const problems = await applyFonts();
        if (problems.length) showToast(problems[0], findAssetId("ic_warning_24px"));
    } catch (e) {
        showToast(`Couldn't apply the font: ${errorText(e)}`, findAssetId("ic_warning_24px"));
    }
}

/** Sample text in a group's font, with its size, weight and line spacing (as React Native text gets them). */
function Preview({ group, adjust }: { group: FontGroup; adjust: FontAdjust }) {
    const font = groupFont(group);
    const code = group === "code";
    let style: Record<string, unknown> | undefined;
    if (font) {
        // The preview names the face itself, which the tweak doesn't resize: sizes are applied here.
        const { scale, lineHeight } = adjustment(group, adjust);
        const [fontSize, height] = code ? [14, 18] : [16, 20];
        style = { fontFamily: faceFor(font, 500, adjust).postScriptName, fontSize: fontSize * scale, lineHeight: height * lineHeight };
    }
    return (
        <Text variant={code ? "text-sm/medium" : "text-md/medium"} color="text-default" style={style}>
            {code ? CODE_SAMPLE : SAMPLE}
        </Text>
    );
}

function SliderField(props: { label: string; value: number; display: string; min: number; max: number; step: number; onChange(value: number): void }) {
    return (
        <Stack spacing={4}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text variant="text-md/medium" color="text-default">{props.label}</Text>
                <Text variant="text-md/medium" color="text-muted">{props.display}</Text>
            </View>
            <Slider
                value={props.value}
                minimumValue={props.min}
                maximumValue={props.max}
                step={props.step}
                onValueChange={(value: number) => props.onChange(Math.round(value / props.step) * props.step)}
            />
        </Stack>
    );
}

const percent = (value: number) => `${Math.round(value)}%`;
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Size, weight and line spacing of the text or code font, with a live preview. */
function Adjustments({ group, adjust, onChange }: { group: FontGroup; adjust: FontAdjust; onChange(change: Partial<FontAdjust>): void }) {
    const font = groupFont(group);
    if (!font) return null;
    const weights = weightsOf(font);
    const matched = autoMatch[group];
    const canScale = supports("scale");
    const what = group === "text" ? "Text" : "Code";
    return (
        <Stack spacing={12}>
            {canScale && supports("metrics") ? (
                <TableRowGroup title={`${what} font: ${font.name}`}>
                    <TableSwitchRow
                        label="Match gg sans's size"
                        subLabel={matched
                            ? `Scales ${font.name} to ${percent(matched.scale * 100)} so its letters are about as tall and wide as Discord's font, and spaces chat lines like Discord's`
                            : "Scales the font so its letters are about as tall and wide as Discord's font"}
                        icon={<Icon name="TextIcon" />}
                        value={adjust.match}
                        onValueChange={(value: boolean) => onChange({ match: value })}
                    />
                </TableRowGroup>
            ) : null}
            <Card>
                <Stack spacing={16}>
                    {canScale || supports("metrics") ? null : <Text variant="text-md/semibold" color="text-default">{`${what} font: ${font.name}`}</Text>}
                    <Preview group={group} adjust={adjust} />
                    {canScale ? (
                        <SliderField
                            label={adjust.match ? "Size (after matching)" : "Size"}
                            value={adjust.size}
                            display={percent(adjust.size)}
                            min={70}
                            max={130}
                            step={1}
                            onChange={size => onChange({ size })}
                        />
                    ) : null}
                    <SliderField
                        label="Line spacing"
                        value={adjust.spacing}
                        display={percent(adjust.spacing)}
                        min={80}
                        max={200}
                        step={5}
                        onChange={spacing => onChange({ spacing })}
                    />
                    {weights.length > 1 ? (
                        // Positions 0-4 for -200 to +200: Discord's Slider drops a value of 0.
                        <SliderField
                            label="Weight"
                            value={adjust.weight / 100 + 2}
                            display={`${signed(adjust.weight)} · regular ${faceFor(font, 400, adjust).weight}, bold ${faceFor(font, 700, adjust).weight}`}
                            min={0}
                            max={4}
                            step={1}
                            onChange={position => onChange({ weight: (position - 2) * 100 })}
                        />
                    ) : null}
                    {canScale ? null : (
                        <Text variant="text-sm/medium" color="text-muted">
                            Font size, and line spacing in the chat, need a newer Distra tweak. Line spacing already applies to the rest of the app.
                        </Text>
                    )}
                </Stack>
            </Card>
        </Stack>
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
    const [draft, setDraft] = useState<Partial<Record<FontGroup, FontAdjust>>>({});
    const [, setMeasured] = useState(0);
    const searchId = useRef(0);
    const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        void (support === "unknown" ? checkNativeSupport() : Promise.resolve(support)).then(result => {
            setSupport(result);
            if (result === "ok") void refreshAutoMatch().then(() => setMeasured(n => n + 1));
        });
        return () => clearTimeout(commitTimer.current);
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
    const adjustOf = (group: FontGroup) => draft[group] ?? settings.adjust[group];

    // Sliders update the preview at once and save (and apply) when they settle.
    const changeAdjust = (group: FontGroup, change: Partial<FontAdjust>) => {
        setDraft(current => {
            const next = { ...current, [group]: { ...(current[group] ?? settings.adjust[group]), ...change } };
            clearTimeout(commitTimer.current);
            commitTimer.current = setTimeout(() => {
                for (const key of Object.keys(next) as FontGroup[]) settings.adjust[key] = next[key]!;
                setDraft({});
                void apply().then(() => setMeasured(n => n + 1));
            }, 400);
            return next;
        });
    };

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

                {groupFont("text") || groupFont("code") ? null : (
                    <Card>
                        <Stack spacing={8}>
                            <Preview group="text" adjust={adjustOf("text")} />
                            <Preview group="code" adjust={adjustOf("code")} />
                        </Stack>
                    </Card>
                )}
                <Adjustments group="text" adjust={adjustOf("text")} onChange={change => changeAdjust("text", change)} />
                <Adjustments group="code" adjust={adjustOf("code")} onChange={change => changeAdjust("code", change)} />

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
                    New fonts, sizes, weights and line spacing show up as text is drawn. Close Discord from the app
                    switcher and reopen it to change everything, including what's already on screen. Fonts are loaded
                    by the Distra tweak at launch; disabling this plugin restores Discord's fonts.
                </Text>
            </Stack>
        </ScrollView>
    );
}
