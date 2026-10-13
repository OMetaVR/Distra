import { findByProps } from "@vendetta/metro";
import { ReactNative as RN, stylesheet } from "@vendetta/metro/common";
import { semanticColors } from "@vendetta/ui";
import { Forms } from "@vendetta/ui/components";

const { FormRow } = Forms;
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;

// professionally stolen from nexpid https://github.com/castdrian/vendetta-plugins/commit/5c9223e0f94562a270b48b6936b0cbbefe2f46c8
// https://github.com/nexpid/VendettaPlugins/blob/87193fbd2e73d4a0d492220606cd2c501263ff6b/stuff/types.tsx#L122
export default function ({
    label,
    icon,
    onPress,
}: {
    label: string;
    icon: number;
    onPress?: () => void;
}) {
    const styles = stylesheet.createThemedStyleSheet({
        iconComponent: {
            width: 24,
            height: 24,
            tintColor: semanticColors.INTERACTIVE_NORMAL,
        },
    });

    return ActionSheetRow ? (
        <ActionSheetRow
            label={label}
            icon={
                <ActionSheetRow.Icon
                    source={icon}
                    IconComponent={() => (
                        <RN.Image
                            resizeMode="cover"
                            style={styles.iconComponent}
                            source={icon}
                        />
                    )}
                />
            }
            onPress={() => onPress?.()}
        />
    ) : (
        <FormRow
            label={label}
            leading={<FormRow.Icon source={icon} />}
            onPress={() => onPress?.()}
        />
    );
}