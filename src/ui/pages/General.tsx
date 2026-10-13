import { ScrollView } from "react-native";

import { loader } from "@/core/loader";
import { reloadApp } from "@/core/native";
import { loaderConfig, settings } from "@/core/settings";
import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { confirm } from "@/ui/alerts";
import { Stack, TableRow, TableRowGroup, TableRowTrailingText, TableSwitchRow, Text } from "@/ui/components";

const Icon = ({ name }: { name: string }) => <TableRow.Icon source={findAssetId(name)} />;

function InfoRow({ label, value, icon }: { label: string; value: string; icon: string }) {
    return <TableRow label={label} icon={<Icon name={icon} />} trailing={<TableRowTrailingText text={value} />} />;
}

async function reloadWithConfirm(reason: string) {
    if (await confirm({ title: "Reload Discord?", message: reason, confirmText: "Reload" })) reloadApp();
}

export default function General() {
    useProxy(settings);
    useProxy(loaderConfig);

    const safeModeReason = loader.safeMode.reason === "crash-loop"
        ? `Discord failed to start ${loader.safeMode.failedBoots} times in a row, so plugins and icon packs were not loaded.`
        : "Plugins and icon packs are not loaded.";

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                {loader.safeMode.enabled && (
                    <TableRowGroup title="Safe Mode">
                        <TableRow label="Safe mode is active" subLabel={safeModeReason} icon={<Icon name="ic_warning_24px" />} />
                        <TableRow
                            label="Exit safe mode and reload"
                            icon={<Icon name="RetryIcon" />}
                            onPress={() => {
                                loaderConfig.safeMode = false;
                                // Give the debounced write a moment to land before reloading.
                                setTimeout(reloadApp, 500);
                            }}
                        />
                    </TableRowGroup>
                )}

                <TableRowGroup title="Info">
                    <InfoRow label="Discordia" value={`${DISCORDIA_VERSION} (${DISCORDIA_COMMIT})`} icon="ic_badge_staff" />
                    <InfoRow label="Loader" value={`${loader.name} ${loader.version}`} icon="SettingsIcon" />
                    <InfoRow label="Discord" value={`${loader.discord.version} (${loader.discord.build})`} icon="CircleInformationIcon" />
                    <InfoRow label="Install type" value={loader.jailbroken ? "Jailbreak tweak" : "Injected IPA"} icon="MobilePhoneIcon" />
                </TableRowGroup>

                <TableRowGroup title="Actions">
                    <TableRow
                        label="Reload Discord"
                        icon={<Icon name="RetryIcon" />}
                        onPress={() => reloadWithConfirm("Restarts Discord's JavaScript without closing the app.")}
                    />
                </TableRowGroup>

                <TableRowGroup title="Options">
                    <TableSwitchRow
                        label="Safe mode"
                        subLabel="Start without plugins or icon packs. Applies after reloading."
                        icon={<Icon name="ShieldIcon" />}
                        value={loaderConfig.safeMode}
                        onValueChange={(value: boolean) => {
                            loaderConfig.safeMode = value;
                            reloadWithConfirm(value ? "Safe mode turns on after a reload." : "Safe mode turns off after a reload.");
                        }}
                    />
                    <TableSwitchRow
                        label="Developer settings"
                        subLabel="Shows the Developer page."
                        icon={<Icon name="WrenchIcon" />}
                        value={settings.developerSettings}
                        onValueChange={(value: boolean) => void (settings.developerSettings = value)}
                    />
                </TableRowGroup>

                <Text variant="text-xs/medium" color="text-muted" style={{ textAlign: "center" }}>
                    Plugins run with full access to your Discord account. Only install plugins you trust.
                </Text>
            </Stack>
        </ScrollView>
    );
}
