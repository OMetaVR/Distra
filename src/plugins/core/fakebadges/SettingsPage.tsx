// Fake Badges editor: pick badges, see them in order, save them into your About Me.

import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, View } from "react-native";

import { Logger } from "@/lib/logger";
import { findAssetId } from "@/lib/assets";
import { findByProps, findByStoreName } from "@/metro";
import { Button, Stack, TableRow, TableRowGroup, Text } from "@/ui/components";
import { showToast } from "@/ui/toasts";

import { BADGE_GROUPS, badgeIconUrl, decodeBadges, encodeBadges, type FakeBadge, fakeName, stripBadges } from "./badges";

const logger = new Logger("FakeBadges");

/** Discord 348's About Me limit (desktop is trialling 300 behind an experiment mobile doesn't have). */
const BIO_MAX_LENGTH = 190;
// Without Nitro, Discord turns custom emoji in an About Me into plain :name: text whenever it's saved.
const CUSTOM_EMOJI = /<a?:\w+:\d+>/;

const rest = () => findByProps("getAPIBaseURL", "patch");
const dispatcher = () => findByProps("_interceptors", "dispatch");
const currentUser = () => findByStoreName("UserStore")?.getCurrentUser?.();

const codesOf = (badges: FakeBadge[]) => badges.map(badge => badge.code).join("");
const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms));

/** Your own About Me, straight from Discord (the profile store may not have it loaded). */
async function fetchBio(userId: string): Promise<string> {
    const cached = findByStoreName("UserProfileStore")?.getUserProfile?.(userId)?.bio;
    try {
        const response: any = await Promise.race([rest().get({ url: `/users/${userId}/profile` }), timeout(10000)]);
        return response?.body?.user_profile?.bio ?? response?.body?.user?.bio ?? cached ?? "";
    } catch (e) {
        if (typeof cached === "string") return cached;
        throw e;
    }
}

function Badge({ badge, size = 28 }: { badge: FakeBadge; size?: number }) {
    return <Image source={{ uri: badgeIconUrl(badge) }} style={{ width: size, height: size }} accessibilityLabel={fakeName(badge)} />;
}

