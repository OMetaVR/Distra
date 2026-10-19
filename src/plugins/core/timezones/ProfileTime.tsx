import { useEffect, useReducer } from "react";
import { Image, Pressable, View } from "react-native";

import { useProxy } from "@/core/storage";
import { findAssetId } from "@/lib/assets";
import { resolveSemanticColor, semanticColors } from "@/ui/color";
import { Text } from "@/ui/components";

import { onDatabaseChanged } from "./database";
import { settings } from "./settings";
import { openZonePickerFromSheet } from "./sheets";
import { longTimeIn, systemZone, timeIn } from "./time";
import { resolveZone, shouldShow } from "./zonesStore";

/** Re-renders at the start of every minute. */
function useMinuteClock() {
    const [, tick] = useReducer(n => n + 1, 0);
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        const timeout = setTimeout(() => {
            tick();
            interval = setInterval(tick, 60000);
        }, 60000 - (Date.now() % 60000) + 50);
        return () => {
            clearTimeout(timeout);
            if (interval) clearInterval(interval);
        };
    }, []);
}

/** "🕘 9:10 PM EDT · Sunday, October 18" under a profile's name. Tap to change the zone. */
export default function ProfileTime({ userId }: { userId: string }) {
    useProxy(settings);
    useMinuteClock();
    const [, rerender] = useReducer(n => n + 1, 0);
    useEffect(() => onDatabaseChanged(rerender), []);

    const resolved = resolveZone(userId);
    if (!settings.showInProfile || !resolved || !shouldShow(userId)) return null;

    const now = new Date();
    const same = resolved.zone === systemZone();
    const detail = same ? "Same time as you" : longTimeIn(resolved.zone, now);
    const tint = resolveSemanticColor(semanticColors.TEXT_MUTED);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Local time ${timeIn(resolved.zone, now)}. ${detail}`}
            accessibilityHint="Change time zone"
            onPress={() => openZonePickerFromSheet(userId)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
            <Image source={findAssetId("ClockIcon")} style={{ width: 16, height: 16, tintColor: tint }} />
            <View style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1, gap: 6 }}>
                <Text variant="text-md/semibold" color="mobile-text-heading-primary">{timeIn(resolved.zone, now)}</Text>
                <Text variant="text-sm/medium" color="text-muted" style={{ flexShrink: 1 }}>{detail}</Text>
            </View>
        </Pressable>
    );
}
