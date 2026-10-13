// Components Vendetta exposed under `@vendetta/ui/components` that Discord doesn't provide.
// Reference: examples/Kettu-github/src/lib/ui/components/{Codeblock,Search}.tsx

import { useState } from "react";
import { Image, Text, TextInput as NativeTextInput, View, type TextStyle, type ViewStyle } from "react-native";

import { findAssetId } from "@/lib/assets";
import { constants } from "@/metro/common";
import { semanticColors } from "@/ui/color";
import { TextInput } from "@/ui/components";
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