export default function SettingsPage() {
    const user = currentUser();
    const [bio, setBio] = useState<string | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [draft, setDraft] = useState<FakeBadge[] | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user?.id) return;
        fetchBio(user.id).then(setBio, e => {
            logger.error("Couldn't load your profile", e);
            setLoadError(true);
        });
    }, [user?.id]);

    if (bio == null) {
        return (
            <View style={{ padding: 24, alignItems: "center", gap: 12 }}>
                {loadError ? null : <ActivityIndicator />}
                <Text variant="text-md/medium" color={loadError ? "text-danger" : "text-muted"}>
                    {loadError ? "Couldn't load your profile. Reopen this page to try again." : "Loading your profile..."}
                </Text>
            </View>
        );
    }

    const saved = decodeBadges(bio);
    const selected = draft ?? saved;
    const newBio = encodeBadges(bio, selected);
    const badgeChars = newBio.length - stripBadges(bio).length;
    const tooLong = newBio.length > BIO_MAX_LENGTH;
    const dirty = codesOf(selected) !== codesOf(saved);
    const losesEmoji = CUSTOM_EMOJI.test(bio) && !user?.premiumType;

    const toggle = (badge: FakeBadge) => setDraft(selected.includes(badge) ? selected.filter(b => b !== badge) : [...selected, badge]);
    const move = (badge: FakeBadge, by: number) => {
        const from = selected.indexOf(badge);
        const to = from + by;
        if (to < 0 || to >= selected.length) return;
        const reordered = [...selected];
        [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
        setDraft(reordered);
    };
    const badgeActions = (badge: FakeBadge) => {
        const index = selected.indexOf(badge);
        Alert.alert(badge.name, undefined, [
            ...(index > 0 ? [{ text: "Move left", onPress: () => move(badge, -1) }] : []),
            ...(index < selected.length - 1 ? [{ text: "Move right", onPress: () => move(badge, 1) }] : []),
            { text: "Remove", style: "destructive" as const, onPress: () => toggle(badge) },
            { text: "Cancel", style: "cancel" as const },
        ]);
    };

    async function save() {
        setSaving(true);
        try {
            const { body } = await Promise.race([rest().patch({ url: "/users/@me/profile", body: { bio: newBio } }), timeout(15000)]);
            dispatcher()?.dispatch?.({ type: "USER_PROFILE_UPDATE_SUCCESS", userId: user.id, ...body });
            setBio(body?.bio ?? newBio);
            setDraft(null);
            showToast(selected.length ? `Saved ${selected.length} fake badge${selected.length === 1 ? "" : "s"} to your profile` : "Removed your fake badges");
        } catch (e) {
            logger.error("Failed to save badges", e);
            Alert.alert("Couldn't save your badges", "Discord rejected the profile update.");
        } finally {
            setSaving(false);
        }
    }

    const confirmSave = () => {
        if (!losesEmoji) return void save();
        Alert.alert(
            "Your custom emoji will turn into text",
            "Your About Me has custom emoji, and without Nitro Discord turns them into plain :name: text whenever an About Me is saved, from any app. Save anyway?",
            [{ text: "Cancel", style: "cancel" }, { text: "Save anyway", onPress: () => void save() }],
        );
    };

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <Text variant="text-sm/medium" color="text-muted">
                    Pick badges for your profile. They're stored invisibly in your About Me, so anyone using Distra with
                    this plugin (on iOS or desktop) sees them too, always labelled as fake.
                </Text>

                <TableRowGroup title="Preview">
                    <View style={{ padding: 16, gap: 10 }}>
                        {selected.length ? (
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                {selected.map(badge => (
                                    <Pressable key={badge.code} onPress={() => badgeActions(badge)} accessibilityRole="button" accessibilityLabel={`${badge.name}, tap to move or remove`}>
                                        <Badge badge={badge} />
                                    </Pressable>
                                ))}
                            </View>
                        ) : (
                            <Text variant="text-sm/medium" color="text-muted">No badges selected. Tap badges below to add them.</Text>
                        )}
                        {selected.length > 1 ? <Text variant="text-xs/medium" color="text-muted">Tap a badge here to move or remove it.</Text> : null}
                    </View>
                </TableRowGroup>

                {BADGE_GROUPS.map(group => (
                    <TableRowGroup key={group.name} title={group.name}>
                        {group.badges.map(badge => {
                            const position = selected.indexOf(badge) + 1;
                            return (
                                <TableRow
                                    key={badge.code}
                                    label={badge.name}
                                    icon={<Badge badge={badge} size={24} />}
                                    trailing={position > 0 ? (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                            <Text variant="text-sm/semibold" color="text-muted">{position}</Text>
                                            <TableRow.Icon source={findAssetId("CheckmarkLargeIcon")} />
                                        </View>
                                    ) : undefined}
                                    onPress={() => toggle(badge)}
                                />
                            );
                        })}
                    </TableRowGroup>
                ))}

                {losesEmoji ? (
                    <Text variant="text-sm/medium" color="text-warning">
                        Your About Me has custom emoji. Without Nitro, Discord turns them into plain :name: text when an About Me is saved, so saving here will do that.
                    </Text>
                ) : null}
                {tooLong ? (
                    <Text variant="text-sm/medium" color="text-danger">
                        Your About Me doesn't have room for this many badges. Remove some badges or shorten your About Me.
                    </Text>
                ) : null}

                <Stack spacing={12}>
                    <Text variant="text-sm/medium" color={tooLong ? "text-danger" : "text-muted"}>
                        About Me: {newBio.length} of {BIO_MAX_LENGTH} characters used, {badgeChars} by badges.{dirty ? " Unsaved changes." : ""}
                    </Text>
                    <Button
                        text={saving ? "Saving..." : "Save to profile"}
                        variant="primary"
                        size="lg"
                        disabled={!dirty || tooLong || saving}
                        onPress={confirmSave}
                    />
                    {dirty ? <Button text="Undo changes" variant="secondary" size="lg" onPress={() => setDraft(null)} /> : null}
                </Stack>
            </Stack>
        </ScrollView>
    );
}
