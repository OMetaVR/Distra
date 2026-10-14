// Components Vendetta exposed under `@vendetta/ui/components` that Discord doesn't provide.
// Reference: examples/Kettu-github/src/lib/ui/components/{Codeblock,Search}.tsx

import { useState } from "react";
import { Image, Text, TextInput as NativeTextInput, View, type TextStyle, type ViewStyle } from "react-native";

import { findAssetId } from "@/lib/assets";
import { constants } from "@/metro/common";
import { semanticColors } from "@/ui/color";
import { Button, TextInput } from "@/ui/components";
import { createThemedStyleSheet } from "@/ui/styles";

let styles: ReturnType<typeof createStyles> | undefined;
const createStyles = () => createThemedStyleSheet({
    codeBlock: {
        fontFamily: constants.Fonts?.CODE_NORMAL ?? "Menlo",
        fontSize: 12,
        backgroundColor: semanticColors.CARD_BACKGROUND_DEFAULT ?? semanticColors.BACKGROUND_SECONDARY,
        color: semanticColors.TEXT_DEFAULT ?? semanticColors.TEXT_NORMAL,
        borderWidth: 1,
        borderRadius: 12,
        borderColor: semanticColors.BORDER_SUBTLE ?? semanticColors.BACKGROUND_TERTIARY,
        padding: 10,
    },
});

export function Codeblock({ selectable, style, children }: { selectable?: boolean; style?: TextStyle; children?: string }) {
    styles ??= createStyles();
    // RN's Text isn't selectable on iOS, so selectable blocks use a read-only TextInput.
    if (selectable) return <NativeTextInput editable={false} multiline style={[styles.codeBlock, style]} value={children} />;
    return <Text style={[styles.codeBlock, style]}>{children}</Text>;
}

export function Search({ onChangeText, placeholder, style }: { onChangeText?: (value: string) => void; placeholder?: string; style?: ViewStyle; isRound?: boolean }) {
    const [query, setQuery] = useState("");
    return (
        <View style={style}>
            <TextInput
                grow
                isClearable
                leadingIcon={() => <Image style={{ width: 16, height: 16 }} source={findAssetId("MagnifyingGlassIcon") ?? findAssetId("icon-search")} />}
                placeholder={placeholder ?? "Search"}
                onChange={(value: string) => {
                    setQuery(value);
                    onChangeText?.(value);
                }}
                returnKeyType="search"
                size="md"
                autoCapitalize="none"
                autoCorrect={false}
                value={query}
            />
        </View>
    );
}

const LEGACY_VARIANTS: Record<string, string> = {
    BRAND: "primary", RED: "destructive", GREEN: "active", PRIMARY: "secondary",
    GREY: "secondary", LIGHTGREY: "secondary", TRANSPARENT: "tertiary", WHITE: "tertiary", LINK: "tertiary",
};
const LEGACY_SIZES: Record<string, string> = { XSMALL: "sm", SMALL: "sm", MEDIUM: "md", LARGE: "lg" };
const keysOf = (map: Record<string, string>) => Object.fromEntries(Object.keys(map).map(key => [key, key]));

/**
 * Discord's old default-exported Button (`color`, `size`, `text`, with `Button.Colors` and
 * `Button.Sizes`), drawn with the current design Button (`variant`, `size`).
 */
export function LegacyButton({ color = "BRAND", size = "MEDIUM", text, style, ...props }: { color?: string; size?: string; text?: string; style?: ViewStyle; [key: string]: any }) {
    const button = <Button {...props} text={text} variant={LEGACY_VARIANTS[color] ?? "primary"} size={LEGACY_SIZES[size] ?? "md"} />;
    return style ? <View style={style}>{button}</View> : button;
}
LegacyButton.Colors = keysOf(LEGACY_VARIANTS);
LegacyButton.Sizes = keysOf(LEGACY_SIZES);
